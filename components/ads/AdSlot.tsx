'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { getAnuncioParaSlot, registrarEventoAd, type Anuncio } from '@/lib/queries'
import { useAuth } from '@/app/useAuth'

// formatos por slot (proporções do mockup)
const FORMATO: Record<string, string> = {
  hero: 'min-h-[90px]',
  lateral: 'min-h-[200px]',
  billboard: 'min-h-[120px]',
  leaderboard: 'min-h-[70px]',
  nativo: '',
}

// Slot de anúncio (house ads, Fase 9). Regras:
// - assinante Premium nunca vê anúncio
// - sem criativo cadastrado (ou migração 28 ausente) → não renderiza nada
// - impressão registrada 1× por montagem; clique registrado no href
export default function AdSlot({ slot, className = '' }: { slot: string; className?: string }) {
  const { isPremium } = useAuth()
  const pathname = usePathname()
  const [ad, setAd] = useState<Anuncio | null>(null)
  const impRegistrada = useRef(false)

  useEffect(() => {
    if (isPremium) { setAd(null); return }
    let vivo = true
    getAnuncioParaSlot(slot).then(a => { if (vivo) setAd(a) }).catch(() => {})
    return () => { vivo = false }
  }, [slot, isPremium])

  useEffect(() => {
    if (ad && !impRegistrada.current) { impRegistrada.current = true; registrarEventoAd(ad.id, 'imp', pathname) }
  }, [ad, pathname])

  if (isPremium || !ad) return null

  const conteudo = (
    <div className={`relative border border-border rounded-[var(--r)] bg-surface overflow-hidden ${FORMATO[slot] ?? ''} ${className}`}>
      <span className="absolute top-1.5 right-2 text-[0.6rem] uppercase tracking-wide text-faint bg-surface/80 rounded px-1 z-10">
        publicidade
      </span>
      {ad.imagem_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ad.imagem_url} alt={ad.titulo} className="w-full h-full object-cover" />
      ) : (
        <div className="p-4">
          <p className="text-sm font-medium">{ad.titulo}</p>
          {ad.texto && <p className="text-xs text-dim mt-1 leading-relaxed">{ad.texto}</p>}
          {ad.anunciante && <p className="text-[0.65rem] text-faint mt-2">{ad.anunciante}</p>}
        </div>
      )}
    </div>
  )

  return ad.link ? (
    <a href={ad.link} target="_blank" rel="noopener noreferrer sponsored"
      onClick={() => registrarEventoAd(ad.id, 'click', pathname)} className="block">
      {conteudo}
    </a>
  ) : conteudo
}
