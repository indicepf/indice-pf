-- ============================================================================
-- Migração 42 — Fase 1 (auditoria docs/014): verdade canônica em SHADOW
-- Rode no SQL Editor do Supabase. Idempotente e aditiva: NÃO altera nenhum
-- fluxo vigente (Home/Histórico/Simulador/pipeline continuam lendo e gravando
-- custos_pratos como hoje). ADR: docs/017. Teste isolado: scripts/test_migration_42.sh
--
-- Cria:
--   1. pipeline_runs           — ledger de execuções
--   2. colunas de status em snapshots (informacionais, com backfill)
--   3. dish_cost_components    — decomposição canônica por componente (append-only)
--   4. shadow_publicacoes      — manifesto de cada publicação shadow (append-only)
--   5. publicar_snapshot_shadow(sid) — publicação transacional com gates
--   6. verificar_paridade_shadow(sid, versao) — paridade shadow × legado
-- ============================================================================

-- 1. ledger de execuções ------------------------------------------------------
create table if not exists pipeline_runs (
  id              bigint generated always as identity primary key,
  kind            text not null,
  environment     text not null default 'production',
  idempotency_key text,
  status          text not null check (status in ('started','validated','failed','published')),
  snapshot_id     bigint,
  calc_version    int,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  code_ref        text,
  counts          jsonb,
  error           text
);
create unique index if not exists uq_pipeline_runs_idem
  on pipeline_runs (kind, idempotency_key) where idempotency_key is not null;

-- 2. status informacional do snapshot (base do workflow formal) ---------------
alter table snapshots
  add column if not exists status text,
  add column if not exists methodology_version text,
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid,
  add column if not exists supersedes_snapshot_id bigint references snapshots(id);

-- backfill derivado do fato atual: "publicado" hoje = tem linhas em custos_pratos
update snapshots s set
  status = case when exists (select 1 from custos_pratos c where c.snapshot_id = s.id)
                then 'published' else 'staged' end,
  methodology_version = coalesce(s.methodology_version, 'legacy-v1')
where s.status is null;

alter table snapshots drop constraint if exists snapshots_status_chk;
alter table snapshots add constraint snapshots_status_chk
  check (status in ('staged','validated','published','rejected','superseded'));

-- 3. decomposição canônica por componente (shadow, append-only) ---------------
-- Valores congelados no momento da publicação: editar cadastro depois não muda
-- nenhuma versão publicada. preco_id é o lineage mínimo até a Fase 2 (ADR 017 §6).
create table if not exists dish_cost_components (
  id              bigint generated always as identity primary key,
  snapshot_id     bigint not null references snapshots(id),
  calc_version    int not null,
  prato_id        bigint not null,
  ingrediente_id  bigint not null,
  qtd_g           numeric,
  fonte_efetiva   text not null check (fonte_efetiva in ('custo_fixo','blend','manual','online','ausente')),
  preco_manual_kg numeric,
  preco_online_g  numeric,
  preco_id        bigint,
  custo           numeric not null,
  criado_em       timestamptz not null default now(),
  unique (snapshot_id, calc_version, prato_id, ingrediente_id)
);

-- 4. manifesto de cada publicação shadow (append-only) ------------------------
create table if not exists shadow_publicacoes (
  id                bigint generated always as identity primary key,
  snapshot_id       bigint not null references snapshots(id),
  calc_version      int not null,
  run_id            bigint references pipeline_runs(id),
  metodo            text not null default 'ipf-shadow-v1',
  pratos_esperados  int not null,
  pratos_calculados int not null,
  mediana           numeric not null,
  mediana_legado    numeric,
  componentes       int not null,
  hash_componentes  text not null,
  manifest          jsonb not null,
  criado_em         timestamptz not null default now(),
  unique (snapshot_id, calc_version)
);

-- append-only: fato publicado não é atualizado nem apagado; correção = nova versão
create or replace function public.nega_mutacao_shadow()
returns trigger language plpgsql as $$
begin
  raise exception 'tabela append-only: % não permite %', tg_table_name, tg_op;
end $$;

drop trigger if exists trg_dcc_append_only on dish_cost_components;
create trigger trg_dcc_append_only
  before update or delete on dish_cost_components
  for each row execute function public.nega_mutacao_shadow();

drop trigger if exists trg_shadow_pub_append_only on shadow_publicacoes;
create trigger trg_shadow_pub_append_only
  before update or delete on shadow_publicacoes
  for each row execute function public.nega_mutacao_shadow();

-- 5. publicação transacional com gates ----------------------------------------
-- Fórmula idêntica ao motor legado integrar_snapshot (migração 29/31) por
-- decisão de paridade (ADR 017 §1): custo_fixo > blend média(manual/1000,
-- online) > manual > online > 0. Falha em qualquer gate = exceção = rollback
-- integral (nem o run fica gravado).
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
  left join precos p on p.ingrediente_id = r.ingrediente_id and p.snapshot_id = sid;

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

-- 6. paridade shadow × legado ---------------------------------------------------
create or replace function public.verificar_paridade_shadow(sid bigint, versao int default null)
returns table (prato_id bigint, custo_shadow numeric, custo_legado numeric, diff numeric)
language sql
security definer
set search_path = public
as $$
  with v as (
    select coalesce(versao, max(calc_version)) as calc
    from shadow_publicacoes where snapshot_id = sid
  ),
  shadow as (
    select d.prato_id, round(sum(d.custo)::numeric, 2) as custo
    from dish_cost_components d, v
    where d.snapshot_id = sid and d.calc_version = v.calc
    group by d.prato_id
  )
  select coalesce(s.prato_id, c.prato_id::bigint),
         s.custo, c.custo_total,
         coalesce(s.custo, 0) - coalesce(c.custo_total, 0)
  from shadow s
  full outer join custos_pratos c on c.snapshot_id = sid and c.prato_id = s.prato_id
  order by 4 desc nulls first;
$$;

revoke execute on function public.verificar_paridade_shadow(bigint, int) from public, anon, authenticated;

-- ============================================================================
-- ROLLBACK COMPLETO (não executa nada legado; só remove o que a 42 criou):
--   drop function if exists public.verificar_paridade_shadow(bigint, int);
--   drop function if exists public.publicar_snapshot_shadow(bigint);
--   drop trigger if exists trg_shadow_pub_append_only on shadow_publicacoes;
--   drop trigger if exists trg_dcc_append_only on dish_cost_components;
--   drop function if exists public.nega_mutacao_shadow();
--   drop table if exists shadow_publicacoes;
--   drop table if exists dish_cost_components;
--   drop table if exists pipeline_runs;
--   alter table snapshots drop constraint if exists snapshots_status_chk;
--   alter table snapshots
--     drop column if exists status,
--     drop column if exists methodology_version,
--     drop column if exists published_at,
--     drop column if exists published_by,
--     drop column if exists supersedes_snapshot_id;
-- ============================================================================
