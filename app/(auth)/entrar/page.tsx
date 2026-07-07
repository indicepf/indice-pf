'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { entrar } from '@/lib/auth-actions'
import { getProfile } from '@/lib/queries'
import { perfilCompleto } from '@/app/useAuth'
import { Button, Input } from '@/components/ui'

export default function EntrarPage() {
  return <Suspense fallback={null}><EntrarInner /></Suspense>
}

function EntrarInner() {
  const router = useRouter()
  const next = useSearchParams().get('next') || '/'
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')

  async function onEntrar() {
    setErro(''); setBusy(true)
    const r = await entrar(email, senha)
    if (r.erro || !r.uid) { setBusy(false); setErro(r.erro ?? 'Falha ao entrar.'); return }
    const p = await getProfile(r.uid)
    router.replace(perfilCompleto(p) ? next : `/completar-perfil?next=${encodeURIComponent(next)}`)
  }

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Entrar no Índice PF</h1>
      <p className="text-sm text-dim mt-1 mb-5">Use seu e-mail e senha.</p>

      <label className="text-xs text-dim">E-mail</label>
      <Input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus
        placeholder="voce@email.com" autoComplete="email" />
      <label className="text-xs text-dim mt-3 block">Senha</label>
      <Input type="password" value={senha} onChange={e => setSenha(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onEntrar()} autoComplete="current-password" />

      {erro && <p className="text-xs text-danger mt-2">{erro}</p>}
      <Button full disabled={busy} onClick={onEntrar} className="mt-4">{busy ? '…' : 'Entrar'}</Button>

      <div className="mt-4 text-center space-y-2">
        <Link href={`/cadastro${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}
          className="text-xs text-accent hover:underline block">Não tem conta? Criar conta</Link>
        <Link href="/esqueci-senha" className="text-xs text-dim hover:text-ink block">Esqueci minha senha</Link>
      </div>
    </>
  )
}
