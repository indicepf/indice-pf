import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yhgdlmmtiyvdgeoxavzn.supabase.co'
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZ2RsbW10aXl2ZGdlb3hhdnpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NTM5NzQsImV4cCI6MjA5NzEyOTk3NH0.BeYgp7CBg7K9faeQd9vFXxLSHiqlGNa3VYVSxaJaUqA'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// remove a sessão persistida direto do storage (sem passar pela auth, que pode
// estar travada). Usado quando a renovação de token quebra e segura o lock —
// na próxima carga o cliente nasce limpo e a pessoa só precisa logar de novo.
export function limparSessaoLocal() {
  try {
    const ref = new URL(SUPABASE_URL).hostname.split('.')[0]
    localStorage.removeItem(`sb-${ref}-auth-token`)
  } catch { /* storage indisponível */ }
}
