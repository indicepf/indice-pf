// Catálogo das séries preditoras (variáveis econômicas). Usado pela rota de
// leitura (/api/preditores), pelo overlay do gráfico e pela regressão.
// Client-safe (sem service role); as chaves batem com a coluna `serie` da
// tabela fatores_preditores.

export type FormatoPreditor = 'moeda' | 'percentual' | 'numero'
export type Granularidade = 'diario' | 'mensal' | 'trimestral'
// agrupa o menu por tipo de dado, para não virar um paredão de opções
export type GrupoPreditor = 'Câmbio e mercado' | 'Juros e inflação' | 'Combustíveis'
  | 'Alimentos (IPCA)' | 'Cesta básica (DIEESE)' | 'Renda (PNAD)'

export type SeriePreditor = {
  key: string
  label: string       // rótulo curto para o menu e a legenda
  unidade: string     // sufixo no eixo/tooltip
  formato: FormatoPreditor
  granularidade: Granularidade
  grupo: GrupoPreditor
}

export const PREDITORES: readonly SeriePreditor[] = [
  // diárias — casam com a coleta ~semanal do índice (gráfico principal)
  { key: 'dolar',            label: 'Dólar',                 unidade: 'R$',  formato: 'moeda',      granularidade: 'diario' , grupo: 'Câmbio e mercado' },
  { key: 'euro',             label: 'Euro',                  unidade: 'R$',  formato: 'moeda',      granularidade: 'diario' , grupo: 'Câmbio e mercado' },
  { key: 'bitcoin',          label: 'Bitcoin',               unidade: 'R$',  formato: 'moeda',      granularidade: 'diario' , grupo: 'Câmbio e mercado' },
  { key: 'ibovespa',         label: 'Ibovespa',              unidade: 'pts', formato: 'numero',     granularidade: 'diario' , grupo: 'Câmbio e mercado' },
  { key: 'ouro',             label: 'Ouro (R$/g)',           unidade: 'R$',  formato: 'moeda',      granularidade: 'diario' , grupo: 'Câmbio e mercado' },
  // mensais — vão para o gráfico mensal (variação % do IPCA, juros, salário)
  { key: 'selic',            label: 'SELIC (% a.a.)',        unidade: '%',   formato: 'percentual', granularidade: 'mensal' , grupo: 'Juros e inflação' },
  { key: 'ipca',             label: 'IPCA (% mês)',          unidade: '%',   formato: 'percentual', granularidade: 'mensal' , grupo: 'Juros e inflação' },
  { key: 'ipca_alimentacao', label: 'IPCA Alimentação',      unidade: '%',   formato: 'percentual', granularidade: 'mensal' , grupo: 'Juros e inflação' },
  { key: 'ipca_alim_fora',   label: 'IPCA Alim. fora casa',  unidade: '%',   formato: 'percentual', granularidade: 'mensal' , grupo: 'Juros e inflação' },
  { key: 'salario_minimo',   label: 'Salário mínimo',        unidade: 'R$',  formato: 'moeda',      granularidade: 'mensal' , grupo: 'Juros e inflação' },
  { key: 'ipca_7659',        label: 'Diesel (% mês)',        unidade: '%',   formato: 'percentual', granularidade: 'mensal' , grupo: 'Combustíveis' },
  { key: 'ipca_7657',        label: 'Gasolina (% mês)',      unidade: '%',   formato: 'percentual', granularidade: 'mensal' , grupo: 'Combustíveis' },
  { key: 'ipca_7482',        label: 'Gás de botijão (% mês)', unidade: '%',  formato: 'percentual', granularidade: 'mensal' , grupo: 'Combustíveis' },
  { key: 'ipca_7283',        label: 'Carnes (% mês)',        unidade: '%',   formato: 'percentual', granularidade: 'mensal' , grupo: 'Alimentos (IPCA)' },
  { key: 'ipca_7349',        label: 'Aves e ovos (% mês)',   unidade: '%',   formato: 'percentual', granularidade: 'mensal' , grupo: 'Alimentos (IPCA)' },
  { key: 'ipca_7173',        label: 'Arroz (% mês)',         unidade: '%',   formato: 'percentual', granularidade: 'mensal' , grupo: 'Alimentos (IPCA)' },
  { key: 'ipca_12222',       label: 'Feijão carioca (% mês)', unidade: '%',  formato: 'percentual', granularidade: 'mensal' , grupo: 'Alimentos (IPCA)' },
  { key: 'ipca_7385',        label: 'Óleo de soja (% mês)',  unidade: '%',   formato: 'percentual', granularidade: 'mensal' , grupo: 'Alimentos (IPCA)' },
  { key: 'ipca_7219',        label: 'Açúcares (% mês)',      unidade: '%',   formato: 'percentual', granularidade: 'mensal' , grupo: 'Alimentos (IPCA)' },
  // cesta básica DIEESE — preço médio R$ medido nas capitais (mediana), desde 1994
  { key: 'dieese_cesta',     label: 'Cesta básica DIEESE',   unidade: 'R$',  formato: 'moeda',      granularidade: 'mensal' , grupo: 'Cesta básica (DIEESE)' },
  { key: 'dieese_carne',     label: 'Carne (R$/kg, DIEESE)', unidade: 'R$',  formato: 'moeda',      granularidade: 'mensal' , grupo: 'Cesta básica (DIEESE)' },
  { key: 'dieese_leite',     label: 'Leite (R$/L, DIEESE)',  unidade: 'R$',  formato: 'moeda',      granularidade: 'mensal' , grupo: 'Cesta básica (DIEESE)' },
  { key: 'dieese_feijao',    label: 'Feijão (R$/kg, DIEESE)', unidade: 'R$', formato: 'moeda',      granularidade: 'mensal' , grupo: 'Cesta básica (DIEESE)' },
  { key: 'dieese_arroz',     label: 'Arroz (R$/kg, DIEESE)', unidade: 'R$',  formato: 'moeda',      granularidade: 'mensal' , grupo: 'Cesta básica (DIEESE)' },
  { key: 'dieese_farinha',   label: 'Farinha (R$/kg, DIEESE)', unidade: 'R$', formato: 'moeda',     granularidade: 'mensal' , grupo: 'Cesta básica (DIEESE)' },
  { key: 'dieese_batata',    label: 'Batata (R$/kg, DIEESE)', unidade: 'R$', formato: 'moeda',      granularidade: 'mensal' , grupo: 'Cesta básica (DIEESE)' },
  { key: 'dieese_tomate',    label: 'Tomate (R$/kg, DIEESE)', unidade: 'R$', formato: 'moeda',      granularidade: 'mensal' , grupo: 'Cesta básica (DIEESE)' },
  { key: 'dieese_pao',       label: 'Pão (R$/kg, DIEESE)',   unidade: 'R$',  formato: 'moeda',      granularidade: 'mensal' , grupo: 'Cesta básica (DIEESE)' },
  { key: 'dieese_cafe',      label: 'Café (R$/kg, DIEESE)',  unidade: 'R$',  formato: 'moeda',      granularidade: 'mensal' , grupo: 'Cesta básica (DIEESE)' },
  { key: 'dieese_banana',    label: 'Banana (R$/dz, DIEESE)', unidade: 'R$', formato: 'moeda',      granularidade: 'mensal' , grupo: 'Cesta básica (DIEESE)' },
  { key: 'dieese_acucar',    label: 'Açúcar (R$/kg, DIEESE)', unidade: 'R$', formato: 'moeda',      granularidade: 'mensal' , grupo: 'Cesta básica (DIEESE)' },
  { key: 'dieese_oleo',      label: 'Óleo (R$, DIEESE)',     unidade: 'R$',  formato: 'moeda',      granularidade: 'mensal' , grupo: 'Cesta básica (DIEESE)' },
  { key: 'dieese_manteiga',  label: 'Manteiga (R$/kg, DIEESE)', unidade: 'R$', formato: 'moeda',    granularidade: 'mensal' , grupo: 'Cesta básica (DIEESE)' },
  // PNAD Contínua trimestral (SIDRA 6472 v/5929 e 6371 v/8186). Gravadas no dia
  // 01 do primeiro mês do trimestre e lidas por `lerNoMes`, que estende cada
  // observação pelos meses em que o trimestre está vigente. São insumo da
  // conversão da aba "PF como moeda" e, agora, também séries do menu daqui.
  { key: 'pnad_renda',              label: 'Renda habitual (R$/mês)',      unidade: 'R$', formato: 'moeda',  granularidade: 'trimestral', grupo: 'Renda (PNAD)' },
  { key: 'pnad_renda_norte',        label: 'Renda — Norte',                unidade: 'R$', formato: 'moeda',  granularidade: 'trimestral', grupo: 'Renda (PNAD)' },
  { key: 'pnad_renda_nordeste',     label: 'Renda — Nordeste',             unidade: 'R$', formato: 'moeda',  granularidade: 'trimestral', grupo: 'Renda (PNAD)' },
  { key: 'pnad_renda_centro_oeste', label: 'Renda — Centro-oeste',         unidade: 'R$', formato: 'moeda',  granularidade: 'trimestral', grupo: 'Renda (PNAD)' },
  { key: 'pnad_renda_sudeste',      label: 'Renda — Sudeste',              unidade: 'R$', formato: 'moeda',  granularidade: 'trimestral', grupo: 'Renda (PNAD)' },
  { key: 'pnad_renda_sul',          label: 'Renda — Sul',                  unidade: 'R$', formato: 'moeda',  granularidade: 'trimestral', grupo: 'Renda (PNAD)' },
  { key: 'pnad_horas',              label: 'Horas habituais (h/semana)',   unidade: 'h',  formato: 'numero', granularidade: 'trimestral', grupo: 'Renda (PNAD)' },
  { key: 'pnad_horas_norte',        label: 'Horas — Norte',                unidade: 'h',  formato: 'numero', granularidade: 'trimestral', grupo: 'Renda (PNAD)' },
  { key: 'pnad_horas_nordeste',     label: 'Horas — Nordeste',             unidade: 'h',  formato: 'numero', granularidade: 'trimestral', grupo: 'Renda (PNAD)' },
  { key: 'pnad_horas_centro_oeste', label: 'Horas — Centro-oeste',         unidade: 'h',  formato: 'numero', granularidade: 'trimestral', grupo: 'Renda (PNAD)' },
  { key: 'pnad_horas_sudeste',      label: 'Horas — Sudeste',              unidade: 'h',  formato: 'numero', granularidade: 'trimestral', grupo: 'Renda (PNAD)' },
  { key: 'pnad_horas_sul',          label: 'Horas — Sul',                  unidade: 'h',  formato: 'numero', granularidade: 'trimestral', grupo: 'Renda (PNAD)' },
] as const

export const PREDITORES_DIARIOS = PREDITORES.filter(p => p.granularidade === 'diario')
// o painel mensal casa pelo mês de referência, então a série trimestral cabe
// nele (com dois meses vazios a cada três) — só a diária é que não cabe
export const PREDITORES_MENSAIS = PREDITORES.filter(p => p.granularidade !== 'diario')

export const PREDITOR_POR_KEY: Record<string, SeriePreditor> =
  Object.fromEntries(PREDITORES.map(p => [p.key, p]))

// ── leitura de série no mês de referência ──
// Série MENSAL casa pelo mês exato: repetir o último mês publicado afirmaria
// uma variação que não foi divulgada (IPCA e DIEESE saem com defasagem).
// Série TRIMESTRAL é outra coisa — o valor do trimestre é o NÍVEL vigente nos
// três meses (docs/032), e continua vigente até o trimestre seguinte sair.
// O alcance conta do CARIMBO da observação, que é o 1º mês do trimestre: os 3
// meses do trimestre, mais os ~2 que o IBGE leva para publicar o seguinte
// depois de ele fechar — daí 8. Uma observação de 1T2026 (carimbo 01/2026) é a
// mais recente que existe até meados de agosto, e isso é normal, não atraso.
// Passado o alcance a fonte está parada, e a série vira buraco em vez de reta.
export const ALCANCE_TRIMESTRAL = 8

const somaMes = (ym: string, n: number) => {
  const [a, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7)
}

export function lerNoMes(
  serie: { data: string; valor: number }[] | undefined, data: string, trimestral: boolean,
): number | null {
  const s = serie ?? []
  if (!trimestral) return s.find(p => p.data === data)?.valor ?? null
  const limite = somaMes(data.slice(0, 7), -ALCANCE_TRIMESTRAL) + '-01'
  let v: number | null = null
  for (const p of s) { if (p.data <= data && p.data >= limite) v = p.valor; else if (p.data > data) break }
  return v
}

// Mesma regra sobre um mapa mês→valor já agregado: repete o último trimestre
// publicado pelos meses que ele cobre, e para no alcance.
export function estenderTrimestral(m: Map<string, number>): Map<string, number> {
  const meses = [...m.keys()].sort()
  if (!meses.length) return m
  const out = new Map(m)
  const fim = somaMes(meses[meses.length - 1], ALCANCE_TRIMESTRAL)
  let ultimo = m.get(meses[0])!
  for (let ym = meses[0]; ym <= fim; ym = somaMes(ym, 1)) {
    if (m.has(ym)) ultimo = m.get(ym)!
    else out.set(ym, ultimo)
  }
  return out
}

export function fmtValorPreditor(v: number, formato: FormatoPreditor): string {
  if (formato === 'moeda') return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (formato === 'percentual') return `${v.toFixed(2)}%`
  return v.toLocaleString('pt-BR')
}
