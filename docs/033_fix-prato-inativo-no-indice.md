# Prato inativo de volta no índice — regressão da migração 45

Data: 10/08/2026. Achado ao investigar a falha da aba Laboratório; o erro na tela era sintoma, não causa.

## O que aconteceu

A migração 38 (13/07/2026) excluía pratos inativos do custo e do índice: `join pratos pr on pr.id = r.prato_id and pr.ativo`, mais o delete das linhas de prato inativo que sobrassem no snapshot. As migrações 44/45 (24/07/2026) reescreveram `integrar_snapshot` partindo de `receitas join ingredientes` e **perderam o filtro**. `publicar_snapshot_shadow` nunca o teve.

O prato 63, "11. Estrogonofe de Carne Bovina", inativo desde a migração 37 (12/07/2026), voltou a `custos_pratos`, a `dish_cost_components` e à mediana publicada em `snapshots.custo_total_pf`.

| Snapshot | Data | `custo_total_pf` publicado | Mediana só dos 100 ativos |
|---|---|---|---|
| 37 | 20/07/2026 | 14,69 | 14,79 |
| 38 | 27/07/2026 | 13,85 | 13,76 |
| 39 | 03/08/2026 | 14,00 | 13,93 |

O snapshot 36 (13/07) tem `custos_pratos` correto mas componentes shadow contaminados — e era a âncora que o Laboratório estava usando.

O gate de `publicar_snapshot_shadow` não barrou porque testava só falta (`v_calculados < v_esperados`): 101 para 100 esperados passava.

Por que não apareceu antes: `getEvolucao` filtra pratos inativos no cliente, então a aba Histórico sempre mostrou os 100 certos. A divergência estava só no número gravado no banco — o que a home publica — e nos artefatos canônicos.

## Migração 54

1. `integrar_snapshot`: filtro `pr.ativo` restaurado no insert, delete das linhas de prato inativo, e a mediana de `custo_total_pf` passa a somar só prato ativo.
2. `publicar_snapshot_shadow`: mesmo filtro no insert de `dish_cost_components`, e o gate vira `v_calculados <> v_esperados` — prato a mais também é conjunto errado.
3. Limpeza dos snapshots com data ≥ 12/07/2026 (36, 37, 38, 39): apaga as linhas de prato inativo, recalcula `custo_total_pf` e republica o shadow numa **calc_version nova**. `dish_cost_components` e `shadow_publicacoes` são append-only (migração 42), então nada é apagado ali — a versão contaminada fica no histórico, como manda o append-only.

Ordem obrigatória: `custos_pratos` e `custo_total_pf` antes do shadow, porque a publicação grava `mediana_legado` lendo `custo_total_pf` e tem que ler o valor corrigido.

## Fora de escopo, de propósito

Snapshots 1–34 têm o prato 63 em `custos_pratos`, mas são anteriores a 12/07/2026, quando ele ainda estava na cesta. Ali a presença é história, não defeito. Reescrevê-los é decisão separada (supersessão de snapshot, Fase 5) e mexeria em período já classificado pela auditoria da Fase 1.

## Isto não destrava o Laboratório

Problema independente, encontrado na mesma investigação: a retropolação caminha do mês da âncora para trás e precisa da variação **do próprio mês da âncora**. O IPCA de um mês só é publicado por volta do dia 11 do mês seguinte, e a âncora é sempre o snapshot mais recente — que é sempre do mês corrente, porque a coleta é semanal.

Depois da migração 54 a âncora passa a ser o snapshot 39 (03/08), e a reconstrução vai pedir o IPCA de 08/2026, que sai ~11/09. Em setembro a âncora vira um snapshot de setembro, e assim por diante. A janela em que funciona é vazia.

Uma variação ausente no fim da série não é lacuna de dado: é defasagem de publicação, e merece tratamento diferente de um buraco no meio. Correção proposta (ainda não implementada, decisão pendente): exigir do gate de âncora que o mês do snapshot tenha deflator completo, caindo para o snapshot válido mais recente que satisfaça isso — hoje, um de junho.

## Verificação

As três queries de conferência estão comentadas no fim do arquivo da migração: nenhuma linha de prato inativo em `custos_pratos` a partir de 12/07, nenhuma publicação shadow com `pratos_calculados <> 100` no mesmo período, e 100 pratos por snapshot com o `custo_total_pf` recalculado.
