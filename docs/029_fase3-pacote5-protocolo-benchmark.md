# Fase 3 — Pacote 5: diagnósticos do protocolo de benchmark

Data: 24/07/2026. Base: auditoria `docs/014` LAB-019 (métricas insuficientes); Fase 3 item 10 (parcial). Sem ADR — métricas estatísticas padrão (viés, MAE, MAPE, MAD/IQR, IC por bootstrap), aditivas, não substituem nem mudam a classificação (`razaoMediana`/semáforo) já em produção.

## O que este pacote entrega

`lib/stats.ts` ganha `media`, `mad` (desvio absoluto mediano), `iqr` (quartis de Tukey, mesma convenção sem interpolação de `mediana`) e `bootstrapMedianCI` (IC percentil não paramétrico, `rng` injetável para teste determinístico via `mulberry32`).

`/api/confiabilidade` passa a incluir, por item comparável (`comparaveis.length > 0`), um bloco `diagnosticos`:
- `viesPct`: `(razaoMediana − 1) × 100` — sinal e magnitude do viés sistemático.
- `maeReais`/`mapePct`: erro absoluto médio em R$ e em %.
- `madRazao`/`iqrRazao`: dispersão da razão em torno da mediana (robusta a outliers).
- `bootstrapIC90Razao`: intervalo de confiança 90% por bootstrap da mediana da razão, só com `nMeses ≥ 8` (abaixo disso, `null` — sem falsa precisão; limiar distinto do `nMin=6` do semáforo em `lib/benchmark.ts`, que não muda).

UI (`LabPreditores.tsx`): o painel expandido de cada item (clique na linha) mostra a linha de diagnósticos acima do gráfico comparativo.

## Verificação

`tests/stats.test.ts` (12 testes): `mad`/`iqr` contra amostras calculadas à mão; bootstrap determinístico com seed fixa (mesma seed → mesmo intervalo; bounds sempre contêm a mediana real em amostra sintética; série constante dá intervalo degenerado no próprio valor; N<2 retorna `null`).

`tests/confiabilidade-diagnosticos.test.ts` (3 testes): N=0 não lança e retorna `diagnosticos=null`; N=6 com razão constante calcula viés/MAE/MAPE corretos e `madRazao=0`, mas `bootstrapIC90Razao=null` (N<8); N=8 com razão variável produz IC que contém a mediana observada.

Suíte total: 62/62. Build e lint sem regressão.

## Sem passo de aplicação em produção

Pacote é só código de aplicação, sem migration.

## O que fica pendente na Fase 3

- **Protocolo de painel balanceado do DIEESE** — decisão metodológica (ADR) ainda não tomada: quais capitais formam a série comparável entre meses, dado que a migração 51 agora preserva a composição real.
- **Backtest dos métodos** (item 8) — bloqueado por falta de histórico suficiente: a série medida canônica começa em 21/06/2026, período curto demais para validação out-of-sample honesta. Declarar como pendente até haver histórico suficiente é a escolha correta, não uma implementação prematura.
- **Estabilidade por regime** (LAB-019, restante) — depende do protocolo de painel do DIEESE acima.
