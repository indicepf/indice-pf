'use client'

import { useEffect, useRef, useState } from 'react'
import type { SeriePreditor } from '@/lib/preditores'

// Escolha de séries agrupada por tipo de dado. Cada grupo abre um painel com
// checkboxes: dá para marcar várias sem reabrir o menu a cada escolha (um
// <select> nativo fecha a cada seleção). O escolhido vira chip removível.
export default function SeletorSeries({ titulo, opcoes, selecionadas, onToggle, cor }: {
  titulo: string
  opcoes: readonly SeriePreditor[]
  selecionadas: Set<string>
  onToggle: (key: string) => void
  cor: (key: string) => string
}) {
  const [aberto, setAberto] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(null) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(null) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])

  const grupos = [...new Set(opcoes.map(o => o.grupo))]
  const escolhidas = opcoes.filter(o => selecionadas.has(o.key))

  return (
    <div className="space-y-2" ref={ref}>
      <p className="text-xs text-dim">{titulo}</p>
      <div className="flex gap-2 flex-wrap">
        {grupos.map(g => {
          const doGrupo = opcoes.filter(o => o.grupo === g)
          const nSel = doGrupo.filter(o => selecionadas.has(o.key)).length
          return (
            <div key={g} className="relative">
              <button type="button" onClick={() => setAberto(aberto === g ? null : g)}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition ${
                  nSel ? 'border-accent/50 bg-accent/10 text-ink' : 'border-border bg-surface-2 text-ink-2 hover:border-accent'}`}>
                {g}{nSel > 0 && <span className="text-accent font-medium">({nSel})</span>}
                <span className="text-dim">▾</span>
              </button>
              {aberto === g && (
                <div className="absolute z-40 mt-1 w-64 max-h-72 overflow-auto bg-surface-2 border border-border rounded-md shadow-lg p-1">
                  {doGrupo.map(o => (
                    <label key={o.key}
                      className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface cursor-pointer">
                      <input type="checkbox" checked={selecionadas.has(o.key)} onChange={() => onToggle(o.key)} />
                      <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ background: selecionadas.has(o.key) ? cor(o.key) : 'var(--border-2)' }} />
                      <span className="min-w-0">{o.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {escolhidas.length > 0 && (
        <div className="flex gap-1.5 flex-wrap pt-0.5">
          {escolhidas.map(o => (
            <button key={o.key} onClick={() => onToggle(o.key)}
              className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border border-border bg-surface hover:border-accent transition"
              title="remover">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: cor(o.key) }} />
              {o.label}
              <span className="text-dim">×</span>
            </button>
          ))}
          {escolhidas.length > 1 && (
            <button onClick={() => escolhidas.forEach(o => onToggle(o.key))}
              className="text-xs text-dim hover:text-accent px-1.5">limpar</button>
          )}
        </div>
      )}
    </div>
  )
}
