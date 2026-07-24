import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { exigirAdmin, SEM_CACHE } from '@/lib/server/autorizar'

// Catálogo completo das séries SIDRA ingeridas (para os menus com busca por
// categoria). Rota privada de admin (ADR docs/015).
// GET /api/catalogo-preditores → [{ serie, label, categoria, ... }]
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin(req, 'api/catalogo-preditores')
  if ('resposta' in auth) return auth.resposta

  const { data, error } = await supabaseAdmin()
    .from('fatores_catalogo')
    .select('serie, label, categoria, granularidade, unidade')
    .order('categoria', { ascending: true }).order('label', { ascending: true })
  if (error) {
    console.error('[api/catalogo-preditores]', error.message)
    return NextResponse.json({ error: 'erro interno', code: 'INTERNAL' }, { status: 500, headers: SEM_CACHE })
  }
  return NextResponse.json(data ?? [], { headers: SEM_CACHE })
}
