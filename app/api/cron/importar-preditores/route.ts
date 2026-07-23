import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

// Coleta das variáveis econômicas preditoras (adaptado do projeto megamistico).
// Todas as fontes são públicas e sem API key: BCB (SGS/PTAX), SIDRA/IBGE,
// CoinGecko e Yahoo Finance. Grava tudo na tabela normalizada
// fatores_preditores (serie, data, valor, fonte); séries mensais no dia 01.

export const maxDuration = 300

const BCB_SGS = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs'
const BCB_PTAX = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata'
const BCB_HEADERS = { Accept: 'application/json', 'User-Agent': 'IndicePF/1.0' }

type DB = SupabaseClient
type Row = { serie: string; data: string; valor: number; fonte: string }

const fmtBCBdmy = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
const fmtBCBmdy = (d: Date) =>
  `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`

async function ultimaData(db: DB, serie: string): Promise<string | null> {
  const { data } = await db.from('fatores_preditores')
    .select('data').eq('serie', serie).order('data', { ascending: false }).limit(1).maybeSingle()
  return data?.data ?? null
}

async function upsert(db: DB, rows: Row[]): Promise<number> {
  if (!rows.length) return 0
  let total = 0
  for (let i = 0; i < rows.length; i += 500) {
    const lote = rows.slice(i, i + 500)
    const { error } = await db.from('fatores_preditores').upsert(lote, { onConflict: 'serie,data' })
    if (error) throw new Error(`upsert ${rows[0].serie}: ${error.message}`)
    total += lote.length
  }
  return total
}

interface SGSItem { data: string; valor: string }

// Série mensal do BCB SGS (valor por mês, dia 01). Ex.: SELIC 432, IPCA 433,
// salário mínimo 1619.
async function importarSgsMensal(db: DB, serie: string, cod: number, anoDefault: number): Promise<number> {
  const ult = await ultimaData(db, serie)
  const anoInicio = ult ? new Date(ult + 'T12:00:00Z').getFullYear() : anoDefault
  const anoFim = new Date().getFullYear()

  const porMes = new Map<string, number>()
  for (let ano = anoInicio; ano <= anoFim; ano++) {
    const inicio = new Date(ano, 0, 1)
    const fim = ano === anoFim ? new Date() : new Date(ano, 11, 31)
    const url = `${BCB_SGS}.${cod}/dados?formato=json&dataInicial=${encodeURIComponent(fmtBCBdmy(inicio))}&dataFinal=${encodeURIComponent(fmtBCBdmy(fim))}`
    const res = await fetch(url, { headers: BCB_HEADERS, signal: AbortSignal.timeout(12_000) })
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) continue
    const items: SGSItem[] = await res.json().catch(() => [])
    for (const it of items) {
      const [, mm, yyyy] = it.data.split('/')
      const val = parseFloat(it.valor)
      if (!isNaN(val)) porMes.set(`${yyyy}-${mm.padStart(2, '0')}`, val)  // último do mês vence
    }
    if (ano < anoFim) await new Promise(r => setTimeout(r, 120))
  }
  const rows: Row[] = Array.from(porMes.entries())
    .map(([ym, valor]) => ({ serie, data: `${ym}-01`, valor, fonte: `bcb_sgs_${cod}` }))
  return upsert(db, rows)
}

// Série diária do BCB SGS (valor por dia). Ex.: euro 21620.
async function importarSgsDiario(db: DB, serie: string, cod: number, anoDefault: number): Promise<number> {
  const ult = await ultimaData(db, serie)
  const anoInicio = ult ? new Date(ult + 'T12:00:00Z').getFullYear() : anoDefault
  const anoFim = new Date().getFullYear()

  let total = 0
  for (let ano = anoInicio; ano <= anoFim; ano++) {
    const inicio = new Date(ano, 0, 1)
    const fim = ano === anoFim ? new Date() : new Date(ano, 11, 31)
    const url = `${BCB_SGS}.${cod}/dados?formato=json&dataInicial=${fmtBCBdmy(inicio)}&dataFinal=${fmtBCBdmy(fim)}`
    const res = await fetch(url, { headers: BCB_HEADERS, signal: AbortSignal.timeout(12_000) })
    if (!res.ok) continue
    const items: SGSItem[] = await res.json().catch(() => [])
    const rows: Row[] = items.map(it => {
      const [dd, mm, yyyy] = it.data.split('/')
      const val = parseFloat(it.valor)
      if (isNaN(val) || val <= 0) return null
      return { serie, data: `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`, valor: val, fonte: `bcb_sgs_${cod}` }
    }).filter(Boolean) as Row[]
    total += await upsert(db, rows)
    if (ano < anoFim) await new Promise(r => setTimeout(r, 120))
  }
  return total
}

// Dólar (BCB PTAX, cotação de venda diária).
async function importarDolar(db: DB): Promise<number> {
  const ult = await ultimaData(db, 'dolar')
  const hoje = new Date()
  const meses: { ano: number; mes: number }[] = []
  if (ult) { const d = new Date(ult + 'T12:00:00Z'); meses.push({ ano: d.getFullYear(), mes: d.getMonth() + 1 }) }
  else for (let a = 2010; a <= hoje.getFullYear(); a++) for (let m = 1; m <= 12; m++) meses.push({ ano: a, mes: m })
  if (!meses.find(m => m.ano === hoje.getFullYear() && m.mes === hoje.getMonth() + 1))
    meses.push({ ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 })

  interface PTAX { cotacaoVenda: number; dataHoraCotacao: string }
  let total = 0
  for (const { ano, mes } of meses) {
    const inicio = new Date(ano, mes - 1, 1)
    const fim = new Date(ano, mes, 0)
    const url = `${BCB_PTAX}/CotacaoDolarPeriodo(dataInicial=@di,dataFinalCotacao=@df)` +
      `?@di='${fmtBCBmdy(inicio)}'&@df='${fmtBCBmdy(fim)}'&$top=200&$format=json&$select=cotacaoVenda,dataHoraCotacao`
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) continue
    const json: { value: PTAX[] } = await res.json().catch(() => ({ value: [] }))
    const porData = new Map<string, PTAX>()
    for (const it of json.value ?? []) {
      const data = it.dataHoraCotacao.split(' ')[0]
      const atual = porData.get(data)
      if (!atual || it.dataHoraCotacao > atual.dataHoraCotacao) porData.set(data, it)
    }
    const rows: Row[] = Array.from(porData.entries()).map(([data, it]) => ({
      serie: 'dolar', data, valor: it.cotacaoVenda, fonte: 'bcb_ptax',
    }))
    total += await upsert(db, rows)
  }
  return total
}

// Bitcoin em BRL (CoinGecko, diário; free cobre até 365 dias).
async function importarBitcoin(db: DB): Promise<number> {
  const ult = await ultimaData(db, 'bitcoin')
  const dias = ult
    ? Math.min(365, Math.ceil((Date.now() - new Date(ult + 'T00:00:00Z').getTime()) / 86_400_000) + 1)
    : 365
  if (dias <= 0) return 0
  const url = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=brl&days=${dias}&interval=daily`
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`)
  const json = await res.json() as { prices: [number, number][] }
  const porData = new Map<string, number>()
  for (const [ts, preco] of json.prices ?? []) if (!isNaN(preco)) porData.set(new Date(ts).toISOString().split('T')[0], preco)
  const rows: Row[] = Array.from(porData.entries()).map(([data, preco]) => ({
    serie: 'bitcoin', data, valor: Math.round(preco * 100) / 100, fonte: 'coingecko',
  }))
  return upsert(db, rows)
}

// Ibovespa (Yahoo Finance ^BVSP; exige User-Agent de browser).
async function importarIbovespa(db: DB): Promise<number> {
  const ult = await ultimaData(db, 'ibovespa')
  const range = ult ? '3mo' : '2y'
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?interval=1d&range=${range}`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (IndicePF)' }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`Yahoo Ibovespa ${res.status}`)
  const json = await res.json() as {
    chart: { result: { timestamp: number[]; indicators: { quote: { close: (number | null)[] }[] } }[] }
  }
  const r0 = json.chart?.result?.[0]
  if (!r0?.timestamp?.length) return 0
  const closes = r0.indicators.quote[0].close
  const rows: Row[] = r0.timestamp
    .map((ts, i) => ({ ts, close: closes[i] }))
    .filter(x => x.close != null && !isNaN(x.close as number))
    .map(x => ({ serie: 'ibovespa', data: new Date(x.ts * 1000).toISOString().split('T')[0], valor: Math.round((x.close as number) * 100) / 100, fonte: 'yahoo_bvsp' }))
  return upsert(db, rows)
}

// IPCA por grupo (SIDRA/IBGE tabela 7060, variável 63 = variação mensal %).
// categoria: c315 — 7170 Alimentação e bebidas; 7432 Alimentação fora do domicílio.
async function importarIpcaSidra(db: DB, serie: string, categoria: number): Promise<number> {
  const url = `https://apisidra.ibge.gov.br/values/t/7060/n1/1/v/63/p/all/c315/${categoria}?formato=json`
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`SIDRA ${serie} ${res.status}`)
  const json = await res.json() as { D3C: string; V: string }[]
  const rows: Row[] = json.slice(1)   // [0] é o cabeçalho
    .map(it => {
      const val = parseFloat(it.V)
      if (isNaN(val)) return null
      const yyyy = it.D3C.slice(0, 4), mm = it.D3C.slice(4, 6)
      return { serie, data: `${yyyy}-${mm}-01`, valor: val, fonte: 'sidra_7060' }
    }).filter(Boolean) as Row[]
  return upsert(db, rows)
}

// SIDRA completo: todos os itens de alimentação (11xx/12xx) e combustível/gás/
// energia (22xx/5104xx) do IPCA numa única chamada. serie = 'ipca_<D4C>'.
// Popula também fatores_catalogo (rótulo + categoria) para os menus da UI.
// Exclui 7170/7432 (já vêm como 'ipca_alimentacao'/'ipca_alim_fora').
async function importarSidraCompleto(db: DB): Promise<number> {
  const url = `https://apisidra.ibge.gov.br/values/t/7060/n1/1/v/63/p/all/c315/all?formato=json`
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`SIDRA completo ${res.status}`)
  const linhas = (await res.json() as { D3C: string; V: string; D4C: string; D4N: string }[]).slice(1)

  // mapa código-estrutural (2 ou 4 díg) → nome, para derivar a categoria
  const nomePorEstrut = new Map<string, string>()
  for (const r of linhas) {
    const num = r.D4N.split('.')[0]
    if (num.length === 2 || num.length === 4) nomePorEstrut.set(num, r.D4N.split('.').slice(1).join('.'))
  }
  const relevante = (num: string) => /^(11|12|22|5104)/.test(num)

  const rows: Row[] = []
  const catalogo = new Map<string, { serie: string; label: string; categoria: string; granularidade: string; unidade: string }>()
  for (const r of linhas) {
    if (r.D4C === '7170' || r.D4C === '7432') continue   // já cobertos por chaves próprias
    const num = r.D4N.split('.')[0]
    if (!relevante(num)) continue
    const serie = `ipca_${r.D4C}`
    const val = parseFloat(r.V)
    if (!isNaN(val)) rows.push({ serie, data: `${r.D3C.slice(0, 4)}-${r.D3C.slice(4, 6)}-01`, valor: val, fonte: 'sidra_7060' })
    if (!catalogo.has(serie)) {
      catalogo.set(serie, {
        serie,
        label: r.D4N.split('.').slice(1).join('.') || r.D4N,
        categoria: nomePorEstrut.get(num.slice(0, 4)) || nomePorEstrut.get(num.slice(0, 2)) || 'Outros',
        granularidade: 'mensal', unidade: '%',
      })
    }
  }
  const cat = Array.from(catalogo.values())
  for (let i = 0; i < cat.length; i += 500) await db.from('fatores_catalogo').upsert(cat.slice(i, i + 500), { onConflict: 'serie' })
  return upsert(db, rows)
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET não configurada' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = supabaseAdmin()
  const tarefas: [string, Promise<number>][] = [
    ['dolar', importarDolar(db)],
    ['euro', importarSgsDiario(db, 'euro', 21620, 2010)],
    ['selic', importarSgsMensal(db, 'selic', 432, 2010)],
    ['ipca', importarSgsMensal(db, 'ipca', 433, 2010)],
    ['salario_minimo', importarSgsMensal(db, 'salario_minimo', 1619, 2000)],
    ['bitcoin', importarBitcoin(db)],
    ['ibovespa', importarIbovespa(db)],
    ['ipca_alimentacao', importarIpcaSidra(db, 'ipca_alimentacao', 7170)],
    ['ipca_alim_fora', importarIpcaSidra(db, 'ipca_alim_fora', 7432)],
    ['sidra_itens', importarSidraCompleto(db)],
  ]
  const resultados = await Promise.allSettled(tarefas.map(t => t[1]))

  const meta: Record<string, number | string> = {}
  let temErro = false
  resultados.forEach((res, i) => {
    const nome = tarefas[i][0]
    if (res.status === 'fulfilled') meta[nome] = res.value
    else { meta[`${nome}_erro`] = String(res.reason); temErro = true }
  })
  return NextResponse.json({ status: temErro ? 'parcial' : 'ok', ...meta })
}
