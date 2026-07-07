// estatística compartilhada (antes duplicada em app/page.tsx e app/evolucao/page.tsx)
export function mediana(v: number[]): number {
  if (!v.length) return 0
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
