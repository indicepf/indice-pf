'use client'

// Ícone ⓘ com tooltip no hover (e no foco, p/ teclado). pos ajusta o alinhamento
// do balão para não estourar as bordas (ex.: colunas à direita usam pos="right").
export default function InfoTip({ texto, w = 'w-60', pos = 'center' }: { texto: string; w?: string; pos?: 'left' | 'center' | 'right' }) {
  const posCls = pos === 'right' ? 'right-0' : pos === 'left' ? 'left-0' : 'left-1/2 -translate-x-1/2'
  return (
    <span className="relative inline-flex group align-middle ml-1">
      <span tabIndex={0}
        className="inline-grid place-items-center w-4 h-4 rounded-full border border-line text-[0.62rem] text-muted cursor-help leading-none focus:outline-none focus:border-paprika">i</span>
      <span role="tooltip"
        className={`pointer-events-none absolute ${posCls} bottom-full mb-1.5 ${w} whitespace-normal break-words bg-ink text-cream text-[0.72rem] leading-snug rounded-md px-2.5 py-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-50 shadow-lg font-[family-name:var(--font-sans)] normal-case tracking-normal`}>
        {texto}
      </span>
    </span>
  )
}
