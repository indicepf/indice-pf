-- ============================================================================
-- Migração 4 (aditiva) — preço manual (R$/kg) para itens não-vendidos online
-- Rode no SQL Editor do Supabase. Segura: só adiciona uma coluna.
-- ============================================================================

-- preco_manual: preço de referência em R$/kg para ingredientes que NÃO têm
-- cotação no Google Shopping (ex: jambu fresco, carne de bode). O scraper os
-- ignora (não gasta SerpAPI) e o custo por prato usa preco_manual × quantidade.
-- Difere de custo_fixo (que é R$ flat por prato, p/ itens simbólicos como sangue).
-- NULL = ingrediente é cotado normalmente.
alter table ingredientes add column if not exists preco_manual numeric;
