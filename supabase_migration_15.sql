-- ============================================================================
-- Migração 15 — preços manuais: campos extras + histórico com data
-- Rode no SQL Editor do Supabase. Idempotente.
-- ============================================================================

-- 1) campos extras na ingredientes
alter table ingredientes add column if not exists preco_manual_loja text;
alter table ingredientes add column if not exists preco_manual_em   timestamptz;  -- última atualização manual

-- 2) histórico: uma linha por alteração de preço manual (registro append-only)
create table if not exists precos_manuais_hist (
  id             bigserial primary key,
  ingrediente_id bigint references ingredientes (id) on delete cascade,
  nome           text,
  preco_manual   numeric,
  custo_fixo     numeric,
  loja           text,
  link           text,
  criado_em      timestamptz default now()
);

alter table precos_manuais_hist enable row level security;
drop policy if exists pmh_read on precos_manuais_hist;
create policy pmh_read on precos_manuais_hist for select using (true);  -- leitura pública (dado de preço)

-- 3) trigger: a cada mudança de preço manual/fixo/loja/link, carimba a data
--    e registra no histórico (somente quando há preço definido).
create or replace function public.log_preco_manual()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.preco_manual      is distinct from old.preco_manual
     or new.custo_fixo     is distinct from old.custo_fixo
     or new.preco_manual_loja is distinct from old.preco_manual_loja
     or new.preco_manual_link is distinct from old.preco_manual_link then
    new.preco_manual_em := now();
    if new.preco_manual is not null or new.custo_fixo is not null then
      insert into precos_manuais_hist (ingrediente_id, nome, preco_manual, custo_fixo, loja, link)
      values (new.id, new.nome, new.preco_manual, new.custo_fixo, new.preco_manual_loja, new.preco_manual_link);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_preco_manual on ingredientes;
create trigger trg_preco_manual before update on ingredientes
  for each row execute function public.log_preco_manual();
