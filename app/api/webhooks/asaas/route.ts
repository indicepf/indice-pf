// Webhook do Asaas — eventos de pagamento/assinatura.
// Valida o token do header, garante idempotência via webhook_eventos e
// atualiza a assinatura correspondente. Sempre responde 200 para eventos
// reconhecidos (o gateway reenvia em caso de erro).
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

// evento → efeito no status da assinatura
const CONFIRMA = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'])
const FALHA = new Set(['PAYMENT_OVERDUE', 'PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED'])
const CANCELA = new Set(['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED'])

export async function POST(req: Request) {
  const token = process.env.ASAAS_WEBHOOK_TOKEN
  if (!token || req.headers.get('asaas-access-token') !== token) {
    return NextResponse.json({ erro: 'não autorizado' }, { status: 401 })
  }

  const evt = await req.json().catch(() => null)
  if (!evt?.event || !evt?.id) return NextResponse.json({ erro: 'payload inválido' }, { status: 400 })

  const db = supabaseAdmin()

  // idempotência: evento já processado → 200 sem efeito
  const { error: dupErr } = await db.from('webhook_eventos').insert({
    gateway: 'asaas', evento_id: String(evt.id), tipo: evt.event, payload: evt,
  })
  if (dupErr) {
    if (dupErr.code === '23505') return NextResponse.json({ ok: true, dup: true })
    return NextResponse.json({ erro: 'falha ao registrar evento' }, { status: 500 })
  }

  const subId: string | undefined = evt.payment?.subscription ?? evt.subscription?.id
  if (!subId) return NextResponse.json({ ok: true, ignorado: true })

  if (CONFIRMA.has(evt.event)) {
    // pagamento confirmado → ativa e estende o período por 1 mês + folga de 3 dias.
    // Base = vencimento da cobrança paga (dueDate), não a hora do processamento:
    // reentregas atrasadas do gateway não podem deslocar o período do cliente.
    const base = evt.payment?.dueDate ? new Date(`${evt.payment.dueDate}T00:00:00Z`) : new Date()
    const fim = isNaN(base.getTime()) ? new Date() : base
    fim.setMonth(fim.getMonth() + 1); fim.setDate(fim.getDate() + 3)
    await db.from('assinaturas')
      .update({ status: 'ativa', periodo_fim: fim.toISOString() })
      .eq('gateway', 'asaas').eq('gateway_subscription_id', subId)
  } else if (FALHA.has(evt.event)) {
    await db.from('assinaturas')
      .update({ status: 'inadimplente' })
      .eq('gateway', 'asaas').eq('gateway_subscription_id', subId)
  } else if (CANCELA.has(evt.event)) {
    await db.from('assinaturas')
      .update({ status: 'cancelada' })
      .eq('gateway', 'asaas').eq('gateway_subscription_id', subId)
  }

  return NextResponse.json({ ok: true })
}
