'use client'

import { useState } from 'react'

const numPrato = (nome: string) => parseInt(nome, 10) || 999   // prefixo "12. …"

// seletor de prato com busca, agrupado por região
export default function SeletorPrato({ pratos, value, onChange }: {
  pratos: { id: number; nome: string; regiao: string }[]; value: number; onChange: (id: number) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const sel = value === 0 ? 'Todos os pratos'
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
        className="flex items-center justify-between gap-2 bg-surface-2 border border-border rounded-md px-2.5 py-2 text-sm text-ink w-full sm:w-[22rem] hover:border-accent transition">
        <span className="truncate">{sel}</span>
        <span className="text-dim shrink-0">▾</span>
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAberto(false)} />
          <div className="absolute z-40 mt-1 w-full sm:w-[22rem] bg-surface-2 border border-border rounded-md shadow-lg max-h-[22rem] overflow-auto">
            <div className="sticky top-0 bg-surface-2 p-2 border-b border-border">
              <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar prato ou região…"
                className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent" />
            </div>
            <button onClick={() => escolher(0)}
              className={`block w-full text-left px-3 py-2 text-sm hover:bg-surface ${value === 0 ? 'text-accent font-medium' : 'text-ink'}`}>
              Todos os pratos
            </button>
            {Object.keys(porRegiao).map(reg => (
              <div key={reg}>
                <div className="px-3 py-1 text-[0.65rem] uppercase tracking-wide text-dim bg-surface/60 sticky top-[3.25rem]">{reg}</div>
                {porRegiao[reg].map(p => (
                  <button key={p.id} onClick={() => escolher(p.id)}
                    className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-surface ${value === p.id ? 'text-accent font-medium' : 'text-ink'}`}>
                    {p.nome}
                  </button>
                ))}
              </div>
            ))}
            {!filtrados.length && <p className="px-3 py-3 text-sm text-dim">Nenhum prato para “{busca}”.</p>}
          </div>
        </>
      )}
    </div>
  )
}
