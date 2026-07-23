import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { todasLinhas } from '@/lib/server/paginar'
import { PREDITOR_POR_KEY } from '@/lib/preditores'

// Leitura das séries preditoras para o overlay/regressão (área admin).
// GET /api/preditores?vars=dolar,selic&de=2025-01-01&ate=2025-12-31
// → { dolar: [{ data, valor }], selic: [...] }
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const vars = (url.searchParams.get('vars') || '').split(',').map(s => s.trim()).filter(Boolean)
  const de = url.searchParams.get('de')
  const ate = url.searchParams.get('ate')

  const series = vars.filter(v => PREDITOR_POR_KEY[v])   // só chaves conhecidas
  if (!series.length) return NextResponse.json({})

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
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }

  const out: Record<string, { data: string; valor: number }[]> = {}
  for (const s of series) out[s] = []
  for (const row of data) out[row.serie]?.push({ data: row.data, valor: Number(row.valor) })
  return NextResponse.json(out)
}
