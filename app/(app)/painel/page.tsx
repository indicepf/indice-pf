'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/app/useAuth'
import { getMinhasContribuicoes, getRecompensa, comRetry } from '@/lib/queries'
import { brl, SAQUE_MINIMO } from '@/lib/format'
import { Card } from '@/components/ui'
import type { Contribuicao } from '@/lib/types'

export default function PainelPage() {
  const { user, profile, isPremium } = useAuth()
  const [contribs, setContribs] = useState<Contribuicao[] | null>(null)
  const [rec, setRec] = useState<{ aprovadas: number; ganho: number; disponivel: number } | null>(null)
  const [erro, setErro] = useState(false)

  const carregar = useCallback((uid: string) => {
    setErro(false)
    Promise.all([
      comRetry(() => getMinhasContribuicoes(uid)).then(setContribs),
      comRetry(() => getRecompensa(uid)).then(setRec),
    ]).catch(() => setErro(true))
  }, [])
  useEffect(() => { if (user) carregar(user.id) }, [user, carregar])

  const pendentes = contribs?.filter(c => c.status === 'pendente').length ?? 0
  const aprovadas = contribs?.filter(c => c.status === 'aprovada').length ?? 0

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <h2 className="text-2xl font-bold tracking-tight">
        {profile?.nome ? `Olá, ${profile.nome.split(' ')[0]}` : 'Olá'}
      </h2>
      <p className="text-dim text-sm mt-1">
        Envie fotos de preços de mercado — cada contribuição aprovada rende recompensa via PIX.
      </p>

      {erro && (
        <div className="mt-4 border border-danger/40 bg-danger-bg text-sm rounded-[var(--r-sm)] px-4 py-3 flex items-center justify-between gap-3">
          <span>Não foi possível carregar seus dados.</span>
          <button className="btn-mk sm" onClick={() => user && carregar(user.id)}>Tentar de novo</button>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-4 mt-6">
        <Card className="p-4">
          <p className="text-[0.7rem] uppercase tracking-[0.12em] text-dim">Envios</p>
          <p className="text-3xl font-bold tracking-tight tnum mt-1">{contribs ? contribs.length : '—'}</p>
          <p className="text-xs text-dim mt-1.5">{aprovadas} aprovada{aprovadas === 1 ? '' : 's'} · {pendentes} em análise</p>
        </Card>
        <Card className="p-4">
          <p className="text-[0.7rem] uppercase tracking-[0.12em] text-dim">Saldo disponível</p>
          <p className="text-3xl font-bold tracking-tight tnum mt-1">{rec ? brl(rec.disponivel) : '—'}</p>
          <p className="text-xs text-dim mt-1.5">{rec ? `${brl(rec.ganho)} acumulados · saque a partir de ${brl(SAQUE_MINIMO)}` : ''}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[0.7rem] uppercase tracking-[0.12em] text-dim">Plano</p>
          <p className="text-3xl font-bold tracking-tight mt-1">{isPremium ? 'Premium' : 'Gratuito'}</p>
          <p className="text-xs text-dim mt-1.5"><Link href="/plano" className="text-accent hover:underline">ver plano</Link></p>
        </Card>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mt-4">
        <Link href="/contribuir" className="block">
          <Card className="p-4 hover:bg-surface-2 transition-colors h-full">
            <p className="font-medium text-sm">Enviar preços</p>
            <p className="text-xs text-dim mt-1">Fotografe etiquetas no mercado — uma ou várias de uma vez.</p>
          </Card>
        </Link>
        <Link href="/meus-envios" className="block">
          <Card className="p-4 hover:bg-surface-2 transition-colors h-full">
            <p className="font-medium text-sm">Meus envios</p>
            <p className="text-xs text-dim mt-1">Acompanhe o status de cada contribuição.</p>
          </Card>
        </Link>
        <Link href="/configuracoes" className="block">
          <Card className="p-4 hover:bg-surface-2 transition-colors h-full">
            <p className="font-medium text-sm">Configurações</p>
            <p className="text-xs text-dim mt-1">Perfil, CPF e chave PIX para saques.</p>
          </Card>
        </Link>
      </div>
    </main>
  )
}
