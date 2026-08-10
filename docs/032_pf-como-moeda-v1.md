# "PF como moeda" v1 — o PF como unidade de conta

Data: 10/08/2026. Implementação do doc `031_indice-pf-como-numerario.html`, depois das decisões D1–D5.

## Decisões tomadas (fecham o doc 031)

| # | Decisão | Efeito |
|---|---|---|
| D1 | Só o **PF de insumo**, rotulado como tal | Sem seletor de unidade e sem campo novo em `/contribuir` nesta fase |
| D2 | Rótulo **"PF como moeda"** | Aba em `/evolucao`, ao lado de Laboratório |
| D3 | **Aba fechada de admin**, não rota pública | Sem SEO/OG; sem revisão de `lib/server/autorizar.ts` além de mais uma rota sob `exigirAdmin` |
| D4 | Comparativo **Índice PF × IPCA entra**, dentro da aba fechada | O risco de leitura errada cai porque não há audiência pública |
| D5 | Série **retropolada entra como contexto visual**, dentro da aba fechada | Linha tracejada rotulada "não medido"; nenhuma afirmação numérica sai dela |

Nada desta aba vai para a área pública.

## Duas correções ao doc 031

Os códigos de fonte citados no doc 031 eram indicativos. Verificados contra a API antes de escrever importador:

1. **Renda nominal, não real.** A tabela SIDRA 6472 traz as duas variáveis; a "real" vem deflacionada a preços do trimestre de referência. Dividir um custo de PF corrente por renda deflacionada mistura bases. Usa-se a variável **5929 (nominal)**.
2. **Rendimento por décimo não existe na PNAD trimestral por região** — só na anual, e a tabela anual de R$/hora (10252) cobre apenas 2022–2024 e exclui setor público e militares. O corte por décimo foi trocado por **renda média ÷ horas habituais** do trimestre corrente, que dá R$/hora direto e cobre 2012Q1→hoje, Brasil, 5 regiões e UF. O corte por décimo pode voltar depois como série anual separada.

SINAPI e os demais bens (carro, imóvel, aluguel) seguem fora, como o doc 031 já previa.

## Fontes verificadas (chamada real, período mais recente)

| Série | Endpoint | Último dado na verificação |
|---|---|---|
| `ouro` | Yahoo Finance `GC=F` | 10/08/2026, US$ 4.391,60/onça |
| `pnad_renda*` | SIDRA 6472 v/5929, n1+n2 | 1º tri 2026, R$ 3.722 (Brasil) |
| `pnad_horas*` | SIDRA 6371 v/8186 c2/6794, n1+n2 | 1º tri 2026, 39,2 h/semana (Brasil) |

`salario_minimo`, `dolar`, `euro` e `dieese_cesta` já estavam no banco e não exigiram trabalho.

## O que mudou

**Ingestão** (`app/api/cron/importar-preditores/route.ts`):

- `importarOuro` — fechamento do GC=F (US$/onça troy) × PTAX do mesmo dia ÷ 31,1035, gravado em **R$/grama**. Pregão em NY sem PTAX (feriado bancário só aqui) usa a última cotação anterior; pregão anterior ao primeiro PTAX conhecido é descartado, não extrapolado. Roda encadeado depois do dólar, porque lê a PTAX já gravada.
- `importarPnad` — 6472/5929 e 6371/8186, Brasil + 5 Grandes Regiões, 12 chaves (`pnad_renda`, `pnad_renda_<região>`, `pnad_horas`, `pnad_horas_<região>`). Trimestre gravado no dia 01 do seu primeiro mês (202601 → 2026-01-01). Sem interpolação para os meses do meio do trimestre: o valor do trimestre é o valor vigente até o próximo sair.

`lib/server/fontes-config.ts`: as três fontes entram como **não essenciais** (falha vira `parcial`, não derruba o job), e o tipo `frequencia` ganhou `'trimestral'`. Versão da config: 1 → 2.

`lib/preditores.ts`: `ouro` entra no catálogo do overlay (diária, R$, grupo "Câmbio e mercado"). As séries da PNAD **ficam de fora** do catálogo de preditores de propósito — são insumo de conversão, não regressor; entrar ali as colocaria no menu do overlay mensal com 2 de cada 3 meses vazios.

**Conversão** (`lib/numerario.ts`, puro e client-safe):

- `converter(custoPF, valor, sentido)` — `pfs_por_unidade` (quantos PFs o bem compra) e `unidades_por_pf` (quanto vale 1 PF na unidade do bem).
- `minutosDeTrabalho(custoPF, rendaMensal, horasSemana)` — `SEMANAS_MES = 365,25 ÷ 12 ÷ 7`, para não herdar o viés de meses de 4 ou 5 semanas.
- `CONVERSORES` — salário mínimo, cesta DIEESE, dólar, euro, ouro.
- `seriePnad`/`REGIOES_PNAD` — grafia canônica das regiões do app → sufixo da série.
- Regra central: entrada ausente, zero, negativa ou não-finita devolve **`null`**, nunca `0`. "Não sei" e "zero PFs" são leituras opostas.

**Rota** `app/api/numerario/route.ts` sob `exigirAdmin` (ADR `docs/015`): resolve o valor vigente (última observação ≤ `ate`) dos 5 conversores e das 12 séries da PNAD. O custo do PF **não** vem daqui — o cliente já o tem carregado.

**UI** `app/(app)/evolucao/PFComoMoeda.tsx`:

- Seletor de recorte: nacional, 5 regiões (mediana dos pratos da região, a mesma definição da aba Variação) e cada prato.
- Cards de conversão + card de tempo de trabalho. Prato regional herda a renda da sua região; sem dado da região cai no agregado Brasil **e diz isso**.
- Gráfico "quantos PFs um salário mínimo compra": linha tracejada reconstruída (rotulada "não medido") + linha medida.
- Gráfico "Índice PF × IPCA" **só sobre o índice medido**. A série reconstruída é construída aplicando as variações dos itens do IPCA à cesta-âncora; compará-la com o IPCA seria circular. Com menos de dois meses medidos pareados o gráfico dá lugar a um texto que diz o que falta — não desenha reta em zero.

## Verificação

- `tests/numerario.test.ts` (30 casos): sentido de cada conversão, reciprocidade, ancoragem em número conhecido (Brasil 1T2026 → ~44 min para um PF de R$ 16), formatação, mapa de regiões e — o principal — que toda entrada ausente/zero/negativa/NaN/infinita vire `null`.
- `tests/api-autorizacao.test.ts`: `/api/numerario` responde 401 anônima com `private, no-store`, 400 em data fora de AAAA-MM-DD, `null` (não zero) para série sem observação na janela, e valor vigente quando existe.
- Suíte total: **95/95**. `tsc --noEmit` sem erro novo (os de `tests/linguagem-benchmark-export.test.ts` são pré-existentes). Build ok, `/api/numerario` registrada como dinâmica.
- Transformações conferidas a seco contra a resposta real das APIs antes de qualquer escrita: ouro 10/08/2026 → R$ 719,00/g (carry-back da PTAX de 07/08 funcionando); PNAD → 12 linhas em 6 séries por tabela, datas no dia 01 do trimestre.

## Passos de aplicação em produção (pendentes, do usuário)

1. Rodar `supabase/migrations/supabase_migration_53.sql` no SQL Editor — só metadados das 13 séries novas em `factor_series`. **Verificar depois de aplicar** (já houve migração que não pegou na 1ª tentativa, duas vezes): a query de conferência está comentada no fim do arquivo, esperado 13 linhas com `origem = 'seed'`.
2. Deploy e disparo manual do cron: `GET /api/cron/importar-preditores` com `Authorization: Bearer <CRON_SECRET>`. Verificar `fontes.ouro`, `fontes.pnad_renda` e `fontes.pnad_horas` com `ok: true` na resposta, e linhas em `fatores_preditores`.

A aba funciona antes disso, mas com travessão em ouro e em tempo de trabalho — que é exatamente o comportamento pretendido para dado ausente.
