-- ============================================================================
-- Migração 34 — RLS nas tabelas de coleta (achado crítico da auditoria de
-- 10/07/2026). Rode no SQL Editor do Supabase. Idempotente.
--
-- snapshots, precos e resultados_brutos nunca tiveram RLS habilitado (são
-- anteriores à série de migrações): qualquer pessoa com a anon key — que é
-- pública, vai no bundle do frontend — podia INSERT/UPDATE/DELETE via REST,
-- inclusive apagar o histórico inteiro de coletas.
--
-- Depois desta migração:
--   - leitura continua pública (dados abertos, é o produto);
--   - escrita exige admin (public.eh_admin(), da migração 12) — cobre o
--     UPDATE de precos feito pelo /admin ao excluir uma entrada ruim;
--   - o pipeline (GitHub Actions) usa a service role, que ignora RLS;
--   - o DELETE de resultados_brutos do /admin já passa pela RPC
--     super_excluir (SECURITY DEFINER, migração 25) — não é afetado.
-- ============================================================================

-- snapshots -------------------------------------------------------------------
alter table public.snapshots enable row level security;

drop policy if exists snap_select_publico on public.snapshots;
create policy snap_select_publico on public.snapshots
  for select using (true);

drop policy if exists snap_admin_write on public.snapshots;
create policy snap_admin_write on public.snapshots
  for all
  using (public.eh_admin())
  with check (public.eh_admin());

-- precos ----------------------------------------------------------------------
alter table public.precos enable row level security;

drop policy if exists precos_select_publico on public.precos;
create policy precos_select_publico on public.precos
  for select using (true);

drop policy if exists precos_admin_write on public.precos;
create policy precos_admin_write on public.precos
  for all
  using (public.eh_admin())
  with check (public.eh_admin());

-- resultados_brutos -------------------------------------------------------------
alter table public.resultados_brutos enable row level security;

drop policy if exists rb_select_publico on public.resultados_brutos;
create policy rb_select_publico on public.resultados_brutos
  for select using (true);

drop policy if exists rb_admin_write on public.resultados_brutos;
create policy rb_admin_write on public.resultados_brutos
  for all
  using (public.eh_admin())
  with check (public.eh_admin());
