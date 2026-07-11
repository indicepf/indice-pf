import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/site/Header'
import Footer from '@/components/site/Footer'

export const metadata: Metadata = {
  title: 'Erro 404 — Índice Prato Feito',
}

// not-found raiz renderiza só dentro do layout root (fora do grupo (site)),
// por isso inclui Header e Footer diretamente, como app/(site)/layout.tsx.
export default function NotFound() {
  return (
    <>
      <Header />
      <main className="site-main" style={{ marginTop: 0, paddingTop: 40 }}>
        <div className="box" style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center', padding: '64px 32px' }}>
          <p
            style={{
              fontSize: 96,
              fontWeight: 800,
              lineHeight: 1,
              background: 'var(--grad-cta)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            404
          </p>
          <h2 style={{ fontSize: 28, justifyContent: 'center', margin: '18px 0 10px' }}>
            Página não encontrada
          </h2>
          <p style={{ color: 'var(--ink-2)', fontSize: 18, lineHeight: 1.7, marginBottom: 28 }}>
            O endereço que você acessou não existe ou foi removido.
          </p>
          <Link href="/" className="btn-mk primary" style={{ fontSize: 16, padding: '12px 24px' }}>
            Voltar ao Índice Prato Feito
          </Link>
        </div>
      </main>
      <Footer />
    </>
  )
}
