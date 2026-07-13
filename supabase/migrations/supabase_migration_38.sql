-- ============================================================================
-- Migração 38 — correções do recálculo SQL (bug de 12/07) + pratos do usuário
-- Rode no SQL Editor do Supabase. Idempotente.
--
-- BUG (12/07/2026): pratos com ingrediente manual desabaram (ex.: Iscas de
-- Fígado R$7,87 → R$2,23) porque:
--   1. o seed apagou ingredientes.preco_manual (upsert com null) — corrigido
--      no scripts/seed_supabase.py; valores já restaurados do histórico;
--   2. refresh_precos_manuais() só atualizava quem JÁ tinha preco_manual
--      (um null nunca era restaurado, mesmo com leituras válidas);
--   3. integrar_snapshot() divergia do pipeline Python: sem carry-forward do
--      último online, manual sem janela ±10d e SEM filtro de pratos ativos
--      (reinseria o Estrogonofe aposentado e distorcia a mediana).
--
-- Esta migração alinha as funções SQL ao pipeline (calcular_custos_pratos.py)
-- e cria a tabela pratos_usuario (calculadora: salvar/monitorar pratos).
-- ============================================================================

-- 1. refresh: qualquer ingrediente COM leituras ganha o preço efetivo --------
create or replace function public.refresh_precos_manuais()
returns void
language sql
security definer
set search_path = public
as $$
  update ingredientes ing set preco_manual = sub.efetivo
  from (
    select i.id,
      coalesce(
        (select percentile_cont(0.5) within group (order by h.preco_manual)
           from precos_manuais_hist h
          where h.ingrediente_id = i.id and h.preco_manual is not null
            and h.criado_em >= now() - interval '5 days'),
        (select h.preco_manual from precos_manuais_hist h
          where h.ingrediente_id = i.id and h.preco_manual is not null
          order by h.criado_em desc limit 1)
      ) as efetivo
    from ingredientes i
    where exists (select 1 from precos_manuais_hist h
                   where h.ingrediente_id = i.id and h.preco_manual is not null)
  ) sub
  where ing.id = sub.id and sub.efetivo is not null;
$$;

-- 2. integrar_snapshot alinhado ao pipeline Python ---------------------------
--    (carry-forward do último online; manual = mediana das leituras na janela
--    [data−10d, data+10d]; blend 50/50; só pratos ativos; remove linhas de
--    pratos inativos que tenham sobrado no snapshot)
create or replace function public.integrar_snapshot(sid bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare d date;
begin
  if sid is null then return; end if;
  perform public.refresh_precos_manuais();
  select data into d from snapshots where id = sid;

  delete from custos_pratos cp using pratos p
   where cp.snapshot_id = sid and cp.prato_id = p.id and p.ativo = false;

  insert into custos_pratos (snapshot_id, prato_id, custo_total, ingredientes_cobertos, ingredientes_estimados, ingredientes_total)
  select sid, c.prato_id, c.custo, c.cobertos, c.estimados, c.total
  from (
    select r.prato_id,
      round(coalesce(sum(case
        when i.custo_fixo is not null then i.custo_fixo
        when pm.man is not null and po.mediana is not null
          then ((pm.man / 1000.0) + po.mediana) / 2.0 * r.qtd_g
        when pm.man is not null then pm.man / 1000.0 * r.qtd_g
        when po.mediana is not null then po.mediana * r.qtd_g
        when i.preco_manual is not null then i.preco_manual / 1000.0 * r.qtd_g
        else 0 end), 0)::numeric, 2) as custo,
      count(*) as total,
      count(*) filter (where i.custo_fixo is not null or pm.man is not null or po.fresco) as cobertos,
      count(*) filter (where i.custo_fixo is null and pm.man is null and not coalesce(po.fresco, false)
                         and (po.mediana is not null or i.preco_manual is not null)) as estimados
    from receitas r
    join pratos pr on pr.id = r.prato_id and pr.ativo
    join ingredientes i on i.id = r.ingrediente_id
    left join lateral (
      select p2.mediana_normalizada as mediana, (p2.snapshot_id = sid) as fresco
      from precos p2 join snapshots s2 on s2.id = p2.snapshot_id
      where p2.ingrediente_id = r.ingrediente_id
        and p2.mediana_normalizada is not null and s2.data <= d
      order by s2.data desc limit 1
    ) po on true
    left join lateral (
      select percentile_cont(0.5) within group (order by h.preco_manual) as man
      from precos_manuais_hist h
      where h.ingrediente_id = r.ingrediente_id and h.preco_manual is not null
        and h.criado_em >= (d::timestamptz - interval '10 days')
        and h.criado_em <  (d::timestamptz + interval '11 days')
    ) pm on true
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

-- 3. pratos do usuário (calculadora: salvar e acompanhar) ---------------------
create table if not exists pratos_usuario (
  id        bigint generated by default as identity primary key,
  user_id   uuid not null references auth.users (id) on delete cascade,
  nome      text not null check (char_length(nome) between 1 and 80),
  itens     jsonb not null,   -- [{"id": ingrediente_id, "g": porção servida}]
  criado_em timestamptz not null default now()
);
alter table pratos_usuario enable row level security;
drop policy if exists pu_select on pratos_usuario;
drop policy if exists pu_insert on pratos_usuario;
drop policy if exists pu_delete on pratos_usuario;
create policy pu_select on pratos_usuario for select to authenticated using (auth.uid() = user_id);
create policy pu_insert on pratos_usuario for insert to authenticated with check (auth.uid() = user_id);
create policy pu_delete on pratos_usuario for delete to authenticated using (auth.uid() = user_id);

-- 4. reaplica o refresh com a regra corrigida ---------------------------------
select public.refresh_precos_manuais();
