-- ============================================================================
-- Migração 21 — sexo e data de nascimento no perfil
-- Rode no SQL Editor do Supabase. Idempotente.
--
-- Campos opcionais do cadastro. A idade é derivada de data_nascimento na tela
-- (não guardamos a idade em número para não desatualizar).
-- sexo: 'M' | 'F' | 'O' (outro) | 'N' (prefiro não informar).
-- ============================================================================

alter table profiles add column if not exists sexo text;
alter table profiles add column if not exists data_nascimento date;
