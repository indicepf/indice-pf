'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth, perfilCompleto } from './useAuth'
import { capturarContexto } from '@/lib/contexto'
import { registrarLogin } from '@/lib/queries'
import { REGIOES, mascararTel, telValido } from '@/lib/format'

export default function AuthControls() {
  const router = useRouter()
  const { user, profile, refresh } = useAuth()
  const [menu, setMenu] = useState(false)

  const [modal, setModal] = useState<'none' | 'login' | 'cta'>('none')
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

  function abrirLogin(mode: 'entrar' | 'criar' = 'entrar') {
    setAuthMode(mode); setStep('login'); setErro(''); setInfo(''); setSenha(''); setModal('login')
  }
  function fechar() { setModal('none'); setErro(''); setInfo('') }

  async function aposLogin(uid: string) {
    // registra o login (dispositivo + GPS) em segundo plano — não bloqueia
    capturarContexto().then(ctx => registrarLogin(uid, ctx)).catch(() => {})
    const p = await refresh(uid)
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

  async function recuperar() {
    setErro(''); setInfo('')
    if (!/.+@.+\..+/.test(email)) { setErro('Informe seu e-mail para receber o link.'); return }
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    setBusy(false)
    if (error) {
      setErro(/rate limit/i.test(error.message)
        ? 'Limite de e-mails atingido. Tente novamente mais tarde.' : error.message)
      return
    }
    setInfo('Enviamos um link para redefinir sua senha. Confira seu e-mail.')
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
    if (data.session && data.user) await aposLogin(data.user.id)
    else setInfo('Conta criada. Confirme seu e-mail para entrar (ou desative a confirmação no Supabase).')
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
    await refresh(user!.id)
    fechar()
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button onClick={() => { if (user && perfilCompleto(profile)) router.push('/contribuir'); else setModal('cta') }}
          className="text-sm border border-paprika text-paprika px-3 py-1.5 rounded-md hover:bg-paprika hover:text-white transition-colors">
          Contribuir
        </button>
        {user ? (
          <div className="relative">
            <button onClick={() => setMenu(m => !m)}
              className="flex items-center gap-2 text-sm px-2 py-1 rounded-md hover:bg-panel transition-colors">
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover border border-line" />
                : <span className="w-7 h-7 rounded-full bg-cream border border-line grid place-items-center text-xs text-muted">
                    {((profile?.nome || user.email || '?').trim().charAt(0) || '?').toUpperCase()}
                  </span>}
              {profile?.nome ? profile.nome.split(' ')[0] : (user.email ?? 'Conta')} ▾
            </button>
            {menu && (
              <div className="absolute right-0 mt-1 w-44 bg-panel border border-line rounded-md shadow-lg text-sm py-1 z-50">
                <button onClick={() => { setMenu(false); router.push('/perfil') }}
                  className="block w-full text-left px-3 py-2 hover:bg-cream">Meu perfil</button>
                {profile?.is_admin && (
                  <button onClick={() => { setMenu(false); router.push('/admin') }}
                    className="block w-full text-left px-3 py-2 hover:bg-cream text-paprika">Administração</button>
                )}
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
              {authMode === 'entrar' && (
                <button onClick={recuperar} disabled={busy}
                  className="text-xs text-muted hover:text-ink mt-2 block mx-auto disabled:opacity-60">
                  Esqueci minha senha
                </button>
              )}
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
            fechar(); router.push('/contribuir')
          }} className={btnCls}>
            Quero contribuir
          </button>
          <button onClick={fechar} className="text-xs text-muted hover:text-ink mt-3 block mx-auto">fechar</button>
        </Overlay>
      )}
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
