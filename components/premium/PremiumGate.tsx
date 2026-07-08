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
          <p className="text-2xl mb-2" aria-hidden="true">🔒</p>
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
