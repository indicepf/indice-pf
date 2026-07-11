import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/site/Header'
import Footer from '@/components/site/Footer'

export const metadata: Metadata = {
  title: 'Página não encontrada — Índice PF',
}

// not-found raiz renderiza só dentro do layout root (fora do grupo (site)),
// por isso inclui Header e Footer diretamente, como app/(site)/layout.tsx.
export default function NotFound() {
  return (
    <>
      <Header />
      <main className="site-main" style={{ marginTop: 0, paddingTop: 40 }}>
        <div className="box" style={{ maxWidth: 760, margin: '0 auto' }}>
          <h2>Página não encontrada</h2>
          <p style={{ color: 'var(--ink-2)', lineHeight: 1.7 }}>
            O endereço que você acessou não existe ou foi removido.
          </p>
          <p>
            <Link href="/">Voltar ao índice</Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  )
}
