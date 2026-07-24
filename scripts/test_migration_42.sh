#!/usr/bin/env bash
# Teste da migração 42 (Fase 1, shadow) em Postgres ISOLADO e descartável.
# Usa docker se disponível; senão, initdb/pg_ctl locais em diretório temporário.
# Não toca produção. Sai com código != 0 se qualquer asserção falhar.
# Rodar: bash scripts/test_migration_42.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if docker info >/dev/null 2>&1; then
  CONT=ipf-test-mig42
  docker rm -f $CONT >/dev/null 2>&1 || true
  docker run -d --name $CONT -e POSTGRES_PASSWORD=t postgres:16-alpine >/dev/null
  trap 'docker rm -f $CONT >/dev/null 2>&1 || true' EXIT
  for i in $(seq 1 30); do
    docker exec $CONT pg_isready -U postgres >/dev/null 2>&1 && break
    sleep 1
  done
  PSQL() { docker exec -i $CONT psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
elif command -v initdb >/dev/null && command -v pg_ctl >/dev/null; then
  PGDIR=$(mktemp -d)
  PORT=55433
  initdb -D "$PGDIR" -U postgres -A trust >/dev/null
  pg_ctl -D "$PGDIR" -o "-p $PORT -k $PGDIR -c listen_addresses=''" -l "$PGDIR/log" start >/dev/null
  trap 'pg_ctl -D "$PGDIR" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$PGDIR"' EXIT
  createdb -h "$PGDIR" -p $PORT -U postgres ipftest
  PSQL() { psql -h "$PGDIR" -p $PORT -U postgres -d ipftest -v ON_ERROR_STOP=1 -q "$@"; }
else
  echo "ERRO: nem docker nem initdb/pg_ctl disponíveis" >&2
  exit 2
fi

echo "1/13 stub mínimo do schema de produção (docs/016)"
PSQL <<'SQL'
-- roles do Supabase referenciados pelos revokes da migração
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create table snapshots (
  id bigint generated always as identity primary key,
  data date, fonte text, custo_total_pf numeric,
  criado_em timestamptz default now(), simulado boolean);
create table pratos (id bigint primary key, nome text, regiao text, ativo boolean);
create table ingredientes (id bigint primary key, nome text, custo_fixo numeric, preco_manual numeric, ativo boolean);
create table receitas (id bigint generated always as identity primary key, prato_id bigint, ingrediente_id bigint, qtd_g numeric);
-- sem unique (snapshot_id, ingrediente_id): produção NÃO tem essa constraint
-- (duplicatas reais encontradas nos snapshots 33/34 — docs/018)
create table precos (id bigint generated always as identity primary key, snapshot_id bigint, ingrediente_id bigint, mediana_normalizada numeric, qtd_resultados int);
create table custos_pratos (id bigint generated always as identity primary key, snapshot_id bigint, prato_id bigint, custo_total numeric, ingredientes_cobertos int, ingredientes_estimados int, ingredientes_total int, unique (snapshot_id, prato_id));
create table audit_log (id bigint generated always as identity primary key, tabela text, registro_id text, acao text, ator uuid, dados_antes jsonb, dados_depois jsonb, criado_em timestamptz default now());
create table resultados_brutos (id bigint generated always as identity primary key, snapshot_id bigint, ingrediente_id bigint, nome_ingrediente text, titulo text, preco_bruto numeric, preco_normalizado numeric, exibicao text, loja text, link text, criado_em timestamptz default now());
create table precos_manuais_hist (id bigint generated always as identity primary key, ingrediente_id bigint, nome text, preco_manual numeric, custo_fixo numeric, loja text, link text, origem text, contribuicao_id bigint, tipo_local text, criado_em timestamptz default now());
create table fatores_preditores (serie text, data date, valor numeric, fonte text, atualizado_em timestamptz default now(), primary key (serie, data));
create table fatores_catalogo (serie text primary key, label text, categoria text, granularidade text, unidade text, atualizado_em timestamptz default now());

-- fixtures: 2 pratos ativos; online (0.005/g), manual (20 R$/kg), custo fixo (0.50)
insert into pratos values (1,'P1','sudeste',true),(2,'P2','sul',true);
insert into ingredientes values
  (10,'Online',null,null,true),(11,'Manual',null,20,true),
  (12,'Fixo',0.5,null,true),(13,'SemPreco',null,null,true);
insert into receitas (prato_id, ingrediente_id, qtd_g) values
  (1,10,200),(1,11,100),(1,12,10),(2,10,300),(2,12,10);
insert into snapshots (data, custo_total_pf) values ('2026-07-20', 2.75);
insert into precos (snapshot_id, ingrediente_id, mediana_normalizada) values (1,10,0.005);
-- legado calculado à mão: P1 = 1.00+2.00+0.50 = 3.50 ; P2 = 1.50+0.50 = 2.00 ; mediana 2.75
insert into custos_pratos (snapshot_id, prato_id, custo_total, ingredientes_cobertos, ingredientes_estimados, ingredientes_total)
values (1,1,3.50,3,0,3),(1,2,2.00,2,0,2);
-- regressão da migração 43: custo de OUTRO snapshot não pode vazar na paridade
insert into custos_pratos (snapshot_id, prato_id, custo_total, ingredientes_cobertos, ingredientes_estimados, ingredientes_total)
values (999,1,42.00,1,0,1);
SQL

echo "2/13 aplica as migrações 42 (2x: idempotência) e 43"
PSQL < supabase/migrations/supabase_migration_42.sql
PSQL < supabase/migrations/supabase_migration_42.sql
PSQL < supabase/migrations/supabase_migration_43.sql
# a 44 redefine integrar_snapshot (29/31), que depende de refresh_precos_manuais
PSQL -c "create or replace function public.refresh_precos_manuais() returns void language sql as \$\$ select 1 \$\$;"
PSQL < supabase/migrations/supabase_migration_44.sql

echo "3/13 backfill de status + publicação shadow com paridade zero"
PSQL <<'SQL'
do $$
declare m jsonb;
begin
  assert (select status from snapshots where id = 1) = 'published', 'backfill: snapshot com custos deveria ser published';
  m := publicar_snapshot_shadow(1);
  assert (m->>'mediana')::numeric = 2.75, 'mediana shadow != 2.75: ' || (m->>'mediana');
  assert (m->>'mediana')::numeric = (select custo_total_pf from snapshots where id = 1), 'mediana shadow != legado';
  assert (m->>'pratosCalculados')::int = 2, 'pratos calculados != 2';
  assert (select count(*) from verificar_paridade_shadow(1) where diff <> 0) = 0, 'paridade por prato deveria ser zero';
  assert (select count(*) from verificar_paridade_shadow(1)) = 2, 'paridade vazou custos de outro snapshot (regressão da 43)';
  assert (select status from pipeline_runs where kind = 'shadow_publish' and snapshot_id = 1) = 'published', 'run não registrado';
end $$;
SQL

echo "4/13 imutabilidade: editar cadastro não muda versão publicada; nova versão preserva a anterior"
PSQL <<'SQL'
update ingredientes set preco_manual = 99 where id = 11;
do $$
declare m jsonb;
begin
  -- versão 1 congelada: componente manual continua 2.00
  assert (select custo from dish_cost_components where snapshot_id = 1 and calc_version = 1 and ingrediente_id = 11) = 2.000000,
    'componente publicado mudou após edição do cadastro';
  m := publicar_snapshot_shadow(1);
  assert (m->>'calcVersion')::int = 2, 'esperava calc_version 2';
  assert (m->>'mediana')::numeric = 6.70, 'v2 deveria refletir o manual novo (6.70): ' || (m->>'mediana');
  assert (select mediana from shadow_publicacoes where snapshot_id = 1 and calc_version = 1) = 2.75, 'manifesto v1 alterado';
  assert (select count(*) from dish_cost_components where snapshot_id = 1 and calc_version = 1) = 5, 'componentes v1 alterados';
end $$;
SQL

echo "5/13 falha injetada faz rollback total (custo zero e conjunto incompleto)"
PSQL <<'SQL'
-- prato ativo cujo único ingrediente não tem preço nenhum → custo 0 → não publica
insert into pratos values (3,'P3','norte',true);
insert into receitas (prato_id, ingrediente_id, qtd_g) values (3,13,100);
insert into snapshots (data) values ('2026-07-27');
do $$
begin
  begin
    perform publicar_snapshot_shadow(2);
    raise exception 'NAO_DEVERIA_PUBLICAR';
  exception when others then
    if sqlerrm = 'NAO_DEVERIA_PUBLICAR' then raise; end if;
    assert sqlerrm like '%não positivo%', 'erro inesperado: ' || sqlerrm;
  end;
  assert (select count(*) from dish_cost_components where snapshot_id = 2) = 0, 'rollback deixou componentes';
  assert (select count(*) from shadow_publicacoes where snapshot_id = 2) = 0, 'rollback deixou manifesto';
  assert (select count(*) from pipeline_runs where snapshot_id = 2) = 0, 'rollback deixou run';
end $$;
-- prato ativo sem receita → calculados < esperados → não publica
delete from receitas where prato_id = 3;
do $$
begin
  begin
    perform publicar_snapshot_shadow(2);
    raise exception 'NAO_DEVERIA_PUBLICAR';
  exception when others then
    if sqlerrm = 'NAO_DEVERIA_PUBLICAR' then raise; end if;
    assert sqlerrm like '%incompleto%', 'erro inesperado: ' || sqlerrm;
  end;
end $$;
-- preço duplicado no snapshot (caso real dos snapshots 33/34) → recusa e rollback
insert into snapshots (data) values ('2026-08-01');
insert into precos (snapshot_id, ingrediente_id, mediana_normalizada) values (3,10,0.005),(3,10,0.006);
do $$
begin
  begin
    perform publicar_snapshot_shadow(3);
    raise exception 'NAO_DEVERIA_PUBLICAR';
  exception when others then
    if sqlerrm = 'NAO_DEVERIA_PUBLICAR' then raise; end if;
    assert sqlerrm like '%duplicate key%', 'erro inesperado: ' || sqlerrm;
  end;
  assert (select count(*) from dish_cost_components where snapshot_id = 3) = 0, 'rollback deixou componentes (dup)';
  assert (select count(*) from pipeline_runs where snapshot_id = 3) = 0, 'rollback deixou run (dup)';
end $$;
SQL

echo "6/13 append-only: UPDATE/DELETE em fato publicado são bloqueados"
PSQL <<'SQL'
do $$
begin
  begin
    update dish_cost_components set custo = 0 where snapshot_id = 1 and calc_version = 1;
    raise exception 'UPDATE_PASSOU';
  exception when others then
    if sqlerrm = 'UPDATE_PASSOU' then raise; end if;
    assert sqlerrm like '%append-only%', 'erro inesperado: ' || sqlerrm;
  end;
  begin
    delete from shadow_publicacoes where snapshot_id = 1;
    raise exception 'DELETE_PASSOU';
  exception when others then
    if sqlerrm = 'DELETE_PASSOU' then raise; end if;
    assert sqlerrm like '%append-only%', 'erro inesperado: ' || sqlerrm;
  end;
end $$;
SQL

echo "7/13 integração com shadow no momento certo (migração 44)"
PSQL <<'SQL'
update pratos set ativo = false where id = 3;   -- prato sem receita sai do universo esperado
-- sucesso: integrar publica shadow com paridade zero por construção
insert into snapshots (data) values ('2026-08-03');   -- id 4
insert into precos (snapshot_id, ingrediente_id, mediana_normalizada) values (4,10,0.006);
select integrar_snapshot(4);
do $$
begin
  assert (select count(*) from custos_pratos where snapshot_id = 4) = 2, 'integração legada não gravou custos';
  assert (select custo_total_pf from snapshots where id = 4) = 6.95, 'mediana legada != 6.95';
  assert (select mediana from shadow_publicacoes where snapshot_id = 4) = 6.95, 'mediana shadow != legada na integração';
  assert (select count(*) from verificar_paridade_shadow(4) where diff <> 0) = 0, 'paridade da integração deveria ser zero';
  assert (select status from pipeline_runs where kind = 'shadow_publish' and snapshot_id = 4) = 'published', 'run da integração ausente';
end $$;
-- falha do shadow não derruba a integração legada e fica no ledger
insert into snapshots (data) values ('2026-08-10');   -- id 5
insert into precos (snapshot_id, ingrediente_id, mediana_normalizada) values (5,10,0.005),(5,10,0.007);
select integrar_snapshot(5);
do $$
begin
  assert (select count(*) from custos_pratos where snapshot_id = 5) = 2, 'integração legada deveria ter gravado mesmo com shadow falhando';
  assert (select count(*) from dish_cost_components where snapshot_id = 5) = 0, 'shadow com duplicata não deveria publicar';
  assert (select error from pipeline_runs where snapshot_id = 5 and status = 'failed') like '%duplicate key%',
    'falha do shadow deveria estar registrada no ledger';
end $$;
SQL

echo "8/13 supersessão e dedup (migração 45), aplicada sobre duplicatas preexistentes"
PSQL <<'SQL'
-- duplicata no padrão real de produção (33/34): linha original sem mediana +
-- linha regravada com valor, ANTES da migração 45 existir
insert into snapshots (data) values ('2026-08-17');   -- id 6
insert into precos (snapshot_id, ingrediente_id, mediana_normalizada) values (6,10,null),(6,10,0.008);
SQL
PSQL < supabase/migrations/supabase_migration_45.sql
PSQL < supabase/migrations/supabase_migration_45.sql
PSQL <<'SQL'
do $$
declare vencedora bigint;
begin
  -- dedup: nenhuma dupla ativa restante em nenhum snapshot
  assert (select count(*) from (
    select 1 from precos where ingrediente_id is not null and superseded_by is null
    group by snapshot_id, ingrediente_id having count(*) > 1) g) = 0, 'restaram duplicatas ativas';
  -- snapshot 6: vence a linha com valor; a nula está superseded com trilha
  select id into vencedora from precos where snapshot_id = 6 and superseded_by is null;
  assert (select mediana_normalizada from precos where id = vencedora) = 0.008, 'vencedora errada no snapshot 6';
  assert (select superseded_by from precos where snapshot_id = 6 and id <> vencedora) = vencedora, 'superseded_by não aponta para a vencedora';
  assert (select count(*) from audit_log where acao = 'supersede_dedup') >= 2, 'dedup sem trilha em audit_log';
  -- nova duplicata ativa é impossível
  begin
    insert into precos (snapshot_id, ingrediente_id, mediana_normalizada) values (6,10,0.009);
    raise exception 'DUP_PASSOU';
  exception when others then
    if sqlerrm = 'DUP_PASSOU' then raise; end if;
    assert sqlerrm like '%uq_precos_ativos%', 'erro inesperado: ' || sqlerrm;
  end;
end $$;
-- integração usa só a linha ativa: P1 = 1.6+9.9+0.5 = 12.00 ; P2 = 2.4+0.5 = 2.90
select integrar_snapshot(6);
do $$
begin
  assert (select custo_total_pf from snapshots where id = 6) = 7.45, 'mediana legada != 7.45';
  assert (select mediana from shadow_publicacoes where snapshot_id = 6) = 7.45, 'mediana shadow != 7.45';
  assert (select count(*) from verificar_paridade_shadow(6) where diff <> 0) = 0, 'paridade do snapshot 6 deveria ser zero';
  -- lineage aponta para a linha ativa, nunca para a superseded
  assert (select count(*) from dish_cost_components d join precos p on p.id = d.preco_id
          where d.snapshot_id = 6 and p.superseded_by is not null) = 0, 'componente referenciou linha superseded';
  -- o snapshot 5 (recusado no passo 7 por duplicata) agora publica — como 33/34 em produção
  perform publicar_snapshot_shadow(5);
  assert (select mediana from shadow_publicacoes where snapshot_id = 5) = 7.20, 'mediana do snapshot 5 pós-dedup != 7.20';
end $$;
SQL

echo "9/13 observações imutáveis (migração 46): backfill idempotente, dedup e append-only"
PSQL <<'SQL'
insert into resultados_brutos (snapshot_id, ingrediente_id, titulo, preco_bruto, preco_normalizado, loja, exibicao) values
  (1, 10, 'Arroz 5kg', 25.00, 0.005, 'Loja A', 'R$ 5,00/kg'),
  (1, 10, 'Arroz 5kg', 25.00, 0.005, 'Loja A', 'R$ 5,00/kg'),   -- oferta idêntica: colapsa
  (1, 11, 'Feijão 1kg', 8.00, 0.008, 'Loja B', 'R$ 8,00/kg');
SQL
PSQL < supabase/migrations/supabase_migration_46.sql
PSQL < supabase/migrations/supabase_migration_46.sql
PSQL <<'SQL'
do $$
begin
  -- 3 linhas brutas → 2 observações (dupla idêntica colapsa); reaplicação não duplicou
  assert (select count(*) from price_observations) = 2, 'backfill deveria produzir 2 observações';
  assert (select legacy_id from price_observations where ingrediente_id = 11) is not null, 'legacy_id não preservado';
  -- replay do pipeline (mesma oferta) não duplica
  insert into price_observations (fonte, snapshot_id, ingrediente_id, titulo, loja, preco_bruto, preco_normalizado, exibicao)
  values ('online_scrape', 1, 10, 'Arroz 5kg', 'Loja A', 25.00, 0.005, 'R$ 5,00/kg')
  on conflict (fonte, dedup_hash) do nothing;
  assert (select count(*) from price_observations) = 2, 'replay duplicou observação';
  -- oferta nova entra
  insert into price_observations (fonte, snapshot_id, ingrediente_id, titulo, loja, preco_bruto, preco_normalizado, exibicao)
  values ('online_scrape', 1, 10, 'Arroz 5kg', 'Loja C', 24.00, 0.0048, 'R$ 4,80/kg')
  on conflict (fonte, dedup_hash) do nothing;
  assert (select count(*) from price_observations) = 3, 'oferta nova não entrou';
  -- append-only: fato observado não é atualizado nem apagado
  begin
    update price_observations set preco_bruto = 1 where ingrediente_id = 11;
    raise exception 'UPDATE_PASSOU';
  exception when others then
    if sqlerrm = 'UPDATE_PASSOU' then raise; end if;
    assert sqlerrm like '%append-only%', 'erro inesperado: ' || sqlerrm;
  end;
  begin
    delete from price_observations where ingrediente_id = 11;
    raise exception 'DELETE_PASSOU';
  exception when others then
    if sqlerrm = 'DELETE_PASSOU' then raise; end if;
    assert sqlerrm like '%append-only%', 'erro inesperado: ' || sqlerrm;
  end;
  -- o hard-delete do bruto legado (auditoria do Lab) não destrói mais o fato
  delete from resultados_brutos where ingrediente_id = 11;
  assert (select count(*) from price_observations where ingrediente_id = 11) = 1, 'observação deveria sobreviver ao delete do legado';
end $$;
SQL

echo "10/13 fontes manuais e evidência de descarte (migração 47)"
PSQL <<'SQL'
-- duas leituras manuais IGUAIS em datas diferentes = dois fatos; e uma linha
-- só de custo_fixo, que não é observação de preço
insert into precos_manuais_hist (ingrediente_id, nome, preco_manual, loja, criado_em) values
  (11, 'Manual', 20.00, 'Feira X', '2026-06-01T10:00:00Z'),
  (11, 'Manual', 20.00, 'Feira X', '2026-07-01T10:00:00Z');
insert into precos_manuais_hist (ingrediente_id, nome, custo_fixo) values (12, 'Fixo', 0.5);
SQL
PSQL < supabase/migrations/supabase_migration_47.sql
PSQL < supabase/migrations/supabase_migration_47.sql
PSQL <<'SQL'
do $$
declare antes int;
begin
  -- observações online preexistentes sobreviveram à recriação do hash
  assert (select count(*) from price_observations where fonte = 'online_scrape') = 3, 'observações online perdidas na migração 47';
  -- manuais: 2 leituras (datas distintas não colapsam); custo_fixo fica de fora
  assert (select count(*) from price_observations where fonte = 'manual_hist') = 2, 'backfill manual deveria ter 2 observações';
  assert (select count(*) from price_observations where fonte = 'manual_hist' and preco_normalizado = 0.020000) = 2, 'normalização R$/kg → R$/g errada';
  -- replay do backfill (2ª aplicação acima) não duplicou
  select count(*) into antes from price_observations;
  -- descarte vira observação rejeitada com motivo; replay não duplica
  insert into price_observations (fonte, snapshot_id, ingrediente_id, titulo, loja, preco_bruto, status, motivo)
  values ('online_scrape', 1, 10, 'Arroz gourmet 5kg', 'Loja A', 60.00, 'rejected', 'produto_invalido: palavra proibida: gourmet')
  on conflict (fonte, dedup_hash) do nothing;
  insert into price_observations (fonte, snapshot_id, ingrediente_id, titulo, loja, preco_bruto, status, motivo)
  values ('online_scrape', 1, 10, 'Arroz gourmet 5kg', 'Loja A', 60.00, 'rejected', 'produto_invalido: palavra proibida: gourmet')
  on conflict (fonte, dedup_hash) do nothing;
  assert (select count(*) from price_observations) = antes + 1, 'descarte duplicou ou não entrou';
  assert (select motivo from price_observations where status = 'rejected') like 'produto_invalido%', 'motivo do descarte ausente';
  -- a mesma oferta pode existir rejeitada E incluída (dois fatos; curadoria vem com price_estimates)
  insert into price_observations (fonte, snapshot_id, ingrediente_id, titulo, loja, preco_bruto, status)
  values ('online_scrape', 1, 10, 'Arroz gourmet 5kg', 'Loja A', 60.00, 'included')
  on conflict (fonte, dedup_hash) do nothing;
  assert (select count(*) from price_observations where titulo = 'Arroz gourmet 5kg') = 2, 'status deveria distinguir os dois fatos';
end $$;
SQL

echo "11/13 DAG estimativa/resolução e RLS (migração 48)"
PSQL <<'SQL'
-- observações do snapshot 6 (ing 10): mediana(0.007, 0.009) = 0.008 = precos → reconcilia
insert into price_observations (fonte, snapshot_id, ingrediente_id, titulo, loja, preco_bruto, preco_normalizado, status)
values ('online_scrape', 6, 10, 'Arroz A 5kg', 'Loja A', 35.00, 0.007, 'included'),
       ('online_scrape', 6, 10, 'Arroz B 5kg', 'Loja B', 45.00, 0.009, 'included');
SQL
PSQL < supabase/migrations/supabase_migration_48.sql
PSQL < supabase/migrations/supabase_migration_48.sql
PSQL <<'SQL'
do $$
declare m jsonb; v int;
begin
  m := publicar_snapshot_shadow(6);
  v := (m->>'calcVersion')::int;
  assert (m->>'mediana')::numeric = 7.45, 'paridade quebrou com o DAG: mediana ' || (m->>'mediana');
  assert (select count(*) from verificar_paridade_shadow(6, v) where diff <> 0) = 0, 'paridade legado deveria seguir zero';
  -- estimativa online reconciliada com as observações (membership real)
  assert (select valor from price_estimates where snapshot_id = 6 and calc_version = v and fonte = 'online' and ingrediente_id = 10) = 0.008,
    'estimativa online != 0.008';
  assert (select n_inputs from price_estimates where snapshot_id = 6 and calc_version = v and ingrediente_id = 10 and fonte = 'online') = 2,
    'n_inputs != 2';
  assert (select reconciliado from price_estimates where snapshot_id = 6 and calc_version = v and ingrediente_id = 10 and fonte = 'online') is true,
    'estimativa deveria reconciliar';
  assert (select count(*) from price_estimate_inputs pei join price_estimates e on e.id = pei.estimate_id
          where e.snapshot_id = 6 and e.calc_version = v) = 2, 'membership != 2 observações';
  -- resoluções: blend impossível aqui (ing10 só online; ing11 só manual; ing12 fixo)
  assert (select regra from price_resolutions where snapshot_id = 6 and calc_version = v and ingrediente_id = 10) = 'online', 'regra ing10';
  assert (select regra from price_resolutions where snapshot_id = 6 and calc_version = v and ingrediente_id = 11) = 'manual', 'regra ing11';
  assert (select regra from price_resolutions where snapshot_id = 6 and calc_version = v and ingrediente_id = 12) = 'custo_fixo', 'regra ing12';
  -- todo componente aponta para a sua resolução
  assert (select count(*) from dish_cost_components where snapshot_id = 6 and calc_version = v and resolution_id is null) = 0,
    'componente sem resolução';
  -- snapshot sem observações: estimativa sem inputs fica com reconciliado null
  m := publicar_snapshot_shadow(4);
  assert (m->>'mediana')::numeric = 6.95, 'mediana do snapshot 4 mudou';
  assert (select reconciliado from price_estimates where snapshot_id = 4
          and calc_version = (m->>'calcVersion')::int and fonte = 'online' and ingrediente_id = 10) is null,
    'sem inputs deveria ser reconciliado null';
  -- append-only nas tabelas novas
  begin
    update price_estimates set valor = 1 where snapshot_id = 6;
    raise exception 'UPDATE_PASSOU';
  exception when others then
    if sqlerrm = 'UPDATE_PASSOU' then raise; end if;
    assert sqlerrm like '%append-only%', 'erro inesperado: ' || sqlerrm;
  end;
  -- RLS habilitado nas 7 tabelas canônicas
  assert (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relrowsecurity
            and c.relname in ('pipeline_runs','dish_cost_components','shadow_publicacoes',
                              'price_observations','price_estimates','price_estimate_inputs','price_resolutions')) = 7,
    'RLS não habilitado em todas as tabelas canônicas';
end $$;
SQL

echo "12/13 QC na autoaprovação e coleta manual vinculada (migração 49)"
PSQL < supabase/migrations/supabase_migration_49.sql
PSQL < supabase/migrations/supabase_migration_49.sql
PSQL <<'SQL'
-- limiares de teste (versão maior vence a default)
-- cobertura possível aqui: snapshot sem precos = 67% (manual+fixo de 3 ingredientes);
-- com precos = 100%. Limiar 70 separa os dois casos.
insert into qc_config (versao, limiares) values (2, jsonb_build_object(
  'min_ingredientes_com_preco', 1, 'min_cobertura_fontes_pct', 70, 'min_resultados_por_ingrediente', 1))
on conflict (versao) do nothing;
do $$
declare antes int; obs int;
begin
  -- 1. leitura manual nova vira observação automaticamente (com legacy_id)
  select count(*) into antes from price_observations where fonte = 'manual_hist';
  insert into precos_manuais_hist (ingrediente_id, nome, preco_manual, loja) values (11, 'Manual', 30.00, 'Feira Z');
  select count(*) into obs from price_observations where fonte = 'manual_hist';
  assert obs = antes + 1, 'trigger não criou observação manual';
  assert (select preco_normalizado from price_observations where fonte = 'manual_hist' and preco_bruto = 30.00) = 0.030000, 'normalização do trigger errada';
  assert (select legacy_id from price_observations where fonte = 'manual_hist' and preco_bruto = 30.00) is not null, 'legacy_id ausente no trigger';
  -- linha só de custo fixo não vira observação de preço
  insert into precos_manuais_hist (ingrediente_id, nome, custo_fixo) values (12, 'Fixo', 0.7);
  assert (select count(*) from price_observations where fonte = 'manual_hist') = obs, 'custo_fixo virou observação indevidamente';
end $$;
-- 2. QC bloqueia snapshot ruim e integra o bom
update snapshots set data = current_date + 30 where id in (2, 3);   -- pendentes antigos fora do teste
insert into snapshots (data) values (current_date - 10);            -- id 7: SEM precos → QC reprova
insert into snapshots (data) values (current_date - 9);             -- id 8: com preço → QC aprova
insert into precos (snapshot_id, ingrediente_id, mediana_normalizada, qtd_resultados) values (8, 10, 0.004, 5);
do $$
declare n int;
begin
  n := aprovar_coletas_pendentes(0);
  assert n = 1, 'esperava exatamente 1 snapshot autoaprovado, veio ' || n;
  -- reprovado: continua pendente, com checks e falha registradas
  assert (select count(*) from custos_pratos where snapshot_id = 7) = 0, 'snapshot reprovado foi integrado';
  assert (select count(*) from data_quality_checks where snapshot_id = 7 and severidade = 'bloqueante' and resultado is false) = 2,
    'checks bloqueantes do snapshot 7 não registrados';
  assert (select count(*) from pipeline_runs where snapshot_id = 7 and kind = 'auto_approval_qc' and status = 'failed') = 1,
    'falha de QC não registrada no ledger';
  -- aprovado: integrado com shadow e mediana correta (P1 11.20, P2 1.70 → 6.45)
  assert (select custo_total_pf from snapshots where id = 8) = 6.45, 'mediana do snapshot 8 != 6.45';
  assert (select count(*) from shadow_publicacoes where snapshot_id = 8) = 1, 'shadow não publicado na autoaprovação';
  assert (select count(*) from data_quality_checks where snapshot_id = 8 and severidade = 'bloqueante' and resultado is true) = 2,
    'checks do snapshot 8 não registrados';
  assert (select resultado from data_quality_checks where snapshot_id = 8 and regra = 'ingredientes_amostra_baixa') is true,
    'aviso de amostra deveria passar (qtd_resultados=5)';
end $$;
SQL

echo "13/14 registry de fatores e vintage (migração 50)"
PSQL <<'SQL'
insert into fatores_catalogo (serie, label, categoria, granularidade, unidade) values ('ipca_1101', 'Arroz', 'Cereais', 'mensal', '%');
insert into fatores_preditores (serie, data, valor, fonte) values
  ('ipca_1101', '2026-06-01', 1.5, 'sidra_7060'),
  ('serie_sem_catalogo', '2026-06-01', 2.0, 'fonte_x');
SQL
PSQL < supabase/migrations/supabase_migration_50.sql
PSQL < supabase/migrations/supabase_migration_50.sql
PSQL <<'SQL'
do $$
begin
  -- registry cobre catálogo + fatos órfãos + seed (dolar etc.)
  assert (select origem from factor_series where serie = 'ipca_1101') = 'catalogo', 'série do catálogo fora do registry';
  assert (select origem from factor_series where serie = 'serie_sem_catalogo') = 'auto', 'série órfã não auto-registrada';
  assert (select origem from factor_series where serie = 'dolar') = 'seed', 'seed não-SIDRA ausente';
  -- backfill vintage 1 (reaplicação não duplicou)
  assert (select count(*) from factor_observations) = 2, 'backfill vintage 1 incorreto';
  -- upsert idêntico não gera vintage novo
  insert into fatores_preditores (serie, data, valor, fonte) values ('ipca_1101', '2026-06-01', 1.5, 'sidra_7060')
  on conflict (serie, data) do update set valor = excluded.valor;
  assert (select count(*) from factor_observations where serie = 'ipca_1101') = 1, 'upsert sem mudança criou vintage';
  -- REVISÃO da fonte: valor novo vira vintage 2 e o antigo sobrevive
  insert into fatores_preditores (serie, data, valor, fonte) values ('ipca_1101', '2026-06-01', 1.7, 'sidra_7060')
  on conflict (serie, data) do update set valor = excluded.valor;
  assert (select count(*) from factor_observations where serie = 'ipca_1101' and data = '2026-06-01') = 2, 'revisão não preservada';
  assert (select valor from factor_observations where serie = 'ipca_1101' and vintage = 1) = 1.5, 'vintage 1 perdido';
  assert (select valor from factor_observations where serie = 'ipca_1101' and vintage = 2) = 1.7, 'vintage 2 errado';
  -- série inédita na ingestão: auto-registro + observação, sem quebrar
  insert into fatores_preditores (serie, data, valor, fonte) values ('serie_nova', '2026-07-01', 9.9, 'fonte_y');
  assert (select origem from factor_series where serie = 'serie_nova') = 'auto', 'série nova não registrada';
  assert (select count(*) from factor_observations where serie = 'serie_nova') = 1, 'observação da série nova ausente';
  -- append-only
  begin
    delete from factor_observations where serie = 'serie_nova';
    raise exception 'DELETE_PASSOU';
  exception when others then
    if sqlerrm = 'DELETE_PASSOU' then raise; end if;
    assert sqlerrm like '%append-only%', 'erro inesperado: ' || sqlerrm;
  end;
end $$;
SQL

echo "14/14 DIEESE por capital (migração 51)"
PSQL < supabase/migrations/supabase_migration_51.sql
PSQL < supabase/migrations/supabase_migration_51.sql
PSQL <<'SQL'
do $$
begin
  -- inserção normal
  insert into dieese_capital_observations (serie, capital, data, valor) values
    ('dieese_cesta', 'SP', '2026-07-01', 860.00),
    ('dieese_cesta', 'RJ', '2026-07-01', 840.00);
  assert (select count(*) from dieese_capital_observations) = 2, 'inserção de capitais falhou';
  -- reingestão idêntica não duplica
  insert into dieese_capital_observations (serie, capital, data, valor) values ('dieese_cesta', 'SP', '2026-07-01', 860.00)
  on conflict (serie, capital, data, valor) do nothing;
  assert (select count(*) from dieese_capital_observations) = 2, 'reingestão idêntica duplicou';
  -- revisão do DIEESE (valor muda): novo fato, o antigo sobrevive
  insert into dieese_capital_observations (serie, capital, data, valor) values ('dieese_cesta', 'SP', '2026-07-01', 862.50)
  on conflict (serie, capital, data, valor) do nothing;
  assert (select count(*) from dieese_capital_observations where serie = 'dieese_cesta' and capital = 'SP' and data = '2026-07-01') = 2,
    'revisão não preservou o valor antigo';
  -- painel de capitais visível por mês
  assert (select n_capitais from dieese_cobertura_capitais where serie = 'dieese_cesta' and data = '2026-07-01') = 3,
    'view de cobertura não reflete os 3 fatos (SP antigo+novo, RJ)';
  -- append-only
  begin
    delete from dieese_capital_observations where capital = 'RJ';
    raise exception 'DELETE_PASSOU';
  exception when others then
    if sqlerrm = 'DELETE_PASSOU' then raise; end if;
    assert sqlerrm like '%append-only%', 'erro inesperado: ' || sqlerrm;
  end;
  -- FK exige série registrada (a rota real usa séries já no seed da 50)
  begin
    insert into dieese_capital_observations (serie, capital, data, valor) values ('serie_inexistente', 'SP', '2026-07-01', 1);
    raise exception 'FK_PASSOU';
  exception when others then
    if sqlerrm = 'FK_PASSOU' then raise; end if;
  end;
end $$;
SQL

echo "PASS: migrações 42/43/44/45/46/47/48/49/50/51 — todos os testes passaram"
