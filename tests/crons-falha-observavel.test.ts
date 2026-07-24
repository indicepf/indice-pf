// Testes da Subfase 0D: fonte essencial que falha (HTTP ruim, HTML vazio,
// zero linhas) produz status "failed" e HTTP 500 no cron — nunca sucesso
// parcial silencioso com 200. Diagnóstico estruturado por fonte na resposta.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/server/supabase-admin', () => {
  function builder() {
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'limit', 'gte', 'in', 'not']) b[m] = () => b
    b.maybeSingle = async () => ({ data: null, error: null })
    b.range = async () => ({ data: [], error: null })
    b.upsert = async () => ({ error: null })
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(res, rej)
    return b
  }
  return {
    usuarioDoToken: async () => null,
    supabaseAdmin: () => ({ from: () => builder() }),
  }
})

import { GET as getDieese } from '@/app/api/cron/importar-dieese/route'
import { GET as getPreditores } from '@/app/api/cron/importar-preditores/route'

const fetchOriginal = globalThis.fetch

function reqCron(url: string, secret?: string) {
  return new NextRequest(`http://localhost${url}`, {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  })
}

beforeEach(() => { process.env.CRON_SECRET = 'segredo-teste' })
afterEach(() => { globalThis.fetch = fetchOriginal })

describe('cron importar-dieese', () => {
  it('sem segredo responde 401', async () => {
    const res = await getDieese(reqCron('/api/cron/importar-dieese'))
    expect(res.status).toBe(401)
  })

  it('HTML sem tabela (markup mudado) derruba o job com 500 e diagnóstico', async () => {
    globalThis.fetch = (async () => ({
      ok: true, status: 200, text: async () => '<html><body>sem tabela aqui</body></html>',
    })) as unknown as typeof fetch
    const res = await getDieese(reqCron('/api/cron/importar-dieese?serie=dieese_cesta', 'segredo-teste'))
    expect(res.status).toBe(500)
    const j = await res.json()
    expect(j.status).toBe('failed')
    expect(j.fontes.dieese_cesta.ok).toBe(false)
    expect(j.fontes.dieese_cesta.erro).toContain('0 linha')
  })

  it('timeout/erro de rede derruba o job com 500', async () => {
    globalThis.fetch = (async () => { throw new Error('timeout simulado') }) as unknown as typeof fetch
    const res = await getDieese(reqCron('/api/cron/importar-dieese?serie=dieese_cesta', 'segredo-teste'))
    expect(res.status).toBe(500)
    const j = await res.json()
    expect(j.status).toBe('failed')
    expect(j.fontes.dieese_cesta.erro).toContain('timeout simulado')
  })

  it('tabela válida responde 200 ok com contagem de linhas', async () => {
    const html = `<table><tr><th>Data</th><th>SP</th><th>RJ</th></tr>
      <tr><td>06-2026</td><td>850,10</td><td>820,00</td></tr>
      <tr><td>07-2026</td><td>860,00</td><td>-</td></tr></table>`
    globalThis.fetch = (async () => ({ ok: true, status: 200, text: async () => html })) as unknown as typeof fetch
    const res = await getDieese(reqCron('/api/cron/importar-dieese?serie=dieese_cesta', 'segredo-teste'))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.status).toBe('ok')
    expect(j.fontes.dieese_cesta).toEqual({ ok: true, linhas: 2 })
  })
})

describe('cron importar-preditores', () => {
  it('sem segredo responde 401', async () => {
    const res = await getPreditores(reqCron('/api/cron/importar-preditores'))
    expect(res.status).toBe(401)
  })

  it('todas as fontes falhando derruba o job com 500 e diagnóstico por fonte', async () => {
    globalThis.fetch = (async () => ({
      ok: false, status: 503,
      headers: new Headers({ 'content-type': 'text/html' }),
      json: async () => ({}), text: async () => '',
    })) as unknown as typeof fetch
    const res = await getPreditores(reqCron('/api/cron/importar-preditores', 'segredo-teste'))
    expect(res.status).toBe(500)
    const j = await res.json()
    expect(j.status).toBe('failed')
    // fontes essenciais aparecem marcadas e reprovadas
    expect(j.fontes.sidra_itens.essencial).toBe(true)
    expect(j.fontes.sidra_itens.ok).toBe(false)
    expect(j.fontes.ipca.ok).toBe(false)
    // não essenciais também são diagnosticadas, sem derrubar sozinhas o job
    expect(j.fontes.bitcoin.essencial).toBe(false)
  }, 30_000)
})
