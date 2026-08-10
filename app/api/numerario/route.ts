import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { exigirAdmin, SEM_CACHE } from '@/lib/server/autorizar'
import { CONVERSORES, REGIOES_PNAD } from '@/lib/numerario'

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/

// Cotações correntes dos conversores da aba "PF como moeda" (docs/031). Rota
// privada de admin (ADR docs/015). O custo do PF vem do cliente, que já o tem
// carregado; aqui só se resolve o valor vigente de cada série.
// GET /api/numerario?ate=AAAA-MM-DD  (padrão: hoje)
// → { conversores: { ouro: { valor, data } }, pnad: { br: { renda, horas } } }
//
// "Vigente" é a última observação com data <= ate: séries diárias não têm
// pregão todo dia e a PNAD é trimestral. Série sem nenhuma observação na
// janela devolve null — a UI mostra travessão, não zero.

type Vigente = { valor: number; data: string } | null

async function vigente(serie: string, ate: string): Promise<Vigente> {
  const { data, error } = await supabaseAdmin().from('fatores_preditores')
    .select('data, valor').eq('serie', serie).lte('data', ate)
    .order('data', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error(`${serie}: ${error.message}`)
  return data ? { valor: Number(data.valor), data: data.data } : null
}

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin(req, 'api/numerario')
  if ('resposta' in auth) return auth.resposta

  const ate = new URL(req.url).searchParams.get('ate') || new Date().toISOString().slice(0, 10)
  if (!RE_DATA.test(ate))
    return NextResponse.json({ error: 'data deve usar o formato AAAA-MM-DD', code: 'INVALID_DATE' }, { status: 400, headers: SEM_CACHE })

  const recortes = ['', ...Object.values(REGIOES_PNAD)]   // '' = agregado Brasil
  const chaves = [
    ...CONVERSORES.map(c => c.serie),
    ...recortes.flatMap(r => [r ? `pnad_renda_${r}` : 'pnad_renda', r ? `pnad_horas_${r}` : 'pnad_horas']),
  ]

  let valores: Record<string, Vigente>
  try {
    const resolvidos = await Promise.all(chaves.map(k => vigente(k, ate)))
    valores = Object.fromEntries(chaves.map((k, i) => [k, resolvidos[i]]))
  } catch (err) {
    console.error('[api/numerario]', err)
    return NextResponse.json({ error: 'erro interno', code: 'INTERNAL' }, { status: 500, headers: SEM_CACHE })
  }

  return NextResponse.json({
    ate,
    conversores: Object.fromEntries(CONVERSORES.map(c => [c.serie, valores[c.serie]])),
    pnad: Object.fromEntries(recortes.map(r => [r || 'br', {
      renda: valores[r ? `pnad_renda_${r}` : 'pnad_renda'],
      horas: valores[r ? `pnad_horas_${r}` : 'pnad_horas'],
    }])),
  }, { headers: SEM_CACHE })
}
