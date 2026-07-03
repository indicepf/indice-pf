-- ============================================================================
-- Migração 20 — editar contribuições já aprovadas (esteira de auditoria)
-- Rode no SQL Editor do Supabase. Idempotente. (depende da 19)
--
-- Problema: ao aprovar, o preço é COPIADO para uma leitura em precos_manuais_hist
-- (que calibra o índice). Editar a contribuicoes depois NÃO propaga. Faltava um
-- elo entre a contribuição e a leitura que ela gerou — sem ele, corrigir um erro
-- de digitação exigia mexer no SQL na mão.
--
-- Esta migração:
--   1. liga cada leitura à sua contribuição (precos_manuais_hist.contribuicao_id);
--   2. faz aprovar_contribuicao gravar esse elo;
--   3. adiciona editar_contribuicao_aprovada(...), que atualiza a contribuição,
--      reescreve a leitura ligada (R$/kg recalculado) e refaz os preços efetivos.
-- ============================================================================

alter table precos_manuais_hist
  add column if not exists contribuicao_id bigint references contribuicoes(id) on delete set null;

-- ── aprovar_contribuicao: agora grava o elo contribuicao_id na leitura ──────────
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

  insert into precos_manuais_hist (ingrediente_id, nome, preco_manual, loja, origem, contribuicao_id)
  values (p_ingrediente, v_nome, v_rs_kg, v_loja, 'campo', p_id);

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

-- ── editar_contribuicao_aprovada: corrige uma contribuição já aprovada ─────────
-- Atualiza os campos da contribuição, reescreve a leitura ligada (mesmo R$/kg que
-- a aprovação geraria) e refaz os preços manuais efetivos. Se a edição deixar
-- ingrediente/preço/qtd inválidos, remove a leitura (deixa de calibrar o índice).
create or replace function public.editar_contribuicao_aprovada(
  p_id bigint, p_ingrediente integer, p_preco numeric, p_peso numeric,
  p_marca text, p_mercado text, p_tipo_loja text, p_produto text)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unidade text; v_peso_ref numeric; v_nome text;
  v_marca text; v_loja text; v_gramas numeric; v_rs_kg numeric; v_n int;
begin
  if not public.eh_admin() then raise exception 'apenas administradores'; end if;
  v_marca := nullif(trim(coalesce(p_marca, '')), '');

  update contribuicoes
     set ingrediente_id = p_ingrediente, preco = p_preco, peso_g = p_peso,
         marca = v_marca, mercado = p_mercado, tipo_loja = p_tipo_loja, produto = p_produto
   where id = p_id and status = 'aprovada';

  -- inválida p/ calibrar: apaga a leitura ligada e refaz os efetivos
  if p_ingrediente is null or p_preco is null or p_preco <= 0 or p_peso is null or p_peso <= 0 then
    delete from precos_manuais_hist where contribuicao_id = p_id;
    perform public.refresh_precos_manuais();
    return null;
  end if;

  select unidade, peso_ref_g, nome into v_unidade, v_peso_ref, v_nome
    from ingredientes where id = p_ingrediente;

  v_gramas := case
    when v_unidade in ('unidade', 'maco') then p_peso * v_peso_ref
    else p_peso
  end;
  if v_gramas is null or v_gramas <= 0 then
    delete from precos_manuais_hist where contribuicao_id = p_id;
    perform public.refresh_precos_manuais();
    return null;
  end if;

  v_rs_kg := round((p_preco / v_gramas * 1000)::numeric, 2);
  v_loja := coalesce(p_mercado, p_tipo_loja, 'campo');
  if v_marca is not null then v_loja := v_marca || ' · ' || v_loja; end if;

  -- reescreve a leitura ligada; se não existir (aprovação antiga sem elo), cria
  update precos_manuais_hist
     set ingrediente_id = p_ingrediente, nome = v_nome,
         preco_manual = v_rs_kg, loja = v_loja, origem = 'campo'
   where contribuicao_id = p_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    insert into precos_manuais_hist (ingrediente_id, nome, preco_manual, loja, origem, contribuicao_id)
    values (p_ingrediente, v_nome, v_rs_kg, v_loja, 'campo', p_id);
  end if;

  perform public.refresh_precos_manuais();
  return v_rs_kg;
end $$;

-- ── backfill: liga leituras de campo já existentes à sua contribuição ──────────
-- Só liga quando o R$/kg recalculado da contribuição bate exatamente com a leitura
-- (sem ambiguidade). Aprovações antigas sem correspondência ficam sem elo — editá-
-- las pela tela criará uma leitura nova (comportamento aceitável e visível).
with cand as (
  select c.id as cid, c.ingrediente_id,
    round((c.preco / (case when i.unidade in ('unidade','maco')
                           then c.peso_g * i.peso_ref_g else c.peso_g end) * 1000)::numeric, 2) as rk
  from contribuicoes c
  join ingredientes i on i.id = c.ingrediente_id
  where c.status = 'aprovada' and c.preco > 0 and c.peso_g > 0
)
update precos_manuais_hist h
   set contribuicao_id = cand.cid
  from cand
 where h.contribuicao_id is null and h.origem = 'campo'
   and h.ingrediente_id = cand.ingrediente_id
   and h.preco_manual = cand.rk;
