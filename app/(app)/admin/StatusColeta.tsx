'use client'

import { useEffect, useState } from 'react'
import { inputBase } from '@/components/ui'
import { getStatusUltimaColeta, setPrecoManual, recalcularCustos, getHistoricoManual, type StatusColeta, type ItemColeta, type PrecoManualHist } from '@/lib/queries'
import { brl } from '@/lib/format'

export default function StatusColeta() {
  const [status, setStatus] = useState<StatusColeta | null | undefined>(undefined)
  const [modal, setModal] = useState(false)
  const [valores, setValores] = useState<Record<number, string>>({})
  const [lojas, setLojas] = useState<Record<number, string>>({})
  const [links, setLinks] = useState<Record<number, string>>({})
  const [hist, setHist] = useState<Record<number, PrecoManualHist[]>>({})
  const [salvandoId, setSalvandoId] = useState<number | null>(null)
  const [msg, setMsg] = useState('')

  async function recarregar() { setStatus(await getStatusUltimaColeta()) }
  useEffect(() => { recarregar() }, [])

  async function salvarManual(item: ItemColeta) {
    const preco = Number((valores[item.id] ?? '').replace(',', '.'))
    if (!(preco > 0)) { setMsg(`Informe um preço válido (R$/kg) para ${item.nome}.`); return }
    setSalvandoId(item.id); setMsg('')
    const { error } = await setPrecoManual(item.id, { preco_manual: preco, loja: lojas[item.id] || '', link: links[item.id] || '' })
    if (error) { setSalvandoId(null); setMsg(`Erro ao salvar ${item.nome}: ${error.message}`); return }
    await recalcularCustos()
    setSalvandoId(null)
    setValores(v => ({ ...v, [item.id]: '' })); setLojas(l => ({ ...l, [item.id]: '' })); setLinks(l => ({ ...l, [item.id]: '' }))
    if (item.id in hist) { const d = await getHistoricoManual(item.id); setHist(h => ({ ...h, [item.id]: d })) }
    setMsg(`Leitura de ${item.nome} registrada e custos recalculados.`)
    recarregar()
  }

  async function verHistorico(id: number) {
    if (id in hist) { setHist(h => { const c = { ...h }; delete c[id]; return c }); return }  // fecha
    setHist(h => ({ ...h, [id]: [] }))                  // abre (carregando)
    const data = await getHistoricoManual(id)
    setHist(h => ({ ...h, [id]: data }))
  }

  if (status === undefined) return <p className="text-sm text-dim">Carregando…</p>
  if (status === null) return <p className="text-sm text-dim">Nenhuma coleta registrada ainda.</p>

  const total = status.achados.length + status.naoAchados.length
  const dataFmt = new Date(status.data + 'T00:00:00').toLocaleDateString('pt-BR')

  return (
    <div className="space-y-5">
      <p className="text-sm text-dim">
        Resultado da última coleta online (snapshot mais recente). Os itens <strong>não encontrados</strong> continuam
        sendo raspados a cada coleta — aqui você define um preço manual de segurança para eles.
      </p>

      <div className="border border-border rounded-lg bg-surface p-5">
        <p className="text-xs text-dim mb-1">Último scrape</p>
        <p className="font-bold tracking-tight text-xl mb-4">{dataFmt}</p>
        <div className="grid grid-cols-3 gap-3">
          <Card n={total} label="itens no snapshot" cls="text-ink" onClick={() => setModal(true)} />
          <Card n={status.achados.length} label="encontrados" cls="text-ok" onClick={() => setModal(true)} />
          <Card n={status.naoAchados.length} label="não encontrados" cls="text-accent" onClick={() => setModal(true)} />
        </div>
      </div>

      {/* não encontrados: define preço manual inline */}
      <div>
        <h3 className="text-sm font-medium mb-1 text-accent">Não encontrados ({status.naoAchados.length})</h3>
        <p className="text-xs text-dim mb-3">Sem cotação online neste snapshot. Registre uma leitura (R$/kg) com a fonte (loja/link) para cobrir o custo até o scraper encontrá-los. Cada leitura fica arquivada no histórico.</p>
        {msg && <p className="text-xs text-dim mb-3">{msg}</p>}
        {!status.naoAchados.length ? <p className="text-sm text-dim">Todos os itens foram encontrados nesta coleta.</p> : (
          <div className="space-y-2">
            {status.naoAchados.map(item => (
              <div key={item.id} className="border border-border rounded-lg bg-surface p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{item.nome}</span>
                  <span className="text-xs text-dim">
                    {item.preco_manual != null ? `manual atual: ${brl(Number(item.preco_manual))}/kg` : 'sem manual'}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3 text-xs">
                  <label>Nova leitura (R$/kg)
                    <input value={valores[item.id] ?? ''} inputMode="decimal" placeholder="ex: 38,90"
                      onChange={e => setValores(v => ({ ...v, [item.id]: e.target.value }))} className={inputCls} />
                  </label>
                  <label>Loja/fonte
                    <input value={lojas[item.id] ?? ''} placeholder="ex: feira local"
                      onChange={e => setLojas(l => ({ ...l, [item.id]: e.target.value }))} className={inputCls} />
                  </label>
                  <label>Link
                    <input value={links[item.id] ?? ''} placeholder="https://…"
                      onChange={e => setLinks(l => ({ ...l, [item.id]: e.target.value }))} className={inputCls} />
                  </label>
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <button onClick={() => salvarManual(item)} disabled={salvandoId === item.id}
                    className="text-sm bg-accent text-white px-4 py-1.5 rounded-md hover:brightness-95 transition disabled:opacity-60">
                    {salvandoId === item.id ? 'Salvando…' : 'Salvar'}
                  </button>
                  <button onClick={() => verHistorico(item.id)}
                    className="text-xs text-accent hover:underline">{item.id in hist ? 'ocultar histórico' : 'histórico'}</button>
                </div>
                {item.id in hist && (
                  <div className="mt-3 border-t border-border pt-3">
                    {!hist[item.id].length ? <p className="text-xs text-dim">Sem histórico ainda.</p> : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-dim">
                            <th className="font-medium py-1">Data</th>
                            <th className="font-medium py-1 text-right">R$/kg</th>
                            <th className="font-medium py-1">Loja</th>
                          </tr>
                        </thead>
                        <tbody>
                          {hist[item.id].map(h => (
                            <tr key={h.id} className="border-t border-border/60">
                              <td className="py-1 text-dim">{new Date(h.criado_em).toLocaleString('pt-BR')}</td>
                              <td className="py-1 text-right tnum">{h.preco_manual != null ? brl(Number(h.preco_manual)) : '—'}</td>
                              <td className="py-1">{h.loja || (h.link ? <a href={h.link} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">fonte</a> : '—')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center px-4" onClick={() => setModal(false)}>
          <div className="bg-surface-2 border border-border rounded-lg max-w-2xl w-full max-h-[80vh] overflow-auto p-6"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold tracking-tight text-lg">Coleta de {dataFmt}</h3>
              <button onClick={() => setModal(false)} className="text-sm text-dim hover:text-ink">fechar ✕</button>
            </div>
            <div className="grid sm:grid-cols-2 gap-6">
              <Lista titulo="Não encontrados" cls="text-accent" itens={status.naoAchados} />
              <Lista titulo="Encontrados" cls="text-ok" itens={status.achados} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inputCls = inputBase

function Card({ n, label, cls, onClick }: { n: number; label: string; cls: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="border border-border rounded-md bg-surface-2 p-3 text-left hover:border-accent transition">
      <span className={`block font-bold tracking-tight text-2xl tnum ${cls}`}>{n}</span>
      <span className="block text-xs text-dim">{label}</span>
    </button>
  )
}

function Lista({ titulo, cls, itens }: { titulo: string; cls: string; itens: ItemColeta[] }) {
  return (
    <div>
      <p className={`text-sm font-medium mb-2 ${cls}`}>{titulo} ({itens.length})</p>
      {!itens.length ? <p className="text-xs text-dim">nenhum</p> : (
        <ul className="text-sm space-y-1">
          {itens.map(i => <li key={i.id} className="text-ink">{i.nome}</li>)}
        </ul>
      )}
    </div>
  )
}
