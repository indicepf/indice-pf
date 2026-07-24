# Fase 3 — Pacote 4: retropolação sobre componentes canônicos (implementação)

Data: 24/07/2026. Decisão aprovada em `docs/027`. Implementa LAB-003/LAB-007.

## O que mudou em `/api/indice-retropolado`

- **Fonte única**: `dish_cost_components` (Fase 2). `precos` e `receitas` deixaram de ser lidos nesta rota — o custo, a fonte efetiva e o ingrediente já vêm resolvidos do componente canônico.
- **Sem pesos/renormalização**: cada componente é projetado individualmente — `custo_componente(m) = custo_componente(âncora) × razão_da_série(m)`. A soma por prato já é proporcionalmente correta.
- **Residual congelado** (decisão aprovada): componente `custo_fixo` ou ingrediente sem entrada em `MAPA_INGREDIENTE_IPCA` mantém `razão=1` em todos os meses — nunca deflacionado, nunca redistribuído.
- **Gate de âncora ganha um 4º critério**: candidato precisa ter uma publicação shadow (`shadow_publicacoes` + `dish_cost_components` não vazio); sem isso é rejeitado com motivo explícito (`gate.versao` subiu para 2) e o próximo candidato por data é tentado.
- **Cobertura reformulada**: `por_item_pct` (item específico), `por_grupo_pct` (novo — antes ficava implícito), `residual_nao_deflacionado_pct` (novo — declara o que fica congelado). `resolucao.residualCongelado` detalha `custoFixoPct`, `semMapeamentoPct` e os IDs sem mapeamento.

## Consequência esperada nos números

A série reconstruída muda de valor (mudança metodológica deliberada, não regressão): ingredientes manuais/blend agora participam corretamente da deflação quando mapeados; o que não tem base de deflação (custo fixo, sem item) para de ser silenciosamente redistribuído sobre o que tem.

## Verificação

- `tests/indice-retropolado.test.ts`: reescrito para fixturas com `dish_cost_components`/`shadow_publicacoes` (online + **manual mapeado** + `custo_fixo` sem mapa, somando exatamente o custo do snapshot legado). Novo teste comprova que o componente congelado não varia mês a mês enquanto os deflacionados variam pela caminhada de razão (valores derivados, não hardcoded). Novo teste do gate cobre snapshot com legado válido mas sem shadow (rejeitado, motivo explícito). Todos os testes de gap/fallback/group-by-policy/gate pré-existentes passam inalterados (comportamento independente desta mudança). 12/12 no arquivo; suíte total 47/47.
- `LabPreditores.tsx`: tipo de `porIng.cobertura` estendido; texto da UI atualizado para mencionar o residual congelado quando presente.
- Build e lint sem regressão.

## Sem passo de aplicação em produção

Pacote é só código de aplicação, sem migration.

## Próximos pacotes da Fase 3

- Protocolo de painel balanceado do DIEESE (ADR — decisão metodológica separada, ainda pendente).
- Backtest dos métodos no trecho observado (item 8).
- Protocolo de benchmark (item 10) — nMin já definido na Fase 0; itens adicionais (MAPE/MAD/bootstrap) do LAB-019 ainda pendentes.
- Aplicar a migração 51 (DIEESE por capital) em produção — segue pendente desde o pacote 2.
