'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import {
  getCalculadora, getSeriePrecos, getPratosSalvos, excluirPratoUsuario,
  LIMITE_PRATOS_FREE, LIMITE_PRATOS_PREMIUM,
  type ItemCalc, type SeriePrecos, type PratoSalvo,
} from '@/lib/queries'
import { NIVEIS_PRECO, brl, fmtData } from '@/lib/format'
import { NIVEL_HEX, DIM } from '@/lib/theme'
import { useAuth } from '@/app/useAuth'
import { Button, Modal } from '@/components/ui'

// Meus pratos: acompanhamento dos pratos salvos na calculadora — custo de
// hoje na tabela e evolução por coleta no gráfico do prato selecionado.
const tsDe = (d: string) => new Date(d + 'T00:00:00').getTime()
const fmtMs = (ms: number) => { const d = new Date(ms); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` }

export default function MeusPratosPage() {
  const { user, isPremium } = useAuth()
  const [itens, setItens] = useState<ItemCalc[] | null>(null)
  const [serie, setSerie] = useState<SeriePrecos | null>(null)
  const [salvos, setSalvos] = useState<PratoSalvo[] | null>(null)
  const [sel, setSel] = useState<PratoSalvo | null>(null)
  const [nivel, setNivel] = useState('online')
  const [diasSerie, setDiasSerie] = useState(0)
  const [confirmaExcluir, setConfirmaExcluir] = useState<PratoSalvo | null>(null)

  useEffect(() => {
    getCalculadora().then(setItens).catch(() => setItens([]))
    getSeriePrecos().then(setSerie).catch(() => {})
  }, [])
  useEffect(() => { if (user) getPratosSalvos(user.id).then(s => { setSalvos(s); setSel(x => x ?? s[0] ?? null) }) }, [user])

  const porId = useMemo(() => new Map((itens || []).map(i => [i.id, i])), [itens])
  const fator = 1 - (NIVEIS_PRECO.find(n => n.key === nivel)?.desc ?? 0)
  const limite = isPremium ? LIMITE_PRATOS_PREMIUM : LIMITE_PRATOS_FREE

  const custoHoje = (p: PratoSalvo) => p.itens.reduce((s, it) => {
    const i = porId.get(it.id); return i ? s + i.preco_g * it.g * i.fc * fator : s
  }, 0)

  const seriePrato = useMemo(() => {
    if (!serie || !sel) return []
    const compras = sel.itens.map(it => {
      const i = porId.get(it.id); return i ? { id: it.id, compra: it.g * i.fc } : null
    }).filter((x): x is NonNullable<typeof x> => x != null)
    const corte = diasSerie > 0 && serie.snaps.length
      ? tsDe(serie.snaps[serie.snaps.length - 1].data) - diasSerie * 86400000 : null
    return serie.snaps.map((s, idx) => {
      let v = 0
      for (const c of compras) { const p = serie.precoG[c.id]?.[idx]; if (p != null) v += p * c.compra }
      return { ts: tsDe(s.data), valor: +(v * fator).toFixed(2) }
    }).filter(p => p.valor > 0 && (!corte || p.ts >= corte))
  }, [serie, sel, porId, fator, diasSerie])

  if (!user) return <main className="max-w-5xl mx-auto px-6 py-8"><p className="text-sm text-dim">Entre para ver seus pratos.</p></main>

  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Meus pratos</h2>
          <p className="text-dim text-sm mt-1">
            {salvos ? `${salvos.length}/${limite} pratos salvos` : '…'} · custo atualizado a cada coleta
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="segbar">
            {NIVEIS_PRECO.filter(n => n.disponivel).map(n => (
              <button key={n.key} className={nivel === n.key ? 'on' : ''} onClick={() => setNivel(n.key)}>
                {n.grupo === 'consumidor' ? (n.key === 'online' ? 'Online' : 'Mercado') : n.label}
              </button>
            ))}
          </div>
          <Link href="/calculadora" className="btn-mk sm primary">Montar prato novo</Link>
        </div>
      </div>

      {salvos !== null && !salvos.length && (
        <div className="border border-dashed border-border-2 rounded-[var(--r)] p-8 text-center mt-6">
          <p className="text-sm text-dim">Você ainda não salvou nenhum prato.</p>
          <Link href="/calculadora" className="btn-mk primary mt-3 inline-flex">Montar meu primeiro prato</Link>
        </div>
      )}

      {!!salvos?.length && (
        <>
          <div className="border border-border rounded-[var(--r)] bg-surface mt-5 overflow-hidden">
            <table className="tbl-mk compact">
              <thead>
                <tr>
                  <th style={{ cursor: 'default' }}>Prato</th>
                  <th className="max-sm:hidden" style={{ cursor: 'default' }}>Ingredientes</th>
                  <th className="max-sm:hidden" style={{ cursor: 'default' }}>Salvo em</th>
                  <th style={{ textAlign: 'right', cursor: 'default' }}>Custo hoje</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {salvos.map(p => (
                  <tr key={p.id} onClick={() => setSel(p)}
                    className={sel?.id === p.id ? 'bg-accent/5' : ''} style={{ cursor: 'pointer' }}>
                    <td className="font-medium">{p.nome}</td>
                    <td className="max-sm:hidden text-dim">{p.itens.length}</td>
                    <td className="max-sm:hidden text-dim">{fmtData(p.criado_em.slice(0, 10))}</td>
                    <td className="text-right tnum font-semibold">{itens ? brl(custoHoje(p)) : '…'}</td>
                    <td className="text-right whitespace-nowrap">
                      <Link href={`/calculadora?itens=${p.itens.map(i => `${i.id}:${i.g}`).join(',')}`}
                        onClick={e => e.stopPropagation()}
                        className="text-xs text-accent hover:underline mr-3">editar</Link>
                      <button aria-label={`Excluir ${p.nome}`}
                        onClick={e => { e.stopPropagation(); setConfirmaExcluir(p) }}
                        className="text-xs text-dim hover:text-danger cursor-pointer">excluir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sel && (
            <div className="border border-border rounded-[var(--r)] bg-surface p-4 mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 className="text-[13px] font-bold">Evolução — {sel.nome}</h3>
                <div className="flex gap-1.5">
                  {([['30d', 30], ['3m', 90], ['Tudo', 0]] as const).map(([label, d]) => (
                    <button key={label} onClick={() => setDiasSerie(d)}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                        diasSerie === d ? 'bg-accent text-white' : 'bg-surface-3 text-ink-2 hover:text-ink'}`}>{label}</button>
                  ))}
                </div>
              </div>
              {seriePrato.length >= 2 ? (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={seriePrato} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="grad-meuprato" x1="0" y1="0" x2="0" y2="1">
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
                        strokeWidth={2.5} dot={{ r: 4 }} fill="url(#grad-meuprato)" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-dim py-6 text-center">A evolução aparece a partir da 2ª coleta com os ingredientes deste prato.</p>
              )}
              <p className="text-xs text-faint mt-1.5">Preço online por coleta (sem cotação na semana, vale a anterior) × compra necessária de cada ingrediente.</p>
            </div>
          )}
        </>
      )}

      {confirmaExcluir && (
        <Modal title="Excluir prato" onClose={() => setConfirmaExcluir(null)}>
          <p className="text-sm text-dim">Excluir <b className="text-ink">{confirmaExcluir.nome}</b>? Essa ação não tem volta.</p>
          <div className="flex gap-2 mt-4">
            <Button variant="secondary" onClick={() => setConfirmaExcluir(null)}>Cancelar</Button>
            <Button onClick={async () => {
              await excluirPratoUsuario(confirmaExcluir.id)
              setConfirmaExcluir(null); setSel(s => s?.id === confirmaExcluir.id ? null : s)
              if (user) getPratosSalvos(user.id).then(s => { setSalvos(s); setSel(x => x ?? s[0] ?? null) })
            }}>Excluir</Button>
          </div>
        </Modal>
      )}
    </main>
  )
}
