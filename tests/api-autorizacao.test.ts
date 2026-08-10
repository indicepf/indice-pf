// Testes de contrato da Subfase 0A (ADR docs/015): as rotas de preditores,
// Laboratório e "PF como moeda" são privadas de admin — 401 sem sessão, 403 sem
// papel, 429 acima do limite, 400 para parâmetro inválido, e toda resposta
// leva Cache-Control: private, no-store.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const estado = vi.hoisted(() => ({
  usuario: null as { id: string; email?: string } | null,
  isAdmin: false,
  catalogo: [] as { serie: string; label: string }[],
  vigente: null as { data: string; valor: number } | null,
}))

vi.mock('@/lib/server/supabase-admin', () => {
  // builder genérico: qualquer método encadeia; thenable resolve { data, error }
  function builder(resultado: () => { data: unknown; error: unknown }) {
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'in', 'order', 'gte', 'lte', 'eq', 'not', 'limit']) b[m] = () => b
    b.maybeSingle = async () => resultado()
    b.range = async () => resultado()
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(resultado()).then(res, rej)
    return b
  }
  return {
    usuarioDoToken: async (h: string | null) => (h ? estado.usuario : null),
    supabaseAdmin: () => ({
      from: (tabela: string) =>
        builder(() => {
          if (tabela === 'profiles') return { data: { is_admin: estado.isAdmin }, error: null }
          if (tabela === 'fatores_catalogo') return { data: estado.catalogo, error: null }
          if (tabela === 'fatores_preditores') return { data: estado.vigente, error: null }
          return { data: [], error: null }
        }),
    }),
  }
})

import { exigirAdmin } from '@/lib/server/autorizar'
import { GET as getPreditores } from '@/app/api/preditores/route'
import { GET as getCatalogo } from '@/app/api/catalogo-preditores/route'
import { GET as getRetropolado } from '@/app/api/indice-retropolado/route'
import { GET as getConfiabilidade } from '@/app/api/confiabilidade/route'
import { GET as getNumerario } from '@/app/api/numerario/route'

function req(url: string, token?: string) {
  return new NextRequest(`http://localhost${url}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

beforeEach(() => {
  estado.usuario = { id: 'u1' }
  estado.isAdmin = true
  estado.catalogo = [{ serie: 'ipca_x', label: 'IPCA X' }]
  estado.vigente = null
})

describe('exigirAdmin', () => {
  it('nega 401 sem token', async () => {
    const r = await exigirAdmin(req('/api/x'), 'teste-401')
    expect('resposta' in r && r.resposta.status).toBe(401)
  })
  it('nega 403 com token válido sem papel', async () => {
    estado.isAdmin = false
    const r = await exigirAdmin(req('/api/x', 't'), 'teste-403')
    expect('resposta' in r && r.resposta.status).toBe(403)
  })
  it('autoriza admin', async () => {
    const r = await exigirAdmin(req('/api/x', 't'), 'teste-200')
    expect('user' in r && r.user.id).toBe('u1')
  })
  it('nega 429 acima da janela de 60 req/min', async () => {
    let ultimo: Awaited<ReturnType<typeof exigirAdmin>> | null = null
    for (let i = 0; i < 61; i++) ultimo = await exigirAdmin(req('/api/x', 't'), 'teste-429')
    expect(ultimo && 'resposta' in ultimo && ultimo.resposta.status).toBe(429)
  })
})

describe('rotas anônimas respondem 401 com private/no-store', () => {
  const casos: [string, (r: NextRequest) => Promise<Response>, string][] = [
    ['/api/preditores?vars=dolar', getPreditores, 'preditores'],
    ['/api/catalogo-preditores', getCatalogo, 'catalogo'],
    ['/api/indice-retropolado?desde=2024-01', getRetropolado, 'retropolado'],
    ['/api/confiabilidade', getConfiabilidade, 'confiabilidade'],
    ['/api/numerario', getNumerario, 'numerario'],
  ]
  for (const [url, handler, nome] of casos) {
    it(nome, async () => {
      const res = await handler(req(url))
      expect(res.status).toBe(401)
      expect(res.headers.get('cache-control')).toBe('private, no-store')
      const body = await res.json()
      expect(body.code).toBe('UNAUTHENTICATED')
    })
  }
})

describe('/api/preditores com admin', () => {
  it('rejeita data fora de AAAA-MM-DD com 400', async () => {
    const res = await getPreditores(req('/api/preditores?vars=dolar&de=2024', 't'))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_DATE')
  })
  it('rejeita mais de 30 séries com 400', async () => {
    const vars = Array.from({ length: 31 }, (_, i) => `v${i}`).join(',')
    const res = await getPreditores(req(`/api/preditores?vars=${vars}`, 't'))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('TOO_MANY_SERIES')
  })
  it('séries desconhecidas retornam objeto vazio', async () => {
    const res = await getPreditores(req('/api/preditores?vars=nao_existe', 't'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })
})

describe('/api/indice-retropolado com admin', () => {
  it('rejeita desde fora de AAAA-MM com 400', async () => {
    const res = await getRetropolado(req('/api/indice-retropolado?desde=2024-01-15', 't'))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_DATE')
  })
  it('rejeita confianca desconhecida com 400', async () => {
    const res = await getRetropolado(req('/api/indice-retropolado?desde=2024-01&confianca=altissima', 't'))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_PARAM')
  })
})

describe('/api/numerario com admin', () => {
  it('rejeita data fora de AAAA-MM-DD com 400', async () => {
    const res = await getNumerario(req('/api/numerario?ate=2026-08', 't'))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_DATE')
  })
  it('série sem observação na janela vira null, não zero', async () => {
    const res = await getNumerario(req('/api/numerario?ate=2026-08-10', 't'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const body = await res.json()
    expect(body.ate).toBe('2026-08-10')
    expect(body.conversores.ouro).toBeNull()
    expect(body.pnad.centro_oeste).toEqual({ renda: null, horas: null })
  })
  it('devolve o valor vigente quando existe', async () => {
    estado.vigente = { data: '2026-08-07', valor: 812.34 }
    const body = await (await getNumerario(req('/api/numerario', 't'))).json()
    expect(body.conversores.ouro).toEqual({ valor: 812.34, data: '2026-08-07' })
    expect(body.pnad.br.renda).toEqual({ valor: 812.34, data: '2026-08-07' })
  })
})

describe('/api/catalogo-preditores com admin', () => {
  it('responde 200 com o catálogo e private/no-store', async () => {
    const res = await getCatalogo(req('/api/catalogo-preditores', 't'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(await res.json()).toEqual([{ serie: 'ipca_x', label: 'IPCA X' }])
  })
})
