-- ============================================================================
-- Migração 11 — recompensas/saque (Frente C fase 2)
-- Rode no SQL Editor do Supabase. Idempotente.
-- ============================================================================

-- Solicitações de saque. O saldo do usuário é derivado:
--   ganho = nº de contribuições aprovadas × valor_por_foto
--   disponível = ganho − soma dos pagamentos (solicitados/pagos)
create table if not exists pagamentos (
  id        bigserial primary key,
  user_id   uuid references auth.users (id) on delete set null,
  valor     numeric not null,
  cpf       text,
  chave_pix text,
  status    text default 'solicitado',   -- solicitado | pago | rejeitada
  criado_em timestamptz default now(),
  pago_em   timestamptz
);

alter table pagamentos enable row level security;

-- dono: insere e lê os próprios saques
drop policy if exists pag_insert on pagamentos;
create policy pag_insert on pagamentos for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists pag_select on pagamentos;
create policy pag_select on pagamentos for select using (auth.uid() = user_id);

-- admin: lê e atualiza todos (marcar como pago)
drop policy if exists pag_admin_all on pagamentos;
create policy pag_admin_all on pagamentos for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
