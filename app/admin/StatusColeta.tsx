'use client'

import { useEffect, useState } from 'react'
import { getStatusUltimaColeta, setPrecoManual, recalcularCustos, type StatusColeta, type ItemColeta } from '@/lib/queries'
import { brl } from '@/lib/format'

export default function StatusColeta() {
  const [status, setStatus] = useState<StatusColeta | null | undefined>(undefined)
  const [modal, setModal] = useState(false)
  const [valores, setValores] = useState<Record<number, string>>({})
  const [salvandoId, setSalvandoId] = useState<number | null>(null)
  const [msg, setMsg] = useState('')

  async function recarregar() { setStatus(await getStatusUltimaColeta()) }
  useEffect(() => { recarregar() }, [])

  async function salvarManual(item: ItemColeta) {
    const preco = Number((valores[item.id] ?? '').replace(',', '.'))
    if (!(preco > 0)) { setMsg(`Informe um preço válido (R$/kg) para ${item.nome}.`); return }
    setSalvandoId(item.id); setMsg('')
    const { error } = await setPrecoManual(item.id, { preco_manual: preco })
    if (error) { setSalvandoId(null); setMsg(`Erro ao salvar ${item.nome}: ${error.message}`); return }
    await recalcularCustos()
    setSalvandoId(null)
    setValores(v => ({ ...v, [item.id]: '' }))
    setMsg(`Preço manual de ${item.nome} salvo e custos recalculados.`)
    recarregar()
  }

  if (status === undefined) return <p className="text-sm text-muted">Carregando…</p>
  if (status === null) return <p className="text-sm text-muted">Nenhuma coleta registrada ainda.</p>

  const total = status.achados.length + status.naoAchados.length
  const dataFmt = new Date(status.data + 'T00:00:00').toLocaleDateString('pt-BR')

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Resultado da última coleta online (snapshot mais recente). Os itens <strong>não encontrados</strong> continuam
        sendo raspados a cada coleta — aqui você define um preço manual de segurança para eles.
      </p>

      <div className="border border-line rounded-lg bg-panel p-5">
        <p className="text-xs text-muted mb-1">Último scrape</p>
        <p className="font-[family-name:var(--font-serif)] text-xl mb-4">{dataFmt}</p>
        <div className="grid grid-cols-3 gap-3">
          <Card n={total} label="itens no snapshot" cls="text-ink" onClick={() => setModal(true)} />
          <Card n={status.achados.length} label="encontrados" cls="text-olive" onClick={() => setModal(true)} />
          <Card n={status.naoAchados.length} label="não encontrados" cls="text-paprika" onClick={() => setModal(true)} />
        </div>
      </div>

      {/* não encontrados: define preço manual inline */}
      <div>
        <h3 className="text-sm font-medium mb-1 text-paprika">Não encontrados ({status.naoAchados.length})</h3>
        <p className="text-xs text-muted mb-3">Sem cotação online neste snapshot. Defina um preço manual (R$/kg) para cobrir o custo até o scraper encontrá-los.</p>
        {msg && <p className="text-xs text-muted mb-3">{msg}</p>}
        {!status.naoAchados.length ? <p className="text-sm text-muted">Todos os itens foram encontrados nesta coleta.</p> : (
          <div className="space-y-2">
            {status.naoAchados.map(item => (
              <div key={item.id} className="border border-line rounded-lg bg-panel p-3 flex items-center gap-3 flex-wrap">
                <span className="text-sm flex-1 min-w-[8rem]">{item.nome}</span>
                <span className="text-xs text-muted">
                  {item.preco_manual != null ? `manual atual: ${brl(Number(item.preco_manual))}/kg` : 'sem manual'}
                </span>
                <input value={valores[item.id] ?? ''} inputMode="decimal" placeholder="R$/kg"
                  onChange={e => setValores(v => ({ ...v, [item.id]: e.target.value }))}
                  className="w-24 bg-cream border border-line rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-paprika" />
                <button onClick={() => salvarManual(item)} disabled={salvandoId === item.id}
                  className="text-sm bg-paprika text-white px-3 py-1.5 rounded-md hover:brightness-95 transition disabled:opacity-60">
                  {salvandoId === item.id ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center px-4" onClick={() => setModal(false)}>
          <div className="bg-cream border border-line rounded-lg max-w-2xl w-full max-h-[80vh] overflow-auto p-6"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-[family-name:var(--font-serif)] text-lg">Coleta de {dataFmt}</h3>
              <button onClick={() => setModal(false)} className="text-sm text-muted hover:text-ink">fechar ✕</button>
            </div>
            <div className="grid sm:grid-cols-2 gap-6">
              <Lista titulo="Não encontrados" cls="text-paprika" itens={status.naoAchados} />
              <Lista titulo="Encontrados" cls="text-olive" itens={status.achados} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Card({ n, label, cls, onClick }: { n: number; label: string; cls: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="border border-line rounded-md bg-cream p-3 text-left hover:border-paprika transition">
      <span className={`block font-[family-name:var(--font-serif)] text-2xl tnum ${cls}`}>{n}</span>
      <span className="block text-xs text-muted">{label}</span>
    </button>
  )
}

function Lista({ titulo, cls, itens }: { titulo: string; cls: string; itens: ItemColeta[] }) {
  return (
    <div>
      <p className={`text-sm font-medium mb-2 ${cls}`}>{titulo} ({itens.length})</p>
      {!itens.length ? <p className="text-xs text-muted">nenhum</p> : (
        <ul className="text-sm space-y-1">
          {itens.map(i => <li key={i.id} className="text-ink">{i.nome}</li>)}
        </ul>
      )}
    </div>
  )
}
