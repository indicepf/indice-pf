'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Logo, { INF_PATH } from '@/components/site/Logo'

// layout de auth do mockup: hero com gradiente à esquerda, formulário à direita.
// O copy do hero muda por rota, como no mockup (login vs signup).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const login = usePathname() === '/entrar'

  return (
    <div className="auth-wrap">
      <div className="auth-hero">
        <Link href="/" className="brand-mark relative z-[1] w-fit">
          <span className="inf-logo" style={{ background: 'rgba(255,255,255,.16)', boxShadow: 'none' }}>
            <svg viewBox="0 0 100 50" aria-hidden="true"><path fill="#fff" d={INF_PATH} /></svg>
          </span>
          <span className="brand-name" style={{ color: '#fff' }}>
            Índice PF<small style={{ color: 'rgba(255,255,255,.7)' }}>by Infinity</small>
          </span>
        </Link>
        <div className="inf-bg" aria-hidden="true">
          <svg viewBox="0 0 100 50" style={{ width: '100%', height: '100%' }}><path fill="#fff" d={INF_PATH} /></svg>
        </div>
        <div className="relative z-[1]">
          {login ? (
            <>
              <h2>Bem-vindo de volta ao Índice PF.</h2>
              <p className="hero-sub">
                Envie fotos de preços, acompanhe seus dados e desbloqueie o índice completo por produto.
              </p>
            </>
          ) : (
            <>
              <h2>Crie sua conta e contribua com o índice.</h2>
              <p className="hero-sub">
                Grátis para acompanhar o custo do prato feito. Premium por R$ 99,99/mês para o
                detalhamento completo por produto.
              </p>
            </>
          )}
          <div className="hstats">
            <div><b>100</b><span>pratos monitorados</span></div>
            <div><b>±5%</b><span>margem de erro</span></div>
            <div><b>PIX</b><span>recompensa por foto</span></div>
          </div>
        </div>
        <span className="text-[13px] text-white/70 relative z-[1]">© 2026 Infinity Inc</span>
      </div>

      <div className="auth-panel">
        <div className="auth-card">
          <div className="mb-6 lg:hidden"><Link href="/"><Logo /></Link></div>
          {children}
        </div>
      </div>
    </div>
  )
}
