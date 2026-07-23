import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

// Catálogo completo das séries SIDRA ingeridas (para os menus com busca por
// categoria). GET /api/catalogo-preditores → [{ serie, label, categoria, ... }]
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('fatores_catalogo')
    .select('serie, label, categoria, granularidade, unidade')
    .order('categoria', { ascending: true }).order('label', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
