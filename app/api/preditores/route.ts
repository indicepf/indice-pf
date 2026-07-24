import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { exigirAdmin, SEM_CACHE } from '@/lib/server/autorizar'
import { todasLinhas } from '@/lib/server/paginar'
import { PREDITOR_POR_KEY } from '@/lib/preditores'

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/
const MAX_VARS = 30

// Leitura das séries preditoras para o overlay/regressão. Rota privada de
// admin (ADR docs/015): exige Bearer token + profiles.is_admin.
// GET /api/preditores?vars=dolar,selic&de=2025-01-01&ate=2025-12-31
// → { dolar: [{ data, valor }], selic: [...] }
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin(req, 'api/preditores')
  if ('resposta' in auth) return auth.resposta

  const url = new URL(req.url)
  const vars = (url.searchParams.get('vars') || '').split(',').map(s => s.trim()).filter(Boolean)
  const de = url.searchParams.get('de')
  const ate = url.searchParams.get('ate')

  if (vars.length > MAX_VARS)
    return NextResponse.json({ error: `máximo de ${MAX_VARS} séries por chamada`, code: 'TOO_MANY_SERIES' }, { status: 400, headers: SEM_CACHE })
  if ((de && !RE_DATA.test(de)) || (ate && !RE_DATA.test(ate)))
    return NextResponse.json({ error: 'datas devem usar o formato AAAA-MM-DD', code: 'INVALID_DATE' }, { status: 400, headers: SEM_CACHE })

  const series = vars.filter(v => PREDITOR_POR_KEY[v])   // só chaves conhecidas
  if (!series.length) return NextResponse.json({}, { headers: SEM_CACHE })

  // pagina: várias séries × muitos meses passa fácil de 1000 linhas, e a
  // resposta truncada já cortou o gráfico do laboratório em 2000
  let data: { serie: string; data: string; valor: number }[]
  try {
    data = await todasLinhas<{ serie: string; data: string; valor: number }>((ini, fim) => {
      let q = supabaseAdmin().from('fatores_preditores')
        .select('serie, data, valor').in('serie', series)
        .order('serie', { ascending: true }).order('data', { ascending: true })
      if (de) q = q.gte('data', de)
      if (ate) q = q.lte('data', ate)
      return q.range(ini, fim)
    })
  } catch (err) {
    console.error('[api/preditores]', err)
    return NextResponse.json({ error: 'erro interno', code: 'INTERNAL' }, { status: 500, headers: SEM_CACHE })
  }

  const out: Record<string, { data: string; valor: number }[]> = {}
  for (const s of series) out[s] = []
  for (const row of data) out[row.serie]?.push({ data: row.data, valor: Number(row.valor) })
  return NextResponse.json(out, { headers: SEM_CACHE })
}
