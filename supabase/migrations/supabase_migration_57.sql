-- ============================================================================
-- Migração 57 — preço manual efetivo volta a ser a MEDIANA das leituras
-- Rode no SQL Editor do Supabase. Idempotente.
--
-- PROBLEMA. `refresh_precos_manuais()` (migração 16, mantida pela 38) define o
-- preço manual efetivo como
--     coalesce( mediana das leituras dos últimos 5 dias,
--               ÚLTIMA leitura registrada )
-- e é chamada em toda integração de snapshot. Como as leituras de campo são
-- semanais/quinzenais, a janela de 5 dias quase nunca pega nada e o efetivo cai
-- no segundo braço: a última linha digitada — não a mediana das lojas do dia.
--
-- Efeito: o valor certo é gravado na hora (`salvar_leitura_manual` usa a
-- mediana dos 5 dias) e depois SOBRESCRITO pelo refresh da integração seguinte,
-- pela leitura mais recente, que é uma loja qualquer do lote.
--
-- Medido em 24/08/2026: 29 dos 73 ingredientes com preço manual não eram a
-- mediana do lote de campo. Exemplos (leituras do mesmo dia → efetivo hoje):
--   Coxão mole bovino  42,90 / 57,99 / 59,90 / 115,98 (10/08) → 115,98 (+100%)
--   Frango inteiro     9 leituras em 11/08, mediana 43,90   → 59,80  (+36%)
--   Pimenta (fresca)   4 leituras em 11/08, mediana 49,95   → 21,99  (−56%)
--   Vinagre            3 leituras em 05/08, mediana 11,45   → 3,72   (−68%)
-- O preço manual entra no índice em blend 50/50 com o online, então cada um
-- desses erros vai direto para `custos_pratos`.
--
-- SEGUNDO DEFEITO (mesma função). O `where exists (leituras)` faz o refresh
-- ignorar ingrediente que ficou SEM nenhuma leitura: apagar a última leitura em
-- /admin não limpa `ingredientes.preco_manual`, e o valor órfão continua no
-- blend para sempre. Foi o caso da Merluza (filé): a leitura de 0,04 R$/kg
-- (contribuição 220, peso_g digitado como 800000 em vez de 800) foi apagada em
-- 24/08/2026 e o 0,04 continuou valendo no ingrediente.
--
-- ESCOPO. Só a função. NÃO reintegra snapshot nenhum: `custos_pratos` já
-- gravado não muda, e o efeito aparece na próxima coleta (simulado no snapshot
-- 42: mediana 15,46 → 14,97). Reintegrar os snapshots recentes para não deixar
-- degrau na série é decisão separada.
-- ============================================================================

create or replace function public.refresh_precos_manuais()
returns void
language sql
security definer
set search_path = public
as $$
  -- 1. efetivo = mediana das leituras recentes; sem leitura recente, mediana
  --    das leituras do DIA MAIS RECENTE que tem leitura (o lote de campo),
  --    nunca a última linha digitada
  update ingredientes ing set preco_manual = sub.efetivo
  from (
    select i.id,
      coalesce(
        (select percentile_cont(0.5) within group (order by h.preco_manual)
           from precos_manuais_hist h
          where h.ingrediente_id = i.id and h.preco_manual is not null
            and h.criado_em >= now() - interval '5 days'),
        (select percentile_cont(0.5) within group (order by h.preco_manual)
           from precos_manuais_hist h
          where h.ingrediente_id = i.id and h.preco_manual is not null
            and (h.criado_em at time zone 'America/Sao_Paulo')::date = (
              select max((h2.criado_em at time zone 'America/Sao_Paulo')::date)
                from precos_manuais_hist h2
               where h2.ingrediente_id = i.id and h2.preco_manual is not null))
      ) as efetivo
    from ingredientes i
    where exists (select 1 from precos_manuais_hist h
                   where h.ingrediente_id = i.id and h.preco_manual is not null)
  ) sub
  where ing.id = sub.id and sub.efetivo is not null;

  -- 2. sem nenhuma leitura, não há preço manual: o ingrediente vale só o online
  update ingredientes ing set preco_manual = null
   where ing.preco_manual is not null
     and not exists (select 1 from precos_manuais_hist h
                      where h.ingrediente_id = ing.id and h.preco_manual is not null);
$$;

select public.refresh_precos_manuais();

-- conferência: nenhuma linha deve sobrar (efetivo != mediana do lote do dia)
select i.nome, i.preco_manual as efetivo, m.mediana_do_dia
from ingredientes i
join lateral (
  select percentile_cont(0.5) within group (order by h.preco_manual) as mediana_do_dia
  from precos_manuais_hist h
  where h.ingrediente_id = i.id and h.preco_manual is not null
    and (h.criado_em at time zone 'America/Sao_Paulo')::date = (
      select max((h2.criado_em at time zone 'America/Sao_Paulo')::date)
        from precos_manuais_hist h2
       where h2.ingrediente_id = i.id and h2.preco_manual is not null)
) m on true
where i.preco_manual is not null
  and abs(i.preco_manual - m.mediana_do_dia) > 0.01
  and not exists (select 1 from precos_manuais_hist h
                   where h.ingrediente_id = i.id and h.preco_manual is not null
                     and h.criado_em >= now() - interval '5 days')
order by abs(i.preco_manual - m.mediana_do_dia) desc;
