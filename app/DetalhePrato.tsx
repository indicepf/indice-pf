'use client'

import { useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { brl, limparNome } from '@/lib/format'
import { DIM, NIVEL_HEX } from '@/lib/theme'
import ModalFontes from './ModalFontes'
import type { DishCost, ItemDetalhe, Fonte, ModoKey } from '@/lib/types'
import type { FonteManual } from '@/lib/queries'

// série de custo do prato pelas coletas (para o gráfico do drill, como no mockup)
export type SerieDoPrato = { labels: string[]; valores: (number | null)[] }

export default function DetalhePrato({ dish, itens, fontesPorIngrediente, manuaisPorIngrediente, fator, modo = 'online', dataColeta, serie, onClose }: {
  dish: DishCost
  itens: ItemDetalhe[] | null
  fontesPorIngrediente: Record<number, Fonte[]>
  manuaisPorIngrediente: Record<number, FonteManual[]>
  fator: number
  modo?: ModoKey
  dataColeta?: string
  serie?: SerieDoPrato
  onClose: () => void
}) {
  const [fonteAberta, setFonteAberta] = useState<{ nome: string; id: number; origem: ItemDetalhe['origem'] } | null>(null)

  const total = (itens || []).reduce((s, i) => s + i.custo, 0) * fator

  // pontos do gráfico e variações (vs coleta anterior e vs 1ª coleta)
  const pontos = (serie?.valores ?? [])
    .map((v, i) => v != null ? { data: serie!.labels[i], valor: +(v * fator).toFixed(2) } : null)
    .filter((p): p is { data: string; valor: number } => p != null)
  const vAtual = pontos[pontos.length - 1]?.valor
  const vAnt = pontos[pontos.length - 2]?.valor
  const vIni = pontos[0]?.valor
  const dAnt = vAtual != null && vAnt != null && vAnt > 0 ? (vAtual - vAnt) / vAnt * 100 : null
  const dIni = vAtual != null && vIni != null && vIni > 0 && pontos.length > 2 ? (vAtual - vIni) / vIni * 100 : null

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/20" />
      <aside onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md bg-bg h-full overflow-y-auto border-l border-border shadow-[var(--shadow-lg)]">
        <div className="sticky top-0 bg-surface border-b border-border px-6 py-4 flex justify-between items-start z-10">
          <div>
            <p className="text-[0.7rem] uppercase tracking-wide text-dim">{dish.pratos.regiao}</p>
            <h3 className="font-bold tracking-tight text-xl leading-tight mt-0.5">{limparNome(dish.pratos.nome)}</h3>
          </div>
          <button onClick={onClose} className="text-dim hover:text-ink text-2xl leading-none cursor-pointer">×</button>
        </div>

        <div className="px-6 py-5">
          <div className="flex items-baseline justify-between mb-4">
            <span className="text-sm text-dim">Custo do prato</span>
            <span className="font-bold tracking-tight text-3xl text-accent tnum">{brl(total)}</span>
          </div>

          {/* evolução do custo do prato (mockup: gráfico no drill) */}
          {pontos.length >= 2 && (
            <div className="panel mb-4">
              <div className="panel-body" style={{ padding: 14 }}>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={pontos} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="data" tick={{ fontSize: 11, fill: DIM }} />
                      <YAxis tick={{ fontSize: 11, fill: DIM }} width={46} domain={['auto', 'auto']}
                        tickFormatter={(v: number) => `R$${v}`} />
                      <Tooltip formatter={(v) => brl(Number(v))} />
                      <Line type="monotone" dataKey="valor" name="Custo"
                        stroke={NIVEL_HEX[modo] ?? 'var(--azul)'} strokeWidth={2.5} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="rounded-[12px] bg-surface-2 p-3">
                    <span className="text-[0.65rem] uppercase tracking-wide text-dim block">vs coleta anterior</span>
                    <b className="text-xl tnum" style={{ color: dAnt == null ? 'var(--faint)' : dAnt > 0 ? 'var(--danger)' : 'var(--ok)' }}>
                      {dAnt == null ? '—' : `${dAnt > 0 ? '+' : ''}${dAnt.toFixed(1)}%`}
                    </b>
                  </div>
                  <div className="rounded-[12px] bg-surface-2 p-3">
                    <span className="text-[0.65rem] uppercase tracking-wide text-dim block">desde a 1ª coleta</span>
                    <b className="text-xl tnum" style={{ color: dIni == null ? 'var(--faint)' : dIni > 0 ? 'var(--danger)' : 'var(--ok)' }}>
                      {dIni == null ? '—' : `${dIni > 0 ? '+' : ''}${dIni.toFixed(1)}%`}
                    </b>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!itens ? (
            <p className="text-sm text-dim">Carregando composição…</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[0.65rem] uppercase tracking-wide text-dim border-b border-border">
                  <th className="font-medium py-2">Ingrediente</th>
                  <th className="font-medium py-2 text-right">Qtd</th>
                  <th className="font-medium py-2 text-right">Custo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {itens.map(i => (
                  <tr key={i.ingrediente_id} className="border-b border-border/60">
                    <td className="py-2">
                      {i.nome}
                      {i.origem === 'manual' && <Etiqueta texto="manual" />}
                      {i.origem === 'misto' && <Etiqueta texto="manual+online" />}
                      {i.origem === 'fixo' && <Etiqueta texto="fixo" />}
                      {i.origem === 'sem' && <Etiqueta texto="sem preço" />}
                    </td>
                    <td className="py-2 text-right text-dim tnum">{i.qtd_g} g</td>
                    <td className="py-2 text-right tnum">{brl(i.custo * fator)}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {(i.origem === 'online' || i.origem === 'manual' || i.origem === 'misto') && (
                        <button onClick={() => setFonteAberta({ nome: i.nome, id: i.ingrediente_id, origem: i.origem })}
                          className="text-xs text-accent hover:underline cursor-pointer">fontes</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* nota do mockup — manter o texto (validação de aproveitamento pendente com o responsável) */}
          <p className="text-xs text-dim leading-relaxed mt-4 border border-border rounded-[var(--r-sm)] bg-surface p-3">
            Preço final calculado sobre aproveitamento (peso do produto já cozido). Ex.: alho cru 5g → 4g
            aproveitados. A redução por ingrediente está na base de estruturação do prato.
          </p>
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
  return <span className="ml-1.5 text-[0.6rem] uppercase tracking-wide text-dim border border-border rounded px-1 py-px align-middle">{texto}</span>
}
