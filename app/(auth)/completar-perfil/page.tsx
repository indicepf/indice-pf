'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, usuarioDoStorage } from '@/lib/supabase'
import { salvarPerfilBasico } from '@/lib/auth-actions'
import { REGIOES, mascararTel } from '@/lib/format'


export default function CompletarPerfilPage() {
  return <Suspense fallback={null}><CompletarPerfilInner /></Suspense>
}

function CompletarPerfilInner() {
  const router = useRouter()
  const next = useSearchParams().get('next') || '/'
  const [uid, setUid] = useState<string | null | undefined>(undefined)
  const [nome, setNome] = useState('')
  const [tel, setTel] = useState('')
  const [regiao, setRegiao] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const u = usuarioDoStorage()
    if (u) { setUid(u.id); return }
    supabase.auth.getSession().then(({ data }) => setUid(data.session?.user?.id ?? null))
  }, [])
  useEffect(() => {
    if (uid === null) router.replace(`/entrar?next=${encodeURIComponent(next)}`)
  }, [uid, router, next])

  async function onSalvar() {
    if (!uid) return
    setErro(''); setBusy(true)
    const r = await salvarPerfilBasico(uid, nome, tel, regiao)
    setBusy(false)
    if (r.erro) { setErro(r.erro); return }
    router.replace(next)
  }

  if (!uid) return null

  return (
    <>
      <h1>Complete seu perfil</h1>
      <p className="sub">Rápido — para validar suas contribuições</p>

      <div className="field">
        <label>Nome</label>
        <input value={nome} onChange={e => setNome(e.target.value)} autoFocus autoComplete="name" placeholder="Seu nome" />
      </div>
      <div className="field">
        <label>Telefone (com DDD)</label>
        <input value={tel} onChange={e => setTel(mascararTel(e.target.value))}
          placeholder="(11) 99999-9999" inputMode="tel" autoComplete="tel" />
      </div>
      <div className="field">
        <label>Região</label>
        <select value={regiao} onChange={e => setRegiao(e.target.value)}>
          <option value="">Selecione…</option>
          {REGIOES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {erro && <p className="text-xs text-danger mt-2">{erro}</p>}
      <button className="btn-primary" disabled={busy} onClick={onSalvar}>{busy ? 'Salvando…' : 'Continuar'}</button>
    </>
  )
}
