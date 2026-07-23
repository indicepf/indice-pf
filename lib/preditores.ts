// Catálogo das séries preditoras (variáveis econômicas). Usado pela rota de
// leitura (/api/preditores), pelo overlay do gráfico e pela regressão.
// Client-safe (sem service role); as chaves batem com a coluna `serie` da
// tabela fatores_preditores.

export type FormatoPreditor = 'moeda' | 'percentual' | 'numero'

export type SeriePreditor = {
  key: string
  label: string       // rótulo curto para o menu e a legenda
  unidade: string     // sufixo no eixo/tooltip
  formato: FormatoPreditor
}

export const PREDITORES: readonly SeriePreditor[] = [
  { key: 'dolar',            label: 'Dólar',                 unidade: 'R$',  formato: 'moeda' },
  { key: 'euro',             label: 'Euro',                  unidade: 'R$',  formato: 'moeda' },
  { key: 'selic',            label: 'SELIC (% a.a.)',        unidade: '%',   formato: 'percentual' },
  { key: 'ipca',             label: 'IPCA (% mês)',          unidade: '%',   formato: 'percentual' },
  { key: 'ipca_alimentacao', label: 'IPCA Alimentação',      unidade: '%',   formato: 'percentual' },
  { key: 'ipca_alim_fora',   label: 'IPCA Alim. fora casa',  unidade: '%',   formato: 'percentual' },
  { key: 'salario_minimo',   label: 'Salário mínimo',        unidade: 'R$',  formato: 'moeda' },
  { key: 'bitcoin',          label: 'Bitcoin',               unidade: 'R$',  formato: 'moeda' },
  { key: 'ibovespa',         label: 'Ibovespa',              unidade: 'pts', formato: 'numero' },
  // itens do IPCA (variação % mensal, SIDRA) — combustível e cesta do prato
  { key: 'ipca_7659',        label: 'Diesel (% mês)',        unidade: '%',   formato: 'percentual' },
  { key: 'ipca_7657',        label: 'Gasolina (% mês)',      unidade: '%',   formato: 'percentual' },
  { key: 'ipca_7482',        label: 'Gás de botijão (% mês)', unidade: '%',  formato: 'percentual' },
  { key: 'ipca_7283',        label: 'Carnes (% mês)',        unidade: '%',   formato: 'percentual' },
  { key: 'ipca_7349',        label: 'Aves e ovos (% mês)',   unidade: '%',   formato: 'percentual' },
  { key: 'ipca_7173',        label: 'Arroz (% mês)',         unidade: '%',   formato: 'percentual' },
  { key: 'ipca_12222',       label: 'Feijão carioca (% mês)', unidade: '%',  formato: 'percentual' },
  { key: 'ipca_7385',        label: 'Óleo de soja (% mês)',  unidade: '%',   formato: 'percentual' },
  { key: 'ipca_7219',        label: 'Açúcares (% mês)',      unidade: '%',   formato: 'percentual' },
] as const

export const PREDITOR_POR_KEY: Record<string, SeriePreditor> =
  Object.fromEntries(PREDITORES.map(p => [p.key, p]))

export function fmtValorPreditor(v: number, formato: FormatoPreditor): string {
  if (formato === 'moeda') return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (formato === 'percentual') return `${v.toFixed(2)}%`
  return v.toLocaleString('pt-BR')
}
