-- ============================================================================
-- Migração 22 — auditoria (log de alterações), logins e contexto de aprovação
-- Rode no SQL Editor do Supabase. Idempotente. (depende da 20/21)
--
-- 1. audit_log + triggers nas tabelas-chave → registra QUEM (auth.uid), O QUÊ
--    (tabela/ação/antes→depois) e QUANDO de toda alteração. Device/local não
--    chegam ao trigger (são contexto do navegador); por isso ficam nas colunas
--    de aprovação/pagamento e na login_log, preenchidas pelo app.
-- 2. login_log → um registro por login (dispositivo + GPS).
-- 3. contribuicoes/pagamentos ganham quem aprovou/pagou + dispositivo + GPS.
-- ============================================================================

-- ── 1. AUDIT LOG ────────────────────────────────────────────────────────────
create table if not exists audit_log (
  id bigint generated always as identity primary key,
  tabela text not null,
  registro_id text,
  acao text not null,                 -- INSERT | UPDATE | DELETE
  ator uuid,                          -- auth.uid() (null = serviço/SQL direto)
  dados_antes jsonb,
  dados_depois jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists idx_audit_criado on audit_log (criado_em desc);
create index if not exists idx_audit_tabela on audit_log (tabela, criado_em desc);

alter table audit_log enable row level security;
drop policy if exists audit_admin_select on audit_log;
create policy audit_admin_select on audit_log for select using (public.eh_admin());

-- trigger genérico
create or replace function public.fn_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (tabela, registro_id, acao, ator, dados_antes, dados_depois)
  values (
    TG_TABLE_NAME,
    coalesce(to_jsonb(NEW)->>'id', to_jsonb(OLD)->>'id'),
    TG_OP, auth.uid(),
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(OLD) end,
    case when TG_OP in ('UPDATE','INSERT') then to_jsonb(NEW) end
  );
  return coalesce(NEW, OLD);
end $$;

-- ingredientes: pula o ruído do recálculo automático (só preco_manual/_em mudam)
create or replace function public.fn_audit_ingredientes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'UPDATE'
     and NEW.custo_fixo        is not distinct from OLD.custo_fixo
     and NEW.preco_manual_loja is not distinct from OLD.preco_manual_loja
     and NEW.preco_manual_link is not distinct from OLD.preco_manual_link
     and NEW.nome              is not distinct from OLD.nome then
    return NEW;            -- mudança apenas do preço efetivo recalculado: não audita
  end if;
  insert into audit_log (tabela, registro_id, acao, ator, dados_antes, dados_depois)
  values ('ingredientes', coalesce(NEW.id, OLD.id)::text, TG_OP, auth.uid(),
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(OLD) end,
    case when TG_OP in ('UPDATE','INSERT') then to_jsonb(NEW) end);
  return coalesce(NEW, OLD);
end $$;

drop trigger if exists trg_audit on contribuicoes;
create trigger trg_audit after insert or update or delete on contribuicoes for each row execute function public.fn_audit();
drop trigger if exists trg_audit on pagamentos;
create trigger trg_audit after insert or update or delete on pagamentos for each row execute function public.fn_audit();
drop trigger if exists trg_audit on profiles;
create trigger trg_audit after insert or update or delete on profiles for each row execute function public.fn_audit();
drop trigger if exists trg_audit on precos_manuais_hist;
create trigger trg_audit after insert or update or delete on precos_manuais_hist for each row execute function public.fn_audit();
drop trigger if exists trg_audit_ing on ingredientes;
create trigger trg_audit_ing after insert or update or delete on ingredientes for each row execute function public.fn_audit_ingredientes();

-- ── 2. LOGIN LOG ────────────────────────────────────────────────────────────
create table if not exists login_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  dispositivo text,
  lat numeric, lng numeric, precisao numeric,
  criado_em timestamptz not null default now()
);
create index if not exists idx_login_criado on login_log (criado_em desc);
alter table login_log enable row level security;
drop policy if exists login_insert_own on login_log;
create policy login_insert_own on login_log for insert with check (auth.uid() = user_id);
drop policy if exists login_admin_select on login_log;
create policy login_admin_select on login_log for select using (public.eh_admin());

-- ── 3. CONTEXTO DE APROVAÇÃO / PAGAMENTO ────────────────────────────────────
alter table contribuicoes
  add column if not exists aprovado_por uuid,
  add column if not exists aprovado_em timestamptz,
  add column if not exists aprovado_dispositivo text,
  add column if not exists aprovado_lat numeric,
  add column if not exists aprovado_lng numeric;

alter table pagamentos
  add column if not exists pago_por uuid,
  add column if not exists pago_dispositivo text,
  add column if not exists pago_lat numeric,
  add column if not exists pago_lng numeric;

-- aprovar_contribuicao: + contexto (dispositivo/lat/lng) e quem aprovou
drop function if exists public.aprovar_contribuicao(bigint, integer, numeric, numeric, text);
create or replace function public.aprovar_contribuicao(
  p_id bigint, p_ingrediente integer, p_preco numeric, p_peso numeric, p_marca text,
  p_dispositivo text default null, p_lat numeric default null, p_lng numeric default null)
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
         preco = p_preco, peso_g = p_peso, marca = v_marca,
         aprovado_por = auth.uid(), aprovado_em = now(),
         aprovado_dispositivo = p_dispositivo, aprovado_lat = p_lat, aprovado_lng = p_lng
   where id = p_id
   returning mercado, tipo_loja into v_mercado, v_tipo;

  if p_ingrediente is null or p_preco is null or p_preco <= 0 or p_peso is null or p_peso <= 0 then
    return;
  end if;

  select unidade, peso_ref_g, nome into v_unidade, v_peso_ref, v_nome
    from ingredientes where id = p_ingrediente;

  v_gramas := case when v_unidade in ('unidade', 'maco') then p_peso * v_peso_ref else p_peso end;
  if v_gramas is null or v_gramas <= 0 then return; end if;

  v_rs_kg := round((p_preco / v_gramas * 1000)::numeric, 2);
  v_loja := coalesce(v_mercado, v_tipo, 'campo');
  if v_marca is not null then v_loja := v_marca || ' · ' || v_loja; end if;

  insert into precos_manuais_hist (ingrediente_id, nome, preco_manual, loja, origem, contribuicao_id)
  values (p_ingrediente, v_nome, v_rs_kg, v_loja, 'campo', p_id);

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
