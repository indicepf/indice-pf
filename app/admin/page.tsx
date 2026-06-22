'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isAdmin, getContribuicoes, getIngredientes, moderarContribuicao, getSaques, marcarSaquePago } from '@/lib/queries'
import { brl, mascararCpf, VALOR_POR_FOTO } from '@/lib/format'
import type { ContribuicaoFull, Ing } from '@/lib/types'

type Saque = { id: number; user_id: string; valor: number; cpf: string | null; chave_pix: string | null; status: string; criado_em: string }

export default function AdminPage() {
  const router = useRouter()
  const [estado, setEstado] = useState<'carregando' | 'negado' | 'ok'>('carregando')
  const [aba, setAba] = useState<'mod' | 'saques'>('mod')
  const [itens, setItens] = useState<ContribuicaoFull[]>([])
  const [ings, setIngs] = useState<Ing[]>([])
  const [saques, setSaques] = useState<Saque[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user
      if (!u) { router.replace('/'); return }
      if (!(await isAdmin(u.id))) { setEstado('negado'); return }
      setIngs(await getIngredientes())
      setItens(await getContribuicoes('pendente'))
      setSaques(await getSaques('solicitado'))
      setEstado('ok')
    })
  }, [router])

  async function pagar(s: Saque) {
    if (!confirm(`Confirmar pagamento de ${brl(Number(s.valor))} via PIX (${s.chave_pix})?`)) return
    await marcarSaquePago(s.id)
    setSaques(prev => prev.filter(x => x.id !== s.id))
  }

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
        <div className="max-w-3xl mx-auto px-6 pt-4 flex items-center gap-3">
          <button onClick={() => router.push('/')} className="text-sm text-muted hover:text-ink">← voltar</button>
          <h1 className="font-[family-name:var(--font-serif)] text-xl ml-1">Administração</h1>
        </div>
        <div className="max-w-3xl mx-auto px-6 flex gap-5 mt-3">
          {([['mod', `Moderação (${itens.length})`], ['saques', `Saques (${saques.length})`]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`text-sm pb-2 border-b-2 -mb-px transition ${aba === k ? 'border-paprika text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>
      </header>

      {aba === 'mod' ? (
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
                <span className="text-xs text-muted ml-auto self-center">vale {brl(VALOR_POR_FOTO)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      ) : (
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-3">
        {!saques.length && <p className="text-sm text-muted text-center py-10">Nenhuma solicitação de saque.</p>}
        {saques.map(s => (
          <div key={s.id} className="border border-line rounded-lg bg-panel p-4 flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-[family-name:var(--font-serif)] text-xl tnum">{brl(Number(s.valor))}</p>
              <p className="text-xs text-muted mt-0.5 truncate">
                PIX: {s.chave_pix || '—'} · CPF: {s.cpf ? mascararCpf(s.cpf) : '—'}
              </p>
              <p className="text-[0.7rem] text-muted mt-0.5">
                solicitado em {new Date(s.criado_em).toLocaleString('pt-BR')}
              </p>
            </div>
            <button onClick={() => pagar(s)}
              className="text-sm bg-olive text-white px-4 py-1.5 rounded-md hover:brightness-95 transition shrink-0">
              Marcar como pago
            </button>
          </div>
        ))}
      </div>
      )}
    </main>
  )
}

const inputCls = 'w-full bg-cream border border-line rounded-md px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-paprika mt-1'
