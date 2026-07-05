-- ============================================================================
-- Migração 26 — foto de perfil (avatar)
-- Rode no SQL Editor do Supabase. Idempotente.
--
-- Adiciona a foto de perfil: coluna avatar_url em profiles + bucket público
-- 'avatars'. Cada usuário grava só na própria pasta ({user_id}/...), leitura
-- pública (a foto aparece no canto superior direito do app).
-- ============================================================================

-- 1) Coluna com a URL pública da foto
alter table profiles add column if not exists avatar_url text;

-- 2) Bucket de Storage para os avatares
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- upload/atualização: usuário autenticado só grava na própria pasta ({user_id}/...)
drop policy if exists avatar_upload on storage.objects;
create policy avatar_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatar_update on storage.objects;
create policy avatar_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- leitura pública das fotos (bucket público)
drop policy if exists avatar_read on storage.objects;
create policy avatar_read on storage.objects for select
  using (bucket_id = 'avatars');
