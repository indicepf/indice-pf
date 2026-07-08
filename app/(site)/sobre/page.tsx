import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sobre — Índice PF',
  description: 'O que é o Índice PF e quem faz.',
}

// layout e texto do mockup (page-sobre)
export default function SobrePage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="box" style={{ maxWidth: 760, margin: '0 auto' }}>
        <h2>Sobre o Índice PF</h2>
        <p className="hint">Um produto Infinity Inc.</p>
        <p style={{ color: 'var(--ink-2)', lineHeight: 1.7 }}>
          O Índice PF é um índice financeiro de inflação de alimentos — no espírito do Índice Big Mac —
          construído sobre o prato feito, a refeição mais representativa do brasileiro. Faz parte do
          ecossistema Infinity, ao lado da Rede Food Service, Seasoning e Ponto Food.
        </p>
      </div>
    </main>
  )
}
