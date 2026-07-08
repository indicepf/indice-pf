'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase, limparSessaoLocal, usuarioDoStorage } from '@/lib/supabase'
import { useAuth } from '../useAuth'
import Logo from '@/components/site/Logo'
import { Badge } from '@/components/ui'

const TITULOS: Record<string, string> = {
  '/painel': 'Meu painel',
  '/contribuir': 'Enviar preços',
  '/meus-envios': 'Meus envios',
  '/configuracoes': 'Configurações',
  '/plano': 'Plano & assinatura',
  '/evolucao': 'Histórico',
  '/contribuidores': 'Ranking',
  '/admin': 'Administração',
}

// menu por papel (item 3 do feedback): contribuição / assinatura / conta / administração
const SECOES: { titulo: string; itens: readonly (readonly [string, string])[]; admin?: boolean }[] = [
  { titulo: 'Contribuição', itens: [['/painel', 'Meu painel'], ['/contribuir', 'Enviar preços'], ['/meus-envios', 'Meus envios']] },
  { titulo: 'Assinatura', itens: [['/plano', 'Plano & assinatura']] },
  { titulo: 'Conta', itens: [['/configuracoes', 'Configurações']] },
  { titulo: 'Administração', admin: true, itens: [['/admin', 'Administração'], ['/evolucao', 'Histórico'], ['/contribuidores', 'Ranking']] },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { profile, isPremium } = useAuth()
  const [logado, setLogado] = useState<boolean | null>(null)

  // gate de sessão do shell: storage síncrono primeiro (sem lock), auth real depois
  useEffect(() => {
    const u = usuarioDoStorage()
    if (u) setLogado(true)
    let resolvido = !!u
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      resolvido = true
      setLogado(!!session?.user)
    })
    const t = setTimeout(() => { if (!resolvido) { limparSessaoLocal(); setLogado(false) } }, 4000)
    return () => { subscription.unsubscribe(); clearTimeout(t) }
  }, [])
  useEffect(() => {
    if (logado === false) router.replace(`/entrar?next=${encodeURIComponent(pathname)}`)
  }, [logado, router, pathname])

  if (logado === null) {
    return <main className="min-h-screen grid place-items-center text-dim text-sm">Carregando…</main>
  }
  if (!logado) return null

  const secoes = SECOES.filter(s => !s.admin || profile?.is_admin)
  const links = secoes.flatMap(s => s.itens)
  const titulo = TITULOS[pathname] ?? ''

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[220px_1fr]">
      {/* sidebar (desktop) */}
      <aside className="hidden lg:flex flex-col border-r border-border bg-surface min-h-screen sticky top-0 max-h-screen">
        <Link href="/" className="px-5 py-4 border-b border-border"><Logo /></Link>
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {secoes.map(s => (
            <div key={s.titulo} className="mb-4">
              <p className="px-3 mb-1 text-[0.62rem] uppercase tracking-[0.08em] text-faint font-bold">{s.titulo}</p>
              <div className="seg">
                {s.itens.map(([href, label]) => (
                  <Link key={href} href={href} className={pathname === href ? 'on' : ''}>
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <div className="mb-4">
            <p className="px-3 mb-1 text-[0.62rem] uppercase tracking-[0.08em] text-faint font-bold">Site</p>
            <div className="seg"><Link href="/">← Voltar ao índice</Link></div>
          </div>
        </nav>
        <div className="px-5 py-4 border-t border-border">
          <button onClick={async () => { await supabase.auth.signOut(); router.push('/') }}
            className="text-sm text-dim hover:text-ink cursor-pointer">Sair</button>
        </div>
      </aside>

      <div className="min-w-0">
        {/* topbar */}
        <header className="border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-20">
          <div className="px-5 py-3 flex items-center gap-3">
            <Link href="/" className="lg:hidden"><Logo compact /></Link>
            <h1 className="font-bold tracking-tight truncate">{titulo}</h1>
            <div className="ml-auto flex items-center gap-2.5">
              <Badge tone={isPremium ? 'ok' : 'neutral'}>{isPremium ? 'Premium' : 'Gratuito'}</Badge>
              <span className="text-sm text-dim max-sm:hidden">{profile?.nome?.split(' ')[0] ?? ''}</span>
            </div>
          </div>
          {/* nav mobile */}
          <nav className="lg:hidden px-5 pb-2.5 flex items-center gap-3 overflow-x-auto">
            {links.map(([href, label]) => (
              <Link key={href} href={href}
                className={`text-sm whitespace-nowrap ${pathname === href ? 'text-accent font-medium' : 'text-dim'}`}>
                {label}
              </Link>
            ))}
          </nav>
        </header>

        {children}
      </div>
    </div>
  )
}
