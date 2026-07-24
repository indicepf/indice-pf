import { supabase } from './supabase'

// fetch para as rotas administrativas de API, que exigem Bearer token (ADR
// docs/015). Pega o token da sessão atual — o supabase-js renova sozinho —
// e envia só no header (nunca em URL, log ou cache).
export async function fetchAdmin(input: string, init?: RequestInit): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
}
