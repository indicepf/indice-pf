-- ============================================================================
-- Migração 7 — autenticação (Frente B): tabela de perfis
-- Rode no SQL Editor do Supabase. Idempotente.
--
-- PRÉ-REQUISITO no painel Supabase: Authentication → Providers → habilitar
-- "Email" (com OTP / magic link). Sem isso o login por código não funciona.
-- ============================================================================

create table if not exists profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nome        text,
  telefone    text,         -- obrigatório no app (banco de leads)
  regiao      text,
  cpf         text,         -- coletado SÓ ao habilitar recompensa (LGPD)
  chave_pix   text,
  consentimento_cpf_em timestamptz,
  criado_em   timestamptz default now()
);

alter table profiles enable row level security;

-- cada usuário só enxerga/edita o próprio perfil
drop policy if exists perfil_select on profiles;
create policy perfil_select on profiles for select using (auth.uid() = id);
drop policy if exists perfil_update on profiles;
create policy perfil_update on profiles for update using (auth.uid() = id);
drop policy if exists perfil_insert on profiles;
create policy perfil_insert on profiles for insert with check (auth.uid() = id);

-- cria um profile vazio automaticamente quando o usuário se cadastra
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- OBS de segurança: o CPF fica protegido por RLS (só o dono lê). Antes de operar
-- com CPFs reais em produção, endurecer com criptografia de coluna (Supabase
-- Vault / pgsodium) — anotado no roadmap.
