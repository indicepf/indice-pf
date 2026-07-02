import { supabase } from './supabase'
import { VALOR_POR_FOTO } from './format'
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

export type ItemColeta = { id: number; nome: string; preco_manual: number | null }
export type StatusColeta = { data: string; achados: ItemColeta[]; naoAchados: ItemColeta[] }

// Status da última coleta: data + ingredientes achados (qtd_resultados>0) vs
// não-achados (=0), a partir do snapshot mais recente. Usado na aba de superuser.
// Traz o preço manual atual de cada item para permitir cadastrá-lo nos não-achados.
export async function getStatusUltimaColeta(): Promise<StatusColeta | null> {
  const { data: snaps } = await supabase.from('snapshots')
    .select('id,data').order('data', { ascending: false }).limit(1)
  const snap = snaps?.[0] as { id: number; data: string } | undefined
  if (!snap) return null
  const { data } = await supabase.from('precos')
    .select('ingrediente_id,nome_ingrediente,qtd_resultados,ingredientes(preco_manual)')
    .eq('snapshot_id', snap.id).order('nome_ingrediente')
  const rows = (data || []) as any[]
  const achados: ItemColeta[] = [], naoAchados: ItemColeta[] = []
  for (const r of rows) {
    if (r.ingrediente_id == null) continue
    const item: ItemColeta = { id: r.ingrediente_id, nome: r.nome_ingrediente, preco_manual: r.ingredientes?.preco_manual ?? null }
    ;((r.qtd_resultados || 0) > 0 ? achados : naoAchados).push(item)
  }
  return { data: snap.data, achados, naoAchados }
}

export async function getDishCosts(snapshotId: number): Promise<DishCost[]> {
  const { data } = await supabase.from('custos_pratos')
    .select('custo_total,ingredientes_cobertos,ingredientes_estimados,ingredientes_total,pratos(id,regiao,nome)')
    .eq('snapshot_id', snapshotId)
  return (data as unknown as DishCost[]) || []
}

function montarItens(rec: any[], precoMap: Record<number, number>, manRecMap: Record<number, number>): ItemDetalhe[] {
  return rec.map((r): ItemDetalhe => {
    const ing = r.ingredientes
    const qtd = Number(r.qtd_g)
    let preco_g: number | null = null, origem: ItemDetalhe['origem'] = 'sem', custo = 0, link: string | null = null
    const mRec  = manRecMap[r.ingrediente_id] ?? null                               // manual recente (5 dias) R$/g
    const mLast = ing.preco_manual != null ? Number(ing.preco_manual) / 1000 : null // último manual conhecido (fallback)
    const o     = precoMap[r.ingrediente_id] ?? null                                // R$/g online
    const linkM = ing.preco_manual_link ?? null
    if (ing.custo_fixo != null)         { origem = 'fixo';   custo = Number(ing.custo_fixo) }
    else if (mRec != null && o != null) { origem = 'misto';  preco_g = (mRec + o) / 2; custo = preco_g * qtd; link = linkM }
    else if (mRec != null)              { origem = 'manual'; preco_g = mRec;           custo = preco_g * qtd; link = linkM }
    else if (o != null)                 { origem = 'online'; preco_g = o;              custo = preco_g * qtd }        // manual antigo não conta
    else if (mLast != null)             { origem = 'manual'; preco_g = mLast;          custo = preco_g * qtd; link = linkM } // nicho sem online
    return { ingrediente_id: r.ingrediente_id, nome: ing.nome, categoria: ing.categoria, qtd_g: qtd, preco_g, origem, custo, link }
  }).sort((a, b) => b.custo - a.custo)
}

// mediana simples (mesma regra do Python: média dos dois centrais quando par)
function mediana(v: number[]): number {
  const s = [...v].sort((a, b) => a - b), n = s.length, mid = Math.floor(n / 2)
  return n % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// Carrega a composição de TODOS os pratos de uma vez (gaveta abre instantânea, sem rede no clique).
export async function getAllDetalhes(snapshotId: number): Promise<Record<number, ItemDetalhe[]>> {
  const desde = new Date(Date.now() - 5 * 86400000).toISOString()
  const [rec, { data: precos }, { data: manuais }] = await Promise.all([
    fetchAll(() => supabase.from('receitas').select('prato_id,qtd_g,ingrediente_id,ingredientes(nome,categoria,custo_fixo,preco_manual,preco_manual_link)').order('id')),
    supabase.from('precos').select('ingrediente_id,mediana_normalizada').eq('snapshot_id', snapshotId),
    supabase.from('precos_manuais_hist').select('ingrediente_id,preco_manual').gte('criado_em', desde).not('preco_manual', 'is', null),
  ])
  const precoMap: Record<number, number> = {}
  ;(precos || []).forEach((p: any) => { if (p.mediana_normalizada != null) precoMap[p.ingrediente_id] = Number(p.mediana_normalizada) })
  // manual recente (5 dias): mediana das leituras por ingrediente → R$/g. Só ele conta como manual atual.
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

// Leituras manuais por ingrediente: as dos últimos 5 dias (as que alimentam a
// mediana atual); se não houver nenhuma recente, mostra a última leitura conhecida
// (que é o fallback usado nos itens de nicho sem cotação online).
export async function getAllFontesManuais(): Promise<Record<number, FonteManual[]>> {
  const desde = Date.now() - 5 * 86400000
  const { data } = await supabase.from('precos_manuais_hist')
    .select('ingrediente_id,preco_manual,loja,link,criado_em,origem')
    .not('preco_manual', 'is', null)
    .order('criado_em', { ascending: false })
  const todas: Record<number, FonteManual[]> = {}
  ;((data || []) as any[]).forEach(f => { (todas[f.ingrediente_id] ||= []).push(f) })
  const out: Record<number, FonteManual[]> = {}
  for (const k of Object.keys(todas)) {
    const arr = todas[+k]
    const recentes = arr.filter(f => new Date(f.criado_em).getTime() >= desde)
    out[+k] = recentes.length ? recentes : [arr[0]]   // 5 dias, ou a última leitura conhecida
  }
  return out
}

export async function getIngredientes(): Promise<Ing[]> {
  const { data } = await supabase.from('ingredientes').select('id,nome,categoria,unidade,peso_ref_g').order('nome')
  return (data as Ing[]) || []
}

export async function getProfile(uid: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('id,nome,telefone,regiao,is_admin,sexo,data_nascimento').eq('id', uid).single()
  return (data as Profile) ?? null
}

export async function getMinhasContribuicoes(uid: string): Promise<Contribuicao[]> {
  const { data } = await supabase.from('contribuicoes')
    .select('id,produto,preco,status,foto_url,criado_em,cidade,endereco,lat,lng,ingredientes(nome)')
    .eq('user_id', uid).order('criado_em', { ascending: false })
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
  const { data } = await supabase.from('contribuicoes')
    .select('id,user_id,ingrediente_id,produto,marca,preco,peso_g,tipo_loja,mercado,cidade,lat,lng,foto_url,foto_etiqueta_url,status,criado_em,ingredientes(nome)')
    .eq('status', status).order('criado_em', { ascending: true })
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
  const { count } = await supabase.from('contribuicoes')
    .select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('status', 'aprovada')
  const { data: pags } = await supabase.from('pagamentos').select('valor,status').eq('user_id', uid)
  const aprovadas = count || 0
  const ganho = aprovadas * VALOR_POR_FOTO
  const reservado = (pags || []).filter((p: any) => p.status !== 'rejeitada').reduce((s: number, p: any) => s + Number(p.valor), 0)
  return { aprovadas, ganho, disponivel: Math.max(0, ganho - reservado) }
}

export async function getDadosRecompensa(uid: string) {
  const { data } = await supabase.from('profiles').select('cpf,chave_pix').eq('id', uid).single()
  return data as { cpf: string | null; chave_pix: string | null } | null
}

export async function salvarDadosRecompensa(uid: string, cpf: string, chave_pix: string) {
  return supabase.from('profiles')
    .update({ cpf, chave_pix, consentimento_cpf_em: new Date().toISOString() }).eq('id', uid)
}

export async function solicitarSaque(uid: string, valor: number, cpf: string, chave_pix: string) {
  return supabase.from('pagamentos').insert({ user_id: uid, valor, cpf, chave_pix, status: 'solicitado' })
}

export async function getSaques(status: string) {
  const { data } = await supabase.from('pagamentos')
    .select('id,user_id,valor,cpf,chave_pix,status,criado_em')
    .eq('status', status).order('criado_em', { ascending: true })
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
  const { data } = await supabase.from('pagamentos')
    .select('id,valor,status,criado_em,pago_em')
    .eq('user_id', uid).order('criado_em', { ascending: false })
  return (data as { id: number; valor: number; status: string; criado_em: string; pago_em: string | null }[]) || []
}

// admin: histórico de TODOS os saques (com nome, quem pagou e contexto)
export async function getTodosSaques() {
  const { data } = await supabase.from('pagamentos')
    .select('id,user_id,valor,cpf,chave_pix,status,criado_em,pago_em,pago_por,pago_dispositivo,pago_lat,pago_lng')
    .order('criado_em', { ascending: false })
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
  loja: string | null; link: string | null; criado_em: string
}

export async function getIngredientesManuais(): Promise<IngManual[]> {
  const { data } = await supabase.from('ingredientes')
    .select('id,nome,categoria,preco_manual,custo_fixo,preco_manual_loja,preco_manual_link,preco_manual_em')
    .or('preco_manual.not.is.null,custo_fixo.not.is.null').order('nome')
  return (data as IngManual[]) || []
}

// registra uma LEITURA manual (R$/kg) e recalcula o preço efetivo (mediana 5 dias).
export async function setPrecoManual(id: number, campos: {
  preco_manual?: number | null; custo_fixo?: number | null; loja?: string; link?: string
}) {
  return supabase.rpc('salvar_leitura_manual', {
    p_id: id,
    p_preco: campos.preco_manual ?? null,
    p_fixo: campos.custo_fixo ?? null,
    p_loja: campos.loja || null,
    p_link: campos.link || null,
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

export async function getHistoricoManual(ingredienteId: number): Promise<PrecoManualHist[]> {
  const { data } = await supabase.from('precos_manuais_hist')
    .select('id,preco_manual,custo_fixo,loja,link,criado_em')
    .eq('ingrediente_id', ingredienteId).order('criado_em', { ascending: false })
  return (data as PrecoManualHist[]) || []
}

export async function recalcularCustos() {
  return supabase.rpc('recalcular_custos_ultimo_snapshot')
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
