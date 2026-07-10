-- ============================================================================
-- Migração 30 — tipo de local nas leituras manuais de preço
-- Rode no SQL Editor do Supabase. Idempotente. (depende da 15/16)
--
-- Pedido do responsável (09/07/2026): ao registrar um preço manual para um
-- item não encontrado, classificar o TIPO do local (feira, mercado, atacarejo,
-- conveniência…) num menu suspenso, deixando o campo "fonte" para o nome do
-- local. O tipo fica arquivado no histórico de leituras.
-- ============================================================================

-- 1. coluna nova no histórico ---------------------------------------------------
alter table precos_manuais_hist add column if not exists tipo_local text;

-- 2. salvar_leitura_manual ganha o parâmetro p_tipo -----------------------------
--    (drop da assinatura antiga para não criar sobrecarga ambígua na API REST)
drop function if exists public.salvar_leitura_manual(bigint, numeric, numeric, text, text);

create or replace function public.salvar_leitura_manual(
  p_id bigint, p_preco numeric, p_fixo numeric, p_loja text, p_link text, p_tipo text default null)
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
    insert into precos_manuais_hist (ingrediente_id, nome, preco_manual, custo_fixo, loja, link, tipo_local)
    select p_id, nome, p_preco, p_fixo, p_loja, p_link, p_tipo from ingredientes where id = p_id;
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
