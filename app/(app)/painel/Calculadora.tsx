'use client'

import { useEffect, useMemo, useState } from 'react'
import { getCalculadora, type ItemCalc } from '@/lib/queries'
import { NIVEIS_PRECO, brl } from '@/lib/format'
import { NIVEL_HEX } from '@/lib/theme'
import { Button, Select } from '@/components/ui'

// Calculadora de PF: o usuário monta o prato informando a porção SERVIDA de
// cada ingrediente; a compra e o custo saem pela mesma metodologia do índice
// (compra = servido × rendimento do preparo; custo = preço × compra).
type Linha = { id: number; g: number }

export default function Calculadora() {
  const [itens, setItens] = useState<ItemCalc[] | null>(null)
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [nivel, setNivel] = useState('online')

  useEffect(() => { getCalculadora().then(setItens).catch(() => setItens([])) }, [])

  const porId = useMemo(() => new Map((itens || []).map(i => [i.id, i])), [itens])
  const fator = 1 - (NIVEIS_PRECO.find(n => n.key === nivel)?.desc ?? 0)
  const usados = new Set(linhas.map(l => l.id))
  const disponiveis = (itens || []).filter(i => !usados.has(i.id))

  const calc = linhas.map(l => {
    const i = porId.get(l.id)!
    const compra = l.g * i.fc
    return { ...l, item: i, compra, custo: i.preco_g * compra * fator }
  })
  const total = calc.reduce((s, c) => s + c.custo, 0)
  const servido = calc.reduce((s, c) => s + c.g, 0)

  if (itens === null) return <p className="text-sm text-dim">Carregando ingredientes…</p>
  if (!itens.length) return <p className="text-sm text-dim">Sem preços disponíveis no momento.</p>

  return (
    <section>
      <p className="text-sm text-dim leading-relaxed">
        Monte seu prato: escolha os ingredientes e informe quantos gramas quer <b>no prato</b>.
        A calculadora corrige pelo rendimento do preparo e usa os preços da última coleta —
        a mesma metodologia do índice.
      </p>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <Select value="" onChange={e => {
          const id = Number(e.target.value)
          if (id) setLinhas(ls => [...ls, { id, g: 100 }])
        }} className="max-w-xs">
          <option value="">Adicionar ingrediente…</option>
          {disponiveis.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
        </Select>
        <div className="segbar">
          {NIVEIS_PRECO.filter(n => n.disponivel).map(n => (
            <button key={n.key} className={nivel === n.key ? 'on' : ''} onClick={() => setNivel(n.key)}>
              <span className="sw" style={{ background: NIVEL_HEX[n.key], width: 8, height: 8, borderRadius: '50%', display: 'inline-block', marginRight: 5 }} />
              {n.label}
            </button>
          ))}
        </div>
      </div>

      {calc.length > 0 && (
        <>
          <table className="tbl-mk compact mt-4">
            <thead>
              <tr>
                <th style={{ cursor: 'default' }}>Ingrediente</th>
                <th style={{ textAlign: 'right', cursor: 'default' }} title="Quanto você quer servido no prato">No prato (g)</th>
                <th style={{ textAlign: 'right', cursor: 'default' }} title="Quanto comprar cru, corrigido pelo rendimento do preparo">Compra (g)</th>
                <th className="max-sm:hidden" style={{ textAlign: 'right', cursor: 'default' }}>Preço/kg</th>
                <th style={{ textAlign: 'right', cursor: 'default' }}>Custo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {calc.map(c => (
                <tr key={c.id}>
                  <td className="font-medium">{c.item.nome}</td>
                  <td className="text-right">
                    <input type="number" min={1} max={2000} value={c.g}
                      aria-label={`Gramas de ${c.item.nome} no prato`}
                      onChange={e => {
                        const g = Math.max(0, Number(e.target.value))
                        setLinhas(ls => ls.map(l => l.id === c.id ? { ...l, g } : l))
                      }}
                      className="w-20 text-right tnum border border-border rounded-[var(--r-sm)] px-2 py-1 bg-surface" />
                  </td>
                  <td className="text-right tnum text-dim">{c.compra.toFixed(1)}</td>
                  <td className="max-sm:hidden text-right tnum text-dim">{brl(c.item.preco_g * 1000 * fator)}</td>
                  <td className="text-right tnum font-medium">{brl(c.custo)}</td>
                  <td className="text-right">
                    <button aria-label={`Remover ${c.item.nome}`}
                      onClick={() => setLinhas(ls => ls.filter(l => l.id !== c.id))}
                      className="text-dim hover:text-danger cursor-pointer px-1">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="grid sm:grid-cols-3 gap-3 mt-4">
            <div className="stat-mini"><span className="k">Custo do seu prato</span><b className="tnum">{brl(total)}</b></div>
            <div className="stat-mini"><span className="k">Peso servido</span><b className="tnum">{Math.round(servido)} g</b></div>
            <div className="stat-mini"><span className="k">Custo por 100 g servidos</span><b className="tnum">{servido > 0 ? brl(total / servido * 100) : '—'}</b></div>
          </div>

          <div className="mt-4">
            <Button variant="secondary" onClick={() => setLinhas([])}>Limpar prato</Button>
          </div>
        </>
      )}

      {!calc.length && (
        <p className="text-sm text-dim mt-6 border border-dashed border-border-2 rounded-[var(--r)] p-6 text-center">
          Adicione o primeiro ingrediente para começar — ex.: arroz 150 g no prato, bife 160 g.
        </p>
      )}
    </section>
  )
}
