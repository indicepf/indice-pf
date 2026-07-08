'use client'

import Link from 'next/link'
import { Badge, Card } from '@/components/ui'

// Placeholder da Fase 6 — o conteúdo real (status da assinatura, cobrança,
// cancelamento) entra nas Fases 7–8, com o gateway de pagamento.
export default function PlanoPage() {
  return (
    <main className="max-w-lg mx-auto px-6 py-8">
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-bold tracking-tight text-lg">Seu plano</h2>
          <Badge tone="neutral">Gratuito</Badge>
        </div>
        <ul className="text-sm text-dim mt-4 space-y-2 leading-relaxed">
          <li>✓ Índice nacional e por região</li>
          <li>✓ Custo dos 100 pratos com detalhamento</li>
          <li>✓ Contribuição com recompensa via PIX</li>
        </ul>
      </Card>

      <Card className="p-6 mt-4 border-accent/40">
        <div className="flex items-center justify-between">
          <h2 className="font-bold tracking-tight text-lg">Premium</h2>
          <Badge tone="warn">em breve</Badge>
        </div>
        <p className="text-sm text-dim mt-3 leading-relaxed">
          Preços por produto e região, exportação de dados e série histórica completa por ingrediente —
          R$ 99,99/mês. A assinatura abre quando o checkout estiver no ar.
        </p>
        <Link href="/planos" className="text-sm text-accent hover:underline mt-3 inline-block">
          Comparar os planos →
        </Link>
      </Card>
    </main>
  )
}
