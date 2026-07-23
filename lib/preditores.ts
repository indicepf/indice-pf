// Catálogo das séries preditoras (variáveis econômicas). Usado pela rota de
// leitura (/api/preditores), pelo overlay do gráfico e pela regressão.
// Client-safe (sem service role); as chaves batem com a coluna `serie` da
// tabela fatores_preditores.

export type FormatoPreditor = 'moeda' | 'percentual' | 'numero'
export type Granularidade = 'diario' | 'mensal'

export type SeriePreditor = {
  key: string
  label: string       // rótulo curto para o menu e a legenda
  unidade: string     // sufixo no eixo/tooltip
  formato: FormatoPreditor
  granularidade: Granularidade
}

export const PREDITORES: readonly SeriePreditor[] = [
  // diárias — casam com a coleta ~semanal do índice (gráfico principal)
  { key: 'dolar',            label: 'Dólar',                 unidade: 'R$',  formato: 'moeda',      granularidade: 'diario' },
  { key: 'euro',             label: 'Euro',                  unidade: 'R$',  formato: 'moeda',      granularidade: 'diario' },
  { key: 'bitcoin',          label: 'Bitcoin',               unidade: 'R$',  formato: 'moeda',      granularidade: 'diario' },
  { key: 'ibovespa',         label: 'Ibovespa',              unidade: 'pts', formato: 'numero',     granularidade: 'diario' },
  // mensais — vão para o gráfico mensal (variação % do IPCA, juros, salário)
  { key: 'selic',            label: 'SELIC (% a.a.)',        unidade: '%',   formato: 'percentual', granularidade: 'mensal' },
  { key: 'ipca',             label: 'IPCA (% mês)',          unidade: '%',   formato: 'percentual', granularidade: 'mensal' },
  { key: 'ipca_alimentacao', label: 'IPCA Alimentação',      unidade: '%',   formato: 'percentual', granularidade: 'mensal' },
  { key: 'ipca_alim_fora',   label: 'IPCA Alim. fora casa',  unidade: '%',   formato: 'percentual', granularidade: 'mensal' },
  { key: 'salario_minimo',   label: 'Salário mínimo',        unidade: 'R$',  formato: 'moeda',      granularidade: 'mensal' },
  { key: 'ipca_7659',        label: 'Diesel (% mês)',        unidade: '%',   formato: 'percentual', granularidade: 'mensal' },
  { key: 'ipca_7657',        label: 'Gasolina (% mês)',      unidade: '%',   formato: 'percentual', granularidade: 'mensal' },
  { key: 'ipca_7482',        label: 'Gás de botijão (% mês)', unidade: '%',  formato: 'percentual', granularidade: 'mensal' },
  { key: 'ipca_7283',        label: 'Carnes (% mês)',        unidade: '%',   formato: 'percentual', granularidade: 'mensal' },
  { key: 'ipca_7349',        label: 'Aves e ovos (% mês)',   unidade: '%',   formato: 'percentual', granularidade: 'mensal' },
  { key: 'ipca_7173',        label: 'Arroz (% mês)',         unidade: '%',   formato: 'percentual', granularidade: 'mensal' },
  { key: 'ipca_12222',       label: 'Feijão carioca (% mês)', unidade: '%',  formato: 'percentual', granularidade: 'mensal' },
  { key: 'ipca_7385',        label: 'Óleo de soja (% mês)',  unidade: '%',   formato: 'percentual', granularidade: 'mensal' },
  { key: 'ipca_7219',        label: 'Açúcares (% mês)',      unidade: '%',   formato: 'percentual', granularidade: 'mensal' },
] as const

export const PREDITORES_DIARIOS = PREDITORES.filter(p => p.granularidade === 'diario')
export const PREDITORES_MENSAIS = PREDITORES.filter(p => p.granularidade === 'mensal')

export const PREDITOR_POR_KEY: Record<string, SeriePreditor> =
  Object.fromEntries(PREDITORES.map(p => [p.key, p]))

export function fmtValorPreditor(v: number, formato: FormatoPreditor): string {
  if (formato === 'moeda') return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (formato === 'percentual') return `${v.toFixed(2)}%`
  return v.toLocaleString('pt-BR')
}
