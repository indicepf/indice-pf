'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { criarConta } from '@/lib/auth-actions'
import { Button, Input } from '@/components/ui'

export default function CadastroPage() {
  return <Suspense fallback={null}><CadastroInner /></Suspense>
}

function CadastroInner() {
  const router = useRouter()
  const next = useSearchParams().get('next') || '/'
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')

  async function onCriar() {
    setErro(''); setInfo(''); setBusy(true)
    const r = await criarConta(email, senha)
    setBusy(false)
    if (r.erro) { setErro(r.erro); return }
    if (r.pendenteConfirmacao) { setInfo('Conta criada. Confirme seu e-mail para entrar.'); return }
    // conta nova → sempre completa o perfil antes de seguir
    router.replace(`/completar-perfil?next=${encodeURIComponent(next)}`)
  }

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Criar conta</h1>
      <p className="text-sm text-dim mt-1 mb-5">É rápido — só e-mail e senha.</p>

      <label className="text-xs text-dim">E-mail</label>
      <Input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus
        placeholder="voce@email.com" autoComplete="email" />
      <label className="text-xs text-dim mt-3 block">Senha</label>
      <Input type="password" value={senha} onChange={e => setSenha(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onCriar()}
        placeholder="mínimo 6 caracteres" autoComplete="new-password" />

      {erro && <p className="text-xs text-danger mt-2">{erro}</p>}
      {info && <p className="text-xs text-ok mt-2">{info}</p>}
      <Button full disabled={busy} onClick={onCriar} className="mt-4">{busy ? '…' : 'Criar conta'}</Button>

      <Link href={`/entrar${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}
        className="text-xs text-accent hover:underline block text-center mt-4">Já tem conta? Entrar</Link>
    </>
  )
}
