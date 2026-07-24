// Testes de /api/confiabilidade: protocolo de benchmark (Fase 3, LAB-019).
// Os diagnósticos (viés, MAE, MAPE, MAD/IQR, IC por bootstrap) são aditivos —
// não mudam razaoMediana nem o semáforo (lib/benchmark.ts, nMin=6), só
// acrescentam transparência sobre dispersão e magnitude do erro.
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

type Linha = Record<string, unknown>
const tabelas = vi.hoisted(() => ({ dados: {} as Record<string, Linha[]> }))

vi.mock('@/lib/server/supabase-admin', () => {
  function from(tabela: string) {
    let rows = [...(tabelas.dados[tabela] ?? [])]
    const b: Record<string, unknown> = {
      select: () => b,
      not: (c: string) => { rows = rows.filter(r => r[c] != null); return b },
      in: (c: string, vs: unknown[]) => { rows = rows.filter(r => vs.includes(r[c])); return b },
      gte: (c: string, v: string) => { rows = rows.filter(r => String(r[c]) >= v); return b },
      order: (c: string, o?: { ascending?: boolean }) => {
        rows.sort((a, z) => (a[c]! < z[c]! ? -1 : a[c]! > z[c]! ? 1 : 0) * (o?.ascending === false ? -1 : 1))
        return b
      },
      range: async (i: number, f: number) => ({ data: rows.slice(i, f + 1), error: null }),
    }
    return b
  }
  return { usuarioDoToken: async () => ({ id: 'u1' }), supabaseAdmin: () => ({ from }) }
})

vi.mock('@/lib/server/autorizar', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/autorizar')>('@/lib/server/autorizar')
  return { ...actual, exigirAdmin: async () => ({ user: { id: 'u1' } }) }
})

vi.mock('@/lib/mapa-ingredientes', () => ({
  MAPA_INGREDIENTE_DIEESE: [
    { id: 1, nome: 'Arroz', serie: 'dieese_arroz', comparabilidade: 'direta' },
    { id: 2, nome: 'Item raro', serie: 'dieese_raro', comparabilidade: 'direta' },
  ],
}))

import { GET } from '@/app/api/confiabilidade/route'

function req() {
  return new NextRequest('http://localhost/api/confiabilidade', { headers: { authorization: 'Bearer t' } })
}

describe('/api/confiabilidade — diagnósticos do protocolo de benchmark', () => {
  it('N=0 (sem par comparável): diagnosticos é null, sem lançar', async () => {
    tabelas.dados = {
      snapshots: [{ id: 1, data: '2026-06-01' }],
      precos: [],
      fatores_preditores: [],
    }
    const res = await GET(req())
    expect(res.status).toBe(200)
    const j = await res.json()
    const item = j.itens.find((i: { id: number }) => i.id === 2)
    expect(item.nMeses).toBe(0)
    expect(item.diagnosticos).toBeNull()
  })

  it('N>0 calcula viés/MAE/MAPE/MAD/IQR; sem bootstrap abaixo de N=8', async () => {
    // arroz: 6 meses, nosso sempre 10% acima do DIEESE (razão constante 1.10)
    const meses = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01']
    tabelas.dados = {
      snapshots: meses.map((data, i) => ({ id: i + 1, data })),
      precos: meses.map((_, i) => ({ snapshot_id: i + 1, ingrediente_id: 1, mediana_exibicao: 11, label: 'kg' })),
      fatores_preditores: meses.map(data => ({ serie: 'dieese_arroz', data, valor: 10 })),
    }
    const res = await GET(req())
    const j = await res.json()
    const item = j.itens.find((i: { id: number }) => i.id === 1)
    expect(item.nMeses).toBe(6)
    expect(item.razaoMediana).toBeCloseTo(1.1, 3)
    expect(item.diagnosticos.viesPct).toBeCloseTo(10, 1)         // 10% de viés
    expect(item.diagnosticos.maeReais).toBeCloseTo(1, 2)         // |11-10| todo mês
    expect(item.diagnosticos.mapePct).toBeCloseTo(10, 1)         // 1/10 = 10%
    expect(item.diagnosticos.madRazao).toBe(0)                    // razão constante: dispersão zero
    expect(item.diagnosticos.iqrRazao).toEqual({ q1: 1.1, q3: 1.1, iqr: 0 })
    expect(item.diagnosticos.bootstrapIC90Razao).toBeNull()       // N=6 < N_MIN_BOOTSTRAP=8
  })

  it('N>=8 calcula IC por bootstrap contendo a mediana observada', async () => {
    const meses = Array.from({ length: 8 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}-01`)
    const nossos = [9, 10, 11, 10, 12, 9, 10, 11]   // razão varia em torno de ~1.0
    tabelas.dados = {
      snapshots: meses.map((data, i) => ({ id: i + 1, data })),
      precos: meses.map((_, i) => ({ snapshot_id: i + 1, ingrediente_id: 1, mediana_exibicao: nossos[i], label: 'kg' })),
      fatores_preditores: meses.map(data => ({ serie: 'dieese_arroz', data, valor: 10 })),
    }
    const res = await GET(req())
    const j = await res.json()
    const item = j.itens.find((i: { id: number }) => i.id === 1)
    expect(item.nMeses).toBe(8)
    const ic = item.diagnosticos.bootstrapIC90Razao
    expect(ic).not.toBeNull()
    expect(ic[0]).toBeLessThanOrEqual(item.razaoMediana)
    expect(ic[1]).toBeGreaterThanOrEqual(item.razaoMediana)
  })
})
