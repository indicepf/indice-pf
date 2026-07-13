'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import RequireAdmin from '../../RequireAdmin'
import { useAuth } from '@/app/useAuth'
import { getContribuicoes, getSaques, getIngredientesManuais, isSuper } from '@/lib/queries'

// Painel administrativo: página própria (acima de Administração no menu) com
// a visão geral das áreas — cada score card abre /admin já na aba certa.
type CardInfo = { aba: string; titulo: string; desc: string; pend?: number; so_super?: boolean }

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

  const cards: CardInfo[] = [
    { aba: 'coleta', titulo: 'Coleta', desc: 'Última raspagem, itens não encontrados e preço manual inline.', so_super: true },
    { aba: 'dados', titulo: 'Alertas de preço', desc: 'Variações fortes entre coletas — revise e exclua entradas ruins.', so_super: true },
    { aba: 'precos', titulo: 'Preços manuais', desc: 'Leituras de preço da equipe por ingrediente (R$/kg).', pend: pend?.manuais },
    { aba: 'mod', titulo: 'Moderação', desc: 'Fotos de preço enviadas pelos usuários aguardando aprovação.', pend: pend?.mod },
    { aba: 'aprovadas', titulo: 'Aprovadas', desc: 'Esteira de contribuições já aprovadas — edição e exclusão.' },
    { aba: 'saques', titulo: 'Saques', desc: 'Fila de pagamento PIX das recompensas solicitadas.', pend: pend?.saques },
    { aba: 'anuncios', titulo: 'Anúncios', desc: 'Criativos e slots de publicidade do site.' },
    { aba: 'painel', titulo: 'Comunidade', desc: 'Contribuições, usuários, mapa e uso por ingrediente.' },
    { aba: 'auditoria', titulo: 'Auditoria', desc: 'Trilha de ações administrativas.' },
    { aba: 'super', titulo: 'Ações do super', desc: 'Operações sensíveis: exclusões e perfis.', so_super: true },
  ].filter(c => !c.so_super || souSuper)

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <h2 className="text-2xl font-bold tracking-tight">Painel administrativo</h2>
      <p className="text-sm text-dim mt-1">Visão geral das áreas — os números são as pendências de agora.</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-5">
        {cards.map(c => (
          <Link key={c.aba} href={`/admin?aba=${c.aba}`}
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
    </main>
  )
}
