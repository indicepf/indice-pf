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

echo "1/6 stub mínimo do schema de produção (docs/016)"
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
create table precos (id bigint generated always as identity primary key, snapshot_id bigint, ingrediente_id bigint, mediana_normalizada numeric, unique (snapshot_id, ingrediente_id));
create table custos_pratos (id bigint generated always as identity primary key, snapshot_id bigint, prato_id bigint, custo_total numeric, ingredientes_cobertos int, ingredientes_estimados int, ingredientes_total int, unique (snapshot_id, prato_id));

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
SQL

echo "2/6 aplica a migração 42 (e reaplica: idempotência)"
PSQL < supabase/migrations/supabase_migration_42.sql
PSQL < supabase/migrations/supabase_migration_42.sql

echo "3/6 backfill de status + publicação shadow com paridade zero"
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
  assert (select status from pipeline_runs where kind = 'shadow_publish' and snapshot_id = 1) = 'published', 'run não registrado';
end $$;
SQL

echo "4/6 imutabilidade: editar cadastro não muda versão publicada; nova versão preserva a anterior"
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

echo "5/6 falha injetada faz rollback total (custo zero e conjunto incompleto)"
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
SQL

echo "6/6 append-only: UPDATE/DELETE em fato publicado são bloqueados"
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

echo "PASS: migração 42 — todos os testes passaram"
