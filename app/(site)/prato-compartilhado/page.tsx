import type { Metadata } from 'next'
import { Suspense } from 'react'
import PratoCompartilhado from './PratoCompartilhado'

// Página PÚBLICA do prato compartilhado pela calculadora. Todo o conteúdo vem
// da URL (?itens=id:g,...&nome=) + preços públicos — nada da conta de quem
// compartilhou é lido ou exposto. noindex: conteúdo gerado por usuário.
export const metadata: Metadata = {
  title: 'Prato compartilhado — Índice PF',
  description: 'Custo de produção de um prato montado na calculadora do Índice PF.',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <Suspense fallback={<main className="site-main" style={{ paddingTop: 40 }}><p className="text-sm text-dim">Carregando…</p></main>}>
      <PratoCompartilhado />
    </Suspense>
  )
}
