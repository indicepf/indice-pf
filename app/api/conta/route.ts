// POST /api/conta — exclui a conta do usuário autenticado (LGPD, direito de
// eliminação). Auth igual à /api/assinatura: Bearer token validado com o
// service role.
//
// Efeito no banco (FKs já modelados para isso):
//   - profiles: ON DELETE CASCADE (leva junto assinaturas, que referencia profiles)
//   - contribuicoes / pagamentos: ON DELETE SET NULL — os preços aprovados
//     continuam alimentando o índice, anonimizados
//   - avatar removido do Storage
// Assinatura Asaas viva é cancelada no gateway ANTES (aborta se falhar — não
// se deixa cobrança órfã de conta apagada).
import { NextResponse } from 'next/server'
import { supabaseAdmin, usuarioDoToken } from '@/lib/server/supabase-admin'
import { cancelarAssinatura } from '@/lib/server/gateway'

export async function POST(req: Request) {
  let user
  try {
    user = await usuarioDoToken(req.headers.get('authorization'))
  } catch {
    return NextResponse.json({ erro: 'Serviço indisponível.' }, { status: 503 })
  }
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (body?.acao !== 'excluir') return NextResponse.json({ erro: 'Ação inválida.' }, { status: 400 })

  const db = supabaseAdmin()

  const { data: vivas } = await db.from('assinaturas')
    .select('gateway, gateway_subscription_id')
    .eq('user_id', user.id).in('status', ['ativa', 'pendente', 'inadimplente'])
  for (const a of vivas ?? []) {
    if (a.gateway === 'asaas' && a.gateway_subscription_id) {
      try {
        await cancelarAssinatura(a.gateway_subscription_id)
      } catch {
        return NextResponse.json(
          { erro: 'Não foi possível cancelar a assinatura no gateway. Cancele em Plano & assinatura e tente de novo.' },
          { status: 502 })
      }
    }
  }

  await db.storage.from('avatars').remove([`${user.id}/avatar.jpg`]).catch(() => {})

  const { error } = await db.auth.admin.deleteUser(user.id)
  if (error) return NextResponse.json({ erro: 'Falha ao excluir a conta.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
