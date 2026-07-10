-- ============================================================================
-- Migração 35 — peso cozido (aproveitamento / PC) por linha de receita
-- Rode no SQL Editor do Supabase. Idempotente.
--
-- Coluna informativa vinda de Tabela_Indice_PF_Ataulizada.xlsx (coluna
-- "Aproveitamento (Peso Cozido / PC)"). NÃO entra no cálculo de custo — o
-- custo continua preço R$/g (cru, varejo) × qtd_g (peso cru comprado).
-- Usada no detalhe do prato: coluna "No prato", peso do prato pronto e
-- custo por 100 g servidos.
--
-- Depois de rodar, popular com: python scripts/seed_supabase.py
-- ============================================================================

alter table receitas add column if not exists qtd_cozida_g numeric;

comment on column receitas.qtd_cozida_g is
  'Peso cozido/aproveitamento (g) da porção — exibição apenas; custo usa qtd_g (cru)';
