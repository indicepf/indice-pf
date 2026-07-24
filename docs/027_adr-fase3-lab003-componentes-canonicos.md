# ADR Fase 3 — LAB-003: retropolação sobre componentes canônicos

Data: 24/07/2026. Base: auditoria `docs/014` Fase 3 item 5; achados LAB-003, LAB-007. Decisão aprovada pelo responsável via pergunta direta em 24/07/2026 (mudança que altera o número publicado — parada exigida pelo princípio 12 do super prompt).

## Problema

`/api/indice-retropolado` reconstruía pesos usando só `precos` (preço online) × `receitas` (quantidade), ignorando ingredientes com custo manual, blend ou `custo_fixo`. O fator resultante era renormalizado sobre o `custoAncora` real (que inclui os componentes ignorados) — redistribuindo silenciosamente a parte não rastreada sobre a parte rastreada (LAB-003). A cobertura reportada também não batia com o custo real calculado (LAB-007).

## Decisão

Reescrever a rota para consumir `dish_cost_components` (Fase 2, migração 48) diretamente: cada componente já é um valor em R$ com fonte efetiva conhecida (`custo_fixo`/`blend`/`manual`/`online`).

- **Sem pesos/renormalização.** Cada componente é projetado individualmente: `custo_componente(m) = custo_componente(âncora) × ratio_serie(m)`. A soma por prato já é proporcionalmente correta, sem precisar de peso normalizado.
- **Residual congelado (decisão aprovada).** Componente `custo_fixo` OU ingrediente sem entrada em `MAPA_INGREDIENTE_IPCA` mantém `ratio=1` em todos os meses — nominal, nunca deflacionado, nunca redistribuído sobre o resto.
- **Componente com mapeamento IPCA** (qualquer `fonte_efetiva`) é deflacionado pela série do item (ou pelo grupo, se excluído pelo filtro de confiança — `group_by_policy`, como já era).
- **Cobertura passa a refletir o custo real**: `por_item_pct` = % do custo-âncora deflacionado por item específico (mesma definição de antes); novo `residual_nao_deflacionado_pct` = % do custo-âncora que fica congelado (declarado, nunca escondido).
- **`precos`/`receitas` deixam de ser lidos nesta rota**: o custo, a fonte efetiva e o ingrediente já vêm de `dish_cost_components`. Menos consultas, uma fonte só.
- **Gate de âncora ganha um quarto critério**: o candidato precisa ter pelo menos uma publicação shadow (`dish_cost_components` não vazio) além dos três critérios já existentes (conjunto completo, custo positivo, mediana reconciliada). Sem isso, é rejeitado e o próximo candidato é tentado — nunca há fallback silencioso para o cálculo antigo.

## Alternativa rejeitada

Manter a renormalização atual usando pesos reais (só corrigir os pesos, preservando a suposição de que o não-rastreado se move igual ao rastreado) — descartada por perpetuar uma hipótese sem base (por que o custo fixo do negócio acompanharia a inflação de alimentos?).

## Consequências

- O valor da série reconstruída muda (não é mudança de bug de implementação, é correção metodológica deliberada — documentada aqui, não silenciosa).
- Séries com alta proporção de `custo_fixo`/ingrediente não mapeado ficam mais estáveis no passado (menos coisa é deflacionada), o que é o comportamento honesto esperado.
- Snapshots publicados no shadow em `docs/018`/pacotes seguintes da Fase 2 já são compatíveis; snapshots sem publicação shadow (histórico pré-Fase-1/2, ou aqueles que falharam no shadow) não podem ancorar — comportamento correto dado que não há componente canônico para projetar.
