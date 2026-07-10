// POST /api/assinatura — cria ou cancela a assinatura Premium do usuário.
// Auth: o cliente envia o access token da sessão Supabase em Authorization;
// a rota valida com o service role antes de agir (o app não tem SSR de auth).
import { NextResponse } from 'next/server'
import { supabaseAdmin, usuarioDoToken } from '@/lib/server/supabase-admin'
import { criarCliente, criarAssinatura, cancelarAssinatura, primeiraCobranca } from '@/lib/server/gateway'

const VALOR_PREMIUM = 99.99

export async function POST(req: Request) {
  let user
  try {
    user = await usuarioDoToken(req.headers.get('authorization'))
  } catch {
    return NextResponse.json({ erro: 'Serviço de assinatura não configurado.' }, { status: 503 })
  }
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const acao = body?.acao as 'assinar' | 'cancelar' | undefined
  const db = supabaseAdmin()

  if (acao === 'cancelar') {
    const { data: atual } = await db.from('assinaturas')
      .select('id, gateway_subscription_id, status').eq('user_id', user.id)
      .in('status', ['ativa', 'pendente', 'inadimplente'])
      .order('criado_em', { ascending: false }).limit(1)
    const a = atual?.[0]
    if (!a) return NextResponse.json({ erro: 'Nenhuma assinatura para cancelar.' }, { status: 404 })
    try {
      if (a.gateway_subscription_id) await cancelarAssinatura(a.gateway_subscription_id)
    } catch (e) {
      return NextResponse.json({ erro: e instanceof Error ? e.message : 'Falha no gateway.' }, { status: 502 })
    }
    await db.from('assinaturas').update({ status: 'cancelada' }).eq('id', a.id)
    return NextResponse.json({ ok: true })
  }

  if (acao === 'assinar') {
    // evita duplicar assinatura viva
    const { data: viva } = await db.from('assinaturas').select('id')
      .eq('user_id', user.id).in('status', ['ativa', 'pendente']).limit(1)
    if (viva?.length) return NextResponse.json({ erro: 'Você já tem uma assinatura em andamento.' }, { status: 409 })

    // FASE DE LANÇAMENTO: sem gateway configurado, o Premium é ativado
    // gratuitamente (valor 0, sem periodo_fim). Quando a cobrança entrar no ar
    // (envs ASAAS_* setadas), este ramo deixa de existir para novas assinaturas;
    // as de lançamento são encerradas/convertidas manualmente via banco.
    const gatewayConfigurado = !!(process.env.ASAAS_API_KEY && process.env.ASAAS_BASE_URL)
    if (!gatewayConfigurado) {
      const { error } = await db.from('assinaturas').insert({
        user_id: user.id, gateway: 'lancamento',
        status: 'ativa', plano: 'premium', valor: 0, periodo_fim: null,
      })
      if (error) return NextResponse.json({ erro: 'Falha ao ativar o Premium.' }, { status: 500 })
      return NextResponse.json({ ok: true, gratuito: true })
    }

    const metodo = body?.metodo === 'cartao' ? 'CREDIT_CARD' : 'PIX'
    // dados do perfil (nome/CPF exigidos pelo gateway)
    const { data: perfil } = await db.from('profiles').select('nome, cpf').eq('id', user.id).single()
    if (!perfil?.nome || !perfil?.cpf) {
      return NextResponse.json({ erro: 'Complete nome e CPF em Configurações antes de assinar.' }, { status: 422 })
    }

    try {
      // reutiliza o customer do gateway de uma assinatura anterior (cancelada/
      // inadimplente) — sem isso cada tentativa criava um cliente novo no Asaas
      const { data: antiga } = await db.from('assinaturas')
        .select('gateway_customer_id').eq('user_id', user.id).eq('gateway', 'asaas')
        .not('gateway_customer_id', 'is', null)
        .order('criado_em', { ascending: false }).limit(1)
      const cliente = antiga?.[0]?.gateway_customer_id
        ? { id: antiga[0].gateway_customer_id as string }
        : await criarCliente(perfil.nome, user.email ?? '', perfil.cpf)
      const sub = await criarAssinatura(cliente.id, {
        valor: VALOR_PREMIUM, metodo, descricao: 'Índice PF Premium (mensal)',
      })
      const { invoiceUrl } = await primeiraCobranca(sub.id)
      await db.from('assinaturas').insert({
        user_id: user.id, gateway: 'asaas',
        gateway_customer_id: cliente.id, gateway_subscription_id: sub.id,
        status: 'pendente', plano: 'premium', valor: VALOR_PREMIUM,
      })
      return NextResponse.json({ ok: true, pagamentoUrl: invoiceUrl })
    } catch (e) {
      return NextResponse.json({ erro: e instanceof Error ? e.message : 'Falha no gateway.' }, { status: 502 })
    }
  }

  return NextResponse.json({ erro: 'Ação inválida.' }, { status: 400 })
}
