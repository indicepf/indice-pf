'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './useAuth'

// Restringe uma página a administradores. Enquanto a auth resolve, mostra um
// carregando; se não for admin, redireciona para a home (não monta os filhos,
// então nem os dados da página são buscados para usuários comuns).
export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { profile, loading } = useAuth()
  useEffect(() => {
    if (!loading && !profile?.is_admin) router.replace('/')
  }, [loading, profile, router])
  if (loading) return <main className="min-h-screen grid place-items-center text-muted text-sm">Carregando…</main>
  if (!profile?.is_admin) return <main className="min-h-screen grid place-items-center text-muted text-sm">Acesso restrito.</main>
  return <>{children}</>
}
