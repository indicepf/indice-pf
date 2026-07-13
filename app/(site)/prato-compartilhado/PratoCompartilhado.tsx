'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { getCalculadora, getSeriePrecos, type ItemCalc, type SeriePrecos } from '@/lib/queries'
import { NIVEIS_PRECO, brl } from '@/lib/format'
import { NIVEL_HEX, DIM } from '@/lib/theme'

// Visão pública e somente-leitura de um prato montado na calculadora.
// Segurança: itens vêm da URL (ids validados contra o catálogo público,
// máx. 30 linhas), nome exibido como texto puro; nenhuma consulta a dados
// de usuário. Preços = mesmos endpoints públicos da home (RLS anon).
const MAX_ITENS = 30
const tsDe = (d: string) => new Date(d + 'T00:00:00').getTime()
const fmtMs = (ms: number) => { const d = new Date(ms); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` }

export default function PratoCompartilhado() {
  const params = useSearchParams()
  const [itens, setItens] = useState<ItemCalc[] | null>(null)
  const [serie, setSerie] = useState<SeriePrecos | null>(null)

  useEffect(() => {
    getCalculadora().then(setItens).catch(() => setItens([]))
    getSeriePrecos().then(setSerie).catch(() => {})
  }, [])

  const nome = (params.get('nome') || '').slice(0, 80)
  const nivelParam = params.get('nivel') || 'online'
  const nivel = NIVEIS_PRECO.some(n => n.key === nivelParam && n.disponivel) ? nivelParam : 'online'
  const fator = 1 - (NIVEIS_PRECO.find(n => n.key === nivel)?.desc ?? 0)

  const linhas = useMemo(() => (params.get('itens') || '').split(',').slice(0, MAX_ITENS)
    .map(p => { const [id, g] = p.split(':').map(Number); return { id, g } })
    .filter(l => Number.isFinite(l.id) && l.id > 0 && Number.isFinite(l.g) && l.g > 0 && l.g <= 5000), [params])

  const porId = useMemo(() => new Map((itens || []).map(i => [i.id, i])), [itens])
  const calc = linhas.map(l => {
    const i = porId.get(l.id); if (!i) return null
    const compra = l.g * i.fc
    return { item: i, g: l.g, compra, custo: i.preco_g * compra * fator }
  }).filter((x): x is NonNullable<typeof x> => x != null).sort((a, b) => b.custo - a.custo)
  const total = calc.reduce((s, c) => s + c.custo, 0)
  const servido = calc.reduce((s, c) => s + c.g, 0)

  const seriePrato = useMemo(() => {
    if (!serie || !calc.length) return []
    return serie.snaps.map((s, idx) => {
      let v = 0
      for (const c of calc) { const p = serie.precoG[c.item.id]?.[idx]; if (p != null) v += p * c.compra }
      return { ts: tsDe(s.data), valor: +(v * fator).toFixed(2) }
    }).filter(p => p.valor > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serie, porId, linhas, fator])

  return (
    <main className="site-main" style={{ marginTop: 0, paddingTop: 40 }}>
      <div className="box" style={{ maxWidth: 760, margin: '0 auto 20px' }}>
        <p className="hint" style={{ marginBottom: 4 }}>Prato montado na calculadora do Índice PF</p>
        <h1 className="text-2xl font-extrabold tracking-tight">{nome || 'Prato compartilhado'}</h1>
        {itens === null ? (
          <p className="text-sm text-dim mt-3">Carregando preços…</p>
        ) : !calc.length ? (
          <p className="text-sm text-dim mt-3">Este link não tem um prato válido — peça um novo link para quem compartilhou.</p>
        ) : (
          <>
            <p style={{ color: 'var(--ink-2)', lineHeight: 1.7, marginTop: 10 }}>
              Produzir este prato custa <b className="tnum">{brl(total)}</b> hoje
              ({NIVEIS_PRECO.find(n => n.key === nivel)?.label}), para ~{Math.round(servido)} g servidos
              — {servido > 0 ? `${brl(total / servido * 100)} por 100 g` : ''}.
            </p>

            <table className="tbl-mk compact mt-4">
              <thead>
                <tr>
                  <th style={{ cursor: 'default' }}>Ingrediente</th>
                  <th style={{ textAlign: 'right', cursor: 'default' }}>No prato (g)</th>
                  <th style={{ textAlign: 'right', cursor: 'default' }}>Compra (g)</th>
                  <th style={{ textAlign: 'right', cursor: 'default' }}>Custo</th>
                </tr>
              </thead>
              <tbody>
                {calc.map(c => (
                  <tr key={c.item.id} style={{ cursor: 'default' }}>
                    <td className="font-medium">{c.item.nome}</td>
                    <td className="text-right tnum text-dim">{c.g}</td>
                    <td className="text-right tnum text-dim">{c.compra.toFixed(1)}</td>
                    <td className="text-right tnum font-medium">{brl(c.custo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {seriePrato.length >= 2 && (
              <div className="h-48 mt-5">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={seriePrato} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="grad-shared" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={NIVEL_HEX[nivel]} stopOpacity={0.22} />
                        <stop offset="100%" stopColor={NIVEL_HEX[nivel]} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']}
                      tickFormatter={fmtMs} tick={{ fontSize: 11, fill: DIM }} />
                    <YAxis tick={{ fontSize: 11, fill: DIM }} width={48} domain={['auto', 'auto']} tickFormatter={(v: number) => `R$${v}`} />
                    <Tooltip formatter={(v) => brl(Number(v))} labelFormatter={(l) => fmtMs(Number(l))} />
                    <Area type="monotone" dataKey="valor" name="Custo" stroke={NIVEL_HEX[nivel]}
                      strokeWidth={2.5} dot={{ r: 4 }} fill="url(#grad-shared)" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            <p className="text-xs text-dim leading-relaxed mt-4">
              Compra = quanto comprar cru para servir a porção, corrigido pelo rendimento do preparo.
              Preços da última coleta do Índice PF.
            </p>
          </>
        )}
        <div className="flex flex-wrap gap-2 mt-5">
          <Link href="/cadastro?next=%2Fcalculadora" className="btn-mk primary">Monte o seu prato grátis</Link>
          <Link href="/" className="btn-mk">Ver o Índice PF</Link>
        </div>
      </div>
    </main>
  )
}
