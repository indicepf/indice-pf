'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts'
import { getEntradasIngrediente, excluirEntradaERecalcular, getIngredientes, type Evolucao, type EntradaBruta } from '@/lib/queries'
import type { Ing } from '@/lib/types'
import { capturarContexto } from '@/lib/contexto'
import { fetchAdmin } from '@/lib/fetch-admin'
import { Modal } from '@/components/ui'
import { brl } from '@/lib/format'
import { ACCENT, BRAND, CHART_SERIES, DIM, INK } from '@/lib/theme'
import { PREDITORES, fmtValorPreditor } from '@/lib/preditores'
import { classificarBenchmark, N_MIN_BENCHMARK } from '@/lib/benchmark'
import { abasReconstrucao } from '@/lib/export-reconstrucao'
import BotaoExportar from './BotaoExportar'
import ModalMetodologia from './ModalMetodologia'
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

type PontoConf = { ym: string; nosso: number | null; dieese: number | null; razao: number | null }
type ItemConf = {
  id: number; nome: string; unidade: string | null
  comparabilidade: 'direta' | 'aproximada'; nota: string | null
  periodo: { ini: string; fim: string } | null
  nossoMediana: number | null; dieeseMediana: number | null; nossoAtual: number | null
  razaoMediana: number | null; nMeses: number; pontos: PontoConf[]
}

const CONFIANCAS: [string, string][] = [
  ['alta', 'só correspondência exata'],
  ['alta,media', 'exata + próxima (recomendado)'],
  ['alta,media,baixa', 'tudo, inclusive fallback de grupo'],
]

export default function LabPreditores({ ev, souSuper = false }: { ev: Evolucao; souSuper?: boolean }) {
  const [metodo, setMetodo] = useState('ingrediente')   // 'ingrediente' ou chave de DEFLATORES
  const [confianca, setConfianca] = useState('alta,media')
  const [desde, setDesde] = useState('2015-01')
  const [series, setSeries] = useState<Record<string, { data: string; valor: number }[]>>({})
  const [carregando, setCarregando] = useState(true)
  const [vistaDieese, setVistaDieese] = useState<Set<string>>(new Set(['dieese_cesta']))
  const [porIng, setPorIng] = useState<{ serie: { ym: string; indice: number; pratos: number }[]; cobertura: { por_item_pct: number }; ancora: { ym: string }; periodo: { pedido: string; efetivo: string; deflatorDesde: string } } | null>(null)
  const [erroIng, setErroIng] = useState('')
  const [conf, setConf] = useState<ItemConf[] | null>(null)
  const [itemConf, setItemConf] = useState<number | null>(null)
  const [verMetodo, setVerMetodo] = useState(false)
  // auditoria da coleta (item da tabela de confiabilidade). Só super exclui.
  const [auditar, setAuditar] = useState<{ id: number; nome: string } | null>(null)
  const [entradas, setEntradas] = useState<EntradaBruta[] | null>(null)
  const [snapAudit, setSnapAudit] = useState(0)
  const [auditMsg, setAuditMsg] = useState('')
  const [auditBusy, setAuditBusy] = useState(false)
  const [ings, setIngs] = useState<Ing[]>([])
  const [buscaIng, setBuscaIng] = useState('')

  // só ativos — os inativos não entram no índice, não faz sentido auditar
  useEffect(() => { getIngredientes().then(l => setIngs(l.filter(i => i.ativo !== false))) }, [])

  async function abrirAuditoria(id: number, nome: string) {
    setAuditar({ id, nome }); setEntradas(null); setAuditMsg('')
    const { snapshotId, entradas } = await getEntradasIngrediente(id)
    setSnapAudit(snapshotId); setEntradas(entradas)
  }
  async function excluirEntrada(e: EntradaBruta) {
    if (!auditar) return
    if (!confirm(`Excluir esta entrada de ${auditar.nome}? A mediana do ingrediente e o índice são recalculados. Fica registrado em "Ações do super".\n\n${e.titulo}\n${e.exibicao}`)) return
    setAuditBusy(true); setAuditMsg('')
    const ctx = await capturarContexto()
    const { error } = await excluirEntradaERecalcular(e.id, snapAudit, auditar.id, ctx)
    if (error) { setAuditBusy(false); setAuditMsg(`Erro: ${error.message}`); return }
    setEntradas(prev => prev?.filter(x => x.id !== e.id) ?? null)
    setAuditBusy(false); setAuditMsg('Entrada excluída e índice recalculado.')
  }

  const ehPorIngrediente = metodo === 'ingrediente'
  const deflator = ehPorIngrediente ? 'dieese_cesta' : metodo

  // Carrega só as séries em uso, sob demanda — buscar as 18 de uma vez trazia
  // ~5 mil linhas e travava a abertura. Necessário: os deflatores (reconstrução
  // + banda) e o que estiver marcado no gráfico DIEESE (começa só com a cesta).
  const precisaSeries = useMemo(
    () => [...new Set([...DEFLATORES.map(d => d.key), ...vistaDieese])],
    [vistaDieese])
  useEffect(() => {
    const faltam = precisaSeries.filter(k => !series[k])
    if (!faltam.length) return
    setCarregando(true)
    fetchAdmin(`/api/preditores?vars=${faltam.join(',')}&de=1994-01-01`)
      .then(r => r.json())
      .then(j => setSeries(prev => ({ ...prev, ...(j || {}) })))
      .catch(() => {})
      .finally(() => setCarregando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precisaSeries])

  // confiabilidade: nosso preço × preço do DIEESE
  useEffect(() => {
    let vivo = true
    fetchAdmin('/api/confiabilidade').then(r => r.json())
      .then(j => { if (vivo && Array.isArray(j.itens)) setConf(j.itens) })
      .catch(() => { if (vivo) setConf([]) })
    return () => { vivo = false }
  }, [])

  // reconstrução por ingrediente (cálculo no servidor). Contrato discriminado
  // (Fase 0B): 200 ok, 409 incomplete com gaps, demais erros com código. A
  // série anterior é limpa ao iniciar — resultado velho nunca fica na tela
  // como se fosse dos parâmetros novos.
  useEffect(() => {
    if (!ehPorIngrediente) return
    const ctrl = new AbortController()
    setErroIng(''); setPorIng(null)
    fetchAdmin(`/api/indice-retropolado?desde=${desde}&confianca=${confianca}`, { signal: ctrl.signal })
      .then(async r => {
        const j = await r.json().catch(() => null)
        if (ctrl.signal.aborted) return
        if (r.ok && j?.status === 'ok') { setPorIng(j); return }
        if (r.status === 409 && j?.status === 'incomplete') {
          const gaps: { series: string; month: string }[] = j.gaps ?? []
          setErroIng(`dados incompletos — sem variação em: ${gaps.map(g => `${g.series} (${g.month.split('-').reverse().join('/')})`).join(', ')}. Nenhum ponto anterior ao gap é estimado.`)
          return
        }
        setErroIng(j?.error ? `${j.error}${j.code ? ` [${j.code}]` : ''}` : `HTTP ${r.status}`)
      })
      .catch(e => { if (!ctrl.signal.aborted) setErroIng(String(e)) })
    return () => ctrl.abort()
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
      // estimado XOR medido: mês com coleta real mostra só o medido; a
      // estimativa nunca sobrepõe um ponto observado (Fase 0B)
      return porIng.serie.map(p => {
        const real = medido.get(p.ym) != null ? Math.round(medido.get(p.ym)! * 100) / 100 : null
        return {
          ym: p.ym, ts: tsYM(p.ym),
          estimado: real == null && p.ym < ymAncora ? p.indice : null,
          real,
        }
      })
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

  // A antiga "faixa entre métodos" foi removida na Fase 0B (LAB-008/009): os
  // métodos comparados usavam âncoras, cestas e conjuntos diferentes por mês,
  // então o min–max não media incerteza. Um envelope de sensibilidade só volta
  // na Fase 3, com âncora e universo comuns e backtest.

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
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <p className="text-sm font-medium text-brand-roxo">Laboratório — não publicado</p>
          <button onClick={() => setVerMetodo(true)} className="btn-mk ghost sm shrink-0">Como funciona · metodologia</button>
        </div>
        <p className="text-xs text-dim mt-1">
          Área de teste, visível só para admin. A série reconstruída abaixo <strong>não é dado medido</strong>:
          é o índice atual projetado para trás por um deflator. Serve para leitura gráfica e contexto histórico —
          não use como variável em modelo, principalmente contra o próprio IPCA (seria circular).
        </p>
      </div>
      {verMetodo && <ModalMetodologia onClose={() => setVerMetodo(false)} />}

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
        <div className="text-dim">Desde
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            <div className="inline-flex border border-border rounded-md overflow-hidden bg-surface">
              {['1994-07', '2000-01', '2010-01', '2015-01', '2020-01', '2024-01'].map(d => (
                <button key={d} onClick={() => setDesde(d)}
                  className={`px-2.5 py-1.5 text-xs transition-colors ${desde === d ? 'bg-accent text-white' : 'text-dim hover:text-ink'}`}>
                  {d === '1994-07' ? 'Tudo' : d.slice(0, 4)}
                </button>
              ))}
            </div>
            <input type="date" value={`${desde}-01`} min="1994-07-01" max={primeiroReal ? `${primeiroReal.ym}-01` : '2026-12-01'}
              onChange={e => e.target.value && setDesde(e.target.value.slice(0, 7))}
              className="bg-surface-2 border border-border rounded-md px-2 py-1 text-sm text-ink focus:outline-none focus:border-accent" />
          </div>
        </div>
      </div>
      <p className="text-xs text-dim -mt-4">
        {ehPorIngrediente
          ? 'Cada ingrediente é deflacionado pelo seu próprio item do IPCA e o custo de cada prato é recomposto pelos pesos da receita. Ancorado no custo real da última coleta — no mês da âncora o resultado reproduz o índice medido.'
          : def.nota}
        {ehPorIngrediente && porIng && <> · <strong className="text-ink">{porIng.cobertura.por_item_pct}%</strong> do custo deflacionado por item próprio (o resto cai no grupo).</>}
      </p>
      {ehPorIngrediente && porIng && porIng.periodo.efetivo > porIng.periodo.pedido && (
        <p className="text-xs text-accent -mt-4">
          Série começa em {porIng.periodo.efetivo.split('-').reverse().join('/')}, não em {porIng.periodo.pedido.split('-').reverse().join('/')}:
          os itens do IPCA só existem a partir de {porIng.periodo.deflatorDesde.split('-').reverse().join('/')}. Para ir mais atrás, use um método agregado.
        </p>
      )}
      {erroIng && <p className="text-xs text-accent -mt-4">Falha ao calcular por ingrediente: {erroIng}</p>}

      {/* reconstrução */}
      <div className="panel p-5 overflow-visible">
        <div className="flex items-start justify-between gap-3 mb-1">
          <p className="text-sm font-medium">Índice PF reconstruído — quanto custaria no passado
            <InfoTip texto="Cenário de backcast: ancora na cesta e nos preços ATUAIS e projeta para trás pela variação do deflator escolhido. Não é uma série medida contínua desde o passado. Linha sólida = medido; tracejada = estimado (productKind=current_basket_backcast)." />
          </p>
          {reconstrucao.length > 0 && (
            <BotaoExportar nome="indice-pf-reconstruido" abas={() => abasReconstrucao({
              serie: reconstrucao.map(p => ({ ym: p.ym, estimado: p.estimado, real: p.real })),
              metodo,
              deflatorLabel: ehPorIngrediente ? null : def.label,
              ancoraYm: ehPorIngrediente ? porIng?.ancora.ym ?? null : primeiroReal?.ym ?? null,
              desde,
              efetivo: ehPorIngrediente ? porIng?.periodo.efetivo ?? null : reconstrucao[0]?.ym ?? null,
              confianca: ehPorIngrediente ? confianca : null,
              coberturaPct: ehPorIngrediente ? porIng?.cobertura.por_item_pct ?? null : null,
            })} />
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
      <div className="panel p-5 overflow-visible">
        <p className="text-sm font-medium mb-1">Preço nominal observado — cesta básica DIEESE
          <InfoTip texto="Preço em R$ correntes de cada mês, medido nas capitais pelo DIEESE (mediana entre elas), mensal desde jul/1994. Valor nominal, sem deflação. Dado medido por fonte independente — diferente da reconstrução acima." />
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
        <div style={{ width: '100%', height: 340 }}>
          <ResponsiveContainer>
            <ComposedChart data={dadosDieese} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
              <defs>
                <linearGradient id="grad-dieese" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COR.ind} stopOpacity={0.14} />
                  <stop offset="100%" stopColor={COR.ind} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']}
                tickFormatter={fmtYM} tick={{ fontSize: 12, fill: COR.muted }} />
              <YAxis tick={{ fontSize: 12, fill: COR.muted }} width={56} tickFormatter={v => `R$${v}`} />
              <Tooltip formatter={(v: any, n: any) => [fmtValorPreditor(Number(v), 'moeda'), n]} labelFormatter={(t: any) => fmtYM(Number(t))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {/* sempre área sombreada: 1 série usa o gradiente cheio; com várias,
                  cada uma leva um preenchimento leve na própria cor */}
              {[...vistaDieese].map(k => {
                const i = SERIES_DIEESE.findIndex(s => s.key === k)
                const nome = SERIES_DIEESE[i]?.label ?? k
                const cor = CHART_SERIES[i % CHART_SERIES.length]
                const solo = vistaDieese.size === 1
                return (
                  <Area key={k} type="monotone" dataKey={k} name={nome} stroke={cor}
                    strokeWidth={solo ? 2.5 : 2} dot={solo ? { r: 3 } : false}
                    fill={solo ? 'url(#grad-dieese)' : cor} fillOpacity={solo ? 1 : 0.08} connectNulls />
                )
              })}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* benchmark preliminar: nossa medição × DIEESE */}
      <div className="panel p-5 overflow-visible">
        <p className="text-sm font-medium mb-1">Benchmark preliminar — nosso preço × preço do DIEESE
          <InfoTip texto={`Duas medições do mesmo produto por metodologias diferentes. Razão = mediana das razões mensais (nosso ÷ DIEESE). Não é medida de confiabilidade: só recebe leitura qualitativa com pelo menos ${N_MIN_BENCHMARK} meses comparáveis e comparação direta.`} />
        </p>
        <p className="text-xs text-dim mb-3">
          <strong>Nosso</strong> e <strong>DIEESE</strong> = medianas dos meses em que os dois têm dado (o DIEESE sai com
          ~1 mês de atraso); <strong>Atual</strong> = nossa coleta mais recente. Razão = mediana das razões mensais
          nosso ÷ DIEESE. Só a coleta estruturada (com id de ingrediente) entra — a antiga misturava embalagens de
          tamanhos diferentes. Comparação <strong>direta</strong> = mesmo produto e unidade; <strong>aproximada</strong> =
          produto ou ponto de venda diferem. A razão só ganha cor com N ≥ {N_MIN_BENCHMARK} meses e comparação
          direta; abaixo disso é registro, não julgamento — os universos (online × campo DIEESE) também não são
          equivalentes.
        </p>
        {!conf ? <p className="text-sm text-dim py-4">Carregando…</p> : !conf.length ? (
          <p className="text-sm text-dim py-4">Sem pares comparáveis.</p>
        ) : (
          <>
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-sm min-w-[40rem]">
                <thead>
                  <tr className="text-left text-[0.65rem] uppercase tracking-wide text-dim border-b border-border">
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Un.</th>
                    <th className="px-3 py-2 text-right">Nosso</th>
                    <th className="px-3 py-2 text-right">DIEESE</th>
                    <th className="px-3 py-2 text-right">Razão</th>
                    <th className="px-3 py-2 text-right">Atual</th>
                    <th className="px-3 py-2 text-right">N (meses)</th>
                    <th className="px-3 py-2">Período</th>
                    <th className="px-3 py-2">Comparação</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...conf].sort((a, b) => (a.razaoMediana ?? 9) - (b.razaoMediana ?? 9)).map(it => {
                    const r = it.razaoMediana
                    // semáforo só com N >= nMin e comparação direta (ADR 0C);
                    // abaixo disso a razão aparece neutra, sem julgamento
                    const classe = classificarBenchmark(r, it.nMeses, it.comparabilidade)
                    const corRazao = classe === 'ok' ? 'text-ok' : classe === 'divergente' ? 'text-accent' : 'text-dim'
                    const fmtYmCurto = (ym: string) => ym.split('-').reverse().join('/')
                    return (
                      <tr key={`${it.id}-${it.nome}`} className={`border-t border-border/60 cursor-pointer hover:bg-surface-2 ${itemConf === it.id ? 'bg-surface-2' : ''}`}
                        onClick={() => setItemConf(itemConf === it.id ? null : it.id)}>
                        <td className="px-3 py-1.5">{it.nome}
                          {it.nota && <span className="block text-[0.65rem] text-dim">{it.nota}</span>}
                        </td>
                        <td className="px-3 py-1.5 text-dim">{it.unidade ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right tnum">{it.nossoMediana != null ? brl(it.nossoMediana) : '—'}</td>
                        <td className="px-3 py-1.5 text-right tnum text-dim">{it.dieeseMediana != null ? brl(it.dieeseMediana) : '—'}</td>
                        <td className={`px-3 py-1.5 text-right tnum font-medium ${corRazao}`}>
                          {r != null ? r.toFixed(2) : '—'}
                          {r != null && classe === 'sem_classificacao' && <span className="block text-[0.6rem] font-normal text-dim">sem classificação{it.nMeses < N_MIN_BENCHMARK ? ` (N<${N_MIN_BENCHMARK})` : ''}</span>}
                        </td>
                        <td className="px-3 py-1.5 text-right tnum text-dim">{it.nossoAtual != null ? brl(it.nossoAtual) : '—'}</td>
                        <td className="px-3 py-1.5 text-right tnum text-dim">{it.nMeses}</td>
                        <td className="px-3 py-1.5 text-xs text-dim whitespace-nowrap">{it.periodo ? `${fmtYmCurto(it.periodo.ini)}–${fmtYmCurto(it.periodo.fim)}` : '—'}</td>
                        <td className="px-3 py-1.5 text-xs text-dim">{it.comparabilidade}</td>
                        <td className="px-3 py-1.5 text-right">
                          <button onClick={ev => { ev.stopPropagation(); abrirAuditoria(it.id, it.nome) }}
                            className="text-xs text-accent hover:underline whitespace-nowrap">auditar coleta</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-dim mt-2">Clique numa linha para ver as duas séries lado a lado.</p>
            {itemConf != null && (() => {
              const it = conf.find(x => x.id === itemConf)
              if (!it) return null
              const dados = it.pontos.filter(p => p.nosso != null || p.dieese != null)
                .map(p => ({ ...p, ts: tsYM(p.ym) }))
              return (
                <div className="mt-4">
                  <p className="text-sm font-medium mb-2">{it.nome} — nossa medição × DIEESE</p>
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer>
                      <ComposedChart data={dados} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']}
                          tickFormatter={fmtYM} tick={{ fontSize: 12, fill: COR.muted }} />
                        <YAxis tick={{ fontSize: 12, fill: COR.muted }} width={56} tickFormatter={v => `R$${v}`} />
                        <Tooltip formatter={(v: any, n: any) => [`R$ ${Number(v).toFixed(2)}`, n]} labelFormatter={(t: any) => fmtYM(Number(t))} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line type="monotone" dataKey="nosso" name="Índice PF" stroke={COR.ind} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                        <Line type="monotone" dataKey="dieese" name="DIEESE" stroke={COR.est} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )
            })()}
          </>
        )}

        {/* auditar qualquer ingrediente — a comparação com DIEESE existe só para
            os 13 alimentos da cesta, mas a coleta de todos os 139 é auditável */}
        <div className="border-t border-border/60 mt-5 pt-4">
          <p className="text-sm font-medium mb-1">Auditar qualquer ingrediente</p>
          <p className="text-xs text-dim mb-2">
            O DIEESE só mede 13 alimentos básicos, então a tabela acima compara só esses. Mas você pode
            inspecionar a coleta de qualquer um dos {ings.length || '125'} ingredientes ativos do índice.
          </p>
          <input value={buscaIng} onChange={e => setBuscaIng(e.target.value)} placeholder="Buscar ingrediente… (ex.: carne de sol, pintado, camarão)"
            className="bg-surface-2 border border-border rounded-md px-3 py-1.5 text-sm w-full sm:w-96 focus:outline-none focus:border-accent" />
          {buscaIng.trim() && (
            <div className="flex flex-wrap gap-2 mt-2">
              {ings.filter(i => i.nome.toLowerCase().includes(buscaIng.trim().toLowerCase())).slice(0, 12).map(i => (
                <button key={i.id} onClick={() => { abrirAuditoria(i.id, i.nome); setBuscaIng('') }}
                  className="text-xs border border-border rounded-md px-2.5 py-1 hover:border-accent transition">{i.nome}</button>
              ))}
              {!ings.some(i => i.nome.toLowerCase().includes(buscaIng.trim().toLowerCase())) &&
                <span className="text-xs text-dim">Nenhum ingrediente encontrado.</span>}
            </div>
          )}
        </div>
      </div>

      {auditar && (
        <Modal title={`Auditoria — ${auditar.nome}`} onClose={() => setAuditar(null)} wide>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            <p className="text-xs text-dim">
              Entradas brutas da nossa coleta mais recente (raspagem online) para este ingrediente.
              Um preço destoante puxa a mediana — ex.: um produto pronto no lugar do ingrediente.
              {souSuper
                ? ' Como superusuário, você pode excluir a entrada ruim: a mediana e o índice são recalculados e a ação fica registrada.'
                : ' Só superusuário pode excluir; aqui é leitura.'}
            </p>
            {auditMsg && <p className={`text-xs ${auditMsg.startsWith('Erro') ? 'text-danger' : 'text-ok'}`} aria-live="polite">{auditMsg}</p>}
            {entradas == null ? <p className="text-sm text-dim py-4">Carregando…</p>
              : !entradas.length ? <p className="text-sm text-dim py-4">Sem entradas online nesta coleta.</p> : (
              <div className="space-y-2">
                {entradas.map(e => (
                  <div key={e.id} className="border border-border rounded-md bg-surface px-3 py-2.5 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <a href={e.link || undefined} target="_blank" rel="noopener noreferrer" className="text-sm hover:text-accent truncate block">{e.titulo}</a>
                      <p className="text-xs text-dim">{e.loja} · {e.exibicao}</p>
                    </div>
                    <span className="text-sm tnum text-accent shrink-0">{e.preco_bruto != null ? brl(Number(e.preco_bruto)) : '—'}</span>
                    {souSuper && (
                      <button disabled={auditBusy} onClick={() => excluirEntrada(e)}
                        className="text-xs border border-danger/30 text-danger px-2.5 py-1 rounded-md hover:bg-danger/5 transition disabled:opacity-60 shrink-0">excluir</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
