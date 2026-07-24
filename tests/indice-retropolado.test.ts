// Testes de contrato da Subfase 0B: /api/indice-retropolado com contrato
// discriminado (ok/incomplete), gate temporário de âncora e política explícita
// de fallback. Mês sem variação nunca vira zero; nada é produzido além do
// primeiro gap; backfill com id maior e data antiga não vira âncora.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

type Linha = Record<string, unknown>
const tabelas = vi.hoisted(() => ({ dados: {} as Record<string, Linha[]> }))

vi.mock('@/lib/server/supabase-admin', () => {
  // mini engine de consulta sobre as fixtures: aplica filtros de verdade para
  // os testes exercitarem eq/in/gte/order/limit/range como a rota usa
  function from(tabela: string) {
    let rows = [...(tabelas.dados[tabela] ?? [])]
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (c: string, v: unknown) => { rows = rows.filter(r => r[c] === v); return b },
      in: (c: string, vs: unknown[]) => { rows = rows.filter(r => vs.includes(r[c])); return b },
      gte: (c: string, v: string) => { rows = rows.filter(r => String(r[c]) >= v); return b },
      not: (c: string) => { rows = rows.filter(r => r[c] != null); return b },
      order: (c: string, o?: { ascending?: boolean }) => {
        rows.sort((a, z) => (a[c]! < z[c]! ? -1 : a[c]! > z[c]! ? 1 : 0) * (o?.ascending === false ? -1 : 1))
        return b
      },
      limit: (n: number) => { rows = rows.slice(0, n); return b },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      range: async (i: number, f: number) => ({ data: rows.slice(i, f + 1), error: null }),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(res, rej),
    }
    return b
  }
  return {
    usuarioDoToken: async (h: string | null) => (h ? { id: 'u1' } : null),
    supabaseAdmin: () => ({ from }),
  }
})

vi.mock('@/lib/mapa-ingredientes', () => ({
  MAPA_INGREDIENTE_IPCA: [
    { id: 1, nome: 'Ingrediente A', serie: 'ipca_item_a', confianca: 'alta' },
    { id: 2, nome: 'Ingrediente B', serie: 'ipca_item_b', confianca: 'media' },
  ],
}))

import { GET } from '@/app/api/indice-retropolado/route'

function req(qs: string) {
  return new NextRequest(`http://localhost/api/indice-retropolado?${qs}`, {
    headers: { authorization: 'Bearer t' },
  })
}

function fixturesBase(): Record<string, Linha[]> {
  return {
    profiles: [{ id: 'u1', is_admin: true }],
    pratos: [{ id: 10, ativo: true }],
    snapshots: [
      { id: 2, data: '2026-07-20', custo_total_pf: 10 },
      { id: 1, data: '2026-06-21', custo_total_pf: 8 },
    ],
    custos_pratos: [
      { snapshot_id: 2, prato_id: 10, custo_total: 10 },
      { snapshot_id: 1, prato_id: 10, custo_total: 8 },
    ],
    precos: [
      { snapshot_id: 2, ingrediente_id: 1, mediana_exibicao: 5 },
      { snapshot_id: 2, ingrediente_id: 2, mediana_exibicao: 2 },
    ],
    receitas: [
      { prato_id: 10, ingrediente_id: 1, qtd_g: 1000 },
      { prato_id: 10, ingrediente_id: 2, qtd_g: 500 },
    ],
    fatores_preditores: [
      { serie: 'ipca_7171', data: '2026-05-01', valor: 1 },
      { serie: 'ipca_7171', data: '2026-06-01', valor: 1 },
      { serie: 'ipca_7171', data: '2026-07-01', valor: 2 },
      { serie: 'ipca_item_a', data: '2026-06-01', valor: 1 },
      { serie: 'ipca_item_a', data: '2026-07-01', valor: 2 },
      { serie: 'ipca_item_b', data: '2026-06-01', valor: 1 },
      { serie: 'ipca_item_b', data: '2026-07-01', valor: 1 },
    ],
  }
}

beforeEach(() => { tabelas.dados = fixturesBase() })

describe('contrato ok', () => {
  it('série completa responde 200 status ok, ancorada no snapshot mais recente válido', async () => {
    const res = await GET(req('desde=2026-05&confianca=alta,media'))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.status).toBe('ok')
    expect(j.ancora).toMatchObject({ ym: '2026-07', snapshotId: 2 })
    expect(j.serie.map((p: { ym: string }) => p.ym)).toEqual(['2026-05', '2026-06', '2026-07'])
    expect(j.serie[2].indice).toBe(10)   // no mês da âncora reproduz o medido
    expect(j.resolucao.fallbackUsed).toBe(false)
    expect(j.resolucao.groupByPolicy).toEqual([])
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })
})

describe('gaps (DATA_INCOMPLETE)', () => {
  it('sem variação do item nem do grupo na transição da âncora: 409 e só o ponto da âncora', async () => {
    tabelas.dados.fatores_preditores = tabelas.dados.fatores_preditores
      .filter(l => !(l.data === '2026-07-01' && (l.serie === 'ipca_item_a' || l.serie === 'ipca_7171')))
    const res = await GET(req('desde=2026-05&confianca=alta,media'))
    expect(res.status).toBe(409)
    const j = await res.json()
    expect(j.status).toBe('incomplete')
    expect(j.code).toBe('DATA_INCOMPLETE')
    expect(j.gaps).toContainEqual({ series: 'ipca_item_a', month: '2026-07', reason: 'sem variação do item nem do grupo no mês' })
    // nenhum ponto além do primeiro gap: junho não é reconstruído igual à âncora
    expect(j.serie.map((p: { ym: string }) => p.ym)).toEqual(['2026-07'])
  })

  it('gap interno interrompe a série no mês do gap', async () => {
    tabelas.dados.fatores_preditores = tabelas.dados.fatores_preditores
      .filter(l => !(l.data === '2026-06-01'))
    const res = await GET(req('desde=2026-05&confianca=alta,media'))
    expect(res.status).toBe(409)
    const j = await res.json()
    expect(j.gaps.some((g: { month: string }) => g.month === '2026-06')).toBe(true)
    expect(j.serie.map((p: { ym: string }) => p.ym)).toEqual(['2026-06', '2026-07'])
  })
})

describe('política de resolução', () => {
  it('item ausente com grupo presente calcula e marca fallbackUsed', async () => {
    tabelas.dados.fatores_preditores = tabelas.dados.fatores_preditores
      .filter(l => !(l.data === '2026-07-01' && l.serie === 'ipca_item_a'))
    const res = await GET(req('desde=2026-05&confianca=alta,media'))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.status).toBe('ok')
    expect(j.resolucao.fallbackUsed).toBe(true)
    expect(j.resolucao.fallbacks).toContainEqual({ series: 'ipca_item_a', meses: 1 })
  })

  it('exclusão pelo filtro de confiança é group_by_policy, não gap', async () => {
    const res = await GET(req('desde=2026-05&confianca=alta'))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.status).toBe('ok')
    expect(j.resolucao.groupByPolicy).toEqual([2])
    expect(j.resolucao.fallbackUsed).toBe(false)
  })
})

describe('gate de âncora', () => {
  it('snapshot mais novo com conjunto incompleto não ancora; o anterior válido ancora', async () => {
    tabelas.dados.snapshots.push({ id: 3, data: '2026-07-27', custo_total_pf: 11 })   // sem custos
    const res = await GET(req('desde=2026-05&confianca=alta,media'))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.ancora.snapshotId).toBe(2)
    expect(j.gate.rejeitados[0].snapshotId).toBe(3)
  })

  it('backfill com id maior e data antiga não vira âncora', async () => {
    tabelas.dados.snapshots.push({ id: 99, data: '2026-01-05', custo_total_pf: 5 })
    tabelas.dados.custos_pratos.push({ snapshot_id: 99, prato_id: 10, custo_total: 5 })
    const res = await GET(req('desde=2026-05&confianca=alta,media'))
    const j = await res.json()
    expect(j.ancora.snapshotId).toBe(2)
  })

  it('mediana que não reconcilia com o persistido rejeita o snapshot', async () => {
    tabelas.dados.snapshots[0].custo_total_pf = 99
    const res = await GET(req('desde=2026-05&confianca=alta,media'))
    const j = await res.json()
    expect(j.ancora.snapshotId).toBe(1)
    expect(j.gate.rejeitados[0].snapshotId).toBe(2)
  })

  it('custo não positivo rejeita o snapshot', async () => {
    tabelas.dados.custos_pratos[0].custo_total = 0
    const res = await GET(req('desde=2026-05&confianca=alta,media'))
    const j = await res.json()
    expect(j.ancora.snapshotId).toBe(1)
  })

  it('nenhum candidato válido responde 503 NO_VALID_ANCHOR', async () => {
    for (const s of tabelas.dados.snapshots) s.custo_total_pf = 99
    const res = await GET(req('desde=2026-05&confianca=alta,media'))
    expect(res.status).toBe(503)
    const j = await res.json()
    expect(j.code).toBe('NO_VALID_ANCHOR')
    expect(j.gate.rejeitados).toHaveLength(2)
  })
})
