-- ============================================================================
-- Migração 44 — publicação shadow no momento da integração (Fase 1, docs/018 §próximos passos)
-- Rode no SQL Editor do Supabase. Idempotente. (depende da 29/31: integrar_snapshot;
-- da 42/43: publicar_snapshot_shadow)
--
-- ⚠️ ORDEM: se rodar a migração 29 DEPOIS desta, rode esta de novo em seguida —
-- a 29 recria integrar_snapshot sem o bloco shadow.
--
-- O que muda: integrar_snapshot passa a, APÓS a integração legada (inalterada),
-- tentar publicar_snapshot_shadow(sid). Com isso a decomposição canônica é
-- congelada com o cadastro DO MOMENTO da integração — paridade esperada zero
-- dali em diante (docs/018 mostrou que publicar depois mede só passado mutável).
--
-- Falha do shadow NÃO aborta a integração (princípio da Fase 1: shadow não
-- altera o fluxo vigente). A subtransação do shadow faz rollback e a falha é
-- registrada em pipeline_runs (status='failed') na transação da integração.
-- ============================================================================

create or replace function public.integrar_snapshot(sid bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if sid is null then return; end if;
  perform public.refresh_precos_manuais();

  -- upsert: cria as linhas que faltam e recalcula as existentes (idêntico à 29)
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

  -- NOVO (Fase 1): congela a decomposição canônica no momento da integração.
  -- Falha aqui não pode derrubar a integração legada: registra e segue.
  begin
    perform public.publicar_snapshot_shadow(sid);
  exception when others then
    insert into pipeline_runs (kind, status, snapshot_id, finished_at, error)
    values ('shadow_publish', 'failed', sid, now(), sqlerrm);
  end;
end $$;

revoke execute on function public.integrar_snapshot(bigint) from public, anon, authenticated;

-- ============================================================================
-- ROLLBACK: reaplicar a §1 da migração 29 (recria integrar_snapshot sem o
-- bloco shadow). Nenhuma tabela é alterada por esta migração.
-- ============================================================================
