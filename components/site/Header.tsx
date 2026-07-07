'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import AuthControls from '@/app/Auth'
import { useAuth } from '@/app/useAuth'
import Logo from './Logo'

const NAV = [
  ['/', 'Índice'],
  ['/metodologia', 'Metodologia'],
  ['/planos', 'Planos'],
  ['/sobre', 'Sobre'],
] as const

export default function Header() {
  const pathname = usePathname()
  const { profile } = useAuth()
  const isAdmin = !!profile?.is_admin

  return (
    <header className="border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-20">
      <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-5">
        <Link href="/" aria-label="Índice PF — início"><Logo /></Link>
        <nav className="flex items-center gap-4 ml-2 max-sm:hidden">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href}
              className={`text-sm transition-colors ${pathname === href ? 'text-ink font-medium' : 'text-dim hover:text-ink'}`}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 ml-auto">
          {isAdmin && <a href="/evolucao" className="text-sm text-dim hover:text-ink max-sm:hidden">Histórico</a>}
          {isAdmin && <a href="/contribuidores" className="text-sm text-dim hover:text-ink max-sm:hidden">Ranking</a>}
          <AuthControls />
        </div>
      </div>
      {/* nav mobile: linha própria abaixo do logo */}
      <nav className="sm:hidden px-6 pb-2.5 flex items-center gap-4 overflow-x-auto">
        {NAV.map(([href, label]) => (
          <Link key={href} href={href}
            className={`text-sm whitespace-nowrap ${pathname === href ? 'text-ink font-medium' : 'text-dim'}`}>
            {label}
          </Link>
        ))}
      </nav>
    </header>
  )
}
