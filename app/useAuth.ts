'use client'

import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase, usuarioDoStorage } from '@/lib/supabase'
import { getProfile } from '@/lib/queries'
import type { Profile } from '@/lib/types'

export const perfilCompleto = (p?: Profile | null) => !!(p?.nome && p?.telefone && p?.regiao)

type Usuario = { id: string; email?: string }
type Auth = {
  user: Usuario | null
  profile: Profile | null
  isPremium: boolean
  loading: boolean
  refresh: (uid: string) => Promise<Profile | null>
}

const AuthCtx = createContext<Auth | null>(null)

// Provider único no layout raiz: uma busca de sessão/perfil/premium por carga,
// compartilhada por todos os componentes. Antes cada useAuth() refazia getSession
// + getProfile + rpc por componente (7+ instâncias por página), o que causava a
// cascata de requests e o flicker "gratuito → premium" a cada navegação.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isPremium, setIsPremium] = useState(false)
  const [loading, setLoading] = useState(true)
  const uidCarregado = useRef<string | null>(null)

  const refresh = useCallback(async (uid: string) => {
    try {
      const p = await getProfile(uid)
      setProfile(p)
      uidCarregado.current = uid
      // RPC is_premium (migração 27); erro (migração não rodada) → free
      supabase.rpc('is_premium', { uid }).then(({ data }) => setIsPremium(data === true))
      return p
    } catch {
      // falha transitória (token em renovação etc.) — mantém o estado atual
      return null
    }
  }, [])

  useEffect(() => {
    let vivo = true
    const aplicar = (u: { id: string; email?: string } | null | undefined) => {
      if (!vivo) return
      if (u) {
        setUser(prev => (prev?.id === u.id ? prev : { id: u.id, email: u.email ?? undefined }))
        if (uidCarregado.current !== u.id) refresh(u.id)
      } else {
        setUser(null); setProfile(null); setIsPremium(false); uidCarregado.current = null
      }
    }
    // seed do storage no primeiro efeito (não no estado inicial: o HTML do
    // servidor vem deslogado e o seed síncrono quebraria a hidratação)
    const semente = usuarioDoStorage()
    if (semente) aplicar(semente)
    supabase.auth.getSession().then(({ data }) => {
      // sem sessão real ainda não desloga aqui: pode ser token em renovação —
      // o onAuthStateChange resolve o estado final
      if (data.session?.user) aplicar(data.session.user)
      if (vivo) setLoading(false)
    })
    // sem await dentro do callback: o supabase-js trava a fila de auth se o
    // callback aguardar outras chamadas ao Supabase — despacho para fora dele
    const { data: sub } = supabase.auth.onAuthStateChange((evento, session) => {
      const u = session?.user
      setTimeout(() => {
        if (evento === 'SIGNED_OUT') aplicar(null)
        else if (u) aplicar(u)
        else if (evento !== 'INITIAL_SESSION') aplicar(null)
      }, 0)
    })
    return () => { vivo = false; sub.subscription.unsubscribe() }
  }, [refresh])

  return createElement(AuthCtx.Provider, { value: { user, profile, isPremium, loading, refresh } }, children)
}

export function useAuth(): Auth {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth precisa do <AuthProvider> no layout raiz')
  return ctx
}
