// marca do mockup (brand-mark): quadrado com gradiente + infinito branco + nome
// símbolo #inf do docs/indice-pf-ads2.html
export const INF_PATH =
  'M28 8C15 8 6 16 6 25s9 17 22 17c9 0 15-5 22-13 7 8 13 13 22 13 13 0 22-8 22-17S85 8 72 8c-9 0-15 5-22 13C43 13 37 8 28 8zm0 9c4 0 8 3 13 8-5 5-9 8-13 8-6 0-10-3-10-8s4-8 10-8zm44 0c6 0 10 3 10 8s-4 8-10 8c-4 0-8-3-13-8 5-5 9-8 13-8z'

export default function Logo({ compact = false, small = false, dark = false }: {
  compact?: boolean; small?: boolean; dark?: boolean
}) {
  return (
    <span className="brand-mark">
      <span className={`inf-logo${small ? ' sm' : ''}`}>
        <svg viewBox="0 0 100 50" aria-hidden="true"><path fill="#fff" d={INF_PATH} /></svg>
      </span>
      {!compact && (
        <span className="brand-name" style={dark ? { color: '#fff' } : undefined}>
          Índice PF
          <small style={dark ? { color: 'rgba(255,255,255,.5)' } : undefined}>by Infinity</small>
        </span>
      )}
    </span>
  )
}
