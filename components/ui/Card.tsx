import type { HTMLAttributes } from 'react'

// painel do mockup (.panel): raio r-lg + sombra xs, como os cards da home
export default function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-surface border border-border rounded-[var(--r-lg)] shadow-[var(--shadow-xs)] ${className}`}
      {...props}
    />
  )
}
