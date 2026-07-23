-- ============================================================================
-- Migração 40 — fatores preditores (variáveis econômicas para overlay/regressão)
-- Rode no SQL Editor do Supabase. Idempotente.
--
-- Tabela única normalizada: cada linha é (serie, data) → valor. Séries mensais
-- (selic, ipca, salário) usam o dia 01 do mês. Populada pela rota de cron
-- /api/cron/importar-preditores (BCB, SIDRA/IBGE, CoinGecko, Yahoo Finance).
-- ============================================================================

create table if not exists public.fatores_preditores (
  serie          text        not null,
  data           date        not null,
  valor          numeric     not null,
  fonte          text,
  atualizado_em  timestamptz not null default now(),
  primary key (serie, data)
);

create index if not exists idx_fatores_preditores_serie_data
  on public.fatores_preditores (serie, data);

-- RLS: acesso só via service role (as rotas de API usam service role, que
-- ignora RLS). Sem policies = anon/authenticated não acessam a tabela direto;
-- o overlay/regressão lê pela rota /api/preditores (server, service role).
alter table public.fatores_preditores enable row level security;
