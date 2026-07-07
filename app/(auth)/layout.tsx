import Link from 'next/link'
import Logo from '@/components/site/Logo'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      {/* painel de marca (desktop) */}
      <div className="hidden lg:flex flex-col justify-between p-10 text-white"
        style={{ background: 'var(--grad-marca)' }}>
        <Link href="/" className="inline-flex items-center gap-2 w-fit">
          <Logo compact />
          <span className="leading-none">
            <span className="block text-lg font-bold tracking-tight">Índice PF</span>
            <span className="block text-[0.6rem] uppercase tracking-[0.14em] opacity-80">by Infinity</span>
          </span>
        </Link>
        <div className="max-w-sm">
          <h2 className="text-3xl font-bold tracking-tight leading-tight">
            O custo do prato feito brasileiro, medido com dados reais.
          </h2>
          <p className="mt-4 text-sm opacity-85 leading-relaxed">
            100 pratos regionais · 5 regiões · coletas quinzenais no varejo e em campo.
            Contribuições aprovadas rendem recompensa via PIX.
          </p>
        </div>
        <span className="text-xs opacity-70">© 2026 Infinity Inc</span>
      </div>

      {/* área do formulário */}
      <div className="flex flex-col">
        <div className="p-6 lg:hidden">
          <Link href="/"><Logo /></Link>
        </div>
        <div className="flex-1 grid place-items-center px-6 py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
    </main>
  )
}
