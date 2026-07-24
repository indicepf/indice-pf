-- ============================================================================
-- Migração 46 — Fase 2 pacote 2: observações imutáveis de preço (docs/020)
-- Rode no SQL Editor do Supabase. Idempotente. (depende da 42: nega_mutacao_shadow,
-- pipeline_runs)
--
-- Problema (PUB-001/004, LAB-023): resultados_brutos é apagado e regravado a
-- cada reexecução do pipeline, e a auditoria do Laboratório faz hard-delete.
-- O fato bruto observado não sobrevive.
--
-- Solução: price_observations — identidade imutável e append-only de cada
-- observação de preço. O pipeline passa a gravar aqui TAMBÉM (dual-write);
-- resultados_brutos continua sendo a leitura vigente até o cutover.
--   - dedup_hash é coluna gerada no banco (cliente não calcula nada): a mesma
--     oferta reinserida em replay não duplica (ON CONFLICT DO NOTHING).
--   - trigger append-only: UPDATE/DELETE proibidos; correção futura será por
--     supersessão, nunca reescrita.
--   - backfill: todo o resultados_brutos atual entra com legacy_table/legacy_id
--     preservados (ofertas idênticas no mesmo snapshot colapsam em uma — é a
--     deduplicação desejada pela auditoria, COL-005).
-- Fontes manual/contribuições entram no próximo pacote (o check de fonte será
-- ampliado então).
-- ============================================================================

create table if not exists price_observations (
  id                bigint generated always as identity primary key,
  fonte             text not null check (fonte in ('online_scrape')),
  snapshot_id       bigint references snapshots(id),
  ingrediente_id    bigint,
  titulo            text,
  loja              text,
  link              text,
  preco_bruto       numeric,
  preco_normalizado numeric,
  exibicao          text,
  observed_at       timestamptz not null default now(),
  ingested_at       timestamptz not null default now(),
  run_id            bigint references pipeline_runs(id),
  legacy_table      text,
  legacy_id         bigint,
  dedup_hash        text generated always as (
    md5(coalesce(snapshot_id::text, '') || '|' || coalesce(ingrediente_id::text, '') || '|' ||
        coalesce(titulo, '') || '|' || coalesce(loja, '') || '|' ||
        coalesce(preco_bruto::text, '') || '|' || coalesce(preco_normalizado::text, ''))
  ) stored,
  unique (fonte, dedup_hash)
);

drop trigger if exists trg_price_obs_append_only on price_observations;
create trigger trg_price_obs_append_only
  before update or delete on price_observations
  for each row execute function public.nega_mutacao_shadow();

-- backfill do legado (idempotente: replay não duplica)
insert into price_observations
  (fonte, snapshot_id, ingrediente_id, titulo, loja, link,
   preco_bruto, preco_normalizado, exibicao, observed_at, legacy_table, legacy_id)
select 'online_scrape', rb.snapshot_id, rb.ingrediente_id, rb.titulo, rb.loja, rb.link,
       rb.preco_bruto, rb.preco_normalizado, rb.exibicao, rb.criado_em, 'resultados_brutos', rb.id
from resultados_brutos rb
on conflict (fonte, dedup_hash) do nothing;

-- ============================================================================
-- ROLLBACK (as observações são cópia + dual-write; nenhum fato legado depende delas):
--   drop trigger if exists trg_price_obs_append_only on price_observations;
--   drop table if exists price_observations;
-- ============================================================================
