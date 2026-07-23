// Regressão linear múltipla (OLS) em TS puro. Estima β via equações normais
// (X'X)⁻¹X'y e devolve erros-padrão, t, p-valor (t de Student), R², R² ajustado,
// F e resíduos. Sem dependências — segue o estilo de lib/stats.ts.

export type CoefRegressao = {
  nome: string
  coef: number
  erroPadrao: number
  t: number
  p: number
}

export type ResultadoRegressao = {
  coeficientes: CoefRegressao[]   // [intercepto, ...preditores]
  r2: number
  r2Ajustado: number
  f: number
  fP: number
  n: number
  gl: number                       // graus de liberdade dos resíduos (n − p)
  observado: number[]
  previsto: number[]
  residuos: number[]
}

// ── álgebra linear (matrizes pequenas) ──────────────────────────────────────
function inverter(m: number[][]): number[][] | null {
  const n = m.length
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r
    if (Math.abs(a[piv][col]) < 1e-12) return null   // singular (colinearidade)
    ;[a[col], a[piv]] = [a[piv], a[col]]
    const d = a[col][col]
    for (let j = 0; j < 2 * n; j++) a[col][j] /= d
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = a[r][col]
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[col][j]
    }
  }
  return a.map(row => row.slice(n))
}

const matVec = (m: number[][], v: number[]) => m.map(row => row.reduce((s, x, j) => s + x * v[j], 0))

// ── distribuições (p-valores) ───────────────────────────────────────────────
// Beta incompleta regularizada (Numerical Recipes) para a CDF da t de Student.
function betacf(a: number, b: number, x: number): number {
  const FPMIN = 1e-30
  let qab = a + b, qap = a + 1, qam = a - 1
  let c = 1, d = 1 - (qab * x) / qap
  if (Math.abs(d) < FPMIN) d = FPMIN
  d = 1 / d
  let h = d
  for (let mIt = 1; mIt <= 200; mIt++) {
    const m2 = 2 * mIt
    let aa = (mIt * (b - mIt) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d; h *= d * c
    aa = (-(a + mIt) * (qab + mIt) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const del = d * c; h *= del
    if (Math.abs(del - 1) < 3e-7) break
  }
  return h
}

function lnGamma(z: number): number {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let x = z, y = z, tmp = x + 5.5
  tmp -= (x + 0.5) * Math.log(tmp)
  let ser = 1.000000000190015
  for (let j = 0; j < 6; j++) { y++; ser += g[j] / y }
  return -tmp + Math.log((2.5066282746310005 * ser) / x)
}

function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b
}

// p-valor bicaudal da t de Student com gl graus de liberdade.
function pValorT(t: number, gl: number): number {
  if (gl <= 0) return NaN
  return betai(gl / 2, 0.5, gl / (gl + t * t))
}

// p-valor da F (cauda superior) com gl1, gl2.
function pValorF(f: number, gl1: number, gl2: number): number {
  if (f <= 0 || gl1 <= 0 || gl2 <= 0) return NaN
  return betai(gl2 / 2, gl1 / 2, gl2 / (gl2 + gl1 * f))
}

// ── OLS ─────────────────────────────────────────────────────────────────────
// y: variável resposta (n). xs: preditores como colunas ([{nome, valores}]).
// Adiciona intercepto automaticamente.
export function regressaoLinear(
  y: number[],
  xs: { nome: string; valores: number[] }[],
): ResultadoRegressao | { erro: string } {
  const n = y.length
  const k = xs.length
  const p = k + 1   // + intercepto
  if (n < p + 1) return { erro: `Poucas observações: ${n} coletas para ${k} preditor(es). Precisa de pelo menos ${p + 1}.` }
  for (const x of xs) if (x.valores.length !== n) return { erro: `Preditor "${x.nome}" com tamanho diferente de y.` }

  // X (n×p): coluna 1 = intercepto
  const X = y.map((_, i) => [1, ...xs.map(x => x.valores[i])])
  // X'X (p×p) e X'y (p)
  const XtX = Array.from({ length: p }, (_, a) => Array.from({ length: p }, (_, b) =>
    X.reduce((s, row) => s + row[a] * row[b], 0)))
  const Xty = Array.from({ length: p }, (_, a) => X.reduce((s, row, i) => s + row[a] * y[i], 0))

  const inv = inverter(XtX)
  if (!inv) return { erro: 'Matriz singular — preditores colineares ou constantes. Remova variáveis redundantes.' }

  const beta = matVec(inv, Xty)
  const previsto = X.map(row => row.reduce((s, x, j) => s + x * beta[j], 0))
  const residuos = y.map((yi, i) => yi - previsto[i])
  const rss = residuos.reduce((s, e) => s + e * e, 0)
  const yMean = y.reduce((s, v) => s + v, 0) / n
  const tss = y.reduce((s, v) => s + (v - yMean) ** 2, 0)
  const gl = n - p
  const sigma2 = rss / gl
  const r2 = tss > 0 ? 1 - rss / tss : 0
  const r2Ajustado = tss > 0 ? 1 - (1 - r2) * (n - 1) / gl : 0
  const f = k > 0 && rss > 0 ? ((tss - rss) / k) / (rss / gl) : NaN
  const fP = isNaN(f) ? NaN : pValorF(f, k, gl)

  const nomes = ['(intercepto)', ...xs.map(x => x.nome)]
  const coeficientes: CoefRegressao[] = beta.map((b, j) => {
    const se = Math.sqrt(Math.max(sigma2 * inv[j][j], 0))
    const t = se > 0 ? b / se : NaN
    return { nome: nomes[j], coef: b, erroPadrao: se, t, p: pValorT(t, gl) }
  })

  return { coeficientes, r2, r2Ajustado, f, fP, n, gl, observado: y, previsto, residuos }
}
