'use client'

import { useEffect, useState } from 'react'
import { getEvolucao, getSnapshotsNovos, type Evolucao } from '@/lib/queries'
import IndicePainel from '../evolucao/IndicePainel'

// Cópia da aba Índice do histórico para a área do usuário (sem gate admin).
export default function IndicePage() {
  const [ev, setEv] = useState<Evolucao | null>(null)
  const [snapsNovos, setSnapsNovos] = useState<{ id: number; data: string }[]>([])

  useEffect(() => {
    getEvolucao().then(setEv)
    getSnapshotsNovos().then(setSnapsNovos)
  }, [])

  if (!ev) return <main className="max-w-6xl mx-auto px-6 py-10 text-sm text-dim">Carregando…</main>
  return <main className="min-h-screen"><IndicePainel ev={ev} snapsNovos={snapsNovos} /></main>
}
