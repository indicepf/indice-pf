'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getProfile } from '@/lib/queries'
import type { Profile } from '@/lib/types'

export const perfilCompleto = (p?: Profile | null) => !!(p?.nome && p?.telefone && p?.regiao)

export function useAuth() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async (uid: string) => {
    const p = await getProfile(uid); setProfile(p); return p
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user
      if (u) { setUser({ id: u.id, email: u.email ?? undefined }); await refresh(u.id) }
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      const u = session?.user
      if (u) { setUser({ id: u.id, email: u.email ?? undefined }); await refresh(u.id) }
      else { setUser(null); setProfile(null) }
    })
    return () => sub.subscription.unsubscribe()
  }, [refresh])

  return { user, profile, loading, refresh }
}
