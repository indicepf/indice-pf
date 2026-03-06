import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zaeycrsfdrbdqiycmhuf.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphZXljcnNmZHJiZHFpeWNtaHVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NTY0MzYsImV4cCI6MjA4ODIzMjQzNn0.NGzvAP25CghEFmmixfGia6qa6Uvfe3K_EQt6PaDyGKk'

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
