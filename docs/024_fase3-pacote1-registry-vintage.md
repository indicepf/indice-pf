# Fase 3 — Pacote 1: registry canônico de fatores e vintage

Data: 24/07/2026. Base: auditoria `docs/014` Fase 3 itens 1–2 (DB-004, FAC-012, FAC-015).

## Anti-joins executados em produção (exigência da FAC-015 antes de qualquer seed/FK)

Em 24/07/2026: fatos = 221 séries; catálogo = 198. `fatos EXCEPT catálogo` = 23 chaves, **todas fontes não-SIDRA conhecidas**: 14 `dieese_*`, `dolar`, `euro`, `selic`, `ipca`, `salario_minimo`, `bitcoin`, `ibovespa`, `ipca_alimentacao`, `ipca_alim_fora`. `catálogo EXCEPT fatos` = 0. Nenhum órfão real — a diferença 221−198 está integralmente explicada por chave.

## O que este pacote entrega (migração 50)

1. **`factor_series`** — registry único de toda série ingerida: seed do catálogo SIDRA (origem `catalogo`) + as 23 não-SIDRA com metadados conhecidos (origem `seed`). Série nova desconhecida é **auto-registrada** por trigger (origem `auto`): a ingestão nunca quebra por registry, e o registry nunca fica para trás — integridade referencial sem FK rígida que derrubaria o cron.
2. **`factor_observations`** — vintage append-only (FAC-012): o upsert de `fatores_preditores` sobrescreve revisões da fonte; agora cada valor é preservado como vintage por trigger. Upsert idêntico não gera vintage; revisão de valor gera o próximo vintage mantendo o anterior. Backfill dos ~30,6k valores vigentes como vintage 1. `fatores_preditores` segue sendo a leitura vigente (visão "vigente" = maior vintage ≡ tabela atual, por construção).
3. RLS + revoke + append-only nas duas tabelas, como as demais canônicas.

## Verificação

Suíte isolada 13/13 (50 aplicada 2×): registry cobre catálogo/seed/órfãos; backfill idempotente; upsert sem mudança não cria vintage; revisão preserva vintage 1 e grava vintage 2; série inédita na ingestão auto-registra sem quebrar; append-only.

## Ao aplicar a migração 50 em produção

```sql
select origem, count(*) from factor_series group by 1;      -- catalogo 198, seed 23 (auto 0)
select count(*) from factor_observations;                   -- ≈ count(*) de fatores_preditores
```

## Próximos pacotes da Fase 3

- DIEESE por capital/regime (o cron passa a preservar cada capital antes da mediana nacional; exige mudança no parser da rota + tabela própria).
- Freshness/gap por série usando `factor_series.granularidade` + `fontes-config` (gate de stale no Laboratório).
- Retropolação lendo `dish_cost_components` canônicos e `productKind=historical_extension | current_basket_backcast` no contrato/UI/exportação.
- Backtest dos métodos no trecho observado; só então reintroduzir envelope de sensibilidade; protocolo do benchmark.
