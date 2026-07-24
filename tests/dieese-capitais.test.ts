// Testes da Fase 3 pacote 2: DIEESE preservado por capital (LAB-016,
// migração 51). O parser precisa extrair o valor de CADA capital, além da
// mediana nacional (leitura vigente, que não pode mudar). O painel de
// capitais varia mês a mês — perder isso mistura variação de preço com
// variação de composição da amostra.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { parseTabela } from '@/app/api/cron/importar-dieese/route'

const estado = vi.hoisted(() => ({
  chamadas: {} as Record<string, unknown[]>,
  falharCapitais: false,
}))

vi.mock('@/lib/server/supabase-admin', () => {
  function builder(tabela: string) {
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'limit']) b[m] = () => b
    b.maybeSingle = async () => ({ data: null, error: null })
    b.upsert = async (rows: unknown[]) => {
      if (tabela === 'dieese_capital_observations' && estado.falharCapitais)
        return { error: { message: 'falha simulada' } }
      ;(estado.chamadas[tabela] ??= []).push(...rows)
      return { error: null }
    }
    return b
  }
  return { usuarioDoToken: async () => null, supabaseAdmin: () => ({ from: (t: string) => builder(t) }) }
})

import { GET as getDieese } from '@/app/api/cron/importar-dieese/route'

describe('parseTabela — mediana nacional e valores por capital', () => {
  it('extrai o nome de cada capital do cabeçalho e o valor por linha', () => {
    const html = `<table><tr><th>Data</th><th>SP</th><th>RJ</th><th>BH</th></tr>
      <tr><td>06-2026</td><td>850,10</td><td>820,00</td><td>790,50</td></tr></table>`
    const { pontos, porCapital } = parseTabela(html)
    expect(pontos).toEqual([{ data: '2026-06-01', valor: 820.00 }])
    expect(porCapital).toEqual([
      { data: '2026-06-01', capital: 'SP', valor: 850.10 },
      { data: '2026-06-01', capital: 'RJ', valor: 820.00 },
      { data: '2026-06-01', capital: 'BH', valor: 790.50 },
    ])
  })

  it('painel de capitais varia por mês: célula "-" não vira observação', () => {
    const html = `<table><tr><th>Data</th><th>SP</th><th>RJ</th></tr>
      <tr><td>06-2026</td><td>850,00</td><td>820,00</td></tr>
      <tr><td>07-2026</td><td>860,00</td><td>-</td></tr></table>`
    const { pontos, porCapital } = parseTabela(html)
    expect(pontos).toEqual([{ data: '2026-06-01', valor: 835.00 }, { data: '2026-07-01', valor: 860.00 }])
    expect(porCapital.filter(p => p.data === '2026-07-01')).toEqual([{ data: '2026-07-01', capital: 'SP', valor: 860.00 }])
  })

  it('HTML sem tabela retorna vazio para ambos', () => {
    expect(parseTabela('<html><body>nada</body></html>')).toEqual({ pontos: [], porCapital: [] })
  })
})

describe('cron importar-dieese grava capitais sem afetar a mediana nacional', () => {
  const fetchOriginal = globalThis.fetch

  beforeEach(() => {
    process.env.CRON_SECRET = 'segredo-teste'
    estado.chamadas = {}
    estado.falharCapitais = false
  })
  afterEach(() => { globalThis.fetch = fetchOriginal })

  function reqDieese() {
    return new NextRequest('http://localhost/api/cron/importar-dieese?serie=dieese_cesta&full=1', {
      headers: { authorization: 'Bearer segredo-teste' },
    })
  }

  it('mediana nacional em fatores_preditores permanece igual; capitais vão para a tabela nova', async () => {
    const html = `<table><tr><th>Data</th><th>SP</th><th>RJ</th></tr>
      <tr><td>07-2026</td><td>860,00</td><td>840,00</td></tr></table>`
    globalThis.fetch = (async () => ({ ok: true, status: 200, text: async () => html })) as unknown as typeof fetch
    const res = await getDieese(reqDieese())
    expect(res.status).toBe(200)
    expect(estado.chamadas.fatores_preditores).toEqual([
      { serie: 'dieese_cesta', data: '2026-07-01', valor: 850.00, fonte: 'dieese_cesta_basica' },
    ])
    expect(estado.chamadas.dieese_capital_observations).toEqual([
      { serie: 'dieese_cesta', capital: 'SP', data: '2026-07-01', valor: 860.00 },
      { serie: 'dieese_cesta', capital: 'RJ', data: '2026-07-01', valor: 840.00 },
    ])
  })

  it('falha ao gravar capitais não derruba o cron (best-effort)', async () => {
    estado.falharCapitais = true
    const html = `<table><tr><th>Data</th><th>SP</th></tr><tr><td>07-2026</td><td>860,00</td></tr></table>`
    globalThis.fetch = (async () => ({ ok: true, status: 200, text: async () => html })) as unknown as typeof fetch
    const res = await getDieese(reqDieese())
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('ok')
    expect(estado.chamadas.fatores_preditores).toEqual([
      { serie: 'dieese_cesta', data: '2026-07-01', valor: 860.00, fonte: 'dieese_cesta_basica' },
    ])
    expect(estado.chamadas.dieese_capital_observations).toBeUndefined()
  })
})
