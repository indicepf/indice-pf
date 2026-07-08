'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { entrar } from '@/lib/auth-actions'
import { getProfile } from '@/lib/queries'
import { perfilCompleto } from '@/app/useAuth'

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
      <h1>Entrar</h1>
      <p className="sub">Bem-vindo de volta ao Índice PF</p>

      <div className="field">
        <label>E-mail</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus
          placeholder="voce@email.com" autoComplete="email" />
      </div>
      <div className="field">
        <label>Senha</label>
        <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onEntrar()} autoComplete="current-password" />
      </div>

      {erro && <p className="text-xs text-danger mt-2">{erro}</p>}
      <button className="btn-primary" disabled={busy} onClick={onEntrar}>{busy ? '…' : 'Entrar'}</button>

      <div className="auth-alt">Não tem conta? <Link href={`/cadastro${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>Criar conta</Link></div>
      <div className="auth-alt" style={{ marginTop: 8 }}>
        <Link href="/esqueci-senha">Esqueci minha senha</Link> · <Link href="/">← Voltar ao site</Link>
      </div>
    </>
  )
}
