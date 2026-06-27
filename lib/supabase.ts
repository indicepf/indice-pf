import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yhgdlmmtiyvdgeoxavzn.supabase.co'
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZ2RsbW10aXl2ZGdlb3hhdnpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NTM5NzQsImV4cCI6MjA5NzEyOTk3NH0.BeYgp7CBg7K9faeQd9vFXxLSHiqlGNa3VYVSxaJaUqA'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // O LockManager global do supabase-js (navigator.locks) às vezes trava em
    // navegação SPA/PWA: o getSession() interno fica esperando o lock e a tela
    // só destrava com refresh (que recria o client). Usamos um lock não-
    // bloqueante — roda a função na hora, sem coordenação de token entre abas
    // (aceitável aqui: uma aba por usuário). Elimina o deadlock recorrente.
    lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => fn(),
  },
})

function chaveSessao() {
  return `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`
}

// lê o usuário da sessão persistida de forma SÍNCRONA (sem rede, sem o lock de
// auth). Permite renderizar admin/perfil na hora em navegação client-side, em
// vez de esperar o getSession() — que trava no lock quando o auto-refresh roda.
export function usuarioDoStorage(): { id: string; email: string } | null {
  try {
    const raw = localStorage.getItem(chaveSessao())
    if (!raw) return null
    const p = JSON.parse(raw)
    const u = p?.user ?? p?.currentSession?.user ?? p?.session?.user
    return u?.id ? { id: u.id, email: u.email ?? '' } : null
  } catch { return null }
}

// remove a sessão persistida direto do storage (sem passar pela auth, que pode
// estar travada). Usado quando a renovação de token quebra e segura o lock —
// na próxima carga o cliente nasce limpo e a pessoa só precisa logar de novo.
export function limparSessaoLocal() {
  try { localStorage.removeItem(chaveSessao()) } catch { /* storage indisponível */ }
}
