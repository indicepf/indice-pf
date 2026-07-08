// Client Supabase com service role — SÓ para rotas de API (app/api/*).
// O import de 'server-only' faz o build FALHAR se este módulo vazar para
// código de cliente (protege a chave).
import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yhgdlmmtiyvdgeoxavzn.supabase.co'

let cached: SupabaseClient | null = null
export function supabaseAdmin(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada')
  return (cached ||= createClient(url, key, { auth: { persistSession: false } }))
}

// resolve o usuário dono de um access token (Authorization: Bearer <token>)
export async function usuarioDoToken(authHeader: string | null): Promise<{ id: string; email?: string } | null> {
  const token = authHeader?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await supabaseAdmin().auth.getUser(token)
  if (error || !data.user) return null
  return { id: data.user.id, email: data.user.email ?? undefined }
}
