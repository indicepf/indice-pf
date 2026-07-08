'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import DetalhePrato from '../DetalhePrato'
import { useAuth } from '../useAuth'
import {
  getDishCostsRange, getSnapshotsNovos, getAllDetalhes, getAllFontes, getAllFontesManuais,
  getStatsPublicas, getSeriePratos, getPrecosPorRegiao, getPratosPorIngrediente,
  type FonteManual, type StatsPublicas, type SeriePratos, type ProdutoRegiao, type PratoDeIngrediente,
} from '@/lib/queries'
import { NIVEIS_PRECO, REGIOES, brl, fmtData, limparNome } from '@/lib/format'
import { mediana } from '@/lib/stats'
import { ACCENT, CORES_REGIAO, COR_ALTA, COR_QUEDA, DIM } from '@/lib/theme'
import { Badge, Card, Input, Modal } from '@/components/ui'
import Sparkline from '@/components/dashboard/Sparkline'
import TabelaProdutosRegiao from '@/components/dashboard/TabelaProdutosRegiao'
import AdSlot from '@/components/ads/AdSlot'
import AdGate from '@/components/ads/AdGate'
import AdPopup from '@/components/ads/AdPopup'
import type { ModoKey, Snapshot, DishCost, ItemDetalhe, Fonte } from '@/lib/types'

const fmtCurta = (d: string) => { const [, m, dia] = d.split('-'); return `${dia}/${m}` }

type ColunaSort = 'nome' | 'regiao' | 'custo' | 'delta'

export default function Dashboard() {
  const { profile, isPremium } = useAuth()
  const isAdmin = !!profile?.is_admin
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [custos, setCustos]     = useState<DishCost[]>([])
  const [loading, setLoading]   = useState(true)
  const [snapsNovos, setSnapsNovos] = useState<{ id: number; data: string }[]>([])
  const [ini, setIni] = useState(''); const [fim, setFim] = useState('')   // período (vazio = última coleta)
  const [stats, setStats] = useState<StatsPublicas | null>(null)
  const [serie, setSerie] = useState<SeriePratos | null>(null)
  const [produtosRegiao, setProdutosRegiao] = useState<ProdutoRegiao[]>([])

  const [modo, setModo]         = useState<ModoKey>('online')
  const [regioes, setRegioes]   = useState<Set<string>>(new Set())   // vazio = todas
  const [busca, setBusca]       = useState('')
  const [sort, setSort]         = useState<{ col: ColunaSort; dir: 1 | -1 }>({ col: 'custo', dir: 1 })
  const [selecionado, setSelecionado] = useState<DishCost | null>(null)
  // modal "pratos que usam o ingrediente" + filtro derivado dele na tabela
  const [ingModal, setIngModal] = useState<{ id: number; nome: string } | null>(null)
  const [pratosDoIng, setPratosDoIng] = useState<PratoDeIngrediente[] | null>(null)
  const [filtroIng, setFiltroIng] = useState<{ nome: string; ids: Set<number> } | null>(null)
  const [detalhes, setDetalhes] = useState<Record<number, ItemDetalhe[]> | null>(null)
  const [fontes, setFontes]     = useState<Record<number, Fonte[]>>({})
  const [fontesManuais, setFontesManuais] = useState<Record<number, FonteManual[]>>({})

  useEffect(() => {
    getSnapshotsNovos().then(setSnapsNovos)
    getStatsPublicas().then(setStats)
    getSeriePratos().then(setSerie)
  }, [])
  useEffect(() => {
    if (!snapsNovos.length) return
    ;(async () => {
      const range = snapsNovos.filter(s => (!ini || s.data >= ini) && (!fim || s.data <= fim))
      const ref = range[0] || snapsNovos[0]   // desc → coleta mais recente do intervalo
      setSnapshot({ id: ref.id, data: ref.data, custo_total_pf: 0 } as Snapshot)
      setCustos(await getDishCostsRange(ini, fim))
      setLoading(false)
      // composição/fontes da gaveta usam a coleta de referência
      getAllDetalhes(ref.id, ref.data).then(setDetalhes)
      getAllFontes(ref.id).then(setFontes)
      getAllFontesManuais(ref.data).then(setFontesManuais)
      getPrecosPorRegiao(ref.id).then(setProdutosRegiao)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapsNovos, ini, fim])
  const nColetasHome = (!ini && !fim) ? 1 : snapsNovos.filter(s => (!ini || s.data >= ini) && (!fim || s.data <= fim)).length
  function presetHome(dias: number) {
    if (!snapsNovos.length) return
    if (dias === 0) { setIni(snapsNovos[snapsNovos.length - 1].data); setFim(snapsNovos[0].data) }   // Tudo = da 1ª à última
    else { setFim(snapsNovos[0].data); const d = new Date(snapsNovos[0].data + 'T00:00:00Z'); d.setDate(d.getDate() - dias); setIni(d.toISOString().slice(0, 10)) }
  }

  const nivel = NIVEIS_PRECO.find(n => n.key === modo)!
  const fator = 1 - nivel.desc

  // pratos do índice: filtrados pela(s) região(ões) selecionada(s)
  const custosRegiao = useMemo(() => regioes.size ? custos.filter(c => regioes.has(c.pratos.regiao)) : custos, [custos, regioes])
  const indiceNacional = useMemo(
    () => mediana(custosRegiao.map(c => c.custo_total)) * fator,
    [custosRegiao, fator]
  )
  const maisCaro = useMemo(() => custosRegiao.length ? custosRegiao.reduce((a, b) => a.custo_total >= b.custo_total ? a : b) : null, [custosRegiao])
  const maisBarato = useMemo(() => custosRegiao.length ? custosRegiao.reduce((a, b) => a.custo_total <= b.custo_total ? a : b) : null, [custosRegiao])

  // ── derivações da série (gráfico, Δ, movers, sparklines) ────────────────
  const idsRecorte = useMemo(() => {
    if (!serie) return new Set<number>()
    return new Set(serie.pratos.filter(p => !regioes.size || regioes.has(p.regiao)).map(p => p.id))
  }, [serie, regioes])

  // índice do recorte por coleta (mediana × fator)
  const serieIndice = useMemo(() => {
    if (!serie) return []
    return serie.snaps.map((s, i) => {
      const vals = serie.pratos.filter(p => idsRecorte.has(p.id))
        .map(p => serie.custos[p.id]?.[i]).filter((v): v is number => v != null && v > 0)
      const row: Record<string, number | string> = { data: fmtCurta(s.data), indice: +(mediana(vals) * fator).toFixed(2) }
      for (const r of REGIOES) {
        if (regioes.size && !regioes.has(r)) continue
        const vr = serie.pratos.filter(p => p.regiao === r).map(p => serie.custos[p.id]?.[i])
          .filter((v): v is number => v != null && v > 0)
        if (vr.length) row[r] = +(mediana(vr) * fator).toFixed(2)
      }
      return row
    })
  }, [serie, idsRecorte, regioes, fator])

  // Δ% do índice do recorte entre as duas últimas coletas
  const deltaIndice = useMemo(() => {
    if (serieIndice.length < 2) return null
    const a = serieIndice[serieIndice.length - 2].indice as number
    const b = serieIndice[serieIndice.length - 1].indice as number
    return a > 0 ? (b - a) / a * 100 : null
  }, [serieIndice])

  // maiores altas e quedas entre as duas últimas coletas (respeita o recorte)
  const movers = useMemo(() => {
    if (!serie || serie.snaps.length < 2) return null
    const n = serie.snaps.length
    const deltas = serie.pratos.filter(p => idsRecorte.has(p.id)).map(p => {
      const ant = serie.custos[p.id]?.[n - 2], atual = serie.custos[p.id]?.[n - 1]
      if (ant == null || atual == null || ant <= 0) return null
      return { prato: p, delta: (atual - ant) / ant * 100, serie: serie.custos[p.id] }
    }).filter((x): x is NonNullable<typeof x> => x != null && x.delta !== 0)
    const ord = [...deltas].sort((a, b) => b.delta - a.delta)
    return { altas: ord.filter(d => d.delta > 0).slice(0, 4), quedas: ord.filter(d => d.delta < 0).reverse().slice(0, 4) }
  }, [serie, idsRecorte])

  // Δ% e série por prato para a tabela
  const porPrato = useMemo(() => {
    const out: Record<number, { delta: number | null; serie: (number | null)[] }> = {}
    if (!serie) return out
    const n = serie.snaps.length
    for (const p of serie.pratos) {
      const arr = serie.custos[p.id] || []
      const ant = n >= 2 ? arr[n - 2] : null, atual = arr[n - 1]
      out[p.id] = { delta: ant != null && atual != null && ant > 0 ? (atual - ant) / ant * 100 : null, serie: arr }
    }
    return out
  }, [serie])

  const lista = useMemo(() => {
    let l = custos
    if (regioes.size) l = l.filter(c => regioes.has(c.pratos.regiao))
    if (filtroIng) l = l.filter(c => filtroIng.ids.has(c.pratos.id))
    if (busca.trim()) {
      const q = busca.toLowerCase()
      l = l.filter(c => c.pratos.nome.toLowerCase().includes(q))
    }
    const { col, dir } = sort
    return [...l].sort((a, b) => {
      let cmp = 0
      if (col === 'custo') cmp = a.custo_total - b.custo_total
      else if (col === 'nome') cmp = limparNome(a.pratos.nome).localeCompare(limparNome(b.pratos.nome))
      else if (col === 'regiao') cmp = a.pratos.regiao.localeCompare(b.pratos.regiao) || a.custo_total - b.custo_total
      else {   // delta — sem série vai para o fim, em qualquer direção
        const da = porPrato[a.pratos.id]?.delta, db = porPrato[b.pratos.id]?.delta
        if (da == null && db == null) cmp = 0
        else if (da == null) return 1
        else if (db == null) return -1
        else cmp = da - db
      }
      return cmp * dir
    })
  }, [custos, regioes, busca, sort, filtroIng, porPrato])

  function toggleSort(col: ColunaSort) {
    setSort(s => s.col === col ? { col, dir: s.dir === 1 ? -1 : 1 } : { col, dir: 1 })
  }

  function abrirIngrediente(ing: { id: number; nome: string }) {
    setIngModal(ing); setPratosDoIng(null)
    getPratosPorIngrediente(ing.id).then(setPratosDoIng)
  }

  const temSerie = serieIndice.length >= 2

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center text-dim">
        <p className="font-bold tracking-tight text-lg">Carregando o Índice PF…</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen">
      <AdPopup />
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* hero */}
        <section className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight max-w-2xl leading-tight">
            O custo de produção do prato feito no Brasil
          </h1>
          <p className="text-dim mt-2 max-w-xl">
            Preço real dos ingredientes, coletado no varejo e em campo, transformado no custo de cada prato.
          </p>
          {stats && (
            <p className="text-sm text-dim mt-4 flex flex-wrap gap-x-5 gap-y-1">
              <span><strong className="text-ink tnum">{stats.pratos}</strong> pratos regionais</span>
              <span><strong className="text-ink tnum">{stats.ingredientes}</strong> ingredientes monitorados</span>
              <span><strong className="text-ink tnum">5</strong> regiões</span>
              <span><strong className="text-ink tnum">{snapsNovos.length}</strong> coleta{snapsNovos.length === 1 ? '' : 's'}</span>
              {stats.contribuicoesAprovadas > 0 && (
                <span><strong className="text-ink tnum">{stats.contribuicoesAprovadas}</strong> contribuições aprovadas</span>
              )}
            </p>
          )}
          <AdSlot slot="hero" className="mt-6" />
        </section>

        <div className="grid lg:grid-cols-[250px_1fr] gap-8 items-start">
          {/* painel de filtros */}
          <aside className="lg:sticky lg:top-24 space-y-5">
            <Card className="p-4 space-y-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-faint mb-2">Buscar prato</p>
                <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="ex: feijoada" className="mt-0" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-faint mb-2">Nível de preço</p>
                <div className="flex flex-col gap-1.5">
                  {NIVEIS_PRECO.map(n => (
                    <button key={n.key} disabled={!n.disponivel}
                      onClick={() => n.disponivel && setModo(n.key as ModoKey)}
                      className={`flex items-center justify-between gap-2 text-left text-sm px-3 py-1.5 rounded-[var(--r-sm)] border transition-colors ${
                        modo === n.key ? 'bg-accent text-white border-accent'
                        : n.disponivel ? 'border-border text-dim hover:text-ink hover:bg-surface-2 cursor-pointer'
                        : 'border-border text-faint cursor-not-allowed'
                      }`}>
                      {n.label}
                      {!n.disponivel && <Badge tone="neutral">em breve</Badge>}
                    </button>
                  ))}
                </div>
                <p className="text-[0.7rem] text-faint mt-2 leading-snug">{nivel.nota}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-faint mb-2">Regiões</p>
                <div className="flex flex-wrap gap-1.5">
                  {REGIOES.map(r => {
                    const on = regioes.has(r)
                    return (
                      <button key={r}
                        onClick={() => setRegioes(prev => { const nx = new Set(prev); if (nx.has(r)) nx.delete(r); else nx.add(r); return nx })}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                          on ? 'text-white border-transparent' : 'border-border text-dim hover:text-ink hover:bg-surface-2'
                        }`}
                        style={on ? { background: CORES_REGIAO[r] } : undefined}>
                        {r}
                      </button>
                    )
                  })}
                </div>
                {regioes.size > 0 && (
                  <button onClick={() => setRegioes(new Set())}
                    className="text-xs text-dim hover:text-ink mt-2 cursor-pointer">limpar ({regioes.size})</button>
                )}
              </div>
              {isAdmin && (
                <div className="border-t border-border pt-4 text-xs text-dim">
                  <p className="mb-1.5">Período do cálculo</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {([['7d', 7], ['15d', 15], ['30d', 30], ['3m', 90], ['6m', 180], ['Tudo', 0]] as const).map(([label, d]) => (
                      <button key={label} onClick={() => presetHome(d)}
                        className="px-2 py-1 border border-border rounded text-dim hover:text-ink transition-colors cursor-pointer">{label}</button>
                    ))}
                  </div>
                  <input type="date" value={ini} onChange={e => setIni(e.target.value)} className="bg-surface border border-border rounded px-2 py-1 focus:outline-none focus:border-accent w-full mb-1.5" />
                  <input type="date" value={fim} onChange={e => setFim(e.target.value)} className="bg-surface border border-border rounded px-2 py-1 focus:outline-none focus:border-accent w-full" />
                  {nColetasHome > 1 && <p className="mt-1.5">Índice = média de {nColetasHome} coletas do período.</p>}
                </div>
              )}
            </Card>
            <AdSlot slot="lateral" />
          </aside>

          {/* conteúdo */}
          <section className="space-y-8 min-w-0">
            {/* KPIs */}
            <div className="grid sm:grid-cols-3 gap-4">
              <Card className="p-4">
                <p className="text-[0.7rem] uppercase tracking-[0.12em] text-dim">
                  {regioes.size === 0 ? 'Índice PF nacional' : regioes.size === 1 ? `Índice — ${[...regioes][0]}` : `Índice — ${regioes.size} regiões`}
                  {nivel.desc > 0 && <span className="text-warn"> · {nivel.label} (−{Math.round(nivel.desc * 100)}% estimado)</span>}
                </p>
                <p className="text-3xl font-bold tracking-tight text-accent tnum mt-1">{brl(indiceNacional)}</p>
                <p className="text-xs text-dim mt-1.5">
                  mediana de {custosRegiao.length} pratos · {nivel.nota}
                  {deltaIndice != null && (
                    <span className="tnum font-medium" style={{ color: deltaIndice > 0 ? COR_ALTA : COR_QUEDA }}>
                      {' '}· {deltaIndice > 0 ? '+' : ''}{deltaIndice.toFixed(1)}% vs coleta anterior
                    </span>
                  )}
                </p>
              </Card>
              <Card className={`p-4 ${maisCaro ? 'cursor-pointer hover:bg-surface-2 transition-colors' : ''}`}
                onClick={() => maisCaro && setSelecionado(maisCaro)}
                title={maisCaro ? 'Ver os ingredientes deste prato' : undefined}>
                <p className="text-[0.7rem] uppercase tracking-[0.12em] text-dim">Prato mais caro</p>
                <p className="text-lg font-bold tracking-tight mt-1 truncate">{maisCaro ? limparNome(maisCaro.pratos.nome) : '—'}</p>
                <p className="text-xs text-dim mt-1.5 tnum">{maisCaro ? `${brl(maisCaro.custo_total * fator)} · ${maisCaro.pratos.regiao}` : ''}</p>
                {maisCaro && <p className="text-[0.7rem] text-accent mt-1">ver ingredientes →</p>}
              </Card>
              <Card className={`p-4 ${maisBarato ? 'cursor-pointer hover:bg-surface-2 transition-colors' : ''}`}
                onClick={() => maisBarato && setSelecionado(maisBarato)}
                title={maisBarato ? 'Ver os ingredientes deste prato' : undefined}>
                <p className="text-[0.7rem] uppercase tracking-[0.12em] text-dim">Prato mais barato</p>
                <p className="text-lg font-bold tracking-tight mt-1 truncate">{maisBarato ? limparNome(maisBarato.pratos.nome) : '—'}</p>
                <p className="text-xs text-dim mt-1.5 tnum">{maisBarato ? `${brl(maisBarato.custo_total * fator)} · ${maisBarato.pratos.regiao}` : ''}</p>
                {maisBarato && <p className="text-[0.7rem] text-accent mt-1">ver ingredientes →</p>}
              </Card>
            </div>

            {/* gráfico do índice (gate opcional: slot 'gate-grafico' no admin) */}
            <AdGate slot="gate-grafico">
            <Card className="p-4">
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
                <h2 className="font-bold tracking-tight">Evolução do índice</h2>
                <p className="text-xs text-faint">coletas nos dias 1 e 15 de cada mês</p>
              </div>
              {temSerie ? (
                <>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={serieIndice} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="data" tick={{ fontSize: 12, fill: DIM }} />
                        <YAxis tick={{ fontSize: 12, fill: DIM }} width={52} domain={['auto', 'auto']}
                          tickFormatter={(v: number) => `R$${v}`} />
                        <Tooltip formatter={(v) => brl(Number(v))} />
                        <Line type="monotone" dataKey="indice" name={regioes.size ? 'Índice do recorte' : 'Índice nacional'}
                          stroke={ACCENT} strokeWidth={2.5} dot={{ r: 4 }} />
                        {[...regioes].map(r => (
                          <Line key={r} type="monotone" dataKey={r} name={r}
                            stroke={CORES_REGIAO[r]} strokeWidth={1.8} strokeDasharray="4 3" dot={{ r: 3 }} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {serieIndice.length < 4 && (
                    <p className="text-xs text-faint mt-2">Série em construção — cresce a cada coleta quinzenal.</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-dim py-8 text-center">
                  O gráfico aparece a partir da 2ª coleta. Próximas coletas: dias 1 e 15.
                </p>
              )}
            </Card>
            </AdGate>

            {/* movers */}
            {movers && (movers.altas.length > 0 || movers.quedas.length > 0) && (
              <div className="grid sm:grid-cols-2 gap-4">
                <Card className="p-4">
                  <h3 className="text-sm font-bold tracking-tight mb-3">Maiores altas <span className="text-faint font-normal">· vs coleta anterior</span></h3>
                  <div className="space-y-2">
                    {movers.altas.map(m => (
                      <div key={m.prato.id} className="flex items-center gap-2 text-sm">
                        <span className="truncate flex-1">{limparNome(m.prato.nome)}</span>
                        <Sparkline valores={m.serie} cor={COR_ALTA} />
                        <span className="tnum font-medium w-14 text-right" style={{ color: COR_ALTA }}>+{m.delta.toFixed(1)}%</span>
                      </div>
                    ))}
                    {!movers.altas.length && <p className="text-xs text-dim">Nenhuma alta entre as duas últimas coletas.</p>}
                  </div>
                </Card>
                <Card className="p-4">
                  <h3 className="text-sm font-bold tracking-tight mb-3">Maiores quedas <span className="text-faint font-normal">· vs coleta anterior</span></h3>
                  <div className="space-y-2">
                    {movers.quedas.map(m => (
                      <div key={m.prato.id} className="flex items-center gap-2 text-sm">
                        <span className="truncate flex-1">{limparNome(m.prato.nome)}</span>
                        <Sparkline valores={m.serie} cor={COR_QUEDA} />
                        <span className="tnum font-medium w-14 text-right" style={{ color: COR_QUEDA }}>{m.delta.toFixed(1)}%</span>
                      </div>
                    ))}
                    {!movers.quedas.length && <p className="text-xs text-dim">Nenhuma queda entre as duas últimas coletas.</p>}
                  </div>
                </Card>
              </div>
            )}

            <AdSlot slot="billboard" />

            {/* tabela de pratos */}
            <div id="tabela-pratos">
              <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
                <h2 className="font-bold tracking-tight text-xl">Pratos</h2>
                <div className="flex items-center gap-3">
                  {filtroIng && (
                    <button onClick={() => setFiltroIng(null)}
                      className="text-xs bg-accent/10 text-accent border border-accent/30 rounded-full px-2.5 py-1 hover:bg-accent/20 transition-colors cursor-pointer">
                      com {filtroIng.nome} · limpar ×
                    </button>
                  )}
                  <p className="text-xs text-dim">{snapshot ? `coleta de ${fmtData(snapshot.data)}` : ''}</p>
                </div>
              </div>
              <Card className="overflow-hidden">
                <table className="w-full text-[0.95rem]">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-dim border-b border-border select-none">
                      <Th onClick={() => toggleSort('nome')} ativa={sort.col === 'nome'} dir={sort.dir}>Prato</Th>
                      <Th onClick={() => toggleSort('regiao')} ativa={sort.col === 'regiao'} dir={sort.dir} className="hidden sm:table-cell">Região</Th>
                      <Th onClick={() => toggleSort('custo')} ativa={sort.col === 'custo'} dir={sort.dir} right>Custo</Th>
                      {temSerie && <Th onClick={() => toggleSort('delta')} ativa={sort.col === 'delta'} dir={sort.dir} right className="hidden md:table-cell">Δ última</Th>}
                      {temSerie && <th className="font-medium px-4 py-3 text-right hidden lg:table-cell">Tendência</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((c, idx) => {
                      const pp = porPrato[c.pratos.id]
                      const adRow = idx === 8 ? (
                        <tr>
                          <td colSpan={temSerie ? 5 : 3} className="p-0"><AdSlot slot="nativo" className="rounded-none border-x-0" /></td>
                        </tr>
                      ) : null
                      return (
                        <Fragment key={c.pratos.id}>
                          {adRow}
                          <tr onClick={() => setSelecionado(c)}
                            className="border-b border-border/70 last:border-0 hover:bg-surface-2 cursor-pointer transition-colors">
                            <td className="px-4 py-3">{limparNome(c.pratos.nome)}</td>
                            <td className="px-4 py-3 text-dim hidden sm:table-cell">{c.pratos.regiao}</td>
                            <td className="px-4 py-3 text-right font-medium tnum">{brl(c.custo_total * fator)}</td>
                            {temSerie && (
                              <td className="px-4 py-3 text-right tnum hidden md:table-cell"
                                style={{ color: pp?.delta == null ? undefined : pp.delta > 0 ? COR_ALTA : pp.delta < 0 ? COR_QUEDA : undefined }}>
                                {pp?.delta == null ? '—' : `${pp.delta > 0 ? '+' : ''}${pp.delta.toFixed(1)}%`}
                              </td>
                            )}
                            {temSerie && (
                              <td className="px-4 py-3 text-right hidden lg:table-cell">
                                {pp && <Sparkline valores={pp.serie} cor={DIM} />}
                              </td>
                            )}
                          </tr>
                        </Fragment>
                      )
                    })}
                    {!lista.length && (
                      <tr><td colSpan={temSerie ? 5 : 3} className="px-4 py-8 text-center text-dim">Nenhum prato encontrado.</td></tr>
                    )}
                  </tbody>
                </table>
              </Card>
              <p className="text-xs text-dim mt-3">
                Clique num prato para ver o custo por ingrediente e as fontes de preço. Os níveis Mercado e
                Atacarejo são estimativas sobre o preço online, em calibração com dados de campo.
              </p>
            </div>

            <AdSlot slot="leaderboard" />

            {/* produtos por região (premium; gate opcional: slot 'gate-tabela') */}
            {produtosRegiao.length > 0 && (
              <AdGate slot="gate-tabela">
                <TabelaProdutosRegiao linhas={produtosRegiao} destravada={isAdmin || isPremium} onIngrediente={abrirIngrediente} />
              </AdGate>
            )}
          </section>
        </div>
      </div>

      {selecionado && snapshot && (
        <DetalhePrato dish={selecionado}
          itens={detalhes ? (detalhes[selecionado.pratos.id] ?? []) : null}
          fontesPorIngrediente={fontes} manuaisPorIngrediente={fontesManuais} fator={fator}
          dataColeta={snapshot.data}
          onClose={() => setSelecionado(null)} />
      )}

      {/* pratos que usam o ingrediente clicado em "Produtos por região" */}
      {ingModal && (
        <Modal title={`Pratos com ${ingModal.nome}`} onClose={() => setIngModal(null)}>
          {!pratosDoIng ? (
            <p className="text-sm text-dim py-4">Carregando…</p>
          ) : !pratosDoIng.length ? (
            <p className="text-sm text-dim py-4">Nenhum prato usa este produto.</p>
          ) : (
            <>
              <p className="text-xs text-dim mb-3">{pratosDoIng.length} prato{pratosDoIng.length === 1 ? '' : 's'} usa{pratosDoIng.length === 1 ? '' : 'm'} este produto.</p>
              <div className="space-y-1.5 mb-4">
                {pratosDoIng.map(p => {
                  const custo = custos.find(c => c.pratos.id === p.prato_id)
                  return (
                    <div key={p.prato_id} className="flex items-center gap-2 text-sm border border-border rounded-[var(--r-sm)] px-3 py-2">
                      <span className="truncate flex-1">{limparNome(p.nome)}</span>
                      <span className="text-xs text-dim shrink-0">{p.regiao} · {p.qtd_g}g</span>
                      {custo && <span className="tnum font-medium shrink-0">{brl(custo.custo_total * fator)}</span>}
                    </div>
                  )
                })}
              </div>
              <button
                onClick={() => {
                  setFiltroIng({ nome: ingModal.nome, ids: new Set(pratosDoIng.map(p => p.prato_id)) })
                  setIngModal(null)
                  document.getElementById('tabela-pratos')?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="w-full inline-flex items-center justify-center rounded-[var(--r-sm)] px-4 py-2 text-sm font-medium bg-accent text-white hover:brightness-110 transition cursor-pointer">
                Mostrar só esses pratos na tabela
              </button>
            </>
          )}
        </Modal>
      )}
    </main>
  )
}

function Th({ children, onClick, ativa, dir, right = false, className = '' }: {
  children: React.ReactNode; onClick: () => void; ativa: boolean; dir: 1 | -1
  right?: boolean; className?: string
}) {
  return (
    <th className={`font-medium px-4 py-3 ${right ? 'text-right' : ''} ${className}`}>
      <button onClick={onClick}
        className={`uppercase tracking-wide cursor-pointer hover:text-ink transition-colors ${ativa ? 'text-ink' : ''}`}>
        {children}{ativa ? (dir === 1 ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  )
}
