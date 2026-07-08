'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { criarConta } from '@/lib/auth-actions'
import { supabase } from '@/lib/supabase'

export default function CadastroPage() {
  return <Suspense fallback={null}><CadastroInner /></Suspense>
}

function CadastroInner() {
  const router = useRouter()
  const next = useSearchParams().get('next') || '/'
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [termos, setTermos] = useState(false)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')

  async function onCriar() {
    setErro(''); setInfo('')
    if (!termos) { setErro('É preciso concordar com os Termos para criar a conta.'); return }
    setBusy(true)
    const r = await criarConta(email, senha)
    setBusy(false)
    if (r.erro) { setErro(r.erro); return }
    if (r.pendenteConfirmacao) { setInfo('Conta criada. Confirme seu e-mail para entrar.'); return }
    // guarda o nome já dado; telefone/região vêm no completar-perfil
    if (r.uid && nome.trim()) await supabase.from('profiles').update({ nome: nome.trim() }).eq('id', r.uid)
    router.replace(`/completar-perfil?next=${encodeURIComponent(next)}`)
  }

  return (
    <>
      <h1>Criar conta</h1>
      <p className="sub">Comece grátis em segundos</p>

      <div className="field">
        <label>Nome</label>
        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome" autoFocus autoComplete="name" />
      </div>
      <div className="field">
        <label>E-mail</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@email.com" autoComplete="email" />
      </div>
      <div className="field">
        <label>Senha</label>
        <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onCriar()} placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
      </div>
      <label className="flex gap-2 items-start text-[12.5px] text-ink-2 my-1.5 cursor-pointer">
        <input type="checkbox" checked={termos} onChange={e => setTermos(e.target.checked)} className="mt-0.5 accent-accent" />
        Concordo com os Termos e a Política de Privacidade da Infinity.
      </label>

      {erro && <p className="text-xs text-danger mt-2">{erro}</p>}
      {info && <p className="text-xs text-ok mt-2">{info}</p>}
      <button className="btn-primary" disabled={busy} onClick={onCriar}>{busy ? '…' : 'Criar conta'}</button>

      <div className="auth-alt">Já tem conta? <Link href={`/entrar${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>Entrar</Link></div>
      <div className="auth-alt" style={{ marginTop: 8 }}><Link href="/">← Voltar ao site</Link></div>
    </>
  )
}
