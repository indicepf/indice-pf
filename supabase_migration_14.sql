-- ============================================================================
-- Migração 14 — gestão de preços manuais pelo /admin
-- Rode no SQL Editor do Supabase. Idempotente.
-- ============================================================================

-- 1) link/fonte de referência do preço manual
alter table ingredientes add column if not exists preco_manual_link text;

-- 2) admin pode editar ingredientes (preço manual + link)
drop policy if exists ingr_admin_update on ingredientes;
create policy ingr_admin_update on ingredientes for update
  using (public.eh_admin()) with check (public.eh_admin());

-- 3) recalcula os custos dos pratos do último snapshot a partir dos preços
--    atuais (online + manual + fixo). Sem fallback de histórico: ingrediente
--    sem preço não contribui. Atualiza também o índice nacional (mediana).
create or replace function public.recalcular_custos_ultimo_snapshot()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare sid bigint;
begin
  if not public.eh_admin() then
    raise exception 'apenas administradores';
  end if;

  select max(id) into sid from snapshots;
  if sid is null then return; end if;

  update custos_pratos cp set
    custo_total            = c.custo,
    ingredientes_cobertos  = c.cobertos,
    ingredientes_estimados = 0,
    ingredientes_total     = c.total
  from (
    select r.prato_id,
      round(coalesce(sum(case
        when i.custo_fixo   is not null then i.custo_fixo
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
  where cp.prato_id = c.prato_id and cp.snapshot_id = sid;

  update snapshots set custo_total_pf = (
    select round(percentile_cont(0.5) within group (order by custo_total)::numeric, 2)
    from custos_pratos where snapshot_id = sid
  ) where id = sid;
end $$;
