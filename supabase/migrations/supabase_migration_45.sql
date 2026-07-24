-- ============================================================================
-- Migração 45 — Fase 2 pacote 1: supersessão de preços e dedup (docs/018 §B)
-- Rode no SQL Editor do Supabase. Idempotente. (depende da 42/43/44)
--
-- ⚠️ ORDEM: se rodar a migração 29 ou a 44 DEPOIS desta, rode esta de novo —
-- elas recriam integrar_snapshot/publicar_snapshot_shadow sem o filtro de
-- linhas superseded.
--
-- O que faz:
--   1. precos ganha supersessão (superseded_by/at/reason). Nada é apagado:
--      corrigir = marcar a linha antiga como substituída (reversível).
--   2. Dedup dos casos existentes (snapshots 33/34, ingrediente 1138 e
--      quaisquer outros): em cada (snapshot, ingrediente) com mais de uma
--      linha ativa, mantém a melhor (maior id com mediana não nula; senão
--      maior id) e marca as demais. Registra tudo em audit_log.
--   3. Índice único parcial impede novas duplicatas ativas.
--   4. Os dois motores (integrar_snapshot e publicar_snapshot_shadow) passam
--      a ignorar linhas superseded. Números legados publicados NÃO são
--      reescritos por esta migração; só cálculos futuros usam o filtro.
-- ============================================================================

-- 1. colunas de supersessão ----------------------------------------------------
alter table precos
  add column if not exists superseded_by bigint references precos(id),
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_reason text;

-- 2. dedup dos casos existentes, com trilha em audit_log -----------------------
with grupos as (
  select snapshot_id, ingrediente_id
  from precos
  where ingrediente_id is not null and superseded_by is null
  group by 1, 2
  having count(*) > 1
),
vencedoras as (
  select distinct on (p.snapshot_id, p.ingrediente_id) p.id, p.snapshot_id, p.ingrediente_id
  from precos p
  join grupos g using (snapshot_id, ingrediente_id)
  where p.superseded_by is null
  order by p.snapshot_id, p.ingrediente_id, (p.mediana_normalizada is not null) desc, p.id desc
),
marcadas as (
  update precos p set
    superseded_by     = v.id,
    superseded_at     = now(),
    superseded_reason = 'dedup migração 45: linha duplicada no snapshot'
  from vencedoras v
  where p.snapshot_id = v.snapshot_id and p.ingrediente_id = v.ingrediente_id
    and p.id <> v.id and p.superseded_by is null
  returning p.id, p.snapshot_id, p.ingrediente_id, p.superseded_by
)
insert into audit_log (tabela, registro_id, acao, dados_depois)
select 'precos', m.id::text, 'supersede_dedup',
       jsonb_build_object('snapshot_id', m.snapshot_id, 'ingrediente_id', m.ingrediente_id,
                          'superseded_by', m.superseded_by, 'migracao', 45)
from marcadas m;

-- 3. nunca mais duas linhas ativas para o mesmo (snapshot, ingrediente) --------
create unique index if not exists uq_precos_ativos_snapshot_ingrediente
  on precos (snapshot_id, ingrediente_id)
  where ingrediente_id is not null and superseded_by is null;

-- 4a. motor legado: ignora linhas superseded (única mudança vs migração 44) ----
create or replace function public.integrar_snapshot(sid bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if sid is null then return; end if;
  perform public.refresh_precos_manuais();

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
    select round(percentile_cont(0.5) within group (order by custo_total)::numeric, 2)
    from custos_pratos where snapshot_id = sid
  ) where id = sid;

  begin
    perform public.publicar_snapshot_shadow(sid);
  exception when others then
    insert into pipeline_runs (kind, status, snapshot_id, finished_at, error)
    values ('shadow_publish', 'failed', sid, now(), sqlerrm);
  end;
end $$;

revoke execute on function public.integrar_snapshot(bigint) from public, anon, authenticated;

-- 4b. motor shadow: ignora linhas superseded (única mudança vs migração 42) ----
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

  if v_calculados < v_esperados then
    raise exception 'conjunto incompleto: % prato(s) calculado(s) para % ativo(s)', v_calculados, v_esperados;
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

-- ============================================================================
-- APÓS APLICAR: rodar select publicar_snapshot_shadow(33); e (34); — com o
-- dedup, os dois snapshots recusados em docs/018 passam a publicar. A paridade
-- deles divergirá no prato 85 (o legado contou o ingrediente 1138 duas vezes);
-- corrigir o legado é decisão separada de supersessão de snapshot (Fase 5).
--
-- ROLLBACK:
--   drop index if exists uq_precos_ativos_snapshot_ingrediente;
--   update precos set superseded_by = null, superseded_at = null, superseded_reason = null
--     where superseded_reason like 'dedup migração 45%';
--   -- funções: reaplicar a 44 (integrar_snapshot + bloco shadow) e a 42 §5
--   -- (publicar_snapshot_shadow); as colunas podem ficar (inertes) ou:
--   alter table precos drop column if exists superseded_reason,
--     drop column if exists superseded_at, drop column if exists superseded_by;
-- ============================================================================
