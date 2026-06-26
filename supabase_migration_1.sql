-- ============================================================================
-- Migração — Índice PF (modelo por prato)
-- Rode no SQL Editor do Supabase. Pode ser rodada mais de uma vez (idempotente).
--
-- Recria APENAS a tabela 'ingredientes' (que está vazia — sem perda de dados).
-- NÃO toca em snapshots, precos, resultados_brutos nem na view historico_precos.
-- Cria as tabelas novas pratos, receitas e custos_pratos.
-- ============================================================================

-- 1) Catálogo de ingredientes — recriado limpo (a tabela existe mas está vazia,
--    0 linhas, então não há perda de dados). O CASCADE remove eventuais FKs que
--    apontem para ela (ex: precos.ingrediente_id); a COLUNA ingrediente_id em
--    precos/resultados_brutos permanece intacta (era nula). Não afeta snapshots,
--    precos, resultados_brutos nem a view historico_precos.
--    OBS: se existir uma VIEW dependendo de 'ingredientes', o CASCADE a removeria
--    — pelas inspeções, historico_precos depende de precos/snapshots, não daqui.
drop table if exists ingredientes cascade;

create table ingredientes (
  id           serial primary key,
  nome         text not null unique,   -- nome canônico (ex: "Acém bovino")
  categoria    text,
  busca        text,                   -- termo de busca SerpAPI
  unidade      text,                   -- 'g' | 'ml' | 'unidade' | 'maco'
  peso_ref_g   numeric,                -- peso de referência p/ itens por maço/unidade
  palavras_ok  text,                   -- "a|b|c"  (>=1 deve estar no título)
  palavras_nao text,                   -- "x|y|z"  (nenhuma pode estar no título)
  ativo        boolean default true,
  criado_em    timestamptz default now()
);

-- (re)vincula ingrediente_id de precos/resultados_brutos ao novo catálogo.
-- Guardado em DO para não falhar se a constraint já existir / coluna faltar.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name='precos' and column_name='ingrediente_id') then
    alter table precos drop constraint if exists precos_ingrediente_id_fkey;
    alter table precos add constraint precos_ingrediente_id_fkey
      foreign key (ingrediente_id) references ingredientes(id);
  end if;
  if exists (select 1 from information_schema.columns
             where table_name='resultados_brutos' and column_name='ingrediente_id') then
    alter table resultados_brutos drop constraint if exists resultados_brutos_ingrediente_id_fkey;
    alter table resultados_brutos add constraint resultados_brutos_ingrediente_id_fkey
      foreign key (ingrediente_id) references ingredientes(id);
  end if;
end $$;

-- 2) Pratos (100 receitas regionais)
create table if not exists pratos (
  id        serial primary key,
  regiao    text not null,
  nome      text not null,
  criado_em timestamptz default now(),
  unique (regiao, nome)
);

-- 3) Receitas: prato × ingrediente canônico × quantidade por porção (g/ml)
--    Esta tabela é estática (só muda se a planilha de pratos mudar).
create table if not exists receitas (
  id             serial primary key,
  prato_id       integer not null references pratos (id) on delete cascade,
  ingrediente_id integer not null references ingredientes (id),
  qtd_g          numeric not null,
  unique (prato_id, ingrediente_id)
);

-- 4) Custo por prato por snapshot (calculado a cada coleta — camada nova,
--    NÃO mexe em snapshots.custo_total_pf nem em precos.custo_porcao).
create table if not exists custos_pratos (
  id                   serial primary key,
  snapshot_id          integer not null references snapshots (id) on delete cascade,
  prato_id             integer not null references pratos (id) on delete cascade,
  custo_total          numeric,
  ingredientes_cobertos integer,   -- quantos ingredientes tiveram preço no snapshot
  ingredientes_total    integer,   -- total de ingredientes da receita
  criado_em            timestamptz default now(),
  unique (snapshot_id, prato_id)
);

-- ============================================================================
-- O que NÃO muda (continua igual): snapshots, precos, resultados_brutos,
-- a view historico_precos e toda a lógica de coleta do scraper.
-- precos.ingrediente_id (já existe, hoje nulo) passará a ser preenchido.
-- ============================================================================
