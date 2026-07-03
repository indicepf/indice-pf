-- ============================================================================
-- Migração 6 — leitura pública (anon) para as tabelas do dashboard
-- Rode no SQL Editor do Supabase. Idempotente.
--
-- As tabelas novas (ingredientes, pratos, receitas, custos_pratos) estavam com
-- RLS bloqueando o anon → o frontend via 0 linhas. Estas políticas liberam
-- SOMENTE leitura (select); escrita continua restrita ao service_role.
-- ============================================================================

grant select on ingredientes, pratos, receitas, custos_pratos to anon, authenticated;

alter table ingredientes  enable row level security;
alter table pratos        enable row level security;
alter table receitas      enable row level security;
alter table custos_pratos enable row level security;

drop policy if exists public_read on ingredientes;
create policy public_read on ingredientes  for select using (true);

drop policy if exists public_read on pratos;
create policy public_read on pratos         for select using (true);

drop policy if exists public_read on receitas;
create policy public_read on receitas       for select using (true);

drop policy if exists public_read on custos_pratos;
create policy public_read on custos_pratos  for select using (true);
