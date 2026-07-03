'use client'

import { useState } from 'react'
import { brl, limparNome } from '@/lib/format'
import ModalFontes from './ModalFontes'
import type { DishCost, ItemDetalhe, Fonte } from '@/lib/types'
import type { FonteManual } from '@/lib/queries'

export default function DetalhePrato({ dish, itens, fontesPorIngrediente, manuaisPorIngrediente, fator, dataColeta, onClose }: {
  dish: DishCost
  itens: ItemDetalhe[] | null
  fontesPorIngrediente: Record<number, Fonte[]>
  manuaisPorIngrediente: Record<number, FonteManual[]>
  fator: number
  dataColeta?: string
  onClose: () => void
}) {
  const [fonteAberta, setFonteAberta] = useState<{ nome: string; id: number; origem: ItemDetalhe['origem'] } | null>(null)

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
                        <button onClick={() => setFonteAberta({ nome: i.nome, id: i.ingrediente_id, origem: i.origem })}
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
          manuais={(fonteAberta.origem === 'manual' || fonteAberta.origem === 'misto') ? (manuaisPorIngrediente[fonteAberta.id] || []) : []}
          dataColeta={dataColeta}
          onClose={() => setFonteAberta(null)} />
      )}
    </div>
  )
}

function Etiqueta({ texto }: { texto: string }) {
  return <span className="ml-1.5 text-[0.6rem] uppercase tracking-wide text-muted border border-line rounded px-1 py-px align-middle">{texto}</span>
}

