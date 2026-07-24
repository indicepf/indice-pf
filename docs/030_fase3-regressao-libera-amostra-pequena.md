# Fase 3 — regressão liberada para amostra pequena

Data: 24/07/2026. Decisão explícita do responsável (não uma ADR entre alternativas — instrução direta, com ciência das limitações registrada): destravar a geração do modelo OLS mesmo abaixo do gate prudencial da Fase 0 (`docs/014` §12).

## O que mudou

`lib/regressao.ts`: a trava deixou de ser o gate prudencial (`max(30, 10×parâmetros)`) e passou a ser só o **piso matemático** (`n ≥ p+1`, garantindo `gl ≥ 1`) — sem isso `sigma² = rss/gl` e `r2Ajustado`/`F` viram `NaN`/`Infinity`, não é uma questão de prudência, é indefinição numérica.

Abaixo do prudencial (mas acima do matemático), o modelo **é gerado normalmente** e o resultado ganha `avisoAmostra: string`, não-bloqueante, explicando o tamanho da amostra e o mínimo que seria recomendado. Acima do prudencial, `avisoAmostra: null`.

A rotulagem exploratória da Fase 0C (`"Associação exploratória (OLS na amostra)"`, sem `"Previsto"`, sem destaque verde de p-valor) **não mudou** — decisão do responsável foi sobre liberar a geração com poucos dados, não sobre remover o contexto de que é exploração informal. Princípio 8 do super prompt (não chamar associação de causalidade/previsão) segue valendo.

## UI

`IndicePainel.tsx`: o modal do modelo mostra `avisoAmostra` em destaque (quando presente), acima dos resultados; o texto copiável/WhatsApp (`textoModelo`) também carrega o aviso, para não se perder se o resultado for compartilhado fora do app.

## Verificação

`tests/linguagem-benchmark-export.test.ts` reescrito: `n < p+1` ainda bloqueia com erro de piso matemático; `n=23` (abaixo do prudencial 30, 1 preditor) gera modelo com `avisoAmostra` e coeficientes corretos; `n=35` com 3 preditores (abaixo do prudencial 40) gera sem `NaN`/`Infinity` (`gl=31`); `n=40` (acima do prudencial) gera sem aviso. Suíte total: 63/63. Build e lint sem regressão (`IndicePainel.tsx`: 23 pré-existentes; `regressao.ts`: 6 pré-existentes — nenhum novo).

## Sem passo de aplicação em produção

Pacote é só código de aplicação, sem migration.
