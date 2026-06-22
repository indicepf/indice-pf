export type ModoKey = 'online' | 'mercado' | 'atacarejo'
export type OrdemKey = 'custo' | 'nome' | 'regiao'

export type Snapshot = { id: number; data: string; custo_total_pf: number | null }

export type DishCost = {
  custo_total: number
  ingredientes_cobertos: number
  ingredientes_estimados: number | null
  ingredientes_total: number
  pratos: { id: number; regiao: string; nome: string }
}

export type ItemDetalhe = {
  ingrediente_id: number
  nome: string
  categoria: string | null
  qtd_g: number
  preco_g: number | null
  origem: 'online' | 'manual' | 'fixo' | 'sem'
  custo: number
}

export type Fonte = { titulo: string; loja: string; preco_bruto: number; exibicao: string; link: string }

export type Profile = { id: string; nome: string | null; telefone: string | null; regiao: string | null }

export type Ing = { id: number; nome: string; categoria: string | null }

export type Contribuicao = {
  id: number
  produto: string | null
  preco: number
  status: string
  foto_url: string | null
  criado_em: string
  ingredientes: { nome: string } | null
}

export type ContribuicaoFull = {
  id: number
  user_id: string
  ingrediente_id: number | null
  produto: string | null
  preco: number
  peso_g: number | null
  tipo_loja: string | null
  mercado: string | null
  cidade: string | null
  lat: number | null
  lng: number | null
  foto_url: string | null
  foto_etiqueta_url: string | null
  status: string
  criado_em: string
  ingredientes: { nome: string } | null
}
