import { MAPA_INGREDIENTE_IPCA } from './mapa-ingredientes'

// Monta as abas da exportação da reconstrução (Fase 0C, LAB-013): o método
// exportado é o REAL (por ingrediente nunca vira "Cesta DIEESE") e os
// metadados só afirmam o que existe — na contenção não há cesta/receita
// versionada, então essas versões saem como null e a cobertura é marcada
// legacy_noncanonical.

function hashDjb2(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return h.toString(16)
}
export const MAPA_HASH = hashDjb2(JSON.stringify(MAPA_INGREDIENTE_IPCA))

export type LinhaReconstrucao = { ym: string; estimado: number | null; real: number | null }

export function abasReconstrucao(args: {
  serie: LinhaReconstrucao[]
  metodo: string                    // 'ingrediente' ou chave do deflator agregado
  deflatorLabel: string | null      // label do deflator agregado; null no por-ingrediente
  ancoraYm: string | null
  desde: string
  efetivo: string | null
  confianca: string | null          // só no por-ingrediente
  coberturaPct: number | null       // só no por-ingrediente
}) {
  const porIngrediente = args.metodo === 'ingrediente'
  const metodoExportado = porIngrediente ? 'ipca_by_ingredient' : `aggregate_${args.metodo}`
  return [
    {
      nome: 'Reconstrução',
      linhas: args.serie.map(p => ({ Mes: p.ym, Estimado: p.estimado, Medido: p.real })),
    },
    {
      nome: 'Metadados',
      linhas: [
        { Campo: 'method', Valor: metodoExportado },
        { Campo: 'deflator', Valor: porIngrediente ? 'IPCA item a item (mapa próprio)' : (args.deflatorLabel ?? args.metodo) },
        { Campo: 'ancora', Valor: args.ancoraYm ?? null },
        { Campo: 'periodoPedido', Valor: args.desde },
        { Campo: 'periodoEfetivo', Valor: args.efetivo ?? null },
        { Campo: 'confiancaMapeamento', Valor: porIngrediente ? args.confianca : null },
        { Campo: 'coberturaPorItemPct', Valor: porIngrediente ? args.coberturaPct : null },
        { Campo: 'coverageStatus', Valor: 'legacy_noncanonical' },
        { Campo: 'basketVersion', Valor: null },
        { Campo: 'recipeVersion', Valor: null },
        { Campo: 'mapaIngredientesHash', Valor: MAPA_HASH },
        { Campo: 'geradoEm', Valor: new Date().toISOString() },
        { Campo: 'aviso', Valor: 'Série estimada, não medida. Sem verdade canônica versionada (Fase 0 da auditoria docs/014).' },
      ],
    },
  ]
}
