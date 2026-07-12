'use client'

import { useEffect, useMemo, useState } from 'react'
import { getCalculadora, GRUPOS_CAT, type ItemCalc } from '@/lib/queries'
import { NIVEIS_PRECO, brl } from '@/lib/format'
import { CORES_GRUPO, NIVEL_HEX } from '@/lib/theme'
import { Button } from '@/components/ui'

// Calculadora de PF: o usuário monta o prato clicando nos ingredientes (chips
// por grupo de alimento) e ajustando a porção SERVIDA; compra e custo saem
// pela mesma metodologia do índice (compra = servido × rendimento do preparo).
type Linha = { id: number; g: number }

// porção servida sugerida ao adicionar, por grupo (ajustável na tabela)
const G_PADRAO: Record<string, number> = {
  'Proteína': 150, 'Base': 150, 'Guarnição': 100, 'Verdura/Fruta': 50,
  'Gordura/Laticínio': 15, 'Temperos': 3, 'Outro': 30,
}

export default function Calculadora() {
  const [itens, setItens] = useState<ItemCalc[] | null>(null)
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [nivel, setNivel] = useState('online')
  const [busca, setBusca] = useState('')

  useEffect(() => { getCalculadora().then(setItens).catch(() => setItens([])) }, [])

  const porId = useMemo(() => new Map((itens || []).map(i => [i.id, i])), [itens])
  const porGrupo = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const out: Record<string, ItemCalc[]> = {}
    for (const i of itens || []) {
      if (q && !i.nome.toLowerCase().includes(q)) continue
      ;(out[i.grupo] ||= []).push(i)
    }
    return out
  }, [itens, busca])

  const fator = 1 - (NIVEIS_PRECO.find(n => n.key === nivel)?.desc ?? 0)
  const usados = useMemo(() => new Set(linhas.map(l => l.id)), [linhas])

  function toggle(i: ItemCalc) {
    setLinhas(ls => usados.has(i.id)
      ? ls.filter(l => l.id !== i.id)
      : [...ls, { id: i.id, g: G_PADRAO[i.grupo] ?? 50 }])
  }

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
        Clique nos ingredientes para montar o prato e ajuste os gramas <b>servidos</b>. A calculadora
        corrige pelo rendimento do preparo e usa os preços da última coleta — a mesma metodologia do índice.
      </p>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <input className="f-search max-w-xs" value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar ingrediente..." aria-label="Buscar ingrediente" />
        <div className="segbar">
          {NIVEIS_PRECO.filter(n => n.disponivel).map(n => (
            <button key={n.key} className={nivel === n.key ? 'on' : ''} onClick={() => setNivel(n.key)}>
              <span style={{ background: NIVEL_HEX[n.key], width: 8, height: 8, borderRadius: '50%', display: 'inline-block', marginRight: 5 }} />
              {n.label}
            </button>
          ))}
        </div>
      </div>

      {/* montador: chips por grupo de alimento */}
      <div className="mt-4 space-y-3">
        {GRUPOS_CAT.map(g => {
          const lista = porGrupo[g]
          if (!lista?.length) return null
          return (
            <div key={g}>
              <p className="text-[0.68rem] uppercase tracking-[0.1em] font-bold text-dim mb-1.5 flex items-center gap-1.5">
                <span style={{ background: CORES_GRUPO[g], width: 9, height: 9, borderRadius: 3, display: 'inline-block' }} />
                {g}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {lista.map(i => {
                  const on = usados.has(i.id)
                  return (
                    <button key={i.id} onClick={() => toggle(i)} aria-pressed={on}
                      title={`${brl(i.preco_g * 1000 * fator)}/kg cru`}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition cursor-pointer ${
                        on ? 'bg-accent text-white border-accent'
                           : 'bg-surface text-ink-2 border-border-2 hover:border-accent/60 hover:text-ink'}`}>
                      {on ? '✓ ' : ''}{i.nome}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {calc.length > 0 ? (
        <>
          <h3 className="text-[13px] font-bold mt-6 mb-2">Seu prato ({calc.length} ingrediente{calc.length === 1 ? '' : 's'})</h3>
          <table className="tbl-mk compact">
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
      ) : (
        <p className="text-sm text-dim mt-6 border border-dashed border-border-2 rounded-[var(--r)] p-6 text-center">
          Clique nos ingredientes acima para montar o prato — ex.: uma proteína, arroz, feijão e uma salada.
        </p>
      )}
    </section>
  )
}
