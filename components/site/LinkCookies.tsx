'use client'

// reabre o banner de consentimento (LGPD: a escolha é revogável a qualquer momento)
export default function LinkCookies() {
  return (
    <a role="button" tabIndex={0} style={{ cursor: 'pointer' }}
      onClick={() => window.dispatchEvent(new Event('abrir-cookies'))}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.dispatchEvent(new Event('abrir-cookies')) } }}>
      Preferências de cookies
    </a>
  )
}
