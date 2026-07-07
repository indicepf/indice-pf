import type { HTMLAttributes } from 'react'

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'danger'

const tones: Record<BadgeTone, string> = {
  neutral: 'text-dim border-border',
  ok: 'text-ok border-ok/30 bg-ok/5',
  warn: 'text-warn border-warn/30 bg-warn/5',
  danger: 'text-danger border-danger/30 bg-danger/5',
}

type Props = HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }

export default function Badge({ tone = 'neutral', className = '', ...props }: Props) {
  return (
    <span
      className={`text-[0.65rem] uppercase tracking-wide border rounded px-1.5 py-0.5 ${tones[tone]} ${className}`}
      {...props}
    />
  )
}
