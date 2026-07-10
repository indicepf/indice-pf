# Índice PF

Índice do custo do prato feito brasileiro. Mede, coleta a coleta, quanto custa produzir cada um de 100 pratos regionais (5 regiões, ~115 ingredientes-base) a partir de preços reais do varejo online, e publica o resultado em um dashboard público.

**Produção:** [indicepratofeito.com.br](https://indicepratofeito.com.br)
**Documentação técnica completa:** [`docs/`](docs/) (HTML, um arquivo por fase do projeto)

---

## Sumário

- [Como o índice é calculado](#como-o-índice-é-calculado)
- [Arquitetura](#arquitetura)
- [Stack](#stack)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Rodando localmente](#rodando-localmente)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Pipeline de coleta](#pipeline-de-coleta)
- [Modelo de preço](#modelo-de-preço)
- [Banco de dados](#banco-de-dados)
- [Rotas da aplicação](#rotas-da-aplicação)
- [Automação (GitHub Actions)](#automação-github-actions)
- [Deploy](#deploy)
- [Scripts utilitários](#scripts-utilitários)

---

## Como o índice é calculado

1. **Coleta** — cada ingrediente-base tem um termo de busca no Google Shopping (via SerpAPI). Os produtos retornados passam por validação de título (`palavras_ok`/`palavras_nao`), limpeza de preço, normalização para R$/g e dois filtros estatísticos (sanidade `[mediana/4, mediana×4]` e outliers por IQR). O preço do ingrediente na coleta é a **mediana** dos preços normalizados.
2. **Custo por prato** — `custo = Σ (preço R$/g × quantidade da receita) + Σ custo fixo`, para cada um dos 100 pratos (receitas na tabela `receitas`).
3. **Índice nacional** — mediana dos custos dos 100 pratos da coleta. Índices regionais usam apenas os pratos da região.
4. **Três faixas de preço** exibidas no site: Online (coletado), Mercado e Atacarejo (percentuais de desconto sobre o online, calibrados por contribuições de campo).

Preços de campo entram por **crowdsourcing**: usuários fotografam etiquetas em `/contribuir`, a moderação aprova em `/admin`, e as leituras aprovadas calibram os descontos regionais e alimentam o blend manual×online (ver [Modelo de preço](#modelo-de-preço)).

## Arquitetura

```
GitHub Actions (cron semanal)
  └─ pipeline/scraper_pf.py        coleta via SerpAPI (Google Shopping)
       └─ snapshot_pf.json         artefato local da coleta
            └─ pipeline/salvar_supabase.py    grava em staging no Supabase
                 └─ aprovação humana em /admin (aba Coleta)
                      └─ calcular_custos_pratos (RPC)    custo por prato + índice
                           └─ Next.js (Vercel)           dashboard público
```

A coleta fica em **staging** (tabelas `precos`/`resultados_brutos`) e só entra no índice após aprovação no `/admin`. Coletas pendentes há mais de 5 dias são integradas automaticamente (pg_cron no Supabase).

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 16 (App Router) + React 19 + Tailwind CSS 4 |
| Gráficos e mapas | Recharts, react-simple-maps (d3-geo/topojson), Leaflet |
| Banco, auth e storage | Supabase (PostgreSQL, RLS, Auth, Storage) |
| Pagamentos | Asaas (assinaturas, webhook em `/api/webhooks/asaas`) |
| Coleta de preços | Python 3.11 + SerpAPI (engine `google_shopping`) |
| Automação | GitHub Actions (cron semanal) |
| Deploy | Vercel (GitHub integration) |

## Estrutura do repositório

```
indice-pf/
├── app/                  # Next.js App Router
│   ├── (site)/           # Páginas públicas: home, /metodologia, /sobre, /planos
│   ├── (app)/            # Área logada: /painel, /evolucao, /contribuir, /admin…
│   ├── (auth)/           # /entrar, /cadastro, /esqueci-senha, /completar-perfil
│   └── api/              # /api/assinatura, /api/geo, /api/webhooks/asaas
├── components/           # Componentes compartilhados
├── lib/                  # Cliente Supabase, tipos, queries, formatação, export
├── public/               # Assets estáticos
├── pipeline/             # Pipeline de coleta (Python)
│   ├── scraper_pf.py             # Coleta preços no Google Shopping (SerpAPI)
│   ├── salvar_supabase.py        # Grava o snapshot no banco (staging)
│   ├── calcular_custos_pratos.py # Custo por prato + índice nacional
│   └── limpar_simulados.py       # (legado) remoção de snapshots simulados
├── scripts/              # Ferramentas pontuais (tabela canônica, seed, correções)
├── data/                 # Planilhas-fonte e relatórios de diagnóstico
├── supabase/
│   └── migrations/       # Migrações SQL (rodar em ordem no SQL Editor)
├── docs/                 # Documentação técnica por fase (HTML)
└── .github/workflows/
    └── scraper-semanal.yml  # Automação da coleta
```

## Rodando localmente

Pré-requisitos: Node 20+, Python 3.11+ (apenas para o pipeline).

**Frontend:**

```bash
npm install
npm run dev
```

**Pipeline de coleta** (opcional, requer chaves SerpAPI e service role do Supabase):

```bash
pip install requests python-dotenv
python pipeline/scraper_pf.py       # coleta e gera pipeline/snapshot_pf.json
python pipeline/salvar_supabase.py  # grava no Supabase (staging)
```

Ambos leem o `.env.local` da raiz.

## Variáveis de ambiente

Crie um `.env.local` na raiz (não é versionado):

| Variável | Usada por | Descrição |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend | Chave anônima (pública; RLS protege os dados) |
| `SUPABASE_URL` | Pipeline | URL do projeto Supabase |
| `SUPABASE_KEY` | Pipeline | Service role key (nunca expor no frontend) |
| `SERPAPI_KEY` … `SERPAPI_KEY_4` | Pipeline | Contas SerpAPI (rotação automática quando a cota esgota) |

## Pipeline de coleta

- **Cadência:** toda segunda-feira, 11h UTC (8h de Brasília). O cron do GitHub é "melhor esforço" e costuma atrasar horas; o dia da coleta é o que vale.
- **Cota:** ~130–140 chamadas SerpAPI por coleta completa (base + retries). 4 contas gratuitas somam 1.000 chamadas/mês.
- **Retry de "no results":** o vazio da SerpAPI é intermitente; a busca é re-tentada nas demais contas antes de aceitar o vazio. Erros de chave (401/429/cota) rotacionam para a próxima conta sem perder a busca.
- **Dois modos** no disparo manual (aba Actions do GitHub, "Run workflow"):
  - `faltantes` (default) — coleta só o que não veio nos últimos 6 dias e mescla ao último snapshot. Uso: reparar coleta incompleta.
  - `completo` — coleta todos os ingredientes (mesmo modo do cron).
- **Cache diário** (`pipeline/cache_serpapi.json`) evita gastar cota em reexecuções no mesmo dia.
- **Guarda anti-sobrescrita:** se a coleta vier 100% vazia (chave morta/sem rede), o salvamento aborta antes de apagar dados bons.
- **Itens não cotáveis online:** cadastrar preço manual em `/admin` (aba Coleta); continuam sendo tentados a cada coleta e entram sozinhos quando aparecem.

## Modelo de preço

Precedência do preço R$/g de cada ingrediente (implementada em `calcular_custos_pratos` e replicada em `lib/queries.ts`):

| Ordem | Condição | Preço usado |
|---|---|---|
| 1 | Tem `custo_fixo` | Valor fixo (flat por prato) |
| 2 | Manual recente e online | Média das duas medianas (blend 50/50) |
| 3 | Só manual recente | Mediana das leituras manuais |
| 4 | Só online (desta coleta ou última conhecida) | Mediana online |
| 5 | Sem online, manual antigo | Última leitura manual (fallback) |

"Manual recente" = leituras na janela de ±10 dias da data do snapshot; o valor é a mediana das leituras da janela. Leituras manuais são registradas em `/admin` e arquivadas com histórico (`precos_manuais_hist`).

## Banco de dados

Tabelas principais (Supabase/PostgreSQL, acesso com RLS):

| Tabela | Conteúdo |
|---|---|
| `snapshots` | Uma linha por coleta (data, fonte, índice) |
| `precos` | Estatísticas por ingrediente por coleta (mediana, média, mín, máx, DP) |
| `resultados_brutos` | Cada produto coletado (título, loja, preço, link) — modal "Fontes" |
| `ingredientes` | Catálogo de ingredientes-base (busca, unidade, regras de validação) |
| `pratos` / `receitas` | 100 pratos e suas receitas (ingrediente × quantidade) |
| `custos_pratos` | Custo por prato por coleta, com cobertura |
| `contribuicoes` | Fotos de preço enviadas por usuários (crowdsourcing) |
| `profiles` | Perfil do usuário (RLS: cada um lê/edita só o próprio) |
| `precos_manuais_hist` | Histórico de leituras de preço manual |

`snapshots` e `resultados_brutos` são **append-only** — nunca deletar.

As migrações estão em [`supabase/migrations/`](supabase/migrations/), numeradas; rodar **em ordem** no SQL Editor do Supabase. São escritas de forma defensiva (`IF NOT EXISTS`).

## Rotas da aplicação

| Rota | Acesso | Descrição |
|---|---|---|
| `/` | Público | Dashboard: índice nacional, mapa por região, explorador de pratos |
| `/metodologia`, `/sobre`, `/planos` | Público | Páginas institucionais |
| `/entrar`, `/cadastro`, `/esqueci-senha` | Público | Autenticação (Supabase Auth, e-mail + senha) |
| `/painel` | Logado | Painel do usuário |
| `/contribuir` | Logado | Envio de preços de campo (foto + geolocalização), modos único e lote |
| `/meus-envios`, `/perfil`, `/configuracoes` | Logado | Contribuições e dados do usuário |
| `/assinar`, `/plano` | Logado | Assinatura (Asaas) |
| `/evolucao` | Admin | Histórico: série do índice, variação, ingredientes, calibração |
| `/contribuidores` | Admin | Ranking mensal de contribuidores |
| `/admin` | Admin | Moderação, coleta (aprovação/preços manuais), dados, pagamentos |

Acesso admin via `profiles.is_admin`; ações destrutivas exigem superuser e ficam registradas em log.

## Automação (GitHub Actions)

Workflow: [`.github/workflows/scraper-semanal.yml`](.github/workflows/scraper-semanal.yml). Roda `pipeline/scraper_pf.py` e `pipeline/salvar_supabase.py`; a integração ao índice depende de aprovação no `/admin`. Tem `concurrency` para nunca haver dois runs simultâneos.

Secrets necessários no repositório:

- `SUPABASE_URL`, `SUPABASE_KEY` (service role)
- `SERPAPI_KEY`, `SERPAPI_KEY_2`, `SERPAPI_KEY_3`, `SERPAPI_KEY_4`

Para mudar a frequência da coleta, ajustar em conjunto: o `cron` do workflow, a cota SerpAPI disponível e os textos do site que citam a frequência.

## Deploy

Deploy contínuo via integração GitHub → Vercel: merge na `main` publica em produção. O `.npmrc` usa `legacy-peer-deps`. Headers de segurança (HSTS, CSP em report-only, X-Frame-Options etc.) em [`next.config.ts`](next.config.ts).

## Scripts utilitários

| Script | Função |
|---|---|
| `scripts/mapa_canonico.py` | Mapa curado: 404 nomes de receita → ingredientes-base |
| `scripts/tripe_scraping.py` | Termo de busca, unidade e regras de validação por ingrediente |
| `scripts/gerar_tabela_canonica.py` | Gera `data/tabela_canonica_ingredientes.xlsx` (receitas consolidadas, 8 abas) |
| `scripts/seed_supabase.py` | Popula `ingredientes`/`pratos`/`receitas` (idempotente, requer service role) |
| `scripts/gerar_sql_correcao.py` | Recoleta ingredientes pontuais e gera SQL de correção |

---

Projeto privado e proprietário. Documentação detalhada de cada fase em [`docs/`](docs/).
