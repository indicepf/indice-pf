'use client'

import { useEffect, useState, useCallback } from 'react'
import { brl, limparNome } from '@/lib/format'
import type { DishCost, ItemDetalhe, Fonte } from '@/lib/types'
import type { FonteManual } from '@/lib/queries'

export default function DetalhePrato({ dish, itens, fontesPorIngrediente, manuaisPorIngrediente, fator, onClose }: {
  dish: DishCost
  itens: ItemDetalhe[] | null
  fontesPorIngrediente: Record<number, Fonte[]>
  manuaisPorIngrediente: Record<number, FonteManual[]>
  fator: number
  onClose: () => void
}) {
  const [fonteAberta, setFonteAberta] = useState<{ nome: string; id: number } | null>(null)

  const total = (itens || []).reduce((s, i) => s + i.custo, 0) * fator

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/20" />
      <aside onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md bg-cream h-full overflow-y-auto border-l border-line shadow-xl">
        <div className="sticky top-0 bg-cream border-b border-line px-6 py-4 flex justify-between items-start">
          <div>
            <p className="text-[0.7rem] uppercase tracking-wide text-muted">{dish.pratos.regiao}</p>
            <h3 className="font-[family-name:var(--font-serif)] text-xl leading-tight mt-0.5">{limparNome(dish.pratos.nome)}</h3>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-2xl leading-none">×</button>
        </div>

        <div className="px-6 py-5">
          <div className="flex items-baseline justify-between mb-5">
            <span className="text-sm text-muted">Custo do prato</span>
            <span className="font-[family-name:var(--font-serif)] text-3xl text-paprika tnum">{brl(total)}</span>
          </div>

          {!itens ? (
            <p className="text-sm text-muted">Carregando composição…</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[0.65rem] uppercase tracking-wide text-muted border-b border-line">
                  <th className="font-medium py-2">Ingrediente</th>
                  <th className="font-medium py-2 text-right">Qtd</th>
                  <th className="font-medium py-2 text-right">Custo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {itens.map(i => (
                  <tr key={i.ingrediente_id} className="border-b border-line/60">
                    <td className="py-2">
                      {i.nome}
                      {i.origem === 'manual' && <Etiqueta texto="manual" />}
                      {i.origem === 'misto' && <Etiqueta texto="manual+online" />}
                      {i.origem === 'fixo' && <Etiqueta texto="fixo" />}
                      {i.origem === 'sem' && <Etiqueta texto="sem preço" />}
                    </td>
                    <td className="py-2 text-right text-muted tnum">{i.qtd_g} g</td>
                    <td className="py-2 text-right tnum">{brl(i.custo * fator)}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {(i.origem === 'online' || i.origem === 'manual' || i.origem === 'misto') && (
                        <button onClick={() => setFonteAberta({ nome: i.nome, id: i.ingrediente_id })}
                          className="text-xs text-paprika hover:underline">fontes</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </aside>

      {fonteAberta && (
        <ModalFontes nome={fonteAberta.nome}
          fontes={fontesPorIngrediente[fonteAberta.id] || []}
          manuais={manuaisPorIngrediente[fonteAberta.id] || []}
          onClose={() => setFonteAberta(null)} />
      )}
    </div>
  )
}

function Etiqueta({ texto }: { texto: string }) {
  return <span className="ml-1.5 text-[0.6rem] uppercase tracking-wide text-muted border border-line rounded px-1 py-px align-middle">{texto}</span>
}

function ModalFontes({ nome, fontes, manuais, onClose }: {
  nome: string; fontes: Fonte[]; manuais: FonteManual[]; onClose: () => void
}) {
  const esc = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }, [onClose])
  useEffect(() => { document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc) }, [esc])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 px-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-panel border border-line rounded-lg max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-xl">
        <div className="flex justify-between items-center px-5 py-4 border-b border-line sticky top-0 bg-panel">
          <h4 className="font-[family-name:var(--font-serif)] text-lg">Fontes — {nome}</h4>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">×</button>
        </div>
        <div className="p-4 space-y-4">
          {manuais.length > 0 && (
            <div className="space-y-2">
              <p className="text-[0.65rem] uppercase tracking-wide text-muted">Leituras manuais (últimos 5 dias)</p>
              {manuais.map((m, i) => (
                <div key={i} className="border border-line rounded-md px-3 py-2.5">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm truncate">{m.loja || 'Coleta manual'}</p>
                      <p className="text-xs text-muted">{new Date(m.criado_em).toLocaleDateString('pt-BR')}
                        {m.link && <> · <a href={m.link} target="_blank" rel="noopener noreferrer" className="text-paprika hover:underline">link</a></>}
                      </p>
                    </div>
                    <p className="text-sm font-medium tnum text-paprika shrink-0">{m.preco_manual != null ? `${brl(Number(m.preco_manual))}/kg` : '—'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {fontes.length > 0 && (
            <div className="space-y-2">
              {manuais.length > 0 && <p className="text-[0.65rem] uppercase tracking-wide text-muted">Fontes online</p>}
              {fontes.map((f, i) => (
                <a key={i} href={f.link || undefined} target="_blank" rel="noopener noreferrer"
                  className="block border border-line rounded-md px-3 py-2.5 hover:border-paprika transition-colors">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm truncate">{f.titulo}</p>
                      <p className="text-xs text-muted">{f.loja}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium tnum text-paprika">{brl(Number(f.preco_bruto))}</p>
                      <p className="text-xs text-muted">{f.exibicao}</p>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
          {!manuais.length && !fontes.length && <p className="text-sm text-muted">Sem fontes registradas.</p>}
        </div>
      </div>
    </div>
  )
}
