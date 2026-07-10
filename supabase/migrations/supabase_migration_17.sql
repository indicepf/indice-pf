-- ============================================================================
-- Migração 17 — contribuições de usuários calibram o índice (dado de campo)
-- Rode no SQL Editor do Supabase. Idempotente. (depende da 14, 15 e 16)
--
-- Uma contribuição APROVADA com ingrediente + preço + quantidade vira uma
-- "leitura de campo": normalizada para R$/kg e gravada no MESMO histórico das
-- leituras manuais (precos_manuais_hist). O preço humano efetivo passa a ser a
-- mediana das leituras (campo + manual) dos últimos 5 dias e, no índice, é
-- combinado 50/50 com o preço online — exatamente como o preço manual já era.
-- ============================================================================

-- distingue a origem de cada leitura no histórico: 'manual' (admin) | 'campo' (usuário)
alter table precos_manuais_hist add column if not exists origem text default 'manual';

-- aprova a contribuição, persiste os campos editados na moderação e — havendo
-- ingrediente + preço + quantidade — registra a leitura de campo e recalcula o
-- preço manual efetivo do ingrediente (mediana das leituras dos últimos 5 dias).
create or replace function public.aprovar_contribuicao(
  p_id bigint, p_ingrediente integer, p_preco numeric, p_peso numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unidade text; v_peso_ref numeric; v_nome text; v_loja text;
  v_gramas numeric; v_rs_kg numeric; v_efetivo numeric;
begin
  if not public.eh_admin() then raise exception 'apenas administradores'; end if;

  update contribuicoes
     set status = 'aprovada', ingrediente_id = p_ingrediente, preco = p_preco, peso_g = p_peso
   where id = p_id
   returning coalesce(mercado, tipo_loja, 'campo') into v_loja;

  -- sem ingrediente, preço ou quantidade não há como calibrar — fica só aprovada
  if p_ingrediente is null or p_preco is null or p_preco <= 0 or p_peso is null or p_peso <= 0 then
    return;
  end if;

  select unidade, peso_ref_g, nome into v_unidade, v_peso_ref, v_nome
    from ingredientes where id = p_ingrediente;

  -- converte a quantidade informada para gramas conforme a unidade do ingrediente
  v_gramas := case
    when v_unidade in ('unidade', 'maco') then p_peso * v_peso_ref  -- precisa de peso_ref_g
    else p_peso                                                     -- 'g' / 'ml' (1:1) / nulo
  end;
  if v_gramas is null or v_gramas <= 0 then return; end if;          -- sem peso_ref_g p/ converter

  v_rs_kg := round((p_preco / v_gramas * 1000)::numeric, 2);

  insert into precos_manuais_hist (ingrediente_id, nome, preco_manual, loja, origem)
  values (p_ingrediente, v_nome, v_rs_kg, v_loja, 'campo');

  -- preço humano efetivo = mediana das leituras (campo + manual) dos últimos 5 dias
  select coalesce(
    (select percentile_cont(0.5) within group (order by preco_manual)
       from precos_manuais_hist
      where ingrediente_id = p_ingrediente and preco_manual is not null
        and criado_em >= now() - interval '5 days'),
    (select preco_manual from precos_manuais_hist
      where ingrediente_id = p_ingrediente and preco_manual is not null
      order by criado_em desc limit 1)
  ) into v_efetivo;

  update ingredientes
     set preco_manual = v_efetivo, preco_manual_em = now()
   where id = p_ingrediente and v_efetivo is not null;
end $$;
