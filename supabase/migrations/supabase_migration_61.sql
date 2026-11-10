-- ============================================================================
-- Migração 61 — janela do preço manual passa de ±10 para ±5 dias
-- ============================================================================
-- Rode no SQL Editor do Supabase DEPOIS da 60. Idempotente. Só troca a função
-- custo_componentes (integrar_snapshot e publicar_snapshot_shadow já leem dela);
-- não altera nenhum dado. O recálculo da série é feito depois, chamando
-- integrar_snapshot(sid) para cada snapshot.
--
-- Decisão de 10/11/2026: 10 dias para cada lado misturava leituras de campo de
-- quase três semanas; fica 5 antes e 5 depois da data da coleta. Janela:
-- leituras de precos_manuais_hist em [data − 5 dias, data + 6 dias) em UTC,
-- a mesma de pipeline/calcular_custos_pratos.py e lib/queries.ts
-- (JANELA_MANUAL_DIAS = 5). O resto da regra é o da migração 60.
-- ============================================================================

begin;

create or replace function public.custo_componentes(sid bigint)
returns table (
  prato_id bigint, ingrediente_id bigint, qtd_g numeric, fonte_efetiva text,
  preco_manual_kg numeric, preco_online_g numeric, preco_id bigint,
  custo numeric, coberto boolean, estimado boolean)
language sql
stable
security definer
set search_path = public
as $$
  with j as (
    select s.data,
           (s.data::timestamp at time zone 'UTC') - interval '5 days' as ini,
           (s.data::timestamp at time zone 'UTC') + interval '6 days' as fim
    from snapshots s where s.id = sid
  ),
  base as (
    select r.prato_id, r.ingrediente_id, r.qtd_g, i.custo_fixo,
           po.id as preco_id, po.mediana_normalizada as online_g, po.fresco,
           pm.kg::numeric as man_kg,
           -- sem leitura até a data (coletas antigas de item que só ganhou
           -- leitura depois): o preço manual atual, como o pipeline Python,
           -- em vez de deixar o ingrediente a zero
           coalesce(ml.kg::numeric, i.preco_manual) as ultimo_kg
    from receitas r
    join pratos pr on pr.id = r.prato_id and pr.ativo
    join ingredientes i on i.id = r.ingrediente_id
    cross join j
    -- online da coleta; sem ele, o da coleta anterior mais recente que teve
    left join lateral (
      select p2.id, p2.mediana_normalizada, (p2.snapshot_id = sid) as fresco
      from precos p2 join snapshots s2 on s2.id = p2.snapshot_id
      where p2.ingrediente_id = r.ingrediente_id
        and p2.superseded_by is null
        and p2.mediana_normalizada is not null
        and s2.data <= j.data
      order by s2.data desc, (p2.snapshot_id = sid) desc
      limit 1
    ) po on true
    -- manual da janela: mediana das leituras
    left join lateral (
      select percentile_cont(0.5) within group (order by h.preco_manual) as kg
      from precos_manuais_hist h
      where h.ingrediente_id = r.ingrediente_id and h.preco_manual is not null
        and h.criado_em >= j.ini and h.criado_em < j.fim
    ) pm on true
    -- última leitura até o fim da janela (mediana do dia), só para nicho sem online
    left join lateral (
      select percentile_cont(0.5) within group (order by h.preco_manual) as kg
      from precos_manuais_hist h
      where h.ingrediente_id = r.ingrediente_id and h.preco_manual is not null
        and h.criado_em < j.fim
        and (h.criado_em at time zone 'America/Sao_Paulo')::date = (
          select max((h2.criado_em at time zone 'America/Sao_Paulo')::date)
          from precos_manuais_hist h2
          where h2.ingrediente_id = r.ingrediente_id and h2.preco_manual is not null
            and h2.criado_em < j.fim)
    ) ml on true
  )
  select b.prato_id, b.ingrediente_id, b.qtd_g,
    case
      when b.custo_fixo is not null                     then 'custo_fixo'
      when b.man_kg is not null and b.online_g is not null then 'blend'
      when b.man_kg is not null                         then 'manual'
      when b.online_g is not null                       then 'online'
      when b.ultimo_kg is not null                      then 'manual'
      else 'ausente' end,
    case
      when b.custo_fixo is not null then null
      when b.man_kg is not null     then b.man_kg
      when b.online_g is null       then b.ultimo_kg
      end,
    case when b.custo_fixo is null then b.online_g end,
    case when b.custo_fixo is null then b.preco_id end,
    coalesce(case
      when b.custo_fixo is not null                        then b.custo_fixo
      when b.man_kg is not null and b.online_g is not null then ((b.man_kg / 1000.0) + b.online_g) / 2.0 * b.qtd_g
      when b.man_kg is not null                            then b.man_kg / 1000.0 * b.qtd_g
      when b.online_g is not null                          then b.online_g * b.qtd_g
      when b.ultimo_kg is not null                         then b.ultimo_kg / 1000.0 * b.qtd_g
      else 0 end, 0),
    (b.custo_fixo is not null or b.man_kg is not null or coalesce(b.fresco, false)),
    (b.custo_fixo is null and b.man_kg is null and not coalesce(b.fresco, false)
       and (b.online_g is not null or b.ultimo_kg is not null))
  from base b;
$$;

revoke execute on function public.custo_componentes(bigint) from public, anon, authenticated;

commit;

-- Conferência: deve devolver '5 days' e '6 days'
--   select position('5 days' in prosrc) > 0, position('6 days' in prosrc) > 0
--     from pg_proc where proname = 'custo_componentes';
--
-- Reverter: rodar de novo o bloco 1 da migração 60.
