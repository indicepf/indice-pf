-- ============================================================================
-- Migração 47 — Fase 2 pacote 3: fontes manuais e evidência de descarte (docs/021)
-- Rode no SQL Editor do Supabase. Idempotente. (depende da 46: price_observations)
--
-- 1. price_observations aceita fonte 'manual_hist' e ganha status/motivo:
--    oferta descartada pela coleta vira observação com status='rejected' e o
--    motivo (produto inválido, preço ilegível, sem quantidade, alta, outlier) —
--    o descarte deixa de ser invisível (COL-007: evidência revisável).
-- 2. dedup_hash é recriado com fórmula ampliada:
--    - status entra no hash (a mesma oferta pode existir como rejeitada e como
--      incluída — são dois fatos; a curadoria formal vem com price_estimates);
--    - para fontes não-online, observed_at entra no hash (duas leituras manuais
--      iguais em datas diferentes são fatos distintos, não duplicata).
-- 3. Backfill de precos_manuais_hist (fonte 'manual_hist'), com legacy_id.
--    Linhas só de custo_fixo ficam de fora (parâmetro, não observação de preço).
-- ============================================================================

-- 1. fontes e status -----------------------------------------------------------
alter table price_observations drop constraint if exists price_observations_fonte_check;
alter table price_observations add constraint price_observations_fonte_check
  check (fonte in ('online_scrape', 'manual_hist'));

alter table price_observations
  add column if not exists status text not null default 'included',
  add column if not exists motivo text;
alter table price_observations drop constraint if exists price_observations_status_chk;
alter table price_observations add constraint price_observations_status_chk
  check (status in ('included', 'rejected'));

-- 2. dedup_hash ampliado. observed_at entra via extract(epoch) (independente de
--    timezone); como timestamptz::text não é imutável, o hash sai da coluna
--    gerada e passa a ser preenchido por trigger BEFORE INSERT — mesma
--    semântica de dedup, cliente continua sem calcular nada.
create or replace function public.price_obs_hash(
  p_fonte text, p_snapshot bigint, p_ing bigint, p_titulo text, p_loja text,
  p_bruto numeric, p_norm numeric, p_status text, p_obs timestamptz)
returns text language sql stable as $$
  select md5(coalesce(p_snapshot::text, '') || '|' || coalesce(p_ing::text, '') || '|' ||
             coalesce(p_titulo, '') || '|' || coalesce(p_loja, '') || '|' ||
             coalesce(p_bruto::text, '') || '|' || coalesce(p_norm::text, '') || '|' ||
             coalesce(p_status, '') ||
             case when p_fonte = 'online_scrape' then ''
                  else '|' || coalesce(extract(epoch from p_obs)::text, '') end)
$$;

create or replace function public.price_obs_dedup_hash()
returns trigger language plpgsql as $$
begin
  new.dedup_hash := public.price_obs_hash(
    new.fonte, new.snapshot_id, new.ingrediente_id, new.titulo, new.loja,
    new.preco_bruto, new.preco_normalizado, new.status, new.observed_at);
  return new;
end $$;

-- recriação: suspende o append-only só para regravar o hash derivado das
-- linhas existentes (nenhuma coluna de fato é tocada)
drop trigger if exists trg_price_obs_append_only on price_observations;
alter table price_observations drop column if exists dedup_hash;
alter table price_observations add column dedup_hash text;

drop trigger if exists trg_price_obs_hash on price_observations;
create trigger trg_price_obs_hash
  before insert on price_observations
  for each row execute function public.price_obs_dedup_hash();

update price_observations set dedup_hash = public.price_obs_hash(
  fonte, snapshot_id, ingrediente_id, titulo, loja,
  preco_bruto, preco_normalizado, status, observed_at);
alter table price_observations alter column dedup_hash set not null;
alter table price_observations add constraint price_observations_fonte_dedup_uk
  unique (fonte, dedup_hash);

create trigger trg_price_obs_append_only
  before update or delete on price_observations
  for each row execute function public.nega_mutacao_shadow();

-- 3. backfill das leituras manuais históricas ----------------------------------
insert into price_observations
  (fonte, ingrediente_id, titulo, loja, link, preco_bruto, preco_normalizado,
   observed_at, legacy_table, legacy_id)
select 'manual_hist', h.ingrediente_id, h.nome, h.loja, h.link,
       h.preco_manual, round(h.preco_manual / 1000.0, 6),   -- R$/kg → R$/g
       h.criado_em, 'precos_manuais_hist', h.id
from precos_manuais_hist h
where h.preco_manual is not null
on conflict (fonte, dedup_hash) do nothing;

-- ============================================================================
-- ROLLBACK:
--   delete não se aplica (append-only); para reverter o schema:
--   alter table price_observations drop constraint if exists price_observations_fonte_dedup_uk;
--   alter table price_observations drop column if exists dedup_hash;
--   alter table price_observations drop constraint if exists price_observations_status_chk;
--   alter table price_observations drop column if exists motivo, drop column if exists status;
--   -- recriar dedup_hash/unique/check de fonte conforme a migração 46
-- ============================================================================
