'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  isAdmin, getContribuicoes, getIngredientes, moderarContribuicao, getSaques, marcarSaquePago,
  getIngredientesManuais, setPrecoManual, limparPrecoManual, recalcularCustos, type IngManual,
} from '@/lib/queries'
import { brl, mascararCpf, VALOR_POR_FOTO } from '@/lib/format'
import type { ContribuicaoFull, Ing } from '@/lib/types'

type Saque = { id: number; user_id: string; valor: number; cpf: string | null; chave_pix: string | null; status: string; criado_em: string; nome: string | null; telefone: string | null }

export default function AdminPage() {
  const router = useRouter()
  const [estado, setEstado] = useState<'carregando' | 'negado' | 'ok'>('carregando')
  const [aba, setAba] = useState<'mod' | 'saques' | 'precos'>('mod')
  const [itens, setItens] = useState<ContribuicaoFull[]>([])
  const [ings, setIngs] = useState<Ing[]>([])
  const [saques, setSaques] = useState<Saque[]>([])
  const [manuais, setManuais] = useState<IngManual[]>([])
  const [addId, setAddId] = useState(''); const [addPreco, setAddPreco] = useState(''); const [addLink, setAddLink] = useState('')
  const [precoMsg, setPrecoMsg] = useState(''); const [recalcBusy, setRecalcBusy] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user
      if (!u) { router.replace('/'); return }
      if (!(await isAdmin(u.id))) { setEstado('negado'); return }
      setIngs(await getIngredientes())
      setItens(await getContribuicoes('pendente'))
      setSaques(await getSaques('solicitado'))
      setManuais(await getIngredientesManuais())
      setEstado('ok')
    })
  }, [router])

  async function pagar(s: Saque) {
    if (!confirm(`Confirmar pagamento de ${brl(Number(s.valor))} via PIX (${s.chave_pix})?`)) return
    await marcarSaquePago(s.id)
    setSaques(prev => prev.filter(x => x.id !== s.id))
  }

  function patchManual(id: number, campo: 'preco_manual' | 'preco_manual_link', valor: any) {
    setManuais(prev => prev.map(m => m.id === id ? { ...m, [campo]: valor } : m))
  }
  async function salvarManual(m: IngManual) {
    setPrecoMsg('')
    const preco = Number(String(m.preco_manual).replace(',', '.'))
    if (!preco || preco <= 0) { setPrecoMsg(`Preço inválido para ${m.nome}.`); return }
    const { error } = await setPrecoManual(m.id, preco, m.preco_manual_link || '')
    setPrecoMsg(error ? error.message : `${m.nome} salvo. Lembre de recalcular os custos.`)
  }
  async function removerManual(m: IngManual) {
    if (!confirm(`Remover o preço manual de ${m.nome}? Ele volta a ser coletado online.`)) return
    await limparPrecoManual(m.id)
    setManuais(prev => prev.filter(x => x.id !== m.id))
    setPrecoMsg(`${m.nome} voltou ao modo online. Recalcule os custos.`)
  }
  async function adicionarManual() {
    setPrecoMsg('')
    const preco = Number(addPreco.replace(',', '.'))
    if (!addId) { setPrecoMsg('Selecione um ingrediente.'); return }
    if (!preco || preco <= 0) { setPrecoMsg('Informe um preço válido (R$/kg).'); return }
    const { error } = await setPrecoManual(Number(addId), preco, addLink)
    if (error) { setPrecoMsg(error.message); return }
    setManuais(await getIngredientesManuais())
    setAddId(''); setAddPreco(''); setAddLink('')
    setPrecoMsg('Preço manual definido. Recalcule os custos.')
  }
  async function recalcular() {
    setRecalcBusy(true); setPrecoMsg('')
    const { error } = await recalcularCustos()
    setRecalcBusy(false)
    setPrecoMsg(error ? `Erro ao recalcular: ${error.message}` : 'Custos do índice recalculados.')
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
          {([['mod', `Moderação (${itens.length})`], ['saques', `Saques (${saques.length})`], ['precos', `Preços manuais (${manuais.length})`]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`text-sm pb-2 border-b-2 -mb-px transition ${aba === k ? 'border-paprika text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>
      </header>

      {aba === 'mod' ? (
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6" key="mod">
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
      ) : aba === 'saques' ? (
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-3" key="saques">
        {!saques.length && <p className="text-sm text-muted text-center py-10">Nenhuma solicitação de saque.</p>}
        {saques.map(s => (
          <div key={s.id} className="border border-line rounded-lg bg-panel p-4">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <p className="font-medium">{s.nome || 'Usuário sem nome'}</p>
              <p className="font-[family-name:var(--font-serif)] text-2xl tnum text-paprika">{brl(Number(s.valor))}</p>
            </div>
            <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted">Chave PIX</dt>
              <dd className="flex items-center gap-2 min-w-0">
                <span className="font-mono truncate">{s.chave_pix || '—'}</span>
                {s.chave_pix && (
                  <button onClick={() => navigator.clipboard?.writeText(s.chave_pix!)}
                    className="text-xs text-paprika hover:underline shrink-0">copiar</button>
                )}
              </dd>
              <dt className="text-muted">CPF</dt>
              <dd className="font-mono">{s.cpf ? mascararCpf(s.cpf) : '—'}</dd>
              <dt className="text-muted">Telefone</dt>
              <dd>{s.telefone || '—'}</dd>
              <dt className="text-muted">Solicitado</dt>
              <dd className="text-muted">{new Date(s.criado_em).toLocaleString('pt-BR')}</dd>
            </dl>
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-line">
              <p className="text-xs text-muted">Faça o PIX de {brl(Number(s.valor))} para a chave acima, depois:</p>
              <button onClick={() => pagar(s)}
                className="text-sm bg-olive text-white px-4 py-1.5 rounded-md hover:brightness-95 transition ml-auto shrink-0">
                Marcar como pago
              </button>
            </div>
          </div>
        ))}
      </div>
      ) : (
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6" key="precos">
        <p className="text-sm text-muted">
          Preços definidos manualmente (R$/kg) para itens sem cotação online confiável. Editar grava direto em
          <code className="mx-1">ingredientes</code>; depois clique em “Recalcular custos” para refletir no índice.
        </p>

        <div className="flex items-center gap-3">
          <button onClick={recalcular} disabled={recalcBusy}
            className="text-sm bg-olive text-white px-4 py-1.5 rounded-md hover:brightness-95 transition disabled:opacity-60">
            {recalcBusy ? 'Recalculando…' : 'Recalcular custos do índice'}
          </button>
          {precoMsg && <span className="text-xs text-muted">{precoMsg}</span>}
        </div>

        {/* lista dos que têm preço manual */}
        <div className="space-y-3">
          {!manuais.length && <p className="text-sm text-muted">Nenhum preço manual definido.</p>}
          {manuais.map(m => (
            <div key={m.id} className="border border-line rounded-lg bg-panel p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium">{m.nome}</p>
                <span className="text-xs text-muted">{m.categoria || '—'}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-3 mt-3 text-xs">
                <label>Preço (R$/kg)
                  <input value={m.preco_manual ?? ''} inputMode="decimal"
                    onChange={e => patchManual(m.id, 'preco_manual', e.target.value)} className={inputCls} />
                </label>
                <label>Link da fonte do preço
                  <input value={m.preco_manual_link ?? ''} placeholder="https://…"
                    onChange={e => patchManual(m.id, 'preco_manual_link', e.target.value)} className={inputCls} />
                </label>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => salvarManual(m)}
                  className="text-sm bg-paprika text-white px-4 py-1.5 rounded-md hover:brightness-95 transition">Salvar</button>
                <button onClick={() => removerManual(m)}
                  className="text-sm border border-line text-muted px-4 py-1.5 rounded-md hover:bg-cream transition">
                  Remover (voltar ao online)
                </button>
                {m.preco_manual_link && (
                  <a href={m.preco_manual_link} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-paprika hover:underline ml-auto self-center">abrir fonte</a>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* definir preço manual para outro ingrediente */}
        <div className="border border-line rounded-lg bg-panel p-4">
          <p className="font-medium mb-3">Definir preço manual para outro ingrediente</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <label className="sm:col-span-2">Ingrediente
              <select value={addId} onChange={e => setAddId(e.target.value)} className={inputCls}>
                <option value="">Selecione…</option>
                {ings.filter(i => !manuais.some(m => m.id === i.id))
                  .map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
              </select>
            </label>
            <label>Preço (R$/kg)
              <input value={addPreco} onChange={e => setAddPreco(e.target.value)} inputMode="decimal" placeholder="0,00" className={inputCls} />
            </label>
            <label>Link da fonte do preço
              <input value={addLink} onChange={e => setAddLink(e.target.value)} placeholder="https://…" className={inputCls} />
            </label>
          </div>
          <button onClick={adicionarManual}
            className="text-sm bg-paprika text-white px-4 py-1.5 rounded-md hover:brightness-95 transition mt-3">Definir</button>
        </div>
      </div>
      )}
    </main>
  )
}

const inputCls = 'w-full bg-cream border border-line rounded-md px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-paprika mt-1'
