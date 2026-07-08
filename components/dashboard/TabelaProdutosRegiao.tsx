'use client'

import { useMemo, useState } from 'react'
import { REGIOES, brl } from '@/lib/format'
import type { ProdutoRegiao } from '@/lib/queries'
import { Card, Input } from '@/components/ui'

// Tabela premium da home: preço online nacional + preço de campo por região.
// O gating real (assinatura) entra na Fase 8 — por ora o conteúdo fica
// coberto pelo overlay com CTA para /planos (visual, como no mockup).
export default function TabelaProdutosRegiao({ linhas, destravada, onIngrediente }: {
  linhas: ProdutoRegiao[]; destravada: boolean
  onIngrediente?: (ing: { id: number; nome: string }) => void
}) {
  const [busca, setBusca] = useState('')

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? linhas.filter(l => (l.nome || '').toLowerCase().includes(q)) : linhas
  }, [linhas, busca])

  const visiveis = destravada ? filtradas : filtradas.slice(0, 8)

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <h2 className="font-bold tracking-tight text-xl">Produtos por região</h2>
        {destravada && (
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar produto…"
            className="mt-0 w-full sm:w-56" />
        )}
      </div>
      <Card className="overflow-hidden relative">
        <div className={`overflow-x-auto ${destravada ? '' : 'select-none pointer-events-none'}`}
          aria-hidden={!destravada}>
          <table className="w-full text-sm min-w-[44rem]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-dim border-b border-border">
                <th className="font-medium px-4 py-3">Produto</th>
                <th className="font-medium px-4 py-3 text-right">Online (nacional)</th>
                {REGIOES.map(r => <th key={r} className="font-medium px-4 py-3 text-right">{r}</th>)}
              </tr>
            </thead>
            <tbody className={destravada ? '' : 'blur-[5px]'}>
              {visiveis.map(l => (
                <tr key={l.id}
                  onClick={destravada && onIngrediente ? () => onIngrediente({ id: l.id, nome: l.nome }) : undefined}
                  className={`border-b border-border/70 last:border-0 ${destravada && onIngrediente ? 'hover:bg-surface-2 cursor-pointer transition-colors' : ''}`}
                  title={destravada && onIngrediente ? 'Ver os pratos que usam este produto' : undefined}>
                  <td className="px-4 py-2.5">{l.nome}</td>
                  <td className="px-4 py-2.5 text-right tnum">
                    {l.online != null ? `${brl(l.online)}${l.label ? `/${l.label}` : ''}` : '—'}
                  </td>
                  {REGIOES.map(r => {
                    const c = l.campo[r]
                    return (
                      <td key={r} className="px-4 py-2.5 text-right tnum text-dim">
                        {c ? <span title={`${c.n} leitura${c.n === 1 ? '' : 's'} de campo`}>{brl(c.valor)}/kg</span> : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {!visiveis.length && (
                <tr><td colSpan={2 + REGIOES.length} className="px-4 py-8 text-center text-dim">Nenhum produto encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {!destravada && (
          <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-transparent via-surface/60 to-surface p-6">
            <div className="text-center max-w-xs">
              <p className="text-2xl mb-2" aria-hidden="true">🔒</p>
              <p className="font-bold tracking-tight">Detalhamento por produto e região</p>
              <p className="text-sm text-dim mt-1.5 leading-relaxed">
                Preço online nacional e preços de campo por região, produto a produto — no plano Premium.
              </p>
              <a href="/assinar"
                className="inline-flex items-center justify-center mt-4 rounded-[var(--r-sm)] px-4 py-2 text-sm font-medium bg-accent text-white hover:brightness-110 transition">
                Conhecer o Premium
              </a>
            </div>
          </div>
        )}
      </Card>
      <p className="text-xs text-faint mt-2">
        Preços de campo em R$/kg (itens vendidos por unidade ou maço convertidos pelo peso de referência);
        células vazias indicam região ainda sem leitura de campo para o produto.
      </p>
    </div>
  )
}
