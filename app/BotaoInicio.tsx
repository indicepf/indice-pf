import Link from 'next/link'

// visual "chip" dos botões secundários (navegação e ações de apoio) —
// borda --line, texto muted, cantos redondos e anel de foco paprika
export const chip = 'inline-flex items-center gap-1.5 text-sm text-muted border border-line rounded-full px-3 py-1.5 hover:text-ink hover:bg-white/60 transition focus-visible:outline-2 focus-visible:outline-paprika focus-visible:outline-offset-2'

// botão padrão de volta ao índice, usado nos cabeçalhos internos e telas de estado
export default function BotaoInicio({ className = '' }: { className?: string }) {
  return (
    <Link href="/" className={`${chip} ${className}`}>
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 3 L5 8 L10 13" />
      </svg>
      Início
    </Link>
  )
}
