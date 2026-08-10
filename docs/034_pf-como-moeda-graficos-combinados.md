# "PF como moeda" v2 — gráficos combinados e troca de variáveis com a aba Índice

Data: 10/08/2026. Continuação de `docs/032_pf-como-moeda-v1.md`.

## O que foi pedido

1. Poder desenhar qualquer variável da aba, e combinar mais de uma no mesmo gráfico, clicando nos cards.
2. Levar as variáveis da aba Índice para cá, e as daqui para lá.

## Decisões tomadas

| # | Decisão | Efeito |
|---|---|---|
| E1 | Escala comum com botão **base 100 / z-score** | Com uma linha só, desenha na unidade original e o botão some |
| E2 | Tempo de trabalho **entra como linha**, expondo as séries da PNAD | Reverte a exclusão da v1: as 12 chaves `pnad_*` entram em `PREDITORES` |
| E3 | Da "PF como moeda" para a aba Índice vão a **PNAD** (série nova no menu) e o **índice em outra unidade** (seletor de unidade do eixo) | As conversões do PF **não** viram overlay do índice: são o próprio índice dividido por uma cotação, e sobrepô-las seria redundante (regredir, circular) |

Assumido sem perguntar: a série reconstruída (D5) só aparece com **um** card ligado; com várias linhas ela deixaria de ser lida como pano de fundo. O gráfico combinado é sempre **nacional**, porque a série reconstruída só existe no agregado do país — os cards continuam seguindo o recorte.

## Leitura de série trimestral (a correção que o dado exigiu)

A regra do painel mensal era: série mensal casa pelo mês de referência exato, sem carry-forward, porque repetir o último mês publicado afirmaria uma variação que o IBGE não divulgou. Aplicada à PNAD, essa regra **apagava a linha inteira**: a última observação é 1T2026 (carimbo 01/2026) e o índice medido começa em 06/2026.

A PNAD não é um fluxo mensal — é um **nível vigente no trimestre**, e o próprio `docs/032` já registrava isso ("o valor do trimestre é o valor vigente até o próximo sair"). `lerNoMes` passa a distinguir:

- **mensal** (IPCA, DIEESE, salário mínimo): mês exato, como antes;
- **trimestral** (PNAD): a observação vale pelos meses em que o trimestre está vigente, até **`ALCANCE_TRIMESTRAL = 8` meses** do carimbo.

O 8 sai da cadência real: o carimbo é o 1º mês do trimestre, o IBGE publica o trimestre seguinte ~2 meses depois de ele fechar, então 1T2026 é legitimamente a observação mais recente até meados de agosto. Além de 8 meses a fonte está parada, e a série vira buraco em vez de reta indo até hoje.

## O que mudou

`lib/preditores.ts`: granularidade `'trimestral'`, grupo `Renda (PNAD)` com as 12 chaves, `PREDITORES_MENSAIS` passa a ser "tudo que não é diário", `lerNoMes`/`estenderTrimestral`/`ALCANCE_TRIMESTRAL`. Com as chaves no catálogo, `/api/preditores` (que só serve chave conhecida) passa a servi-las — nenhuma mudança na rota.

`lib/numerario.ts`: `UNIDADES` (reais + 5 conversores + tempo), `valorNaUnidade`, `fmtNaUnidade`, `fmtEixo`. É a lista compartilhada pelos cards de uma aba e pelo seletor de unidade da outra. `inverte` marca as unidades em que a curva **sobe quando o PF fica mais barato** ("PFs por salário mínimo", "PFs por cesta") — é o que decide a troca de mín por máx na faixa do gráfico.

`lib/stats.ts`: `escalador(vs, 'base100' | 'z')`. Devolve `null`, não 0, quando a reescala não é definível (um ponto só ou série constante em z-score) — desenhar 0,0σ diria "está na média", que é diferente de "não dá para saber".

`PFComoMoeda.tsx`: cards viram botões; um gráfico só, dirigido pela seleção; menu `SeletorSeries` com o catálogo inteiro da aba Índice; botão base 100 / z-score quando há mais de uma linha; aviso nominal das séries que a escala não define. Séries diárias entram pela média do mês (a mesma agregação do índice mensal).

`IndicePainel.tsx`: seletor de unidade do gráfico principal (só admin). Cada ponto é convertido pela cotação vigente na data da coleta; ponto sem cotação some, não é estimado. Painel mensal, regressão e exportação **continuam em R$** — dito no InfoTip.

## Verificação

- `tests/numerario.test.ts` e `tests/stats.test.ts`: sentido e ausência-vira-null de `valorNaUnidade`, a lista `UNIDADES` (quem inverte), `escalador` nos dois modos e nos casos não-definíveis, e `lerNoMes`/`estenderTrimestral` incluindo o corte no alcance.
- `tests/api-autorizacao.test.ts`: `/api/preditores` passa a aceitar `pnad_renda`/`pnad_horas_*`.
- Suíte: **121/121**. `tsc --noEmit` sem erro novo (os de `tests/linguagem-benchmark-export.test.ts` são pré-existentes). `npm run build` ok.
- Conferência dos números contra o banco de produção (mediana só de pratos ativos, média do mês):

| mês | PF | PFs/salário mín. | PFs/cesta | US$/PF | g ouro/PF | tempo |
|---|---|---|---|---|---|---|
| 06/2026 | R$ 15,45 | 105 | 49,2 | 3,03 | 0,0222 | 42 min |
| 07/2026 | R$ 15,03 | 108 | — | 2,95 | 0,0225 | 41 min |
| 08/2026 | R$ 13,93 | 116 | — | 2,73 | 0,0201 | 38 min |

O travessão em 07 e 08 é o DIEESE, publicado até 06/2026: a linha fica com buraco, como manda a regra. O tempo de trabalho usa 1T2026 (R$ 3.722 / 39,2 h), dentro do alcance.

## Não verificado

A aba não foi aberta no navegador — a automação do Chrome está desligada nas configurações. O que foi conferido é a matemática contra o dado real, o build e a suíte; a checagem visual do layout dos cards e da legenda fica para a primeira vez que a aba for aberta.
