'use client'

import { useState } from 'react'
import { Button, Modal } from '@/components/ui'

// Modal de compartilhamento: preview do card PNG (/api/card) + ações.
export default function ShareModal({ onClose }: { onClose: () => void }) {
  const [msg, setMsg] = useState('')
  const urlSite = typeof window !== 'undefined' ? window.location.origin : ''
  const urlCard = `${urlSite}/api/card`

  async function compartilhar() {
    setMsg('')
    try {
      // Web Share com a imagem quando suportado; senão cai para o link
      if (navigator.share) {
        try {
          const blob = await (await fetch('/api/card')).blob()
          const file = new File([blob], 'indice-pf.png', { type: 'image/png' })
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: 'Índice PF', text: 'O custo do prato feito no Brasil' })
            return
          }
        } catch { /* segue para o share de link */ }
        await navigator.share({ title: 'Índice PF', text: 'O custo do prato feito no Brasil', url: urlSite })
        return
      }
      await navigator.clipboard.writeText(urlSite)
      setMsg('Link copiado.')
    } catch { /* usuário cancelou */ }
  }

  async function copiarLink() {
    await navigator.clipboard.writeText(urlSite)
    setMsg('Link copiado.')
  }

  return (
    <Modal title="Compartilhar o índice" onClose={onClose}>
      <div className="border border-border rounded-[var(--r)] overflow-hidden bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/api/card" alt="Card do Índice PF" className="w-full h-auto" />
      </div>
      <p className="text-xs text-dim mt-2">Card gerado com o índice da última coleta.</p>
      <div className="grid grid-cols-2 gap-2 mt-4">
        <Button onClick={compartilhar}>Compartilhar</Button>
        <Button variant="secondary" onClick={copiarLink}>Copiar link</Button>
        <a href={urlCard} download="indice-pf.png"
          className="col-span-2 inline-flex items-center justify-center rounded-[var(--r-sm)] px-4 py-2 text-sm font-medium bg-surface text-ink border border-border-2 hover:bg-surface-2 transition">
          Baixar imagem
        </a>
      </div>
      {msg && <p className="text-xs text-ok mt-2 text-center">{msg}</p>}
    </Modal>
  )
}
