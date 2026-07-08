'use client'

import { useEffect, useState } from 'react'
import { useAnuncio, AdCreative } from './AdSlot'

// Gate: cobre o conteúdo (gráfico/tabela) com um anúncio até o visitante fechar.
// Controle é do admin: o gate só existe se houver criativo ativo no slot.
// Frequency cap: 1× por sessão por slot (sessionStorage). Premium nunca vê.
export default function AdGate({ slot, children }: { slot: string; children: React.ReactNode }) {
  const { ad, pathname } = useAnuncio(slot)
  const [fechado, setFechado] = useState(true)   // começa fechado até checar a sessão (evita flash)

  useEffect(() => {
    try { setFechado(sessionStorage.getItem(`adgate:${slot}`) === '1') } catch { setFechado(true) }
  }, [slot])

  function fechar() {
    try { sessionStorage.setItem(`adgate:${slot}`, '1') } catch { /* sessão privada */ }
    setFechado(true)
  }

  if (!ad || fechado) return <>{children}</>

  return (
    <div className="relative">
      <div className="blur-[6px] select-none pointer-events-none" aria-hidden="true">{children}</div>
      <div className="absolute inset-0 grid place-items-center bg-surface/50 p-4 z-10">
        <div className="w-full max-w-sm" style={ad.escala < 1 ? { maxWidth: `${Math.max(ad.escala * 100, 30)}%` } : undefined}>
          <AdCreative ad={ad} pagina={pathname} />
          <button onClick={fechar}
            className="mt-2 w-full text-center text-xs text-dim hover:text-ink bg-surface border border-border rounded-[var(--r-sm)] px-3 py-2 transition-colors cursor-pointer">
            Fechar anúncio para ver o conteúdo ×
          </button>
        </div>
      </div>
    </div>
  )
}
