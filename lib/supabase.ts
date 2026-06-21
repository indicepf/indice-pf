import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yhgdlmmtiyvdgeoxavzn.supabase.co'
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZ2RsbW10aXl2ZGdlb3hhdnpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NTM5NzQsImV4cCI6MjA5NzEyOTk3NH0.BeYgp7CBg7K9faeQd9vFXxLSHiqlGNa3VYVSxaJaUqA'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export type HistoricoPreco = {
  data: string
  nome_ingrediente: string
  preco: number        // mediana
  media: number | null
  minimo: number | null
  maximo: number | null
  desvio_padrao: number | null
  label: string
  custo_porcao: number
  qtd_resultados: number
  custo_total_pf: number
}
