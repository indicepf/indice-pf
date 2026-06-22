-- ============================================================================
-- Migração 9 — Frente C fase 2: moderação (admin), dedup de fotos e exclusão
-- Rode no SQL Editor do Supabase. Idempotente.
-- ============================================================================

-- 1) Flag de administrador no perfil (defina como true manualmente para você:
--    update profiles set is_admin = true where id = '<seu auth uid>';)
alter table profiles add column if not exists is_admin boolean default false;

-- 2) Hash da foto (anti-duplicata por usuário): mesma imagem não pode repetir
alter table contribuicoes add column if not exists foto_hash text;
create unique index if not exists contrib_user_foto_uk
  on contribuicoes (user_id, foto_hash) where foto_hash is not null;

-- 3) RLS — admin lê e atualiza TODAS as contribuições
drop policy if exists contrib_admin_all on contribuicoes;
create policy contrib_admin_all on contribuicoes for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

-- 4) RLS — usuário pode EXCLUIR a própria contribuição enquanto pendente
drop policy if exists contrib_delete on contribuicoes;
create policy contrib_delete on contribuicoes for delete
  using (auth.uid() = user_id and status = 'pendente');
