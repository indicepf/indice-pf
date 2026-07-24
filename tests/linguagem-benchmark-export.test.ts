// Testes da Subfase 0C: gate prudencial da regressão, classificação do
// benchmark com nMin e golden da exportação da reconstrução (o método por
// ingrediente nunca é atribuído ao deflator DIEESE).
import { describe, it, expect } from 'vitest'
import { regressaoLinear } from '@/lib/regressao'
import { classificarBenchmark, N_MIN_BENCHMARK } from '@/lib/benchmark'
import { abasReconstrucao } from '@/lib/export-reconstrucao'

describe('gate prudencial da regressão', () => {
  it('bloqueia amostra abaixo de max(30, 10×parâmetros)', () => {
    const y = Array.from({ length: 23 }, (_, i) => i + 1)
    const r = regressaoLinear(y, [{ nome: 'x', valores: y.map(v => v * 2) }])
    expect('erro' in r).toBe(true)
    if ('erro' in r) expect(r.erro).toContain('mínimo prudencial é 30')
  })

  it('com 3 preditores o mínimo sobe para 40', () => {
    const n = 35
    const y = Array.from({ length: n }, (_, i) => i + 1)
    const xs = [1, 2, 3].map(k => ({ nome: `x${k}`, valores: y.map(v => v * k + (k % 2 ? 0.1 : -0.1) * (v % 5)) }))
    const r = regressaoLinear(y, xs)
    expect('erro' in r).toBe(true)
    if ('erro' in r) expect(r.erro).toContain('mínimo prudencial é 40')
  })

  it('com amostra suficiente ajusta y = 2x + 1 exatamente', () => {
    const x = Array.from({ length: 40 }, (_, i) => i + 1)
    const y = x.map(v => 2 * v + 1)
    const r = regressaoLinear(y, [{ nome: 'x', valores: x }])
    expect('erro' in r).toBe(false)
    if (!('erro' in r)) {
      expect(r.coeficientes[0].coef).toBeCloseTo(1, 6)
      expect(r.coeficientes[1].coef).toBeCloseTo(2, 6)
      expect(r.r2).toBeCloseTo(1, 9)
    }
  })
})

describe('classificação do benchmark (nMin=6)', () => {
  it('não classifica nenhum N de 0 a nMin-1, mesmo com razão perfeita', () => {
    for (let n = 0; n < N_MIN_BENCHMARK; n++)
      expect(classificarBenchmark(1.0, n, 'direta')).toBe('sem_classificacao')
  })
  it('não classifica item de comparação aproximada, mesmo com N alto', () => {
    expect(classificarBenchmark(1.0, 100, 'aproximada')).toBe('sem_classificacao')
  })
  it('não classifica razão ausente', () => {
    expect(classificarBenchmark(null, 100, 'direta')).toBe('sem_classificacao')
  })
  it('classifica com N >= nMin e comparação direta', () => {
    expect(classificarBenchmark(1.0, N_MIN_BENCHMARK, 'direta')).toBe('ok')
    expect(classificarBenchmark(0.85, N_MIN_BENCHMARK, 'direta')).toBe('ok')
    expect(classificarBenchmark(1.3, N_MIN_BENCHMARK, 'direta')).toBe('divergente')
    expect(classificarBenchmark(0.5, 12, 'direta')).toBe('divergente')
  })
})

describe('golden da exportação da reconstrução', () => {
  const serie = [
    { ym: '2026-06', estimado: 14.1, real: null },
    { ym: '2026-07', estimado: null, real: 14.64 },
  ]

  it('método por ingrediente nunca atribui deflator DIEESE', () => {
    const abas = abasReconstrucao({
      serie, metodo: 'ingrediente', deflatorLabel: null,
      ancoraYm: '2026-07', desde: '2024-01', efetivo: '2024-01',
      confianca: 'alta,media', coberturaPct: 89.7,
    })
    const meta = Object.fromEntries(abas[1].linhas.map(l => [l.Campo, l.Valor]))
    expect(meta.method).toBe('ipca_by_ingredient')
    expect(String(meta.deflator)).not.toMatch(/dieese/i)
    expect(meta.ancora).toBe('2026-07')
    expect(meta.periodoPedido).toBe('2024-01')
    expect(meta.periodoEfetivo).toBe('2024-01')
    expect(meta.coverageStatus).toBe('legacy_noncanonical')
    expect(meta.basketVersion).toBeNull()
    expect(meta.recipeVersion).toBeNull()
    expect(meta.mapaIngredientesHash).toBeTruthy()
  })

  it('método agregado exporta o deflator real', () => {
    const abas = abasReconstrucao({
      serie, metodo: 'dieese_cesta', deflatorLabel: 'Cesta básica DIEESE (R$)',
      ancoraYm: '2026-06', desde: '1994-07', efetivo: '1994-07',
      confianca: null, coberturaPct: null,
    })
    const meta = Object.fromEntries(abas[1].linhas.map(l => [l.Campo, l.Valor]))
    expect(meta.method).toBe('aggregate_dieese_cesta')
    expect(meta.deflator).toBe('Cesta básica DIEESE (R$)')
    expect(meta.confiancaMapeamento).toBeNull()
  })

  it('nenhuma linha da série tem estimado e medido ao mesmo tempo', () => {
    const abas = abasReconstrucao({
      serie, metodo: 'ingrediente', deflatorLabel: null,
      ancoraYm: '2026-07', desde: '2024-01', efetivo: '2024-01',
      confianca: 'alta', coberturaPct: 80,
    })
    for (const l of abas[0].linhas) expect(l.Estimado != null && l.Medido != null).toBe(false)
  })
})
