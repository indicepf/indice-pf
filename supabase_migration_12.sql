-- ============================================================================
-- Migração 12 — admin lê perfis (para exibir quem recebe o saque)
-- Rode no SQL Editor do Supabase. Idempotente.
--
-- Uma policy de SELECT em "profiles" NÃO pode consultar "profiles" diretamente
-- (causa "infinite recursion"). Usamos uma função SECURITY DEFINER, que lê a
-- tabela ignorando RLS e, portanto, sem recursão.
-- ============================================================================

create or replace function public.eh_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

-- remove a policy recursiva da migração anterior, se existir
drop policy if exists perfil_admin_select on profiles;
create policy perfil_admin_select on profiles for select
  using (public.eh_admin());
