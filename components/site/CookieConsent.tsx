'use client'

import { useEffect, useState } from 'react'
import { GoogleTagManager } from '@next/third-parties/google'

// Consentimento de cookies (LGPD): o GTM/GA4 só carrega depois de o visitante
// ACEITAR — sem escolha ou com recusa, nenhum cookie de métrica é criado.
// A escolha fica em localStorage; "Preferências de cookies" no footer reabre
// o banner (evento 'abrir-cookies').
const CHAVE = 'consent-analytics'

export default function CookieConsent({ gtmId }: { gtmId?: string }) {
  const [escolha, setEscolha] = useState<'1' | '0' | null>('0')   // oculto até ler o storage

  useEffect(() => {
    try { setEscolha(localStorage.getItem(CHAVE) as '1' | '0' | null) } catch { setEscolha('0') }
    const reabrir = () => setEscolha(null)
    window.addEventListener('abrir-cookies', reabrir)
    return () => window.removeEventListener('abrir-cookies', reabrir)
  }, [])

  function decidir(v: '1' | '0') {
    try { localStorage.setItem(CHAVE, v) } catch { /* sessão privada */ }
    setEscolha(v)
  }

  if (!gtmId) return null
  return (
    <>
      {escolha === '1' && <GoogleTagManager gtmId={gtmId} />}
      {escolha === null && (
        <div role="dialog" aria-label="Consentimento de cookies"
          className="fixed bottom-0 inset-x-0 z-[95] border-t border-border bg-surface shadow-[var(--shadow-lg)] px-5 py-4">
          <div className="max-w-4xl mx-auto flex flex-wrap items-center gap-3">
            <p className="text-sm text-ink-2 leading-relaxed flex-1 min-w-[240px]">
              Usamos cookies para melhorar sua experiência e entender como o site é utilizado.
              Você pode aceitar ou recusar.
            </p>
            <div className="flex gap-2 shrink-0">
              <button className="btn-mk sm" onClick={() => decidir('0')}>Recusar</button>
              <button className="btn-mk sm primary" onClick={() => decidir('1')}>Aceitar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
