'use client'

import type { SeriePreditor } from '@/lib/preditores'

// Escolha de séries por menu, agrupada por tipo de dado, com o que já foi
// escolhido virando chip removível. Substitui a lista de dezenas de checkboxes,
// que ficava densa e com cores repetidas sem significado.
export default function SeletorSeries({ titulo, opcoes, selecionadas, onToggle, cor }: {
  titulo: string
  opcoes: readonly SeriePreditor[]
  selecionadas: Set<string>
  onToggle: (key: string) => void
  cor: (key: string) => string
}) {
  const grupos = [...new Set(opcoes.map(o => o.grupo))]
  const escolhidas = opcoes.filter(o => selecionadas.has(o.key))

  return (
    <div className="space-y-2">
      <p className="text-xs text-dim">{titulo}</p>
      <div className="flex gap-2 flex-wrap">
        {grupos.map(g => {
          const doGrupo = opcoes.filter(o => o.grupo === g)
          const nDisp = doGrupo.filter(o => !selecionadas.has(o.key)).length
          return (
            <select key={g} value="" disabled={nDisp === 0}
              onChange={e => { if (e.target.value) onToggle(e.target.value) }}
              className="bg-surface-2 border border-border rounded-md px-2.5 py-1.5 text-xs text-ink-2 focus:outline-none focus:border-accent disabled:opacity-50 cursor-pointer">
              <option value="">{g}{nDisp ? ` (${nDisp})` : ' — todas'}</option>
              {doGrupo.filter(o => !selecionadas.has(o.key)).map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
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
