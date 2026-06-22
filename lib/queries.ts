import { supabase } from './supabase'
import type { Snapshot, DishCost, ItemDetalhe, Fonte, Ing, Profile, Contribuicao, ContribuicaoFull } from './types'

export async function getLatestSnapshot(): Promise<Snapshot | null> {
  const { data } = await supabase.from('snapshots')
    .select('id,data,custo_total_pf').order('data', { ascending: false }).limit(1)
  return (data?.[0] as Snapshot) ?? null
}

export async function getDishCosts(snapshotId: number): Promise<DishCost[]> {
  const { data } = await supabase.from('custos_pratos')
    .select('custo_total,ingredientes_cobertos,ingredientes_estimados,ingredientes_total,pratos(id,regiao,nome)')
    .eq('snapshot_id', snapshotId)
  return (data as unknown as DishCost[]) || []
}

export async function getDishDetail(pratoId: number, snapshotId: number): Promise<ItemDetalhe[]> {
  const [{ data: rec }, { data: precos }] = await Promise.all([
    supabase.from('receitas')
      .select('qtd_g,ingrediente_id,ingredientes(nome,categoria,custo_fixo,preco_manual)')
      .eq('prato_id', pratoId),
    supabase.from('precos').select('ingrediente_id,mediana_normalizada').eq('snapshot_id', snapshotId),
  ])
  const precoMap: Record<number, number> = {}
  ;(precos || []).forEach((p: any) => { if (p.mediana_normalizada != null) precoMap[p.ingrediente_id] = Number(p.mediana_normalizada) })

  return ((rec || []) as any[]).map((r): ItemDetalhe => {
    const ing = r.ingredientes
    const qtd = Number(r.qtd_g)
    let preco_g: number | null = null, origem: ItemDetalhe['origem'] = 'sem', custo = 0
    if (ing.custo_fixo != null)        { origem = 'fixo';   custo = Number(ing.custo_fixo) }
    else if (ing.preco_manual != null) { origem = 'manual'; preco_g = Number(ing.preco_manual) / 1000; custo = preco_g * qtd }
    else if (precoMap[r.ingrediente_id] != null) { origem = 'online'; preco_g = precoMap[r.ingrediente_id]; custo = preco_g * qtd }
    return { ingrediente_id: r.ingrediente_id, nome: ing.nome, categoria: ing.categoria, qtd_g: qtd, preco_g, origem, custo }
  }).sort((a, b) => b.custo - a.custo)
}

export async function getFontes(ingredienteId: number, snapshotId: number): Promise<Fonte[]> {
  const { data } = await supabase.from('resultados_brutos')
    .select('titulo,loja,preco_bruto,exibicao,link')
    .eq('ingrediente_id', ingredienteId).eq('snapshot_id', snapshotId)
    .order('preco_bruto', { ascending: true })
  return (data as Fonte[]) || []
}

export async function getIngredientes(): Promise<Ing[]> {
  const { data } = await supabase.from('ingredientes').select('id,nome,categoria').order('nome')
  return (data as Ing[]) || []
}

export async function getProfile(uid: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('id,nome,telefone,regiao').eq('id', uid).single()
  return (data as Profile) ?? null
}

export async function getMinhasContribuicoes(uid: string): Promise<Contribuicao[]> {
  const { data } = await supabase.from('contribuicoes')
    .select('id,produto,preco,status,foto_url,criado_em,ingredientes(nome)')
    .eq('user_id', uid).order('criado_em', { ascending: false })
  return (data as unknown as Contribuicao[]) || []
}

export async function isAdmin(uid: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', uid).single()
  return !!(data as any)?.is_admin
}

export async function getContribuicoes(status: string): Promise<ContribuicaoFull[]> {
  const { data } = await supabase.from('contribuicoes')
    .select('id,user_id,ingrediente_id,produto,preco,peso_g,tipo_loja,mercado,cidade,lat,lng,foto_url,foto_etiqueta_url,status,criado_em,ingredientes(nome)')
    .eq('status', status).order('criado_em', { ascending: true })
  return (data as unknown as ContribuicaoFull[]) || []
}

export async function moderarContribuicao(id: number, campos: Record<string, any>) {
  return supabase.from('contribuicoes').update(campos).eq('id', id)
}

export async function excluirContribuicao(id: number) {
  return supabase.from('contribuicoes').delete().eq('id', id)
}
