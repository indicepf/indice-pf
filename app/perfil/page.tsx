'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// /perfil foi dividido em /configuracoes (dados + recompensas) e /meus-envios
// (contribuições) na Fase 6. Redirect mantém links e históricos antigos vivos.
export default function PerfilRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/configuracoes') }, [router])
  return null
}
