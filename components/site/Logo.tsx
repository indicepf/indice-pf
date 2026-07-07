// símbolo de infinito com o gradiente da marca (mockup docs/indice-pf-ads2.html)
export default function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="grad-marca" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8D4CB2" />
            <stop offset="0.22" stopColor="#6954BD" />
            <stop offset="0.46" stopColor="#0069D4" />
            <stop offset="0.7" stopColor="#00A7E2" />
            <stop offset="1" stopColor="#20C58C" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="url(#grad-marca)" />
        <path d="M9.5 16c0-1.9 1.5-3.4 3.4-3.4 2.9 0 3.3 6.8 6.2 6.8 1.9 0 3.4-1.5 3.4-3.4s-1.5-3.4-3.4-3.4c-2.9 0-3.3 6.8-6.2 6.8-1.9 0-3.4-1.5-3.4-3.4z"
          fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" />
      </svg>
      {!compact && (
        <span className="leading-none">
          <span className="block text-lg font-bold tracking-tight">Índice PF</span>
          <span className="block text-[0.6rem] uppercase tracking-[0.14em] text-dim">by Infinity</span>
        </span>
      )}
    </span>
  )
}
