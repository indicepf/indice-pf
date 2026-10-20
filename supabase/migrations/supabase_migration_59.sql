-- ============================================================================
-- Migração 59 — apaga os 18 snapshots de teste (ids 1, 2, 16–31)
-- ============================================================================
-- Todos com custo_total_pf = 0,91 e status 'published', datas de 04/03 a
-- 17/06/2026 (antes do corte da coleta). Pedido do usuário em 19/10/2026.
--
-- dish_cost_components e shadow_publicacoes são append-only (migração 42):
-- a trava é desligada só dentro desta transação e religada no fim.
-- Backup das linhas apagadas (JSON) feito antes, fora do repositório.
-- ============================================================================

begin;

-- trava: aborta se o conjunto não for exatamente os 18 snapshots de 0,91
do $$
begin
  if (select count(*) from snapshots
       where (id in (1, 2) or id between 16 and 31) and custo_total_pf = 0.91) <> 18
     or (select count(*) from snapshots where id <= 31) <> 18 then
    raise exception 'conjunto de snapshots inesperado';
  end if;
end $$;

alter table dish_cost_components disable trigger trg_dcc_append_only;
alter table shadow_publicacoes   disable trigger trg_shadow_pub_append_only;
alter table price_observations   disable trigger user;

delete from dish_cost_components where snapshot_id <= 31;
delete from shadow_publicacoes   where snapshot_id <= 31;
delete from price_observations   where snapshot_id <= 31;
delete from precos               where snapshot_id <= 31;
delete from resultados_brutos    where snapshot_id <= 31;
delete from custos_pratos        where snapshot_id <= 31;
delete from pipeline_runs        where snapshot_id <= 31;
delete from snapshots            where id <= 31;

alter table dish_cost_components enable trigger trg_dcc_append_only;
alter table shadow_publicacoes   enable trigger trg_shadow_pub_append_only;
alter table price_observations   enable trigger user;

commit;
