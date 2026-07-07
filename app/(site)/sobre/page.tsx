import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sobre — Índice PF',
  description: 'O que é o Índice PF e quem faz.',
}

export default function SobrePage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Sobre o Índice PF</h1>

      <div className="mt-4 space-y-4 text-dim leading-relaxed">
        <p>
          O Índice PF acompanha o custo de produção do prato feito — a refeição mais comum do Brasil.
          Medimos, a cada coleta, quanto custa produzir uma porção de cada um de 100 pratos regionais,
          a partir do preço real dos ingredientes no varejo e de dados coletados em campo.
        </p>
        <p>
          O objetivo é dar a quem compra, vende e produz comida uma referência pública e auditável
          de preço: cada valor do índice pode ser aberto até a lista de lojas e leituras que o geraram.
          A <a href="/metodologia" className="text-accent hover:underline">metodologia</a> é pública.
        </p>
        <p>
          O Índice PF é um produto da <strong className="text-ink">Infinity Inc</strong>, e integra o
          ecossistema de food service do grupo — Rede Food Service, Seasoning e Ponto Food.
        </p>
      </div>
    </main>
  )
}
