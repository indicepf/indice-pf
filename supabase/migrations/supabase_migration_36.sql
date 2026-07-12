-- ============================================================================
-- Migração 36 — modelo por meta servida (planilha do sócio, 12/07/2026)
-- Rode no SQL Editor do Supabase. Idempotente.
--
-- receitas.qtd_g MUDA DE SIGNIFICADO: era o peso cru da receita (PB); passa a
-- ser a COMPRA NECESSÁRIA para entregar a meta servida no prato. Todo o custo
-- (pipeline e frontend) já multiplica preço × qtd_g, então o novo custo se
-- propaga sem mudança de código de cálculo.
--
-- Regra aplicada no pipeline (FC = PB/PC):
--   carnes/encolhem (FC>1): meta = PB, compra = PB × FC
--   grãos/expandem (FC<=1) e itens por unidade (ovos): compra = PB, meta = PC
--
-- Colunas novas (exibição no detalhe do prato):
--   qtd_pb_g   — quantidade bruta da receita original (PB)
--   qtd_meta_g — meta servida no prato
--   (qtd_cozida_g já existe = PC, rendimento do PB)
--
-- Depois de rodar: python scripts/seed_supabase.py
-- e recálculo de TODOS os snapshots (scripts/recalcular_snapshots.py).
-- ============================================================================

alter table receitas add column if not exists qtd_pb_g numeric;
alter table receitas add column if not exists qtd_meta_g numeric;

comment on column receitas.qtd_g is
  'Compra necessária (g) para entregar a meta servida — base do custo (migração 36)';
comment on column receitas.qtd_pb_g is
  'Quantidade bruta da receita original (PB), exibição';
comment on column receitas.qtd_meta_g is
  'Meta servida no prato (g), exibição';
