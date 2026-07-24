# Fase 3 — Pacote 3: productKind explícito na retropolação

Data: 24/07/2026. Base: auditoria `docs/014` §12 (decisão padrão) e Fase 3 item 6; sem migration, sem ADR (decisão já aprovada como padrão pela auditoria, não há ambiguidade a resolver).

## Estado verificado antes deste pacote

Migração 50 confirmada em produção. **Migração 51 (DIEESE por capital) não está aplicada** — `dieese_capital_observations`/`dieese_cobertura_capitais` retornam `PGRST205` (tabela/view inexistente). Não bloqueia este pacote (independente), mas precisa ser reaplicada.

## O que este pacote entrega

Todo método de retropolação hoje (por ingrediente e os agregados DIEESE/IPCA) ancora no **último** ponto medido e projeta a **cesta atual** para trás — nenhum é uma série medida contínua desde o passado. A auditoria já define isso como decisão padrão (`historical_extension` × `current_basket_backcast`, nunca colados silenciosamente). Como só existe uma construção hoje, aplicar o rótulo é etiquetagem, não escolha metodológica:

- `GET /api/indice-retropolado`: campo `productKind: 'current_basket_backcast'` no corpo (presente tanto em `status=ok` quanto `status=incomplete`).
- Exportação (`lib/export-reconstrucao.ts`): `productKind` na aba de metadados, antes de `method`.
- UI (`LabPreditores.tsx`): tooltip do painel "Índice PF reconstruído" explica que é backcast da cesta atual, não série medida contínua.
- `historical_extension` permanece **não implementado e não fabricado** — exigiria uma série ancorada no primeiro ponto do regime canônico (21/06/2026), que não existe nesta fase. Comentários no código deixam isso explícito para não ser confundido com omissão.

## Verificação

Testes atualizados (sem novos arquivos): `tests/indice-retropolado.test.ts` (ok e incomplete carregam `productKind`), `tests/linguagem-benchmark-export.test.ts` (golden de exportação). Suíte total 45/45 (sem novos casos, só asserções adicionadas). Build e lint sem regressão (11 erros pré-existentes em `LabPreditores.tsx`, inalterados).

## Sem passo de aplicação em produção

Pacote é só código de aplicação (rota + lib + UI), sem migration.

## Pendência que exige decisão (não implementada agora)

**LAB-003** — a retropolação por ingrediente hoje calcula pesos apenas com preço online × quantidade (`precos`/`receitas` reconstruídos ad hoc); ingredientes com custo manual, blend ou `custo_fixo` ficam de fora do peso e o fator resultante é renormalizado sobre o custo total — redistribuindo silenciosamente a parte não rastreada. Desde a Fase 2, `dish_cost_components`/`price_resolutions` guardam o custo real de cada ingrediente em cada prato, com a fonte efetiva (`custo_fixo`/`blend`/`manual`/`online`). Reescrever a retropolação para usar esses componentes canônicos é o próximo item natural (Fase 3 item 5) — mas há mais de uma forma metodológica de tratar a parte sem mapeamento IPCA (redistribuir vs. congelar como residual nominal), e isso muda o número publicado. Por isso o próximo passo é uma pergunta ao responsável, não uma implementação silenciosa (princípio 12 do super prompt).
