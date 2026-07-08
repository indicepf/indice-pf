import type { Metadata } from 'next'
import { Badge, Card } from '@/components/ui'

export const metadata: Metadata = {
  title: 'Planos — Índice PF',
  description: 'Plano gratuito e plano Premium do Índice PF.',
}

export default function PlanosPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Planos</h1>
      <p className="text-dim mt-3">O índice é público. O Premium destrava o detalhamento por produto e a exportação de dados.</p>

      <div className="grid sm:grid-cols-2 gap-5 mt-8 items-start">
        <Card className="p-6">
          <h2 className="font-bold tracking-tight text-lg">Gratuito</h2>
          <p className="text-3xl font-bold tracking-tight mt-2">R$ 0</p>
          <ul className="text-sm text-dim mt-4 space-y-2 leading-relaxed">
            <li>✓ Índice nacional e por região</li>
            <li>✓ Custo dos 100 pratos com detalhamento de ingredientes</li>
            <li>✓ Fontes de cada preço (lojas e leituras)</li>
            <li>✓ Contribuir com fotos de preços e receber recompensa</li>
          </ul>
          <a href="/" className="mt-6 inline-flex items-center justify-center w-full rounded-[var(--r-sm)] px-4 py-2 text-sm font-medium bg-surface border border-border-2 hover:bg-surface-2 transition">
            Usar agora
          </a>
        </Card>

        <Card className="p-6 border-accent/40 shadow-[var(--shadow-brand)] relative">
          <div className="flex items-center justify-between">
            <h2 className="font-bold tracking-tight text-lg">Premium</h2>
            <Badge tone="warn">em breve</Badge>
          </div>
          <p className="text-3xl font-bold tracking-tight mt-2">R$ 99,99<span className="text-sm text-dim font-normal">/mês</span></p>
          <ul className="text-sm text-dim mt-4 space-y-2 leading-relaxed">
            <li>✓ Tudo do plano gratuito</li>
            <li>✓ Preços por produto e por região</li>
            <li>✓ Exportação de dados (CSV/XLSX)</li>
            <li>✓ Série histórica completa por ingrediente</li>
          </ul>
          <a href="/assinar" className="mt-6 inline-flex items-center justify-center w-full rounded-[var(--r-sm)] px-4 py-2 text-sm font-medium bg-accent text-white hover:brightness-110 transition">
            Assinar o Premium
          </a>
          <p className="text-xs text-faint mt-3">Pagamento em fase final de configuração — o checkout avisa quando estiver no ar.</p>
        </Card>
      </div>
    </main>
  )
}
