-- ============================================================================
-- Migração 33 — correções de segurança (achados da auditoria de 09/07/2026)
-- Rode no SQL Editor do Supabase. Idempotente.
-- Detalhes: docs/011_seguranca-indice-pf.html
--
--   1. CRÍTICO: perfil_update (migração 7) permite ao usuário atualizar a
--      PRÓPRIA linha inteira de profiles — inclusive is_admin/is_super.
--      Qualquer conta autenticada podia se auto-promover a admin via REST.
--      Fix: privilégio de UPDATE por coluna — authenticated só atualiza os
--      campos de perfil; flags/colunas administrativas ficam de fora.
--   2. ALTO: pag_insert (migração 11) permite INSERT direto em pagamentos
--      (saques) via REST, sem validar saldo. Fix: remove o insert direto e
--      cria a RPC solicitar_saque, que valida saldo/CPF/PIX no banco.
-- ============================================================================

-- 1. profiles: UPDATE por coluna ------------------------------------------------
revoke update on public.profiles from authenticated;
grant update (nome, telefone, regiao, sexo, data_nascimento, avatar_url, cpf, chave_pix, consentimento_cpf_em)
  on public.profiles to authenticated;
-- (a policy perfil_update continua: linha própria; agora restrita a essas colunas)

-- 2. pagamentos: saque só via RPC validada --------------------------------------
drop policy if exists pag_insert on public.pagamentos;

create or replace function public.solicitar_saque(p_valor numeric)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_aprovadas int; v_ganho numeric; v_reservado numeric; v_disponivel numeric;
  v_cpf text; v_pix text; v_id bigint;
begin
  if v_uid is null then raise exception 'não autenticado'; end if;
  if p_valor is null or p_valor < 10 then raise exception 'valor mínimo de saque: R$ 10,00'; end if;

  select cpf, chave_pix into v_cpf, v_pix from profiles where id = v_uid;
  if v_cpf is null or v_pix is null then
    raise exception 'cadastre CPF e chave PIX antes de solicitar o saque';
  end if;

  select count(*) into v_aprovadas from contribuicoes
   where user_id = v_uid and status = 'aprovada';
  v_ganho := v_aprovadas * 0.01;   -- VALOR_POR_FOTO (manter em sincronia com lib/format)

  select coalesce(sum(valor), 0) into v_reservado from pagamentos
   where user_id = v_uid and status <> 'rejeitada';
  v_disponivel := greatest(0, v_ganho - v_reservado);

  if p_valor > v_disponivel then
    raise exception 'saldo insuficiente: disponível R$ %', v_disponivel;
  end if;

  insert into pagamentos (user_id, valor, status, cpf, chave_pix)
  values (v_uid, p_valor, 'solicitado', v_cpf, v_pix)
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.solicitar_saque(numeric) from public, anon;
grant execute on function public.solicitar_saque(numeric) to authenticated;
