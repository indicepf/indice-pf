'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import {
  getProfile, getMinhasContribuicoes, excluirContribuicao,
  getRecompensa, getDadosRecompensa, salvarDadosRecompensa, solicitarSaque,
} from '@/lib/queries'
import { REGIOES, mascararTel, telValido, mascararCpf, cpfValido, brl, SAQUE_MINIMO } from '@/lib/format'
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
  const [visiveis, setVisiveis] = useState(10)
  const [rec, setRec] = useState<{ aprovadas: number; ganho: number; disponivel: number } | null>(null)
  const [cpf, setCpf] = useState('')
  const [chavePix, setChavePix] = useState('')
  const [consent, setConsent] = useState(false)
  const [recMsg, setRecMsg] = useState('')
  const [recErro, setRecErro] = useState('')
  const [recBusy, setRecBusy] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user
      if (!u) { router.replace('/'); setUserId(null); return }
      setUserId(u.id); setEmail(u.email ?? '')
      // tudo em paralelo — antes eram 4 idas ao banco em série
      const [p, cs, r, dr] = await Promise.all([
        getProfile(u.id), getMinhasContribuicoes(u.id), getRecompensa(u.id), getDadosRecompensa(u.id),
      ])
      setProfile(p)
      setNome(p?.nome ?? ''); setTel(p?.telefone ?? ''); setRegiao(p?.regiao ?? '')
      setContribs(cs)
      setRec(r)
      if (dr) {
        if (dr.cpf) { setCpf(mascararCpf(dr.cpf)); setConsent(true) }
        setChavePix(dr.chave_pix ?? '')
      }
    })
  }, [router])

  async function salvarRecDados() {
    setRecErro(''); setRecMsg('')
    if (!cpfValido(cpf)) { setRecErro('CPF inválido.'); return }
    if (!chavePix.trim()) { setRecErro('Informe sua chave PIX.'); return }
    if (!consent) { setRecErro('É preciso autorizar o uso do CPF para pagamento.'); return }
    setRecBusy(true)
    const { error } = await salvarDadosRecompensa(userId!, cpf.replace(/\D/g, ''), chavePix.trim())
    setRecBusy(false)
    if (error) { setRecErro(error.message); return }
    setRecMsg('Dados de pagamento salvos.')
  }

  async function pedirSaque() {
    setRecErro(''); setRecMsg('')
    if (!rec || rec.disponivel < SAQUE_MINIMO) return
    if (!cpfValido(cpf) || !chavePix.trim() || !consent) {
      setRecErro('Cadastre e salve CPF e chave PIX antes de solicitar o saque.'); return
    }
    setRecBusy(true)
    const { error } = await solicitarSaque(userId!, rec.disponivel, cpf.replace(/\D/g, ''), chavePix.trim())
    setRecBusy(false)
    if (error) { setRecErro(error.message); return }
    setRecMsg('Saque solicitado. O pagamento será feito no PIX informado em breve.')
    setRec(await getRecompensa(userId!))
  }

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
          <h2 className="font-[family-name:var(--font-serif)] text-lg mb-3">Recompensas</h2>
          {!rec ? <p className="text-sm text-muted">Carregando…</p> : (
            <>
              <div className="border border-line rounded-md bg-panel p-4 mb-4">
                <p className="text-xs text-muted">Saldo disponível</p>
                <p className="font-[family-name:var(--font-serif)] text-3xl tnum mt-0.5">{brl(rec.disponivel)}</p>
                <p className="text-xs text-muted mt-1">
                  {rec.aprovadas} {rec.aprovadas === 1 ? 'contribuição aprovada' : 'contribuições aprovadas'} · {brl(rec.ganho)} acumulados
                </p>
                {rec.disponivel < SAQUE_MINIMO && (
                  <p className="text-xs text-muted mt-2">
                    Faltam {brl(SAQUE_MINIMO - rec.disponivel)} para atingir o saque mínimo de {brl(SAQUE_MINIMO)}.
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted">CPF (para pagamento e nota fiscal)</label>
                  <input value={cpf} onChange={e => setCpf(mascararCpf(e.target.value))}
                    placeholder="000.000.000-00" inputMode="numeric" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-muted">Chave PIX</label>
                  <input value={chavePix} onChange={e => setChavePix(e.target.value)}
                    placeholder="CPF, e-mail, telefone ou aleatória" className={inputCls} />
                </div>
                <label className="flex items-start gap-2 text-xs text-muted leading-relaxed">
                  <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
                    className="mt-0.5 accent-paprika" />
                  Autorizo o uso do meu CPF e chave PIX exclusivamente para o pagamento das recompensas,
                  conforme a Lei Geral de Proteção de Dados (LGPD).
                </label>
                {recErro && <p className="text-xs text-red-600">{recErro}</p>}
                {recMsg && <p className="text-xs text-olive">{recMsg}</p>}
                <div className="flex items-center gap-3">
                  <button disabled={recBusy} onClick={salvarRecDados} className={btnGhostCls}>
                    {recBusy ? 'Salvando…' : 'Salvar dados'}
                  </button>
                  <button disabled={recBusy || rec.disponivel < SAQUE_MINIMO} onClick={pedirSaque} className={btnCls}>
                    Solicitar saque
                  </button>
                </div>
              </div>
            </>
          )}
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
                label: `${c.ingredientes?.nome || c.produto || 'Produto'}${c.preco != null ? ` — R$ ${Number(c.preco).toFixed(2)}` : ''}${c.cidade ? ` · ${c.cidade}` : ''}` }))
            return pontos.length ? <div className="mb-4"><MapaLocal points={pontos} height="280px" /></div> : null
          })()}
          {!contribs ? <p className="text-sm text-muted">Carregando…</p>
            : !contribs.length ? <p className="text-sm text-muted">Você ainda não enviou nenhuma contribuição.</p>
            : (
              <div className="space-y-2">
                {contribs.slice(0, visiveis).map(i => {
                  const s = STATUS[i.status] || STATUS.pendente
                  return (
                    <div key={i.id} className="flex items-center gap-3 border border-line rounded-md p-2 bg-panel">
                      {i.foto_url
                        ? <img src={i.foto_url} alt="" className="w-12 h-12 rounded object-cover shrink-0" />
                        : <div className="w-12 h-12 rounded bg-cream shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{i.ingredientes?.nome || i.produto || 'Produto'}</p>
                        <p className="text-xs text-muted truncate">
                          {i.preco != null ? `R$ ${Number(i.preco).toFixed(2)} · ` : ''}{new Date(i.criado_em).toLocaleDateString('pt-BR')}{i.cidade ? ` · ${i.cidade}` : ''}
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
                {contribs.length > visiveis && (
                  <button onClick={() => setVisiveis(v => v + 10)}
                    className="w-full text-sm text-paprika border border-line rounded-md py-2 hover:bg-cream transition mt-1">
                    Ver mais ({contribs.length - visiveis} restantes)
                  </button>
                )}
              </div>
            )}
        </section>
      </div>
    </main>
  )
}

const inputCls = 'w-full bg-panel border border-line rounded-md px-3 py-2 text-sm text-ink focus:outline-none focus:border-paprika mt-1'
const btnCls = 'bg-paprika text-white rounded-md px-4 py-2 text-sm font-medium hover:brightness-95 transition disabled:opacity-60'
const btnGhostCls = 'border border-line text-ink rounded-md px-4 py-2 text-sm font-medium hover:bg-cream transition disabled:opacity-60'
