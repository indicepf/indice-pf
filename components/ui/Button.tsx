import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

// variantes = classes .btn-mk do design system do mockup (globals.css) —
// mesmo botão da home em todas as telas logadas/admin
const variants: Record<Variant, string> = {
  primary: 'btn-mk primary',
  secondary: 'btn-mk',
  ghost: 'btn-mk ghost',
  danger: 'btn-mk danger',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  full?: boolean
}

export default function Button({ variant = 'primary', full = false, className = '', ...props }: Props) {
  return (
    <button
      className={`${variants[variant]} justify-center disabled:opacity-60 disabled:cursor-not-allowed ${full ? 'w-full' : ''} ${className}`}
      {...props}
    />
  )
}
