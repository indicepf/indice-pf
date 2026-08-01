// Rascunho do envio de contribuições, em IndexedDB.
//
// iOS e Android descartam a aba em segundo plano: atender uma ligação no
// mercado apagava as fotos, os campos da loja e a localização — que é
// obrigatória e ainda exige um novo prompt de GPS ao voltar. localStorage não
// resolve porque as fotos são Blobs.
//
// Toda falha é silenciosa (navegação privada, cota estourada): ficar sem
// rascunho é uma experiência pior, não um erro de envio.

const BANCO = 'indice-pf'
const STORE = 'rascunho'
const CHAVE = 'contribuir'
const VALIDADE_MS = 24 * 60 * 60 * 1000

export type Rascunho = {
  em: number
  userId: string
  modo: 'single' | 'lote'
  tipoLoja: string; mercado: string; cidade: string; bairro: string; uf: string; endereco: string
  coord: { lat: number; lng: number } | null
  ingredienteId: string; marca: string; preco: string; pesoG: string
  fotos: Blob[]
  fotoUnica: Blob | null
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(BANCO, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}

function comStore<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return abrir().then(db => new Promise<T>((res, rej) => {
    const req = fn(db.transaction(STORE, modo).objectStore(STORE))
    req.onsuccess = () => { res(req.result as T); db.close() }
    req.onerror = () => { rej(req.error); db.close() }
  }))
}

export async function salvarRascunho(r: Omit<Rascunho, 'em'>) {
  try { await comStore('readwrite', s => s.put({ ...r, em: Date.now() }, CHAVE)) } catch { /* sem persistência */ }
}

export async function limparRascunho() {
  try { await comStore('readwrite', s => s.delete(CHAVE)) } catch { /* sem persistência */ }
}

export async function lerRascunho(userId: string): Promise<Rascunho | null> {
  try {
    const r = await comStore<Rascunho | undefined>('readonly', s => s.get(CHAVE))
    if (!r) return null
    // outra conta = celular compartilhado; o rascunho iria para o usuário errado
    if (r.userId !== userId || Date.now() - r.em > VALIDADE_MS) { await limparRascunho(); return null }
    return r
  } catch { return null }
}
