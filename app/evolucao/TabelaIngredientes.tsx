'use client'

import { useEffect, useMemo, useState } from 'react'
import { inputBase } from '@/components/ui'
import {
  getSnapshotsNovos, getDetalheIngredientesRange, getAllFontes, getAllFontesManuais,
  type LinhaIngrediente, type FonteManual,
} from '@/lib/queries'
import type { Fonte } from '@/lib/types'
import ModalFontes from '../ModalFontes'
import InfoTip from '../InfoTip'
import BotaoExportar from './BotaoExportar'
import { brl } from '@/lib/format'

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
  const [ini, setIni] = useState('')
  const [fim, setFim] = useState('')
  const [linhas, setLinhas] = useState<LinhaIngrediente[]>([])
  const [busca, setBusca] = useState('')
  const [ordCol, setOrdCol] = useState<ColKey>('nome')
  const [ordDir, setOrdDir] = useState<1 | -1>(1)
  const [fontesMap, setFontesMap] = useState<Record<number, Fonte[]>>({})
  const [manuaisMap, setManuaisMap] = useState<Record<number, FonteManual[]>>({})
  const [modal, setModal] = useState<{ id: number; nome: string } | null>(null)
  const [dataFontes, setDataFontes] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { getSnapshotsNovos().then(s => { setSnaps(s); if (s[0]) { setIni(s[0].data); setFim(s[0].data) } }) }, [])
  useEffect(() => {
    if (!snaps.length || !fim) return
    const range = snaps.filter(s => (!ini || s.data >= ini) && (!fim || s.data <= fim))
    const latest = range[0] || snaps[0]
    setDataFontes(latest.data)
    setLoading(true)
    Promise.all([getDetalheIngredientesRange(ini, fim), getAllFontes(latest.id), getAllFontesManuais(latest.data)])
      .then(([l, f, m]) => { setLinhas(l); setFontesMap(f); setManuaisMap(m); setLoading(false) })
  }, [ini, fim, snaps])

  function preset(dias: number) {
    if (!snaps.length) return
    setFim(snaps[0].data)
    if (dias === 0) setIni(snaps[snaps.length - 1].data)
    else { const d = new Date(snaps[0].data + 'T00:00:00Z'); d.setDate(d.getDate() - dias); setIni(d.toISOString().slice(0, 10)) }
  }
  const nColetas = snaps.filter(s => (!ini || s.data >= ini) && (!fim || s.data <= fim)).length

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
        <div className="text-xs text-dim">Período
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <div className="inline-flex border border-border rounded-md overflow-hidden bg-surface">
              {([['30d', 30], ['3m', 90], ['6m', 180], ['Tudo', 0]] as const).map(([label, d]) => (
                <button key={label} onClick={() => preset(d)} className="px-2.5 py-1.5 text-dim hover:text-ink">{label}</button>
              ))}
            </div>
            <input type="date" value={ini} onChange={e => setIni(e.target.value)} className="bg-surface-2 border border-border rounded px-2 py-1.5 focus:outline-none focus:border-accent" />
            <span>até</span>
            <input type="date" value={fim} onChange={e => setFim(e.target.value)} className="bg-surface-2 border border-border rounded px-2 py-1.5 focus:outline-none focus:border-accent" />
          </div>
        </div>
        <label className="text-xs text-dim flex-1 min-w-[12rem]">Buscar
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="ingrediente ou categoria…" className={inputCls} />
        </label>
        {nColetas > 1 && <p className="text-xs text-dim self-end pb-2">Média de {nColetas} coletas no período</p>}
        <div className="sm:ml-auto self-end pb-1">
          <BotaoExportar nome="indice-pf-ingredientes" abas={() => {
            const compilado = vis.map(l => ({
              Ingrediente: l.nome, Unidade: l.label, Categoria: l.categoria,
              Mediana: l.mediana, Média: l.media, Mínimo: l.min, Máximo: l.max, DesvioPadrão: l.dp,
              N: l.n, VariacaoPct: l.inflacao != null ? Math.round(l.inflacao * 1000) / 10 : null,
            }))
            const fontes: Record<string, any>[] = []
            for (const l of vis) {
              for (const f of (fontesMap[l.id] || [])) fontes.push({ Ingrediente: l.nome, Fonte: 'online', Titulo: f.titulo, Loja: f.loja, Preco: f.preco_bruto, Normalizado: f.exibicao, Link: f.link })
              for (const m of (manuaisMap[l.id] || [])) fontes.push({ Ingrediente: l.nome, Fonte: m.origem || 'manual', Titulo: 'leitura manual', Loja: m.loja, Preco: m.preco_manual, Data: m.criado_em, Link: m.link })
            }
            return [{ nome: 'Ingredientes', linhas: compilado }, { nome: 'Fontes', linhas: fontes }]
          }} />
        </div>
      </div>

      {loading ? <p className="text-sm text-dim py-6">Carregando…</p> : (
        <div className="border border-border rounded-lg bg-surface">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[0.62rem] uppercase tracking-wide text-dim border-b border-border">
                {COLS.map(c => (
                  <th key={c.key} className={`font-medium px-2 py-2 whitespace-nowrap ${c.align === 'right' ? 'text-right' : ''}`}>
                    <span className="cursor-pointer select-none hover:text-ink" onClick={() => clicarCol(c.key)}>
                      {c.label}{ordCol === c.key ? (ordDir === 1 ? ' ▲' : ' ▼') : ''}
                    </span>
                    <InfoTip texto={c.tip} w="w-52" pos={c.align === 'right' ? 'right' : 'left'} />
                  </th>
                ))}
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {vis.map(l => {
                const temFonte = (fontesMap[l.id]?.length || 0) > 0 || (manuaisMap[l.id]?.length || 0) > 0
                return (
                  <tr key={l.id} className="border-t border-border/60">
                    <td className="px-2 py-1.5">{l.nome} <span className="text-[0.6rem] text-dim">/{l.label}</span></td>
                    <td className="px-2 py-1.5 text-dim">{l.categoria || '—'}</td>
                    <td className="px-2 py-1.5 text-right tnum font-medium text-accent">{cel(l.mediana)}</td>
                    <td className="px-2 py-1.5 text-right tnum text-dim">{cel(l.media)}</td>
                    <td className="px-2 py-1.5 text-right tnum text-dim">{cel(l.min)}</td>
                    <td className="px-2 py-1.5 text-right tnum text-dim">{cel(l.max)}</td>
                    <td className="px-2 py-1.5 text-right tnum text-dim">{l.dp == null ? '—' : `±${brl(l.dp)}`}</td>
                    <td className="px-2 py-1.5 text-right tnum text-dim">{l.n}</td>
                    <td className="px-2 py-1.5 text-right tnum">
                      {l.inflacao == null ? <span className="text-dim">—</span>
                        : <span className={l.inflacao > 0 ? 'text-danger' : l.inflacao < 0 ? 'text-ok' : 'text-dim'}>
                            {l.inflacao > 0 ? '+' : ''}{(l.inflacao * 100).toFixed(1)}%
                          </span>}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {temFonte && <button onClick={() => setModal({ id: l.id, nome: l.nome })} className="text-accent hover:underline">fontes</button>}
                    </td>
                  </tr>
                )
              })}
              {!vis.length && <tr><td colSpan={COLS.length + 1} className="px-3 py-6 text-center text-dim text-sm">Nenhum ingrediente.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ModalFontes nome={modal.nome} fontes={fontesMap[modal.id] || []} manuais={manuaisMap[modal.id] || []} dataColeta={dataFontes} onClose={() => setModal(null)} />
      )}
    </div>
  )
}

const inputCls = inputBase
