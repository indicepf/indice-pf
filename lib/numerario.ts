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

// ── unidades em que o índice pode ser lido ──
// Os reais (o próprio custo), cada conversor e o tempo de trabalho. É a mesma
// lista dos cards da aba "PF como moeda" e do seletor de unidade do gráfico da
// aba Índice: as duas abas leem o mesmo índice, só que em numerários diferentes.

export type DefUnidade = {
  key: string                  // 'reais' | série do conversor | 'tempo'
  label: string                // rótulo do card / da opção do seletor
  legenda: string              // rótulo da linha no gráfico, com o sentido explícito
  unidade: string
  casas: number
  series: readonly string[]    // séries de fatores_preditores necessárias
  inverte: boolean             // sobe quando o PF fica mais BARATO (min e max trocam de lado)
}

export const UNIDADES: readonly DefUnidade[] = [
  { key: 'reais', label: 'Custo em reais', legenda: 'Custo do PF (R$)', unidade: 'R$', casas: 2, series: [], inverte: false },
  ...CONVERSORES.map(c => ({
    key: c.serie,
    label: c.label,
    legenda: c.sentido === 'pfs_por_unidade' ? `PFs por ${c.label.toLowerCase()}` : `${c.unidade} por PF`,
    unidade: c.unidade,
    casas: c.casas,
    series: [c.serie],
    inverte: c.sentido === 'pfs_por_unidade',
  })),
  { key: 'tempo', label: 'Tempo de trabalho', legenda: 'Minutos de trabalho por PF', unidade: 'min', casas: 0,
    series: ['pnad_renda', 'pnad_horas'], inverte: false },
] as const

export const UNIDADE_POR_KEY: Record<string, DefUnidade> =
  Object.fromEntries(UNIDADES.map(u => [u.key, u]))

// Converte um custo de PF para a unidade escolhida. `valores` traz a cotação já
// resolvida de cada série de `u.series`, na chave canônica (a substituição da
// série regional da PNAD é responsabilidade de quem busca o dado).
export function valorNaUnidade(u: DefUnidade, custoPF: number | null, valores: Record<string, number | null>): number | null {
  if (u.key === 'reais') return positivo(custoPF) ? custoPF : null
  if (u.key === 'tempo') return minutosDeTrabalho(custoPF, valores.pnad_renda ?? null, valores.pnad_horas ?? null)
  const conv = CONVERSORES.find(c => c.serie === u.key)
  if (!conv) return null
  return converter(custoPF, valores[conv.serie] ?? null, conv.sentido)
}

export function fmtNaUnidade(u: DefUnidade, v: number | null): string {
  if (v == null) return '—'
  if (u.key === 'reais') return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (u.key === 'tempo') return fmtTempo(v)
  return `${fmtQuantidade(v, u.casas)} ${u.unidade}`
}

// versão curta para o tick do eixo, onde não cabe "2 h 12 min" nem separador
export function fmtEixo(u: DefUnidade, v: number): string {
  if (u.key === 'reais') return `R$${Math.round(v)}`
  if (u.key === 'tempo') return `${Math.round(v)}min`
  return `${fmtQuantidade(v, Math.abs(v) >= 100 ? 0 : u.casas)}${u.unidade === 'PFs' ? '' : ' ' + u.unidade}`
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
