-- ============================================================================
-- Migração 56 — 'desidratado' fora da busca do Pimentão
-- Rode no SQL Editor do Supabase. Idempotente. (depende da 1: ingredientes)
--
-- Pedido do responsável (17/08/2026). A busca "pimentão verde kg" traz pimentão
-- desidratado em flocos, que é outro produto e outro preço: na coleta 41 a
-- oferta "Pimentão Verde Desidratado Em Flocos 500g" entrou a R$ 70,00/kg
-- contra uma mediana de R$ 14,49/kg do pimentão fresco.
--
-- palavras_nao casa por PALAVRA INTEIRA (scraper_pf._casa_palavra), então as
-- flexões entram uma a uma — casar por prefixo aqui traria de volta o bug do
-- 'kit' derrubando "Kitano".
-- ============================================================================

update ingredientes
   set palavras_nao = 'pimenta|conserva|seco|pó|desidratado|desidratada|desidratados|desidratadas'
 where nome = 'Pimentão'
   and palavras_nao not like '%desidratad%';

-- ============================================================================
-- ROLLBACK:
--   update ingredientes set palavras_nao = 'pimenta|conserva|seco|pó'
--    where nome = 'Pimentão';
-- ============================================================================
