import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const base =
  'inline-flex items-center justify-center gap-1.5 rounded-[var(--r-sm)] px-4 py-2 text-sm font-medium transition cursor-pointer ' +
  'disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:brightness-110 shadow-[var(--shadow-xs)]',
  secondary: 'bg-surface text-ink border border-border-2 hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-3',
  danger: 'bg-danger text-white hover:brightness-110',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  full?: boolean
}

export default function Button({ variant = 'primary', full = false, className = '', ...props }: Props) {
  return <button className={`${base} ${variants[variant]} ${full ? 'w-full' : ''} ${className}`} {...props} />
}
