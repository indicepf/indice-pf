'use client'

import { useMemo, useState } from 'react'
import { REGIOES, brl } from '@/lib/format'
import type { ProdutoRegiao } from '@/lib/queries'
import { Card, Input } from '@/components/ui'

// Tabela premium da home: preço online nacional + preço de campo por região.
// O gating real (assinatura) entra na Fase 8 — por ora o conteúdo fica
// coberto pelo overlay com CTA para /planos (visual, como no mockup).
type SortCol = 'nome' | 'online' | string   // string = nome da região

export default function TabelaProdutosRegiao({ linhas, destravada, onIngrediente }: {
  linhas: ProdutoRegiao[]; destravada: boolean
  onIngrediente?: (ing: { id: number; nome: string }) => void
}) {
  const [busca, setBusca] = useState('')
  const [sort, setSort] = useState<{ col: SortCol; dir: 1 | -1 }>({ col: 'nome', dir: 1 })

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const l = q ? linhas.filter(x => (x.nome || '').toLowerCase().includes(q)) : linhas
    const { col, dir } = sort
    const valor = (x: ProdutoRegiao): number | string | null =>
      col === 'nome' ? (x.nome || '') : col === 'online' ? x.online : (x.campo[col]?.valor ?? null)
    return [...l].sort((a, b) => {
      const va = valor(a), vb = valor(b)
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb)) * dir
      if (va == null && vb == null) return 0
      if (va == null) return 1   // sem dado vai para o fim, em qualquer direção
      if (vb == null) return -1
      return (va - vb) * dir
    })
  }, [linhas, busca, sort])

  function toggleSort(col: SortCol) {
    setSort(s => s.col === col ? { col, dir: s.dir === 1 ? -1 : 1 } : { col, dir: 1 })
  }
  const seta = (col: SortCol) => sort.col === col ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''

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
              <tr className="text-left text-xs uppercase tracking-wide text-dim border-b border-border select-none">
                <th className="font-medium px-4 py-3">
                  <button onClick={() => toggleSort('nome')} className={`uppercase tracking-wide cursor-pointer hover:text-ink transition-colors ${sort.col === 'nome' ? 'text-ink' : ''}`}>
                    Produto{seta('nome')}
                  </button>
                </th>
                <th className="font-medium px-4 py-3 text-right">
                  <button onClick={() => toggleSort('online')} className={`uppercase tracking-wide cursor-pointer hover:text-ink transition-colors ${sort.col === 'online' ? 'text-ink' : ''}`}>
                    Online (nacional){seta('online')}
                  </button>
                </th>
                {REGIOES.map(r => (
                  <th key={r} className="font-medium px-4 py-3 text-right">
                    <button onClick={() => toggleSort(r)} className={`uppercase tracking-wide cursor-pointer hover:text-ink transition-colors ${sort.col === r ? 'text-ink' : ''}`}>
                      {r}{seta(r)}
                    </button>
                  </th>
                ))}
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
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mx-auto mb-2 text-dim" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
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
