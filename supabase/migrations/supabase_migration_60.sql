-- ============================================================================
-- Migração 60 — preço de campo só vale na janela de ±10 dias da coleta
-- ============================================================================
-- Rode no SQL Editor do Supabase. Idempotente. Só troca funções: não altera
-- nenhum dado. O recálculo da série é feito depois, chamando
-- integrar_snapshot(sid) para cada snapshot.
--
-- PROBLEMA. Desde a migração 54 (10/08/2026) integrar_snapshot e
-- publicar_snapshot_shadow misturam 50/50 o online com
-- `ingredientes.preco_manual`, que é a última leitura de campo de QUALQUER
-- data. Leituras de junho/julho entravam na coleta de novembro (batata 2,95/kg,
-- carne moída 21,80, tomate 3,95). A migração 54 partiu da versão antiga da
-- função e perdeu a regra da migração 38, que o pipeline Python e a página do
-- prato seguem até hoje. Resultado: o staging mostrava um número (53: 15,11) e
-- a aprovação publicava outro (14,07).
--
-- REGRA (decisão de 10/11/2026, igual a pipeline/calcular_custos_pratos.py):
--   custo fixo                         → custo fixo
--   manual na janela e online          → média 50/50
--   só manual na janela                → manual
--   só online                          → online (da coleta; sem ele, o último
--                                        online de coleta anterior)
--   nada disso                         → última leitura de campo até o fim da
--                                        janela (item de nicho sem online)
-- Janela: leituras de precos_manuais_hist em [data − 10 dias, data + 11 dias)
-- em UTC, a mesma de calcular_custos_pratos.py e de lib/queries.ts.
--
-- Uma função só (custo_componentes) calcula os componentes; integrar_snapshot
-- e publicar_snapshot_shadow leem dela, para as duas nunca mais divergirem.
-- ============================================================================

begin;

-- 1. componentes de custo de um snapshot ------------------------------------
create or replace function public.custo_componentes(sid bigint)
returns table (
  prato_id bigint, ingrediente_id bigint, qtd_g numeric, fonte_efetiva text,
  preco_manual_kg numeric, preco_online_g numeric, preco_id bigint,
  custo numeric, coberto boolean, estimado boolean)
language sql
stable
security definer
set search_path = public
as $$
  with j as (
    select s.data,
           (s.data::timestamp at time zone 'UTC') - interval '10 days' as ini,
           (s.data::timestamp at time zone 'UTC') + interval '11 days' as fim
    from snapshots s where s.id = sid
  ),
  base as (
    select r.prato_id, r.ingrediente_id, r.qtd_g, i.custo_fixo,
           po.id as preco_id, po.mediana_normalizada as online_g, po.fresco,
           pm.kg::numeric as man_kg,
           -- sem leitura até a data (coletas antigas de item que só ganhou
           -- leitura depois): o preço manual atual, como o pipeline Python,
           -- em vez de deixar o ingrediente a zero
           coalesce(ml.kg::numeric, i.preco_manual) as ultimo_kg
    from receitas r
    join pratos pr on pr.id = r.prato_id and pr.ativo
    join ingredientes i on i.id = r.ingrediente_id
    cross join j
    -- online da coleta; sem ele, o da coleta anterior mais recente que teve
    left join lateral (
      select p2.id, p2.mediana_normalizada, (p2.snapshot_id = sid) as fresco
      from precos p2 join snapshots s2 on s2.id = p2.snapshot_id
      where p2.ingrediente_id = r.ingrediente_id
        and p2.superseded_by is null
        and p2.mediana_normalizada is not null
        and s2.data <= j.data
      order by s2.data desc, (p2.snapshot_id = sid) desc
      limit 1
    ) po on true
    -- manual da janela: mediana das leituras
    left join lateral (
      select percentile_cont(0.5) within group (order by h.preco_manual) as kg
      from precos_manuais_hist h
      where h.ingrediente_id = r.ingrediente_id and h.preco_manual is not null
        and h.criado_em >= j.ini and h.criado_em < j.fim
    ) pm on true
    -- última leitura até o fim da janela (mediana do dia), só para nicho sem online
    left join lateral (
      select percentile_cont(0.5) within group (order by h.preco_manual) as kg
      from precos_manuais_hist h
      where h.ingrediente_id = r.ingrediente_id and h.preco_manual is not null
        and h.criado_em < j.fim
        and (h.criado_em at time zone 'America/Sao_Paulo')::date = (
          select max((h2.criado_em at time zone 'America/Sao_Paulo')::date)
          from precos_manuais_hist h2
          where h2.ingrediente_id = r.ingrediente_id and h2.preco_manual is not null
            and h2.criado_em < j.fim)
    ) ml on true
  )
  select b.prato_id, b.ingrediente_id, b.qtd_g,
    case
      when b.custo_fixo is not null                     then 'custo_fixo'
      when b.man_kg is not null and b.online_g is not null then 'blend'
      when b.man_kg is not null                         then 'manual'
      when b.online_g is not null                       then 'online'
      when b.ultimo_kg is not null                      then 'manual'
      else 'ausente' end,
    case
      when b.custo_fixo is not null then null
      when b.man_kg is not null     then b.man_kg
      when b.online_g is null       then b.ultimo_kg
      end,
    case when b.custo_fixo is null then b.online_g end,
    case when b.custo_fixo is null then b.preco_id end,
    coalesce(case
      when b.custo_fixo is not null                        then b.custo_fixo
      when b.man_kg is not null and b.online_g is not null then ((b.man_kg / 1000.0) + b.online_g) / 2.0 * b.qtd_g
      when b.man_kg is not null                            then b.man_kg / 1000.0 * b.qtd_g
      when b.online_g is not null                          then b.online_g * b.qtd_g
      when b.ultimo_kg is not null                         then b.ultimo_kg / 1000.0 * b.qtd_g
      else 0 end, 0),
    (b.custo_fixo is not null or b.man_kg is not null or coalesce(b.fresco, false)),
    (b.custo_fixo is null and b.man_kg is null and not coalesce(b.fresco, false)
       and (b.online_g is not null or b.ultimo_kg is not null))
  from base b;
$$;

revoke execute on function public.custo_componentes(bigint) from public, anon, authenticated;

-- 2. integrar_snapshot -------------------------------------------------------
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
  select sid, c.prato_id, round(sum(c.custo)::numeric, 2),
         count(*) filter (where c.coberto), count(*) filter (where c.estimado), count(*)
  from public.custo_componentes(sid) c
  group by c.prato_id
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

-- 3. publicar_snapshot_shadow: mesmos componentes, gates da migração 54 -------
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
  select sid, v_calc, c.prato_id, c.ingrediente_id, c.qtd_g,
         c.fonte_efetiva, c.preco_manual_kg, c.preco_online_g, c.preco_id,
         round(c.custo::numeric, 6)
  from public.custo_componentes(sid) c;

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
    'snapshotId', sid, 'calcVersion', v_calc, 'metodo', 'ipf-shadow-v2',
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

commit;

-- Conferência depois de rodar (deve listar as 3 funções):
--   select proname from pg_proc
--    where proname in ('custo_componentes','integrar_snapshot','publicar_snapshot_shadow');
--
-- Reverter: rodar de novo os blocos 1 e 2 da migração 54 (integrar_snapshot e
-- publicar_snapshot_shadow) e `drop function public.custo_componentes(bigint);`.
