-- ============================================================================
-- Migração 49 — Fase 2 pacote 5: QC na autoaprovação e coleta manual vinculada
-- Rode no SQL Editor do Supabase. Idempotente. (depende da 47/48)
--
-- ⚠️ ORDEM: se rodar a migração 29 depois desta, rode esta de novo (a 29
-- recria aprovar_coletas_pendentes sem o gate de QC).
--
-- 1. Toda linha nova de precos_manuais_hist (leitura manual/contribuição
--    aprovada, por qualquer caminho) vira observação canônica automaticamente
--    via trigger — fecha o vínculo que faltava na fonte manual.
-- 2. PUB-005: a autoaprovação de 5 dias deixa de ser cega. Checks de qualidade
--    versionados (qc_config) são executados e registrados em
--    data_quality_checks; snapshot reprovado NÃO integra (fica pendente, com
--    falha visível em pipeline_runs). A aprovação MANUAL do admin
--    (aprovar_ultima_coleta) segue sem gate — decisão humana explícita.
--    Os checks não mudam nenhuma metodologia: medem contagem/cobertura;
--    amostra baixa é aviso, não bloqueio (mínimo de fontes que altere a
--    mediana é decisão de ADR futura, COL-006).
-- ============================================================================

-- 1. dual-write automático da fonte manual ------------------------------------
create or replace function public.registrar_observacao_manual()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.preco_manual is not null then
    insert into price_observations
      (fonte, ingrediente_id, titulo, loja, link, preco_bruto, preco_normalizado,
       observed_at, legacy_table, legacy_id)
    values
      ('manual_hist', new.ingrediente_id, new.nome, new.loja, new.link,
       new.preco_manual, round(new.preco_manual / 1000.0, 6),
       coalesce(new.criado_em, now()), 'precos_manuais_hist', new.id)
    on conflict (fonte, dedup_hash) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_manual_hist_obs on precos_manuais_hist;
create trigger trg_manual_hist_obs
  after insert on precos_manuais_hist
  for each row execute function public.registrar_observacao_manual();

-- 2. configuração e registro de QC ---------------------------------------------
create table if not exists qc_config (
  versao    int primary key,
  limiares  jsonb not null,
  criado_em timestamptz not null default now()
);
insert into qc_config (versao, limiares) values (1, jsonb_build_object(
  'min_ingredientes_com_preco', 100,      -- linhas ativas de precos com mediana
  'min_cobertura_fontes_pct', 95,         -- % dos ingredientes de receitas com alguma fonte
  'min_resultados_por_ingrediente', 3     -- abaixo disso vira AVISO de amostra baixa
)) on conflict (versao) do nothing;

create table if not exists data_quality_checks (
  id              bigint generated always as identity primary key,
  snapshot_id     bigint not null references snapshots(id),
  regra           text not null,
  severidade      text not null check (severidade in ('bloqueante', 'aviso')),
  resultado       boolean not null,
  valor_observado text,
  limiar          text,
  config_versao   int,
  criado_em       timestamptz not null default now()
);

alter table qc_config           enable row level security;
alter table data_quality_checks enable row level security;
revoke all on qc_config, data_quality_checks from anon, authenticated;

drop trigger if exists trg_dqc_append_only on data_quality_checks;
create trigger trg_dqc_append_only
  before update or delete on data_quality_checks
  for each row execute function public.nega_mutacao_shadow();

-- 3. checks de qualidade (registrados sempre; retorna aprovado) ----------------
create or replace function public.verificar_qc_snapshot(sid bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb; cfg_v int; v numeric; ok boolean; aprovado boolean := true;
begin
  select versao, limiares into cfg_v, cfg from qc_config order by versao desc limit 1;

  -- bloqueante: ingredientes com preço online ativo
  select count(distinct p.ingrediente_id) into v
  from precos p
  where p.snapshot_id = sid and p.ingrediente_id is not null
    and p.superseded_by is null and p.mediana_normalizada is not null;
  ok := v >= (cfg->>'min_ingredientes_com_preco')::int;
  insert into data_quality_checks (snapshot_id, regra, severidade, resultado, valor_observado, limiar, config_versao)
  values (sid, 'ingredientes_com_preco', 'bloqueante', ok, v::text, cfg->>'min_ingredientes_com_preco', cfg_v);
  aprovado := aprovado and ok;

  -- bloqueante: % dos ingredientes de receitas com alguma fonte (online/manual/fixo)
  select round(100.0 * count(*) filter (where coberto) / nullif(count(*), 0)) into v
  from (
    select distinct r.ingrediente_id,
      (i.custo_fixo is not null or i.preco_manual is not null or exists (
         select 1 from precos p
         where p.snapshot_id = sid and p.ingrediente_id = r.ingrediente_id
           and p.superseded_by is null and p.mediana_normalizada is not null)) as coberto
    from receitas r
    join ingredientes i on i.id = r.ingrediente_id
  ) s;
  ok := coalesce(v, 0) >= (cfg->>'min_cobertura_fontes_pct')::int;
  insert into data_quality_checks (snapshot_id, regra, severidade, resultado, valor_observado, limiar, config_versao)
  values (sid, 'cobertura_fontes_receitas_pct', 'bloqueante', ok, coalesce(v, 0)::text, cfg->>'min_cobertura_fontes_pct', cfg_v);
  aprovado := aprovado and ok;

  -- aviso: ingredientes com amostra baixa (não bloqueia; COL-006 vira ADR)
  select count(*) into v
  from precos p
  where p.snapshot_id = sid and p.ingrediente_id is not null
    and p.superseded_by is null and p.mediana_normalizada is not null
    and coalesce(p.qtd_resultados, 0) < (cfg->>'min_resultados_por_ingrediente')::int;
  insert into data_quality_checks (snapshot_id, regra, severidade, resultado, valor_observado, limiar, config_versao)
  values (sid, 'ingredientes_amostra_baixa', 'aviso', v = 0, v::text, cfg->>'min_resultados_por_ingrediente', cfg_v);

  return aprovado;
end $$;

revoke execute on function public.verificar_qc_snapshot(bigint) from public, anon, authenticated;

-- 4. autoaprovação com gate de QC (substitui a §3 da migração 29) --------------
create or replace function public.aprovar_coletas_pendentes(p_dias int default 5)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare s record; n int := 0;
begin
  for s in
    select sn.id from snapshots sn
    where sn.data <= current_date - p_dias
      and not exists (select 1 from custos_pratos cp where cp.snapshot_id = sn.id)
    order by sn.id
  loop
    if public.verificar_qc_snapshot(s.id) then
      perform public.integrar_snapshot(s.id);
      n := n + 1;
    else
      insert into pipeline_runs (kind, status, snapshot_id, finished_at, error)
      values ('auto_approval_qc', 'failed', s.id, now(),
              'QC bloqueou a autoaprovação — ver data_quality_checks do snapshot');
    end if;
  end loop;
  return n;
end $$;

revoke execute on function public.aprovar_coletas_pendentes(int) from public, anon, authenticated;

-- ============================================================================
-- ROLLBACK:
--   reaplicar a §3 da migração 29 (aprovar_coletas_pendentes sem QC);
--   drop trigger if exists trg_manual_hist_obs on precos_manuais_hist;
--   drop function if exists public.registrar_observacao_manual();
--   drop function if exists public.verificar_qc_snapshot(bigint);
--   drop trigger if exists trg_dqc_append_only on data_quality_checks;
--   drop table if exists data_quality_checks, qc_config;
-- ============================================================================
