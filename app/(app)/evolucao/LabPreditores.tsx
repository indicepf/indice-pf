'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts'
import { type Evolucao } from '@/lib/queries'
import { brl } from '@/lib/format'
import { ACCENT, BRAND, CHART_SERIES, DIM, INK } from '@/lib/theme'
import { PREDITORES, fmtValorPreditor } from '@/lib/preditores'
import BotaoExportar from './BotaoExportar'
import InfoTip from '../../InfoTip'

// Laboratório (admin): reconstrução do índice para o passado e exploração das
// séries de preço real. Fica separado das abas públicas justamente porque
// a série reconstruída NÃO é dado medido — é estimativa e vem marcada como tal.

const COR = { ind: ACCENT, est: BRAND.ciano, muted: DIM, ink: INK }
const ymDe = (d: string) => d.slice(0, 7)
const tsYM = (ym: string) => new Date(`${ym}-01T00:00:00Z`).getTime()
const fmtYM = (t: number) => new Date(t).toISOString().slice(0, 7).split('-').reverse().join('/')

// Deflatores possíveis. 'nivel' = série já em R$ (DIEESE); 'variacao' = % ao
// mês (IPCA), que precisa ser encadeada para virar nível.
const DEFLATORES: { key: string; label: string; tipo: 'nivel' | 'variacao'; nota: string }[] = [
  { key: 'dieese_cesta', label: 'Cesta básica DIEESE (R$)', tipo: 'nivel', nota: 'Preço real medido de uma cesta de 13 alimentos nas capitais. Independente do IPCA.' },
  { key: 'ipca_alimentacao', label: 'IPCA — Alimentação e bebidas', tipo: 'variacao', nota: 'Inflação oficial do grupo alimentação. Cuidado: usar isto e depois regredir contra IPCA é circular.' },
  { key: 'ipca_alim_fora', label: 'IPCA — Alimentação fora do domicílio', tipo: 'variacao', nota: 'Mais próximo de refeição pronta, mas inclui serviço (mão de obra, aluguel), não só ingrediente.' },
  { key: 'ipca', label: 'IPCA cheio', tipo: 'variacao', nota: 'Inflação geral: não reflete o movimento específico dos alimentos.' },
]

const SERIES_DIEESE = PREDITORES.filter(p => p.key.startsWith('dieese_'))

const CONFIANCAS: [string, string][] = [
  ['alta', 'só correspondência exata'],
  ['alta,media', 'exata + próxima (recomendado)'],
  ['alta,media,baixa', 'tudo, inclusive fallback de grupo'],
]

export default function LabPreditores({ ev }: { ev: Evolucao }) {
  const [metodo, setMetodo] = useState('ingrediente')   // 'ingrediente' ou chave de DEFLATORES
  const [confianca, setConfianca] = useState('alta,media')
  const [desde, setDesde] = useState('2015-01')
  const [series, setSeries] = useState<Record<string, { data: string; valor: number }[]>>({})
  const [carregando, setCarregando] = useState(true)
  const [vistaDieese, setVistaDieese] = useState<Set<string>>(new Set(['dieese_cesta']))
  const [porIng, setPorIng] = useState<{ serie: { ym: string; indice: number; pratos: number }[]; cobertura: { por_item_pct: number }; ancora: { ym: string } } | null>(null)
  const [erroIng, setErroIng] = useState('')

  const ehPorIngrediente = metodo === 'ingrediente'
  const deflator = ehPorIngrediente ? 'dieese_cesta' : metodo

  // busca os deflatores e as séries do DIEESE (histórico longo)
  useEffect(() => {
    const keys = [...new Set([...DEFLATORES.map(d => d.key), ...SERIES_DIEESE.map(s => s.key)])]
    setCarregando(true)
    fetch(`/api/preditores?vars=${keys.join(',')}&de=1994-01-01`)
      .then(r => r.json()).then(j => setSeries(j || {}))
      .catch(() => setSeries({}))
      .finally(() => setCarregando(false))
  }, [])

  // reconstrução por ingrediente (cálculo no servidor)
  useEffect(() => {
    if (!ehPorIngrediente) return
    let vivo = true
    setErroIng('')
    fetch(`/api/indice-retropolado?desde=${desde}&confianca=${confianca}`)
      .then(r => r.json())
      .then(j => { if (vivo) { if (j.error) setErroIng(j.error); else setPorIng(j) } })
      .catch(e => { if (vivo) setErroIng(String(e)) })
    return () => { vivo = false }
  }, [ehPorIngrediente, desde, confianca])

  // índice medido, agregado por mês (média das coletas do mês)
  const medidoPorMes = useMemo(() => {
    const m = new Map<string, number[]>()
    for (const p of ev.serie) {
      const v = p.blend?.mediana
      if (v != null && v > 0) { const a = m.get(ymDe(p.data)) ?? []; a.push(v); m.set(ymDe(p.data), a) }
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, vs]) => ({ ym, valor: vs.reduce((s, x) => s + x, 0) / vs.length }))
  }, [ev])

  const def = DEFLATORES.find(d => d.key === deflator)!

  // Retropolação: converte o deflator num índice de NÍVEL e projeta o índice
  // medido para trás pela razão nivel(t)/nivel(t0), ancorando no 1º mês medido.
  const reconstrucao = useMemo(() => {
    // por ingrediente: a série já vem pronta do servidor, ancorada no custo real
    if (ehPorIngrediente) {
      if (!porIng?.serie?.length) return []
      const medido = new Map(medidoPorMes.map(p => [p.ym, p.valor]))
      const ymAncora = porIng.ancora.ym
      return porIng.serie.map(p => ({
        ym: p.ym, ts: tsYM(p.ym),
        estimado: p.ym < ymAncora ? p.indice : null,
        real: medido.get(p.ym) != null ? Math.round(medido.get(p.ym)! * 100) / 100 : null,
      }))
    }
    const bruto = series[deflator] || []
    if (!bruto.length || !medidoPorMes.length) return []

    // nível por mês
    const nivel = new Map<string, number>()
    if (def.tipo === 'nivel') {
      for (const p of bruto) nivel.set(ymDe(p.data), p.valor)
    } else {
      // encadeia a variação % em um índice de nível (base 100 no 1º mês)
      const ord = [...bruto].sort((a, b) => a.data.localeCompare(b.data))
      let acc = 100
      for (const p of ord) { acc = acc * (1 + p.valor / 100); nivel.set(ymDe(p.data), acc) }
    }

    const ancora = medidoPorMes[0]                       // 1º mês com dado real
    const nAncora = nivel.get(ancora.ym)
    if (!nAncora) return []

    const medido = new Map(medidoPorMes.map(p => [p.ym, p.valor]))
    const meses = [...nivel.keys()].filter(ym => ym >= desde).sort()
    return meses.map(ym => {
      const n = nivel.get(ym)!
      const real = medido.get(ym) ?? null
      // estimado só antes da âncora; do 1º mês medido em diante vale o real
      const est = ym < ancora.ym ? Math.round((ancora.valor * (n / nAncora)) * 100) / 100 : null
      return { ym, ts: tsYM(ym), estimado: est, real: real != null ? Math.round(real * 100) / 100 : null }
    })
  }, [series, deflator, medidoPorMes, desde, def, ehPorIngrediente, porIng])

  const primeiroReal = medidoPorMes[0]
  const maisAntigo = reconstrucao.find(p => p.estimado != null)

  // gráfico das séries DIEESE (preço real, sem reconstrução)
  const dadosDieese = useMemo(() => {
    const keys = [...vistaDieese]
    if (!keys.length) return []
    const meses = new Set<string>()
    for (const k of keys) for (const p of series[k] || []) if (ymDe(p.data) >= desde) meses.add(ymDe(p.data))
    return [...meses].sort().map(ym => {
      const row: any = { ym, ts: tsYM(ym) }
      for (const k of keys) row[k] = (series[k] || []).find(p => ymDe(p.data) === ym)?.valor ?? null
      return row
    })
  }, [series, vistaDieese, desde])

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      <div className="border border-brand-roxo/30 bg-brand-roxo/5 rounded-lg p-4">
        <p className="text-sm font-medium text-brand-roxo">Laboratório — não publicado</p>
        <p className="text-xs text-dim mt-1">
          Área de teste, visível só para admin. A série reconstruída abaixo <strong>não é dado medido</strong>:
          é o índice atual projetado para trás por um deflator. Serve para leitura gráfica e contexto histórico —
          não use como variável em modelo, principalmente contra o próprio IPCA (seria circular).
        </p>
      </div>

      <div className="flex items-end gap-4 flex-wrap text-xs">
        <label className="text-dim">Método
          <select value={metodo} onChange={e => setMetodo(e.target.value)}
            className="block mt-1 bg-surface-2 border border-border rounded-md px-2.5 py-2 text-sm text-ink w-full sm:w-[24rem] focus:outline-none focus:border-accent">
            <option value="ingrediente">Por ingrediente — item do IPCA de cada um (recomendado)</option>
            {DEFLATORES.map(d => <option key={d.key} value={d.key}>Agregado — {d.label}</option>)}
          </select>
        </label>
        {ehPorIngrediente && (
          <label className="text-dim">Confiança do mapeamento
            <select value={confianca} onChange={e => setConfianca(e.target.value)}
              className="block mt-1 bg-surface-2 border border-border rounded-md px-2.5 py-2 text-sm text-ink focus:outline-none focus:border-accent">
              {CONFIANCAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        )}
        <label className="text-dim">Desde
          <select value={desde} onChange={e => setDesde(e.target.value)}
            className="block mt-1 bg-surface-2 border border-border rounded-md px-2.5 py-2 text-sm text-ink focus:outline-none focus:border-accent">
            {['1994-07', '2000-01', '2010-01', '2015-01', '2020-01', '2024-01'].map(d => (
              <option key={d} value={d}>{d.split('-').reverse().join('/')}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-dim -mt-4">
        {ehPorIngrediente
          ? 'Cada ingrediente é deflacionado pelo seu próprio item do IPCA e o custo de cada prato é recomposto pelos pesos da receita. Ancorado no custo real da última coleta — no mês da âncora o resultado reproduz o índice medido.'
          : def.nota}
        {ehPorIngrediente && porIng && <> · <strong className="text-ink">{porIng.cobertura.por_item_pct}%</strong> do custo deflacionado por item próprio (o resto cai no grupo).</>}
      </p>
      {erroIng && <p className="text-xs text-accent -mt-4">Falha ao calcular por ingrediente: {erroIng}</p>}

      {/* reconstrução */}
      <div className="border border-border rounded-lg bg-surface p-4">
        <div className="flex items-start justify-between gap-3 mb-1">
          <p className="text-sm font-medium">Índice PF reconstruído — quanto custaria no passado
            <InfoTip texto="Ancora no primeiro mês com coleta real e projeta para trás pela variação do deflator escolhido. Linha sólida = medido; tracejada = estimado." />
          </p>
          {reconstrucao.length > 0 && (
            <BotaoExportar nome="indice-pf-reconstruido" abas={() => [{
              nome: 'Reconstrução',
              linhas: reconstrucao.map(p => ({ Mes: p.ym, Estimado: p.estimado, Medido: p.real, Deflator: def.label })),
            }]} />
          )}
        </div>
        <p className="text-xs text-dim mb-4">
          {carregando ? 'Carregando séries…' : !reconstrucao.length ? 'Sem dados do deflator no período.' : (
            <>
              Âncora: {primeiroReal ? `${primeiroReal.ym.split('-').reverse().join('/')} = ${brl(primeiroReal.valor)}` : '—'}
              {maisAntigo && <> · estimativa mais antiga: {maisAntigo.ym.split('-').reverse().join('/')} = <strong className="text-ink">{brl(maisAntigo.estimado!)}</strong></>}
              {' '}· método: {ehPorIngrediente ? 'por ingrediente (IPCA item a item)' : `agregado por ${def.label}`}
            </>
          )}
        </p>
        <div style={{ width: '100%', height: 340 }}>
          <ResponsiveContainer>
            <ComposedChart data={reconstrucao} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
              <defs>
                <linearGradient id="grad-est" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COR.est} stopOpacity={0.14} />
                  <stop offset="100%" stopColor={COR.est} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']}
                tickFormatter={fmtYM} tick={{ fontSize: 12, fill: COR.muted }} />
              <YAxis tick={{ fontSize: 12, fill: COR.muted }} width={52} tickFormatter={v => `R$${v}`} />
              <Tooltip formatter={(v: any, n: any) => [`R$ ${Number(v).toFixed(2)}`, n]} labelFormatter={(t: any) => fmtYM(Number(t))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {primeiroReal && <ReferenceLine x={tsYM(primeiroReal.ym)} stroke={COR.muted} strokeDasharray="4 4"
                label={{ value: 'início da coleta real', fontSize: 11, fill: COR.muted, position: 'insideTopLeft' }} />}
              <Area type="monotone" dataKey="estimado" name="Estimado (reconstruído)" stroke={COR.est}
                strokeWidth={2} strokeDasharray="5 4" dot={false} fill="url(#grad-est)" connectNulls />
              <Line type="monotone" dataKey="real" name="Medido (coleta real)" stroke={COR.ind}
                strokeWidth={3} dot={{ r: 3 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* séries DIEESE — preço real, histórico longo */}
      <div className="border border-border rounded-lg bg-surface p-4">
        <p className="text-sm font-medium mb-1">Preço real dos alimentos — cesta básica DIEESE
          <InfoTip texto="Preço médio em R$ medido nas capitais pelo DIEESE (mediana entre elas), mensal desde jul/1994. Dado medido por fonte independente — diferente da reconstrução acima." />
        </p>
        <p className="text-xs text-dim mb-3">Mediana das capitais · mensal · fonte independente do IPCA</p>
        <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap mb-4">
          {SERIES_DIEESE.map((s, i) => (
            <label key={s.key} className="flex items-center gap-1.5 cursor-pointer text-xs">
              <input type="checkbox" checked={vistaDieese.has(s.key)}
                onChange={() => setVistaDieese(v => { const n = new Set(v); n.has(s.key) ? n.delete(s.key) : n.add(s.key); return n })} />
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: CHART_SERIES[i % CHART_SERIES.length] }} />
              {s.label.replace(' (R$/kg, DIEESE)', '').replace(' (R$/L, DIEESE)', '').replace(' (R$/dz, DIEESE)', '').replace(' (R$, DIEESE)', '').replace(' DIEESE', '')}
            </label>
          ))}
        </div>
        <div style={{ width: '100%', height: 320 }}>
          <ResponsiveContainer>
            <ComposedChart data={dadosDieese} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']}
                tickFormatter={fmtYM} tick={{ fontSize: 12, fill: COR.muted }} />
              <YAxis tick={{ fontSize: 12, fill: COR.muted }} width={56} tickFormatter={v => `R$${v}`} />
              <Tooltip formatter={(v: any, n: any) => [fmtValorPreditor(Number(v), 'moeda'), n]} labelFormatter={(t: any) => fmtYM(Number(t))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {[...vistaDieese].map(k => {
                const i = SERIES_DIEESE.findIndex(s => s.key === k)
                return <Line key={k} type="monotone" dataKey={k} name={SERIES_DIEESE[i]?.label ?? k}
                  stroke={CHART_SERIES[i % CHART_SERIES.length]} strokeWidth={2} dot={false} connectNulls />
              })}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
