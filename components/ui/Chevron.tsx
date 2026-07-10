// Chevron de navegação (substitui as setas "←"/"→" de texto). Herda a cor do
// link via currentColor; com a classe `group` no pai, desliza 2px no hover.
export default function ChevronVoltar({ dir = 'esq', className = '' }: {
  dir?: 'esq' | 'dir'; className?: string
}) {
  const esq = dir === 'esq'
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"
      className={`inline-block align-[-1.5px] transition-transform ${
        esq ? 'mr-0.5 group-hover:-translate-x-0.5' : 'ml-0.5 group-hover:translate-x-0.5'
      } ${className}`}>
      <path d={esq ? 'M10 3 L5 8 L10 13' : 'M6 3 L11 8 L6 13'} stroke="currentColor"
        strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
