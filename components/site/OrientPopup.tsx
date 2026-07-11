'use client'

import { useEffect, useState } from 'react'

// Aviso de orientação do mockup — 1× por sessão, só em tela retrato estreita.
export default function OrientPopup() {
  const [aberto, setAberto] = useState(false)

  // aparece na abertura do site, 1× por sessão, só em tela estreita na vertical
  // (em desktop/horizontal o aviso não faz sentido)
  useEffect(() => {
    try {
      if (sessionStorage.getItem('orient') === '1') return
      if (!window.matchMedia('(max-width: 768px) and (orientation: portrait)').matches) return
      setAberto(true)
    } catch { /* sessão privada */ }
  }, [])

  function fechar() {
    try { sessionStorage.setItem('orient', '1') } catch { /* ok */ }
    setAberto(false)
  }

  if (!aberto) return null

  return (
    <div className="orient-back" onClick={fechar}>
      <div className="orient-card" onClick={e => e.stopPropagation()}>
        <div className="orient-ico">
          <svg viewBox="0 0 64 64" width="46" height="46" fill="none">
            <rect x="22" y="10" width="20" height="34" rx="4" stroke="#fff" strokeWidth="3" />
            <line x1="29" y1="40" x2="35" y2="40" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
            <path d="M50 24 A20 20 0 0 1 50 40" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
            <path d="M50 40 l-4 -1 M50 40 l1 -4" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
        <h3>Melhor na horizontal</h3>
        <p>Este site foi pensado para o uso em telas horizontais, devido ao número de dados e gráficos.
          Utilize seu celular na horizontal ou acesse pelo computador.</p>
        <button className="btn-mk primary" onClick={fechar}>Entendi, continuar</button>
      </div>
    </div>
  )
}
