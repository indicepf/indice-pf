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

echo "1/10 stub mínimo do schema de produção (docs/016)"
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
create table precos (id bigint generated always as identity primary key, snapshot_id bigint, ingrediente_id bigint, mediana_normalizada numeric);
create table custos_pratos (id bigint generated always as identity primary key, snapshot_id bigint, prato_id bigint, custo_total numeric, ingredientes_cobertos int, ingredientes_estimados int, ingredientes_total int, unique (snapshot_id, prato_id));
create table audit_log (id bigint generated always as identity primary key, tabela text, registro_id text, acao text, ator uuid, dados_antes jsonb, dados_depois jsonb, criado_em timestamptz default now());
create table resultados_brutos (id bigint generated always as identity primary key, snapshot_id bigint, ingrediente_id bigint, nome_ingrediente text, titulo text, preco_bruto numeric, preco_normalizado numeric, exibicao text, loja text, link text, criado_em timestamptz default now());
create table precos_manuais_hist (id bigint generated always as identity primary key, ingrediente_id bigint, nome text, preco_manual numeric, custo_fixo numeric, loja text, link text, origem text, contribuicao_id bigint, tipo_local text, criado_em timestamptz default now());

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

echo "2/10 aplica as migrações 42 (2x: idempotência) e 43"
PSQL < supabase/migrations/supabase_migration_42.sql
PSQL < supabase/migrations/supabase_migration_42.sql
PSQL < supabase/migrations/supabase_migration_43.sql
# a 44 redefine integrar_snapshot (29/31), que depende de refresh_precos_manuais
PSQL -c "create or replace function public.refresh_precos_manuais() returns void language sql as \$\$ select 1 \$\$;"
PSQL < supabase/migrations/supabase_migration_44.sql

echo "3/10 backfill de status + publicação shadow com paridade zero"
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

echo "4/10 imutabilidade: editar cadastro não muda versão publicada; nova versão preserva a anterior"
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

echo "5/10 falha injetada faz rollback total (custo zero e conjunto incompleto)"
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

echo "6/10 append-only: UPDATE/DELETE em fato publicado são bloqueados"
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

echo "7/10 integração com shadow no momento certo (migração 44)"
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

echo "8/10 supersessão e dedup (migração 45), aplicada sobre duplicatas preexistentes"
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

echo "9/10 observações imutáveis (migração 46): backfill idempotente, dedup e append-only"
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

echo "10/10 fontes manuais e evidência de descarte (migração 47)"
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

echo "PASS: migrações 42/43/44/45/46/47 — todos os testes passaram"
