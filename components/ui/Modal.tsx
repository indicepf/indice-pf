'use client'

import { useCallback, useEffect } from 'react'

export default function Modal({ title, onClose, children }: {
  title?: string; onClose: () => void; children: React.ReactNode
}) {
  const esc = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }, [onClose])
  useEffect(() => { document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc) }, [esc])
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-ink/30 px-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-surface border border-border rounded-[var(--r-lg)] p-6 max-w-md w-full max-h-[80vh] overflow-y-auto shadow-[var(--shadow-lg)] relative">
        <button onClick={onClose} className="absolute top-3 right-4 text-dim hover:text-ink text-xl leading-none cursor-pointer">×</button>
        {title && <h3 className="text-lg font-bold tracking-tight mb-3 pr-6">{title}</h3>}
        {children}
      </div>
    </div>
  )
}
