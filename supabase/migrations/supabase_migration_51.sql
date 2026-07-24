-- ============================================================================
-- Migração 51 — Fase 3 pacote 2: DIEESE preservado por capital (docs/025)
-- Rode no SQL Editor do Supabase. Idempotente. (depende da 42: nega_mutacao_shadow)
--
-- Problema (LAB-016): o cron importar-dieese sempre calculou a mediana entre
-- capitais e descartou o valor de cada capital. O painel de capitais que
-- respondem muda mês a mês (o DIEESE não cobre todas em todo período), então
-- a composição da mediana nacional varia sem que isso fique registrado —
-- entrada/saída de capital parece variação de preço.
--
-- Esta migração cria o destino para o dado por capital; não recupera o
-- passado (a granularidade fina nunca foi persistida — provenance_status
-- histórico permanece 'unavailable' para os meses já importados). A partir do
-- deploy do código desta pacote, toda nova ingestão preserva cada capital.
--
-- Chave de dedup (serie, capital, data, valor): reingestão idêntica não
-- duplica; se o DIEESE revisar um valor, a nova linha é um FATO NOVO e a
-- antiga é preservada — vintage implícito pela própria chave, sem coluna de
-- contador (mais simples que factor_observations porque aqui não há "valor
-- vigente" a manter sincronizado; o vigente é sempre a mediana em
-- fatores_preditores, inalterada por este pacote).
-- ============================================================================

create table if not exists dieese_capital_observations (
  id          bigint generated always as identity primary key,
  serie       text not null references factor_series(serie),
  capital     text not null,
  data        date not null,
  valor       numeric not null,
  ingested_at timestamptz not null default now(),
  unique (serie, capital, data, valor)
);
alter table dieese_capital_observations enable row level security;
revoke all on dieese_capital_observations from anon, authenticated;

drop trigger if exists trg_dco_append_only on dieese_capital_observations;
create trigger trg_dco_append_only
  before update or delete on dieese_capital_observations
  for each row execute function public.nega_mutacao_shadow();

-- visão de apoio: quantas capitais responderam por série/mês (transparência
-- imediata da composição variável; não é gate — o protocolo de painel
-- balanceado é ADR futura, LAB-016 parte 2)
create or replace view public.dieese_cobertura_capitais as
select serie, data, count(*) as n_capitais,
       array_agg(capital order by capital) as capitais
from dieese_capital_observations
group by serie, data;

-- ============================================================================
-- ROLLBACK:
--   drop view if exists public.dieese_cobertura_capitais;
--   drop trigger if exists trg_dco_append_only on dieese_capital_observations;
--   drop table if exists dieese_capital_observations;
--   (fatores_preditores/mediana nacional não são afetados por este rollback)
-- ============================================================================
