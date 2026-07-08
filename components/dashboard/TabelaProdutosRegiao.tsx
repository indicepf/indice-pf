'use client'

import { useMemo, useState } from 'react'
import { REGIOES, brl } from '@/lib/format'
import type { ProdutoRegiao } from '@/lib/queries'

// Tabela premium da home no formato do mockup: panel com premium-tag no título
// e conteúdo coberto por .locked + .lock-overlay quando não assinante.
type SortCol = 'nome' | 'online' | string   // string = nome da região

export default function TabelaProdutosRegiao({ linhas, destravada, filtroNome, onLimparFiltro, onIngrediente }: {
  linhas: ProdutoRegiao[]; destravada: boolean
  filtroNome?: string; onLimparFiltro?: () => void
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
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Produtos por Região <span className="premium-tag">Premium</span></h2>
          <div className="sub">Detalhamento produto a produto — preço online nacional e campo por região</div>
        </div>
        <div className="panel-tools">
          {filtroNome && onLimparFiltro && (
            <button onClick={onLimparFiltro}
              className="text-xs bg-accent/10 text-accent border border-accent/30 rounded-full px-2.5 py-1 hover:bg-accent/20 transition cursor-pointer">
              pratos com {filtroNome} · limpar ×
            </button>
          )}
          {destravada && (
            <input className="f-search" style={{ width: 180 }} value={busca}
              onChange={e => setBusca(e.target.value)} placeholder="Buscar produto..." />
          )}
        </div>
      </div>
      <div className={destravada ? '' : 'locked'}>
        <div className={`overflow-x-auto ${destravada ? '' : 'select-none pointer-events-none'}`}
          aria-hidden={!destravada}>
          <table className="tbl-mk min-w-[44rem]">
            <thead>
              <tr>
                <th onClick={() => toggleSort('nome')}>Produto{seta('nome')}</th>
                <th style={{ textAlign: 'right' }} onClick={() => toggleSort('online')}>Online (nacional){seta('online')}</th>
                {REGIOES.map(r => (
                  <th key={r} style={{ textAlign: 'right' }} onClick={() => toggleSort(r)}>{r}{seta(r)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visiveis.map(l => (
                <tr key={l.id}
                  onClick={destravada && onIngrediente ? () => onIngrediente({ id: l.id, nome: l.nome }) : undefined}
                  style={destravada && onIngrediente ? undefined : { cursor: 'default' }}
                  title={destravada && onIngrediente ? 'Ver os pratos que usam este produto' : undefined}>
                  <td className="font-medium">{l.nome}</td>
                  <td className="text-right tnum">
                    {l.online != null ? `${brl(l.online)}${l.label ? `/${l.label}` : ''}` : '—'}
                  </td>
                  {REGIOES.map(r => {
                    const c = l.campo[r]
                    return (
                      <td key={r} className="text-right tnum text-dim">
                        {c ? <span title={`${c.n} leitura${c.n === 1 ? '' : 's'} de campo`}>{brl(c.valor)}/kg</span> : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {!visiveis.length && (
                <tr><td colSpan={2 + REGIOES.length} className="text-center text-dim" style={{ padding: '32px 16px' }}>Nenhum produto encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {!destravada && (
          <div className="lock-overlay">
            <div className="lk-ico">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            </div>
            <h3>Veja dados mais completos</h3>
            <p>Preço online nacional e preços de campo por região, produto a produto — no plano Premium.</p>
            <div className="price">Assine agora por <b>R$ 99,99</b>/mês</div>
            <a href="/assinar" className="btn-mk primary">Assinar Premium</a>
          </div>
        )}
      </div>
      <p className="text-xs text-faint" style={{ padding: '10px 20px 14px' }}>
        Preços de campo em R$/kg (itens vendidos por unidade ou maço convertidos pelo peso de referência);
        células vazias indicam região ainda sem leitura de campo para o produto.
      </p>
    </div>
  )
}
