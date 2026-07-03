-- ============================================================================
-- Migração 16 — preço manual = mediana das leituras dos últimos 5 dias
-- Rode no SQL Editor do Supabase. Idempotente. (depende da 14 e 15)
--
-- Antes: preco_manual era um valor fixo (última gravação vencia).
-- Agora: cada gravação é uma LEITURA no histórico; o preço usado no índice é
--        a mediana das leituras dos últimos 5 dias (fallback: última leitura).
-- ============================================================================

-- O trigger antigo registrava no histórico o valor EFETIVO a cada update.
-- Agora as leituras são inseridas explicitamente; remova o trigger p/ não duplicar.
drop trigger if exists trg_preco_manual on ingredientes;

-- janela de agregação (dias)
-- (mantida inline nas funções abaixo: interval '5 days')

-- recalcula o preco_manual EFETIVO (mediana 5 dias, fallback última leitura)
-- de todos os itens que já são manuais (preco_manual not null). Sem guard de
-- admin: é seguro (só deriva de dados existentes) e usado também pelo pipeline.
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
    where i.preco_manual is not null      -- só os já ativos como preço manual R$/kg
  ) sub
  where ing.id = sub.id and sub.efetivo is not null;
$$;

-- registra uma leitura e recalcula o preço efetivo do ingrediente.
-- Retorna o preço efetivo resultante (R$/kg).
create or replace function public.salvar_leitura_manual(
  p_id bigint, p_preco numeric, p_fixo numeric, p_loja text, p_link text)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare efetivo numeric;
begin
  if not public.eh_admin() then raise exception 'apenas administradores'; end if;

  -- nova leitura (só quando há preço R$/kg informado)
  if p_preco is not null and p_preco > 0 then
    insert into precos_manuais_hist (ingrediente_id, nome, preco_manual, custo_fixo, loja, link)
    select p_id, nome, p_preco, p_fixo, p_loja, p_link from ingredientes where id = p_id;
  end if;

  -- efetivo = mediana das leituras dos últimos 5 dias; senão a última leitura
  select coalesce(
    (select percentile_cont(0.5) within group (order by preco_manual)
       from precos_manuais_hist
      where ingrediente_id = p_id and preco_manual is not null
        and criado_em >= now() - interval '5 days'),
    (select preco_manual from precos_manuais_hist
      where ingrediente_id = p_id and preco_manual is not null
      order by criado_em desc limit 1)
  ) into efetivo;

  update ingredientes set
    preco_manual      = efetivo,
    custo_fixo        = p_fixo,
    preco_manual_loja = p_loja,
    preco_manual_link = p_link,
    preco_manual_em   = now()
  where id = p_id;

  return efetivo;
end $$;

-- recalcular custos do índice: agora atualiza as janelas manuais antes de calcular
create or replace function public.recalcular_custos_ultimo_snapshot()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare sid bigint;
begin
  if not public.eh_admin() then raise exception 'apenas administradores'; end if;
  perform public.refresh_precos_manuais();

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
  where cp.prato_id = c.prato_id and cp.snapshot_id = sid;

  update snapshots set custo_total_pf = (
    select round(percentile_cont(0.5) within group (order by custo_total)::numeric, 2)
    from custos_pratos where snapshot_id = sid
  ) where id = sid;
end $$;
