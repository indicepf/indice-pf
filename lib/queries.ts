import { supabase } from './supabase'
import { VALOR_POR_FOTO, CORTE_COLETA } from './format'
import type { Snapshot, DishCost, ItemDetalhe, Fonte, Ing, Profile, Contribuicao, ContribuicaoFull } from './types'

// O Supabase corta cada resposta em 1000 linhas. Para tabelas maiores (receitas,
// resultados_brutos) buscamos em páginas de 1000 e juntamos tudo.
const PAGINA = 1000
async function fetchAll<T = any>(build: () => any): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGINA) {
    const { data, error } = await build().range(from, from + PAGINA - 1)
    if (error) throw error
    const linhas = (data as T[]) || []
    out.push(...linhas)
    if (linhas.length < PAGINA) return out
  }
}

export async function getLatestSnapshot(): Promise<Snapshot | null> {
  const { data } = await supabase.from('snapshots')
    .select('id,data,custo_total_pf').order('data', { ascending: false }).limit(1)
  return (data?.[0] as Snapshot) ?? null
}

export type ItemColeta = { id: number; nome: string; preco_manual: number | null; unidade: string | null; peso_ref_g: number | null }
export type StatusColeta = { snapshotId: number; data: string; achados: ItemColeta[]; naoAchados: ItemColeta[] }

// Status da última coleta: data + ingredientes achados (qtd_resultados>0) vs
// não-achados (=0), a partir do snapshot mais recente. Usado na aba de superuser.
// Traz o preço manual atual de cada item para permitir cadastrá-lo nos não-achados.
export async function getStatusUltimaColeta(): Promise<StatusColeta | null> {
  const { data: snaps } = await supabase.from('snapshots')
    .select('id,data').order('data', { ascending: false }).limit(1)
  const snap = snaps?.[0] as { id: number; data: string } | undefined
  if (!snap) return null
  const { data } = await supabase.from('precos')
    .select('ingrediente_id,nome_ingrediente,qtd_resultados,ingredientes(preco_manual,unidade,peso_ref_g)')
    .eq('snapshot_id', snap.id).order('nome_ingrediente')
  const rows = (data || []) as any[]
  const achados: ItemColeta[] = [], naoAchados: ItemColeta[] = []
  for (const r of rows) {
    if (r.ingrediente_id == null) continue
    const item: ItemColeta = {
      id: r.ingrediente_id, nome: r.nome_ingrediente,
      preco_manual: r.ingredientes?.preco_manual ?? null,
      unidade: r.ingredientes?.unidade ?? null, peso_ref_g: r.ingredientes?.peso_ref_g ?? null,
    }
    ;((r.qtd_resultados || 0) > 0 ? achados : naoAchados).push(item)
  }
  return { snapshotId: snap.id, data: snap.data, achados, naoAchados }
}

// Coletas anteriores (histórico da aba Coleta): data, índice, nº de itens
// achados/não-achados e status de integração. Filtro por intervalo + paginação.
export type ColetaResumo = {
  id: number; data: string; custo_total_pf: number | null
  achados: number; naoAchados: number; integrada: boolean
}
export async function getColetas(opts: { ini?: string; fim?: string; page?: number; porPagina?: number } = {}):
  Promise<{ coletas: ColetaResumo[]; total: number }> {
  const { ini, fim, page = 0, porPagina = 10 } = opts
  let q = supabase.from('snapshots').select('id,data,custo_total_pf', { count: 'exact' })
    .gte('data', ini && ini > CORTE_COLETA ? ini : CORTE_COLETA)   // nunca antes do corte
  if (fim) q = q.lte('data', fim)
  const { data: snaps, count } = await q.order('id', { ascending: false })
    .range(page * porPagina, page * porPagina + porPagina - 1)
  const lista = (snaps || []) as { id: number; data: string; custo_total_pf: number | null }[]
  if (!lista.length) return { coletas: [], total: count || 0 }
  const ids = lista.map(s => s.id)
  // fetchAll: 10 snapshots × ~115 precos passam do teto de 1000 linhas do PostgREST
  const [precosRows, cpRows] = await Promise.all([
    fetchAll(() => supabase.from('precos').select('snapshot_id,qtd_resultados').in('snapshot_id', ids).order('id')),
    fetchAll(() => supabase.from('custos_pratos').select('snapshot_id').in('snapshot_id', ids).order('id')),
  ])
  const conta = new Map<number, { a: number; n: number }>()
  ;((precosRows || []) as any[]).forEach(r => {
    const c = conta.get(r.snapshot_id) || { a: 0, n: 0 }
    if ((r.qtd_resultados || 0) > 0) c.a++; else c.n++
    conta.set(r.snapshot_id, c)
  })
  const integrados = new Set(((cpRows || []) as any[]).map(r => r.snapshot_id))
  return {
    total: count || 0,
    coletas: lista.map(s => ({
      id: s.id, data: s.data, custo_total_pf: s.custo_total_pf != null ? Number(s.custo_total_pf) : null,
      achados: conta.get(s.id)?.a ?? 0, naoAchados: conta.get(s.id)?.n ?? 0,
      integrada: integrados.has(s.id),
    })),
  }
}

export async function getDishCosts(snapshotId: number): Promise<DishCost[]> {
  const { data } = await supabase.from('custos_pratos')
    .select('custo_total,ingredientes_cobertos,ingredientes_estimados,ingredientes_total,pratos(id,regiao,nome)')
    .eq('snapshot_id', snapshotId)
  return (data as unknown as DishCost[]) || []
}

// Custos dos pratos AGREGADOS num intervalo de coletas: custo_total = média das
// coletas do período por prato. Usado no filtro de data da home.
export async function getDishCostsRange(ini: string, fim: string): Promise<DishCost[]> {
  const novos = await getSnapshotsNovos()
  if (!ini && !fim) return novos[0] ? getDishCosts(novos[0].id) : []   // default: última coleta
  const range = novos.filter(s => (!ini || s.data >= ini) && (!fim || s.data <= fim))
  if (range.length <= 1) {
    const id = range[0]?.id ?? novos[0]?.id
    return id != null ? getDishCosts(id) : []   // sem nenhuma coleta: nada a buscar
  }
  const ids = range.map(s => s.id)
  const rows = await fetchAll(() => supabase.from('custos_pratos')
    .select('prato_id,custo_total,ingredientes_cobertos,ingredientes_estimados,ingredientes_total,pratos(id,regiao,nome)')
    .in('snapshot_id', ids))
  const byPrato: Record<number, any[]> = {}
  ;(rows as any[]).forEach(r => { (byPrato[r.prato_id] ||= []).push(r) })
  return Object.values(byPrato).map(arr => ({ ...arr[0], custo_total: arr.reduce((s, r) => s + Number(r.custo_total), 0) / arr.length })) as unknown as DishCost[]
}

function montarItens(rec: any[], precoMap: Record<number, number>, manRecMap: Record<number, number>): ItemDetalhe[] {
  return rec.map((r): ItemDetalhe => {
    const ing = r.ingredientes
    const qtd = Number(r.qtd_g)
    let preco_g: number | null = null, origem: ItemDetalhe['origem'] = 'sem', custo = 0, link: string | null = null
    const mRec  = manRecMap[r.ingrediente_id] ?? null                               // manual recente (janela ±10d) R$/g
    const mLast = ing.preco_manual != null ? Number(ing.preco_manual) / 1000 : null // último manual conhecido (fallback)
    const o     = precoMap[r.ingrediente_id] ?? null                                // R$/g online
    const linkM = ing.preco_manual_link ?? null
    if (ing.custo_fixo != null)         { origem = 'fixo';   custo = Number(ing.custo_fixo) }
    else if (mRec != null && o != null) { origem = 'misto';  preco_g = (mRec + o) / 2; custo = preco_g * qtd; link = linkM }
    else if (mRec != null)              { origem = 'manual'; preco_g = mRec;           custo = preco_g * qtd; link = linkM }
    else if (o != null)                 { origem = 'online'; preco_g = o;              custo = preco_g * qtd }        // manual antigo não conta
    else if (mLast != null)             { origem = 'manual'; preco_g = mLast;          custo = preco_g * qtd; link = linkM } // nicho sem online
    const num = (v: any) => v != null ? Number(v) : null
    return { ingrediente_id: r.ingrediente_id, nome: ing.nome, categoria: ing.categoria, qtd_g: qtd, qtd_pb_g: num(r.qtd_pb_g), qtd_cozida_g: num(r.qtd_cozida_g), qtd_meta_g: num(r.qtd_meta_g), preco_g, origem, custo, link }
  }).sort((a, b) => b.custo - a.custo)
}

// mediana simples (mesma regra do Python: média dos dois centrais quando par)
function mediana(v: number[]): number {
  const s = [...v].sort((a, b) => a - b), n = s.length, mid = Math.floor(n / 2)
  return n % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// Carrega a composição de TODOS os pratos de uma vez (gaveta abre instantânea, sem rede no clique).
export async function getAllDetalhes(snapshotId: number, snapData: string): Promise<Record<number, ItemDetalhe[]>> {
  const base = new Date(snapData + 'T00:00:00Z').getTime()
  const ini = new Date(base - 10 * 86400000).toISOString()          // janela do manual: [data-10d, data+10d]
  const fim = new Date(base + 11 * 86400000 - 1000).toISOString()
  const [rec, { data: precos }, { data: manuais }] = await Promise.all([
    fetchAll(() => supabase.from('receitas').select('prato_id,qtd_g,qtd_pb_g,qtd_cozida_g,qtd_meta_g,ingrediente_id,ingredientes(nome,categoria,custo_fixo,preco_manual,preco_manual_link)').order('id')),
    supabase.from('precos').select('ingrediente_id,mediana_normalizada').eq('snapshot_id', snapshotId),
    supabase.from('precos_manuais_hist').select('ingrediente_id,preco_manual').gte('criado_em', ini).lte('criado_em', fim).not('preco_manual', 'is', null),
  ])
  const precoMap: Record<number, number> = {}
  ;(precos || []).forEach((p: any) => { if (p.mediana_normalizada != null) precoMap[p.ingrediente_id] = Number(p.mediana_normalizada) })
  // manual recente (janela ±10d): mediana das leituras por ingrediente → R$/g. Só ele conta como manual atual.
  const manAgg: Record<number, number[]> = {}
  ;((manuais || []) as any[]).forEach(m => { (manAgg[m.ingrediente_id] ||= []).push(Number(m.preco_manual)) })
  const manRecMap: Record<number, number> = {}
  for (const k of Object.keys(manAgg)) manRecMap[+k] = mediana(manAgg[+k]) / 1000

  const porPrato: Record<number, any[]> = {}
  ;((rec || []) as any[]).forEach(r => { (porPrato[r.prato_id] ||= []).push(r) })
  const out: Record<number, ItemDetalhe[]> = {}
  for (const pid of Object.keys(porPrato)) out[+pid] = montarItens(porPrato[+pid], precoMap, manRecMap)
  return out
}

// Fontes (resultados brutos) de todos os ingredientes do snapshot, agrupadas por ingrediente.
export async function getAllFontes(snapshotId: number): Promise<Record<number, Fonte[]>> {
  const data = await fetchAll(() => supabase.from('resultados_brutos')
    .select('ingrediente_id,titulo,loja,preco_bruto,exibicao,link')
    .eq('snapshot_id', snapshotId).order('id'))
  const out: Record<number, Fonte[]> = {}
  ;(data as any[]).forEach(f => { (out[f.ingrediente_id] ||= []).push(f) })
  // mais barato primeiro dentro de cada ingrediente (a paginação foi por id)
  for (const k of Object.keys(out)) out[+k].sort((a, b) => Number(a.preco_bruto) - Number(b.preco_bruto))
  return out
}

export type FonteManual = { preco_manual: number | null; loja: string | null; link: string | null; criado_em: string; origem: string | null }

// Leituras manuais por ingrediente: as da janela do snapshot [data-10d, data+10d]
// (as que alimentam a mediana atual); se não houver nenhuma na janela, mostra a
// última leitura conhecida (fallback dos itens de nicho sem cotação online).
export async function getAllFontesManuais(snapData: string): Promise<Record<number, FonteManual[]>> {
  const base = new Date(snapData + 'T00:00:00Z').getTime()
  const ini = base - 10 * 86400000, fim = base + 11 * 86400000 - 1000
  const data = await fetchAll(() => supabase.from('precos_manuais_hist')
    .select('ingrediente_id,preco_manual,loja,link,criado_em,origem')
    .not('preco_manual', 'is', null)
    .order('criado_em', { ascending: false }))
  const todas: Record<number, FonteManual[]> = {}
  ;(data as any[]).forEach(f => { (todas[f.ingrediente_id] ||= []).push(f) })
  const out: Record<number, FonteManual[]> = {}
  for (const k of Object.keys(todas)) {
    const arr = todas[+k]
    const naJanela = arr.filter(f => { const t = new Date(f.criado_em).getTime(); return t >= ini && t <= fim })
    out[+k] = naJanela.length ? naJanela : [arr[0]]   // janela ±10d, ou a última leitura conhecida
  }
  return out
}

// ---- Evolução temporal (aba /evolucao) ----
export type FonteKey = 'blend' | 'online' | 'manual'
export type FonteSerie = { mediana: number; media: number; min: number; max: number }
export type EvolucaoPonto = { data: string } & Record<FonteKey, FonteSerie>
export type PratoSerie = { data: string } & Record<FonteKey, number>
export type CompPonto = { data: string } & Record<string, number>   // média por prato de cada grupo
export type Evolucao = {
  serie: EvolucaoPonto[]                       // distribuição dos 100 pratos por coleta e fonte
  pratos: { id: number; nome: string; regiao: string }[]
  porPrato: Record<number, PratoSerie[]>       // custo de cada prato por coleta e fonte
  composicao: CompPonto[]                       // composição do custo por grupo (blend) — média nacional por prato
  porPratoComp: Record<number, CompPonto[]>    // composição por grupo de cada prato, por coleta
  cvLojas: { data: string; cv: number }[]      // CV médio entre lojas (nacional) por coleta
  porPratoCV: Record<number, { data: string; cv: number }[]>   // CV entre lojas dos ingredientes de cada prato
}

// 17 categorias de ingrediente → 7 grupos amplos, para a composição empilhada.
export const GRUPOS_CAT = ['Proteína', 'Base', 'Guarnição', 'Verdura/Fruta', 'Temperos', 'Gordura/Laticínio', 'Outro'] as const
const CAT_GRUPO: Record<string, string> = {
  'Proteína bovina': 'Proteína', 'Proteína ovina/caprina': 'Proteína', 'Proteína pescado': 'Proteína', 'Proteína suína': 'Proteína', 'Proteína aves': 'Proteína', 'Pescado': 'Proteína', 'Ovos': 'Proteína',
  'Grão/Cereal': 'Base', 'Leguminosa': 'Base',
  'Tubérculo/Raiz': 'Guarnição',
  'Legume/Verdura': 'Verdura/Fruta', 'Fruta': 'Verdura/Fruta',
  'Tempero/Erva': 'Temperos', 'Condimento/Molho': 'Temperos', 'Líquido regional': 'Temperos',
  'Gordura/Óleo': 'Gordura/Laticínio', 'Laticínio': 'Gordura/Laticínio',
}
const grupoDe = (cat: string | null | undefined) => (cat && CAT_GRUPO[cat]) || 'Outro'

// Série do índice ao longo das coletas, por fonte (blend / online / manual). Recalcula
// o custo de cada prato em cada snapshot do modelo novo, sob cada premissa de fonte:
//   blend  = média manual×online (o índice real);
//   online = online preferido (cai p/ manual/fixo onde não há online);
//   manual = manual (janela ±10d) preferido (cai p/ online/fixo onde não há manual).
export async function getEvolucao(): Promise<Evolucao> {
  const [cp, snaps, receitas, ingRows, precosRows, manRows, pratosRows] = await Promise.all([
    supabase.from('custos_pratos').select('snapshot_id'),
    supabase.from('snapshots').select('id,data').gte('data', CORTE_COLETA).order('data', { ascending: true }),
    fetchAll(() => supabase.from('receitas').select('prato_id,ingrediente_id,qtd_g').order('id')),
    supabase.from('ingredientes').select('id,custo_fixo,preco_manual,categoria'),
    fetchAll(() => supabase.from('precos').select('snapshot_id,ingrediente_id,mediana_normalizada,media_exibicao,desvio_padrao').order('id')),
    fetchAll(() => supabase.from('precos_manuais_hist').select('ingrediente_id,preco_manual,criado_em').order('id')),
    supabase.from('pratos').select('id,nome,regiao'),
  ])
  const novos = new Set(((cp.data || []) as any[]).map(r => r.snapshot_id))
  const snapList = ((snaps.data || []) as any[]).filter(s => novos.has(s.id))   // só modelo novo, cronológico
  const ing = new Map<number, any>(); ((ingRows.data || []) as any[]).forEach(i => ing.set(i.id, i))
  const recPorPrato: Record<number, { ing: number; qtd: number }[]> = {}
  ;(receitas as any[]).forEach(r => { (recPorPrato[r.prato_id] ||= []).push({ ing: r.ingrediente_id, qtd: Number(r.qtd_g) }) })
  const precoPorSnap: Record<number, Record<number, number>> = {}
  const cvIngPorSnap: Record<number, Record<number, number>> = {}   // CV (±DP/média) por ingrediente por coleta
  ;(precosRows as any[]).forEach(p => {
    if (p.mediana_normalizada != null) (precoPorSnap[p.snapshot_id] ||= {})[p.ingrediente_id] = Number(p.mediana_normalizada)
    if (p.desvio_padrao != null && p.media_exibicao != null && Number(p.media_exibicao) > 0)
      (cvIngPorSnap[p.snapshot_id] ||= {})[p.ingrediente_id] = Number(p.desvio_padrao) / Number(p.media_exibicao)
  })
  const manPorIng: Record<number, { t: number; v: number }[]> = {}
  ;(manRows as any[]).forEach(m => { if (m.preco_manual != null) (manPorIng[m.ingrediente_id] ||= []).push({ t: new Date(m.criado_em).getTime(), v: Number(m.preco_manual) }) })

  const lastOnline: Record<number, number> = {}
  const serie: EvolucaoPonto[] = []
  const porPrato: Record<number, PratoSerie[]> = {}
  const composicao: CompPonto[] = []
  const porPratoComp: Record<number, CompPonto[]> = {}
  const cvLojas: { data: string; cv: number }[] = []              // CV médio entre lojas (nacional) por coleta
  const porPratoCV: Record<number, { data: string; cv: number }[]> = {}   // CV entre lojas dos ingredientes de cada prato
  const FONTES: FonteKey[] = ['blend', 'online', 'manual']
  const nPratos = Object.keys(recPorPrato).length || 1

  for (const snap of snapList) {
    const online = precoPorSnap[snap.id] || {}
    const cvIngThis = cvIngPorSnap[snap.id] || {}
    for (const k in online) lastOnline[+k] = online[+k]        // carry-forward do último online
    const base = new Date(snap.data + 'T00:00:00Z').getTime()
    const ini = base - 10 * 86400000, fim = base + 11 * 86400000 - 1000
    const manG: Record<number, number> = {}
    for (const k in manPorIng) {
      const vs = manPorIng[+k].filter(x => x.t >= ini && x.t <= fim).map(x => x.v)
      if (vs.length) manG[+k] = mediana(vs) / 1000
    }
    const precoIng = (iid: number, modo: FonteKey): { fixo?: number; g?: number } => {
      const fixo = ing.get(iid)?.custo_fixo
      if (fixo != null) return { fixo: Number(fixo) }
      const O = online[iid] ?? lastOnline[iid] ?? null
      const M = manG[iid] ?? null
      const mLast = ing.get(iid)?.preco_manual != null ? Number(ing.get(iid).preco_manual) / 1000 : null
      let g: number | null
      if (modo === 'blend') g = (M != null && O != null) ? (M + O) / 2 : (M ?? O ?? mLast)
      else if (modo === 'online') g = O ?? M ?? mLast
      else g = M ?? O ?? mLast
      return { g: g ?? undefined }
    }
    const custoPrato = (itens: { ing: number; qtd: number }[], modo: FonteKey) => {
      let c = 0
      for (const it of itens) { const p = precoIng(it.ing, modo); if (p.fixo != null) c += p.fixo; else if (p.g != null) c += p.g * it.qtd }
      return c
    }
    const dist = (modo: FonteKey): FonteSerie => {
      const vals = Object.values(recPorPrato).map(itens => custoPrato(itens, modo)).filter(v => v > 0)
      if (!vals.length) return { mediana: 0, media: 0, min: 0, max: 0 }
      const s = [...vals].sort((a, b) => a - b)
      return { mediana: mediana(vals), media: vals.reduce((a, b) => a + b, 0) / vals.length, min: s[0], max: s[s.length - 1] }
    }
    serie.push({ data: snap.data, blend: dist('blend'), online: dist('online'), manual: dist('manual') })
    const gruposNac: Record<string, number> = {}
    for (const pidStr of Object.keys(recPorPrato)) {
      const pid = +pidStr
      const ponto: any = { data: snap.data }
      for (const f of FONTES) ponto[f] = custoPrato(recPorPrato[pid], f)
      ;(porPrato[pid] ||= []).push(ponto)
      // composição do prato por grupo (blend) → alimenta o total nacional e a série do prato
      const gp: Record<string, number> = {}
      for (const it of recPorPrato[pid]) {
        const p = precoIng(it.ing, 'blend')
        const custo = p.fixo != null ? p.fixo : (p.g != null ? p.g * it.qtd : 0)
        if (custo) { const gr = grupoDe(ing.get(it.ing)?.categoria); gp[gr] = (gp[gr] || 0) + custo; gruposNac[gr] = (gruposNac[gr] || 0) + custo }
      }
      const cp: CompPonto = { data: snap.data }
      for (const g of GRUPOS_CAT) cp[g] = gp[g] || 0
      ;(porPratoComp[pid] ||= []).push(cp)
      // CV entre lojas dos ingredientes do prato (média dos CV por ingrediente)
      const cvs: number[] = []
      for (const it of recPorPrato[pid]) { const c = cvIngThis[it.ing]; if (c != null) cvs.push(c) }
      ;(porPratoCV[pid] ||= []).push({ data: snap.data, cv: cvs.length ? cvs.reduce((a, b) => a + b, 0) / cvs.length : 0 })
    }
    const comp: CompPonto = { data: snap.data }
    for (const g of GRUPOS_CAT) comp[g] = (gruposNac[g] || 0) / nPratos    // média por prato
    composicao.push(comp)
    const cvVals = Object.values(cvIngThis)
    cvLojas.push({ data: snap.data, cv: cvVals.length ? cvVals.reduce((a, b) => a + b, 0) / cvVals.length : 0 })
  }
  const pratos = ((pratosRows.data || []) as any[]).map(p => ({ id: p.id, nome: p.nome, regiao: p.regiao }))
  return { serie, pratos, porPrato, composicao, porPratoComp, cvLojas, porPratoCV }
}

// ─── Calibração (G1): desconto real Mercado/Atacarejo vs online, por região ───
// Compara o preço de campo aprovado (por região × tipo de loja) com o preço online
// do mesmo ingrediente e mede o desconto real (os percentuais Mercado/Atacarejo são
// definidos como "−X% sobre o online"). Onde NÃO há dado de campo, usa os percentuais
// atuais (−10% Mercado, −22% Atacarejo) por ingrediente. Recalcula o índice online
// por região sob os descontos calibrados, ao lado do índice com os percentuais atuais.
export type CalibTipo = 'Mercado' | 'Atacarejo'
export type CalibFonteCampo = { nome: string; data: string; cidade: string | null; uf: string | null; precoKg: number }
export type CalibItem = { regiao: string; tipo: CalibTipo; ingrediente_id: number; nome: string; desconto: number; n: number; fieldKg: number; onlineKg: number; fontes: CalibFonteCampo[] }
export type CalibTipoResumo = { assumidoPct: number; medidoPct: number | null; cobertura: number; indiceAssumido: number; indiceCalibrado: number }
export type CalibRegiao = { regiao: string; indiceOnline: number; nPratos: number; mercado: CalibTipoResumo; atacarejo: CalibTipoResumo }
export type Calibracao = { regioes: CalibRegiao[]; itens: CalibItem[]; snapshotData: string | null; snapshotId: number | null; contribsUsadas: number }

const CALIB_DEFAULT: Record<CalibTipo, number> = { Mercado: 0.10, Atacarejo: 0.22 }
const CALIB_REGIOES = ['Sul', 'Sudeste', 'Centro-oeste', 'Nordeste', 'Norte']
// UF (sigla ou nome vindo da geocodificação) → região canônica
const UF_REGIAO: Record<string, string> = {
  ac: 'Norte', am: 'Norte', ap: 'Norte', pa: 'Norte', ro: 'Norte', rr: 'Norte', to: 'Norte',
  acre: 'Norte', amazonas: 'Norte', 'amapá': 'Norte', amapa: 'Norte', 'pará': 'Norte', para: 'Norte', 'rondônia': 'Norte', rondonia: 'Norte', roraima: 'Norte', tocantins: 'Norte',
  al: 'Nordeste', ba: 'Nordeste', ce: 'Nordeste', ma: 'Nordeste', pb: 'Nordeste', pe: 'Nordeste', pi: 'Nordeste', rn: 'Nordeste', se: 'Nordeste',
  alagoas: 'Nordeste', bahia: 'Nordeste', 'ceará': 'Nordeste', ceara: 'Nordeste', 'maranhão': 'Nordeste', maranhao: 'Nordeste', 'paraíba': 'Nordeste', paraiba: 'Nordeste', pernambuco: 'Nordeste', 'piauí': 'Nordeste', piaui: 'Nordeste', 'rio grande do norte': 'Nordeste', sergipe: 'Nordeste',
  df: 'Centro-oeste', go: 'Centro-oeste', mt: 'Centro-oeste', ms: 'Centro-oeste',
  'distrito federal': 'Centro-oeste', 'goiás': 'Centro-oeste', goias: 'Centro-oeste', 'mato grosso': 'Centro-oeste', 'mato grosso do sul': 'Centro-oeste',
  es: 'Sudeste', mg: 'Sudeste', rj: 'Sudeste', sp: 'Sudeste',
  'espírito santo': 'Sudeste', 'espirito santo': 'Sudeste', 'minas gerais': 'Sudeste', 'rio de janeiro': 'Sudeste', 'são paulo': 'Sudeste', 'sao paulo': 'Sudeste',
  pr: 'Sul', rs: 'Sul', sc: 'Sul',
  'paraná': 'Sul', parana: 'Sul', 'rio grande do sul': 'Sul', 'santa catarina': 'Sul',
}
const calibRegiao = (regiao: string | null, uf: string | null): string | null => {
  const r = (regiao || '').trim().toLowerCase()
  const canon = CALIB_REGIOES.find(x => x.toLowerCase() === r)
  if (canon) return canon
  const u = (uf || '').trim().toLowerCase()
  return UF_REGIAO[u] || null
}

export async function getCalibracao(ini?: string, fim?: string): Promise<Calibracao> {
  const [snaps, receitas, ingRows, precosRows, pratosRows, contribs] = await Promise.all([
    supabase.from('snapshots').select('id,data').gte('data', CORTE_COLETA).order('data', { ascending: true }),
    fetchAll(() => supabase.from('receitas').select('prato_id,ingrediente_id,qtd_g').order('id')),
    supabase.from('ingredientes').select('id,nome,unidade,peso_ref_g,custo_fixo,preco_manual'),
    fetchAll(() => supabase.from('precos').select('snapshot_id,ingrediente_id,mediana_normalizada').order('id')),
    supabase.from('pratos').select('id,nome,regiao'),
    fetchAll(() => supabase.from('contribuicoes').select('user_id,ingrediente_id,preco,peso_g,tipo_loja,regiao,uf,cidade,criado_em').eq('status', 'aprovada')),
  ])
  const snapAll = ((snaps.data || []) as any[])
  // coleta de referência p/ o online = a mais recente dentro do intervalo (ou a última <= fim)
  const inRange = snapAll.filter((s: any) => (!ini || s.data >= ini) && (!fim || s.data <= fim))
  const ref = inRange.length ? inRange[inRange.length - 1]
    : (fim ? [...snapAll].reverse().find((s: any) => s.data <= fim) : snapAll[snapAll.length - 1]) || null
  const snapshotData: string | null = ref?.data ?? null
  const snapshotId: number | null = ref?.id ?? null
  const ing = new Map<number, any>(); ((ingRows.data || []) as any[]).forEach(i => ing.set(i.id, i))

  // preço online por ingrediente (R$/g) = último não-nulo até a coleta de referência
  const dateOf = new Map<number, string>(snapAll.map((s: any) => [s.id, s.data]))
  const onlineG: Record<number, number> = {}
  ;(precosRows as any[]).forEach(p => {
    if (p.mediana_normalizada == null) return
    const d = dateOf.get(p.snapshot_id); if (snapshotData && d && d > snapshotData) return
    onlineG[p.ingrediente_id] = Number(p.mediana_normalizada)
  })
  // base do índice por ingrediente (R$/g): online, senão manual; custo fixo tratado à parte
  const baseG = (iid: number): number | null => {
    if (onlineG[iid] != null) return onlineG[iid]
    const pm = ing.get(iid)?.preco_manual
    return pm != null ? Number(pm) / 1000 : null
  }
  const fixoDe = (iid: number): number | null => { const f = ing.get(iid)?.custo_fixo; return f != null ? Number(f) : null }

  const recPorPrato: Record<number, { ing: number; qtd: number }[]> = {}
  ;(receitas as any[]).forEach(r => { (recPorPrato[r.prato_id] ||= []).push({ ing: r.ingrediente_id, qtd: Number(r.qtd_g) }) })
  const pratos = ((pratosRows.data || []) as any[]).map(p => ({ id: p.id, regiao: calibRegiao(p.regiao, null) }))

  // leituras de campo por (regiao, tipo, ingrediente) dentro do intervalo
  const fieldRows: Record<string, { g: number; user_id: string; data: string; cidade: string | null; uf: string | null }[]> = {}
  let contribsUsadas = 0
  const userIds: string[] = []
  ;(contribs as any[]).forEach(c => {
    const tipo = c.tipo_loja
    if (tipo !== 'Mercado' && tipo !== 'Atacarejo') return
    const d = (c.criado_em || '').slice(0, 10)
    if ((ini && d < ini) || (fim && d > fim)) return
    const regiao = calibRegiao(c.regiao, c.uf); if (!regiao) return
    const iid = c.ingrediente_id; if (iid == null) return
    const preco = Number(c.preco), peso = Number(c.peso_g)
    if (!(preco > 0) || !(peso > 0)) return
    const u = ing.get(iid)
    const gramas = (u?.unidade === 'unidade' || u?.unidade === 'maco') ? peso * (Number(u?.peso_ref_g) || 0) : peso
    if (!(gramas > 0)) return
    ;(fieldRows[`${regiao}|${tipo}|${iid}`] ||= []).push({ g: preco / gramas, user_id: c.user_id, data: d, cidade: c.cidade, uf: c.uf })
    if (c.user_id) userIds.push(c.user_id)
    contribsUsadas++
  })
  const nomes = await nomesPorId(userIds)

  // desconto medido por (regiao, tipo, ingrediente) = 1 − mediana(campo)/online
  const itens: CalibItem[] = []
  const descIngKey: Record<string, number> = {}   // regiao|tipo|iid → desconto clampado p/ o índice
  for (const key in fieldRows) {
    const [regiao, tipo, iidStr] = key.split('|'); const iid = +iidStr
    const rows = fieldRows[key]
    const fieldG = mediana(rows.map(r => r.g)); const onG = onlineG[iid]
    if (onG == null || !(onG > 0)) continue
    const desconto = 1 - fieldG / onG
    itens.push({
      regiao, tipo: tipo as CalibTipo, ingrediente_id: iid, nome: ing.get(iid)?.nome || `#${iid}`,
      desconto, n: rows.length, fieldKg: fieldG * 1000, onlineKg: onG * 1000,
      fontes: rows.map(r => ({ nome: nomes[r.user_id] || 'anônimo', data: r.data, cidade: r.cidade, uf: r.uf, precoKg: r.g * 1000 }))
        .sort((a, b) => b.data.localeCompare(a.data)),
    })
    descIngKey[key] = Math.min(0.6, Math.max(0, desconto))   // clamp [0, 60%] p/ não deixar 1 leitura ruim explodir o índice
  }

  // índice (mediana dos custos dos pratos da região) sob um desconto por ingrediente
  const indiceRegiao = (regiao: string, descIng: (iid: number) => number): number => {
    const custos: number[] = []
    for (const p of pratos) {
      if (p.regiao !== regiao) continue
      const itensR = recPorPrato[p.id]; if (!itensR) continue
      let c = 0
      for (const it of itensR) {
        const fx = fixoDe(it.ing)
        if (fx != null) { c += fx; continue }
        const b = baseG(it.ing); if (b == null) continue
        c += b * it.qtd * (1 - descIng(it.ing))
      }
      if (c > 0) custos.push(c)
    }
    return custos.length ? mediana(custos) : 0
  }

  const regioes: CalibRegiao[] = CALIB_REGIOES.map(regiao => {
    const nPratos = pratos.filter(p => p.regiao === regiao).length
    const indiceOnline = indiceRegiao(regiao, () => 0)
    const resumo = (tipo: CalibTipo): CalibTipoResumo => {
      const def = CALIB_DEFAULT[tipo]
      const medidos = itens.filter(x => x.regiao === regiao && x.tipo === tipo)
      return {
        assumidoPct: def,
        medidoPct: medidos.length ? mediana(medidos.map(x => x.desconto)) : null,
        cobertura: medidos.length,
        indiceAssumido: indiceRegiao(regiao, () => def),
        indiceCalibrado: indiceRegiao(regiao, iid => descIngKey[`${regiao}|${tipo}|${iid}`] ?? def),
      }
    }
    return { regiao, indiceOnline, nPratos, mercado: resumo('Mercado'), atacarejo: resumo('Atacarejo') }
  })

  itens.sort((a, b) => a.regiao.localeCompare(b.regiao) || a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome))
  return { regioes, itens, snapshotData, snapshotId, contribsUsadas }
}

// Snapshots do modelo novo (com custos_pratos), mais recente primeiro.
export async function getSnapshotsNovos(): Promise<{ id: number; data: string }[]> {
  const [cp, snaps] = await Promise.all([
    // fetchAll: custos_pratos passa de 1000 linhas (snapshots antigos incluídos);
    // sem paginação o PostgREST corta e coletas recentes somem da home
    fetchAll(() => supabase.from('custos_pratos').select('snapshot_id').order('id')),
    supabase.from('snapshots').select('id,data').gte('data', CORTE_COLETA).order('data', { ascending: false }),
  ])
  const novos = new Set((cp as any[]).map(r => r.snapshot_id))
  return ((snaps.data || []) as any[]).filter(s => novos.has(s.id)).map(s => ({ id: s.id, data: s.data }))
}

export type LinhaIngrediente = {
  id: number; nome: string; categoria: string | null; label: string
  mediana: number | null; media: number | null; min: number | null; max: number | null; dp: number | null
  n: number; inflacao: number | null   // inflacao = variação da mediana vs coleta anterior
}

// Detalhamento por ingrediente de um snapshot: estatísticas (já gravadas em `precos`)
// + categoria + inflação vs a coleta anterior.
export async function getDetalheIngredientes(snapshotId: number): Promise<LinhaIngrediente[]> {
  const novos = await getSnapshotsNovos()
  const idx = novos.findIndex(s => s.id === snapshotId)
  const prevId = idx >= 0 && idx + 1 < novos.length ? novos[idx + 1].id : null
  const [cur, prev, ings] = await Promise.all([
    supabase.from('precos').select('ingrediente_id,nome_ingrediente,mediana_exibicao,media_exibicao,minimo_exibicao,maximo_exibicao,desvio_padrao,qtd_resultados,label').eq('snapshot_id', snapshotId),
    prevId ? supabase.from('precos').select('ingrediente_id,mediana_exibicao').eq('snapshot_id', prevId) : Promise.resolve({ data: [] as any[] }),
    supabase.from('ingredientes').select('id,categoria'),
  ])
  const catMap = new Map<number, string | null>(); ((ings.data || []) as any[]).forEach(i => catMap.set(i.id, i.categoria))
  const prevMap = new Map<number, number>(); ((prev.data || []) as any[]).forEach(p => { if (p.mediana_exibicao != null) prevMap.set(p.ingrediente_id, Number(p.mediana_exibicao)) })
  const num = (v: any) => v != null ? Number(v) : null
  return ((cur.data || []) as any[]).map(p => {
    const med = num(p.mediana_exibicao)
    const pm = prevMap.get(p.ingrediente_id)
    return {
      id: p.ingrediente_id, nome: p.nome_ingrediente,
      categoria: p.ingrediente_id != null ? (catMap.get(p.ingrediente_id) ?? null) : null, label: p.label,
      mediana: med, media: num(p.media_exibicao), min: num(p.minimo_exibicao), max: num(p.maximo_exibicao),
      dp: num(p.desvio_padrao), n: p.qtd_resultados || 0,
      inflacao: (med != null && pm != null && pm > 0) ? (med - pm) / pm : null,
    }
  }).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
}

// Detalhamento por ingrediente AGREGADO num intervalo de coletas: mediana/média =
// média das coletas do período; mín/máx = extremos; n/±DP = média; variação = da
// mediana entre a 1ª e a última coleta do período.
export async function getDetalheIngredientesRange(ini: string, fim: string): Promise<LinhaIngrediente[]> {
  const novos = await getSnapshotsNovos()   // desc
  const range = novos.filter(s => (!ini || s.data >= ini) && (!fim || s.data <= fim))
  if (range.length <= 1) return getDetalheIngredientes(range[0]?.id ?? novos[0]?.id)
  const ids = range.map(s => s.id)
  const latestId = range[0].id, earliestId = range[range.length - 1].id
  const [precos, ings] = await Promise.all([
    fetchAll(() => supabase.from('precos').select('snapshot_id,ingrediente_id,nome_ingrediente,mediana_exibicao,media_exibicao,minimo_exibicao,maximo_exibicao,desvio_padrao,qtd_resultados,label').in('snapshot_id', ids).order('id')),
    supabase.from('ingredientes').select('id,categoria'),
  ])
  const catMap = new Map<number, string | null>(); ((ings.data || []) as any[]).forEach(i => catMap.set(i.id, i.categoria))
  const byIng: Record<number, any[]> = {}
  ;(precos as any[]).forEach(p => { if (p.ingrediente_id != null) (byIng[p.ingrediente_id] ||= []).push(p) })
  const num = (v: any) => v != null ? Number(v) : null
  const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
  return Object.keys(byIng).map(k => {
    const id = +k, rows = byIng[id]
    const med = avg(rows.map(r => num(r.mediana_exibicao)).filter((v): v is number => v != null))
    const medL = num(rows.find(r => r.snapshot_id === latestId)?.mediana_exibicao)
    const medE = num(rows.find(r => r.snapshot_id === earliestId)?.mediana_exibicao)
    const mins = rows.map(r => num(r.minimo_exibicao)).filter((v): v is number => v != null)
    const maxs = rows.map(r => num(r.maximo_exibicao)).filter((v): v is number => v != null)
    return {
      id, nome: rows[0].nome_ingrediente, categoria: catMap.get(id) ?? null, label: rows[0].label,
      mediana: med, media: avg(rows.map(r => num(r.media_exibicao)).filter((v): v is number => v != null)),
      min: mins.length ? Math.min(...mins) : null, max: maxs.length ? Math.max(...maxs) : null,
      dp: avg(rows.map(r => num(r.desvio_padrao)).filter((v): v is number => v != null)),
      n: Math.round(avg(rows.map(r => r.qtd_resultados || 0)) || 0),
      inflacao: (medL != null && medE != null && medE > 0) ? (medL - medE) / medE : null,
    }
  }).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
}

// Ranking de contribuidores do mês (via RPC top_contribuidores — migration 24).
export type Contribuidor = { user_id: string; nome: string; cidade: string | null; uf: string | null; entradas: number; ingredientes: number; ultima: string }
export async function getTopContribuidores(mes: string): Promise<Contribuidor[]> {
  const { data, error } = await supabase.rpc('top_contribuidores', { mes })
  if (error) return []
  return (data || []) as Contribuidor[]
}

// Contribuições de campo aprovadas com coordenada, p/ o mapa — com campos filtráveis.
export type PontoContrib = {
  lat: number; lng: number; nome: string; ingrediente_id: number | null
  tipo_loja: string | null; regiao: string | null; uf: string | null; data: string; criado_em: string
  preco: number | null; cidade: string | null
}
export async function getContribuicoesMapa(): Promise<PontoContrib[]> {
  const data = await fetchAll(() => supabase.from('contribuicoes')
    .select('lat,lng,cidade,preco,criado_em,tipo_loja,uf,regiao,ingrediente_id,ingredientes(nome)')
    .eq('status', 'aprovada').not('lat', 'is', null).not('lng', 'is', null)
    .order('criado_em', { ascending: false }))
  return ((data || []) as any[]).map(c => ({
    lat: Number(c.lat), lng: Number(c.lng), nome: c.ingredientes?.nome || 'contribuição',
    ingrediente_id: c.ingrediente_id, tipo_loja: c.tipo_loja, regiao: c.regiao, uf: c.uf,
    data: (c.criado_em || '').slice(0, 10), criado_em: c.criado_em || '', preco: c.preco != null ? Number(c.preco) : null, cidade: c.cidade,
  }))
}

export async function getIngredientes(): Promise<Ing[]> {
  const { data } = await supabase.from('ingredientes').select('id,nome,categoria,unidade,peso_ref_g').order('nome')
  return (data as Ing[]) || []
}

// uma tentativa extra após pausa curta — cobre falha transitória de rede/token
export async function comRetry<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn() } catch {
    await new Promise(r => setTimeout(r, 800))
    return fn()
  }
}

// as queries de dados do usuário lançam em erro de rede/auth (em vez de
// devolver vazio) para as telas poderem tentar de novo em vez de ficar em "—"
export async function getProfile(uid: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('id,nome,telefone,regiao,is_admin,sexo,data_nascimento,avatar_url').eq('id', uid).maybeSingle()
  if (error) throw error
  return (data as Profile) ?? null
}

export async function getMinhasContribuicoes(uid: string): Promise<Contribuicao[]> {
  const { data, error } = await supabase.from('contribuicoes')
    .select('id,produto,preco,status,foto_url,criado_em,cidade,endereco,lat,lng,ingredientes(nome)')
    .eq('user_id', uid).order('criado_em', { ascending: false })
  if (error) throw error
  return (data as unknown as Contribuicao[]) || []
}

export async function isAdmin(uid: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', uid).single()
  return !!(data as any)?.is_admin
}

export async function isSuper(uid: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('is_super').eq('id', uid).single()
  return !!(data as any)?.is_super
}

export async function getContribuicoes(status: string): Promise<ContribuicaoFull[]> {
  const data = await fetchAll(() => supabase.from('contribuicoes')
    .select('id,user_id,ingrediente_id,produto,marca,preco,peso_g,tipo_loja,mercado,cidade,lat,lng,foto_url,foto_etiqueta_url,status,criado_em,ingredientes(nome)')
    .eq('status', status).order('criado_em', { ascending: true }))
  return (data as unknown as ContribuicaoFull[]) || []
}

export async function moderarContribuicao(id: number, campos: Record<string, any>) {
  return supabase.from('contribuicoes').update(campos).eq('id', id)
}

export const APROVADAS_PAGINA = 20

// contribuições aprovadas, para a esteira de auditoria. Paginada (range) para não
// carregar tudo. Filtros: período (desde), preço mínimo (R$ — caça erros tipo "799")
// e busca server-side por produto/mercado + ingredientes resolvidos no cliente
// (ingIds, já que o nome do ingrediente está em tabela ligada). Retorna o total.
export async function getContribuicoesAprovadas(opts: {
  desde?: string; precoMin?: number; busca?: string; ingIds?: number[]; offset?: number
} = {}): Promise<{ rows: ContribuicaoFull[]; total: number }> {
  const offset = opts.offset ?? 0
  let q = supabase.from('contribuicoes')
    .select('id,user_id,ingrediente_id,produto,marca,preco,peso_g,tipo_loja,mercado,cidade,lat,lng,foto_url,foto_etiqueta_url,status,criado_em,aprovado_por,aprovado_dispositivo,aprovado_lat,aprovado_lng,ingredientes(nome)', { count: 'exact' })
    .eq('status', 'aprovada')
  if (opts.desde) q = q.gte('criado_em', opts.desde)
  if (opts.precoMin != null) q = q.gte('preco', opts.precoMin)
  const b = opts.busca?.trim().replace(/[(),*%]/g, ' ').trim()  // limpa chars que quebram o filtro or
  if (b) {
    const ors = [`produto.ilike.*${b}*`, `mercado.ilike.*${b}*`]
    if (opts.ingIds?.length) ors.push(`ingrediente_id.in.(${opts.ingIds.join(',')})`)
    q = q.or(ors.join(','))
  }
  const { data, count } = await q.order('criado_em', { ascending: false }).range(offset, offset + APROVADAS_PAGINA - 1)
  const rows = (data as any[]) || []
  const nomes = await nomesPorId(rows.map(r => r.aprovado_por))
  return {
    rows: rows.map(r => ({ ...r, aprovador_nome: r.aprovado_por ? (nomes[r.aprovado_por] ?? 'admin') : null })) as unknown as ContribuicaoFull[],
    total: count ?? 0,
  }
}

// edita uma contribuição já aprovada: propaga para a leitura ligada e refaz os
// preços efetivos. Retorna o R$/kg resultante (null se não calibra mais).
export async function editarContribuicaoAprovada(id: number, c: {
  ingrediente_id: number | null; preco: number | null; peso_g: number | null
  marca: string | null; mercado: string | null; tipo_loja: string | null; produto: string | null
}) {
  return supabase.rpc('editar_contribuicao_aprovada', {
    p_id: id, p_ingrediente: c.ingrediente_id, p_preco: c.preco, p_peso: c.peso_g,
    p_marca: c.marca, p_mercado: c.mercado, p_tipo_loja: c.tipo_loja, p_produto: c.produto,
  })
}

// aprova a contribuição E registra a leitura de campo que calibra o índice
// (vira uma leitura humana no mesmo balde das leituras manuais — média 50/50 com o online).
export async function aprovarContribuicao(
  id: number, ingrediente_id: number | null, preco: number | null, peso_g: number | null,
  marca: string | null, ctx?: { dispositivo: string; lat: number | null; lng: number | null },
) {
  return supabase.rpc('aprovar_contribuicao', {
    p_id: id, p_ingrediente: ingrediente_id, p_preco: preco, p_peso: peso_g, p_marca: marca,
    p_dispositivo: ctx?.dispositivo ?? null, p_lat: ctx?.lat ?? null, p_lng: ctx?.lng ?? null,
  })
}

export async function excluirContribuicao(id: number) {
  return supabase.from('contribuicoes').delete().eq('id', id)
}

export async function getRecompensa(uid: string) {
  const { count, error: e1 } = await supabase.from('contribuicoes')
    .select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('status', 'aprovada')
  if (e1) throw e1
  const { data: pags, error: e2 } = await supabase.from('pagamentos').select('valor,status').eq('user_id', uid)
  if (e2) throw e2
  const aprovadas = count || 0
  const ganho = aprovadas * VALOR_POR_FOTO
  const reservado = (pags || []).filter((p: any) => p.status !== 'rejeitada').reduce((s: number, p: any) => s + Number(p.valor), 0)
  return { aprovadas, ganho, disponivel: Math.max(0, ganho - reservado) }
}

export async function getDadosRecompensa(uid: string) {
  const { data, error } = await supabase.from('profiles').select('cpf,chave_pix').eq('id', uid).maybeSingle()
  if (error) throw error
  return data as { cpf: string | null; chave_pix: string | null } | null
}

export async function salvarDadosRecompensa(uid: string, cpf: string, chave_pix: string) {
  return supabase.from('profiles')
    .update({ cpf, chave_pix, consentimento_cpf_em: new Date().toISOString() }).eq('id', uid)
}

// saque via RPC validada no banco (migração 33: saldo/CPF/PIX conferidos lá).
// Fallback para o insert direto enquanto a migração não roda.
export async function solicitarSaque(uid: string, valor: number, cpf: string, chave_pix: string) {
  const r = await supabase.rpc('solicitar_saque', { p_valor: valor })
  if (r.error && /solicitar_saque/.test(r.error.message)) {
    return supabase.from('pagamentos').insert({ user_id: uid, valor, cpf, chave_pix, status: 'solicitado' })
  }
  return r
}

export async function getSaques(status: string) {
  const data = await fetchAll(() => supabase.from('pagamentos')
    .select('id,user_id,valor,cpf,chave_pix,status,criado_em')
    .eq('status', status).order('criado_em', { ascending: true }))
  const saques = (data as any[]) || []
  const ids = [...new Set(saques.map(s => s.user_id).filter(Boolean))]
  const nomes: Record<string, { nome: string | null; telefone: string | null }> = {}
  if (ids.length) {
    const { data: profs } = await supabase.from('profiles').select('id,nome,telefone').in('id', ids)
    ;(profs || []).forEach((p: any) => { nomes[p.id] = { nome: p.nome, telefone: p.telefone } })
  }
  return saques.map(s => ({ ...s, nome: nomes[s.user_id]?.nome ?? null, telefone: nomes[s.user_id]?.telefone ?? null }))
}

// histórico de saques do próprio usuário (todos os status), mais recentes primeiro
export async function getMeusSaques(uid: string) {
  const { data, error } = await supabase.from('pagamentos')
    .select('id,valor,status,criado_em,pago_em')
    .eq('user_id', uid).order('criado_em', { ascending: false })
  if (error) throw error
  return (data as { id: number; valor: number; status: string; criado_em: string; pago_em: string | null }[]) || []
}

// admin: histórico de TODOS os saques (com nome, quem pagou e contexto)
export async function getTodosSaques() {
  const data = await fetchAll(() => supabase.from('pagamentos')
    .select('id,user_id,valor,cpf,chave_pix,status,criado_em,pago_em,pago_por,pago_dispositivo,pago_lat,pago_lng')
    .order('criado_em', { ascending: false }))
  const saques = (data as any[]) || []
  const ids = [...new Set(saques.flatMap(s => [s.user_id, s.pago_por]).filter(Boolean))]
  const nomes: Record<string, { nome: string | null; telefone: string | null }> = {}
  if (ids.length) {
    const { data: profs } = await supabase.from('profiles').select('id,nome,telefone').in('id', ids)
    ;(profs || []).forEach((p: any) => { nomes[p.id] = { nome: p.nome, telefone: p.telefone } })
  }
  return saques.map(s => ({
    ...s, nome: nomes[s.user_id]?.nome ?? null, telefone: nomes[s.user_id]?.telefone ?? null,
    aprovador: s.pago_por ? (nomes[s.pago_por]?.nome ?? 'admin') : null,
  }))
}

export async function marcarSaquePago(
  id: number, uid: string, ctx?: { dispositivo: string; lat: number | null; lng: number | null },
) {
  return supabase.from('pagamentos').update({
    status: 'pago', pago_em: new Date().toISOString(),
    pago_por: uid, pago_dispositivo: ctx?.dispositivo ?? null, pago_lat: ctx?.lat ?? null, pago_lng: ctx?.lng ?? null,
  }).eq('id', id)
}

// ---- Auditoria / logins ----
export type LoginRow = { id: number; user_id: string | null; dispositivo: string | null; lat: number | null; lng: number | null; precisao: number | null; criado_em: string; nome: string | null }
export type AuditRow = { id: number; tabela: string; registro_id: string | null; acao: string; ator: string | null; dados_antes: any; dados_depois: any; criado_em: string; ator_nome: string | null }

export async function registrarLogin(uid: string, ctx: { dispositivo: string; lat: number | null; lng: number | null; precisao: number | null }) {
  return supabase.from('login_log').insert({ user_id: uid, dispositivo: ctx.dispositivo, lat: ctx.lat, lng: ctx.lng, precisao: ctx.precisao })
}

async function nomesPorId(ids: string[]): Promise<Record<string, string | null>> {
  const u = [...new Set(ids.filter(Boolean))]
  const out: Record<string, string | null> = {}
  if (u.length) {
    const { data } = await supabase.from('profiles').select('id,nome').in('id', u)
    ;(data || []).forEach((p: any) => { out[p.id] = p.nome })
  }
  return out
}

export async function getLogins(): Promise<LoginRow[]> {
  const { data } = await supabase.from('login_log')
    .select('id,user_id,dispositivo,lat,lng,precisao,criado_em').order('criado_em', { ascending: false }).limit(500)
  const rows = (data as any[]) || []
  const nomes = await nomesPorId(rows.map(r => r.user_id))
  return rows.map(r => ({ ...r, nome: r.user_id ? (nomes[r.user_id] ?? null) : null }))
}

export async function getAuditLog(opts: { tabela?: string; acao?: string; desde?: string } = {}): Promise<AuditRow[]> {
  let q = supabase.from('audit_log').select('id,tabela,registro_id,acao,ator,dados_antes,dados_depois,criado_em')
  if (opts.tabela) q = q.eq('tabela', opts.tabela)
  if (opts.acao) q = q.eq('acao', opts.acao)
  if (opts.desde) q = q.gte('criado_em', opts.desde)
  const { data } = await q.order('criado_em', { ascending: false }).limit(500)
  const rows = (data as any[]) || []
  const nomes = await nomesPorId(rows.map(r => r.ator))
  return rows.map(r => ({ ...r, ator_nome: r.ator ? (nomes[r.ator] ?? 'admin') : 'sistema' }))
}

// ---- Superusuário (god-mode) ----
// Toda ação destrutiva/edição passa por RPCs SECURITY DEFINER que fazem a
// operação E gravam em super_acoes no mesmo passo (migração 23).
type Ctx = { dispositivo: string; lat: number | null; lng: number | null }

export type SuperAcaoRow = {
  id: number; ator: string | null; ator_nome: string | null; acao: string
  tabela: string; registro_id: string | null; dados_antes: any; dados_depois: any
  dispositivo: string | null; lat: number | null; lng: number | null; criado_em: string
}

// exclui um registro (whitelist no banco). id como texto cobre bigint e uuid.
export async function superExcluir(tabela: string, id: number | string, ctx?: Ctx) {
  return supabase.rpc('super_excluir', {
    p_tabela: tabela, p_id: String(id),
    p_dispositivo: ctx?.dispositivo ?? null, p_lat: ctx?.lat ?? null, p_lng: ctx?.lng ?? null,
  })
}

export async function superEditarSaque(id: number, s: {
  valor: number; status: string; chave_pix: string | null; cpf: string | null
}, ctx?: Ctx) {
  return supabase.rpc('super_editar_saque', {
    p_id: id, p_valor: s.valor, p_status: s.status, p_chave_pix: s.chave_pix, p_cpf: s.cpf,
    p_dispositivo: ctx?.dispositivo ?? null, p_lat: ctx?.lat ?? null, p_lng: ctx?.lng ?? null,
  })
}

export async function superEditarPerfil(id: string, p: {
  nome: string | null; telefone: string | null; regiao: string | null
  is_admin: boolean; is_super: boolean
}, ctx?: Ctx) {
  return supabase.rpc('super_editar_perfil', {
    p_id: id, p_nome: p.nome, p_telefone: p.telefone, p_regiao: p.regiao,
    p_is_admin: p.is_admin, p_is_super: p.is_super,
    p_dispositivo: ctx?.dispositivo ?? null, p_lat: ctx?.lat ?? null, p_lng: ctx?.lng ?? null,
  })
}

export async function getSuperAcoes(opts: { tabela?: string; acao?: string; desde?: string } = {}): Promise<SuperAcaoRow[]> {
  let q = supabase.from('super_acoes')
    .select('id,ator,ator_nome,acao,tabela,registro_id,dados_antes,dados_depois,dispositivo,lat,lng,criado_em')
  if (opts.tabela) q = q.eq('tabela', opts.tabela)
  if (opts.acao) q = q.eq('acao', opts.acao)
  if (opts.desde) q = q.gte('criado_em', opts.desde)
  const { data } = await q.order('criado_em', { ascending: false }).limit(500)
  return (data as SuperAcaoRow[]) || []
}

export type IngManual = {
  id: number; nome: string; categoria: string | null
  preco_manual: number | null; custo_fixo: number | null
  preco_manual_loja: string | null; preco_manual_link: string | null
  preco_manual_em: string | null
}

export type PrecoManualHist = {
  id: number; preco_manual: number | null; custo_fixo: number | null
  loja: string | null; link: string | null; tipo_local: string | null; criado_em: string
}

export async function getIngredientesManuais(): Promise<IngManual[]> {
  const { data } = await supabase.from('ingredientes')
    .select('id,nome,categoria,preco_manual,custo_fixo,preco_manual_loja,preco_manual_link,preco_manual_em')
    .or('preco_manual.not.is.null,custo_fixo.not.is.null').order('nome')
  return (data as IngManual[]) || []
}

// registra uma LEITURA manual (R$/kg) e recalcula o preço efetivo (mediana 5 dias).
export async function setPrecoManual(id: number, campos: {
  preco_manual?: number | null; custo_fixo?: number | null; loja?: string; link?: string; tipo?: string
}) {
  return supabase.rpc('salvar_leitura_manual', {
    p_id: id,
    p_preco: campos.preco_manual ?? null,
    p_fixo: campos.custo_fixo ?? null,
    p_loja: campos.loja || null,
    p_link: campos.link || null,
    p_tipo: campos.tipo || null,
  })
}

export async function limparPrecoManual(id: number) {
  return supabase.from('ingredientes')
    .update({ preco_manual: null, custo_fixo: null, preco_manual_loja: null, preco_manual_link: null }).eq('id', id)
}

// por ingrediente, quais origens de leitura existem: rede (manual/admin) e/ou campo (usuário)
export async function getOrigensManuais(): Promise<Record<number, { net: boolean; campo: boolean }>> {
  const rows = await fetchAll(() => supabase.from('precos_manuais_hist').select('ingrediente_id,origem').order('id'))
  const out: Record<number, { net: boolean; campo: boolean }> = {}
  ;(rows as any[]).forEach(r => {
    const o = (out[r.ingrediente_id] ||= { net: false, campo: false })
    if (r.origem === 'campo') o.campo = true; else o.net = true   // default 'manual' → rede
  })
  return out
}

// edita uma leitura do histórico (tipo/fonte/link/preço) e recalcula o efetivo
export async function editarLeituraManual(id: number, campos: {
  preco_manual?: number | null; loja?: string; link?: string; tipo?: string
}) {
  return supabase.rpc('editar_leitura_manual', {
    p_id: id,
    p_preco: campos.preco_manual ?? null,
    p_loja: campos.loja || null,
    p_link: campos.link || null,
    p_tipo: campos.tipo || null,
  })
}

export async function getHistoricoManual(ingredienteId: number): Promise<PrecoManualHist[]> {
  const { data } = await supabase.from('precos_manuais_hist')
    .select('id,preco_manual,custo_fixo,loja,link,tipo_local,criado_em')
    .eq('ingrediente_id', ingredienteId).order('criado_em', { ascending: false })
  return (data as PrecoManualHist[]) || []
}

// Detalhe dos ENCONTRADOS da última coleta, com sinais para auditoria visual:
// Δ% da mediana vs a coleta anterior e amplitude min→max dentro da própria
// coleta (amplitude alta = itens premium/gourmet/preparados misturados na busca).
export type ItemEncontrado = {
  id: number; nome: string; label: string | null; n: number
  mediana: number | null           // mediana_exibicao (R$/kg ou R$/L)
  minimo: number | null; maximo: number | null
  delta: number | null             // % vs coleta anterior (null = sem referência)
  amplitude: number | null         // maximo/minimo (× — null com <2 resultados)
}
export async function getDetalheEncontrados(snapshotId?: number): Promise<ItemEncontrado[]> {
  let atual: { id: number } | undefined, anterior: { id: number } | undefined
  if (snapshotId) {
    atual = { id: snapshotId }
    const { data: ant } = await supabase.from('snapshots')
      .select('id').lt('id', snapshotId).order('id', { ascending: false }).limit(1)
    anterior = (ant || [])[0] as { id: number } | undefined
  } else {
    const { data: snaps } = await supabase.from('snapshots')
      .select('id').order('id', { ascending: false }).limit(2)
    ;[atual, anterior] = (snaps || []) as { id: number }[]
  }
  if (!atual) return []
  const cols = 'ingrediente_id,nome_ingrediente,mediana_exibicao,minimo_exibicao,maximo_exibicao,label,qtd_resultados'
  const [{ data: rows }, { data: antRows }] = await Promise.all([
    supabase.from('precos').select(cols).eq('snapshot_id', atual.id).gt('qtd_resultados', 0),
    anterior
      ? supabase.from('precos').select('ingrediente_id,mediana_exibicao').eq('snapshot_id', anterior.id).gt('qtd_resultados', 0)
      : Promise.resolve({ data: [] as any[] }),
  ])
  const ant = new Map(((antRows || []) as any[]).map(r => [r.ingrediente_id, Number(r.mediana_exibicao)]))
  return ((rows || []) as any[]).map(r => {
    const med = r.mediana_exibicao != null ? Number(r.mediana_exibicao) : null
    const ref = ant.get(r.ingrediente_id)
    const mn = r.minimo_exibicao != null ? Number(r.minimo_exibicao) : null
    const mx = r.maximo_exibicao != null ? Number(r.maximo_exibicao) : null
    return {
      id: r.ingrediente_id, nome: r.nome_ingrediente, label: r.label, n: r.qtd_resultados || 0,
      mediana: med, minimo: mn, maximo: mx,
      delta: med != null && ref != null && ref > 0 ? (med - ref) / ref * 100 : null,
      amplitude: mn != null && mx != null && mn > 0 && (r.qtd_resultados || 0) >= 2 ? mx / mn : null,
    }
  })
}

// aprova (integra) a última coleta. Fallback: antes da migração 31 a RPC
// dedicada não existe — recalcular_custos_ultimo_snapshot cumpre o papel.
export async function aprovarUltimaColeta() {
  const r = await supabase.rpc('aprovar_ultima_coleta')
  if (r.error && /aprovar_ultima_coleta/.test(r.error.message)) return recalcularCustos()
  return r
}

export async function recalcularCustos() {
  return supabase.rpc('recalcular_custos_ultimo_snapshot')
}

// ---- Auditoria (super) ----
export type VariacaoForte = { id: number; nome: string; medAnt: number; medAtual: number; delta: number; label: string }
// Ingredientes com |Δ%| >= limiar na mediana entre as duas coletas mais recentes.
export async function getVariacoesFortes(limiar = 0.3): Promise<VariacaoForte[]> {
  const novos = await getSnapshotsNovos()
  if (novos.length < 2) return []
  const [c, p] = await Promise.all([
    supabase.from('precos').select('ingrediente_id,nome_ingrediente,mediana_exibicao,label').eq('snapshot_id', novos[0].id),
    supabase.from('precos').select('ingrediente_id,mediana_exibicao').eq('snapshot_id', novos[1].id),
  ])
  const prevMap = new Map<number, number>(); ((p.data || []) as any[]).forEach(r => { if (r.mediana_exibicao != null) prevMap.set(r.ingrediente_id, Number(r.mediana_exibicao)) })
  const out: VariacaoForte[] = []
  ;((c.data || []) as any[]).forEach(r => {
    const cur = r.mediana_exibicao != null ? Number(r.mediana_exibicao) : null
    const pv = prevMap.get(r.ingrediente_id)
    if (cur != null && pv != null && pv > 0) { const d = (cur - pv) / pv; if (Math.abs(d) >= limiar) out.push({ id: r.ingrediente_id, nome: r.nome_ingrediente, medAnt: pv, medAtual: cur, delta: d, label: r.label }) }
  })
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
}

export type EntradaBruta = { id: number; titulo: string; loja: string; preco_bruto: number | null; preco_normalizado: number | null; exibicao: string; link: string }
// Entradas brutas (resultados_brutos) de um ingrediente. Sem snapshotId usa a
// coleta integrada mais recente (aba Dados); com snapshotId usa a indicada
// (modal da aba Coleta, que audita também a coleta pendente).
export async function getEntradasIngrediente(ingredienteId: number, snapshotId?: number): Promise<{ snapshotId: number; entradas: EntradaBruta[] }> {
  let snapId = snapshotId
  if (!snapId) {
    const novos = await getSnapshotsNovos()
    snapId = novos[0]?.id
  }
  if (!snapId) return { snapshotId: 0, entradas: [] }
  const { data } = await supabase.from('resultados_brutos')
    .select('id,titulo,loja,preco_bruto,preco_normalizado,exibicao,link')
    .eq('snapshot_id', snapId).eq('ingrediente_id', ingredienteId).order('preco_bruto')
  return { snapshotId: snapId, entradas: (data || []) as EntradaBruta[] }
}

// Exclui uma entrada bruta e recomputa a estatística do ingrediente (precos) + o índice.
export async function excluirEntradaERecalcular(id: number, snapshotId: number, ingredienteId: number, ctx?: Ctx) {
  // exclui via RPC de super (whitelist inclui resultados_brutos na migração 25) →
  // a exclusão fica registrada em "Ações do super". Só então recalcula.
  const { error } = await superExcluir('resultados_brutos', id, ctx)
  if (error) return { error }
  const { data } = await supabase.from('resultados_brutos').select('preco_normalizado').eq('snapshot_id', snapshotId).eq('ingrediente_id', ingredienteId)
  const vals = ((data || []) as any[]).map(r => Number(r.preco_normalizado)).filter(v => !isNaN(v)).sort((a, b) => a - b)
  const r2 = (n: number) => Math.round(n * 100) / 100
  if (vals.length) {
    const n = vals.length, mid = Math.floor(n / 2)
    const med = n % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2
    const media = vals.reduce((a, b) => a + b, 0) / n
    const dp = Math.sqrt(vals.reduce((s, x) => s + (x - media) ** 2, 0) / n)
    const { error: upErr } = await supabase.from('precos').update({
      mediana_normalizada: med, mediana_exibicao: r2(med * 1000), media_exibicao: r2(media * 1000),
      minimo_exibicao: r2(vals[0] * 1000), maximo_exibicao: r2(vals[n - 1] * 1000), desvio_padrao: r2(dp * 1000), qtd_resultados: n,
    }).eq('snapshot_id', snapshotId).eq('ingrediente_id', ingredienteId)
    if (upErr) return { error: upErr }   // estatística não atualizou: não reporta sucesso
  } else {
    const { error: upErr } = await supabase.from('precos').update({ mediana_normalizada: null, mediana_exibicao: null, media_exibicao: null, minimo_exibicao: null, maximo_exibicao: null, desvio_padrao: null, qtd_resultados: 0 })
      .eq('snapshot_id', snapshotId).eq('ingrediente_id', ingredienteId)
    if (upErr) return { error: upErr }
  }
  return recalcularCustos()
}

// ---- Painel de controle (admin) ----
export type PainelContrib = {
  id: number; user_id: string; ingrediente_id: number | null
  preco: number | null; peso_g: number | null; status: string; criado_em: string
  cidade: string | null; lat: number | null; lng: number | null
  mercado: string | null; tipo_loja: string | null; marca: string | null
  produto: string | null; ingredientes: { nome: string } | null
}
export type PerfilBasico = {
  id: string; nome: string | null; regiao: string | null
  telefone: string | null; sexo: string | null; data_nascimento: string | null
  is_admin: boolean | null; is_super: boolean | null
}

// todas as contribuições (volume pequeno → agregação no cliente)
export async function getPainelContribuicoes(): Promise<PainelContrib[]> {
  const data = await fetchAll(() => supabase.from('contribuicoes')
    .select('id,user_id,ingrediente_id,preco,peso_g,status,criado_em,cidade,lat,lng,mercado,tipo_loja,marca,produto,ingredientes(nome)')
    .order('criado_em', { ascending: false }))
  return (data as unknown as PainelContrib[]) || []
}

// perfis dos contribuidores (mesmo padrão do getSaques: por ids)
export async function getPerfis(ids: string[]): Promise<PerfilBasico[]> {
  if (!ids.length) return []
  const { data } = await supabase.from('profiles')
    .select('id,nome,regiao,telefone,sexo,data_nascimento,is_admin,is_super').in('id', ids)
  return (data as PerfilBasico[]) || []
}

// nº de pratos distintos por ingrediente (impacto no índice)
export async function getUsoPorIngrediente(): Promise<Record<number, number>> {
  const rows = await fetchAll(() => supabase.from('receitas').select('ingrediente_id,prato_id'))
  const sets: Record<number, Set<number>> = {}
  ;(rows as any[]).forEach(r => { (sets[r.ingrediente_id] ||= new Set()).add(r.prato_id) })
  const out: Record<number, number> = {}
  Object.entries(sets).forEach(([k, v]) => { out[+k] = v.size })
  return out
}

// ── Home V1 (Fase 5) ─────────────────────────────────────────────────────────

// contagens reais exibidas no hero (nada de números de marketing)
export type StatsPublicas = { pratos: number; ingredientes: number; contribuicoesAprovadas: number }
export async function getStatsPublicas(): Promise<StatsPublicas> {
  const [p, i, c] = await Promise.all([
    supabase.from('pratos').select('id', { count: 'exact', head: true }),
    supabase.from('ingredientes').select('id', { count: 'exact', head: true }).eq('ativo', true),
    supabase.from('contribuicoes').select('id', { count: 'exact', head: true }).eq('status', 'aprovada'),
  ])
  return { pratos: p.count ?? 0, ingredientes: i.count ?? 0, contribuicoesAprovadas: c.count ?? 0 }
}

// custo de cada prato em cada coleta do modelo novo — base do gráfico do
// índice, dos movers e das sparklines da home (derivações no cliente)
export type SeriePratos = {
  snaps: { id: number; data: string }[]                  // ascendente
  pratos: { id: number; nome: string; regiao: string }[]
  custos: Record<number, (number | null)[]>              // pratoId → custo por coleta
}
export async function getSeriePratos(): Promise<SeriePratos> {
  const snaps = [...(await getSnapshotsNovos())].reverse()
  if (!snaps.length) return { snaps: [], pratos: [], custos: {} }
  const idx = new Map(snaps.map((s, i) => [s.id, i]))
  const rows = await fetchAll<any>(() => supabase.from('custos_pratos')
    .select('snapshot_id, prato_id, custo_total, pratos(id, nome, regiao)')
    .in('snapshot_id', snaps.map(s => s.id)))
  const pratos = new Map<number, { id: number; nome: string; regiao: string }>()
  const custos: Record<number, (number | null)[]> = {}
  for (const r of rows) {
    const p = r.pratos
    if (p && !pratos.has(p.id)) pratos.set(p.id, { id: p.id, nome: p.nome, regiao: p.regiao })
    const arr = (custos[r.prato_id] ||= Array(snaps.length).fill(null))
    const i = idx.get(r.snapshot_id)
    if (i != null) arr[i] = Number(r.custo_total)
  }
  return { snaps, pratos: [...pratos.values()], custos }
}

// preço por ingrediente × região (tabela "produtos por região" da home).
// Online = mediana nacional da coleta (label próprio). Campo = R$/kg por
// região a partir das contribuições aprovadas (itens por unidade/maço
// convertidos pelo peso de referência) — célula vazia onde não há dado (D7).
export type ProdutoRegiao = {
  id: number; nome: string; label: string | null
  online: number | null
  campo: Record<string, { valor: number; n: number }>
}
export async function getPrecosPorRegiao(snapshotId: number): Promise<ProdutoRegiao[]> {
  const [precos, ingsQ, contribs] = await Promise.all([
    supabase.from('precos').select('ingrediente_id,nome_ingrediente,mediana_exibicao,label').eq('snapshot_id', snapshotId),
    supabase.from('ingredientes').select('id,unidade,peso_ref_g'),
    fetchAll(() => supabase.from('contribuicoes').select('ingrediente_id,preco,peso_g,regiao,uf').eq('status', 'aprovada')),
  ])
  const ing = new Map(((ingsQ.data || []) as any[]).map(i => [i.id, i]))
  const porIngReg: Record<string, number[]> = {}
  ;(contribs as any[]).forEach(c => {
    const regiao = calibRegiao(c.regiao, c.uf); if (!regiao) return
    const iid = c.ingrediente_id; if (iid == null) return
    const preco = Number(c.preco), peso = Number(c.peso_g)
    if (!(preco > 0) || !(peso > 0)) return
    const u = ing.get(iid)
    const gramas = (u?.unidade === 'unidade' || u?.unidade === 'maco') ? peso * (Number(u?.peso_ref_g) || 0) : peso
    if (!(gramas > 0)) return
    ;(porIngReg[`${iid}|${regiao}`] ||= []).push(preco / gramas * 1000)   // R$/kg
  })
  return ((precos.data || []) as any[]).map(p => {
    const campo: ProdutoRegiao['campo'] = {}
    for (const key in porIngReg) {
      const [iid, regiao] = key.split('|')
      if (Number(iid) !== p.ingrediente_id) continue
      const vals = porIngReg[key]
      campo[regiao] = { valor: mediana(vals), n: vals.length }
    }
    return {
      id: p.ingrediente_id, nome: p.nome_ingrediente, label: p.label,
      online: p.mediana_exibicao != null ? Number(p.mediana_exibicao) : null, campo,
    }
  }).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
}

// pratos que usam um ingrediente (modal da tabela produtos × região)
export type PratoDeIngrediente = { prato_id: number; nome: string; regiao: string; qtd_g: number }
export async function getPratosPorIngrediente(ingredienteId: number): Promise<PratoDeIngrediente[]> {
  const rows = await fetchAll<any>(() => supabase.from('receitas')
    .select('prato_id, qtd_g, pratos(id, nome, regiao)').eq('ingrediente_id', ingredienteId))
  return rows.map(r => ({
    prato_id: r.prato_id, nome: r.pratos?.nome ?? '', regiao: r.pratos?.regiao ?? '', qtd_g: Number(r.qtd_g),
  })).sort((a, b) => a.nome.localeCompare(b.nome))
}

// ── Publicidade (Fase 9 — house ads) ─────────────────────────────────────────

export type Anuncio = {
  id: number; slot: string; titulo: string; texto: string | null
  imagem_url: string | null; link: string | null; anunciante: string | null; escala: number
  ativo: boolean; inicio: string | null; fim: string | null; peso: number
}

// criativo de um slot, sorteado por peso; null se não há (ou a migração 28
// ainda não rodou — o slot simplesmente não renderiza)
export async function getAnuncioParaSlot(slot: string): Promise<Anuncio | null> {
  // janela de veiculação: inicio/fim nulos = sem limite (os .or() combinam com AND)
  const hoje = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase.from('anuncios')
    .select('id,slot,titulo,texto,imagem_url,link,anunciante,ativo,inicio,fim,peso,escala')
    .eq('slot', slot).eq('ativo', true)
    .or(`inicio.is.null,inicio.lte.${hoje}`)
    .or(`fim.is.null,fim.gte.${hoje}`)
  if (error || !data?.length) return null
  const total = data.reduce((s, a) => s + (a.peso || 1), 0)
  let sorteio = Math.random() * total
  for (const a of data) { sorteio -= (a.peso || 1); if (sorteio <= 0) return a as Anuncio }
  return data[0] as Anuncio
}

export function registrarEventoAd(anuncioId: number, tipo: 'imp' | 'click', pagina: string) {
  // fire-and-forget: falha de RLS/migração não pode afetar a página
  supabase.from('anuncio_eventos').insert({ anuncio_id: anuncioId, tipo, pagina }).then(() => {}, () => {})
}

// admin: lista completa + métricas agregadas
export async function getAnuncios(): Promise<(Anuncio & { imps: number; clicks: number })[]> {
  const [ads, evs] = await Promise.all([
    supabase.from('anuncios').select('id,slot,titulo,texto,imagem_url,link,anunciante,ativo,inicio,fim,peso,escala').order('criado_em', { ascending: false }),
    fetchAll<any>(() => supabase.from('anuncio_eventos').select('anuncio_id,tipo')),
  ])
  const m: Record<number, { imps: number; clicks: number }> = {}
  for (const e of evs) {
    const x = (m[e.anuncio_id] ||= { imps: 0, clicks: 0 })
    if (e.tipo === 'imp') x.imps++; else x.clicks++
  }
  return ((ads.data || []) as Anuncio[]).map(a => ({ ...a, ...(m[a.id] ?? { imps: 0, clicks: 0 }) }))
}

export async function salvarAnuncio(a: Partial<Anuncio> & { id?: number }): Promise<{ error: any }> {
  const campos = {
    slot: a.slot, titulo: a.titulo, texto: a.texto || null, imagem_url: a.imagem_url || null,
    link: a.link || null, anunciante: a.anunciante || null, ativo: a.ativo ?? true,
    inicio: a.inicio || null, fim: a.fim || null, peso: a.peso || 1, escala: a.escala ?? 1,
  }
  const q = a.id
    ? supabase.from('anuncios').update(campos).eq('id', a.id)
    : supabase.from('anuncios').insert(campos)
  const { error } = await q
  return { error }
}

export async function excluirAnuncio(id: number): Promise<{ error: any }> {
  const { error } = await supabase.from('anuncios').delete().eq('id', id)
  return { error }
}

// série do preço de um ingrediente (mediana de exibição) pelas coletas do
// modelo novo — gráfico do drill de produto (fidelidade ao mockup)
export type PontoIngrediente = { data: string; valor: number; label: string | null }
export async function getSerieIngrediente(ingredienteId: number): Promise<PontoIngrediente[]> {
  const novos = [...(await getSnapshotsNovos())].reverse()   // asc
  if (!novos.length) return []
  const { data } = await supabase.from('precos')
    .select('snapshot_id,mediana_exibicao,label')
    .eq('ingrediente_id', ingredienteId).in('snapshot_id', novos.map(s => s.id))
  const porSnap = new Map(((data || []) as any[]).map(p => [p.snapshot_id, p]))
  return novos.flatMap(s => {
    const p = porSnap.get(s.id)
    return p?.mediana_exibicao != null ? [{ data: s.data, valor: Number(p.mediana_exibicao), label: p.label ?? null }] : []
  })
}
