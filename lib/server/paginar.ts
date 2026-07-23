import 'server-only'

// O PostgREST devolve no máximo 1000 linhas por requisição, silenciosamente.
// Consulta truncada já causou bug de dado velho no overlay (dólar de 2013) e
// série vazia no laboratório — sempre pagine ao ler tabelas que podem crescer.
export async function todasLinhas<T>(
  monta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  passo = 1000,
): Promise<T[]> {
  const out: T[] = []
  for (let de = 0; ; de += passo) {
    const { data, error } = await monta(de, de + passo - 1)
    if (error) throw new Error(error.message)
    const lote = data ?? []
    out.push(...lote)
    if (lote.length < passo) return out
  }
}
