-- ============================================================================
-- Migração 37 — pratos.ativo (substituição de pratos sem perder o registro)
-- Rode no SQL Editor do Supabase. Idempotente.
--
-- Prato com ativo=false fica no banco (histórico preservável) mas FORA de
-- tabelas, gráficos, sitemap, página própria e do índice (o pipeline de
-- custos pula pratos inativos; após o recálculo, custos_pratos não tem
-- linhas deles). Primeiro uso: Estrogonofe de Carne Bovina (Sudeste) sai,
-- Dobradinha à Paulista PF entra — total segue 100 ativos, 20 por região.
--
-- Depois de rodar: python scripts/seed_supabase.py
--                  python scripts/backfill_precos_explosao.py
--                  python scripts/recalcular_snapshots.py
-- ============================================================================

alter table pratos add column if not exists ativo boolean not null default true;

comment on column pratos.ativo is
  'false = prato substituído/oculto: fora de tabelas, gráficos e índice (migração 37)';
