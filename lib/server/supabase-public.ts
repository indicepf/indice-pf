// Client Supabase com a chave ANÔNIMA para Server Components e rotas públicas
// (página do prato, sitemap). Lê apenas o que a RLS já permite ao público —
// nada de service role aqui.
import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yhgdlmmtiyvdgeoxavzn.supabase.co'
const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  ''

let cached: SupabaseClient | null = null
export function supabasePublico(): SupabaseClient {
  if (!key) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY não configurada')
  return (cached ||= createClient(url, key, { auth: { persistSession: false } }))
}
