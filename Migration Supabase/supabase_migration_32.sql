-- ============================================================================
-- Migração 32 — edição de leituras manuais do histórico
-- Rode no SQL Editor do Supabase. Idempotente. (depende da 30: tipo_local)
--
-- Pedido do responsável (09/07/2026): leituras registradas ANTES do campo
-- "tipo de local" existirem precisam ser editáveis (tipo, fonte, link, preço).
-- Editar recalcula o preço manual efetivo do ingrediente (mediana 5 dias),
-- pois o preço da leitura pode ter mudado.
-- ============================================================================

create or replace function public.editar_leitura_manual(
  p_id bigint, p_preco numeric, p_loja text, p_link text, p_tipo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare iid bigint; efetivo numeric;
begin
  if not public.eh_admin() then raise exception 'apenas administradores'; end if;

  update precos_manuais_hist set
    preco_manual = coalesce(p_preco, preco_manual),
    loja         = p_loja,
    link         = p_link,
    tipo_local   = p_tipo
  where id = p_id
  returning ingrediente_id into iid;
  if iid is null then return; end if;

  -- mesmo cálculo do salvar_leitura_manual: mediana das leituras dos últimos
  -- 5 dias; senão a última leitura
  select coalesce(
    (select percentile_cont(0.5) within group (order by preco_manual)
       from precos_manuais_hist
      where ingrediente_id = iid and preco_manual is not null
        and criado_em >= now() - interval '5 days'),
    (select preco_manual from precos_manuais_hist
      where ingrediente_id = iid and preco_manual is not null
      order by criado_em desc limit 1)
  ) into efetivo;

  update ingredientes set preco_manual = efetivo, preco_manual_em = now()
  where id = iid;
end $$;
