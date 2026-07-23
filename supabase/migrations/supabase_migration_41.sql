-- ============================================================================
-- Migração 41 — catálogo de preditores SIDRA (itens do IPCA)
-- Rode no SQL Editor do Supabase. Idempotente.
--
-- A rota /api/cron/importar-preditores ingere ~200 itens do IPCA (alimentação,
-- combustíveis, gás, energia) em fatores_preditores com serie = 'ipca_<código>'.
-- Este catálogo guarda o rótulo e a categoria de cada série para a UI montar
-- menus com busca agrupados por categoria.
-- ============================================================================

create table if not exists public.fatores_catalogo (
  serie          text primary key,
  label          text not null,
  categoria      text,
  granularidade  text,        -- 'mensal' | 'diario'
  unidade        text,        -- '%', 'R$', 'pts'
  atualizado_em  timestamptz not null default now()
);

alter table public.fatores_catalogo enable row level security;
