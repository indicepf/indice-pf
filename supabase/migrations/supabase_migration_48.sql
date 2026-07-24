-- ============================================================================
-- Migração 48 — Fase 2 pacote 4: estimativas, resoluções e RLS das tabelas
-- canônicas (docs/022). Rode no SQL Editor do Supabase. Idempotente.
-- (depende da 45: motores; da 47: price_observations com status)
--
-- ⚠️ ORDEM: se rodar a 29/44/45 depois desta, rode esta de novo (recriam
-- publicar_snapshot_shadow/integrar_snapshot sem o DAG de estimativas).
--
-- 1. SEGURANÇA (defeito das migrações 42/46, detectado em 24/07): as tabelas
--    canônicas foram criadas sem RLS e os default privileges do Supabase as
--    deixaram legíveis com a chave anônima. Habilita RLS sem policies e revoga
--    anon/authenticated — só service_role (que ignora RLS) acessa.
-- 2. price_estimates / price_estimate_inputs / price_resolutions: a mediana
--    vira agregação com membership real (as observações incluídas do snapshot)
--    e checagem de reconciliação; o blend/fallback vira resolução explícita.
--    dish_cost_components ganha resolution_id — DAG completo:
--    observação → estimativa → resolução → componente → custo → índice.
-- 3. publicar_snapshot_shadow v3 constrói o DAG na mesma transação. A fórmula
--    do custo permanece idêntica (paridade testada); a estimativa manual usa o
--    cadastro atual com inputs desconhecidos (provenance parcial declarada —
--    liga às observações manual_hist quando a coleta manual migrar).
-- ============================================================================

-- 1. RLS e revogações ----------------------------------------------------------
alter table pipeline_runs        enable row level security;
alter table dish_cost_components enable row level security;
alter table shadow_publicacoes   enable row level security;
alter table price_observations   enable row level security;
revoke all on pipeline_runs, dish_cost_components, shadow_publicacoes, price_observations
  from anon, authenticated;

-- 2. estimativas, inputs e resoluções ------------------------------------------
create table if not exists price_estimates (
  id               bigint generated always as identity primary key,
  snapshot_id      bigint not null references snapshots(id),
  calc_version     int not null,
  ingrediente_id   bigint not null,
  fonte            text not null check (fonte in ('online', 'manual')),
  metodo           text not null,
  valor            numeric,            -- R$/g
  legacy_precos_id bigint,             -- lineage para a linha de precos importada
  n_inputs         int,
  valor_recalculado numeric,           -- mediana SQL das observações incluídas
  reconciliado     boolean,            -- |valor − recalculado| <= 2e-6 (null sem inputs)
  criado_em        timestamptz not null default now(),
  unique (snapshot_id, calc_version, ingrediente_id, fonte)
);

create table if not exists price_estimate_inputs (
  estimate_id    bigint not null references price_estimates(id),
  observation_id bigint not null references price_observations(id),
  primary key (estimate_id, observation_id)
);

create table if not exists price_resolutions (
  id                 bigint generated always as identity primary key,
  snapshot_id        bigint not null references snapshots(id),
  calc_version       int not null,
  ingrediente_id     bigint not null,
  regra              text not null check (regra in ('custo_fixo', 'blend', 'manual', 'online', 'ausente')),
  estimate_online_id bigint references price_estimates(id),
  estimate_manual_id bigint references price_estimates(id),
  custo_fixo         numeric,
  valor_final        numeric,          -- R$/g aplicado (custo_fixo é R$ por linha de receita)
  criado_em          timestamptz not null default now(),
  unique (snapshot_id, calc_version, ingrediente_id)
);

alter table price_estimates       enable row level security;
alter table price_estimate_inputs enable row level security;
alter table price_resolutions     enable row level security;
revoke all on price_estimates, price_estimate_inputs, price_resolutions from anon, authenticated;

drop trigger if exists trg_pe_append_only on price_estimates;
create trigger trg_pe_append_only before update or delete on price_estimates
  for each row execute function public.nega_mutacao_shadow();
drop trigger if exists trg_pei_append_only on price_estimate_inputs;
create trigger trg_pei_append_only before update or delete on price_estimate_inputs
  for each row execute function public.nega_mutacao_shadow();
drop trigger if exists trg_pr_append_only on price_resolutions;
create trigger trg_pr_append_only before update or delete on price_resolutions
  for each row execute function public.nega_mutacao_shadow();

alter table dish_cost_components add column if not exists resolution_id bigint references price_resolutions(id);

-- 3. motor shadow v3: DAG completo na mesma transação --------------------------
create or replace function public.publicar_snapshot_shadow(sid bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calc int; v_run bigint;
  v_esperados int; v_calculados int; v_zero int; v_comp int;
  v_estim int; v_inputs int; v_resol int; v_naorec int;
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

  -- 3a. estimativa online: valor do motor legado + reconciliação com as
  --     observações incluídas (membership real, inclusive no backfill)
  insert into price_estimates
    (snapshot_id, calc_version, ingrediente_id, fonte, metodo, valor,
     legacy_precos_id, n_inputs, valor_recalculado, reconciliado)
  select sid, v_calc, p.ingrediente_id, 'online', 'scraper_median_import_v1',
         p.mediana_normalizada, p.id, o.n, o.mediana_obs,
         case when o.n = 0 then null
              else abs(p.mediana_normalizada - o.mediana_obs) <= 0.000002 end
  from precos p
  left join lateral (
    select count(*)::int as n,
           (percentile_cont(0.5) within group (order by po.preco_normalizado))::numeric as mediana_obs
    from price_observations po
    where po.fonte = 'online_scrape' and po.snapshot_id = sid
      and po.ingrediente_id = p.ingrediente_id and po.status = 'included'
      and po.preco_normalizado is not null
  ) o on true
  where p.snapshot_id = sid and p.ingrediente_id is not null
    and p.superseded_by is null and p.mediana_normalizada is not null;
  get diagnostics v_estim = row_count;

  insert into price_estimate_inputs (estimate_id, observation_id)
  select e.id, po.id
  from price_estimates e
  join price_observations po
    on po.fonte = 'online_scrape' and po.snapshot_id = sid
   and po.ingrediente_id = e.ingrediente_id and po.status = 'included'
   and po.preco_normalizado is not null
  where e.snapshot_id = sid and e.calc_version = v_calc and e.fonte = 'online';
  get diagnostics v_inputs = row_count;

  -- 3b. estimativa manual: cadastro atual (inputs desconhecidos — provenance
  --     parcial até a coleta manual gravar observações com vínculo)
  insert into price_estimates (snapshot_id, calc_version, ingrediente_id, fonte, metodo, valor)
  select sid, v_calc, i.id, 'manual', 'cadastro_atual_v1', i.preco_manual / 1000.0
  from ingredientes i
  where i.preco_manual is not null
    and exists (select 1 from receitas r where r.ingrediente_id = i.id);

  -- 3c. resolução por ingrediente — mesma regra do motor legado
  insert into price_resolutions
    (snapshot_id, calc_version, ingrediente_id, regra,
     estimate_online_id, estimate_manual_id, custo_fixo, valor_final)
  select sid, v_calc, i.id,
    case when i.custo_fixo is not null then 'custo_fixo'
         when em.id is not null and eo.id is not null then 'blend'
         when em.id is not null then 'manual'
         when eo.id is not null then 'online'
         else 'ausente' end,
    eo.id, em.id, i.custo_fixo,
    case when i.custo_fixo is not null then null
         when em.id is not null and eo.id is not null then (em.valor + eo.valor) / 2.0
         when em.id is not null then em.valor
         when eo.id is not null then eo.valor
         else null end
  from ingredientes i
  left join price_estimates eo on eo.snapshot_id = sid and eo.calc_version = v_calc
    and eo.fonte = 'online' and eo.ingrediente_id = i.id
  left join price_estimates em on em.snapshot_id = sid and em.calc_version = v_calc
    and em.fonte = 'manual' and em.ingrediente_id = i.id
  where exists (select 1 from receitas r where r.ingrediente_id = i.id);
  get diagnostics v_resol = row_count;

  -- 3d. componentes derivam da resolução (custo idêntico ao motor anterior)
  insert into dish_cost_components
    (snapshot_id, calc_version, prato_id, ingrediente_id, qtd_g,
     fonte_efetiva, preco_manual_kg, preco_online_g, preco_id, resolution_id, custo)
  select sid, v_calc, r.prato_id, r.ingrediente_id, r.qtd_g,
    res.regra, i.preco_manual, eo.valor, eo.legacy_precos_id, res.id,
    round(coalesce(case
      when res.regra = 'custo_fixo' then res.custo_fixo
      when res.valor_final is not null then res.valor_final * r.qtd_g
      else 0 end, 0)::numeric, 6)
  from receitas r
  join ingredientes i on i.id = r.ingrediente_id
  join price_resolutions res on res.snapshot_id = sid and res.calc_version = v_calc
    and res.ingrediente_id = r.ingrediente_id
  left join price_estimates eo on eo.id = res.estimate_online_id;

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

  select count(*) filter (where reconciliado is false) into v_naorec
  from price_estimates where snapshot_id = sid and calc_version = v_calc and fonte = 'online';

  select custo_total_pf into v_legado from snapshots where id = sid;

  select md5(string_agg(prato_id || ':' || ingrediente_id || ':' || custo, ','
                        order by prato_id, ingrediente_id))
  into v_hash
  from dish_cost_components where snapshot_id = sid and calc_version = v_calc;

  v_manifest := jsonb_build_object(
    'snapshotId', sid, 'calcVersion', v_calc, 'metodo', 'ipf-shadow-v2-dag',
    'pratosEsperados', v_esperados, 'pratosCalculados', v_calculados,
    'componentes', v_comp, 'estimativas', v_estim, 'inputs', v_inputs,
    'resolucoes', v_resol, 'estimativasNaoReconciliadas', v_naorec,
    'mediana', v_mediana, 'medianaLegado', v_legado,
    'hashComponentes', v_hash, 'geradoEm', now());

  insert into shadow_publicacoes
    (snapshot_id, calc_version, run_id, pratos_esperados, pratos_calculados,
     mediana, mediana_legado, componentes, hash_componentes, manifest)
  values (sid, v_calc, v_run, v_esperados, v_calculados,
          v_mediana, v_legado, v_comp, v_hash, v_manifest);

  update pipeline_runs
  set status = 'published', finished_at = now(),
      counts = jsonb_build_object('componentes', v_comp, 'pratos', v_calculados,
                                  'estimativas', v_estim, 'naoReconciliadas', v_naorec)
  where id = v_run;

  return v_manifest;
end $$;

revoke execute on function public.publicar_snapshot_shadow(bigint) from public, anon, authenticated;

-- ============================================================================
-- APÓS APLICAR: reconciliação não bloqueia a publicação — estimativas com
-- reconciliado=false aparecem no manifesto para investigação (esperado em
-- snapshots com merge/rescrape parcial, onde as observações acumulam conjuntos).
--
-- ROLLBACK:
--   reaplicar a 45 §4b (motor sem DAG); depois:
--   alter table dish_cost_components drop column if exists resolution_id;
--   drop table if exists price_estimate_inputs, price_resolutions, price_estimates;
--   (RLS/revogações da §1 devem PERMANECER — corrigem exposição real)
-- ============================================================================
