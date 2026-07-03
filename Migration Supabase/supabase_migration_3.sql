-- ============================================================================
-- Migração 3 (aditiva) — transparência de cobertura no custo por prato
-- Rode no SQL Editor do Supabase. Segura: só adiciona uma coluna.
-- ============================================================================

-- Quantos ingredientes do prato tiveram o preço ESTIMADO (média dos últimos 3
-- snapshots) por falta de cotação na semana. Complementa ingredientes_cobertos
-- (cotação fresca + preço fixo) e ingredientes_total (tamanho da receita).
alter table custos_pratos add column if not exists ingredientes_estimados integer;
