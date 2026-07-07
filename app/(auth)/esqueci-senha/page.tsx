'use client'

import { useState } from 'react'
import Link from 'next/link'
import { enviarResetSenha } from '@/lib/auth-actions'
import { Button, Input } from '@/components/ui'

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')

  async function onEnviar() {
    setErro(''); setInfo(''); setBusy(true)
    const r = await enviarResetSenha(email)
    setBusy(false)
    if (r.erro) { setErro(r.erro); return }
    setInfo('Enviamos um link para redefinir sua senha. Confira seu e-mail.')
  }

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Recuperar senha</h1>
      <p className="text-sm text-dim mt-1 mb-5">Enviamos um link de redefinição para o seu e-mail.</p>

      <label className="text-xs text-dim">E-mail</label>
      <Input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus
        onKeyDown={e => e.key === 'Enter' && onEnviar()}
        placeholder="voce@email.com" autoComplete="email" />

      {erro && <p className="text-xs text-danger mt-2">{erro}</p>}
      {info && <p className="text-xs text-ok mt-2">{info}</p>}
      <Button full disabled={busy} onClick={onEnviar} className="mt-4">{busy ? '…' : 'Enviar link'}</Button>

      <Link href="/entrar" className="text-xs text-dim hover:text-ink block text-center mt-4">Voltar para o login</Link>
    </>
  )
}
