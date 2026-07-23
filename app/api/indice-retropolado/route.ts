import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { mediana } from '@/lib/stats'
import { MAPA_INGREDIENTE_IPCA, type Confianca } from '@/lib/mapa-ingredientes'

// Reconstrução do índice ingrediente a ingrediente.
//
// Em vez de deflacionar o índice agregado por um número só, monta um deflator
// PRÓPRIO DE CADA PRATO: a média das razões de preço dos seus ingredientes,
// ponderada pela participação de cada um no custo do prato. Assim o movimento
// relativo entre ingredientes e os pesos das receitas são preservados.
//
// O nível vem do custo REAL de custos_pratos (blend, com preços manuais e as
// correções do pipeline); os preços por ingrediente entram só para formar
// pesos e razões. Consequência: no mês da âncora o resultado é exatamente o
// índice medido, e nenhum prato é descartado por faltar um preço.
//
// GET /api/indice-retropolado?desde=2015-01&confianca=alta,media
// → { serie: [{ ym, indice, pratos }], cobertura: {...}, ancora: {...} }
//
// A série é ESTIMATIVA, não medição. O uso previsto é leitura gráfica.

export const maxDuration = 60

const GRUPO_FALLBACK = 'ipca_7171'   // Alimentação no domicílio

// PostgREST corta em 1000 linhas: pagina até acabar.
async function todasLinhas<T>(
  monta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const passo = 1000
  const out: T[] = []
  for (let de = 0; ; de += passo) {
    const { data, error } = await monta(de, de + passo - 1)
    if (error) throw new Error(error.message)
    const lote = data ?? []
    out.push(...lote)
    if (lote.length < passo) return out
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const desde = url.searchParams.get('desde') || '2015-01'
  const conf = new Set((url.searchParams.get('confianca') || 'alta,media,baixa')
    .split(',').map(s => s.trim()).filter(Boolean) as Confianca[])

  const db = supabaseAdmin()

  // 1. âncora: preços da coleta mais recente
  const { data: snaps, error: eSnap } = await db.from('snapshots')
    .select('id, data').order('data', { ascending: false }).limit(1)
  if (eSnap || !snaps?.length) return NextResponse.json({ error: 'sem coletas' }, { status: 500 })
  const ancora = snaps[0]
  const ymAncora = ancora.data.slice(0, 7)

  const precos = await todasLinhas<{ ingrediente_id: number; mediana_exibicao: number }>((de, ate) =>
    db.from('precos').select('ingrediente_id, mediana_exibicao')
      .eq('snapshot_id', ancora.id).not('ingrediente_id', 'is', null).range(de, ate))
  const precoBase = new Map<number, number>()
  for (const p of precos) if (p.mediana_exibicao > 0) precoBase.set(p.ingrediente_id, p.mediana_exibicao)

  // 2. custo REAL de cada prato na âncora — é o nível de referência
  const custoReal = await todasLinhas<{ prato_id: number; custo_total: number }>((de, ate) =>
    db.from('custos_pratos').select('prato_id, custo_total').eq('snapshot_id', ancora.id).range(de, ate))
  const custoBase = new Map<number, number>()
  for (const c of custoReal) if (c.custo_total > 0) custoBase.set(c.prato_id, c.custo_total)

  // 3. receitas → participação de cada ingrediente no custo do prato (pesos).
  //    Ingrediente sem preço fica de fora dos pesos; os demais renormalizam.
  const receitas = await todasLinhas<{ prato_id: number; ingrediente_id: number; qtd_g: number }>((de, ate) =>
    db.from('receitas').select('prato_id, ingrediente_id, qtd_g').not('ingrediente_id', 'is', null).range(de, ate))
  const pesosPrato = new Map<number, { ing: number; w: number }[]>()
  const brutoPrato = new Map<number, { ing: number; v: number }[]>()
  for (const r of receitas) {
    const p = precoBase.get(r.ingrediente_id)
    if (!r.qtd_g || p == null) continue
    const arr = brutoPrato.get(r.prato_id) ?? []
    arr.push({ ing: r.ingrediente_id, v: (r.qtd_g / 1000) * p })
    brutoPrato.set(r.prato_id, arr)
  }
  for (const [prato, itens] of brutoPrato) {
    const soma = itens.reduce((s, x) => s + x.v, 0)
    if (soma > 0) pesosPrato.set(prato, itens.map(x => ({ ing: x.ing, w: x.v / soma })))
  }

  // 3. deflator de cada ingrediente: item do IPCA se a confiança foi pedida,
  //    senão o grupo (mantém a cesta completa em vez de sumir com o item)
  const deflatorDe = new Map<number, string>()
  for (const m of MAPA_INGREDIENTE_IPCA) deflatorDe.set(m.id, conf.has(m.confianca) ? m.serie : GRUPO_FALLBACK)
  const usados = new Set([...deflatorDe.values(), GRUPO_FALLBACK])

  // 4. variações mensais das séries usadas
  const linhas = await todasLinhas<{ serie: string; data: string; valor: number }>((de, ate) =>
    db.from('fatores_preditores').select('serie, data, valor')
      .in('serie', [...usados]).gte('data', `${desde}-01`).order('data', { ascending: true }).range(de, ate))
  const varPorSerie = new Map<string, Map<string, number>>()
  for (const l of linhas) {
    const m = varPorSerie.get(l.serie) ?? new Map<string, number>()
    m.set(l.data.slice(0, 7), Number(l.valor))
    varPorSerie.set(l.serie, m)
  }

  // meses de `desde` até a âncora
  const meses: string[] = []
  for (let d = new Date(`${desde}-01T00:00:00Z`); d.toISOString().slice(0, 7) <= ymAncora; d.setUTCMonth(d.getUTCMonth() + 1))
    meses.push(d.toISOString().slice(0, 7))
  if (!meses.length) return NextResponse.json({ error: 'período vazio' }, { status: 400 })

  // 5. desfaz a inflação mês a mês, de trás para frente:
  //    preco(m-1) = preco(m) / (1 + variação_do_mês_m / 100)
  const precoNoMes = new Map<string, Map<number, number>>()
  const atual = new Map(precoBase)
  precoNoMes.set(ymAncora, new Map(atual))
  for (let i = meses.length - 1; i > 0; i--) {
    const mes = meses[i]                       // variação observada NESTE mês
    const anterior = meses[i - 1]
    for (const [ing, preco] of atual) {
      const serie = deflatorDe.get(ing) ?? GRUPO_FALLBACK
      const v = varPorSerie.get(serie)?.get(mes) ?? varPorSerie.get(GRUPO_FALLBACK)?.get(mes) ?? 0
      atual.set(ing, preco / (1 + v / 100))
    }
    precoNoMes.set(anterior, new Map(atual))
  }

  // 6. deflator ponderado por prato e mediana dos custos resultantes.
  //    custo_prato(m) = custo_real(âncora) × Σ_i peso_i × preço_i(m)/preço_i(âncora)
  const serie = meses.map(ym => {
    const precos = precoNoMes.get(ym)
    if (!precos) return null
    const custos: number[] = []
    for (const [prato, custoAncora] of custoBase) {
      const pesos = pesosPrato.get(prato)
      if (!pesos?.length) continue
      let fator = 0, wTotal = 0
      for (const { ing, w } of pesos) {
        const pm = precos.get(ing), p0 = precoBase.get(ing)
        if (pm == null || p0 == null || p0 <= 0) continue
        fator += w * (pm / p0); wTotal += w
      }
      if (wTotal <= 0) continue
      custos.push(custoAncora * (fator / wTotal))   // renormaliza pelos pesos usados
    }
    if (!custos.length) return null
    return { ym, indice: Math.round(mediana(custos) * 100) / 100, pratos: custos.length }
  }).filter(Boolean)

  // 7. cobertura: quanto do custo atual é deflacionado por item próprio
  const gramas = new Map<number, number>()
  for (const r of receitas) gramas.set(r.ingrediente_id, (gramas.get(r.ingrediente_id) ?? 0) + (r.qtd_g || 0))
  let total = 0, comItem = 0
  for (const [ing, g] of gramas) {
    const p = precoBase.get(ing)
    if (p == null) continue
    const custo = (g / 1000) * p
    total += custo
    if ((deflatorDe.get(ing) ?? GRUPO_FALLBACK) !== GRUPO_FALLBACK) comItem += custo
  }

  return NextResponse.json({
    ancora: { ym: ymAncora, data: ancora.data },
    confianca: [...conf],
    cobertura: { por_item_pct: total > 0 ? Math.round(comItem / total * 1000) / 10 : 0 },
    serie,
  })
}
