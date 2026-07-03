-- ============================================================================
-- Migração 10 — endereço da contribuição (reverse geocoding no envio)
-- Rode no SQL Editor do Supabase. Segura: só adiciona colunas.
-- ============================================================================

-- endereço completo e bairro, obtidos via Nominatim (OSM) no momento do envio,
-- a partir da geolocalização. cidade/uf já existem em 'contribuicoes'.
alter table contribuicoes add column if not exists endereco text;
alter table contribuicoes add column if not exists bairro   text;
