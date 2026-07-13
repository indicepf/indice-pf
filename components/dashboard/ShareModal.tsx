'use client'

import { useState } from 'react'
import { useDialogo } from '@/components/ui/useDialogo'

// Modal de compartilhar: copiar o link + WhatsApp + e-mail. O link carrega o
// estado exato (deep-link) da tela que o usuário está vendo.
export default function ShareModal({ contexto, onClose }: { contexto?: string; onClose: () => void }) {
  const [msg, setMsg] = useState('')
  const ref = useDialogo<HTMLDivElement>(onClose)
  const url = typeof window !== 'undefined' ? window.location.href : ''
  const rotulo = contexto ?? 'o custo do prato feito no Brasil'
  const texto = `Índice PF — ${rotulo}. Comida de verdade, dados de verdade. ${url}`
  const assunto = `Índice PF — ${rotulo}`

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(url)
      setMsg('Link copiado.')
    } catch {
      setMsg('Não foi possível copiar — selecione o link abaixo.')
    }
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div ref={ref} onClick={e => e.stopPropagation()} className="modal-mk"
        role="dialog" aria-modal="true" aria-label="Compartilhar">
        <div className="modal-head">
          <div>
            <h2>Compartilhar</h2>
            <p>{rotulo}</p>
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Fechar"><span aria-hidden="true">×</span></button>
        </div>
        <div className="modal-body">
          <p className="text-xs text-dim break-all border border-border rounded-[var(--r-sm)] bg-surface-2 px-3 py-2.5">{url}</p>
          <div className="flex flex-col gap-2 mt-3">
            <button className="btn-mk primary justify-center" onClick={copiarLink}>Copiar link</button>
            <a className="btn-mk justify-center" target="_blank" rel="noopener noreferrer"
              href={`https://wa.me/?text=${encodeURIComponent(texto)}`}>Compartilhar no WhatsApp</a>
            <a className="btn-mk justify-center"
              href={`mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(texto)}`}>Enviar por e-mail</a>
          </div>
          {msg && <p className="text-xs text-ok mt-2 text-center">{msg}</p>}
        </div>
      </div>
    </div>
  )
}
