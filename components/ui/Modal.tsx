'use client'

import { useCallback, useEffect } from 'react'

// modal central do mockup (.modal-back/.modal-mk): raio r-xl, blur e animação pop
export default function Modal({ title, onClose, children }: {
  title?: string; onClose: () => void; children: React.ReactNode
}) {
  const esc = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }, [onClose])
  useEffect(() => { document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc) }, [esc])
  return (
    <div className="modal-back z-[100]" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="modal-mk p-6 relative">
        <button onClick={onClose} className="modal-x absolute top-3 right-3">×</button>
        {title && <h3 className="text-lg font-bold tracking-tight mb-3 pr-6">{title}</h3>}
        {children}
      </div>
    </div>
  )
}
