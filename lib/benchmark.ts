// Regras do benchmark preliminar Índice PF × DIEESE (Fase 0C, docs/014).
// nMin aprovado por ADR em 24/07/2026: abaixo de 6 meses comparáveis, ou com
// comparabilidade não direta, o par não recebe leitura qualitativa — a razão
// é registro, não julgamento de qualidade.
export const N_MIN_BENCHMARK = 6

export type ClasseBenchmark = 'ok' | 'divergente' | 'sem_classificacao'

export function classificarBenchmark(
  razao: number | null,
  nMeses: number,
  comparabilidade: 'direta' | 'aproximada',
): ClasseBenchmark {
  if (razao == null || nMeses < N_MIN_BENCHMARK || comparabilidade !== 'direta') return 'sem_classificacao'
  return razao >= 0.85 && razao <= 1.15 ? 'ok' : 'divergente'
}
