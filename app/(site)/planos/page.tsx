import type { Metadata } from 'next'
import { ChevronVoltar } from '@/components/ui'
import { FASE_LANCAMENTO } from '@/lib/format'

export const metadata: Metadata = {
  title: 'Planos — Índice PF',
  description: 'Plano gratuito e plano Premium do Índice PF.',
}

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
)
const X = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
)

// layout do mockup (renderPublicPlans)
export default function PlanosPage() {
  return (
    <main className="site-main" style={{ marginTop: 0, paddingTop: 40 }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <h1 className="text-2xl font-extrabold tracking-tight mb-1">Planos</h1>
      <p className="hint">O índice é público. O Premium destrava o detalhamento por produto.</p>

      <div className="grid sm:grid-cols-2 gap-5 mt-5 items-start">
        <div className="plan">
          <h3>Gratuito</h3>
          <div className="p-price">R$ 0</div>
          <ul>
            <li><Check />Índice geral, região e pratos</li>
            <li><Check />Compartilhamento</li>
            <li><Check />Envio de fotos com recompensa via PIX</li>
            <li className="off"><X />Detalhamento por produto</li>
          </ul>
          <a href="/cadastro" className="btn-mk w-full justify-center">Criar conta grátis</a>
        </div>

        <div className="plan featured">
          <div className="pop">Premium</div>
          <h3>Premium</h3>
          <div className="p-price">R$ 99,99<small>/mês</small></div>
          {FASE_LANCAMENTO && (
            <p className="hint" style={{ marginTop: 4 }}>
              Grátis durante a fase de lançamento — ative sem cartão e sem cobrança.
            </p>
          )}
          <ul>
            <li><Check />Tudo do Gratuito</li>
            <li><Check />Detalhamento por produto e região</li>
            <li><Check />Exportação de dados</li>
            <li><Check />Comparativos históricos</li>
          </ul>
          <a href="/assinar" className="group btn-mk primary w-full justify-center">
            {FASE_LANCAMENTO ? 'Ativar Premium gratuito' : 'Assinar Premium'}<ChevronVoltar dir="dir" />
          </a>
        </div>
      </div>
      </div>
    </main>
  )
}
