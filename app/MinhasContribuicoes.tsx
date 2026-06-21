'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Item = {
  id: number; produto: string | null; preco: number; status: string
  foto_url: string | null; criado_em: string; ingredientes: { nome: string } | null
}

const STATUS: Record<string, { txt: string; cls: string }> = {
  pendente:  { txt: 'em análise', cls: 'text-muted border-line' },
  aprovada:  { txt: 'aprovada',   cls: 'text-olive border-olive/30 bg-olive/5' },
  rejeitada: { txt: 'rejeitada',  cls: 'text-red-600 border-red-200 bg-red-50' },
}

export default function MinhasContribuicoes({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [itens, setItens] = useState<Item[] | null>(null)

  useEffect(() => {
    supabase.from('contribuicoes')
      .select('id,produto,preco,status,foto_url,criado_em,ingredientes(nome)')
      .eq('user_id', userId).order('criado_em', { ascending: false })
      .then(({ data }) => setItens((data as unknown as Item[]) || []))
  }, [userId])

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-ink/30 px-4 py-6 overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-panel border border-line rounded-xl p-6 max-w-md w-full shadow-2xl relative my-auto">
        <button onClick={onClose} className="absolute top-3 right-4 text-muted hover:text-ink text-xl leading-none">×</button>
        <h3 className="font-[family-name:var(--font-serif)] text-xl mb-4">Minhas contribuições</h3>

        {!itens ? <p className="text-sm text-muted">Carregando…</p>
          : !itens.length ? <p className="text-sm text-muted">Você ainda não enviou nenhuma contribuição.</p>
          : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {itens.map(i => {
                const s = STATUS[i.status] || STATUS.pendente
                return (
                  <div key={i.id} className="flex items-center gap-3 border border-line rounded-md p-2">
                    {i.foto_url
                      ? <img src={i.foto_url} alt="" className="w-12 h-12 rounded object-cover shrink-0" />
                      : <div className="w-12 h-12 rounded bg-cream shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{i.ingredientes?.nome || i.produto || 'Produto'}</p>
                      <p className="text-xs text-muted">
                        R$ {Number(i.preco).toFixed(2)} · {new Date(i.criado_em).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <span className={`text-[0.65rem] uppercase tracking-wide border rounded px-1.5 py-0.5 shrink-0 ${s.cls}`}>
                      {s.txt}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
      </div>
    </div>
  )
}
