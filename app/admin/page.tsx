'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isAdmin, getContribuicoes, getIngredientes, moderarContribuicao } from '@/lib/queries'
import { brl } from '@/lib/format'
import type { ContribuicaoFull, Ing } from '@/lib/types'

export default function AdminPage() {
  const router = useRouter()
  const [estado, setEstado] = useState<'carregando' | 'negado' | 'ok'>('carregando')
  const [itens, setItens] = useState<ContribuicaoFull[]>([])
  const [ings, setIngs] = useState<Ing[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user
      if (!u) { router.replace('/'); return }
      if (!(await isAdmin(u.id))) { setEstado('negado'); return }
      setIngs(await getIngredientes())
      setItens(await getContribuicoes('pendente'))
      setEstado('ok')
    })
  }, [router])

  async function moderar(c: ContribuicaoFull, status: 'aprovada' | 'rejeitada') {
    await moderarContribuicao(c.id, {
      status,
      preco: c.preco,
      ingrediente_id: c.ingrediente_id,
      peso_g: c.peso_g,
    })
    setItens(prev => prev.filter(i => i.id !== c.id))
  }

  function patch(id: number, campo: keyof ContribuicaoFull, valor: any) {
    setItens(prev => prev.map(i => i.id === id ? { ...i, [campo]: valor } : i))
  }

  if (estado === 'carregando') return <main className="min-h-screen grid place-items-center text-muted text-sm">Carregando…</main>
  if (estado === 'negado') {
    return (
      <main className="min-h-screen grid place-items-center text-center px-6">
        <div>
          <h1 className="font-[family-name:var(--font-serif)] text-2xl mb-2">Acesso restrito</h1>
          <p className="text-sm text-muted mb-4">Esta área é só para moderadores.</p>
          <button onClick={() => router.push('/')} className="text-sm text-paprika hover:underline">voltar ao índice</button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-line sticky top-0 bg-cream/90 backdrop-blur z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <button onClick={() => router.push('/')} className="text-sm text-muted hover:text-ink">← voltar</button>
          <h1 className="font-[family-name:var(--font-serif)] text-xl ml-1">Moderação</h1>
          <span className="text-xs text-muted ml-auto">{itens.length} pendente{itens.length !== 1 ? 's' : ''}</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {!itens.length && <p className="text-sm text-muted text-center py-10">Nenhuma contribuição pendente.</p>}
        {itens.map(c => (
          <div key={c.id} className="border border-line rounded-lg bg-panel overflow-hidden sm:flex">
            <a href={c.foto_url || undefined} target="_blank" rel="noopener noreferrer" className="sm:w-56 shrink-0 block">
              {c.foto_url
                ? <img src={c.foto_url} alt="" className="w-full h-48 sm:h-full object-cover" />
                : <div className="w-full h-48 bg-cream grid place-items-center text-muted text-xs">sem foto</div>}
            </a>
            <div className="p-4 flex-1">
              <p className="text-[0.7rem] text-muted mb-2">
                {c.tipo_loja || '—'}{c.mercado ? ` · ${c.mercado}` : ''}{c.cidade ? ` · ${c.cidade}` : ''}
                {c.lat ? ` · ${c.lat}, ${c.lng}` : ''} · {new Date(c.criado_em).toLocaleString('pt-BR')}
              </p>
              {c.produto && <p className="text-sm mb-2">“{c.produto}”</p>}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <label>Ingrediente
                  <select value={c.ingrediente_id ?? ''} onChange={e => patch(c.id, 'ingrediente_id', e.target.value ? Number(e.target.value) : null)}
                    className={inputCls}>
                    <option value="">—</option>
                    {ings.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                  </select>
                </label>
                <label>Preço (R$)
                  <input value={c.preco ?? ''} onChange={e => patch(c.id, 'preco', Number(e.target.value.replace(',', '.')) || 0)}
                    inputMode="decimal" className={inputCls} />
                </label>
                <label>Peso (g)
                  <input value={c.peso_g ?? ''} onChange={e => patch(c.id, 'peso_g', e.target.value ? Number(e.target.value) : null)}
                    inputMode="decimal" className={inputCls} />
                </label>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => moderar(c, 'aprovada')}
                  className="text-sm bg-olive text-white px-4 py-1.5 rounded-md hover:brightness-95 transition">Aprovar</button>
                <button onClick={() => moderar(c, 'rejeitada')}
                  className="text-sm border border-line text-muted px-4 py-1.5 rounded-md hover:bg-cream transition">Rejeitar</button>
                <span className="text-xs text-muted ml-auto self-center">vale {brl(0.01)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}

const inputCls = 'w-full bg-cream border border-line rounded-md px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-paprika mt-1'
