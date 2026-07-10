-- ============================================================================
-- Migração 31 — separa "recalcular custos" de "aprovar coleta"
-- Rode no SQL Editor do Supabase. Idempotente. (depende da 29: integrar_snapshot)
--
-- Problema: após a migração 29, recalcular_custos_ultimo_snapshot passou a
-- INSERIR linhas em custos_pratos (upsert). Como o front chama essa RPC após
-- salvar preço manual ou excluir uma fonte, qualquer uma dessas ações com uma
-- coleta pendente em staging a APROVARIA implicitamente. Esta migração:
--   1. recalcular_custos_ultimo_snapshot() — recalcula o último snapshot JÁ
--      INTEGRADO (não toca no pendente). É o que preço manual/exclusão de
--      fonte precisam.
--   2. aprovar_ultima_coleta() — integra o último snapshot (pendente ou não).
--      É o botão "Aprovar coleta" do /admin.
-- A aprovação automática de 5 dias (aprovar_coletas_pendentes) não muda.
-- ============================================================================

-- 1. recalcular SÓ o que já está integrado --------------------------------------
create or replace function public.recalcular_custos_ultimo_snapshot()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare sid bigint;
begin
  if not public.eh_admin() then raise exception 'apenas administradores'; end if;
  select max(snapshot_id) into sid from custos_pratos;
  perform public.integrar_snapshot(sid);
end $$;

-- 2. aprovar (integrar) o último snapshot ----------------------------------------
create or replace function public.aprovar_ultima_coleta()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare sid bigint;
begin
  if not public.eh_admin() then raise exception 'apenas administradores'; end if;
  select max(id) into sid from snapshots;
  perform public.integrar_snapshot(sid);
end $$;
