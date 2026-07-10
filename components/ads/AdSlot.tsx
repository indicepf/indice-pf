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

// só aceita URLs https no href/src do criativo — bloqueia javascript:/data: etc.
// (defesa contra XSS armazenado caso uma conta admin seja comprometida)
const urlSegura = (u: string | null | undefined) => (u && /^https:\/\//i.test(u) ? u : undefined)

// criativo em si (compartilhado com AdGate/AdPopup)
export function AdCreative({ ad, pagina, formato = '' }: { ad: Anuncio; pagina: string; formato?: string }) {
  const imagem = urlSegura(ad.imagem_url)
  const link = urlSegura(ad.link)
  const conteudo = (
    <div className={`ad-slot bg-surface ${formato}`}>
      <span className="ad-label">Publicidade</span>
      {imagem ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imagem} alt={ad.titulo} className="w-full h-auto object-contain" />
      ) : (
        <div className="p-4">
          <p className="text-sm font-medium">{ad.titulo}</p>
          {ad.texto && <p className="text-xs text-dim mt-1 leading-relaxed">{ad.texto}</p>}
          {ad.anunciante && <p className="text-[0.65rem] text-faint mt-2">{ad.anunciante}</p>}
        </div>
      )}
    </div>
  )
  return link ? (
    <a href={link} target="_blank" rel="noopener noreferrer sponsored"
      onClick={() => registrarEventoAd(ad.id, 'click', pagina)} className="block">
      {conteudo}
    </a>
  ) : conteudo
}

// hook comum: busca o criativo do slot (premium nunca vê) e registra a impressão
export function useAnuncio(slot: string) {
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

  return { ad: isPremium ? null : ad, pathname }
}

// Slot de bloco (hero/lateral/billboard/leaderboard/nativo). Regras:
// - assinante Premium nunca vê anúncio
// - sem criativo cadastrado (ou migração 28 ausente) → não renderiza nada
// - `escala` do criativo controla a largura relativa (centralizado)
export default function AdSlot({ slot, className = '' }: { slot: string; className?: string }) {
  const { ad, pathname } = useAnuncio(slot)
  if (!ad) return null
  return (
    <div className={className} style={ad.escala < 1 ? { width: `${ad.escala * 100}%`, marginInline: 'auto' } : undefined}>
      <AdCreative ad={ad} pagina={pathname} formato={FORMATO[slot] ?? ''} />
    </div>
  )
}
