'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  getSnapshotsNovos, getDetalheIngredientes, getAllFontes, getAllFontesManuais,
  type LinhaIngrediente, type FonteManual,
} from '@/lib/queries'
import type { Fonte } from '@/lib/types'
import ModalFontes from '../ModalFontes'
import { brl } from '@/lib/format'

const fmtData = (d: string) => { const [a, m, dia] = d.split('-'); return `${dia}/${m}/${a}` }

type ColKey = keyof Pick<LinhaIngrediente, 'nome' | 'categoria' | 'mediana' | 'media' | 'min' | 'max' | 'dp' | 'n' | 'inflacao'>
const COLS: { key: ColKey; label: string; tip: string; align: 'left' | 'right' }[] = [
  { key: 'nome', label: 'Ingrediente', tip: 'Nome do ingrediente e unidade de medida (kg ou L).', align: 'left' },
  { key: 'categoria', label: 'Categoria', tip: 'Grupo do ingrediente.', align: 'left' },
  { key: 'mediana', label: 'Mediana', tip: 'Preço mediano das cotações online desta coleta (R$ por kg/L). É o valor que entra no índice.', align: 'right' },
  { key: 'media', label: 'Média', tip: 'Média aritmética das cotações online desta coleta.', align: 'right' },
  { key: 'min', label: 'Mín', tip: 'Menor cotação online válida da coleta.', align: 'right' },
  { key: 'max', label: 'Máx', tip: 'Maior cotação online válida da coleta.', align: 'right' },
  { key: 'dp', label: '±DP', tip: 'Desvio padrão das cotações — o quanto o preço varia entre as lojas.', align: 'right' },
  { key: 'n', label: 'n', tip: 'Número de cotações válidas que entraram nas estatísticas.', align: 'right' },
  { key: 'inflacao', label: 'Var.', tip: 'Variação da mediana em relação à coleta anterior.', align: 'right' },
]

export default function TabelaIngredientes() {
  const [snaps, setSnaps] = useState<{ id: number; data: string }[]>([])
  const [snapId, setSnapId] = useState<number | null>(null)
  const [linhas, setLinhas] = useState<LinhaIngrediente[]>([])
  const [busca, setBusca] = useState('')
  const [ordCol, setOrdCol] = useState<ColKey>('nome')
  const [ordDir, setOrdDir] = useState<1 | -1>(1)
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

  function clicarCol(k: ColKey) {
    if (k === ordCol) setOrdDir(d => (d === 1 ? -1 : 1))
    else { setOrdCol(k); setOrdDir(k === 'nome' || k === 'categoria' ? 1 : -1) }
  }

  const vis = useMemo(() => {
    const b = busca.trim().toLowerCase()
    const f = linhas.filter(l => !b || l.nome.toLowerCase().includes(b) || (l.categoria || '').toLowerCase().includes(b))
    return f.sort((a, c) => {
      const va = a[ordCol], vc = c[ordCol]
      if (typeof va === 'string' || typeof vc === 'string') return String(va ?? '').localeCompare(String(vc ?? '')) * ordDir
      return (((va as number) ?? -Infinity) - ((vc as number) ?? -Infinity)) * ordDir
    })
  }, [linhas, busca, ordCol, ordDir])

  const cel = (v: number | null) => v == null ? '—' : brl(v)

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
        <p className="text-xs text-muted self-end pb-2">Clique num cabeçalho para ordenar · passe o mouse para ver o que cada coluna significa.</p>
      </div>

      {loading ? <p className="text-sm text-muted py-6">Carregando…</p> : (
        <div className="border border-line rounded-lg bg-panel">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[0.62rem] uppercase tracking-wide text-muted border-b border-line">
                {COLS.map(c => (
                  <th key={c.key} title={c.tip}
                    className={`font-medium px-2 py-2 cursor-pointer select-none hover:text-ink ${c.align === 'right' ? 'text-right' : ''}`}
                    onClick={() => clicarCol(c.key)}>
                    {c.label}{ordCol === c.key ? (ordDir === 1 ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
                <th className="px-2 py-2" title="Cotações que originaram os valores (online e leituras manuais)."></th>
              </tr>
            </thead>
            <tbody>
              {vis.map(l => {
                const temFonte = (fontesMap[l.id]?.length || 0) > 0 || (manuaisMap[l.id]?.length || 0) > 0
                return (
                  <tr key={l.id} className="border-t border-line/60">
                    <td className="px-2 py-1.5">{l.nome} <span className="text-[0.6rem] text-muted">/{l.label}</span></td>
                    <td className="px-2 py-1.5 text-muted">{l.categoria || '—'}</td>
                    <td className="px-2 py-1.5 text-right tnum font-medium text-paprika">{cel(l.mediana)}</td>
                    <td className="px-2 py-1.5 text-right tnum text-muted">{cel(l.media)}</td>
                    <td className="px-2 py-1.5 text-right tnum text-muted">{cel(l.min)}</td>
                    <td className="px-2 py-1.5 text-right tnum text-muted">{cel(l.max)}</td>
                    <td className="px-2 py-1.5 text-right tnum text-muted">{l.dp == null ? '—' : `±${brl(l.dp)}`}</td>
                    <td className="px-2 py-1.5 text-right tnum text-muted">{l.n}</td>
                    <td className="px-2 py-1.5 text-right tnum">
                      {l.inflacao == null ? <span className="text-muted">—</span>
                        : <span className={l.inflacao > 0 ? 'text-red-600' : l.inflacao < 0 ? 'text-olive' : 'text-muted'}>
                            {l.inflacao > 0 ? '+' : ''}{(l.inflacao * 100).toFixed(1)}%
                          </span>}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {temFonte && <button onClick={() => setModal({ id: l.id, nome: l.nome })} className="text-paprika hover:underline">fontes</button>}
                    </td>
                  </tr>
                )
              })}
              {!vis.length && <tr><td colSpan={COLS.length + 1} className="px-3 py-6 text-center text-muted text-sm">Nenhum ingrediente.</td></tr>}
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
