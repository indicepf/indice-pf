'use client'

import { useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { NIVEIS_PRECO, brl, limparNome } from '@/lib/format'
import { DIM, NIVEL_HEX } from '@/lib/theme'
import ModalFontes from './ModalFontes'
import type { DishCost, ItemDetalhe, Fonte, ModoKey } from '@/lib/types'
import type { FonteManual } from '@/lib/queries'

export type SerieDoPrato = { labels: string[]; valores: (number | null)[] }

// Drill do prato — modal central do mockup (openDishDrill): head, segbar de
// níveis, gráfico, stats, ações e a composição por ingrediente.
export default function DetalhePrato({ dish, itens, fontesPorIngrediente, manuaisPorIngrediente, modo = 'online', dataColeta, serie, onShare, onClose }: {
  dish: DishCost
  itens: ItemDetalhe[] | null
  fontesPorIngrediente: Record<number, Fonte[]>
  manuaisPorIngrediente: Record<number, FonteManual[]>
  fator?: number
  modo?: ModoKey
  dataColeta?: string
  serie?: SerieDoPrato
  onShare?: () => void
  onClose: () => void
}) {
  const [fonteAberta, setFonteAberta] = useState<{ nome: string; id: number; origem: ItemDetalhe['origem'] } | null>(null)
  const [nivel, setNivel] = useState<ModoKey>(modo)
  const f = 1 - (NIVEIS_PRECO.find(n => n.key === nivel)?.desc ?? 0)

  const total = (itens || []).reduce((s, i) => s + i.custo, 0) * f
  const pontos = (serie?.valores ?? [])
    .map((v, i) => v != null ? { data: serie!.labels[i], valor: +(v * f).toFixed(2) } : null)
    .filter((p): p is { data: string; valor: number } => p != null)
  const vA = pontos[pontos.length - 1]?.valor, vP = pontos[pontos.length - 2]?.valor, v0 = pontos[0]?.valor
  const dAnt = vA != null && vP != null && vP > 0 ? (vA - vP) / vP * 100 : null
  const dIni = vA != null && v0 != null && v0 > 0 && pontos.length > 2 ? (vA - v0) / v0 * 100 : null
  const cor = (v: number | null) => v == null ? 'var(--faint)' : v > 0 ? 'var(--danger)' : 'var(--ok)'
  const pct = (v: number | null) => v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`

  return (
    <div className="modal-back z-[100]" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="modal-mk wide">
        <div className="modal-head">
          <div>
            <h2>{limparNome(dish.pratos.nome)}</h2>
            <p>{dish.pratos.regiao}{dataColeta ? ` · coleta de ${dataColeta.split('-').reverse().join('/')}` : ''} · margem ±5%</p>
          </div>
          <div className="modal-x" onClick={onClose}>×</div>
        </div>

        <div className="modal-body">
          <div className="segbar" style={{ marginBottom: 14 }}>
            {NIVEIS_PRECO.map(n => (
              <button key={n.key} disabled={!n.disponivel} className={nivel === n.key ? 'on' : ''}
                onClick={() => n.disponivel && setNivel(n.key as ModoKey)}>
                {n.grupo === 'consumidor' ? (n.key === 'online' ? 'Online' : 'Mercado') : n.label}
              </button>
            ))}
          </div>

          {pontos.length >= 2 && (
            <div className="h-52 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={pontos} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="data" tick={{ fontSize: 11, fill: DIM }} />
                  <YAxis tick={{ fontSize: 11, fill: DIM }} width={46} domain={['auto', 'auto']} tickFormatter={(v: number) => `R$${v}`} />
                  <Tooltip formatter={(v) => brl(Number(v))} />
                  <Line type="monotone" dataKey="valor" name="Custo" stroke={NIVEL_HEX[nivel]} strokeWidth={2.5} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="stat-mini"><span className="k">Custo atual</span><b className="tnum">{brl(total)}</b></div>
            <div className="stat-mini"><span className="k">vs coleta anterior</span><b className="tnum" style={{ color: cor(dAnt) }}>{pct(dAnt)}</b></div>
            <div className="stat-mini"><span className="k">desde a 1ª coleta</span><b className="tnum" style={{ color: cor(dIni) }}>{pct(dIni)}</b></div>
          </div>

          <div className="flex gap-2 mt-4">
            {onShare && <button className="btn-mk primary" onClick={onShare}>Compartilhar</button>}
            <button className="btn-mk" onClick={onClose}>Fechar</button>
          </div>

          <h3 className="text-[13px] font-bold mt-6 mb-2">Composição do prato</h3>
          {!itens ? (
            <p className="text-sm text-dim">Carregando composição…</p>
          ) : (
            <table className="tbl-mk">
              <thead>
                <tr><th>Ingrediente</th><th style={{ textAlign: 'right' }}>Qtd</th><th style={{ textAlign: 'right' }}>Custo</th><th></th></tr>
              </thead>
              <tbody>
                {itens.map(i => (
                  <tr key={i.ingrediente_id} style={{ cursor: 'default' }}>
                    <td>{i.nome}
                      {i.origem === 'manual' && <Etq t="manual" />}
                      {i.origem === 'misto' && <Etq t="manual+online" />}
                      {i.origem === 'fixo' && <Etq t="fixo" />}
                      {i.origem === 'sem' && <Etq t="sem preço" />}
                    </td>
                    <td className="text-right text-dim tnum">{i.qtd_g} g</td>
                    <td className="text-right tnum">{brl(i.custo * f)}</td>
                    <td className="text-right whitespace-nowrap">
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

          <p className="text-xs text-dim leading-relaxed mt-4 border border-border rounded-[var(--r-sm)] bg-surface-2 p-3">
            Preço final calculado sobre aproveitamento (peso do produto já cozido). Ex.: alho cru 5g → 4g
            aproveitados. A redução por ingrediente está na base de estruturação do prato.
          </p>
        </div>
      </div>

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

function Etq({ t }: { t: string }) {
  return <span className="ml-1.5 text-[0.6rem] uppercase tracking-wide text-dim border border-border rounded px-1 py-px align-middle">{t}</span>
}
