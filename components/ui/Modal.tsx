'use client'

import { useDialogo } from './useDialogo'

// modal central do mockup (.modal-back/.modal-mk): raio r-xl, blur e animação pop
export default function Modal({ title, onClose, children, wide = false }: {
  title?: string; onClose: () => void; children: React.ReactNode; wide?: boolean
}) {
  const ref = useDialogo<HTMLDivElement>(onClose)
  return (
    <div className="modal-back z-[100]" onClick={onClose}>
      <div ref={ref} onClick={e => e.stopPropagation()} className={`modal-mk${wide ? ' wide' : ''} p-6 relative`}
        role="dialog" aria-modal="true" aria-label={title}>
        <button onClick={onClose} aria-label="Fechar" className="modal-x absolute top-3 right-3"><span aria-hidden="true">×</span></button>
        {title && <h3 className="text-lg font-bold tracking-tight mb-3 pr-6">{title}</h3>}
        {children}
      </div>
    </div>
  )
}
