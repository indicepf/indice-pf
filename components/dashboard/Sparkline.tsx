// mini-gráfico de linha (SVG puro) para tabelas e movers
export default function Sparkline({ valores, cor, w = 72, h = 22 }: {
  valores: (number | null)[]; cor: string; w?: number; h?: number
}) {
  const v = valores.filter((x): x is number => x != null)
  if (v.length < 2) return null
  const min = Math.min(...v), max = Math.max(...v)
  const span = max - min || 1
  const pts = v.map((x, i) => {
    const px = (i / (v.length - 1)) * (w - 4) + 2
    const py = h - 3 - ((x - min) / span) * (h - 6)
    return `${px.toFixed(1)},${py.toFixed(1)}`
  })
  return (
    <svg width={w} height={h} aria-hidden="true" className="inline-block align-middle">
      <polyline points={pts.join(' ')} fill="none" stroke={cor} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
      {v.length <= 6 && pts.map((p, i) => {
        const [cx, cy] = p.split(',')
        return <circle key={i} cx={cx} cy={cy} r="1.8" fill={cor} />
      })}
    </svg>
  )
}
