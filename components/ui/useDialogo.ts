'use client'

import { useEffect, useRef } from 'react'

const FOCAVEL = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

// Comportamento de diálogo acessível para os modais do app:
// - foca o primeiro elemento focável ao abrir e devolve o foco ao fechar
// - Tab/Shift+Tab circulam dentro do modal (focus trap)
// - Esc fecha
// Usar junto com role="dialog" aria-modal="true" no elemento do ref.
export function useDialogo<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    const el = ref.current
    el?.querySelector<HTMLElement>(FOCAVEL)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab' || !el) return
      const focaveis = [...el.querySelectorAll<HTMLElement>(FOCAVEL)].filter(f => f.offsetParent !== null)
      if (!focaveis.length) return
      const primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1]
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus() }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); anterior?.focus?.() }
  }, [onClose])

  return ref
}
