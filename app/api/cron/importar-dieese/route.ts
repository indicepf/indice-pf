import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { FONTE_DIEESE } from '@/lib/server/fontes-config'
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

type PontoCapital = { data: string; capital: string; valor: number }
type Parsed = { pontos: { data: string; valor: number }[]; porCapital: PontoCapital[] }

// A resposta é uma tabela: 1ª linha = capitais, demais = "MM-AAAA" + um valor
// por capital. Devolve a mediana nacional por mês (leitura vigente,
// inalterada) E o valor de cada capital (Fase 3, LAB-016: o painel de
// capitais que respondem muda no tempo — perder isso mistura variação de
// preço com variação de composição da amostra).
export function parseTabela(html: string): Parsed {
  const tabela = html.match(/<table[\s\S]*?<\/table>/i)
  if (!tabela) return { pontos: [], porCapital: [] }
  const linhas = tabela[0].match(/<tr[\s\S]*?<\/tr>/gi) ?? []
  const pontos: { data: string; valor: number }[] = []
  const porCapital: PontoCapital[] = []
  let capitais: string[] | null = null
  for (const linha of linhas) {
    const cels = (linha.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? []).map(c => semTags(c.replace(/<t[dh][^>]*>/i, '').replace(/<\/t[dh]>/i, '')))
    if (!cels.length) continue
    const m = cels[0].match(/^(\d{2})[-/](\d{4})$/)
    if (!m) {
      // primeira linha sem data no formato esperado = cabeçalho com os nomes
      // das capitais (uma vez só; ignora eventuais linhas de nota depois)
      if (!capitais && cels.length > 1) capitais = cels.slice(1)
      continue
    }
    const data = `${m[2]}-${m[1]}-01`
    const brutos = cels.slice(1)
    const vals: number[] = []
    brutos.forEach((txt, i) => {
      const v = num(txt)
      if (v == null || v <= 0) return
      vals.push(v)
      const nomeCap = capitais?.[i] || `col${i}`
      porCapital.push({ data, capital: nomeCap, valor: Math.round(v * 100) / 100 })
    })
    if (vals.length) pontos.push({ data, valor: Math.round(mediana(vals) * 100) / 100 })
  }
  return { pontos, porCapital }
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
  const { pontos, porCapital } = parseTabela(await res.text())
  // 0 linhas = markup mudou ou resposta vazia; nunca é sucesso (Fase 0D)
  if (pontos.length < FONTE_DIEESE.minMesesPorProduto)
    throw new Error(`DIEESE ${serie}: ${pontos.length} linha(s) no HTML — markup mudado ou resposta vazia`)

  const db = supabaseAdmin()
  const rows = pontos.map(p => ({ serie, data: p.data, valor: p.valor, fonte: 'dieese_cesta_basica' }))
  let total = 0
  for (let i = 0; i < rows.length; i += 500) {
    const lote = rows.slice(i, i + 500)
    const { error } = await db.from('fatores_preditores').upsert(lote, { onConflict: 'serie,data' })
    if (error) throw new Error(`upsert ${serie}: ${error.message}`)
    total += lote.length
  }

  // Fase 3 (LAB-016): preserva cada capital além da mediana nacional. Melhor
  // esforço — falha aqui não derruba o cron (a leitura vigente não depende
  // disso); erro fica no log para investigação.
  const rowsCap = porCapital.map(p => ({ serie, capital: p.capital, data: p.data, valor: p.valor }))
  for (let i = 0; i < rowsCap.length; i += 500) {
    const lote = rowsCap.slice(i, i + 500)
    const { error } = await db.from('dieese_capital_observations')
      .upsert(lote, { onConflict: 'serie,capital,data,valor', ignoreDuplicates: true })
    if (error) console.error(`[importar-dieese] capitais ${serie}:`, error.message)
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
  // Diagnóstico estruturado por série (Fase 0D): a fonte é essencial — qualquer
  // produto com falha/0 linhas derruba o job com 500, sem sucesso parcial.
  const fontes: Record<string, { ok: boolean; linhas?: number; erro?: string }> = {}
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
      const linhas = await importarProduto(cod, serie, de)
      fontes[serie] = { ok: true, linhas }
    } catch (err) {
      fontes[serie] = { ok: false, erro: String(err) }; temErro = true
    }
    if (i < alvos.length - 1) await new Promise(r => setTimeout(r, CRAWL_DELAY_MS))
  }
  const falha = temErro && FONTE_DIEESE.essencial
  const status = falha ? 'failed' : temErro ? 'parcial' : 'ok'
  if (temErro) console.error(`[cron/importar-dieese] status=${status}`, JSON.stringify(fontes))
  return NextResponse.json({ status, configVersao: FONTE_DIEESE.versao, fontes }, { status: falha ? 500 : 200 })
}
