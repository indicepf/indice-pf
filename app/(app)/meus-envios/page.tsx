'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { supabase, usuarioDoStorage } from '@/lib/supabase'
import { getMinhasContribuicoes, excluirContribuicao, comRetry } from '@/lib/queries'
import type { Contribuicao } from '@/lib/types'
import { Badge, type BadgeTone } from '@/components/ui'
import { chip } from '../../BotaoInicio'

const MapaLocal = dynamic(() => import('../../MapaLocal'), {
  ssr: false,
  loading: () => <div className="h-[280px] rounded-lg border border-border grid place-items-center text-dim text-sm">carregando mapa…</div>,
})

const STATUS: Record<string, { txt: string; tone: BadgeTone }> = {
  pendente:  { txt: 'em análise', tone: 'neutral' },
  aprovada:  { txt: 'aprovada',   tone: 'ok' },
  rejeitada: { txt: 'rejeitada',  tone: 'danger' },
}

export default function MeusEnviosPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [contribs, setContribs] = useState<Contribuicao[] | null>(null)
  const [visiveis, setVisiveis] = useState(10)

  useEffect(() => {
    const u = usuarioDoStorage()
    if (u) { setUserId(u.id); return }
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null))
  }, [])
  useEffect(() => {
    if (userId) comRetry(() => getMinhasContribuicoes(userId)).then(setContribs).catch(() => setContribs([]))
  }, [userId])

  async function deletar(id: number) {
    if (!confirm('Excluir esta contribuição?')) return
    await excluirContribuicao(id)
    setContribs(prev => prev ? prev.filter(c => c.id !== id) : prev)
  }

  return (
    <main className="max-w-lg mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-dim">Suas fotos de preço enviadas e o status de cada uma.</p>
        <button onClick={() => router.push('/contribuir')}
          className="text-sm border border-accent text-accent px-3 py-1.5 rounded-[var(--r-sm)] hover:bg-accent hover:text-white transition cursor-pointer shrink-0">
          Enviar preços
        </button>
      </div>

      {(() => {
        const pontos = (contribs || []).filter(c => c.lat != null && c.lng != null)
          .map(c => ({ lat: c.lat as number, lng: c.lng as number,
            label: `${c.ingredientes?.nome || c.produto || 'Produto'}${c.preco != null ? ` — R$ ${Number(c.preco).toFixed(2)}` : ''}${c.cidade ? ` · ${c.cidade}` : ''}` }))
        return pontos.length ? <div className="mb-4"><MapaLocal points={pontos} height="280px" /></div> : null
      })()}

      {!contribs ? <p className="text-sm text-dim">Carregando…</p>
        : !contribs.length ? <p className="text-sm text-dim">Você ainda não enviou nenhuma contribuição.</p>
        : (
          <div className="space-y-2">
            {contribs.slice(0, visiveis).map(i => {
              const s = STATUS[i.status] || STATUS.pendente
              return (
                <div key={i.id} className="flex items-center gap-3 border border-border rounded-[var(--r-sm)] p-2 bg-surface">
                  {i.foto_url
                    ? <img src={i.foto_url} alt="" className="w-12 h-12 rounded object-cover shrink-0" />
                    : <div className="w-12 h-12 rounded bg-surface-3 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{i.ingredientes?.nome || i.produto || 'Produto'}</p>
                    <p className="text-xs text-dim truncate">
                      {i.preco != null ? `R$ ${Number(i.preco).toFixed(2)} · ` : ''}{new Date(i.criado_em).toLocaleDateString('pt-BR')}{i.cidade ? ` · ${i.cidade}` : ''}
                    </p>
                  </div>
                  <Badge tone={s.tone} className="shrink-0">{s.txt}</Badge>
                  {i.status === 'pendente' && (
                    <button onClick={() => deletar(i.id)}
                      className="text-xs text-dim hover:text-danger shrink-0 cursor-pointer">excluir</button>
                  )}
                </div>
              )
            })}
            {contribs.length > visiveis && (
              <button onClick={() => setVisiveis(v => v + 10)}
                className={`${chip} w-full justify-center py-2 mt-1`}>
                Ver mais ({contribs.length - visiveis} restantes)
              </button>
            )}
          </div>
        )}
    </main>
  )
}
