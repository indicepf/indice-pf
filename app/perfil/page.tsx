'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { getProfile, getMinhasContribuicoes, excluirContribuicao } from '@/lib/queries'
import { REGIOES, mascararTel, telValido } from '@/lib/format'
import type { Profile, Contribuicao } from '@/lib/types'

const MapaLocal = dynamic(() => import('../MapaLocal'), {
  ssr: false,
  loading: () => <div className="h-[280px] rounded-lg border border-line grid place-items-center text-muted text-sm">carregando mapa…</div>,
})

const STATUS: Record<string, { txt: string; cls: string }> = {
  pendente:  { txt: 'em análise', cls: 'text-muted border-line' },
  aprovada:  { txt: 'aprovada',   cls: 'text-olive border-olive/30 bg-olive/5' },
  rejeitada: { txt: 'rejeitada',  cls: 'text-red-600 border-red-200 bg-red-50' },
}

export default function PerfilPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null | undefined>(undefined)
  const [email, setEmail] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [nome, setNome] = useState('')
  const [tel, setTel] = useState('')
  const [regiao, setRegiao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')
  const [contribs, setContribs] = useState<Contribuicao[] | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user
      if (!u) { router.replace('/'); setUserId(null); return }
      setUserId(u.id); setEmail(u.email ?? '')
      const p = await getProfile(u.id)
      setProfile(p)
      setNome(p?.nome ?? ''); setTel(p?.telefone ?? ''); setRegiao(p?.regiao ?? '')
      setContribs(await getMinhasContribuicoes(u.id))
    })
  }, [router])

  async function salvar() {
    setErro(''); setMsg('')
    if (!nome.trim()) { setErro('Informe seu nome.'); return }
    if (!telValido(tel)) { setErro('Informe um telefone válido com DDD.'); return }
    if (!regiao) { setErro('Selecione sua região.'); return }
    setSalvando(true)
    const { error } = await supabase.from('profiles')
      .update({ nome: nome.trim(), telefone: tel, regiao }).eq('id', userId!)
    setSalvando(false)
    if (error) { setErro(error.message); return }
    setMsg('Perfil salvo.')
  }

  async function deletar(id: number) {
    if (!confirm('Excluir esta contribuição?')) return
    await excluirContribuicao(id)
    setContribs(prev => prev ? prev.filter(c => c.id !== id) : prev)
  }

  if (userId === undefined) {
    return <main className="min-h-screen grid place-items-center text-muted text-sm">Carregando…</main>
  }
  if (!userId) return null

  return (
    <main className="min-h-screen">
      <header className="border-b border-line sticky top-0 bg-cream/90 backdrop-blur z-10">
        <div className="max-w-lg mx-auto px-6 py-4 flex items-center gap-3">
          <button onClick={() => router.push('/')} className="text-sm text-muted hover:text-ink">← voltar</button>
          <h1 className="font-[family-name:var(--font-serif)] text-xl ml-1">Meu perfil</h1>
          <button onClick={async () => { await supabase.auth.signOut(); router.push('/') }}
            className="text-sm text-muted hover:text-ink ml-auto">Sair</button>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-6 py-8 space-y-10">
        {/* Dados */}
        <section>
          <h2 className="font-[family-name:var(--font-serif)] text-lg mb-3">Dados</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted">E-mail</label>
              <input value={email} disabled className={`${inputCls} opacity-60`} />
            </div>
            <div>
              <label className="text-xs text-muted">Nome</label>
              <input value={nome} onChange={e => setNome(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-muted">Telefone (com DDD)</label>
              <input value={tel} onChange={e => setTel(mascararTel(e.target.value))}
                placeholder="(11) 99999-9999" className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-muted">Região</label>
              <select value={regiao} onChange={e => setRegiao(e.target.value)} className={inputCls}>
                <option value="">Selecione…</option>
                {REGIOES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {erro && <p className="text-xs text-red-600">{erro}</p>}
            {msg && <p className="text-xs text-olive">{msg}</p>}
            <button disabled={salvando} onClick={salvar} className={btnCls}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </section>

        {/* Recompensas (Frente C fase 2) */}
        <section>
          <h2 className="font-[family-name:var(--font-serif)] text-lg mb-2">Recompensas</h2>
          <p className="text-sm text-muted leading-relaxed">
            Contribuições aprovadas geram recompensa via PIX. A configuração de recompensa (CPF e chave PIX)
            será habilitada em breve, quando você tiver contribuições aprovadas.
          </p>
        </section>

        {/* Contribuições */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-[family-name:var(--font-serif)] text-lg">Minhas contribuições</h2>
            <button onClick={() => router.push('/contribuir')}
              className="text-sm border border-paprika text-paprika px-3 py-1.5 rounded-md hover:bg-paprika hover:text-white transition">
              Contribuir
            </button>
          </div>
          {(() => {
            const pontos = (contribs || []).filter(c => c.lat != null && c.lng != null)
              .map(c => ({ lat: c.lat as number, lng: c.lng as number,
                label: `${c.ingredientes?.nome || c.produto || 'Produto'} — R$ ${Number(c.preco).toFixed(2)}${c.cidade ? ` · ${c.cidade}` : ''}` }))
            return pontos.length ? <div className="mb-4"><MapaLocal points={pontos} height="280px" /></div> : null
          })()}
          {!contribs ? <p className="text-sm text-muted">Carregando…</p>
            : !contribs.length ? <p className="text-sm text-muted">Você ainda não enviou nenhuma contribuição.</p>
            : (
              <div className="space-y-2">
                {contribs.map(i => {
                  const s = STATUS[i.status] || STATUS.pendente
                  return (
                    <div key={i.id} className="flex items-center gap-3 border border-line rounded-md p-2 bg-panel">
                      {i.foto_url
                        ? <img src={i.foto_url} alt="" className="w-12 h-12 rounded object-cover shrink-0" />
                        : <div className="w-12 h-12 rounded bg-cream shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{i.ingredientes?.nome || i.produto || 'Produto'}</p>
                        <p className="text-xs text-muted truncate">
                          R$ {Number(i.preco).toFixed(2)} · {new Date(i.criado_em).toLocaleDateString('pt-BR')}{i.cidade ? ` · ${i.cidade}` : ''}
                        </p>
                      </div>
                      <span className={`text-[0.65rem] uppercase tracking-wide border rounded px-1.5 py-0.5 shrink-0 ${s.cls}`}>
                        {s.txt}
                      </span>
                      {i.status === 'pendente' && (
                        <button onClick={() => deletar(i.id)}
                          className="text-xs text-muted hover:text-red-600 shrink-0">excluir</button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
        </section>
      </div>
    </main>
  )
}

const inputCls = 'w-full bg-panel border border-line rounded-md px-3 py-2 text-sm text-ink focus:outline-none focus:border-paprika mt-1'
const btnCls = 'bg-paprika text-white rounded-md px-4 py-2 text-sm font-medium hover:brightness-95 transition disabled:opacity-60'
