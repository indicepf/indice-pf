-- ============================================================================
-- Migração 25 — exclusão de entrada de coleta (resultados_brutos) via super + log
-- Rode no SQL Editor do Supabase. Idempotente. (depende da 23)
--
-- A aba Admin > Dados permite excluir uma fonte errada de um ingrediente
-- (resultados_brutos). Até aqui essa exclusão era um DELETE direto, sem passar
-- por "Ações do super" — então não ficava registrada. Esta migração adiciona
-- resultados_brutos à whitelist de super_excluir, fazendo a exclusão gravar em
-- super_acoes como qualquer outra ação destrutiva do super.
-- ============================================================================

create or replace function public.super_excluir(
  p_tabela text, p_id text,
  p_dispositivo text default null, p_lat numeric default null, p_lng numeric default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes jsonb; v_nome text;
begin
  if not public.eh_super() then raise exception 'apenas superusuários'; end if;

  -- audit_log e super_acoes são trilhas protegidas — nunca exclui
  if p_tabela not in ('contribuicoes','pagamentos','profiles','login_log',
                      'precos_manuais_hist','ingredientes','resultados_brutos') then
    raise exception 'tabela % não pode ser excluída pelo super', p_tabela;
  end if;

  execute format('select to_jsonb(t) from %I t where t.id::text = $1', p_tabela)
    using p_id into v_antes;
  if v_antes is null then raise exception 'registro % não encontrado em %', p_id, p_tabela; end if;

  execute format('delete from %I where id::text = $1', p_tabela) using p_id;

  select nome into v_nome from profiles where id = auth.uid();
  insert into super_acoes (ator, ator_nome, acao, tabela, registro_id, dados_antes, dispositivo, lat, lng)
  values (auth.uid(), v_nome, 'DELETE', p_tabela, p_id, v_antes, p_dispositivo, p_lat, p_lng);
end $$;
