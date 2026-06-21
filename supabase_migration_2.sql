-- ============================================================================
-- Migração 2 (aditiva) — preço fixo para itens não-scrapeáveis
-- Rode no SQL Editor do Supabase. Segura: só adiciona uma coluna.
-- ============================================================================

-- custo_fixo: R$ fixo que o ingrediente contribui por prato quando NÃO é
-- possível cotar no Google Shopping (ex: sangue de cabidela/sarapatel).
-- NULL = ingrediente é cotado normalmente pelo scraper.
alter table ingredientes add column if not exists custo_fixo numeric;
