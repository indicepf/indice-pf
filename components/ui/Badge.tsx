import type { HTMLAttributes } from 'react'

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'danger'

// pill do mockup (formato do .premium-tag): raio 99px, caixa alta, peso forte
const tones: Record<BadgeTone, string> = {
  neutral: 'text-dim bg-surface-3',
  ok: 'text-ok bg-ok/10',
  warn: 'text-warn bg-warn/10',
  danger: 'text-danger bg-danger/10',
}

type Props = HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }

export default function Badge({ tone = 'neutral', className = '', ...props }: Props) {
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-[0.04em] rounded-full px-2 py-0.5 ${tones[tone]} ${className}`}
      {...props}
    />
  )
}
