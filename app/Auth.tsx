'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Contribuir from './Contribuir'
import MinhasContribuicoes from './MinhasContribuicoes'

const REGIOES = ['Sul', 'Sudeste', 'Centro-oeste', 'Nordeste', 'Norte']

type Profile = { id: string; nome: string | null; telefone: string | null; regiao: string | null }

function mascararTel(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
const telValido = (v: string) => v.replace(/\D/g, '').length >= 10
const perfilCompleto = (p?: Profile | null) => !!(p?.nome && p?.telefone && p?.regiao)

export default function AuthControls() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [menu, setMenu] = useState(false)

  const [modal, setModal] = useState<'none' | 'login' | 'cta' | 'contribuir' | 'minhas'>('none')
  const [step, setStep] = useState<'login' | 'perfil'>('login')
  const [authMode, setAuthMode] = useState<'entrar' | 'criar'>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [nome, setNome] = useState('')
  const [tel, setTel] = useState('')
  const [regiao, setRegiao] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')

  const carregarPerfil = useCallback(async (uid: string) => {
    const { data } = await supabase.from('profiles').select('id,nome,telefone,regiao').eq('id', uid).single()
    setProfile(data as Profile)
    return data as Profile | null
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      if (u) { setUser({ id: u.id, email: u.email ?? undefined }); carregarPerfil(u.id) }
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user
      if (u) { setUser({ id: u.id, email: u.email ?? undefined }); carregarPerfil(u.id) }
      else { setUser(null); setProfile(null) }
    })
    return () => sub.subscription.unsubscribe()
  }, [carregarPerfil])

  useEffect(() => {
    if (typeof window === 'undefined' || localStorage.getItem('pf_cta_seen')) return
    const t = setTimeout(() => {
      supabase.auth.getSession().then(({ data }) => {
        if (!data.session) { setModal('cta'); localStorage.setItem('pf_cta_seen', '1') }
      })
    }, 3500)
    return () => clearTimeout(t)
  }, [])

  function abrirLogin(mode: 'entrar' | 'criar' = 'entrar') {
    setAuthMode(mode); setStep('login'); setErro(''); setInfo(''); setSenha(''); setModal('login')
  }
  function fechar() { setModal('none'); setErro(''); setInfo('') }

  async function aposLogin(uid: string) {
    const p = await carregarPerfil(uid)
    if (!perfilCompleto(p)) setStep('perfil')
    else fechar()
  }

  async function entrar() {
    setErro('')
    if (!/.+@.+\..+/.test(email)) { setErro('Informe um e-mail válido.'); return }
    if (!senha) { setErro('Informe a senha.'); return }
    setBusy(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })
    setBusy(false)
    if (error) { setErro('E-mail ou senha incorretos.'); return }
    if (data.user) await aposLogin(data.user.id)
  }

  async function criarConta() {
    setErro(''); setInfo('')
    if (!/.+@.+\..+/.test(email)) { setErro('Informe um e-mail válido.'); return }
    if (senha.length < 6) { setErro('A senha precisa ter ao menos 6 caracteres.'); return }
    setBusy(true)
    const { data, error } = await supabase.auth.signUp({ email, password: senha })
    setBusy(false)
    if (error) {
      setErro(/rate limit/i.test(error.message)
        ? 'Limite de e-mails atingido. Desative a confirmação de e-mail no Supabase ou configure SMTP.'
        : error.message)
      return
    }
    if (data.session && data.user) { await aposLogin(data.user.id) }
    else { setInfo('Conta criada. Confirme seu e-mail para entrar (ou desative a confirmação no Supabase).') }
  }

  async function salvarPerfil() {
    setErro('')
    if (!nome.trim()) { setErro('Informe seu nome.'); return }
    if (!telValido(tel)) { setErro('Informe um telefone válido com DDD.'); return }
    if (!regiao) { setErro('Selecione sua região.'); return }
    setBusy(true)
    const { error } = await supabase.from('profiles')
      .update({ nome: nome.trim(), telefone: tel, regiao }).eq('id', user!.id)
    setBusy(false)
    if (error) { setErro(error.message); return }
    await carregarPerfil(user!.id)
    fechar()
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button onClick={() => setModal('cta')}
          className="text-sm border border-paprika text-paprika px-3 py-1.5 rounded-md hover:bg-paprika hover:text-white transition-colors">
          Contribuir
        </button>
        {user ? (
          <div className="relative">
            <button onClick={() => setMenu(m => !m)}
              className="text-sm px-3 py-1.5 rounded-md hover:bg-panel transition-colors">
              {profile?.nome ? profile.nome.split(' ')[0] : (user.email ?? 'Conta')} ▾
            </button>
            {menu && (
              <div className="absolute right-0 mt-1 w-44 bg-panel border border-line rounded-md shadow-lg text-sm py-1 z-50">
                {!perfilCompleto(profile) && (
                  <button onClick={() => { setMenu(false); setStep('perfil'); setModal('login') }}
                    className="block w-full text-left px-3 py-2 text-paprika hover:bg-cream">Completar perfil</button>
                )}
                <button onClick={() => { setMenu(false); setModal('minhas') }}
                  className="block w-full text-left px-3 py-2 hover:bg-cream">Minhas contribuições</button>
                <button onClick={async () => { setMenu(false); await supabase.auth.signOut() }}
                  className="block w-full text-left px-3 py-2 hover:bg-cream">Sair</button>
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => abrirLogin('entrar')} className="text-sm px-3 py-1.5 rounded-md hover:bg-panel transition-colors">
            Entrar
          </button>
        )}
      </div>

      {modal === 'login' && (
        <Overlay onClose={fechar}>
          {step === 'login' && (
            <>
              <h3 className="font-[family-name:var(--font-serif)] text-xl mb-1">
                {authMode === 'entrar' ? 'Entrar no Índice PF' : 'Criar conta'}
              </h3>
              <p className="text-sm text-muted mb-4">
                {authMode === 'entrar' ? 'Use seu e-mail e senha.' : 'É rápido — só e-mail e senha.'}
              </p>
              <label className="text-xs text-muted">E-mail</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus
                placeholder="voce@email.com" className={inputCls} />
              <label className="text-xs text-muted mt-3 block">Senha</label>
              <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (authMode === 'entrar' ? entrar() : criarConta())}
                placeholder={authMode === 'criar' ? 'mínimo 6 caracteres' : ''} className={inputCls} />
              {erro && <p className="text-xs text-red-600 mt-2">{erro}</p>}
              {info && <p className="text-xs text-olive mt-2">{info}</p>}
              <button disabled={busy} onClick={authMode === 'entrar' ? entrar : criarConta} className={btnCls}>
                {busy ? '…' : authMode === 'entrar' ? 'Entrar' : 'Criar conta'}
              </button>
              <button onClick={() => { setErro(''); setInfo(''); setAuthMode(m => m === 'entrar' ? 'criar' : 'entrar') }}
                className="text-xs text-paprika hover:underline mt-3 block mx-auto">
                {authMode === 'entrar' ? 'Não tem conta? Criar conta' : 'Já tem conta? Entrar'}
              </button>
            </>
          )}
          {step === 'perfil' && (
            <>
              <h3 className="font-[family-name:var(--font-serif)] text-xl mb-1">Complete seu perfil</h3>
              <p className="text-sm text-muted mb-4">Rápido — para validar suas contribuições.</p>
              <label className="text-xs text-muted">Nome</label>
              <input value={nome} onChange={e => setNome(e.target.value)} className={inputCls} />
              <label className="text-xs text-muted mt-3 block">Telefone (com DDD)</label>
              <input value={tel} onChange={e => setTel(mascararTel(e.target.value))}
                placeholder="(11) 99999-9999" className={inputCls} />
              <label className="text-xs text-muted mt-3 block">Região</label>
              <select value={regiao} onChange={e => setRegiao(e.target.value)} className={inputCls}>
                <option value="">Selecione…</option>
                {REGIOES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {erro && <p className="text-xs text-red-600 mt-2">{erro}</p>}
              <button disabled={busy} onClick={salvarPerfil} className={btnCls}>
                {busy ? 'Salvando…' : 'Continuar'}
              </button>
            </>
          )}
        </Overlay>
      )}

      {modal === 'cta' && (
        <Overlay onClose={fechar}>
          <p className="text-[0.7rem] uppercase tracking-[0.12em] text-paprika mb-2">Faça parte</p>
          <h3 className="font-[family-name:var(--font-serif)] text-2xl leading-tight mb-3">
            Quanto custa o prato feito na sua cidade?
          </h3>
          <p className="text-sm text-muted leading-relaxed mb-5">
            O Índice PF mede isso com dados reais do Brasil inteiro. Fotografe um preço no mercado e ajude a
            tornar o índice mais preciso — contribuições aprovadas rendem <strong>recompensa via PIX</strong>.
          </p>
          <button onClick={() => {
            if (!user) { abrirLogin('criar'); return }
            if (!perfilCompleto(profile)) { setStep('perfil'); setModal('login'); return }
            setModal('contribuir')
          }} className={btnCls}>
            Quero contribuir
          </button>
          <button onClick={fechar} className="text-xs text-muted hover:text-ink mt-3 block mx-auto">fechar</button>
        </Overlay>
      )}

      {modal === 'contribuir' && user && <Contribuir userId={user.id} onClose={fechar} />}
      {modal === 'minhas' && user && <MinhasContribuicoes userId={user.id} onClose={fechar} />}
    </>
  )
}

const inputCls = 'w-full bg-cream border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-paprika mt-1'
const btnCls = 'w-full bg-paprika text-white rounded-md px-3 py-2.5 text-sm font-medium hover:brightness-95 transition mt-4 disabled:opacity-60'

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const esc = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }, [onClose])
  useEffect(() => { document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc) }, [esc])
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-ink/30 px-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-panel border border-line rounded-xl p-6 max-w-sm w-full shadow-2xl relative">
        <button onClick={onClose} className="absolute top-3 right-4 text-muted hover:text-ink text-xl leading-none">×</button>
        {children}
      </div>
    </div>
  )
}
