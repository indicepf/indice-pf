import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { mediana } from '@/lib/stats'

// Cesta básica do DIEESE (Pesquisa Nacional da Cesta Básica de Alimentos):
// preço médio em R$ de 13 alimentos por capital, mensal. É dado MEDIDO por
// fonte independente, com histórico longo — serve de âncora para validar o
// índice-pf e como preditor não-circular (diferente do IPCA retropolado).
//
// Fonte: https://www.dieese.org.br/cesta/produto (POST do formulário público).
// robots.txt permite /cesta/ e pede Crawl-delay: 10 — respeitado abaixo.
// Guarda a MEDIANA entre as capitais, coerente com o índice-pf (mediana).

export const maxDuration = 300

const URL_DIEESE = 'https://www.dieese.org.br/cesta/produto'
const CRAWL_DELAY_MS = 10_000        // robots.txt: Crawl-delay: 10
const INICIO_PADRAO = '071994'       // Plano Real; antes disso a moeda muda e os valores não comparam
const TIPO_PRECO_MEDIO = 4           // tipoDado: 4 = Preço médio (R$)

// código do produto no formulário → chave da série
const PRODUTOS: [number, string][] = [
  [1, 'dieese_cesta'], [2, 'dieese_carne'], [3, 'dieese_leite'], [4, 'dieese_feijao'],
  [5, 'dieese_arroz'], [6, 'dieese_farinha'], [7, 'dieese_batata'], [8, 'dieese_tomate'],
  [9, 'dieese_pao'], [10, 'dieese_cafe'], [11, 'dieese_banana'], [12, 'dieese_acucar'],
  [13, 'dieese_oleo'], [14, 'dieese_manteiga'],
]

const semTags = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
const mmaaaa = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`

// "1.234,56" → 1234.56 ; "-" / "" → null
function num(txt: string): number | null {
  const t = txt.trim()
  if (!t || t === '-') return null
  const v = parseFloat(t.replace(/\./g, '').replace(',', '.'))
  return isNaN(v) ? null : v
}

// A resposta é uma tabela: 1ª linha = capitais, demais = "MM-AAAA" + um valor
// por capital. Devolve a mediana das capitais com dado em cada mês.
function parseTabela(html: string): { data: string; valor: number }[] {
  const tabela = html.match(/<table[\s\S]*?<\/table>/i)
  if (!tabela) return []
  const linhas = tabela[0].match(/<tr[\s\S]*?<\/tr>/gi) ?? []
  const out: { data: string; valor: number }[] = []
  for (const linha of linhas) {
    const cels = (linha.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? []).map(c => semTags(c.replace(/<t[dh][^>]*>/i, '').replace(/<\/t[dh]>/i, '')))
    if (!cels.length) continue
    const m = cels[0].match(/^(\d{2})[-/](\d{4})$/)
    if (!m) continue                                   // cabeçalho ou linha de nota
    const vals = cels.slice(1).map(num).filter((v): v is number => v != null && v > 0)
    if (vals.length) out.push({ data: `${m[2]}-${m[1]}-01`, valor: Math.round(mediana(vals) * 100) / 100 })
  }
  return out
}

async function importarProduto(cod: number, serie: string, de: string): Promise<number> {
  const body = new URLSearchParams({
    produtos: String(cod), cidades: '0', tipoDado: String(TIPO_PRECO_MEDIO),
    dataInicial: de, dataFinal: mmaaaa(new Date()), farinha: 'true',
  })
  const res = await fetch(URL_DIEESE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'IndicePF/1.0 (indicepratofeito.com.br)' },
    body, signal: AbortSignal.timeout(45_000),
  })
  if (!res.ok) throw new Error(`DIEESE ${serie} HTTP ${res.status}`)
  const pontos = parseTabela(await res.text())
  if (!pontos.length) return 0

  const db = supabaseAdmin()
  const rows = pontos.map(p => ({ serie, data: p.data, valor: p.valor, fonte: 'dieese_cesta_basica' }))
  let total = 0
  for (let i = 0; i < rows.length; i += 500) {
    const lote = rows.slice(i, i + 500)
    const { error } = await db.from('fatores_preditores').upsert(lote, { onConflict: 'serie,data' })
    if (error) throw new Error(`upsert ${serie}: ${error.message}`)
    total += lote.length
  }
  return total
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET não configurada' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = supabaseAdmin()
  const url = new URL(req.url)
  // ?full=1 refaz o histórico inteiro; por padrão só os últimos ~13 meses
  const full = url.searchParams.get('full') === '1'
  const so = url.searchParams.get('serie')          // ?serie=dieese_tomate para testar uma só

  const alvos = so ? PRODUTOS.filter(([, s]) => s === so) : PRODUTOS
  const meta: Record<string, number | string> = {}
  let temErro = false

  for (let i = 0; i < alvos.length; i++) {
    const [cod, serie] = alvos[i]
    try {
      let de = INICIO_PADRAO
      if (!full) {
        const { data } = await db.from('fatores_preditores')
          .select('data').eq('serie', serie).order('data', { ascending: false }).limit(1).maybeSingle()
        if (data?.data) {                            // relê 12 meses (revisões do DIEESE)
          const d = new Date(data.data + 'T00:00:00Z'); d.setMonth(d.getMonth() - 12)
          de = mmaaaa(d)
        }
      }
      meta[serie] = await importarProduto(cod, serie, de)
    } catch (err) {
      meta[`${serie}_erro`] = String(err); temErro = true
    }
    if (i < alvos.length - 1) await new Promise(r => setTimeout(r, CRAWL_DELAY_MS))
  }
  return NextResponse.json({ status: temErro ? 'parcial' : 'ok', ...meta })
}
