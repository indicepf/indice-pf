'use client'

import { useEffect, useState } from 'react'
import { getVariacoesFortes, getEntradasIngrediente, excluirEntradaERecalcular, type VariacaoForte, type EntradaBruta } from '@/lib/queries'
import { capturarContexto } from '@/lib/contexto'
import { brl } from '@/lib/format'
import type { Ing } from '@/lib/types'

export default function AuditoriaDados({ ings }: { ings: Ing[] }) {
  const [fortes, setFortes] = useState<VariacaoForte[]>([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<{ id: number; nome: string } | null>(null)
  const [entradas, setEntradas] = useState<EntradaBruta[]>([])
  const [snapId, setSnapId] = useState(0)
  const [busca, setBusca] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { getVariacoesFortes().then(v => { setFortes(v); setLoading(false) }) }, [])

  async function abrir(id: number, nome: string) {
    setSel({ id, nome }); setEntradas([]); setMsg('')
    const { snapshotId, entradas } = await getEntradasIngrediente(id)
    setSnapId(snapshotId); setEntradas(entradas)
  }
  async function excluir(e: EntradaBruta) {
    if (!sel) return
    if (!confirm(`Excluir esta entrada de ${sel.nome}? A mediana do ingrediente e o índice serão recalculados. A ação fica registrada em "Ações do super".\n\n${e.titulo}\n${e.exibicao}`)) return
    setBusy(true); setMsg('')
    const ctx = await capturarContexto()
    const { error } = await excluirEntradaERecalcular(e.id, snapId, sel.id, ctx)
    if (error) { setBusy(false); setMsg(`Erro ao excluir: ${error.message}`); return }
    setEntradas(prev => prev.filter(x => x.id !== e.id))
    getVariacoesFortes().then(setFortes)
    setBusy(false); setMsg('Entrada excluída e índice recalculado.')
  }

  const b = busca.trim().toLowerCase()
  const ingsBusca = b ? ings.filter(i => i.nome.toLowerCase().includes(b)).slice(0, 8) : []

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Auditoria da coleta (só superusuário). Variações fortes ajudam a achar preço errado (ex.: um produto pronto no
        lugar do ingrediente). Abra o ingrediente, confira as fontes e <strong>exclua a entrada ruim</strong> — a mediana
        e o índice são recalculados na hora.
      </p>

      {/* variações fortes */}
      <div>
        <h3 className="text-sm font-medium mb-2">Variações fortes (&gt;30%) entre as duas últimas coletas</h3>
        {loading ? <p className="text-sm text-muted">Carregando…</p>
          : !fortes.length ? <p className="text-sm text-muted">Nenhuma variação acima de 30%.</p>
          : (
            <div className="border border-line rounded-lg bg-panel overflow-x-auto">
              <table className="w-full text-sm min-w-[34rem]">
                <thead>
                  <tr className="text-left text-[0.65rem] uppercase tracking-wide text-muted border-b border-line">
                    <th className="font-medium px-3 py-2">Ingrediente</th>
                    <th className="font-medium px-3 py-2 text-right">Anterior</th>
                    <th className="font-medium px-3 py-2 text-right">Atual</th>
                    <th className="font-medium px-3 py-2 text-right">Variação</th>
                    <th className="font-medium px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {fortes.map(v => (
                    <tr key={v.id} className="border-t border-line/60">
                      <td className="px-3 py-2">{v.nome} <span className="text-[0.65rem] text-muted">/{v.label}</span></td>
                      <td className="px-3 py-2 text-right tnum text-muted">{brl(v.medAnt)}</td>
                      <td className="px-3 py-2 text-right tnum">{brl(v.medAtual)}</td>
                      <td className={`px-3 py-2 text-right tnum font-medium ${v.delta > 0 ? 'text-red-600' : 'text-olive'}`}>{v.delta > 0 ? '+' : ''}{(v.delta * 100).toFixed(0)}%</td>
                      <td className="px-3 py-2 text-right"><button onClick={() => abrir(v.id, v.nome)} className="text-xs text-paprika hover:underline">ver entradas</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* buscar qualquer ingrediente */}
      <div>
        <h3 className="text-sm font-medium mb-2">Inspecionar qualquer ingrediente</h3>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar ingrediente…"
          className="bg-cream border border-line rounded-md px-3 py-1.5 text-sm w-full sm:w-72 focus:outline-none focus:border-paprika" />
        {ingsBusca.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {ingsBusca.map(i => (
              <button key={i.id} onClick={() => { abrir(i.id, i.nome); setBusca('') }}
                className="text-xs border border-line rounded-md px-2.5 py-1 hover:border-paprika transition">{i.nome}</button>
            ))}
          </div>
        )}
      </div>

      {/* entradas do ingrediente selecionado */}
      {sel && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium">Entradas online de {sel.nome} (última coleta)</h3>
            <button onClick={() => setSel(null)} className="text-xs text-muted hover:text-ink">fechar</button>
          </div>
          {msg && <p className="text-xs text-olive mb-2">{msg}</p>}
          {!entradas.length ? <p className="text-sm text-muted">Sem entradas online nesta coleta.</p> : (
            <div className="space-y-2">
              {entradas.map(e => (
                <div key={e.id} className="border border-line rounded-md bg-panel px-3 py-2.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <a href={e.link || undefined} target="_blank" rel="noopener noreferrer" className="text-sm hover:text-paprika truncate block">{e.titulo}</a>
                    <p className="text-xs text-muted">{e.loja} · {e.exibicao}</p>
                  </div>
                  <span className="text-sm tnum text-paprika shrink-0">{e.preco_bruto != null ? brl(Number(e.preco_bruto)) : '—'}</span>
                  <button disabled={busy} onClick={() => excluir(e)}
                    className="text-xs border border-red-200 text-red-600 px-2.5 py-1 rounded-md hover:bg-red-50 transition disabled:opacity-60 shrink-0">excluir</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
