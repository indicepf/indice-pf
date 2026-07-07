'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button, Card, Input } from '@/components/ui'
import BotaoInicio from '../BotaoInicio'

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
      <Card className="p-6 max-w-sm w-full">
        <h1 className="text-xl font-bold tracking-tight mb-1">Redefinir senha</h1>
        {ok ? (
          <p className="text-sm text-ok mt-2">Senha alterada. Redirecionando…</p>
        ) : pronto === null ? (
          <p className="text-sm text-dim mt-2">Verificando o link…</p>
        ) : !pronto ? (
          <>
            <p className="text-sm text-dim mt-2 leading-relaxed">
              Link inválido ou expirado. Volte ao início e use “Esqueci minha senha” para receber um novo.
            </p>
            <BotaoInicio className="mt-4" />
          </>
        ) : (
          <>
            <p className="text-sm text-dim mb-4">Escolha uma nova senha para sua conta.</p>
            <label className="text-xs text-dim">Nova senha</label>
            <Input type="password" value={senha} onChange={e => setSenha(e.target.value)} autoFocus
              placeholder="mínimo 6 caracteres" />
            <label className="text-xs text-dim mt-3 block">Confirmar senha</label>
            <Input type="password" value={confirma} onChange={e => setConfirma(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && salvar()} />
            {erro && <p className="text-xs text-danger mt-2">{erro}</p>}
            <Button full disabled={busy} onClick={salvar} className="mt-4">
              {busy ? 'Salvando…' : 'Salvar nova senha'}
            </Button>
          </>
        )}
      </Card>
    </main>
  )
}
