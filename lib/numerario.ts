// O PF como unidade de conta (docs/031, aba "PF como moeda").
// Puro e client-safe: recebe o custo do PF e o valor já resolvido de cada
// conversor; não busca dado nem escolhe recorte. Ausência de dado devolve
// null explícito — nunca 0, nunca carry-forward silencioso, porque "não sei"
// e "zero PFs" são leituras opostas.

export type SentidoConversao =
  | 'pfs_por_unidade'    // bem cotado em R$ → quantos PFs ele compra (salário mínimo)
  | 'unidades_por_pf'    // bem cotado em R$ por unidade → 1 PF vale quantas unidades (ouro)

export type DefConversor = {
  serie: string          // chave em fatores_preditores
  label: string
  sentido: SentidoConversao
  unidade: string        // rótulo da quantidade resultante
  casas: number          // casas decimais da quantidade
}

export const CONVERSORES: readonly DefConversor[] = [
  { serie: 'salario_minimo', label: 'Salário mínimo',      sentido: 'pfs_por_unidade', unidade: 'PFs', casas: 0 },
  { serie: 'dieese_cesta',   label: 'Cesta básica DIEESE', sentido: 'pfs_por_unidade', unidade: 'PFs', casas: 1 },
  { serie: 'dolar',          label: 'Dólar',               sentido: 'unidades_por_pf', unidade: 'US$', casas: 2 },
  { serie: 'euro',           label: 'Euro',                sentido: 'unidades_por_pf', unidade: '€',   casas: 2 },
  { serie: 'ouro',           label: 'Ouro',                sentido: 'unidades_por_pf', unidade: 'g',   casas: 3 },
] as const

// 365,25 dias ÷ 12 meses ÷ 7 dias: semanas por mês, para virar renda mensal da
// PNAD em renda por hora sem herdar o viés de meses de 4 ou 5 semanas.
export const SEMANAS_MES = 365.25 / 12 / 7

// Grafia canônica das regiões no app → sufixo das séries da PNAD. Região
// desconhecida (ou nenhuma) cai no agregado Brasil.
export const REGIOES_PNAD: Record<string, string> = {
  'Norte': 'norte', 'Nordeste': 'nordeste', 'Centro-oeste': 'centro_oeste', 'Sudeste': 'sudeste', 'Sul': 'sul',
}

export function seriePnad(base: 'pnad_renda' | 'pnad_horas', regiao?: string | null): string {
  const sufixo = regiao ? REGIOES_PNAD[regiao] : undefined
  return sufixo ? `${base}_${sufixo}` : base
}

const positivo = (v: number | null | undefined): v is number =>
  typeof v === 'number' && isFinite(v) && v > 0

// Quantidade convertida de 1 PF (ou de quantos PFs o bem compra), conforme o
// sentido do conversor. Custo do PF ou cotação ausente/não-positiva → null.
export function converter(custoPF: number | null, valorConversor: number | null, sentido: SentidoConversao): number | null {
  if (!positivo(custoPF) || !positivo(valorConversor)) return null
  return sentido === 'pfs_por_unidade' ? valorConversor / custoPF : custoPF / valorConversor
}

// Tempo de trabalho que paga um PF, pela renda habitual e pelas horas
// habitualmente trabalhadas da PNAD Contínua do trimestre corrente.
export function minutosDeTrabalho(custoPF: number | null, rendaMensal: number | null, horasSemana: number | null): number | null {
  if (!positivo(custoPF) || !positivo(rendaMensal) || !positivo(horasSemana)) return null
  const porHora = rendaMensal / (horasSemana * SEMANAS_MES)
  return (custoPF / porHora) * 60
}

export function fmtQuantidade(v: number | null, casas: number): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

// Minutos → "48 min" / "2 h 12 min". Abaixo de 1 minuto o arredondamento
// esconderia a ordem de grandeza, então mostra os segundos.
export function fmtTempo(minutos: number | null): string {
  if (minutos == null) return '—'
  if (minutos < 1) return `${Math.round(minutos * 60)} s`
  const total = Math.round(minutos)
  const h = Math.floor(total / 60), m = total % 60
  return h ? `${h} h ${m} min` : `${m} min`
}
