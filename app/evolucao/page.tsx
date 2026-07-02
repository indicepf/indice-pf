'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { getEvolucao, getContribuicoesMapa, type Evolucao, type FonteKey } from '@/lib/queries'

const MapaLocal = dynamic(() => import('../MapaLocal'), { ssr: false, loading: () => <div className="h-[360px] grid place-items-center text-muted text-sm">Carregando mapa…</div> })

const COR = { paprika: '#c0492b', olive: '#6b7a3f', ink: '#1a1a1a', muted: '#9a9a9a', azul: '#3d6b8e' }
const FONTES: [FonteKey, string][] = [['blend', 'Blend (índice)'], ['online', 'Online'], ['manual', 'Manual']]
const fmt = (d: string) => { const [, m, dia] = d.split('-'); return `${dia}/${m}` }
const r2 = (n: number) => Math.round(n * 100) / 100

export default function EvolucaoPage() {
  const router = useRouter()
  const [ev, setEv] = useState<Evolucao | null>(null)
  const [pontos, setPontos] = useState<{ lat: number; lng: number; label: string }[]>([])
  const [fonte, setFonte] = useState<FonteKey>('blend')
  const [pratoId, setPratoId] = useState(0)          // 0 = índice nacional (todos os pratos)
  const [metricas, setMetricas] = useState({ mediana: true, media: false, min: false, max: false })
  const [banda, setBanda] = useState(true)

  useEffect(() => { getEvolucao().then(setEv); getContribuicoesMapa().then(setPontos) }, [])

  const nacional = pratoId === 0
  const dados = useMemo(() => {
    if (!ev) return []
    if (nacional) return ev.serie.map(p => {
      const f = p[fonte]
      return { data: fmt(p.data), mediana: r2(f.mediana), media: r2(f.media), min: r2(f.min), max: r2(f.max), faixa: [r2(f.min), r2(f.max)] as [number, number] }
    })
    return (ev.porPrato[pratoId] || []).map(p => ({ data: fmt(p.data), blend: r2(p.blend), online: r2(p.online), manual: r2(p.manual) }))
  }, [ev, fonte, pratoId, nacional])

  if (!ev) return <main className="min-h-screen grid place-items-center text-muted text-sm">Carregando…</main>

  const poucos = ev.serie.length < 2

  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-cream/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <button onClick={() => router.push('/')} className="text-sm text-muted hover:text-ink">← voltar</button>
          <h1 className="font-[family-name:var(--font-serif)] text-xl ml-1">Evolução temporal</h1>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* controles */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 flex-wrap">
          <label className="text-xs text-muted">Prato
            <select value={pratoId} onChange={e => setPratoId(Number(e.target.value))} className={inputCls}>
              <option value={0}>Índice nacional (todos os pratos)</option>
              {ev.pratos.map(p => <option key={p.id} value={p.id}>{p.nome} · {p.regiao}</option>)}
            </select>
          </label>

          <div className="text-xs text-muted">Fonte do preço
            <div className="inline-flex border border-line rounded-md overflow-hidden bg-panel text-sm mt-1">
              {FONTES.map(([k, label]) => (
                <button key={k} onClick={() => setFonte(k)}
                  className={`px-3 py-1.5 transition-colors ${fonte === k ? 'bg-paprika text-white' : 'text-muted hover:text-ink'}`}
                  disabled={!nacional && k !== 'blend'}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

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
            {nacional ? 'Custo do prato feito (R$) — distribuição dos 100 pratos' : `Custo do prato (R$) — por fonte`}
          </p>
          <p className="text-xs text-muted mb-4">
            {nacional ? `Fonte: ${FONTES.find(f => f[0] === fonte)![1]}` : 'blend × online × manual'}
            {poucos && ' · série curta (poucas coletas) — cresce a cada coleta.'}
          </p>
          <div style={{ width: '100%', height: 360 }}>
            <ResponsiveContainer>
              <ComposedChart data={dados} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6e0d6" />
                <XAxis dataKey="data" tick={{ fontSize: 12, fill: COR.muted }} />
                <YAxis tick={{ fontSize: 12, fill: COR.muted }} width={48} tickFormatter={v => `R$${v}`} />
                <Tooltip formatter={(v: any) => `R$ ${Number(v).toFixed(2)}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
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

        {/* mapa das contribuições de campo */}
        <div>
          <h2 className="font-[family-name:var(--font-serif)] text-lg mb-1">Contribuições de campo</h2>
          <p className="text-xs text-muted mb-3">{pontos.length} contribuição(ões) aprovada(s) com localização.</p>
          {pontos.length ? <MapaLocal points={pontos} height="360px" />
            : <p className="text-sm text-muted">Nenhuma contribuição aprovada com localização ainda.</p>}
        </div>
      </div>
    </main>
  )
}

const inputCls = 'block bg-cream border border-line rounded-md px-2.5 py-2 text-sm text-ink focus:outline-none focus:border-paprika mt-1 min-w-[16rem]'
