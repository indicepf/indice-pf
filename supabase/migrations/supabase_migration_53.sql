-- ============================================================================
-- Migração 53 — séries da aba "PF como moeda" no registry (docs/031)
-- Rode no SQL Editor do Supabase. Idempotente. (depende da 50: factor_series)
--
-- Só metadados. O gatilho da migração 50 já registra qualquer série nova em
-- factor_series na primeira observação, mas com origem 'auto' e label/unidade
-- nulos — o que degrada o registry construído na Fase 3. Aqui as 13 séries
-- novas entram com metadado completo, na ordem que for: se o cron rodar antes
-- desta migração, o update abaixo promove a linha 'auto' para 'seed'.
--
-- ouro: US$/onça troy (Yahoo GC=F) × PTAX do dia ÷ 31,1035, gravado em R$/g.
-- pnad_*: PNAD Contínua trimestral (SIDRA 6472 v/5929 e 6371 v/8186), Brasil e
-- Grandes Regiões, trimestre no dia 01 do seu primeiro mês. O rendimento é o
-- NOMINAL habitual: a variável "real" vem deflacionada a preços do trimestre
-- de referência e não divide um custo de PF corrente.
-- ============================================================================

insert into factor_series (serie, label, categoria, unidade, granularidade, fonte, origem) values
  ('ouro',                     'Ouro',                              'Macro', 'R$/g',    'diaria',     'yahoo_gcf',  'seed'),
  ('pnad_renda',               'Rendimento habitual — Brasil',       'PNAD',  'R$/mês',  'trimestral', 'sidra_6472', 'seed'),
  ('pnad_renda_norte',         'Rendimento habitual — Norte',        'PNAD',  'R$/mês',  'trimestral', 'sidra_6472', 'seed'),
  ('pnad_renda_nordeste',      'Rendimento habitual — Nordeste',     'PNAD',  'R$/mês',  'trimestral', 'sidra_6472', 'seed'),
  ('pnad_renda_sudeste',       'Rendimento habitual — Sudeste',      'PNAD',  'R$/mês',  'trimestral', 'sidra_6472', 'seed'),
  ('pnad_renda_sul',           'Rendimento habitual — Sul',          'PNAD',  'R$/mês',  'trimestral', 'sidra_6472', 'seed'),
  ('pnad_renda_centro_oeste',  'Rendimento habitual — Centro-oeste', 'PNAD',  'R$/mês',  'trimestral', 'sidra_6472', 'seed'),
  ('pnad_horas',               'Horas habituais — Brasil',           'PNAD',  'h/semana','trimestral', 'sidra_6371', 'seed'),
  ('pnad_horas_norte',         'Horas habituais — Norte',            'PNAD',  'h/semana','trimestral', 'sidra_6371', 'seed'),
  ('pnad_horas_nordeste',      'Horas habituais — Nordeste',         'PNAD',  'h/semana','trimestral', 'sidra_6371', 'seed'),
  ('pnad_horas_sudeste',       'Horas habituais — Sudeste',          'PNAD',  'h/semana','trimestral', 'sidra_6371', 'seed'),
  ('pnad_horas_sul',           'Horas habituais — Sul',              'PNAD',  'h/semana','trimestral', 'sidra_6371', 'seed'),
  ('pnad_horas_centro_oeste',  'Horas habituais — Centro-oeste',     'PNAD',  'h/semana','trimestral', 'sidra_6371', 'seed')
on conflict (serie) do update set
  label         = excluded.label,
  categoria     = excluded.categoria,
  unidade       = excluded.unidade,
  granularidade = excluded.granularidade,
  fonte         = excluded.fonte,
  origem        = excluded.origem
where factor_series.origem = 'auto';

-- verificação (esperado: 13 linhas, todas com origem 'seed')
-- select serie, label, unidade, granularidade, origem from factor_series
-- where serie = 'ouro' or serie like 'pnad_%' order by serie;
