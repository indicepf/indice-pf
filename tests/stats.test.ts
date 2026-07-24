// Testes dos helpers estatísticos usados no protocolo de benchmark (Fase 3,
// LAB-019): media, mad, iqr e IC por bootstrap da mediana.
import { describe, it, expect } from 'vitest'
import { media, mad, iqr, bootstrapMedianCI, mulberry32, mediana } from '@/lib/stats'

describe('media', () => {
  it('média aritmética simples', () => { expect(media([1, 2, 3, 4])).toBe(2.5) })
  it('array vazio retorna 0', () => { expect(media([])).toBe(0) })
})

describe('mad', () => {
  it('desvio absoluto mediano de uma amostra conhecida', () => {
    // mediana([1,1,2,2,4,6,9])=2; |x-2|=[1,1,0,0,2,4,7]; mediana=1
    expect(mad([1, 1, 2, 2, 4, 6, 9])).toBe(1)
  })
  it('série constante tem mad zero', () => { expect(mad([5, 5, 5])).toBe(0) })
  it('array vazio retorna 0', () => { expect(mad([])).toBe(0) })
})

describe('iqr', () => {
  it('quartis de Tukey (hinges) em amostra ímpar', () => {
    // [1,2,3,4,5,6,7]: mediana=4, inferior=[1,2,3] q1=2, superior=[5,6,7] q3=6
    expect(iqr([1, 2, 3, 4, 5, 6, 7])).toEqual({ q1: 2, q3: 6, iqr: 4 })
  })
  it('amostra par', () => {
    // [1,2,3,4,5,6]: inferior=[1,2,3] q1=2, superior=[4,5,6] q3=5
    expect(iqr([1, 2, 3, 4, 5, 6])).toEqual({ q1: 2, q3: 5, iqr: 3 })
  })
  it('menos de 2 pontos: iqr zero, sem lançar', () => {
    expect(iqr([5])).toEqual({ q1: 5, q3: 5, iqr: 0 })
    expect(iqr([])).toEqual({ q1: 0, q3: 0, iqr: 0 })
  })
})

describe('bootstrapMedianCI', () => {
  it('determinístico com rng seedado: bounds em torno da mediana real', () => {
    const v = [0.9, 0.95, 1.0, 1.0, 1.05, 1.1, 0.98, 1.02]
    const [lo, hi] = bootstrapMedianCI(v, { iters: 2000, pct: 0.9, rng: mulberry32(42) })!
    expect(lo).toBeLessThanOrEqual(mediana(v))
    expect(hi).toBeGreaterThanOrEqual(mediana(v))
    expect(lo).toBeLessThanOrEqual(hi)
  })
  it('mesma seed produz o mesmo intervalo (reprodutibilidade)', () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8]
    const a = bootstrapMedianCI(v, { iters: 500, rng: mulberry32(7) })
    const b = bootstrapMedianCI(v, { iters: 500, rng: mulberry32(7) })
    expect(a).toEqual(b)
  })
  it('série constante: intervalo degenerado no próprio valor', () => {
    const [lo, hi] = bootstrapMedianCI([3, 3, 3, 3], { iters: 200, rng: mulberry32(1) })!
    expect(lo).toBe(3); expect(hi).toBe(3)
  })
  it('menos de 2 pontos retorna null (amostra insuficiente para reamostrar)', () => {
    expect(bootstrapMedianCI([1])).toBeNull()
    expect(bootstrapMedianCI([])).toBeNull()
  })
})
