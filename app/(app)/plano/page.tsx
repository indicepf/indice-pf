'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, usuarioDoStorage } from '@/lib/supabase'
import { Badge, Button, Card, Modal, type BadgeTone } from '@/components/ui'
import { FASE_LANCAMENTO } from '@/lib/format'

type Assinatura = {
  id: number; status: string; plano: string; valor: number | null
  periodo_fim: string | null; criado_em: string
}

const STATUS: Record<string, { txt: string; tone: BadgeTone }> = {
  ativa:        { txt: 'ativa',            tone: 'ok' },
  pendente:     { txt: 'aguardando pagamento', tone: 'warn' },
  inadimplente: { txt: 'pagamento pendente',   tone: 'danger' },
  cancelada:    { txt: 'cancelada',        tone: 'neutral' },
}

export default function PlanoPage() {
  const [uid, setUid] = useState<string | null>(null)
  const [assinatura, setAssinatura] = useState<Assinatura | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [confirmaCancelar, setConfirmaCancelar] = useState(false)

  useEffect(() => {
    const u = usuarioDoStorage()
    if (u) { setUid(u.id); return }
    supabase.auth.getSession().then(({ data }) => setUid(data.session?.user?.id ?? null))
  }, [])
  useEffect(() => {
    if (!uid) return
    // RLS: usuário lê a própria; tabela pode nem existir ainda (migração 27 adiada) → trata como free
    supabase.from('assinaturas')
      .select('id,status,plano,valor,periodo_fim,criado_em')
      .eq('user_id', uid).order('criado_em', { ascending: false }).limit(1)
      .then(({ data, error }) => setAssinatura(error ? null : ((data?.[0] as Assinatura) ?? null)))
  }, [uid])

  async function cancelar() {
    setConfirmaCancelar(false)
    setErro(''); setBusy(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) { setErro('Sessão expirada — entre de novo.'); return }
      const r = await fetch('/api/assinatura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ acao: 'cancelar' }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErro(j.erro ?? 'Falha ao cancelar.'); return }
      setAssinatura(a => a ? { ...a, status: 'cancelada' } : a)
    } finally {
      setBusy(false)
    }
  }

  const viva = assinatura && ['ativa', 'pendente', 'inadimplente'].includes(assinatura.status)
  const st = assinatura ? (STATUS[assinatura.status] ?? STATUS.cancelada) : null

  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      {assinatura === undefined ? (
        <p className="text-sm text-dim">Carregando…</p>
      ) : viva ? (
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-bold tracking-tight text-lg">Índice PF Premium</h2>
            {st && <Badge tone={st.tone}>{st.txt}</Badge>}
          </div>
          <div className="text-sm text-dim mt-4 space-y-1.5">
            {assinatura!.valor != null && (
              <p>Mensalidade: <span className="text-ink tnum">
                {Number(assinatura!.valor) === 0 ? 'gratuita (fase de lançamento)' : `R$ ${Number(assinatura!.valor).toFixed(2).replace('.', ',')}`}
              </span></p>
            )}
            {assinatura!.periodo_fim && (
              <p>Acesso até: <span className="text-ink">{new Date(assinatura!.periodo_fim).toLocaleDateString('pt-BR')}</span></p>
            )}
            <p>Assinante desde: <span className="text-ink">{new Date(assinatura!.criado_em).toLocaleDateString('pt-BR')}</span></p>
          </div>
          {assinatura!.status === 'inadimplente' && (
            <p className="text-sm text-danger mt-3">
              O último pagamento não foi confirmado. Regularize na página de pagamento enviada por e-mail
              ou assine novamente.
            </p>
          )}
          {erro && <p className="text-xs text-danger mt-3">{erro}</p>}
          <Button variant="secondary" disabled={busy} onClick={() => setConfirmaCancelar(true)} className="mt-5">
            {busy ? 'Cancelando…' : 'Cancelar assinatura'}
          </Button>
          {confirmaCancelar && (
            <Modal title="Cancelar assinatura" onClose={() => setConfirmaCancelar(false)}>
              <p className="text-sm text-dim leading-relaxed">
                Cancelar a assinatura Premium? O acesso vale até o fim do período pago.
              </p>
              <div className="flex gap-2 mt-4">
                <Button variant="secondary" onClick={() => setConfirmaCancelar(false)}>Manter assinatura</Button>
                <Button onClick={cancelar}>Cancelar assinatura</Button>
              </div>
            </Modal>
          )}
        </Card>
      ) : (
        <>
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
            {assinatura?.status === 'cancelada' && (
              <p className="text-xs text-dim mt-3">Sua assinatura anterior foi cancelada{assinatura.periodo_fim ? ` — acesso Premium até ${new Date(assinatura.periodo_fim).toLocaleDateString('pt-BR')}` : ''}.</p>
            )}
          </Card>

          <Card className="p-6 mt-4 border-accent/40">
            <div className="flex items-center justify-between">
              <h2 className="font-bold tracking-tight text-lg">Premium</h2>
              <Badge tone="ok">{FASE_LANCAMENTO ? 'grátis no lançamento' : 'R$ 99,99/mês'}</Badge>
            </div>
            <ul className="text-sm text-dim mt-3 space-y-2 leading-relaxed">
              <li>✓ Preços por produto e por região</li>
              <li>✓ Exportação de dados (CSV/XLSX)</li>
              <li>✓ Série histórica completa por ingrediente</li>
              <li>✓ Sem anúncios</li>
            </ul>
            {FASE_LANCAMENTO && (
              <p className="text-xs text-dim mt-3 leading-relaxed">
                Durante a fase de lançamento o Premium é gratuito. Quando a assinatura paga
                (R$ 99,99/mês) entrar no ar, você será avisado com antecedência e nada será
                cobrado sem a sua confirmação.
              </p>
            )}
            <Link href="/assinar"
              className="inline-flex items-center justify-center w-full mt-5 rounded-[var(--r-sm)] px-4 py-2.5 text-sm font-medium bg-accent text-white hover:brightness-110 transition">
              {FASE_LANCAMENTO ? 'Ativar Premium gratuito' : 'Assinar o Premium'}
            </Link>
          </Card>
        </>
      )}
    </main>
  )
}
