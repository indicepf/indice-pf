'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../../useAuth'
import { Badge, Button, Card } from '@/components/ui'

const BENEFICIOS = [
  'Preços por produto e por região',
  'Exportação de dados (CSV/XLSX)',
  'Série histórica completa por ingrediente',
  'Sem anúncios',
]

type Metodo = 'pix' | 'cartao'

export default function AssinarPage() {
  const { isPremium } = useAuth()
  const [metodo, setMetodo] = useState<Metodo>('pix')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [pagamentoUrl, setPagamentoUrl] = useState('')
  const [indisponivel, setIndisponivel] = useState(false)

  async function assinar() {
    setErro(''); setBusy(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) { setErro('Sessão expirada — entre de novo.'); return }
      const r = await fetch('/api/assinatura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ acao: 'assinar', metodo }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.status === 503) { setIndisponivel(true); return }
      if (!r.ok) { setErro(j.erro ?? 'Falha ao criar a assinatura.'); return }
      if (j.pagamentoUrl) setPagamentoUrl(j.pagamentoUrl)
    } finally {
      setBusy(false)
    }
  }

  if (isPremium) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-8">
        <Card className="p-6 text-center">
          <p className="text-2xl mb-2">✓</p>
          <h2 className="font-bold tracking-tight text-lg">Você já é Premium</h2>
          <p className="text-sm text-dim mt-2">Gerencie a assinatura em <Link href="/plano" className="text-accent hover:underline">Plano &amp; assinatura</Link>.</p>
        </Card>
      </main>
    )
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-8">
      <div className="grid sm:grid-cols-[1fr_240px] gap-5 items-start">
        <Card className="p-6">
          <h2 className="font-bold tracking-tight text-xl">Assinar o Premium</h2>

          {indisponivel ? (
            <div className="mt-4 border border-warn/40 bg-warn/5 rounded-[var(--r-sm)] p-4">
              <p className="text-sm font-medium">Assinatura ainda não disponível</p>
              <p className="text-sm text-dim mt-1 leading-relaxed">
                O pagamento está em fase final de configuração. Volte em breve — o plano e o preço
                já estão definidos em <Link href="/planos" className="text-accent hover:underline">Planos</Link>.
              </p>
            </div>
          ) : pagamentoUrl ? (
            <div className="mt-4">
              <p className="text-sm text-dim leading-relaxed">
                Assinatura criada. Conclua o pagamento {metodo === 'pix' ? 'do Pix' : 'no cartão'} na página do
                nosso parceiro de cobrança — o Premium ativa automaticamente após a confirmação.
              </p>
              <a href={pagamentoUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center justify-center w-full mt-4 rounded-[var(--r-sm)] px-4 py-2.5 text-sm font-medium bg-accent text-white hover:brightness-110 transition">
                Abrir página de pagamento
              </a>
              <p className="text-xs text-faint mt-3">
                Após pagar, a pill do topo muda para <strong>Premium</strong> em alguns instantes (recarregue a página).
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs uppercase tracking-wide text-faint mt-4 mb-2">Forma de pagamento</p>
              <div className="grid grid-cols-2 gap-2">
                {([['pix', 'Pix', 'ativação após o pagamento'], ['cartao', 'Cartão de crédito', 'renovação automática']] as const).map(([k, label, sub]) => (
                  <button key={k} onClick={() => setMetodo(k)}
                    className={`text-left border rounded-[var(--r-sm)] px-3 py-2.5 transition-colors cursor-pointer ${
                      metodo === k ? 'border-accent bg-accent/5' : 'border-border hover:bg-surface-2'
                    }`}>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-dim mt-0.5">{sub}</p>
                  </button>
                ))}
              </div>
              {erro && <p className="text-xs text-danger mt-3">{erro}</p>}
              <Button full disabled={busy} onClick={assinar} className="mt-4">
                {busy ? 'Criando assinatura…' : 'Assinar por R$ 99,99/mês'}
              </Button>
              <p className="text-xs text-faint mt-3 leading-relaxed">
                Cobrança mensal via parceiro de pagamento. Cancele quando quiser em Plano &amp; assinatura —
                o acesso vale até o fim do período pago.
              </p>
            </>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="font-bold tracking-tight">Premium</p>
            <Badge tone="ok">R$ 99,99/mês</Badge>
          </div>
          <ul className="text-sm text-dim mt-3 space-y-2 leading-relaxed">
            {BENEFICIOS.map(b => <li key={b}>✓ {b}</li>)}
          </ul>
        </Card>
      </div>
    </main>
  )
}
