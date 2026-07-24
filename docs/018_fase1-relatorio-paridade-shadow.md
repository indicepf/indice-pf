# Fase 1 — Relatório de paridade shadow × legado

Data: 24/07/2026. Execução: `publicar_snapshot_shadow` acionada via REST (service role) para os 23 snapshots de produção; paridade por prato calculada client-side em leitura (a função SQL da 42 tinha o defeito corrigido pela migração 43, abaixo). Escrita ocorreu SOMENTE nas tabelas shadow (`dish_cost_components`, `shadow_publicacoes`, `pipeline_runs`); nenhum fato legado foi tocado.

## Resultado por grupo de snapshots

### A. Regime antigo — 18 snapshots (04/03 a 17/06, legado R$ 0,91)

`precos` desses snapshots não tem `ingrediente_id` (coleta antiga por nome). O shadow então só encontra manual/custo fixo do cadastro atual e produz R$ 1,60 constante em todos. **Classificação: `provenance_status=unavailable` — não reproduzíveis.** Consistente com o corte de produto já existente (21/06) e com a recomendação da Fase 5: o trecho canônico começa em 21/06; o anterior fica rotulado como legado.

### B. Snapshots 33 (01/07) e 34 (09/07) — gate recusou publicar

Causa: **linhas duplicadas em `precos`** para o ingrediente 1138 (Matambre bovino):

| Snapshot | Linha original | Linha regravada |
|---|---|---|
| 33 | id 1305, sem mediana, 02/07 | id 1453, R$ 41,90, 12/07 21:33 |
| 34 | id 1446, sem mediana, 09/07 | id 1456, R$ 44,90, 12/07 21:33 |

Uma regravação em 12/07 inseriu segunda linha em vez de substituir — instância real de PUB-004/PUB-006 (mutação pós-coleta sem atomicidade). Impacto no legado: o prato 85 (único que usa o 1138) tem o ingrediente contado duas vezes pelo `left join` do motor legado nesses dois snapshots. O gate shadow recusando é o comportamento correto (snapshot com defeito de dados não publica).

**Remediação (decisão pendente do responsável, é mutação de produção):** não deletar (append-only); a supersessão formal da Fase 2 é o caminho. Após remediar, criar `unique (snapshot_id, ingrediente_id)` em `precos` para impedir recorrência.

### C. Snapshots do regime novo publicados — 32 (21/06), 36 (13/07), 37 (20/07)

| Snapshot | Mediana shadow | Mediana legado | Pratos divergentes ≥ R$ 0,01 | Maiores divergências (prato: shadow − legado) |
|---|---:|---:|---:|---|
| 32 | 15,61 | 15,45 | 98/101 | 63: +15,58 (legado 0) · 75: +5,53 · 54: +2,21 |
| 36 | 14,41 | 14,61 | 99/101 | 63: +13,49 (legado 0) · 38: −12,59 · 71: −1,45 |
| 37 | 14,69 | 14,64 | 85/101 | 63: +13,87 (legado 0) · 75: +7,57 · 54: +3,45 |

Interpretação — isto **não é bug do shadow**; é a medição direta de IDX-002 (passado mutável): o shadow congela o cadastro de HOJE, o legado congelou o de cada integração. Destaques:

- **Prato 63 com custo legado 0**: na integração faltava preço e o motor gravou 0 — que entrou na mediana persistida (IDX-009). O cadastro atual cobre o prato (~R$ 13–15).
- **Prato 75, +R$ 7,57 no snapshot 37**: a mesma divergência que a auditoria mediu no Simulador (R$ 7,55) — confirmação independente pela decomposição canônica.
- A partir do próximo snapshot, se a publicação shadow rodar NO MOMENTO da integração, a verdade da época fica congelada e a divergência esperada passa a ser zero.

## Defeito encontrado e corrigido nesta execução

`verificar_paridade_shadow` (migração 42) colocava o filtro de snapshot no `ON` do `FULL OUTER JOIN`; em full join isso não filtra o lado direito e os custos de todos os outros snapshots entravam como linhas órfãs. **Migração 43** corrige (filtro em subconsulta). Regressões adicionadas ao teste isolado: vazamento entre snapshots e o caso real de preço duplicado (recusa + rollback).

## Próximos passos

1. Aplicar a **migração 43** no SQL Editor (só `create or replace` da função de paridade).
2. Decidir a remediação das duplicatas dos snapshots 33/34 (supersessão na Fase 2; interim: permanecem sem publicação shadow, corretamente).
3. Próximo pacote: acionar `publicar_snapshot_shadow` automaticamente após cada `integrar_snapshot` (migração futura, com o mesmo padrão de teste isolado), congelando a verdade no momento da integração.
4. Fase 2 (governança da coleta): identidades imutáveis de observação/estimativa/resolução e supersessão formal.
