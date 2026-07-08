'use client'

import Link from 'next/link'

// Overlay de conteúdo premium (mockup: blur + cadeado + CTA).
// Envolve qualquer bloco: <PremiumGate destravada={...}> <Conteudo/> </PremiumGate>
export default function PremiumGate({ destravada, titulo, descricao, children }: {
  destravada: boolean
  titulo?: string
  descricao?: string
  children: React.ReactNode
}) {
  if (destravada) return <>{children}</>
  return (
    <div className="relative">
      <div className="blur-[5px] select-none pointer-events-none" aria-hidden="true">{children}</div>
      <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-transparent via-surface/60 to-surface p-6">
        <div className="text-center max-w-xs">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mx-auto mb-2 text-dim" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
          <p className="font-bold tracking-tight">{titulo ?? 'Conteúdo Premium'}</p>
          {descricao && <p className="text-sm text-dim mt-1.5 leading-relaxed">{descricao}</p>}
          <Link href="/assinar"
            className="inline-flex items-center justify-center mt-4 rounded-[var(--r-sm)] px-4 py-2 text-sm font-medium bg-accent text-white hover:brightness-110 transition">
            Conhecer o Premium
          </Link>
        </div>
      </div>
    </div>
  )
}
