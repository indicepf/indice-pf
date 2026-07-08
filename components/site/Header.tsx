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
    <header className="site-header">
      <div className="inner">
        <Link href="/" aria-label="Índice PF — início"><Logo /></Link>
        <nav className="site-nav">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className={pathname === href ? 'active' : ''}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="header-right">
          {isAdmin && <a href="/evolucao" className="text-sm text-dim hover:text-ink max-lg:hidden">Histórico</a>}
          {isAdmin && <a href="/contribuidores" className="text-sm text-dim hover:text-ink max-lg:hidden">Ranking</a>}
          <AuthControls />
        </div>
      </div>
      {/* nav mobile: linha própria abaixo do logo (o site-nav some abaixo de 1024px) */}
      <nav className="hidden max-lg:flex px-6 pb-2.5 items-center gap-4 overflow-x-auto">
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
