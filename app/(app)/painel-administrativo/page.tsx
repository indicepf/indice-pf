'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import RequireAdmin from '../../RequireAdmin'
import { useAuth } from '@/app/useAuth'
import { getContribuicoes, getSaques, getIngredientesManuais, isSuper } from '@/lib/queries'

// Painel administrativo: página própria (acima de Administração no menu) com
// a visão geral das áreas em grupos (aprovados em 13/07) — cada score card
// abre /admin na aba certa, ou a página correspondente (Histórico, Ranking).
type CardInfo = { href: string; titulo: string; desc: string; pend?: number; so_super?: boolean }

export default function PainelAdministrativoPage() {
  return <RequireAdmin><Inner /></RequireAdmin>
}

function Inner() {
  const { user } = useAuth()
  const [souSuper, setSouSuper] = useState(false)
  const [pend, setPend] = useState<{ mod: number; saques: number; manuais: number } | null>(null)

  useEffect(() => {
    if (!user) return
    isSuper(user.id).then(setSouSuper)
    Promise.all([getContribuicoes('pendente'), getSaques('solicitado'), getIngredientesManuais()])
      .then(([m, s, pm]) => setPend({ mod: m.length, saques: s.length, manuais: pm.length }))
      .catch(() => setPend({ mod: 0, saques: 0, manuais: 0 }))
  }, [user])

  const grupos: [string, CardInfo[]][] = [
    ['Operação do índice', [
      { href: '/admin?aba=coleta', titulo: 'Coleta', desc: 'Última raspagem, itens não encontrados e preço manual inline.', so_super: true },
      { href: '/admin?aba=dados', titulo: 'Alertas de preço', desc: 'Variações fortes entre coletas — revise e exclua entradas ruins.', so_super: true },
      { href: '/admin?aba=precos', titulo: 'Preços manuais', desc: 'Leituras de preço da equipe por ingrediente (R$/kg).', pend: pend?.manuais },
    ]],
    ['Comunidade', [
      { href: '/admin?aba=mod', titulo: 'Moderação', desc: 'Fotos de preço enviadas pelos usuários aguardando aprovação.', pend: pend?.mod },
      { href: '/admin?aba=aprovadas', titulo: 'Aprovadas', desc: 'Esteira de contribuições já aprovadas — edição e exclusão.' },
      { href: '/admin?aba=saques', titulo: 'Saques', desc: 'Fila de pagamento PIX das recompensas solicitadas.', pend: pend?.saques },
      { href: '/admin?aba=painel', titulo: 'Comunidade', desc: 'Contribuições, usuários, mapa e uso por ingrediente.' },
    ]],
    ['Análise', [
      { href: '/evolucao', titulo: 'Histórico', desc: 'Séries do índice, variação por prato, ingredientes, mapa e calibração.' },
      { href: '/contribuidores', titulo: 'Ranking', desc: 'Ranking dos contribuidores de preços de campo.' },
    ]],
    ['Negócio e sistema', [
      { href: '/admin?aba=anuncios', titulo: 'Anúncios', desc: 'Criativos e slots de publicidade do site.' },
      { href: '/admin?aba=auditoria', titulo: 'Auditoria', desc: 'Trilha de ações administrativas.' },
      { href: '/admin?aba=super', titulo: 'Ações do super', desc: 'Operações sensíveis: exclusões e perfis.', so_super: true },
    ]],
  ]

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <h2 className="text-2xl font-bold tracking-tight">Painel administrativo</h2>
      <p className="text-sm text-dim mt-1">Visão geral das áreas — os números são as pendências de agora.</p>
      {grupos.map(([grupo, cards]) => {
        const vis = cards.filter(c => !c.so_super || souSuper)
        if (!vis.length) return null
        return (
          <div key={grupo} className="mt-6">
            <p className="text-[0.7rem] uppercase tracking-[0.12em] text-dim font-bold mb-2">{grupo}</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {vis.map(c => (
                <Link key={c.href} href={c.href}
                  className="text-left border border-border rounded-[var(--r)] bg-surface p-4 hover:border-accent/60 hover:bg-surface-2 transition block">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm">{c.titulo}</span>
                    {c.pend != null && (
                      <span className={`tnum text-xs font-bold rounded-full px-2 py-0.5 ${c.pend > 0 ? 'bg-accent/10 text-accent' : 'bg-surface-3 text-dim'}`}>{c.pend}</span>
                    )}
                  </span>
                  <span className="text-xs text-dim mt-1 block leading-relaxed">{c.desc}</span>
                </Link>
              ))}
            </div>
          </div>
        )
      })}
    </main>
  )
}
