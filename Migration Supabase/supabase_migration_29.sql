-- ============================================================================
-- Migração 29 — aprovação automática de coletas pendentes (5 dias)
-- Rode no SQL Editor do Supabase. Idempotente. (depende da 12: eh_admin;
-- da 16: refresh_precos_manuais)
--
-- ⚠️ ORDEM: se rodar esta migração DEPOIS da 31, rode a 31 de novo em seguida —
-- a §2 abaixo recria a versão antiga de recalcular_custos_ultimo_snapshot
-- (que integra o snapshot pendente), e a 31 é quem a corrige.
-- O "schedule N" no resultado é o id do job criado no pg_cron (esperado).
--
-- Contexto: a coleta fica em staging (snapshots/precos/resultados_brutos, sem
-- linhas em custos_pratos) até o admin aprovar em /admin → Coleta. Com a
-- cadência semanal, uma coleta não aprovada seria sobrescrita pela seguinte
-- (a RPC integra sempre o último snapshot). Esta migração:
--   1. integrar_snapshot(sid)  — função interna que INSERE (não só atualiza)
--      as linhas de custos_pratos do snapshot; corrige a lacuna da versão da
--      migração 16, que fazia só UPDATE e dependia de linhas pré-existentes.
--   2. recalcular_custos_ultimo_snapshot() — mantém a assinatura usada pelo
--      /admin (checagem eh_admin) e delega para integrar_snapshot.
--   3. aprovar_coletas_pendentes(p_dias) — integra qualquer snapshot pendente
--      com mais de p_dias (default 5) — não só o último, para nenhum ficar órfão.
--   4. pg_cron: roda a aprovação automática 1×/dia às 12h UTC (9h Brasília).
-- ============================================================================

-- 1. integração de um snapshot (insere/recalcula custos_pratos) ---------------
--    security definer SEM checagem de admin: é chamada pelo pg_cron (sem
--    auth.uid()) e pela RPC do admin (que checa antes). Não exposta à API.
create or replace function public.integrar_snapshot(sid bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if sid is null then return; end if;
  perform public.refresh_precos_manuais();

  -- upsert: cria as linhas que faltam e recalcula as existentes
  insert into custos_pratos (snapshot_id, prato_id, custo_total, ingredientes_cobertos, ingredientes_estimados, ingredientes_total)
  select sid, c.prato_id, c.custo, c.cobertos, 0, c.total
  from (
    select r.prato_id,
      round(coalesce(sum(case
        when i.custo_fixo is not null then i.custo_fixo
        -- manual (R$/kg → R$/g) E online presentes: média das duas medianas
        when i.preco_manual is not null and p.mediana_normalizada is not null
          then ((i.preco_manual / 1000.0) + p.mediana_normalizada) / 2.0 * r.qtd_g
        when i.preco_manual is not null then i.preco_manual / 1000.0 * r.qtd_g
        when p.mediana_normalizada is not null then p.mediana_normalizada * r.qtd_g
        else 0 end), 0)::numeric, 2) as custo,
      count(*) as total,
      count(*) filter (
        where i.custo_fixo is not null or i.preco_manual is not null or p.mediana_normalizada is not null
      ) as cobertos
    from receitas r
    join ingredientes i on i.id = r.ingrediente_id
    left join precos p on p.ingrediente_id = r.ingrediente_id and p.snapshot_id = sid
    group by r.prato_id
  ) c
  on conflict (snapshot_id, prato_id) do update set
    custo_total            = excluded.custo_total,
    ingredientes_cobertos  = excluded.ingredientes_cobertos,
    ingredientes_estimados = excluded.ingredientes_estimados,
    ingredientes_total     = excluded.ingredientes_total;

  update snapshots set custo_total_pf = (
    select round(percentile_cont(0.5) within group (order by custo_total)::numeric, 2)
    from custos_pratos where snapshot_id = sid
  ) where id = sid;
end $$;

revoke execute on function public.integrar_snapshot(bigint) from public, anon, authenticated;

-- 2. RPC do /admin (mesma assinatura de sempre) --------------------------------
create or replace function public.recalcular_custos_ultimo_snapshot()
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

-- 3. aprovação automática: integra snapshots pendentes com mais de p_dias -----
--    pendente = sem nenhuma linha em custos_pratos. Percorre TODOS os
--    pendentes vencidos (não só o último), do mais antigo para o mais novo.
create or replace function public.aprovar_coletas_pendentes(p_dias int default 5)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare s record; n int := 0;
begin
  for s in
    select sn.id from snapshots sn
    where sn.data <= current_date - p_dias
      and not exists (select 1 from custos_pratos cp where cp.snapshot_id = sn.id)
    order by sn.id
  loop
    perform public.integrar_snapshot(s.id);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function public.aprovar_coletas_pendentes(int) from public, anon, authenticated;

-- 4. agendamento diário (12h UTC = 9h Brasília) --------------------------------
create extension if not exists pg_cron;
select cron.unschedule('aprovar-coletas-pendentes')
  where exists (select 1 from cron.job where jobname = 'aprovar-coletas-pendentes');
select cron.schedule('aprovar-coletas-pendentes', '0 12 * * *',
  $$select public.aprovar_coletas_pendentes(5)$$);
