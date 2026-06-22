'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function RedefinirSenhaPage() {
  const router = useRouter()
  const [pronto, setPronto] = useState<boolean | null>(null) // null = verificando sessão de recuperação
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)

  useEffect(() => {
    // o link do e-mail traz um token que o supabase-js troca por uma sessão temporária
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setPronto(true)
    })
    supabase.auth.getSession().then(({ data }) => setPronto(!!data.session))
    return () => sub.subscription.unsubscribe()
  }, [])

  async function salvar() {
    setErro('')
    if (senha.length < 6) { setErro('A senha precisa ter ao menos 6 caracteres.'); return }
    if (senha !== confirma) { setErro('As senhas não conferem.'); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setBusy(false)
    if (error) { setErro(error.message); return }
    setOk(true)
    setTimeout(() => router.push('/'), 1800)
  }

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="bg-panel border border-line rounded-xl p-6 max-w-sm w-full shadow-sm">
        <h1 className="font-[family-name:var(--font-serif)] text-xl mb-1">Redefinir senha</h1>
        {ok ? (
          <p className="text-sm text-olive mt-2">Senha alterada. Redirecionando…</p>
        ) : pronto === null ? (
          <p className="text-sm text-muted mt-2">Verificando o link…</p>
        ) : !pronto ? (
          <>
            <p className="text-sm text-muted mt-2 leading-relaxed">
              Link inválido ou expirado. Volte ao início e use “Esqueci minha senha” para receber um novo.
            </p>
            <button onClick={() => router.push('/')} className={btnCls}>Voltar ao início</button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted mb-4">Escolha uma nova senha para sua conta.</p>
            <label className="text-xs text-muted">Nova senha</label>
            <input type="password" value={senha} onChange={e => setSenha(e.target.value)} autoFocus
              placeholder="mínimo 6 caracteres" className={inputCls} />
            <label className="text-xs text-muted mt-3 block">Confirmar senha</label>
            <input type="password" value={confirma} onChange={e => setConfirma(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && salvar()} className={inputCls} />
            {erro && <p className="text-xs text-red-600 mt-2">{erro}</p>}
            <button disabled={busy} onClick={salvar} className={btnCls}>
              {busy ? 'Salvando…' : 'Salvar nova senha'}
            </button>
          </>
        )}
      </div>
    </main>
  )
}

const inputCls = 'w-full bg-cream border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-paprika mt-1'
const btnCls = 'w-full bg-paprika text-white rounded-md px-3 py-2.5 text-sm font-medium hover:brightness-95 transition mt-4 disabled:opacity-60'
