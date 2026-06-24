-- ============================================================================
-- Migração 19 — marca do produto nas contribuições
-- Rode no SQL Editor do Supabase. Idempotente. (depende da 17)
--
-- A marca é uma propriedade do produto específico (ex.: "Ancelli" para um arroz),
-- não do ingrediente canônico. Fica em contribuicoes.marca (opcional — itens
-- frescos ficam sem marca) e, na aprovação, é embutida na "loja" da leitura de
-- campo para aparecer no modal de Fontes do prato.
-- ============================================================================

alter table contribuicoes add column if not exists marca text;

-- recria aprovar_contribuicao com a marca (assinatura nova: +p_marca)
drop function if exists public.aprovar_contribuicao(bigint, integer, numeric, numeric);

create or replace function public.aprovar_contribuicao(
  p_id bigint, p_ingrediente integer, p_preco numeric, p_peso numeric, p_marca text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unidade text; v_peso_ref numeric; v_nome text;
  v_mercado text; v_tipo text; v_loja text; v_marca text;
  v_gramas numeric; v_rs_kg numeric; v_efetivo numeric;
begin
  if not public.eh_admin() then raise exception 'apenas administradores'; end if;
  v_marca := nullif(trim(coalesce(p_marca, '')), '');

  update contribuicoes
     set status = 'aprovada', ingrediente_id = p_ingrediente,
         preco = p_preco, peso_g = p_peso, marca = v_marca
   where id = p_id
   returning mercado, tipo_loja into v_mercado, v_tipo;

  -- sem ingrediente, preço ou quantidade não há como calibrar — fica só aprovada
  if p_ingrediente is null or p_preco is null or p_preco <= 0 or p_peso is null or p_peso <= 0 then
    return;
  end if;

  select unidade, peso_ref_g, nome into v_unidade, v_peso_ref, v_nome
    from ingredientes where id = p_ingrediente;

  v_gramas := case
    when v_unidade in ('unidade', 'maco') then p_peso * v_peso_ref
    else p_peso
  end;
  if v_gramas is null or v_gramas <= 0 then return; end if;

  v_rs_kg := round((p_preco / v_gramas * 1000)::numeric, 2);

  -- loja da leitura: "marca · loja" quando há marca; senão só a loja
  v_loja := coalesce(v_mercado, v_tipo, 'campo');
  if v_marca is not null then v_loja := v_marca || ' · ' || v_loja; end if;

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
