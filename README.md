# 🛒 Índice PF

Dashboard de monitoramento semanal do custo de um prato feito brasileiro, com coleta automatizada de preços via Google Shopping.

## O que é

O Índice PF rastreia o custo de 27 ingredientes típicos de um prato feito (arroz, feijão, frango, salada, etc.) e calcula semanalmente quanto custa produzir uma porção. Os preços são coletados automaticamente via SerpAPI e armazenados no Supabase.

**Acesse:** [indice-pf.vercel.app](https://indice-pf.vercel.app)

## Funcionalidades

- Evolução do custo do PF ao longo do tempo com banda de desvio padrão
- Composição do custo por categoria (Proteína, Base, Guarnição, Salada, Temperos)
- Tabela detalhada com mediana, média, mín, máx e desvio padrão por ingrediente
- Calculadora de custo diário com simulação de desconto no atacado (5–30%)
- Filtros por período, ingredientes e métrica de preço

## Stack

- **Frontend:** Next.js 15 + Tailwind CSS + Recharts
- **Banco de dados:** Supabase (PostgreSQL)
- **Coleta de dados:** Python + SerpAPI (Google Shopping)
- **Deploy:** Vercel
- **Automação:** GitHub Actions (toda quarta-feira às 8h)

## Estrutura

```
indice-pf/
├── app/
│   └── page.tsx          # Dashboard principal
├── lib/
│   └── supabase.ts       # Cliente Supabase + tipos
├── scraper_pf.py         # Coleta preços no Google Shopping
├── salvar_supabase.py    # Salva resultados no banco
├── limpar_simulados.py   # Remove snapshots simulados antigos
└── .github/
    └── workflows/
        └── scraper-semanal.yml  # Automação semanal
```

## Rodando localmente

```bash
npm install
npm run dev
```

Crie um arquivo `.env.local` na raiz com:

```
NEXT_PUBLIC_SUPABASE_URL=sua_url_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon
```

## Automação

O scraper roda automaticamente toda quarta-feira via GitHub Actions. Para rodar manualmente, acesse a aba **Actions** no GitHub e clique em **"Run workflow"**.

Os secrets necessários no GitHub são:

- `SUPABASE_URL`
- `SUPABASE_KEY` (service role key)
- `SERPAPI_KEY`
