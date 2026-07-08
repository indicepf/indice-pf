import Link from 'next/link'
import Logo from '@/components/site/Logo'

// layout de auth do mockup: hero com gradiente à esquerda, formulário à direita
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="auth-hero">
        <Link href="/" className="inline-flex items-center gap-2 w-fit relative z-[1]">
          <Logo compact />
          <span className="leading-none">
            <span className="block text-lg font-bold tracking-tight text-white">Índice PF</span>
            <span className="block text-[0.6rem] uppercase tracking-[0.14em] text-white/70">by Infinity</span>
          </span>
        </Link>
        <div className="relative z-[1]">
          <h2>Crie sua conta e contribua com o índice.</h2>
          <p className="hero-sub">
            Grátis para acompanhar o custo do prato feito. Premium por R$ 99,99/mês para o
            detalhamento completo por produto.
          </p>
          <div className="hstats">
            <div><b>100</b><span>pratos monitorados</span></div>
            <div><b>5</b><span>regiões</span></div>
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
