-- ============================================================================
-- Migração 43 — correção de verificar_paridade_shadow (Fase 1, docs/018)
-- Rode no SQL Editor do Supabase. Idempotente.
--
-- Defeito: na migração 42, o filtro `c.snapshot_id = sid` estava no ON do
-- FULL OUTER JOIN. Em full join, predicado falso não filtra o lado direito —
-- apenas impede o match — então custos_pratos de TODOS os outros snapshots
-- entravam como linhas órfãs (diff = valor cheio). Detectado na primeira
-- execução contra produção; regressão coberta em scripts/test_migration_42.sh.
-- ============================================================================

create or replace function public.verificar_paridade_shadow(sid bigint, versao int default null)
returns table (prato_id bigint, custo_shadow numeric, custo_legado numeric, diff numeric)
language sql
security definer
set search_path = public
as $$
  with v as (
    select coalesce(versao, max(calc_version)) as calc
    from shadow_publicacoes where snapshot_id = sid
  ),
  shadow as (
    select d.prato_id, round(sum(d.custo)::numeric, 2) as custo
    from dish_cost_components d, v
    where d.snapshot_id = sid and d.calc_version = v.calc
    group by d.prato_id
  ),
  legado as (
    select c.prato_id, c.custo_total
    from custos_pratos c
    where c.snapshot_id = sid
  )
  select coalesce(s.prato_id, l.prato_id::bigint),
         s.custo, l.custo_total,
         coalesce(s.custo, 0) - coalesce(l.custo_total, 0)
  from shadow s
  full outer join legado l on l.prato_id = s.prato_id
  order by 4 desc nulls first;
$$;

revoke execute on function public.verificar_paridade_shadow(bigint, int) from public, anon, authenticated;

-- ROLLBACK: reaplicar a definição da migração 42 (não recomendado — ela contém
-- o defeito descrito acima).
