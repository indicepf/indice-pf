'use client'

import { useEffect, useState } from 'react'
import {
  getSnapshotsNovos, getDetalheIngredientes, getAllFontes, getAllFontesManuais,
  type LinhaIngrediente, type FonteManual,
} from '@/lib/queries'
import type { Fonte } from '@/lib/types'
import ModalFontes from '../ModalFontes'
import { brl } from '@/lib/format'

const fmtData = (d: string) => { const [a, m, dia] = d.split('-'); return `${dia}/${m}/${a}` }

export default function TabelaIngredientes() {
  const [snaps, setSnaps] = useState<{ id: number; data: string }[]>([])
  const [snapId, setSnapId] = useState<number | null>(null)
  const [linhas, setLinhas] = useState<LinhaIngrediente[]>([])
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<'nome' | 'mediana' | 'inflacao'>('nome')
  const [fontesMap, setFontesMap] = useState<Record<number, Fonte[]>>({})
  const [manuaisMap, setManuaisMap] = useState<Record<number, FonteManual[]>>({})
  const [modal, setModal] = useState<{ id: number; nome: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { getSnapshotsNovos().then(s => { setSnaps(s); setSnapId(s[0]?.id ?? null) }) }, [])
  useEffect(() => {
    if (snapId == null) return
    const snap = snaps.find(s => s.id === snapId); if (!snap) return
    setLoading(true)
    Promise.all([getDetalheIngredientes(snapId), getAllFontes(snapId), getAllFontesManuais(snap.data)])
      .then(([l, f, m]) => { setLinhas(l); setFontesMap(f); setManuaisMap(m); setLoading(false) })
  }, [snapId, snaps])

  const b = busca.trim().toLowerCase()
  const vis = linhas
    .filter(l => !b || l.nome.toLowerCase().includes(b) || (l.categoria || '').toLowerCase().includes(b))
    .sort((a, c) => ordem === 'nome' ? a.nome.localeCompare(c.nome)
      : ordem === 'mediana' ? (c.mediana ?? -1) - (a.mediana ?? -1)
      : (c.inflacao ?? -Infinity) - (a.inflacao ?? -Infinity))

  const val = (v: number | null) => v == null ? '—' : brl(v)

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
        <label className="text-xs text-muted">Coleta
          <select value={snapId ?? ''} onChange={e => setSnapId(Number(e.target.value))} className={inputCls}>
            {snaps.map((s, i) => <option key={s.id} value={s.id}>{fmtData(s.data)}{i === 0 ? ' (última)' : ''}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted flex-1 min-w-[12rem]">Buscar
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="ingrediente ou categoria…" className={inputCls} />
        </label>
        <label className="text-xs text-muted">Ordenar por
          <select value={ordem} onChange={e => setOrdem(e.target.value as any)} className={inputCls}>
            <option value="nome">Nome</option>
            <option value="mediana">Maior preço</option>
            <option value="inflacao">Maior variação</option>
          </select>
        </label>
      </div>

      {loading ? <p className="text-sm text-muted py-6">Carregando…</p> : (
        <div className="border border-line rounded-lg bg-panel overflow-x-auto">
          <table className="w-full text-sm min-w-[46rem]">
            <thead>
              <tr className="text-left text-[0.65rem] uppercase tracking-wide text-muted border-b border-line">
                <th className="font-medium px-3 py-2">Ingrediente</th>
                <th className="font-medium px-3 py-2">Categoria</th>
                <th className="font-medium px-3 py-2 text-right">Mediana</th>
                <th className="font-medium px-3 py-2 text-right">Média</th>
                <th className="font-medium px-3 py-2 text-right">Mín</th>
                <th className="font-medium px-3 py-2 text-right">Máx</th>
                <th className="font-medium px-3 py-2 text-right">±DP</th>
                <th className="font-medium px-3 py-2 text-right">n</th>
                <th className="font-medium px-3 py-2 text-right">Variação</th>
                <th className="font-medium px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {vis.map(l => {
                const temFonte = (fontesMap[l.id]?.length || 0) > 0 || (manuaisMap[l.id]?.length || 0) > 0
                return (
                  <tr key={l.id} className="border-t border-line/60">
                    <td className="px-3 py-2">{l.nome} <span className="text-[0.65rem] text-muted">/{l.label}</span></td>
                    <td className="px-3 py-2 text-muted">{l.categoria || '—'}</td>
                    <td className="px-3 py-2 text-right tnum font-medium text-paprika">{val(l.mediana)}</td>
                    <td className="px-3 py-2 text-right tnum text-muted">{val(l.media)}</td>
                    <td className="px-3 py-2 text-right tnum text-muted">{val(l.min)}</td>
                    <td className="px-3 py-2 text-right tnum text-muted">{val(l.max)}</td>
                    <td className="px-3 py-2 text-right tnum text-muted">{l.dp == null ? '—' : `±${brl(l.dp)}`}</td>
                    <td className="px-3 py-2 text-right tnum text-muted">{l.n}</td>
                    <td className="px-3 py-2 text-right tnum">
                      {l.inflacao == null ? <span className="text-muted">—</span>
                        : <span className={l.inflacao > 0 ? 'text-red-600' : l.inflacao < 0 ? 'text-olive' : 'text-muted'}>
                            {l.inflacao > 0 ? '+' : ''}{(l.inflacao * 100).toFixed(1)}%
                          </span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {temFonte && <button onClick={() => setModal({ id: l.id, nome: l.nome })} className="text-xs text-paprika hover:underline">fontes</button>}
                    </td>
                  </tr>
                )
              })}
              {!vis.length && <tr><td colSpan={10} className="px-3 py-6 text-center text-muted text-sm">Nenhum ingrediente.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ModalFontes nome={modal.nome} fontes={fontesMap[modal.id] || []} manuais={manuaisMap[modal.id] || []} onClose={() => setModal(null)} />
      )}
    </div>
  )
}

const inputCls = 'block bg-cream border border-line rounded-md px-2.5 py-2 text-sm text-ink focus:outline-none focus:border-paprika mt-1'
