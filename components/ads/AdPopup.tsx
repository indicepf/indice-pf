'use client'

import { useEffect, useState } from 'react'
import { useAnuncio, AdCreative } from './AdSlot'

// Pop-up de anúncio: modal exibido 1× por sessão (slot 'popup').
// Só aparece se houver criativo ativo; premium nunca vê; fecha por ×, Esc ou clique fora.
export default function AdPopup() {
  const { ad, pathname } = useAnuncio('popup')
  const [visto, setVisto] = useState(true)   // começa oculto até checar a sessão

  useEffect(() => {
    try { setVisto(sessionStorage.getItem('adpopup') === '1') } catch { setVisto(true) }
  }, [])

  useEffect(() => {
    if (!ad || visto) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad, visto])

  function fechar() {
    try { sessionStorage.setItem('adpopup', '1') } catch { /* sessão privada */ }
    setVisto(true)
  }

  if (!ad || visto) return null

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center bg-ink/40 px-4" onClick={fechar}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-md"
        style={ad.escala < 1 ? { maxWidth: `${Math.max(ad.escala * 28, 14)}rem` } : undefined}>
        <div className="flex justify-end mb-1">
          <button onClick={fechar} aria-label="Fechar anúncio"
            className="bg-surface border border-border rounded-full w-7 h-7 grid place-items-center text-dim hover:text-ink text-sm cursor-pointer">×</button>
        </div>
        <AdCreative ad={ad} pagina={pathname} />
      </div>
    </div>
  )
}
