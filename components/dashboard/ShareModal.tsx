'use client'

import { useCallback, useEffect, useState } from 'react'

// Modal de compartilhar no formato do mockup (openShare): abas
// "Redes sociais" / "E-mail (completo)" com preview do card e legenda copiável.
export default function ShareModal({ contexto, onClose }: { contexto?: string; onClose: () => void }) {
  const [tab, setTab] = useState<'social' | 'email'>('social')
  const [msg, setMsg] = useState('')
  const url = typeof window !== 'undefined' ? window.location.href : ''

  const esc = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }, [onClose])
  useEffect(() => { document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc) }, [esc])

  const rotulo = contexto ?? 'o custo do prato feito no Brasil'
  const legendaSocial = `Índice PF — ${rotulo}. Comida de verdade, dados de verdade. ${url}`
  const legendaEmail = `Assunto: Índice PF — ${rotulo}\n\nSegue o resumo do Índice PF da última coleta, com o link para o painel completo: ${url}\n\nDados coletados no varejo online e em campo, com margem de erro de ±5%.`
  const legenda = tab === 'social' ? legendaSocial : legendaEmail

  async function copiar() {
    await navigator.clipboard.writeText(legenda)
    setMsg('Legenda copiada.')
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal-mk" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Compartilhar</h2>
            <p>{rotulo}</p>
          </div>
          <div className="modal-x" onClick={onClose}>×</div>
        </div>
        <div className="modal-body">
          <div className="share-tabs">
            <button className={tab === 'social' ? 'on' : ''} onClick={() => setTab('social')}>Redes sociais</button>
            <button className={tab === 'email' ? 'on' : ''} onClick={() => setTab('email')}>E-mail (completo)</button>
          </div>
          <div className="share-prev">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/api/card" alt="Card do Índice PF" />
          </div>
          <div style={{ marginTop: 12, padding: 12, background: 'var(--surface-2)', borderRadius: 10, fontSize: 13, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>
            {legenda}
          </div>
          <div className="share-actions">
            <a className="btn-mk primary" style={{ flex: 1, justifyContent: 'center' }} href="/api/card" download="indice-pf.png">
              Baixar imagem
            </a>
            <button className="btn-mk" onClick={copiar}>Copiar legenda</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'center' }}>
            <a className="btn-mk sm" target="_blank" rel="noopener noreferrer"
              href={`https://wa.me/?text=${encodeURIComponent(legendaSocial)}`}>WhatsApp</a>
            <a className="btn-mk sm" target="_blank" rel="noopener noreferrer"
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(legendaSocial)}`}>X</a>
            <a className="btn-mk sm" target="_blank" rel="noopener noreferrer"
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}>LinkedIn</a>
          </div>
          {msg && <p className="text-xs text-ok mt-2 text-center">{msg}</p>}
        </div>
      </div>
    </div>
  )
}
