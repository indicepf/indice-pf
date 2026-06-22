-- ============================================================================
-- Migração 12 — admin lê perfis (para exibir quem recebe o saque)
-- Rode no SQL Editor do Supabase. Idempotente.
-- ============================================================================

-- Permite que moderadores leiam o nome/telefone de qualquer usuário,
-- necessário para identificar o destinatário do PIX na fila de saques.
drop policy if exists perfil_admin_select on profiles;
create policy perfil_admin_select on profiles for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
