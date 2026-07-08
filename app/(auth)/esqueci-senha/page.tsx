'use client'

import { useState } from 'react'
import Link from 'next/link'
import { enviarResetSenha } from '@/lib/auth-actions'

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
      <h1>Recuperar senha</h1>
      <p className="sub">Enviamos um link de redefinição para o seu e-mail</p>

      <div className="field">
        <label>E-mail</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus
          onKeyDown={e => e.key === 'Enter' && onEnviar()} placeholder="voce@email.com" autoComplete="email" />
      </div>

      {erro && <p className="text-xs text-danger mt-2">{erro}</p>}
      {info && <p className="text-xs text-ok mt-2">{info}</p>}
      <button className="btn-primary" disabled={busy} onClick={onEnviar}>{busy ? '…' : 'Enviar link'}</button>

      <div className="auth-alt"><Link href="/entrar">← Voltar para o login</Link></div>
    </>
  )
}
