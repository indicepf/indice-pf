# Fase 3 — Pacote 2: DIEESE preservado por capital

Data: 24/07/2026. Base: auditoria `docs/014` Fase 3 item 4 (LAB-016); registry criado em `docs/024`.

## Estado verificado antes deste pacote (migração 50)

`factor_series`: 198 `catalogo` + 23 `seed` = 221, coerente com o anti-join. `factor_observations`: 30.621 = `fatores_preditores` (backfill como vintage 1, 1:1).

## Problema (LAB-016)

`importar-dieese` sempre calculou a mediana entre capitais no momento do parse e descartou os valores individuais. O painel de capitais que respondem muda mês a mês (o DIEESE nem sempre cobre todas), então a composição da mediana varia sem registro — entrada/saída de capital fica indistinguível de variação real de preço.

## O que este pacote entrega

**Migração 51** — `dieese_capital_observations` (append-only, RLS): destino para o valor de cada capital.
- Chave de dedup `(serie, capital, data, valor)`: reingestão idêntica não duplica; se o DIEESE **revisar** um valor, a linha nova é um fato distinto e a antiga sobrevive — vintage implícito pela própria chave, sem precisar de contador (mais simples que `factor_observations` porque aqui não existe "valor vigente" a manter sincronizado — o vigente continua sendo a mediana em `fatores_preditores`, inalterada).
- View `dieese_cobertura_capitais`: `n_capitais` e lista por série/mês — visibilidade imediata da composição.
- **Limite declarado**: não há backfill. A granularidade por capital nunca foi persistida; os meses já importados permanecem `provenance_status=unavailable` nessa dimensão. A partir do deploy desta mudança de código, toda nova ingestão preserva os capitais.

**Cron (`importar-dieese/route.ts`)**: `parseTabela` passa a capturar os nomes das capitais do cabeçalho da tabela e devolver `{ pontos, porCapital }`. `pontos` (mediana nacional → `fatores_preditores`) é **byte-idêntico** ao comportamento anterior — testado explicitamente. Gravação dos capitais é melhor esforço: falha não derruba o cron (a leitura vigente não depende disso), erro vai ao log.

## Verificação

- Vitest (`tests/dieese-capitais.test.ts`, 5 testes): parser extrai capitais do cabeçalho; célula `-` não vira observação (painel incompleto respeitado); HTML sem tabela retorna vazio; cron grava a mediana nacional inalterada E os capitais na tabela nova; falha ao gravar capitais não derruba o cron. Suíte total: 45/45.
- Postgres isolado (`scripts/test_migration_42.sh`, 14/14): reingestão idêntica não duplica; revisão de valor preserva o antigo e cria novo; view de cobertura conta os 3 fatos corretamente; append-only; FK exige série no registry.
- `npm run build` ok; lint sem novos erros.

## Ao aplicar a migração 51 em produção

Sem passo extra — o efeito começa na próxima execução do cron `importar-dieese`. Conferência após a próxima ingestão:

```sql
select * from dieese_cobertura_capitais order by serie, data desc limit 20;
```

## Próximos pacotes da Fase 3

- Protocolo de painel balanceado (ADR: quais capitais formam a série comparável entre meses) — decisão metodológica, não implementação.
- Retropolação lendo os componentes canônicos (`dish_cost_components`) em vez de reconstruir pesos a partir de `precos`/`receitas` soltos.
- `productKind=historical_extension | current_basket_backcast` no contrato/UI/exportação da retropolação.
- Backtest dos métodos no trecho observado; protocolo do benchmark.
