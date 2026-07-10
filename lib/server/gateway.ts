// Wrapper do gateway de pagamento (Asaas — recomendação D9, pendente de
// confirmação comercial). Toda a comunicação com o gateway vive aqui:
// trocar de provedor = reescrever este arquivo + o webhook, nada mais.
import 'server-only'

// Sem fallback de URL: um default sandbox em produção criaria assinaturas
// de mentira sem erro visível (cliente "assina", nada é cobrado).
const BASE = process.env.ASAAS_BASE_URL

async function asaas(path: string, init?: RequestInit) {
  if (!BASE) throw new Error('ASAAS_BASE_URL não configurada')
  const key = process.env.ASAAS_API_KEY
  if (!key) throw new Error('ASAAS_API_KEY não configurada')
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      access_token: key,
      ...init?.headers,
    },
  })
  const body = await r.json().catch(() => null)
  if (!r.ok) {
    const msg = body?.errors?.[0]?.description || `gateway ${r.status}`
    throw new Error(msg)
  }
  return body
}

export type ClienteGateway = { id: string }
export type AssinaturaGateway = {
  id: string
  status: string
  nextDueDate?: string
  // cobrança Pix pendente (QR) quando o método é Pix
  invoiceUrl?: string
}

export async function criarCliente(nome: string, email: string, cpf: string): Promise<ClienteGateway> {
  const c = await asaas('/customers', {
    method: 'POST',
    body: JSON.stringify({ name: nome, email, cpfCnpj: cpf }),
  })
  return { id: c.id }
}

export async function criarAssinatura(customerId: string, opts: {
  valor: number
  metodo: 'PIX' | 'CREDIT_CARD' | 'UNDEFINED'
  descricao: string
}): Promise<AssinaturaGateway> {
  const hoje = new Date().toISOString().slice(0, 10)
  const s = await asaas('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      customer: customerId,
      billingType: opts.metodo,
      value: opts.valor,
      nextDueDate: hoje,
      cycle: 'MONTHLY',
      description: opts.descricao,
    }),
  })
  return { id: s.id, status: s.status, nextDueDate: s.nextDueDate }
}

export async function cancelarAssinatura(subscriptionId: string): Promise<void> {
  await asaas(`/subscriptions/${subscriptionId}`, { method: 'DELETE' })
}

// primeira cobrança da assinatura (para exibir o link/QR de pagamento)
export async function primeiraCobranca(subscriptionId: string): Promise<{ invoiceUrl: string | null }> {
  const r = await asaas(`/subscriptions/${subscriptionId}/payments`)
  const p = r?.data?.[0]
  return { invoiceUrl: p?.invoiceUrl ?? null }
}
