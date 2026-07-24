import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { exigirAdmin, SEM_CACHE } from '@/lib/server/autorizar'
import { todasLinhas } from '@/lib/server/paginar'
import { mediana } from '@/lib/stats'
import { MAPA_INGREDIENTE_IPCA, type Confianca } from '@/lib/mapa-ingredientes'

// Reconstrução do índice ingrediente a ingrediente.
//
// Fase 3 (ADR docs/027, LAB-003/LAB-007): a série parte da decomposição
// CANÔNICA de cada prato (dish_cost_components, Fase 2) — um valor em R$ por
// (prato, ingrediente) já com a fonte efetiva resolvida (custo_fixo, blend,
// manual, online). Cada componente é projetado individualmente:
//   custo_componente(m) = custo_componente(âncora) × ratio_da_série(m)
// A soma por prato já é proporcionalmente correta; não há peso a normalizar.
//
// Componente sem deflator (custo_fixo, ou ingrediente sem item no mapa IPCA)
// fica CONGELADO nominalmente em todos os meses — não é deflacionado nem
// redistribuído sobre o resto (decisão aprovada, ADR docs/027). A cobertura
// reportada declara essa parte explicitamente, nunca a esconde.
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
// A série é ESTIMATIVA, não medição. productKind=current_basket_backcast
// (docs/026): ancora no último ponto medido, projeta a cesta ATUAL para trás.

export const maxDuration = 60

const GRUPO_FALLBACK = 'ipca_7171'   // Alimentação no domicílio

// Gate temporário de âncora (LAB-002): o schema ainda não tem estado
// 'published' formal, então só ancora em snapshot cujo conjunto de custos
// bate com os pratos ativos, sem custo não positivo, com mediana reconciliada
// com o valor persistido, E com decomposição canônica publicada (Fase 3:
// sem isso não há componente para projetar — nunca cai para cálculo legado
// silenciosamente). Candidatos são tentados por DATA decrescente (não por
// id). Limiares versionados aqui até existir configuração formal (Fase 1).
const GATE_ANCORA = {
  versao: 2,
  maxCandidatos: 5,          // snapshots recentes tentados, do mais novo ao mais antigo
  toleranciaMediana: 0.05,   // R$ aceitos entre mediana recalculada e custo_total_pf
}

const CONFIANCAS_VALIDAS = new Set(['alta', 'media', 'baixa'])

type Componente = { prato_id: number; ingrediente_id: number; fonte_efetiva: string; custo: number }

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

  // 1. âncora: snapshot recente que passa no gate (custos_pratos legado, só
  //    para validar a data/reconciliação) E tem decomposição canônica
  const { data: pratosAtivos, error: ePratos } = await db.from('pratos').select('id').eq('ativo', true)
  if (ePratos || !pratosAtivos?.length)
    return NextResponse.json({ error: 'sem pratos ativos', code: 'NO_ACTIVE_DISHES' }, { status: 500, headers: SEM_CACHE })
  const esperados = new Set<number>(pratosAtivos.map(p => p.id))

  const { data: candidatos, error: eSnap } = await db.from('snapshots')
    .select('id, data, custo_total_pf').order('data', { ascending: false }).limit(GATE_ANCORA.maxCandidatos)
  if (eSnap || !candidatos?.length)
    return NextResponse.json({ error: 'sem coletas', code: 'NO_SNAPSHOT' }, { status: 500, headers: SEM_CACHE })

  let ancora: { id: number; data: string } | null = null
  let componentes: Componente[] = []
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
    const { data: versaoRow } = await db.from('shadow_publicacoes')
      .select('calc_version').eq('snapshot_id', cand.id).order('calc_version', { ascending: false }).limit(1).maybeSingle()
    if (!versaoRow) {
      rejeitados.push({ snapshotId: cand.id, motivo: 'sem componentes canônicos publicados (shadow)' })
      continue
    }
    const comps = await todasLinhas<Componente>((de, ate) =>
      db.from('dish_cost_components').select('prato_id, ingrediente_id, fonte_efetiva, custo')
        .eq('snapshot_id', cand.id).eq('calc_version', versaoRow.calc_version).range(de, ate))
    if (!comps.length) {
      rejeitados.push({ snapshotId: cand.id, motivo: 'sem componentes canônicos publicados (vazio)' })
      continue
    }
    ancora = { id: cand.id, data: cand.data }
    componentes = comps
    break
  }
  if (!ancora)
    return NextResponse.json(
      { error: 'nenhum snapshot recente passa no gate de âncora', code: 'NO_VALID_ANCHOR', gate: { ...GATE_ANCORA, rejeitados } },
      { status: 503, headers: SEM_CACHE })
  const ymAncora = ancora.data.slice(0, 7)

  // 2. mapa de deflator por ingrediente (só os que aparecem nos componentes).
  //    Item fora do nível de confiança pedido cai para o grupo POR POLÍTICA
  //    (group_by_policy) — escolha do filtro, não lacuna de dado. Ingrediente
  //    sem qualquer entrada no mapa fica sem deflator: residual congelado.
  const mapaPorIng = new Map(MAPA_INGREDIENTE_IPCA.map(m => [m.id, m]))
  const ingsComponentes = new Set(componentes.map(c => c.ingrediente_id))
  const deflatorDe = new Map<number, { serie: string; porPolitica: boolean }>()
  const semMapeamento = new Set<number>()
  for (const ing of ingsComponentes) {
    if (ing === null || ing === undefined) continue
    const m = mapaPorIng.get(ing)
    if (!m) { semMapeamento.add(ing); continue }
    deflatorDe.set(ing, conf.has(m.confianca) ? { serie: m.serie, porPolitica: false } : { serie: GRUPO_FALLBACK, porPolitica: true })
  }
  const usados = new Set([GRUPO_FALLBACK, ...[...deflatorDe.values()].map(d => d.serie)])

  // 3. variações mensais das séries usadas
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

  // 4. desfaz a inflação mês a mês, de trás para frente, sobre uma RAZÃO
  //    (não sobre um preço): razao(m-1) = razao(m) / (1 + variação_do_mês_m/100).
  //    Só ingredientes com deflator entram nesta caminhada — os congelados
  //    nunca precisam de razão (fica implícito 1 para sempre).
  const gaps: { series: string; month: string; reason: string }[] = []
  const fallbackPorSerie = new Map<string, number>()
  const razaoNoMes = new Map<string, Map<number, number>>()
  const atual = new Map([...deflatorDe.keys()].map(ing => [ing, 1]))
  razaoNoMes.set(ymAncora, new Map(atual))
  for (let i = meses.length - 1; i > 0; i--) {
    const mes = meses[i]
    const anterior = meses[i - 1]
    const novos = new Map<number, number>()
    const gapsDoMes = new Set<string>()
    const fallbacksDoMes = new Set<string>()
    for (const [ing, razao] of atual) {
      const serieIng = deflatorDe.get(ing)!.serie
      let v = varPorSerie.get(serieIng)?.get(mes)
      if (v == null && serieIng !== GRUPO_FALLBACK) {
        const g = varPorSerie.get(GRUPO_FALLBACK)?.get(mes)
        if (g != null) { v = g; fallbacksDoMes.add(serieIng) }
      }
      if (v == null) { gapsDoMes.add(serieIng); continue }
      novos.set(ing, razao / (1 + v / 100))
    }
    if (gapsDoMes.size) {
      for (const s of gapsDoMes) gaps.push({ series: s, month: mes, reason: 'sem variação do item nem do grupo no mês' })
      break
    }
    for (const s of fallbacksDoMes) fallbackPorSerie.set(s, (fallbackPorSerie.get(s) ?? 0) + 1)
    for (const [ing, r] of novos) atual.set(ing, r)
    razaoNoMes.set(anterior, new Map(atual))
  }

  // 5. projeta cada componente individualmente e soma por prato — sem peso a
  //    normalizar. Congelado: contribui o mesmo valor em todo mês.
  const serie = meses.map(ym => {
    const razoes = razaoNoMes.get(ym)
    if (!razoes) return null
    const porPrato = new Map<number, number>()
    for (const c of componentes) {
      // razaoNoMes só existe com TODOS os ingredientes de deflatorDe presentes
      // (a caminhada quebra por completo no primeiro gap); defensivo aqui.
      const razao = deflatorDe.has(c.ingrediente_id) ? (razoes.get(c.ingrediente_id) ?? null) : 1
      if (razao == null) return null
      porPrato.set(c.prato_id, (porPrato.get(c.prato_id) ?? 0) + c.custo * razao)
    }
    const custos = [...porPrato.values()]
    if (!custos.length) return null
    return { ym, indice: Math.round(mediana(custos) * 100) / 100, pratos: custos.length }
  }).filter((p): p is { ym: string; indice: number; pratos: number } => p != null)

  // 6. cobertura: quanto do custo-âncora é deflacionado por item específico,
  //    quanto é grupo, e quanto fica CONGELADO (residual não deflacionado,
  //    declarado — nunca redistribuído sobre o resto).
  let total = 0, comItem = 0, comGrupo = 0, congeladoCustoFixo = 0, congeladoSemMapa = 0
  for (const c of componentes) {
    total += c.custo
    if (c.fonte_efetiva === 'custo_fixo') { congeladoCustoFixo += c.custo; continue }
    const d = deflatorDe.get(c.ingrediente_id)
    if (!d) { congeladoSemMapa += c.custo; continue }
    if (d.serie === GRUPO_FALLBACK) comGrupo += c.custo; else comItem += c.custo
  }
  const pct = (v: number) => total > 0 ? Math.round(v / total * 1000) / 10 : 0

  const corpo = {
    // Backcast da cesta atual: ancora no ÚLTIMO ponto medido e projeta para
    // trás com a cesta/receitas de hoje. Nunca é "extensão histórica" de uma
    // série medida contínua — decisão padrão da auditoria docs/014 §12.
    productKind: 'current_basket_backcast' as const,
    ancora: { ym: ymAncora, data: ancora.data, snapshotId: ancora.id },
    gate: { versao: GATE_ANCORA.versao, rejeitados },
    confianca: [...conf],
    cobertura: {
      por_item_pct: pct(comItem),
      por_grupo_pct: pct(comGrupo),
      residual_nao_deflacionado_pct: pct(congeladoCustoFixo + congeladoSemMapa),
    },
    // pedido x possível: o deflator começa em inicioDado; se o pedido for antes,
    // a série é cortada em vez de extrapolada
    periodo: { pedido: desde, efetivo: inicioEfetivo, deflatorDesde: inicioDado },
    resolucao: {
      fallbackUsed: fallbackPorSerie.size > 0,
      fallbacks: [...fallbackPorSerie].map(([series, mesesN]) => ({ series, meses: mesesN })),
      groupByPolicy: [...deflatorDe].filter(([, d]) => d.porPolitica).map(([id]) => id),
      residualCongelado: {
        custoFixoPct: pct(congeladoCustoFixo),
        semMapeamentoPct: pct(congeladoSemMapa),
        semMapeamentoIds: [...semMapeamento],
      },
    },
    serie,
  }
  if (gaps.length)
    return NextResponse.json({ status: 'incomplete', code: 'DATA_INCOMPLETE', gaps, ...corpo }, { status: 409, headers: SEM_CACHE })
  return NextResponse.json({ status: 'ok', ...corpo }, { headers: SEM_CACHE })
}
