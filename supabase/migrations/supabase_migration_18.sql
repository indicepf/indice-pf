-- ============================================================================
-- Migração 18 — região geográfica nas contribuições (para relatórios por região)
-- Rode no SQL Editor do Supabase. Idempotente.
--
-- Deriva a macrorregião (Norte/Nordeste/Centro-oeste/Sudeste/Sul) a partir do
-- estado já capturado (contribuicoes.uf — que guarda o nome do estado por extenso,
-- ex.: "São Paulo"). Um trigger preenche `regiao` em toda contribuição nova/alterada
-- e o backfill no final cobre as que já existem. Não precisa de mudança no app.
-- ============================================================================

-- 0) coluna
alter table contribuicoes add column if not exists regiao text;

-- 1) estado (nome por extenso OU sigla) -> macrorregião. Imutável e puro.
--    aceita com e sem acento, e a sigla de 2 letras, por segurança.
create or replace function public.regiao_do_estado(p_estado text)
returns text
language sql
immutable
as $$
  select case
    when e in ('acre','ac','amapá','amapa','ap','amazonas','am','pará','para','pa',
               'rondônia','rondonia','ro','roraima','rr','tocantins','to') then 'Norte'
    when e in ('alagoas','al','bahia','ba','ceará','ceara','ce','maranhão','maranhao','ma',
               'paraíba','paraiba','pb','pernambuco','pe','piauí','piaui','pi',
               'rio grande do norte','rn','sergipe','se') then 'Nordeste'
    when e in ('distrito federal','df','goiás','goias','go','mato grosso','mt',
               'mato grosso do sul','ms') then 'Centro-oeste'
    when e in ('espírito santo','espirito santo','es','minas gerais','mg',
               'rio de janeiro','rj','são paulo','sao paulo','sp') then 'Sudeste'
    when e in ('paraná','parana','pr','rio grande do sul','rs','santa catarina','sc') then 'Sul'
    else null
  end
  from (select lower(trim(coalesce(p_estado, ''))) as e) t;
$$;

-- 2) trigger: preenche regiao a partir de uf no insert e quando uf muda
create or replace function public.set_regiao_contrib()
returns trigger
language plpgsql
as $$
begin
  new.regiao := public.regiao_do_estado(new.uf);
  return new;
end $$;

drop trigger if exists trg_regiao_contrib on contribuicoes;
create trigger trg_regiao_contrib
  before insert or update of uf on contribuicoes
  for each row execute function public.set_regiao_contrib();

-- 3) backfill das contribuições já existentes
update contribuicoes set regiao = public.regiao_do_estado(uf) where uf is not null;

-- Relatório por região (exemplo):
--   select regiao, count(*) as contribuicoes
--     from contribuicoes where status = 'aprovada'
--    group by regiao order by contribuicoes desc;
