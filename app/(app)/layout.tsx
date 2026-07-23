'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase, limparSessaoLocal, usuarioDoStorage } from '@/lib/supabase'
import { useAuth } from '../useAuth'
import Logo, { INF_PATH } from '@/components/site/Logo'

const TITULOS: Record<string, string> = {
  '/painel': 'Meu painel',
  '/calculadora': 'Calculadora de PF',
  '/meus-pratos': 'Meus pratos',
  '/contribuir': 'Enviar preços',
  '/meus-envios': 'Meus envios',
  '/indice': 'Índice',
  '/configuracoes': 'Configurações',
  '/plano': 'Plano & assinatura',
  '/evolucao': 'Histórico',
  '/contribuidores': 'Ranking',
  '/painel-administrativo': 'Painel administrativo',
  '/admin': 'Administração',
}

// ícones dos nav-items (mockup usa emoji; decisão de 08/07: SVG equivalente)
const ico = (d: string) => (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)
const ICONES: Record<string, React.ReactNode> = {
  '/painel': ico('M4 20V10m6 10V4m6 16v-7m4 7H2'),
  '/calculadora': ico('M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm1 4h8M9 12h.01M12 12h.01M15 12h.01M9 15h.01M12 15h.01M15 15h.01M9 18h.01M12 18h.01M15 18h.01'),
  '/meus-pratos': ico('M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm0-3a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM2 12h2m16 0h2'),
  '/contribuir': ico('M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zm8 8.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z'),
  '/meus-envios': ico('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z'),
  '/indice': ico('M3 17l6-6 4 4 8-8m0 0h-5m5 0v5'),
  '/plano': ico('M12 3l2.7 5.6 6.3.9-4.5 4.3 1 6.2-5.5-3-5.5 3 1-6.2L3 9.5l6.3-.9L12 3z'),
  '/configuracoes': ico('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a7.4 7.4 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.4 7.4 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5a7.4 7.4 0 0 0 0 2.4l-2 1.5 2 3.5 2.4-1a7.4 7.4 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.4 7.4 0 0 0 2-1.2l2.4 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2z'),
  '/admin': ico('M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z'),
  '/painel-administrativo': ico('M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z'),
  '/evolucao': ico('M3 17l6-6 4 4 8-8m0 0h-5m5 0v5'),
  '/contribuidores': ico('M8 21h8m-4-4v4m-6-17h12v4a6 6 0 0 1-12 0V4zm-3 2h3m12 0h3v2a3 3 0 0 1-3 3m-15-5v2a3 3 0 0 0 3 3'),
  '/': ico('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm-9-9h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z'),
}

// menu por papel: área do usuário / assinatura / administração; Configurações
// vive no rodapé, junto do cartão do usuário (pedido de 09/07)
const SECOES: { titulo: string; itens: readonly (readonly [string, string])[]; admin?: boolean }[] = [
  { titulo: 'Minha área', itens: [['/painel', 'Meu painel'], ['/calculadora', 'Calculadora de PF'], ['/meus-pratos', 'Meus pratos'], ['/contribuir', 'Enviar preços'], ['/meus-envios', 'Meus envios'], ['/indice', 'Índice']] },
  { titulo: 'Assinatura', itens: [['/plano', 'Plano & assinatura']] },
  { titulo: 'Administração', admin: true, itens: [['/painel-administrativo', 'Painel administrativo'], ['/admin', 'Administração'], ['/evolucao', 'Histórico'], ['/contribuidores', 'Ranking']] },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, profile, isPremium } = useAuth()
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
  // nav mobile: dois blocos (usuário × admin) — decisão de 13/07
  const gruposMobile = [
    { titulo: 'Minha área', itens: secoes.filter(s => !s.admin).flatMap(s => s.itens), admin: false },
    ...(profile?.is_admin ? [{ titulo: 'Administração', itens: secoes.find(s => s.admin)?.itens ?? [], admin: true }] : []),
  ]
  const titulo = TITULOS[pathname] ?? ''
  const inicial = ((profile?.nome || user?.email || '?').trim().charAt(0) || '?').toUpperCase()

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      {/* sidebar do mockup (desktop) */}
      <aside className="sidebar max-lg:hidden">
        <Link href="/painel" className="brand-mark">
          <span className="inf-logo">
            <svg viewBox="0 0 100 50" aria-hidden="true"><path fill="#fff" d={INF_PATH} /></svg>
          </span>
          <span className="brand-name">Índice PF<small>painel</small></span>
        </Link>
        {secoes.map(s => (
          <div key={s.titulo}>
            <div className="nav-section">{s.titulo}</div>
            {s.itens.map(([href, label]) => (
              <Link key={href} href={href} className={`nav-item ${pathname === href ? 'active' : ''}`}>
                {ICONES[href]}{label}
              </Link>
            ))}
          </div>
        ))}
        <div className="nav-section">Site</div>
        <Link href="/" className="nav-item">{ICONES['/']}Ver site público</Link>
        <div className="nav-spacer" />
        <Link href="/configuracoes" className={`nav-item ${pathname === '/configuracoes' ? 'active' : ''}`}>
          {ICONES['/configuracoes']}Configurações
        </Link>
        <Link href="/configuracoes" className="nav-user">
          <span className="avatar">{inicial}</span>
          <span className="who">
            {profile?.nome ? profile.nome.split(' ')[0] : 'Conta'}
            <small>{user?.email ?? ''}</small>
          </span>
        </Link>
        <button className="btn-mk ghost sm" style={{ marginTop: 10, justifyContent: 'center' }}
          onClick={async () => { await supabase.auth.signOut(); router.push('/') }}>
          Sair
        </button>
      </aside>

      <div className="min-w-0">
        {/* topbar do mockup: crumbs + plano + CTA */}
        <header className="app-topbar">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="lg:hidden"><Logo compact /></Link>
            <div className="crumbs max-lg:hidden">
              <Link href="/painel">Painel</Link>
              <span className="sep">›</span>
              <span className="current">{titulo}</span>
            </div>
            <h1 className="lg:hidden font-bold tracking-tight truncate">{titulo}</h1>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="premium-tag" style={isPremium ? undefined : { background: 'var(--surface-3)', color: 'var(--dim)' }}>
              {isPremium ? 'Premium' : 'Gratuito'}
            </span>
            <Link href="/contribuir" className="btn-mk sm max-sm:hidden">Enviar preço</Link>
          </div>
        </header>
        {/* nav mobile: chips agrupados por seção — usuário e admin separados
            (admin em roxo); "Ver site" e "Configurações" fecham o menu, como
            na sidebar desktop. Rótulos curtos para caber mais por linha */}
        <nav className="lg:hidden px-4 py-2.5 border-b border-border bg-surface space-y-2">
          {gruposMobile.map(g => (
            <div key={g.titulo}>
              <p className="text-[10px] uppercase tracking-[0.08em] font-bold text-faint mb-1">{g.titulo}</p>
              <div className="flex flex-wrap gap-1.5">
                {g.itens.map(([href, label]) => (
                  <Link key={href} href={href}
                    className={`text-[13px] whitespace-nowrap px-2.5 py-1 rounded-full border transition ${
                      pathname === href
                        ? g.admin
                          ? 'text-brand-roxo font-medium border-brand-roxo/40 bg-brand-roxo/10'
                          : 'text-accent font-medium border-accent/40 bg-accent/10'
                        : g.admin
                          ? 'text-dim border-border hover:text-brand-roxo'
                          : 'text-dim border-transparent hover:text-ink'}`}>
                    {label.replace('Plano & assinatura', 'Plano').replace('Calculadora de PF', 'Calculadora').replace('Painel administrativo', 'Painel admin')}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-2">
            <Link href="/"
              className="flex items-center gap-1.5 text-[13px] whitespace-nowrap px-2.5 py-1 rounded-full border border-border-2 text-ink-2 hover:text-ink transition [&_.ico]:w-3.5 [&_.ico]:h-3.5">
              {ICONES['/']}Ver site público
            </Link>
            <Link href="/configuracoes"
              className={`flex items-center gap-1.5 text-[13px] whitespace-nowrap px-2.5 py-1 rounded-full border transition [&_.ico]:w-3.5 [&_.ico]:h-3.5 ${
                pathname === '/configuracoes'
                  ? 'text-accent font-medium border-accent/40 bg-accent/10'
                  : 'border-border-2 text-ink-2 hover:text-ink'}`}>
              {ICONES['/configuracoes']}Configurações
            </Link>
          </div>
        </nav>

        {children}
      </div>
    </div>
  )
}
