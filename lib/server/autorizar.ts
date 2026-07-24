// Gate de autorização das rotas administrativas de API (ADR docs/015).
// Rota privada de admin: 401 sem sessão, 403 sem papel, 429 acima do limite.
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, usuarioDoToken } from './supabase-admin'

// Respostas dependem do usuário: nunca podem entrar em cache compartilhado.
export const SEM_CACHE = { 'Cache-Control': 'private, no-store' } as const

// Rate limit em memória por rota+usuário (janela fixa de 1 min). Best-effort:
// cada instância serverless tem contador próprio; freia abuso básico até
// existir limitador distribuído.
const JANELA_MS = 60_000
const MAX_REQ = 60
const janelas = new Map<string, { inicio: number; n: number }>()

function dentroDoLimite(chave: string): boolean {
  const agora = Date.now()
  const j = janelas.get(chave)
  if (!j || agora - j.inicio >= JANELA_MS) {
    janelas.set(chave, { inicio: agora, n: 1 })
    return true
  }
  j.n += 1
  return j.n <= MAX_REQ
}

export type Autorizado = { user: { id: string; email?: string } }
export type Negado = { resposta: NextResponse }

function negar(status: number, code: string, error: string): Negado {
  return { resposta: NextResponse.json({ error, code }, { status, headers: SEM_CACHE }) }
}

// Valida o Bearer token e exige profiles.is_admin. Nunca confia em claim ou
// estado do cliente. Retorna a resposta pronta quando nega.
export async function exigirAdmin(req: NextRequest, rota: string): Promise<Autorizado | Negado> {
  const user = await usuarioDoToken(req.headers.get('authorization'))
  if (!user) return negar(401, 'UNAUTHENTICATED', 'não autenticado')
  if (!dentroDoLimite(`${rota}|${user.id}`)) return negar(429, 'RATE_LIMITED', 'limite de requisições excedido')
  const { data, error } = await supabaseAdmin().from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (error) {
    console.error(`[${rota}] erro ao consultar papel:`, error.message)
    return negar(500, 'INTERNAL', 'erro interno')
  }
  if (!data?.is_admin) return negar(403, 'FORBIDDEN', 'sem permissão')
  return { user }
}
