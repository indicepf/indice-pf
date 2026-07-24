-- ============================================================================
-- Migração 50 — Fase 3 pacote 1: registry canônico de fatores e vintage
-- Rode no SQL Editor do Supabase. Idempotente. (depende da 42: nega_mutacao_shadow)
--
-- Base: docs/024. Anti-joins executados em produção em 24/07/2026 (FAC-015):
-- fatos=221 séries, catálogo=198; fatos EXCEPT catálogo = 23 chaves, todas
-- fontes não-SIDRA conhecidas (14 dieese_*, dolar, euro, selic, ipca,
-- salario_minimo, bitcoin, ibovespa, ipca_alimentacao, ipca_alim_fora);
-- catálogo EXCEPT fatos = 0. Nenhum órfão real.
--
-- 1. factor_series: registry único de toda série ingerida (DB-004). Seed do
--    catálogo SIDRA + as 23 não-SIDRA com metadados conhecidos. Série nova
--    desconhecida é AUTO-REGISTRADA por trigger (origem='auto') — a ingestão
--    nunca quebra, e o registry nunca fica para trás.
-- 2. factor_observations: vintage append-only (FAC-012). O upsert atual de
--    fatores_preditores sobrescreve revisões; triggers passam a preservar cada
--    valor como vintage — a revisão da fonte deixa de destruir o valor antigo.
--    Backfill dos 30k+ valores atuais como vintage 1.
-- ============================================================================

-- 1. registry ------------------------------------------------------------------
create table if not exists factor_series (
  serie         text primary key,
  label         text,
  categoria     text,
  unidade       text,
  granularidade text,
  fonte         text,
  origem        text not null default 'auto' check (origem in ('catalogo', 'seed', 'auto')),
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);
alter table factor_series enable row level security;
revoke all on factor_series from anon, authenticated;

-- seed: catálogo SIDRA
insert into factor_series (serie, label, categoria, unidade, granularidade, fonte, origem)
select c.serie, c.label, c.categoria, c.unidade, c.granularidade, 'sidra_7060', 'catalogo'
from fatores_catalogo c
on conflict (serie) do nothing;

-- seed: as 23 séries não-SIDRA (metadados conhecidos das rotas de ingestão)
insert into factor_series (serie, label, categoria, unidade, granularidade, fonte, origem) values
  ('dolar',            'Dólar PTAX venda',                    'Macro',  'R$/US$', 'diaria', 'bcb_ptax',            'seed'),
  ('euro',             'Euro',                                'Macro',  'R$/EUR', 'diaria', 'bcb_sgs_21620',       'seed'),
  ('selic',            'SELIC meta',                          'Macro',  '% a.a.', 'mensal', 'bcb_sgs_432',         'seed'),
  ('ipca',             'IPCA cheio',                          'Inflação', '% a.m.', 'mensal', 'bcb_sgs_433',       'seed'),
  ('salario_minimo',   'Salário mínimo',                      'Macro',  'R$',     'mensal', 'bcb_sgs_1619',        'seed'),
  ('bitcoin',          'Bitcoin',                             'Macro',  'R$',     'diaria', 'coingecko',           'seed'),
  ('ibovespa',         'Ibovespa',                            'Macro',  'pontos', 'diaria', 'yahoo_bvsp',          'seed'),
  ('ipca_alimentacao', 'IPCA — Alimentação e bebidas',        'Inflação', '% a.m.', 'mensal', 'sidra_7060',        'seed'),
  ('ipca_alim_fora',   'IPCA — Alimentação fora do domicílio','Inflação', '% a.m.', 'mensal', 'sidra_7060',        'seed'),
  ('dieese_cesta',   'Cesta básica DIEESE',   'DIEESE', 'R$',    'mensal', 'dieese_cesta_basica', 'seed'),
  ('dieese_carne',   'Carne DIEESE',          'DIEESE', 'R$/kg', 'mensal', 'dieese_cesta_basica', 'seed'),
  ('dieese_leite',   'Leite DIEESE',          'DIEESE', 'R$/L',  'mensal', 'dieese_cesta_basica', 'seed'),
  ('dieese_feijao',  'Feijão DIEESE',         'DIEESE', 'R$/kg', 'mensal', 'dieese_cesta_basica', 'seed'),
  ('dieese_arroz',   'Arroz DIEESE',          'DIEESE', 'R$/kg', 'mensal', 'dieese_cesta_basica', 'seed'),
  ('dieese_farinha', 'Farinha DIEESE',        'DIEESE', 'R$/kg', 'mensal', 'dieese_cesta_basica', 'seed'),
  ('dieese_batata',  'Batata DIEESE',         'DIEESE', 'R$/kg', 'mensal', 'dieese_cesta_basica', 'seed'),
  ('dieese_tomate',  'Tomate DIEESE',         'DIEESE', 'R$/kg', 'mensal', 'dieese_cesta_basica', 'seed'),
  ('dieese_pao',     'Pão francês DIEESE',    'DIEESE', 'R$/kg', 'mensal', 'dieese_cesta_basica', 'seed'),
  ('dieese_cafe',    'Café DIEESE',           'DIEESE', 'R$/kg', 'mensal', 'dieese_cesta_basica', 'seed'),
  ('dieese_banana',  'Banana DIEESE',         'DIEESE', 'R$/dz', 'mensal', 'dieese_cesta_basica', 'seed'),
  ('dieese_acucar',  'Açúcar DIEESE',         'DIEESE', 'R$/kg', 'mensal', 'dieese_cesta_basica', 'seed'),
  ('dieese_oleo',    'Óleo de soja DIEESE',   'DIEESE', 'R$',    'mensal', 'dieese_cesta_basica', 'seed'),
  ('dieese_manteiga','Manteiga DIEESE',       'DIEESE', 'R$/kg', 'mensal', 'dieese_cesta_basica', 'seed')
on conflict (serie) do nothing;

-- garantia: toda série presente nos fatos existe no registry
insert into factor_series (serie, origem)
select distinct fp.serie, 'auto' from fatores_preditores fp
where not exists (select 1 from factor_series fs where fs.serie = fp.serie)
on conflict (serie) do nothing;

-- 2. observações com vintage (append-only) --------------------------------------
create table if not exists factor_observations (
  id          bigint generated always as identity primary key,
  serie       text not null references factor_series(serie),
  data        date not null,
  valor       numeric not null,
  vintage     int not null,
  fonte       text,
  ingested_at timestamptz not null default now(),
  unique (serie, data, vintage)
);
alter table factor_observations enable row level security;
revoke all on factor_observations from anon, authenticated;

drop trigger if exists trg_fo_append_only on factor_observations;
create trigger trg_fo_append_only
  before update or delete on factor_observations
  for each row execute function public.nega_mutacao_shadow();

-- backfill: valores vigentes viram vintage 1 (idempotente)
insert into factor_observations (serie, data, valor, vintage, fonte, ingested_at)
select fp.serie, fp.data, fp.valor, 1, fp.fonte, coalesce(fp.atualizado_em, now())
from fatores_preditores fp
on conflict (serie, data, vintage) do nothing;

-- 3. triggers na tabela vigente: auto-registro e preservação de revisões --------
create or replace function public.registrar_fator_observacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- série nova é auto-registrada; a ingestão nunca falha por registry
  insert into factor_series (serie, fonte, origem)
  values (new.serie, new.fonte, 'auto')
  on conflict (serie) do nothing;

  if tg_op = 'INSERT' then
    insert into factor_observations (serie, data, valor, vintage, fonte)
    values (new.serie, new.data, new.valor, 1, new.fonte)
    on conflict (serie, data, vintage) do nothing;
  elsif tg_op = 'UPDATE' and new.valor is distinct from old.valor then
    -- revisão da fonte: preserva o valor novo como próximo vintage
    insert into factor_observations (serie, data, valor, vintage, fonte)
    select new.serie, new.data, new.valor,
           coalesce(max(vintage), 0) + 1, new.fonte
    from factor_observations
    where serie = new.serie and data = new.data;
  end if;
  return new;
end $$;

drop trigger if exists trg_fatores_vintage on fatores_preditores;
create trigger trg_fatores_vintage
  after insert or update on fatores_preditores
  for each row execute function public.registrar_fator_observacao();

-- ============================================================================
-- ROLLBACK:
--   drop trigger if exists trg_fatores_vintage on fatores_preditores;
--   drop function if exists public.registrar_fator_observacao();
--   drop trigger if exists trg_fo_append_only on factor_observations;
--   drop table if exists factor_observations;
--   drop table if exists factor_series;
-- ============================================================================
