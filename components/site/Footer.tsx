import Link from 'next/link'
import Logo from './Logo'

export default function Footer() {
  return (
    <footer className="border-t border-border mt-16 bg-surface">
      <div className="max-w-5xl mx-auto px-6 py-10 grid gap-8 sm:grid-cols-3">
        <div>
          <Logo />
          <p className="text-xs text-dim mt-3 leading-relaxed max-w-[26ch]">
            O custo de produção do prato feito brasileiro, medido a cada coleta em 100 pratos regionais.
          </p>
        </div>
        <div className="text-sm">
          <p className="text-xs uppercase tracking-wide text-faint mb-3">Produto</p>
          <ul className="space-y-2">
            <li><Link href="/" className="text-dim hover:text-ink">Índice</Link></li>
            <li><Link href="/metodologia" className="text-dim hover:text-ink">Metodologia</Link></li>
            <li><Link href="/planos" className="text-dim hover:text-ink">Planos</Link></li>
            <li><a href="/contribuir" className="text-dim hover:text-ink">Contribuir com preços</a></li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="text-xs uppercase tracking-wide text-faint mb-3">Infinity</p>
          <ul className="space-y-2 text-dim">
            <li><Link href="/sobre" className="hover:text-ink">Sobre o Índice PF</Link></li>
            <li>Rede Food Service</li>
            <li>Seasoning</li>
            <li>Ponto Food</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="max-w-5xl mx-auto px-6 py-4 text-xs text-faint flex flex-wrap justify-between gap-2">
          <span>© 2026 Infinity Inc</span>
          <span>Dados coletados no varejo online e em campo · estimativas em calibração</span>
        </div>
      </div>
    </footer>
  )
}
