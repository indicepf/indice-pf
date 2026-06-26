-- ============================================================================
-- Migração 23 — superusuário (god-mode) com log de ações imutável
-- Rode no SQL Editor do Supabase. Idempotente. (depende da 22)
--
-- Um papel acima do admin, para poucas pessoas, que pode EXCLUIR e EDITAR
-- qualquer entrada do app (contribuições, saques, perfis, logins, preços,
-- ingredientes). Toda ação dele passa por funções SECURITY DEFINER que fazem a
-- operação E registram em super_acoes no mesmo passo — então o histórico é a
-- fonte autoritativa e não pode ser contornado por escrita direta na tabela.
--
-- Duas trilhas ficam IMUTÁVEIS para todos via app (nem o super apaga/edita):
--   • audit_log  — a trilha de alterações já existente (migração 22);
--   • super_acoes — o log das ações do próprio super (esta migração).
-- Ambas são SELECT-only (sem policy de update/delete) e ficam FORA da whitelist
-- de super_excluir.
-- ============================================================================

-- ── 1. FLAG DE SUPERUSUÁRIO ─────────────────────────────────────────────────
-- Conceda manualmente (o super também precisa de is_admin — ver passo 3):
--   update profiles set is_admin = true, is_super = true where id = '<auth uid>';
alter table profiles add column if not exists is_super boolean default false;

-- ── 2. eh_super(): espelho de eh_admin() ────────────────────────────────────
create or replace function public.eh_super()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_super from profiles where id = auth.uid()), false);
$$;

-- ── 3. eh_admin() passa a incluir o super ───────────────────────────────────
-- Assim o super herda automaticamente todas as policies/funções que já checam
-- eh_admin() (super é superconjunto do admin), sem tocar em cada RLS.
create or replace function public.eh_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin or is_super from profiles where id = auth.uid()), false);
$$;

-- ── 4. super_acoes: log imutável das ações do super ─────────────────────────
create table if not exists super_acoes (
  id bigint generated always as identity primary key,
  ator uuid,
  ator_nome text,                     -- snapshot do nome no momento da ação
  acao text not null,                 -- DELETE | UPDATE
  tabela text not null,
  registro_id text,
  dados_antes jsonb,
  dados_depois jsonb,                 -- null em DELETE
  dispositivo text,
  lat numeric, lng numeric,
  criado_em timestamptz not null default now()
);
create index if not exists idx_super_criado on super_acoes (criado_em desc);
create index if not exists idx_super_tabela on super_acoes (tabela, criado_em desc);

alter table super_acoes enable row level security;
-- só leitura (admin/super). SEM policy de insert/update/delete → imutável pelo
-- cliente; apenas as funções SECURITY DEFINER abaixo inserem.
drop policy if exists super_acoes_select on super_acoes;
create policy super_acoes_select on super_acoes for select using (public.eh_admin());

-- ── 5. super_excluir(): exclusão genérica com whitelist + log ───────────────
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
                      'precos_manuais_hist','ingredientes') then
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

-- ── 6. super_editar_saque(): edita um pagamento + log ───────────────────────
create or replace function public.super_editar_saque(
  p_id bigint, p_valor numeric, p_status text, p_chave_pix text, p_cpf text,
  p_dispositivo text default null, p_lat numeric default null, p_lng numeric default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes jsonb; v_depois jsonb; v_nome text;
begin
  if not public.eh_super() then raise exception 'apenas superusuários'; end if;

  select to_jsonb(p) into v_antes from pagamentos p where id = p_id;
  if v_antes is null then raise exception 'saque % não encontrado', p_id; end if;

  update pagamentos
     set valor = p_valor, status = p_status, chave_pix = p_chave_pix, cpf = p_cpf
   where id = p_id;

  select to_jsonb(p) into v_depois from pagamentos p where id = p_id;
  select nome into v_nome from profiles where id = auth.uid();
  insert into super_acoes (ator, ator_nome, acao, tabela, registro_id, dados_antes, dados_depois, dispositivo, lat, lng)
  values (auth.uid(), v_nome, 'UPDATE', 'pagamentos', p_id::text, v_antes, v_depois, p_dispositivo, p_lat, p_lng);
end $$;

-- ── 7. super_editar_perfil(): edita um perfil + log ─────────────────────────
-- inclui is_admin/is_super (gerir quem é admin/super é poder legítimo do super)
create or replace function public.super_editar_perfil(
  p_id uuid, p_nome text, p_telefone text, p_regiao text, p_is_admin boolean, p_is_super boolean,
  p_dispositivo text default null, p_lat numeric default null, p_lng numeric default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes jsonb; v_depois jsonb; v_nome text;
begin
  if not public.eh_super() then raise exception 'apenas superusuários'; end if;

  select to_jsonb(p) into v_antes from profiles p where id = p_id;
  if v_antes is null then raise exception 'perfil % não encontrado', p_id; end if;

  update profiles
     set nome = p_nome, telefone = p_telefone, regiao = p_regiao,
         is_admin = p_is_admin, is_super = p_is_super
   where id = p_id;

  select to_jsonb(p) into v_depois from profiles p where id = p_id;
  select nome into v_nome from profiles where id = auth.uid();
  insert into super_acoes (ator, ator_nome, acao, tabela, registro_id, dados_antes, dados_depois, dispositivo, lat, lng)
  values (auth.uid(), v_nome, 'UPDATE', 'profiles', p_id::text, v_antes, v_depois, p_dispositivo, p_lat, p_lng);
end $$;
