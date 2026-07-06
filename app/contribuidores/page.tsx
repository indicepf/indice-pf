'use client'

import { useEffect, useMemo, useState } from 'react'
import { getTopContribuidores, type Contribuidor } from '@/lib/queries'
import AuthControls from '../Auth'
import RequireAdmin from '../RequireAdmin'
import BotaoInicio from '../BotaoInicio'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const rotuloMes = (m: string) => { const [a, mm] = m.split('-'); return `${MESES[Number(mm) - 1]}/${a}` }

export default function ContribuidoresPage() {
  return <RequireAdmin><ContribuidoresInner /></RequireAdmin>
}

function ContribuidoresInner() {
  const [mes, setMes] = useState('')
  const [lista, setLista] = useState<Contribuidor[]>([])
  const [loading, setLoading] = useState(true)

  // últimos 12 meses como opções
  const meses = useMemo(() => {
    const out: string[] = []
    const d = new Date()
    for (let i = 0; i < 12; i++) { out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); d.setMonth(d.getMonth() - 1) }
    return out
  }, [])
  useEffect(() => { if (!mes && meses.length) setMes(meses[0]) }, [meses, mes])
  useEffect(() => { if (!mes) return; setLoading(true); getTopContribuidores(mes).then(l => { setLista(l); setLoading(false) }) }, [mes])

  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-cream/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-end justify-between gap-4">
          <div>
            <a href="/" className="font-[family-name:var(--font-serif)] text-2xl leading-none hover:text-paprika transition-colors">Índice PF</a>
            <p className="text-xs text-muted mt-1">quem mais contribui com preços</p>
          </div>
          <div className="flex items-center gap-4 flex-wrap justify-end">
            <BotaoInicio />
            <AuthControls />
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-5">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-[family-name:var(--font-serif)] text-2xl">Top 10 contribuidores</h1>
            <p className="text-sm text-muted mt-1">Ranking do mês por contribuições aprovadas. Atualiza sozinho a cada mês.</p>
          </div>
          <label className="text-xs text-muted">Mês
            <select value={mes} onChange={e => setMes(e.target.value)}
              className="block bg-cream border border-line rounded-md px-2.5 py-2 text-sm mt-1 focus:outline-none focus:border-paprika cursor-pointer">
              {meses.map(m => <option key={m} value={m}>{rotuloMes(m)}</option>)}
            </select>
          </label>
        </div>

        {loading ? <p className="text-sm text-muted py-6">Carregando…</p>
          : !lista.length ? <p className="text-sm text-muted py-6">Nenhuma contribuição aprovada em {rotuloMes(mes)}.</p>
          : (
            <div className="border border-line rounded-lg bg-panel overflow-x-auto">
              <table className="w-full text-sm min-w-[32rem]">
                <thead>
                  <tr className="text-left text-[0.65rem] uppercase tracking-wide text-muted border-b border-line">
                    <th className="font-medium px-3 py-2">#</th>
                    <th className="font-medium px-3 py-2">Contribuidor</th>
                    <th className="font-medium px-3 py-2 text-right">Entradas</th>
                    <th className="font-medium px-3 py-2 text-right">Ingredientes</th>
                    <th className="font-medium px-3 py-2">Local</th>
                    <th className="font-medium px-3 py-2">Última</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((c, i) => (
                    <tr key={c.user_id} className="border-t border-line/60">
                      <td className="px-3 py-2 tnum text-muted">{i + 1}º</td>
                      <td className="px-3 py-2 font-medium">{i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : ''}{c.nome}</td>
                      <td className="px-3 py-2 text-right tnum text-paprika font-medium">{c.entradas}</td>
                      <td className="px-3 py-2 text-right tnum text-muted">{c.ingredientes}</td>
                      <td className="px-3 py-2 text-muted">{[c.cidade, c.uf].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="px-3 py-2 text-muted">{c.ultima ? new Date(c.ultima).toLocaleDateString('pt-BR') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        <p className="text-xs text-muted">Benefícios para os mais dedicados vêm por aí.</p>
      </div>
    </main>
  )
}
