'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { getEvolucao, getAllDetalhes, getSnapshotsNovos, GRUPOS_CAT, type Evolucao, type FonteKey } from '@/lib/queries'
import { brl } from '@/lib/format'
import type { ItemDetalhe } from '@/lib/types'
import TabelaIngredientes from './TabelaIngredientes'

// paleta categórica validada (dataviz validate_palette — todos os checks PASS em superfície branca)
const CORES_GRUPO: Record<string, string> = {
  'Proteína': '#c0492b', 'Base': '#c98500', 'Guarnição': '#9c5a1e', 'Verdura/Fruta': '#4e8b2f',
  'Temperos': '#008f7a', 'Gordura/Laticínio': '#7a4fb0', 'Outro': '#b0567f',
}

const COR = { paprika: '#c0492b', olive: '#6b7a3f', ink: '#1a1a1a', muted: '#9a9a9a', azul: '#3d6b8e' }
const FONTES: [FonteKey, string][] = [['blend', 'Blend (índice)'], ['online', 'Online'], ['manual', 'Manual']]
const fmt = (d: string) => { const [, m, dia] = d.split('-'); return `${dia}/${m}` }
const ts = (d: string) => new Date(d + 'T00:00:00Z').getTime()
const r2 = (n: number) => Math.round(n * 100) / 100
const numPrato = (nome: string) => parseInt(nome, 10) || 999   // prefixo "12. …"
const ORDEM_REG = ['Norte', 'Nordeste', 'Centro-oeste', 'Sudeste', 'Sul']
const mediana = (v: number[]) => { if (!v.length) return 0; const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

export default function EvolucaoPage() {
  const router = useRouter()
  const [aba, setAba] = useState<'indice' | 'ingredientes'>('indice')
  const [ev, setEv] = useState<Evolucao | null>(null)
  const [fonte, setFonte] = useState<FonteKey>('blend')
  const [pratoId, setPratoId] = useState(0)          // 0 = índice nacional (todos os pratos)
  const [regiao, setRegiao] = useState('')           // '' = todas as regiões
  const [metricas, setMetricas] = useState({ mediana: true, media: false, min: false, max: false })
  const [banda, setBanda] = useState(true)
  const [percentual, setPercentual] = useState(false)
  const [detalhes, setDetalhes] = useState<Record<number, ItemDetalhe[]>>({})
  const [off, setOff] = useState<Set<number>>(new Set())   // ingredientes desmarcados no "e se"

  const compData = useMemo(() => {
    if (!ev) return []
    const src = pratoId === 0 ? ev.composicao : (ev.porPratoComp[pratoId] || [])
    return src.map(p => {
      const tot = GRUPOS_CAT.reduce((s, g) => s + (p[g] || 0), 0) || 1
      const row: any = { data: fmt(p.data) }
      for (const g of GRUPOS_CAT) row[g] = percentual ? r2((p[g] || 0) / tot * 100) : r2(p[g] || 0)
      return row
    })
  }, [ev, percentual, pratoId])

  useEffect(() => {
    getEvolucao().then(setEv)
    getSnapshotsNovos().then(s => { if (s[0]) getAllDetalhes(s[0].id, s[0].data).then(setDetalhes) })
  }, [])
  useEffect(() => { setOff(new Set()) }, [pratoId])   // troca de prato reseta o "e se"

  const nacional = pratoId === 0
  const dados = useMemo(() => {
    if (!ev) return []
    if (!nacional) return (ev.porPrato[pratoId] || []).map(p => ({ ts: ts(p.data), blend: r2(p.blend), online: r2(p.online), manual: r2(p.manual) }))
    if (!regiao) return ev.serie.map(p => {
      const f = p[fonte]
      return { ts: ts(p.data), mediana: r2(f.mediana), media: r2(f.media), min: r2(f.min), max: r2(f.max), faixa: [r2(f.min), r2(f.max)] as [number, number] }
    })
    // distribuição recomputada só com os pratos da região, a partir de porPrato
    const ids = ev.pratos.filter(p => p.regiao === regiao).map(p => p.id)
    return ev.serie.map((p, i) => {
      const vals = ids.map(id => ev.porPrato[id]?.[i]?.[fonte]).filter((v): v is number => v != null && v > 0).map(r2)
      const s = [...vals].sort((a, b) => a - b)
      const media = vals.length ? r2(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
      const min = s[0] ?? 0, max = s[s.length - 1] ?? 0
      return { ts: ts(p.data), mediana: r2(mediana(vals)), media, min, max, faixa: [min, max] as [number, number] }
    })
  }, [ev, fonte, pratoId, nacional, regiao])

  const poucos = !ev || ev.serie.length < 2
  const ticks = dados.map(d => d.ts)
  const regioes = ev ? [...new Set(ev.pratos.map(p => p.regiao))].sort((a, b) => ORDEM_REG.indexOf(a) - ORDEM_REG.indexOf(b)) : []

  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-cream/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <button onClick={() => router.push('/')} className="text-sm text-muted hover:text-ink">← voltar</button>
          <h1 className="font-[family-name:var(--font-serif)] text-xl ml-1">Evolução temporal</h1>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6">
        {/* abas */}
        <div className="flex gap-5 border-b border-line pt-2">
          {([['indice', 'Índice'], ['ingredientes', 'Ingredientes']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`text-sm pb-2 border-b-2 -mb-px transition ${aba === k ? 'border-paprika text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {aba === 'ingredientes' ? (
        <div className="max-w-5xl mx-auto px-6 py-8"><TabelaIngredientes /></div>
      ) : !ev ? (
        <p className="max-w-5xl mx-auto px-6 py-10 text-sm text-muted">Carregando…</p>
      ) : (
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* controles */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 flex-wrap">
          <div className="text-xs text-muted">Prato
            <SeletorPrato pratos={ev.pratos} value={pratoId} onChange={setPratoId} />
          </div>
          <div className="text-xs text-muted">Fonte do preço
            <div className="inline-flex border border-line rounded-md overflow-hidden bg-panel text-sm mt-1">
              {FONTES.map(([k, label]) => (
                <button key={k} onClick={() => setFonte(k)}
                  className={`px-3 py-1.5 transition-colors ${fonte === k ? 'bg-paprika text-white' : 'text-muted hover:text-ink'}`}
                  disabled={!nacional}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {nacional && (
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-muted">Região:</span>
            <div className="inline-flex border border-line rounded-md overflow-hidden bg-panel">
              <button onClick={() => setRegiao('')}
                className={`px-3 py-1.5 transition-colors ${regiao === '' ? 'bg-paprika text-white' : 'text-muted hover:text-ink'}`}>Todas</button>
              {regioes.map(r => (
                <button key={r} onClick={() => setRegiao(r)}
                  className={`px-3 py-1.5 transition-colors border-l border-line ${regiao === r ? 'bg-paprika text-white' : 'text-muted hover:text-ink'}`}>{r}</button>
              ))}
            </div>
          </div>
        )}

        {nacional && (
          <div className="flex items-center gap-4 flex-wrap text-xs">
            <span className="text-muted">Métrica:</span>
            {([['mediana', 'Mediana'], ['media', 'Média'], ['min', 'Mínimo'], ['max', 'Máximo']] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={metricas[k]} onChange={e => setMetricas(m => ({ ...m, [k]: e.target.checked }))} />
                {label}
              </label>
            ))}
            <label className="flex items-center gap-1.5 cursor-pointer ml-2">
              <input type="checkbox" checked={banda} onChange={e => setBanda(e.target.checked)} />
              Faixa mín–máx
            </label>
          </div>
        )}

        {/* gráfico */}
        <div className="border border-line rounded-lg bg-panel p-4">
          <p className="text-sm font-medium mb-1">
            {nacional ? 'Custo do prato feito (R$) — distribuição dos 100 pratos' : 'Custo do prato (R$) — por fonte'}
          </p>
          <p className="text-xs text-muted mb-4">
            {nacional ? `Fonte: ${FONTES.find(f => f[0] === fonte)![1]}` : 'blend × online × manual'}
            {poucos && ' · série curta (poucas coletas) — cresce a cada coleta.'}
          </p>
          <div style={{ width: '100%', height: 360 }}>
            <ResponsiveContainer>
              <ComposedChart data={dados} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6e0d6" />
                <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']}
                  ticks={ticks} tickFormatter={(t: number) => fmt(new Date(t).toISOString().slice(0, 10))}
                  tick={{ fontSize: 13, fill: COR.muted }} />
                <YAxis tick={{ fontSize: 13, fill: COR.muted }} width={48} tickFormatter={v => `R$${v}`} />
                <Tooltip formatter={(v: any) => `R$ ${Number(v).toFixed(2)}`}
                  labelFormatter={(t: any) => fmt(new Date(t).toISOString().slice(0, 10))} />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                {nacional ? (
                  <>
                    {banda && <Area type="monotone" dataKey="faixa" name="faixa mín–máx" fill={COR.paprika} fillOpacity={0.1} stroke="none" />}
                    {metricas.mediana && <Line type="monotone" dataKey="mediana" name="Mediana" stroke={COR.paprika} strokeWidth={2} dot={{ r: 3 }} />}
                    {metricas.media && <Line type="monotone" dataKey="media" name="Média" stroke={COR.olive} strokeWidth={2} dot={{ r: 3 }} />}
                    {metricas.min && <Line type="monotone" dataKey="min" name="Mínimo" stroke={COR.muted} strokeWidth={1.5} dot={{ r: 2 }} />}
                    {metricas.max && <Line type="monotone" dataKey="max" name="Máximo" stroke={COR.ink} strokeWidth={1.5} dot={{ r: 2 }} />}
                  </>
                ) : (
                  <>
                    <Line type="monotone" dataKey="blend" name="Blend" stroke={COR.paprika} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="online" name="Online" stroke={COR.azul} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="manual" name="Manual" stroke={COR.olive} strokeWidth={2} dot={{ r: 3 }} />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* composição por grupo (total quando nacional; do prato quando selecionado) */}
        <div className="border border-line rounded-lg bg-panel p-4">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <p className="text-sm font-medium">{nacional ? 'Composição do custo por grupo de alimento' : 'Composição do prato por grupo'}</p>
              <p className="text-xs text-muted">{nacional ? 'Média por prato · blend' : 'blend'}{poucos && ' · série curta, cresce a cada coleta.'}</p>
            </div>
            <div className="inline-flex border border-line rounded-md overflow-hidden bg-panel text-sm">
              {([['abs', 'R$'], ['pct', '% do total']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setPercentual(k === 'pct')}
                  className={`px-3 py-1.5 transition-colors ${(percentual ? 'pct' : 'abs') === k ? 'bg-paprika text-white' : 'text-muted hover:text-ink'}`}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{ width: '100%', height: 340 }}>
            <ResponsiveContainer>
              <BarChart data={compData} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6e0d6" vertical={false} />
                <XAxis dataKey="data" tick={{ fontSize: 13, fill: COR.muted }} />
                <YAxis tick={{ fontSize: 13, fill: COR.muted }} width={48}
                  domain={percentual ? [0, 100] : ['auto', 'auto']} tickFormatter={v => percentual ? `${v}%` : `R$${v}`} />
                <Tooltip formatter={(v: any, n: any) => [percentual ? `${Number(v).toFixed(1)}%` : `R$ ${Number(v).toFixed(2)}`, n]} />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                {GRUPOS_CAT.map(g => <Bar key={g} dataKey={g} stackId="a" fill={CORES_GRUPO[g]} stroke="#fff" strokeWidth={1} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {!nacional && (detalhes[pratoId]?.length ? (() => {
          const its = detalhes[pratoId]
          const cheio = its.reduce((s, it) => s + it.custo, 0)
          const atual = its.reduce((s, it) => s + (off.has(it.ingrediente_id) ? 0 : it.custo), 0)
          return (
            <div className="border border-line rounded-lg bg-panel p-4">
              <p className="text-sm font-medium mb-1">Simular sem ingredientes</p>
              <p className="text-xs text-muted mb-3">
                Custo do prato = soma dos ingredientes marcados (última coleta · blend). O R$ ao lado de cada item é
                o custo da <strong>quantidade da receita</strong> (em gramas). Desmarque para ver o prato sem ele.
              </p>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="font-[family-name:var(--font-serif)] text-2xl text-paprika tnum">{brl(atual)}</span>
                {off.size > 0 && <span className="text-xs text-muted">de {brl(cheio)} · −{brl(cheio - atual)}</span>}
              </div>
              <div className="space-y-3">
                {(() => {
                  const grupos: Record<string, ItemDetalhe[]> = {}
                  its.forEach(it => (grupos[it.categoria || 'Outro'] ||= []).push(it))
                  const soma = (arr: ItemDetalhe[]) => arr.reduce((s, x) => s + (off.has(x.ingrediente_id) ? 0 : x.custo), 0)
                  const cats = Object.keys(grupos).sort((a, b) => grupos[b].reduce((s, x) => s + x.custo, 0) - grupos[a].reduce((s, x) => s + x.custo, 0))
                  return cats.map(cat => (
                    <div key={cat}>
                      <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-wide text-muted border-b border-line/60 pb-1">
                        <span>{cat}</span><span className="tnum">{brl(soma(grupos[cat]))}</span>
                      </div>
                      {grupos[cat].map(it => (
                        <label key={it.ingrediente_id} className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-line/40 cursor-pointer">
                          <span className="flex items-center gap-2 min-w-0">
                            <input type="checkbox" checked={!off.has(it.ingrediente_id)}
                              onChange={() => setOff(s => { const n = new Set(s); n.has(it.ingrediente_id) ? n.delete(it.ingrediente_id) : n.add(it.ingrediente_id); return n })} />
                            <span className={off.has(it.ingrediente_id) ? 'line-through text-muted' : ''}>{it.nome}</span>
                            <span className="text-xs text-muted shrink-0">{it.qtd_g} g</span>
                          </span>
                          <span className="tnum text-muted">{brl(it.custo)}</span>
                        </label>
                      ))}
                    </div>
                  ))
                })()}
              </div>
            </div>
          )
        })() : null)}
      </div>
      )}
    </main>
  )
}

// seletor de prato com busca, agrupado por região
function SeletorPrato({ pratos, value, onChange }: {
  pratos: { id: number; nome: string; regiao: string }[]; value: number; onChange: (id: number) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const sel = value === 0 ? 'Índice nacional (todos os pratos)'
    : (() => { const p = pratos.find(x => x.id === value); return p ? `${p.nome} · ${p.regiao}` : '—' })()

  const b = busca.trim().toLowerCase()
  const filtrados = pratos
    .filter(p => !b || p.nome.toLowerCase().includes(b) || p.regiao.toLowerCase().includes(b))
    .sort((a, c) => a.regiao.localeCompare(c.regiao) || numPrato(a.nome) - numPrato(c.nome))
  const porRegiao: Record<string, typeof pratos> = {}
  filtrados.forEach(p => { (porRegiao[p.regiao] ||= []).push(p) })

  function escolher(id: number) { onChange(id); setAberto(false); setBusca('') }

  return (
    <div className="relative mt-1">
      <button onClick={() => setAberto(a => !a)}
        className="flex items-center justify-between gap-2 bg-cream border border-line rounded-md px-2.5 py-2 text-sm text-ink w-full sm:w-[22rem] hover:border-paprika transition">
        <span className="truncate">{sel}</span>
        <span className="text-muted shrink-0">▾</span>
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAberto(false)} />
          <div className="absolute z-40 mt-1 w-full sm:w-[22rem] bg-cream border border-line rounded-md shadow-lg max-h-[22rem] overflow-auto">
            <div className="sticky top-0 bg-cream p-2 border-b border-line">
              <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar prato ou região…"
                className="w-full bg-panel border border-line rounded px-2 py-1.5 text-sm focus:outline-none focus:border-paprika" />
            </div>
            <button onClick={() => escolher(0)}
              className={`block w-full text-left px-3 py-2 text-sm hover:bg-panel ${value === 0 ? 'text-paprika font-medium' : 'text-ink'}`}>
              Índice nacional (todos os pratos)
            </button>
            {Object.keys(porRegiao).map(reg => (
              <div key={reg}>
                <div className="px-3 py-1 text-[0.65rem] uppercase tracking-wide text-muted bg-panel/60 sticky top-[3.25rem]">{reg}</div>
                {porRegiao[reg].map(p => (
                  <button key={p.id} onClick={() => escolher(p.id)}
                    className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-panel ${value === p.id ? 'text-paprika font-medium' : 'text-ink'}`}>
                    {p.nome}
                  </button>
                ))}
              </div>
            ))}
            {!filtrados.length && <p className="px-3 py-3 text-sm text-muted">Nenhum prato para “{busca}”.</p>}
          </div>
        </>
      )}
    </div>
  )
}
