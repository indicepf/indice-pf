import type { InputHTMLAttributes } from 'react'

// campo do mockup (.f-search): fundo surface-2, borda 1.5px, foco azul.
// mt-1 mantido do padrão V0 (label em cima, campo embaixo) — os formulários dependem dele
export const inputBase =
  'w-full bg-surface-2 border-[1.5px] border-border rounded-[var(--r-sm)] px-3 py-2 text-[13px] text-ink mt-1 transition ' +
  'placeholder:text-faint focus:outline-none focus:border-brand-azul focus:bg-surface'

export default function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputBase} ${className}`} {...props} />
}
