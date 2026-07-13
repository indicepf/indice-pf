-- ============================================================================
-- Migração 39 — renomear prato salvo (pratos_usuario faltava policy de UPDATE)
-- Rode no SQL Editor do Supabase. Idempotente.
-- ============================================================================

drop policy if exists pu_update on pratos_usuario;
create policy pu_update on pratos_usuario
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
