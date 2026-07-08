-- ============================================================================
-- Migração 27 — infraestrutura do plano Premium (Fase 7 da migração V1)
-- Rode no SQL Editor do Supabase. Idempotente.
--
-- Cria:
--   1. assinaturas      — uma linha por assinatura de usuário; escrita SÓ via
--                         service role (webhook/rotas de API) — nenhuma policy
--                         de escrita para authenticated.
--   2. webhook_eventos  — idempotência de webhooks do gateway (evento único).
--   3. is_premium(uid)  — função STABLE/SECURITY DEFINER usada em policies e
--                         exposta como RPC para o cliente.
-- ============================================================================

-- 1. assinaturas ------------------------------------------------------------
create table if not exists public.assinaturas (
  id                      bigserial primary key,
  user_id                 uuid not null references public.profiles(id) on delete cascade,
  gateway                 text not null default 'asaas',
  gateway_customer_id     text,
  gateway_subscription_id text,
  status                  text not null default 'pendente'
                          check (status in ('pendente', 'ativa', 'inadimplente', 'cancelada')),
  plano                   text not null default 'premium',
  valor                   numeric,
  periodo_fim             timestamptz,
  criado_em               timestamptz not null default now(),
  atualizado_em           timestamptz not null default now()
);

create index if not exists idx_assinaturas_user on public.assinaturas (user_id);
create unique index if not exists idx_assinaturas_gateway_sub
  on public.assinaturas (gateway, gateway_subscription_id)
  where gateway_subscription_id is not null;

alter table public.assinaturas enable row level security;

-- usuário lê a própria assinatura; admin lê todas; escrita só service role
drop policy if exists assin_select on public.assinaturas;
create policy assin_select on public.assinaturas
  for select using (auth.uid() = user_id or public.eh_admin());

-- 2. webhook_eventos ----------------------------------------------------------
create table if not exists public.webhook_eventos (
  id            bigserial primary key,
  gateway       text not null,
  evento_id     text not null,
  tipo          text,
  payload       jsonb,
  processado_em timestamptz not null default now(),
  unique (gateway, evento_id)
);

alter table public.webhook_eventos enable row level security;

-- só admin lê (depuração); escrita só service role
drop policy if exists wh_admin_select on public.webhook_eventos;
create policy wh_admin_select on public.webhook_eventos
  for select using (public.eh_admin());

-- 3. is_premium ---------------------------------------------------------------
create or replace function public.is_premium(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.assinaturas
    where user_id = uid
      and status = 'ativa'
      and (periodo_fim is null or periodo_fim > now())
  );
$$;

grant execute on function public.is_premium(uuid) to authenticated, anon;

-- trigger de atualizado_em ------------------------------------------------------
create or replace function public.touch_assinatura()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_assinatura on public.assinaturas;
create trigger trg_touch_assinatura
  before update on public.assinaturas
  for each row execute function public.touch_assinatura();
