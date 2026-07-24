import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { exigirAdmin, SEM_CACHE } from '@/lib/server/autorizar'
import { todasLinhas } from '@/lib/server/paginar'
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
//
// Contrato discriminado (Fase 0B da auditoria docs/014):
// - 200 { status: "ok", serie, ancora, resolucao, ... }
// - 409 { status: "incomplete", code: "DATA_INCOMPLETE", gaps, serie parcial }
//   quando falta variação (item E grupo) em algum mês: a série para no gap e
//   nenhum ponto anterior é produzido — mês sem dado nunca vira variação zero.
// - 503 { code: "NO_VALID_ANCHOR" } quando nenhum snapshot recente passa no
//   gate de âncora abaixo.
//
// A série é ESTIMATIVA, não medição. O uso previsto é leitura gráfica.

export const maxDuration = 60

const GRUPO_FALLBACK = 'ipca_7171'   // Alimentação no domicílio

// Gate temporário de âncora (LAB-002): o schema ainda não tem estado
// 'published', então só ancora em snapshot cujo conjunto de custos bate com os
// pratos ativos, sem custo não positivo e com mediana reconciliada com o valor
// persistido. Candidatos são tentados por DATA decrescente (não por id: um
// backfill com id maior não pode virar âncora). Limiares versionados aqui até
// existir configuração formal (Fase 1).
const GATE_ANCORA = {
  versao: 1,
  maxCandidatos: 5,          // snapshots recentes tentados, do mais novo ao mais antigo
  toleranciaMediana: 0.05,   // R$ aceitos entre mediana recalculada e custo_total_pf
}

const CONFIANCAS_VALIDAS = new Set(['alta', 'media', 'baixa'])

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin(req, 'api/indice-retropolado')
  if ('resposta' in auth) return auth.resposta

  const url = new URL(req.url)
  const desde = url.searchParams.get('desde') || '2015-01'
  if (!/^\d{4}-\d{2}$/.test(desde))
    return NextResponse.json({ error: 'desde deve usar o formato AAAA-MM', code: 'INVALID_DATE' }, { status: 400, headers: SEM_CACHE })
  const confPedidas = (url.searchParams.get('confianca') || 'alta,media,baixa')
    .split(',').map(s => s.trim()).filter(Boolean)
  if (confPedidas.some(c => !CONFIANCAS_VALIDAS.has(c)))
    return NextResponse.json({ error: 'confianca aceita apenas alta, media e baixa', code: 'INVALID_PARAM' }, { status: 400, headers: SEM_CACHE })
  const conf = new Set(confPedidas as Confianca[])

  const db = supabaseAdmin()

  // 1. âncora: snapshot recente que passa no gate
  const { data: pratosAtivos, error: ePratos } = await db.from('pratos').select('id').eq('ativo', true)
  if (ePratos || !pratosAtivos?.length)
    return NextResponse.json({ error: 'sem pratos ativos', code: 'NO_ACTIVE_DISHES' }, { status: 500, headers: SEM_CACHE })
  const esperados = new Set<number>(pratosAtivos.map(p => p.id))

  const { data: candidatos, error: eSnap } = await db.from('snapshots')
    .select('id, data, custo_total_pf').order('data', { ascending: false }).limit(GATE_ANCORA.maxCandidatos)
  if (eSnap || !candidatos?.length)
    return NextResponse.json({ error: 'sem coletas', code: 'NO_SNAPSHOT' }, { status: 500, headers: SEM_CACHE })

  let ancora: { id: number; data: string } | null = null
  let custoBase = new Map<number, number>()
  const rejeitados: { snapshotId: number; motivo: string }[] = []
  for (const cand of candidatos) {
    const custos = await todasLinhas<{ prato_id: number; custo_total: number }>((de, ate) =>
      db.from('custos_pratos').select('prato_id, custo_total').eq('snapshot_id', cand.id).range(de, ate))
    const porPrato = new Map<number, number>()
    for (const c of custos) porPrato.set(c.prato_id, Number(c.custo_total))
    if (porPrato.size !== esperados.size || [...esperados].some(id => !porPrato.has(id))) {
      rejeitados.push({ snapshotId: cand.id, motivo: `conjunto de pratos incompleto (${porPrato.size}/${esperados.size})` })
      continue
    }
    if ([...porPrato.values()].some(v => !(v > 0))) {
      rejeitados.push({ snapshotId: cand.id, motivo: 'custo de prato não positivo' })
      continue
    }
    const med = mediana([...porPrato.values()])
    const persistido = Number(cand.custo_total_pf)
    if (!Number.isFinite(persistido) || Math.abs(med - persistido) > GATE_ANCORA.toleranciaMediana) {
      rejeitados.push({ snapshotId: cand.id, motivo: `mediana ${med.toFixed(4)} não reconcilia com persistido ${cand.custo_total_pf}` })
      continue
    }
    ancora = { id: cand.id, data: cand.data }
    custoBase = porPrato
    break
  }
  if (!ancora)
    return NextResponse.json(
      { error: 'nenhum snapshot recente passa no gate de âncora', code: 'NO_VALID_ANCHOR', gate: { ...GATE_ANCORA, rejeitados } },
      { status: 503, headers: SEM_CACHE })
  const ymAncora = ancora.data.slice(0, 7)

  const precos = await todasLinhas<{ ingrediente_id: number; mediana_exibicao: number }>((de, ate) =>
    db.from('precos').select('ingrediente_id, mediana_exibicao')
      .eq('snapshot_id', ancora!.id).not('ingrediente_id', 'is', null).range(de, ate))
  const precoBase = new Map<number, number>()
  for (const p of precos) if (p.mediana_exibicao > 0) precoBase.set(p.ingrediente_id, p.mediana_exibicao)

  // 2. receitas → participação de cada ingrediente no custo do prato (pesos).
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

  // 3. deflator de cada ingrediente. Item fora do nível de confiança pedido cai
  //    para o grupo POR POLÍTICA (resolution=group_by_policy) — é escolha do
  //    filtro, não lacuna de dado.
  const deflatorDe = new Map<number, { serie: string; porPolitica: boolean }>()
  for (const m of MAPA_INGREDIENTE_IPCA)
    deflatorDe.set(m.id, conf.has(m.confianca)
      ? { serie: m.serie, porPolitica: false }
      : { serie: GRUPO_FALLBACK, porPolitica: true })
  const usados = new Set([GRUPO_FALLBACK, ...[...deflatorDe.values()].map(d => d.serie)])

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

  // Só dá para desinflacionar até onde existe deflator. As séries de item do
  // IPCA (SIDRA 7060) começam em 2020-01: pedir 1994 sem checar produziria uma
  // linha reta inventada para trás. Corta no 1º mês com dado do grupo.
  const mesesGrupo = [...(varPorSerie.get(GRUPO_FALLBACK)?.keys() ?? [])].sort()
  const inicioDado = mesesGrupo[0]
  if (!inicioDado) return NextResponse.json({ error: 'sem dados do deflator', code: 'NO_DEFLATOR_DATA' }, { status: 400, headers: SEM_CACHE })
  const inicioEfetivo = desde > inicioDado ? desde : inicioDado

  const meses: string[] = []
  for (let d = new Date(`${inicioEfetivo}-01T00:00:00Z`); d.toISOString().slice(0, 7) <= ymAncora; d.setUTCMonth(d.getUTCMonth() + 1))
    meses.push(d.toISOString().slice(0, 7))
  if (!meses.length) return NextResponse.json({ error: 'período vazio', code: 'EMPTY_PERIOD' }, { status: 400, headers: SEM_CACHE })

  // 5. desfaz a inflação mês a mês, de trás para frente:
  //    preco(m-1) = preco(m) / (1 + variação_do_mês_m / 100)
  //    Item sem variação no mês usa o grupo e registra fallbackUsed; se nem o
  //    grupo tem, é GAP: a caminhada para ali e nada anterior é produzido.
  const gaps: { series: string; month: string; reason: string }[] = []
  const fallbackPorSerie = new Map<string, number>()   // série → nº de meses cobertos pelo grupo
  const precoNoMes = new Map<string, Map<number, number>>()
  const atual = new Map(precoBase)
  precoNoMes.set(ymAncora, new Map(atual))
  for (let i = meses.length - 1; i > 0; i--) {
    const mes = meses[i]                       // variação observada NESTE mês
    const anterior = meses[i - 1]
    const novos = new Map<number, number>()
    const gapsDoMes = new Set<string>()
    const fallbacksDoMes = new Set<string>()
    for (const [ing, preco] of atual) {
      const serieIng = deflatorDe.get(ing)?.serie ?? GRUPO_FALLBACK
      let v = varPorSerie.get(serieIng)?.get(mes)
      if (v == null && serieIng !== GRUPO_FALLBACK) {
        const g = varPorSerie.get(GRUPO_FALLBACK)?.get(mes)
        if (g != null) { v = g; fallbacksDoMes.add(serieIng) }
      }
      if (v == null) { gapsDoMes.add(serieIng); continue }
      novos.set(ing, preco / (1 + v / 100))
    }
    if (gapsDoMes.size) {
      for (const s of gapsDoMes) gaps.push({ series: s, month: mes, reason: 'sem variação do item nem do grupo no mês' })
      break
    }
    for (const s of fallbacksDoMes) fallbackPorSerie.set(s, (fallbackPorSerie.get(s) ?? 0) + 1)
    for (const [ing, p] of novos) atual.set(ing, p)
    precoNoMes.set(anterior, new Map(atual))
  }

  // 6. deflator ponderado por prato e mediana dos custos resultantes.
  //    custo_prato(m) = custo_real(âncora) × Σ_i peso_i × preço_i(m)/preço_i(âncora)
  const serie = meses.map(ym => {
    const precosMes = precoNoMes.get(ym)
    if (!precosMes) return null
    const custos: number[] = []
    for (const [prato, custoAncora] of custoBase) {
      const pesos = pesosPrato.get(prato)
      if (!pesos?.length) continue
      let fator = 0, wTotal = 0
      for (const { ing, w } of pesos) {
        const pm = precosMes.get(ing), p0 = precoBase.get(ing)
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
    if ((deflatorDe.get(ing)?.serie ?? GRUPO_FALLBACK) !== GRUPO_FALLBACK) comItem += custo
  }

  const corpo = {
    // Backcast da cesta atual: ancora no ÚLTIMO ponto medido e projeta para
    // trás com a cesta/receitas de hoje. Nunca é "extensão histórica" de uma
    // série medida contínua — decisão padrão da auditoria docs/014 §12.
    // (productKind=historical_extension não existe: exigiria uma série medida
    // ancorada no PRIMEIRO ponto do regime canônico, que não é construída aqui.)
    productKind: 'current_basket_backcast' as const,
    ancora: { ym: ymAncora, data: ancora.data, snapshotId: ancora.id },
    gate: { versao: GATE_ANCORA.versao, rejeitados },
    confianca: [...conf],
    cobertura: { por_item_pct: total > 0 ? Math.round(comItem / total * 1000) / 10 : 0 },
    // pedido x possível: o deflator começa em inicioDado; se o pedido for antes,
    // a série é cortada em vez de extrapolada
    periodo: { pedido: desde, efetivo: inicioEfetivo, deflatorDesde: inicioDado },
    resolucao: {
      fallbackUsed: fallbackPorSerie.size > 0,
      fallbacks: [...fallbackPorSerie].map(([series, mesesN]) => ({ series, meses: mesesN })),
      groupByPolicy: [...deflatorDe].filter(([, d]) => d.porPolitica).map(([id]) => id),
    },
    serie,
  }
  if (gaps.length)
    return NextResponse.json({ status: 'incomplete', code: 'DATA_INCOMPLETE', gaps, ...corpo }, { status: 409, headers: SEM_CACHE })
  return NextResponse.json({ status: 'ok', ...corpo }, { headers: SEM_CACHE })
}
