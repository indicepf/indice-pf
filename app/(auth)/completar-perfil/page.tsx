'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, usuarioDoStorage } from '@/lib/supabase'
import { salvarPerfilBasico } from '@/lib/auth-actions'
import { REGIOES, mascararTel } from '@/lib/format'
import { Button, Input, Select } from '@/components/ui'

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
      <h1 className="text-2xl font-bold tracking-tight">Complete seu perfil</h1>
      <p className="text-sm text-dim mt-1 mb-5">Rápido — para validar suas contribuições.</p>

      <label className="text-xs text-dim">Nome</label>
      <Input value={nome} onChange={e => setNome(e.target.value)} autoFocus autoComplete="name" />
      <label className="text-xs text-dim mt-3 block">Telefone (com DDD)</label>
      <Input value={tel} onChange={e => setTel(mascararTel(e.target.value))}
        placeholder="(11) 99999-9999" inputMode="tel" autoComplete="tel" />
      <label className="text-xs text-dim mt-3 block">Região</label>
      <Select value={regiao} onChange={e => setRegiao(e.target.value)}>
        <option value="">Selecione…</option>
        {REGIOES.map(r => <option key={r} value={r}>{r}</option>)}
      </Select>

      {erro && <p className="text-xs text-danger mt-2">{erro}</p>}
      <Button full disabled={busy} onClick={onSalvar} className="mt-4">{busy ? 'Salvando…' : 'Continuar'}</Button>
    </>
  )
}
