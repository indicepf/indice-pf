-- ============================================================================
-- Migração 54 — prato inativo volta a ficar fora do índice (regressão da 45)
-- Rode no SQL Editor do Supabase. Idempotente. (substitui as funções da 45)
--
-- PROBLEMA. A migração 38 excluía pratos inativos do custo e do índice, com
-- `join pratos pr on pr.id = r.prato_id and pr.ativo` mais o delete das linhas
-- de prato inativo que sobrassem no snapshot. As migrações 44/45 reescreveram
-- `integrar_snapshot` partindo de `receitas join ingredientes` e PERDERAM esse
-- filtro; `publicar_snapshot_shadow` nunca o teve. Resultado: o prato 63
-- ("11. Estrogonofe de Carne Bovina", inativo desde a migração 37, 12/07/2026)
-- voltou a `custos_pratos`, a `dish_cost_components` e à mediana publicada em
-- `snapshots.custo_total_pf`.
--
-- Impacto medido em 10/08/2026 (mediana de 101 pratos em vez de 100):
--   snapshot 37 (20/07): publicado 14,69 · só ativos 14,79
--   snapshot 38 (27/07): publicado 13,85 · só ativos 13,76
--   snapshot 39 (03/08): publicado 14,00 · só ativos 13,93
-- O snapshot 36 (13/07) tem custos_pratos correto mas componentes shadow com o
-- prato inativo dentro — e é justamente a âncora que o Laboratório usa hoje.
--
-- O gate de `publicar_snapshot_shadow` não barrou porque só testava FALTA
-- (`v_calculados < v_esperados`); 101 para 100 esperados passava.
--
-- ESCOPO. Corrige as duas funções e limpa os snapshots POSTERIORES à
-- desativação (36, 37, 38, 39). Snapshots 1–34 são anteriores a 12/07/2026,
-- quando o prato ainda estava na cesta: a presença dele lá é história, não
-- defeito, e mexer neles é decisão separada (Fase 5, supersessão).
--
-- `dish_cost_components` e `shadow_publicacoes` são append-only (migração 42),
-- então nada é apagado ali: republica-se uma calc_version nova e limpa, que é
-- INSERT. A versão contaminada continua no histórico, como manda o append-only.
-- ============================================================================

-- 1. integrar_snapshot: filtro de ativos de volta ----------------------------
create or replace function public.integrar_snapshot(sid bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if sid is null then return; end if;
  perform public.refresh_precos_manuais();

  -- linhas de prato inativo que tenham sobrado de execuções anteriores
  delete from custos_pratos cp using pratos p
   where cp.snapshot_id = sid and cp.prato_id = p.id and p.ativo is false;

  insert into custos_pratos (snapshot_id, prato_id, custo_total, ingredientes_cobertos, ingredientes_estimados, ingredientes_total)
  select sid, c.prato_id, c.custo, c.cobertos, 0, c.total
  from (
    select r.prato_id,
      round(coalesce(sum(case
        when i.custo_fixo is not null then i.custo_fixo
        when i.preco_manual is not null and p.mediana_normalizada is not null
          then ((i.preco_manual / 1000.0) + p.mediana_normalizada) / 2.0 * r.qtd_g
        when i.preco_manual is not null then i.preco_manual / 1000.0 * r.qtd_g
        when p.mediana_normalizada is not null then p.mediana_normalizada * r.qtd_g
        else 0 end), 0)::numeric, 2) as custo,
      count(*) as total,
      count(*) filter (
        where i.custo_fixo is not null or i.preco_manual is not null or p.mediana_normalizada is not null
      ) as cobertos
    from receitas r
    join pratos pr on pr.id = r.prato_id and pr.ativo      -- ← restaurado (migração 38)
    join ingredientes i on i.id = r.ingrediente_id
    left join precos p on p.ingrediente_id = r.ingrediente_id and p.snapshot_id = sid
      and p.superseded_by is null
    group by r.prato_id
  ) c
  on conflict (snapshot_id, prato_id) do update set
    custo_total            = excluded.custo_total,
    ingredientes_cobertos  = excluded.ingredientes_cobertos,
    ingredientes_estimados = excluded.ingredientes_estimados,
    ingredientes_total     = excluded.ingredientes_total;

  update snapshots set custo_total_pf = (
    select round(percentile_cont(0.5) within group (order by cp.custo_total)::numeric, 2)
    from custos_pratos cp join pratos p on p.id = cp.prato_id and p.ativo
    where cp.snapshot_id = sid
  ) where id = sid;

  begin
    perform public.publicar_snapshot_shadow(sid);
  exception when others then
    insert into pipeline_runs (kind, status, snapshot_id, finished_at, error)
    values ('shadow_publish', 'failed', sid, now(), sqlerrm);
  end;
end $$;

revoke execute on function public.integrar_snapshot(bigint) from public, anon, authenticated;

-- 2. publicar_snapshot_shadow: mesmo filtro + gate que barra excesso ---------
create or replace function public.publicar_snapshot_shadow(sid bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calc int; v_run bigint;
  v_esperados int; v_calculados int; v_zero int; v_comp int;
  v_mediana numeric; v_legado numeric; v_hash text; v_manifest jsonb;
begin
  if sid is null then raise exception 'snapshot_id nulo'; end if;
  perform 1 from snapshots where id = sid for update;
  if not found then raise exception 'snapshot % não existe', sid; end if;

  select coalesce(max(calc_version), 0) + 1 into v_calc
  from shadow_publicacoes where snapshot_id = sid;

  insert into pipeline_runs (kind, status, snapshot_id, calc_version)
  values ('shadow_publish', 'started', sid, v_calc)
  returning id into v_run;

  insert into dish_cost_components
    (snapshot_id, calc_version, prato_id, ingrediente_id, qtd_g,
     fonte_efetiva, preco_manual_kg, preco_online_g, preco_id, custo)
  select sid, v_calc, r.prato_id, r.ingrediente_id, r.qtd_g,
    case
      when i.custo_fixo is not null then 'custo_fixo'
      when i.preco_manual is not null and p.mediana_normalizada is not null then 'blend'
      when i.preco_manual is not null then 'manual'
      when p.mediana_normalizada is not null then 'online'
      else 'ausente' end,
    i.preco_manual, p.mediana_normalizada, p.id,
    round(coalesce(case
      when i.custo_fixo is not null then i.custo_fixo
      when i.preco_manual is not null and p.mediana_normalizada is not null
        then ((i.preco_manual / 1000.0) + p.mediana_normalizada) / 2.0 * r.qtd_g
      when i.preco_manual is not null then i.preco_manual / 1000.0 * r.qtd_g
      when p.mediana_normalizada is not null then p.mediana_normalizada * r.qtd_g
      else 0 end, 0)::numeric, 6)
  from receitas r
  join pratos pr on pr.id = r.prato_id and pr.ativo      -- ← nunca teve; a âncora do Laboratório dependia disso
  join ingredientes i on i.id = r.ingrediente_id
  left join precos p on p.ingrediente_id = r.ingrediente_id and p.snapshot_id = sid
    and p.superseded_by is null;

  get diagnostics v_comp = row_count;
  if v_comp = 0 then raise exception 'nenhum componente calculado para snapshot %', sid; end if;

  select count(*) into v_esperados from pratos where ativo is true;

  with custos as (
    select prato_id, round(sum(custo)::numeric, 2) as custo
    from dish_cost_components
    where snapshot_id = sid and calc_version = v_calc
    group by prato_id
  )
  select count(*), count(*) filter (where custo <= 0),
         round((percentile_cont(0.5) within group (order by custo))::numeric, 2)
  into v_calculados, v_zero, v_mediana
  from custos;

  -- <> e não <: prato a MAIS também é conjunto errado, e foi assim que o prato
  -- inativo entrou na mediana publicada sem ninguém barrar
  if v_calculados <> v_esperados then
    raise exception 'conjunto divergente: % prato(s) calculado(s) para % ativo(s)', v_calculados, v_esperados;
  end if;
  if v_zero > 0 then
    raise exception '% prato(s) com custo não positivo — snapshot parcial não publica', v_zero;
  end if;

  select custo_total_pf into v_legado from snapshots where id = sid;

  select md5(string_agg(prato_id || ':' || ingrediente_id || ':' || custo, ','
                        order by prato_id, ingrediente_id))
  into v_hash
  from dish_cost_components where snapshot_id = sid and calc_version = v_calc;

  v_manifest := jsonb_build_object(
    'snapshotId', sid, 'calcVersion', v_calc, 'metodo', 'ipf-shadow-v1',
    'pratosEsperados', v_esperados, 'pratosCalculados', v_calculados,
    'componentes', v_comp, 'mediana', v_mediana, 'medianaLegado', v_legado,
    'hashComponentes', v_hash, 'geradoEm', now());

  insert into shadow_publicacoes
    (snapshot_id, calc_version, run_id, pratos_esperados, pratos_calculados,
     mediana, mediana_legado, componentes, hash_componentes, manifest)
  values (sid, v_calc, v_run, v_esperados, v_calculados,
          v_mediana, v_legado, v_comp, v_hash, v_manifest);

  update pipeline_runs
  set status = 'published', finished_at = now(),
      counts = jsonb_build_object('componentes', v_comp, 'pratos', v_calculados)
  where id = v_run;

  return v_manifest;
end $$;

revoke execute on function public.publicar_snapshot_shadow(bigint) from public, anon, authenticated;

-- 3. limpeza dos snapshots posteriores à desativação -------------------------
-- Ordem obrigatória: custos_pratos e custo_total_pf primeiro, shadow depois —
-- a publicação grava `mediana_legado` lendo custo_total_pf, e tem que ler o
-- valor já corrigido.
do $$
declare s record;
begin
  for s in
    select distinct cp.snapshot_id as id
    from custos_pratos cp join pratos p on p.id = cp.prato_id
    where p.ativo is false and cp.snapshot_id in (
      select id from snapshots where data >= date '2026-07-12'   -- desativação (migração 37)
    )
    order by 1
  loop
    delete from custos_pratos cp using pratos p
     where cp.snapshot_id = s.id and cp.prato_id = p.id and p.ativo is false;

    update snapshots set custo_total_pf = (
      select round(percentile_cont(0.5) within group (order by cp.custo_total)::numeric, 2)
      from custos_pratos cp join pratos p on p.id = cp.prato_id and p.ativo
      where cp.snapshot_id = s.id
    ) where id = s.id;

    raise notice 'snapshot % limpo', s.id;
  end loop;
end $$;

-- republicação shadow limpa (calc_version nova) para todo snapshot posterior à
-- desativação cuja última publicação ainda contenha o prato inativo
do $$
declare s record;
begin
  for s in
    select distinct dcc.snapshot_id as id
    from dish_cost_components dcc join pratos p on p.id = dcc.prato_id
    where p.ativo is false and dcc.snapshot_id in (
      select id from snapshots where data >= date '2026-07-12'
    )
    order by 1
  loop
    begin
      perform public.publicar_snapshot_shadow(s.id);
      raise notice 'snapshot % republicado', s.id;
    exception when others then
      raise notice 'snapshot % NÃO republicado: %', s.id, sqlerrm;
    end;
  end loop;
end $$;

-- ============================================================================
-- VERIFICAÇÃO (esperado: nenhuma linha nas duas primeiras, 100 na terceira)
--
-- select cp.snapshot_id, cp.prato_id from custos_pratos cp
--   join pratos p on p.id = cp.prato_id join snapshots s on s.id = cp.snapshot_id
--  where p.ativo is false and s.data >= date '2026-07-12';
--
-- select sp.snapshot_id, sp.calc_version, sp.pratos_calculados
--   from shadow_publicacoes sp join snapshots s on s.id = sp.snapshot_id
--  where s.data >= date '2026-07-12' and sp.pratos_calculados <> 100;
--
-- select s.id, s.data, s.custo_total_pf, count(cp.prato_id) as pratos
--   from snapshots s join custos_pratos cp on cp.snapshot_id = s.id
--  where s.data >= date '2026-07-12' group by 1,2,3 order by s.data;
-- ============================================================================
