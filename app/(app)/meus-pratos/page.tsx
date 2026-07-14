'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import {
  getCalculadora, getSeriePrecos, getPratosSalvos, excluirPratoUsuario, renomearPratoUsuario,
  LIMITE_PRATOS_FREE, LIMITE_PRATOS_PREMIUM,
  type ItemCalc, type SeriePrecos, type PratoSalvo,
} from '@/lib/queries'
import { NIVEIS_PRECO, brl, fmtData } from '@/lib/format'
import { NIVEL_HEX, DIM } from '@/lib/theme'
import { useAuth } from '@/app/useAuth'
import { Button, Input, Modal } from '@/components/ui'
import { useDialogo } from '@/components/ui/useDialogo'
import ShareModal from '@/components/dashboard/ShareModal'

// Meus pratos: pratos salvos na calculadora. Clique na linha abre o MODAL do
// prato: composição (servido, compra, custo), evolução por coleta, renomear,
// compartilhar (deep-link da calculadora) e excluir.
const tsDe = (d: string) => new Date(d + 'T00:00:00').getTime()
const fmtMs = (ms: number) => { const d = new Date(ms); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` }

export default function MeusPratosPage() {
  const { user, isPremium } = useAuth()
  const [itens, setItens] = useState<ItemCalc[] | null>(null)
  const [serie, setSerie] = useState<SeriePrecos | null>(null)
  const [salvos, setSalvos] = useState<PratoSalvo[] | null>(null)
  const [sel, setSel] = useState<PratoSalvo | null>(null)
  const [nivel, setNivel] = useState('online')
  const [confirmaExcluir, setConfirmaExcluir] = useState<PratoSalvo | null>(null)

  useEffect(() => {
    getCalculadora().then(setItens).catch(() => setItens([]))
    getSeriePrecos().then(setSerie).catch(() => {})
  }, [])
  const recarregar = () => { if (user) getPratosSalvos(user.id).then(setSalvos) }
  useEffect(recarregar, [user])

  const porId = useMemo(() => new Map((itens || []).map(i => [i.id, i])), [itens])
  const fator = 1 - (NIVEIS_PRECO.find(n => n.key === nivel)?.desc ?? 0)
  const limite = isPremium ? LIMITE_PRATOS_PREMIUM : LIMITE_PRATOS_FREE

  const custoHoje = (p: PratoSalvo) => p.itens.reduce((s, it) => {
    const i = porId.get(it.id); return i ? s + i.preco_g * it.g * i.fc * fator : s
  }, 0)

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
        <div className="border border-border rounded-[var(--r)] bg-surface mt-5 overflow-x-auto">
          <table className="tbl-mk compact">
            <thead>
              <tr>
                <th style={{ cursor: 'default' }}>Prato</th>
                <th className="max-sm:hidden" style={{ cursor: 'default' }}>Ingredientes</th>
                <th className="max-sm:hidden" style={{ cursor: 'default' }}>Salvo em</th>
                <th style={{ textAlign: 'right', cursor: 'default' }}>Custo hoje</th>
              </tr>
            </thead>
            <tbody>
              {salvos.map(p => (
                <tr key={p.id} onClick={() => setSel(p)} style={{ cursor: 'pointer' }}>
                  <td className="font-medium">{p.nome}</td>
                  <td className="max-sm:hidden text-dim">{p.itens.length}</td>
                  <td className="max-sm:hidden text-dim">{fmtData(p.criado_em.slice(0, 10))}</td>
                  <td className="text-right tnum font-semibold">{itens ? brl(custoHoje(p)) : '…'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sel && (
        <ModalMeuPrato prato={sel} porId={porId} serie={serie} nivel={nivel} fator={fator}
          onRenomeado={(nome) => { setSel(s => s ? { ...s, nome } : s); recarregar() }}
          onExcluir={() => { setConfirmaExcluir(sel); setSel(null) }}
          onClose={() => setSel(null)} />
      )}

      {confirmaExcluir && (
        <Modal title="Excluir prato" onClose={() => setConfirmaExcluir(null)}>
          <p className="text-sm text-dim">Excluir <b className="text-ink">{confirmaExcluir.nome}</b>? Essa ação não tem volta.</p>
          <div className="flex gap-2 mt-4">
            <Button variant="secondary" onClick={() => setConfirmaExcluir(null)}>Cancelar</Button>
            <Button onClick={async () => { await excluirPratoUsuario(confirmaExcluir.id); setConfirmaExcluir(null); recarregar() }}>Excluir</Button>
          </div>
        </Modal>
      )}
    </main>
  )
}

function ModalMeuPrato({ prato, porId, serie, nivel, fator, onRenomeado, onExcluir, onClose }: {
  prato: PratoSalvo; porId: Map<number, ItemCalc>; serie: SeriePrecos | null
  nivel: string; fator: number
  onRenomeado: (nome: string) => void; onExcluir: () => void; onClose: () => void
}) {
  const ref = useDialogo<HTMLDivElement>(onClose)
  const [diasSerie, setDiasSerie] = useState(0)
  const [share, setShare] = useState(false)
  const [renomeando, setRenomeando] = useState(false)
  const [nome, setNome] = useState(prato.nome)
  const [erro, setErro] = useState('')

  const calc = prato.itens.map(it => {
    const i = porId.get(it.id); if (!i) return null
    const compra = it.g * i.fc
    return { item: i, g: it.g, compra, custo: i.preco_g * compra * fator }
  }).filter((x): x is NonNullable<typeof x> => x != null).sort((a, b) => b.custo - a.custo)
  const total = calc.reduce((s, c) => s + c.custo, 0)
  const servido = calc.reduce((s, c) => s + c.g, 0)

  const seriePrato = useMemo(() => {
    if (!serie) return []
    const corte = diasSerie > 0 && serie.snaps.length
      ? tsDe(serie.snaps[serie.snaps.length - 1].data) - diasSerie * 86400000 : null
    return serie.snaps.map((s, idx) => {
      let v = 0
      for (const c of calc) { const p = serie.precoG[c.item.id]?.[idx]; if (p != null) v += p * c.compra }
      return { ts: tsDe(s.data), valor: +(v * fator).toFixed(2) }
    }).filter(p => p.valor > 0 && (!corte || p.ts >= corte))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serie, prato, fator, diasSerie])

  // link PÚBLICO (sem login): o prato viaja na URL, nada da conta é exposto
  const deepLink = typeof window !== 'undefined'
    ? `${window.location.origin}/prato-compartilhado?itens=${prato.itens.map(i => `${i.id}:${i.g}`).join(',')}&nome=${encodeURIComponent(prato.nome)}${nivel !== 'online' ? `&nivel=${nivel}` : ''}`
    : ''

  async function renomear() {
    setErro('')
    const { error } = await renomearPratoUsuario(prato.id, nome.trim())
    if (error) { setErro('Não foi possível renomear (a migração 39 pode estar pendente).'); return }
    setRenomeando(false); onRenomeado(nome.trim())
  }

  return (
    <div className="modal-back z-[100]" onClick={onClose}>
      <div ref={ref} onClick={e => e.stopPropagation()} className="modal-mk wide"
        role="dialog" aria-modal="true" aria-label={prato.nome}>
        <div className="modal-head">
          <div className="min-w-0 flex-1">
            {renomeando ? (
              <div className="flex items-center gap-2">
                <Input value={nome} onChange={e => setNome(e.target.value)} maxLength={80}
                  aria-label="Novo nome do prato" className="max-w-xs" />
                <Button disabled={!nome.trim()} onClick={renomear}>Salvar</Button>
                <Button variant="secondary" onClick={() => { setRenomeando(false); setNome(prato.nome) }}>Cancelar</Button>
              </div>
            ) : (
              <h2 className="flex items-center gap-2">{prato.nome}
                <button onClick={() => setRenomeando(true)} aria-label="Renomear prato"
                  className="text-dim hover:text-ink cursor-pointer" title="Renomear">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                </button>
              </h2>
            )}
            <p>salvo em {fmtData(prato.criado_em.slice(0, 10))} · {calc.length} ingredientes · custo hoje {brl(total)}</p>
            {erro && <p className="text-xs text-danger mt-1">{erro}</p>}
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Fechar"><span aria-hidden="true">×</span></button>
        </div>

        <div className="modal-body">
          <div className="overflow-x-auto">
          <table className="tbl-mk compact">
            <thead>
              <tr>
                <th style={{ cursor: 'default' }}>Ingrediente</th>
                <th style={{ textAlign: 'right', cursor: 'default' }} title="Porção servida no prato">No prato (g)</th>
                <th style={{ textAlign: 'right', cursor: 'default' }} title="Compra crua corrigida pelo rendimento">Compra (g)</th>
                <th className="max-sm:hidden" style={{ textAlign: 'right', cursor: 'default' }}>Preço/kg</th>
                <th style={{ textAlign: 'right', cursor: 'default' }}>Custo</th>
              </tr>
            </thead>
            <tbody>
              {calc.map(c => (
                <tr key={c.item.id} style={{ cursor: 'default' }}>
                  <td className="font-medium">{c.item.nome}</td>
                  <td className="text-right tnum text-dim">{c.g}</td>
                  <td className="text-right tnum text-dim">{c.compra.toFixed(1)}</td>
                  <td className="max-sm:hidden text-right tnum text-dim">{brl(c.item.preco_g * 1000 * fator)}</td>
                  <td className="text-right tnum font-medium">{brl(c.custo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p className="text-xs text-dim tnum mt-2">
            Peso servido: ~{Math.round(servido)} g · custo por 100 g servidos: {servido > 0 ? brl(total / servido * 100) : '—'}
          </p>

          {seriePrato.length >= 2 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 mt-5 mb-2">
                <h3 className="text-[13px] font-bold">Evolução por coleta</h3>
                <div className="flex gap-1.5">
                  {([['30d', 30], ['3m', 90], ['Tudo', 0]] as const).map(([label, d]) => (
                    <button key={label} onClick={() => setDiasSerie(d)}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                        diasSerie === d ? 'bg-accent text-white' : 'bg-surface-3 text-ink-2 hover:text-ink'}`}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="h-48">
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
              <p className="text-xs text-faint mt-1.5">Preço online por coleta (sem cotação na semana, vale a anterior) × compra de cada ingrediente.</p>
            </>
          )}

          <div className="flex flex-wrap gap-2 mt-5">
            <Button onClick={() => setShare(true)}>Compartilhar</Button>
            <Link href={`/calculadora?itens=${prato.itens.map(i => `${i.id}:${i.g}`).join(',')}`} className="btn-mk">
              Editar ingredientes
            </Link>
            <Button variant="secondary" className="text-danger" onClick={onExcluir}>Excluir</Button>
            <Button variant="secondary" onClick={onClose}>Fechar</Button>
          </div>
        </div>
      </div>

      {share && <ShareModal contexto={`meu prato "${prato.nome}" (${brl(total)}) no Índice PF`} url={deepLink} onClose={() => setShare(false)} />}
    </div>
  )
}
