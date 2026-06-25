'use client'

import { useEffect } from 'react'

// registra o service worker (habilita "instalar app" e cache de shell)
export default function RegistrarSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* sem PWA, segue normal */ })
    }
  }, [])
  return null
}
