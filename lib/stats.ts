// estatística compartilhada (antes duplicada em app/page.tsx e app/evolucao/page.tsx)
export function mediana(v: number[]): number {
  if (!v.length) return 0
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function media(v: number[]): number {
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0
}

// Desvio absoluto mediano: mediana(|x - mediana(v)|). Dispersão robusta a
// outliers, na mesma unidade de v (não precisa de correção de normalidade
// para o uso aqui: comparação relativa entre séries, não teste formal).
export function mad(v: number[]): number {
  if (!v.length) return 0
  const m = mediana(v)
  return mediana(v.map(x => Math.abs(x - m)))
}

// Quartis de Tukey (hinges): mediana da metade inferior/superior, excluindo o
// próprio valor central em N ímpar. Mesma convenção simples de `mediana`
// acima (sem interpolação) — reprodutível e fácil de auditar à mão.
export function iqr(v: number[]): { q1: number; q3: number; iqr: number } {
  if (v.length < 2) { const only = v[0] ?? 0; return { q1: only, q3: only, iqr: 0 } }
  const s = [...v].sort((a, b) => a - b)
  const meio = Math.floor(s.length / 2)
  const inferior = s.slice(0, meio)
  const superior = s.length % 2 ? s.slice(meio + 1) : s.slice(meio)
  const q1 = mediana(inferior), q3 = mediana(superior)
  return { q1, q3, iqr: q3 - q1 }
}

// IC por bootstrap percentil da MEDIANA de v (não paramétrico: nenhuma
// distribuição é assumida). Resample com reposição, `iters` vezes; devolve os
// percentis [((1-pct)/2), (1-(1-pct)/2)] das medianas reamostradas. `rng` é
// injetável para teste determinístico; produção usa Math.random.
export function bootstrapMedianCI(
  v: number[], opts: { iters?: number; pct?: number; rng?: () => number } = {},
): [number, number] | null {
  const { iters = 1000, pct = 0.90, rng = Math.random } = opts
  if (v.length < 2) return null
  const medianas: number[] = []
  for (let i = 0; i < iters; i++) {
    const amostra = Array.from({ length: v.length }, () => v[Math.floor(rng() * v.length)])
    medianas.push(mediana(amostra))
  }
  medianas.sort((a, b) => a - b)
  const cauda = (1 - pct) / 2
  const lo = medianas[Math.floor(cauda * iters)]
  const hi = medianas[Math.ceil((1 - cauda) * iters) - 1]
  return [lo, hi]
}

// Reescala uma série para caber no mesmo eixo que séries de outra unidade.
// 'base100' = o primeiro valor observado vira 100 (lê-se como variação
// acumulada); 'z' = desvios-padrão amostrais em torno da média da janela.
// Devolve null quando a reescala não é definível — série de um ponto só ou
// constante em 'z', primeiro valor não-positivo em 'base100'. Nunca 0: desenhar
// 0σ diria "está na média", que é diferente de "não dá para saber".
export function escalador(vs: (number | null)[], modo: 'z' | 'base100'): (v: number | null) => number | null {
  const ok = vs.filter((v): v is number => v != null && isFinite(v))
  if (modo === 'base100') {
    const base = ok[0]
    if (base == null || base === 0) return () => null
    return v => (v == null ? null : (v / base) * 100)
  }
  if (ok.length < 2) return () => null
  const m = ok.reduce((a, b) => a + b, 0) / ok.length
  const s = Math.sqrt(ok.reduce((a, b) => a + (b - m) ** 2, 0) / (ok.length - 1))
  if (s === 0) return () => null
  return v => (v == null ? null : (v - m) / s)
}

// PRNG determinístico (mulberry32) — só para dar um `rng` reprodutível aos
// testes de bootstrapMedianCI; produção nunca importa isto.
export function mulberry32(seed: number): () => number {
  let a = seed
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
