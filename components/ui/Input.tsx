import type { InputHTMLAttributes } from 'react'

// mt-1 mantido do padrão V0 (label em cima, campo embaixo) — todos os formulários dependem dele
export const inputBase =
  'w-full bg-surface border border-border-2 rounded-[var(--r-sm)] px-3 py-2 text-sm text-ink mt-1 transition ' +
  'placeholder:text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15'

export default function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputBase} ${className}`} {...props} />
}
