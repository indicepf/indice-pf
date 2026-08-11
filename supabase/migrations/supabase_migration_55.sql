-- ============================================================================
-- Migração 55 — marca do produto nas leituras manuais de preço
-- Rode no SQL Editor do Supabase. Idempotente. (depende da 30 e da 32)
--
-- Pedido do responsável (11/08/2026): ao registrar a leitura de um item não
-- encontrado, gravar também a MARCA do produto comprado (ex.: "Soya"), que
-- explica boa parte da dispersão entre leituras do mesmo ingrediente.
--
-- p_marca entra com DEFAULT null nas duas funções: o cliente antigo (sem o
-- campo) continua funcionando enquanto o deploy não sobe.
-- ============================================================================

-- 1. coluna nova no histórico ---------------------------------------------------
alter table precos_manuais_hist add column if not exists marca text;

-- 2. salvar_leitura_manual ganha p_marca ---------------------------------------
--    (drop da assinatura da 30 para não criar sobrecarga ambígua na API REST)
drop function if exists public.salvar_leitura_manual(bigint, numeric, numeric, text, text, text);

create or replace function public.salvar_leitura_manual(
  p_id bigint, p_preco numeric, p_fixo numeric, p_loja text, p_link text,
  p_tipo text default null, p_marca text default null)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare efetivo numeric;
begin
  if not public.eh_admin() then raise exception 'apenas administradores'; end if;

  -- nova leitura (só quando há preço por kg/L informado)
  if p_preco is not null and p_preco > 0 then
    insert into precos_manuais_hist (ingrediente_id, nome, preco_manual, custo_fixo, loja, link, tipo_local, marca)
    select p_id, nome, p_preco, p_fixo, p_loja, p_link, p_tipo, p_marca from ingredientes where id = p_id;
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

-- 3. editar_leitura_manual ganha p_marca ---------------------------------------
drop function if exists public.editar_leitura_manual(bigint, numeric, text, text, text);

create or replace function public.editar_leitura_manual(
  p_id bigint, p_preco numeric, p_loja text, p_link text, p_tipo text, p_marca text default null)
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
    tipo_local   = p_tipo,
    marca        = p_marca
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
