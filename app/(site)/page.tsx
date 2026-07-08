'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import DetalhePrato from '../DetalhePrato'
import { useAuth } from '../useAuth'
import {
  getDishCostsRange, getSnapshotsNovos, getAllDetalhes, getAllFontes, getAllFontesManuais,
  getStatsPublicas, getSeriePratos, getPrecosPorRegiao, getPratosPorIngrediente, getSerieIngrediente,
  type FonteManual, type StatsPublicas, type SeriePratos, type ProdutoRegiao, type PratoDeIngrediente, type PontoIngrediente,
} from '@/lib/queries'
import { NIVEIS_PRECO, MODOS, REGIOES, brl, fmtData, limparNome } from '@/lib/format'
import { INF_PATH } from '@/components/site/Logo'
import { mediana } from '@/lib/stats'
import { CORES_REGIAO, COR_ALTA, COR_QUEDA, DIM, NIVEL_HEX } from '@/lib/theme'
import Sparkline from '@/components/dashboard/Sparkline'
import TabelaProdutosRegiao from '@/components/dashboard/TabelaProdutosRegiao'
import AdSlot from '@/components/ads/AdSlot'
import AdGate from '@/components/ads/AdGate'
import AdPopup from '@/components/ads/AdPopup'
import ShareModal from '@/components/dashboard/ShareModal'
import OrientPopup from '@/components/site/OrientPopup'
import type { ModoKey, Snapshot, DishCost, ItemDetalhe, Fonte } from '@/lib/types'

const fmtCurta = (d: string) => { const [, m, dia] = d.split('-'); return `${dia}/${m}` }

// ícones dos grupos de filtro (mockup usa emoji; decisão de 08/07: SVG equivalente)
const ico = (d: string, size = 12) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)
const ICO = {
  gear: ico('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a7.4 7.4 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.4 7.4 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5a7.4 7.4 0 0 0 0 2.4l-2 1.5 2 3.5 2.4-1a7.4 7.4 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.4 7.4 0 0 0 2-1.2l2.4 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2z', 14),
  search: ico('M21 21l-4.3-4.3M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z'),
  coin: ico('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm3-11.5c0-1.4-1.3-2.5-3-2.5s-3 1.1-3 2.5 1.3 2.5 3 2.5 3 1.1 3 2.5-1.3 2.5-3 2.5-3-1.1-3-2.5M12 5.5V7m0 10v1.5'),
  pin: ico('M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0zm-5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'),
  cal: ico('M8 2v4M16 2v4M3 8h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'),
  share: ico('M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7', 14),
  lock: ico('M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zm3 0V7a4 4 0 0 1 8 0v4', 24),
  info: ico('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-13.5v.5m0 3v5', 16),
  dish: ico('M4 3v7a2 2 0 0 0 2 2v9M8 3v5M4 5.5h4M15 12c0-5 1.5-9 4-9v18m-4-9h4'),
  box: ico('M21 8l-9-5-9 5v8l9 5 9-5V8zm-9 5L3 8m9 5l9-5m-9 5v8'),
}

type ColunaSort = 'nome' | 'regiao' | 'custo' | 'delta'

export default function Dashboard() {
  const { profile, isPremium } = useAuth()
  const isAdmin = !!profile?.is_admin
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [custos, setCustos]     = useState<DishCost[]>([])
  const [loading, setLoading]   = useState(true)
  const [snapsNovos, setSnapsNovos] = useState<{ id: number; data: string }[]>([])
  const [ini, setIni] = useState(''); const [fim, setFim] = useState('')   // período APLICADO (vazio = última coleta)
  const [pendIni, setPendIni] = useState(''); const [pendFim, setPendFim] = useState('')   // datas em edição (item 1: só valem no Aplicar)
  const [stats, setStats] = useState<StatsPublicas | null>(null)
  const [serie, setSerie] = useState<SeriePratos | null>(null)
  const [produtosRegiao, setProdutosRegiao] = useState<ProdutoRegiao[]>([])
  const [banner, setBanner] = useState(true)

  const [modo, setModo]         = useState<ModoKey>('online')
  const [regioes, setRegioes]   = useState<Set<string>>(new Set())   // vazio = todas
  const [busca, setBusca]       = useState('')
  const [sort, setSort]         = useState<{ col: ColunaSort; dir: 1 | -1 }>({ col: 'custo', dir: 1 })
  const [selecionado, setSelecionado] = useState<DishCost | null>(null)
  const [ingModal, setIngModal] = useState<{ id: number; nome: string } | null>(null)
  const [pratosDoIng, setPratosDoIng] = useState<PratoDeIngrediente[] | null>(null)
  const [serieIng, setSerieIng] = useState<PontoIngrediente[] | null>(null)
  const [filtroIng, setFiltroIng] = useState<{ id?: number; nome: string; ids: Set<number> } | null>(null)
  const [pratoSel, setPratoSel] = useState<number | null>(null)   // select "Prato Feito" dos filtros (mockup)
  const [share, setShare] = useState(false)
  const [comparar, setComparar] = useState(false)                          // toggle do mockup: linha da coleta anterior + coluna "ant."
  const [legendOff, setLegendOff] = useState<Set<string>>(new Set())       // legenda clicável do gráfico geral
  const [detalhes, setDetalhes] = useState<Record<number, ItemDetalhe[]> | null>(null)
  const [fontes, setFontes]     = useState<Record<number, Fonte[]>>({})
  const [fontesManuais, setFontesManuais] = useState<Record<number, FonteManual[]>>({})

  const [pratoUrl, setPratoUrl] = useState<number | null>(null)
  useEffect(() => {
    getSnapshotsNovos().then(setSnapsNovos)
    getStatsPublicas().then(setStats)
    getSeriePratos().then(setSerie)
    // deep-link (compartilhar filtro/prato): ?nivel=&regioes=&q=&prato=
    const q = new URLSearchParams(window.location.search)
    const n = q.get('nivel'); if (n && NIVEIS_PRECO.some(x => x.key === n && x.disponivel)) setModo(n as ModoKey)
    const r = q.get('regioes'); if (r) setRegioes(new Set(r.split(',').filter(x => (REGIOES as readonly string[]).includes(x))))
    const b = q.get('q'); if (b) setBusca(b)
    const p = q.get('prato'); if (p && Number(p) > 0) setPratoUrl(Number(p))
  }, [])
  // abre o prato do deep-link quando os custos chegam
  useEffect(() => {
    if (pratoUrl == null || !custos.length) return
    const c = custos.find(x => x.pratos.id === pratoUrl)
    if (c) setSelecionado(c)
    setPratoUrl(null)
  }, [pratoUrl, custos])
  // mantém a URL espelhando o estado — é o que o Compartilhar copia
  useEffect(() => {
    const q = new URLSearchParams()
    if (modo !== 'online') q.set('nivel', modo)
    if (regioes.size) q.set('regioes', [...regioes].join(','))
    if (busca.trim()) q.set('q', busca.trim())
    if (selecionado) q.set('prato', String(selecionado.pratos.id))
    const qs = q.toString()
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
  }, [modo, regioes, busca, selecionado])
  useEffect(() => {
    if (!snapsNovos.length) return
    ;(async () => {
      const range = snapsNovos.filter(s => (!ini || s.data >= ini) && (!fim || s.data <= fim))
      const ref = range[0] || snapsNovos[0]   // desc → coleta mais recente do intervalo
      setSnapshot({ id: ref.id, data: ref.data, custo_total_pf: 0 } as Snapshot)
      setCustos(await getDishCostsRange(ini, fim))
      setLoading(false)
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
    let a = '', b = ''
    if (dias === 0) { a = snapsNovos[snapsNovos.length - 1].data; b = snapsNovos[0].data }
    else { b = snapsNovos[0].data; const d = new Date(b + 'T00:00:00Z'); d.setDate(d.getDate() - dias); a = d.toISOString().slice(0, 10) }
    setPendIni(a); setPendFim(b); setIni(a); setFim(b)   // preset aplica na hora
  }
  function aplicarPeriodo() { setIni(pendIni); setFim(pendFim) }
  const periodoPendente = pendIni !== ini || pendFim !== fim

  const nivel = NIVEIS_PRECO.find(n => n.key === modo)!
  const fator = 1 - nivel.desc

  const custosRegiao = useMemo(() => regioes.size ? custos.filter(c => regioes.has(c.pratos.regiao)) : custos, [custos, regioes])
  const indice = useMemo(() => mediana(custosRegiao.map(c => c.custo_total)), [custosRegiao])

  // ── série (gráficos, Δ, movers, sparklines) ─────────────────────────────
  const idsRecorte = useMemo(() => {
    if (!serie) return new Set<number>()
    return new Set(serie.pratos.filter(p => !regioes.size || regioes.has(p.regiao)).map(p => p.id))
  }, [serie, regioes])

  const serieIndice = useMemo(() => {
    if (!serie) return []
    return serie.snaps.map((s, i) => {
      const vals = serie.pratos.filter(p => idsRecorte.has(p.id))
        .map(p => serie.custos[p.id]?.[i]).filter((v): v is number => v != null && v > 0)
      const med = mediana(vals)
      const row: Record<string, number | string> = { data: fmtCurta(s.data), indice: +(med * fator).toFixed(2) }
      for (const n of MODOS) row[n.key] = +(med * (1 - n.desc)).toFixed(2)   // uma linha por nível (legenda clicável)
      for (const r of REGIOES) {
        const vr = serie.pratos.filter(p => p.regiao === r).map(p => serie.custos[p.id]?.[i])
          .filter((v): v is number => v != null && v > 0)
        if (vr.length) row[r] = +(mediana(vr) * fator).toFixed(2)
      }
      return row
    })
  }, [serie, idsRecorte, fator])

  // Δ% do índice do recorte entre as duas últimas coletas (por nível o Δ é o mesmo)
  const deltaIndice = useMemo(() => {
    if (serieIndice.length < 2) return null
    const a = serieIndice[serieIndice.length - 2].indice as number
    const b = serieIndice[serieIndice.length - 1].indice as number
    return a > 0 ? (b - a) / a * 100 : null
  }, [serieIndice])

  // comparar com período anterior: valor da coleta anterior como linha tracejada
  const chartGeral = useMemo(() => {
    if (!comparar) return serieIndice
    return serieIndice.map((row, i) => ({ ...row, anterior: i > 0 ? serieIndice[i - 1][modo] : null }))
  }, [serieIndice, comparar, modo])

  // Δ% do índice desde a 1ª coleta do histórico (linha secundária do KPI)
  const deltaTotal = useMemo(() => {
    if (serieIndice.length < 2) return null
    const a = serieIndice[0].indice as number
    const b = serieIndice[serieIndice.length - 1].indice as number
    return a > 0 ? (b - a) / a * 100 : null
  }, [serieIndice])

  function toggleLegend(key: string) {
    setLegendOff(prev => { const nx = new Set(prev); if (nx.has(key)) nx.delete(key); else nx.add(key); return nx })
  }

  const movers = useMemo(() => {
    if (!serie || serie.snaps.length < 2) return null
    const n = serie.snaps.length
    const deltas = serie.pratos.filter(p => idsRecorte.has(p.id)).map(p => {
      const ant = serie.custos[p.id]?.[n - 2], atual = serie.custos[p.id]?.[n - 1]
      if (ant == null || atual == null || ant <= 0) return null
      return { prato: p, delta: (atual - ant) / ant * 100, serie: serie.custos[p.id] }
    }).filter((x): x is NonNullable<typeof x> => x != null && x.delta !== 0)
    const ord = [...deltas].sort((a, b) => b.delta - a.delta)
    return { altas: ord.filter(d => d.delta > 0).slice(0, 5), quedas: ord.filter(d => d.delta < 0).reverse().slice(0, 5) }
  }, [serie, idsRecorte])

  const porPrato = useMemo(() => {
    const out: Record<number, { delta: number | null; deltaAnt: number | null; serie: (number | null)[] }> = {}
    if (!serie) return out
    const n = serie.snaps.length
    for (const p of serie.pratos) {
      const arr = serie.custos[p.id] || []
      const ant = n >= 2 ? arr[n - 2] : null, atual = arr[n - 1]
      const ant2 = n >= 3 ? arr[n - 3] : null   // coleta anterior à anterior (toggle comparar)
      out[p.id] = {
        delta: ant != null && atual != null && ant > 0 ? (atual - ant) / ant * 100 : null,
        deltaAnt: ant2 != null && ant != null && ant2 > 0 ? (ant - ant2) / ant2 * 100 : null,
        serie: arr,
      }
    }
    return out
  }, [serie])

  // item 1: com filtro por ingrediente ativo, a tabela de produtos mostra só
  // os ingredientes que entram nos pratos filtrados (via composição carregada)
  const lista = useMemo(() => {
    let l = custos
    if (regioes.size) l = l.filter(c => regioes.has(c.pratos.regiao))
    if (pratoSel != null) l = l.filter(c => c.pratos.id === pratoSel)
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
      else {
        const da = porPrato[a.pratos.id]?.delta, db = porPrato[b.pratos.id]?.delta
        if (da == null && db == null) cmp = 0
        else if (da == null) return 1
        else if (db == null) return -1
        else cmp = da - db
      }
      return cmp * dir
    })
  }, [custos, regioes, busca, sort, filtroIng, pratoSel, porPrato])

  const produtosRegiaoFiltrados = useMemo(() => {
    const temFiltro = !!(filtroIng || regioes.size || busca.trim() || pratoSel != null)
    if (!temFiltro || !detalhes) return produtosRegiao
    const ids = new Set<number>()
    for (const c of lista) for (const it of (detalhes[c.pratos.id] ?? [])) ids.add(it.ingrediente_id)
    return produtosRegiao.filter(p => ids.has(p.id))
  }, [produtosRegiao, filtroIng, regioes, busca, pratoSel, lista, detalhes])

  // select "Produto" dos filtros: aplica o mesmo filtro de ingrediente do drill
  function selecionarProduto(v: string) {
    if (!v) { setFiltroIng(null); return }
    const p = produtosRegiao.find(x => x.id === Number(v))
    if (!p) return
    getPratosPorIngrediente(p.id).then(ps => setFiltroIng({ id: p.id, nome: p.nome, ids: new Set(ps.map(x => x.prato_id)) }))
  }

  function toggleSort(col: ColunaSort) {
    setSort(s => s.col === col ? { col, dir: s.dir === 1 ? -1 : 1 } : { col, dir: 1 })
  }
  function toggleRegiao(r: string) {
    setRegioes(prev => { const nx = new Set(prev); if (nx.has(r)) nx.delete(r); else nx.add(r); return nx })
  }
  function abrirIngrediente(ing: { id: number; nome: string }) {
    setIngModal(ing); setPratosDoIng(null); setSerieIng(null)
    getPratosPorIngrediente(ing.id).then(setPratosDoIng)
    getSerieIngrediente(ing.id).then(setSerieIng)
  }

  const temSerie = serieIndice.length >= 2
  const rotuloRecorte = regioes.size === 0 ? 'Brasil' : regioes.size === 1 ? [...regioes][0] : `${regioes.size} regiões`

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center text-dim">
        <p className="font-bold tracking-tight text-lg">Carregando o Índice PF…</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen">
      <OrientPopup />
      <AdPopup />

      {/* ===== HERO (gradiente da marca, como no mockup) ===== */}
      <section className="hero">
        <div className="hero-inf">
          <svg viewBox="0 0 100 50" style={{ width: '100%', height: '100%' }} aria-hidden="true"><path fill="#fff" d={INF_PATH} /></svg>
        </div>
        <div className="hero-inner">
          <div className="hero-copy">
            <h1>O <span className="em">custo de produção</span> do Prato Feito brasileiro</h1>
            <p>
              Acompanhe, coleta a coleta, quanto custa produzir a comida de verdade — do preço online ao
              atacarejo — em todas as regiões do Brasil.
            </p>
            {stats && (
              <div className="hero-stats">
                <div className="hs"><b className="tnum">{stats.pratos}</b><span>pratos monitorados</span></div>
                <div className="hs"><b className="tnum">{stats.ingredientes}</b><span>produtos rastreados</span></div>
                <div className="hs"><b>5</b><span>regiões</span></div>
                <div className="hs"><b className="tnum">{snapsNovos.length}</b><span>coleta{snapsNovos.length === 1 ? '' : 's'}</span></div>
                {stats.contribuicoesAprovadas > 0 && (
                  <div className="hs"><b className="tnum">{stats.contribuicoesAprovadas}</b><span>fotos aprovadas</span></div>
                )}
              </div>
            )}
          </div>
          {/* retângulo de publicidade do hero (mockup) */}
          <div className="hero-ad"><AdSlot slot="hero-lado" /></div>
        </div>
      </section>

      <div className="site-main">
        <AdSlot slot="hero" className="mb-[22px]" />

        <div className="layout">
          {/* ===== FILTROS (painel do mockup) ===== */}
          <aside className="filters">
            <div className="filters-head">
              <h3>{ICO.gear} Filtros</h3>
              <span className="clr" onClick={() => { setRegioes(new Set()); setBusca(''); setFiltroIng(null); setPratoSel(null); setComparar(false); setLegendOff(new Set()); setPendIni(''); setPendFim(''); setIni(''); setFim('') }}>Limpar</span>
            </div>
            <div className="f-group">
              <div className="f-label">{ICO.search} Busca</div>
              <input className="f-search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Prato ou produto..." />
            </div>
            <div className="f-group">
              <div className="f-label">{ICO.coin} Nível de preço</div>
              <div className="seg">
                {NIVEIS_PRECO.map(n => (
                  <button key={n.key} disabled={!n.disponivel}
                    className={modo === n.key ? 'on' : ''}
                    onClick={() => n.disponivel && setModo(n.key as ModoKey)}>
                    <span className="sw" style={{ background: NIVEL_HEX[n.key] }} />
                    {n.label}{!n.disponivel ? ' · em breve' : ''}
                  </button>
                ))}
              </div>
            </div>
            <div className="f-group">
              <div className="f-label">{ICO.pin} Região</div>
              <div className="seg">
                {REGIOES.map(r => (
                  <button key={r} className={regioes.has(r) ? 'on' : ''} onClick={() => toggleRegiao(r)}>{r}</button>
                ))}
              </div>
            </div>
            <div className="f-group">
              <div className="f-label">{ICO.cal} Período</div>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {([['7d', 7], ['15d', 15], ['30d', 30], ['3m', 90], ['Tudo', 0]] as const).map(([label, d]) => (
                    <button key={label} onClick={() => presetHome(d)}
                      className="region-bar-btn px-2.5 py-1 rounded-full text-xs font-semibold bg-surface-3 text-ink-2 hover:text-ink transition cursor-pointer">{label}</button>
                  ))}
                </div>
                <input type="date" className="f-search" value={pendIni} onChange={e => setPendIni(e.target.value)} />
                <input type="date" className="f-search" value={pendFim} onChange={e => setPendFim(e.target.value)} />
                <button className={`btn-mk sm ${periodoPendente ? 'primary' : ''}`} onClick={aplicarPeriodo} disabled={!periodoPendente}>
                  {periodoPendente ? 'Aplicar período' : nColetasHome > 1 ? `${nColetasHome} coletas no período ✓` : 'Período aplicado ✓'}
                </button>
                <div className="cmp-toggle" onClick={() => setComparar(c => !c)}>
                  <div className={`switch ${comparar ? 'on' : ''}`} />
                  <span>Comparar com período anterior</span>
                </div>
              </div>
            </div>
            <div className="f-group">
              <div className="f-label">{ICO.dish} Prato Feito</div>
              <select className="f-search" value={pratoSel ?? ''}
                onChange={e => setPratoSel(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Todos os pratos</option>
                {[...custos].sort((a, b) => limparNome(a.pratos.nome).localeCompare(limparNome(b.pratos.nome))).map(c => (
                  <option key={c.pratos.id} value={c.pratos.id}>{limparNome(c.pratos.nome)}</option>
                ))}
              </select>
            </div>
            <div className="f-group">
              <div className="f-label">{ICO.box} Produto</div>
              <select className="f-search" value={filtroIng?.id ?? ''} onChange={e => selecionarProduto(e.target.value)}>
                <option value="">Todos os produtos</option>
                {[...produtosRegiao].sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).map(p => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>
            <div className="f-group">
              <AdSlot slot="lateral" />
            </div>
          </aside>

          {/* ===== CONTEÚDO ===== */}
          <div className="content">
            {/* banner de metodologia (mockup) */}
            {banner && (
              <div className="method-banner">
                <div className="mb-ico">{ICO.info}</div>
                <div>
                  <h4>Como coletamos estes dados</h4>
                  <p>
                    Combinamos coleta automática no varejo online (2× por mês), leituras manuais da equipe e
                    <b> fotos de preços enviadas por usuários</b>, validadas uma a uma. Os níveis Mercado e
                    Atacarejo são estimativas sobre o preço online, em calibração com os dados de campo.
                    Metodologia aberta em <a href="/metodologia" className="underline">/metodologia</a>.
                  </p>
                </div>
                <div className="mb-x" onClick={() => setBanner(false)}>×</div>
              </div>
            )}

            {/* KPIs — um por nível de preço; scorecard composto (decisão de 08/07):
                variação % como número principal + valor em R$ no canto inferior direito */}
            <div className="grid sm:grid-cols-3 gap-[14px]">
              {MODOS.map(n => {
                const f = 1 - n.desc
                const cls = deltaIndice == null ? 'flat' : deltaIndice > 0.05 ? 'up' : deltaIndice < -0.05 ? 'down' : 'flat'
                const arrow = cls === 'up' ? '▲' : cls === 'down' ? '▼' : '▬'
                return (
                  <button key={n.key} className={`kpi ${modo === n.key ? 'active' : ''}`} onClick={() => setModo(n.key as ModoKey)}>
                    <div className="kbar" style={{ background: NIVEL_HEX[n.key] }} />
                    <div className="klabel">
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: NIVEL_HEX[n.key], display: 'inline-block' }} />
                      {n.label}
                    </div>
                    <div className="kval tnum">
                      {deltaIndice != null ? `${deltaIndice > 0 ? '+' : ''}${deltaIndice.toFixed(2)}%` : '—'}
                    </div>
                    <div className={`ktrend ${cls}`}>
                      {deltaIndice != null ? <>{arrow} coleta · <span style={{ color: 'var(--dim)', fontWeight: 600 }}>
                        {deltaTotal != null ? `${deltaTotal > 0 ? '+' : ''}${deltaTotal.toFixed(1)}% desde a 1ª` : '—'}
                      </span></> : 'primeira coleta do recorte'}
                    </div>
                    <div className="kbrl tnum">{brl(indice * f)}</div>
                  </button>
                )
              })}
            </div>

            {/* ===== ÍNDICE PF GERAL ===== */}
            <AdGate slot="gate-grafico">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h2>Índice PF Geral <span className="premium-tag" style={{ background: 'var(--info-bg)', color: 'var(--azul)' }}>
                    {regioes.size > 0 ? rotuloRecorte : 'Brasil · nacional'}
                  </span></h2>
                  <div className="sub">Mediana dos {custosRegiao.length} pratos · coleta a coleta{snapshot ? ` · última em ${fmtData(snapshot.data)}` : ''}</div>
                </div>
                <div className="panel-tools">
                  <div className="segbar">
                    {NIVEIS_PRECO.map(n => (
                      <button key={n.key} disabled={!n.disponivel} className={modo === n.key ? 'on' : ''}
                        onClick={() => n.disponivel && setModo(n.key as ModoKey)}>
                        {n.grupo === 'consumidor' ? (n.key === 'online' ? 'Online' : 'Mercado') : n.label}
                      </button>
                    ))}
                  </div>
                  {deltaIndice != null && (
                    <span className={`var-badge ${deltaIndice > 0 ? 'up' : 'down'}`}>
                      {deltaIndice > 0 ? '+' : ''}{deltaIndice.toFixed(2)}%<small>vs coleta anterior</small>
                    </span>
                  )}
                  <button className="btn-mk sm" onClick={() => setShare(true)}>{ICO.share} Compartilhar</button>
                </div>
              </div>
              <div className="panel-body">
                {temSerie ? (
                  <>
                    <div className="h-60">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartGeral} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="data" tick={{ fontSize: 12, fill: DIM }} />
                          <YAxis tick={{ fontSize: 12, fill: DIM }} width={52} domain={['auto', 'auto']}
                            tickFormatter={(v: number) => `R$${v}`} />
                          <Tooltip formatter={(v) => brl(Number(v))} />
                          {MODOS.filter(n => !legendOff.has(n.key)).map(n => (
                            <Line key={n.key} type="monotone" dataKey={n.key} name={n.label}
                              stroke={NIVEL_HEX[n.key]} strokeWidth={n.key === modo ? 2.5 : 1.8}
                              dot={{ r: n.key === modo ? 4 : 3 }} />
                          ))}
                          {comparar && (
                            <Line type="monotone" dataKey="anterior" name="Período anterior"
                              stroke="var(--dim)" strokeWidth={1.8} strokeDasharray="5 4" dot={false} />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    {/* legenda clicável do mockup: liga/desliga a linha de cada nível */}
                    <div className="chart-legend">
                      {MODOS.map(n => (
                        <div key={n.key} className={`lg ${legendOff.has(n.key) ? 'off' : ''}`} onClick={() => toggleLegend(n.key)}>
                          <span className="sw" style={{ background: NIVEL_HEX[n.key] }} />{n.label}
                        </div>
                      ))}
                      {comparar && (
                        <div className="lg" style={{ cursor: 'default' }}>
                          <span className="sw" style={{ background: 'none', height: 0, borderTop: '2px dashed var(--dim)' }} />Período anterior
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-dim py-8 text-center">O gráfico aparece a partir da 2ª coleta do recorte. Coletas nos dias 1 e 15.</p>
                )}
              </div>
            </div>
            </AdGate>

            <AdSlot slot="billboard" />

            {/* ===== ÍNDICE POR REGIÃO ===== */}
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h2>Índice PF por Região</h2>
                  <div className="sub">Mediana dos pratos de cada região, no nível {nivel.label}</div>
                </div>
                <div className="panel-tools">
                  {deltaIndice != null && (
                    <span className={`var-badge ${deltaIndice > 0 ? 'up' : 'down'}`}>
                      {deltaIndice > 0 ? '+' : ''}{deltaIndice.toFixed(2)}%<small>vs coleta anterior</small>
                    </span>
                  )}
                  <button className="btn-mk sm" onClick={() => setShare(true)}>{ICO.share} Compartilhar</button>
                </div>
              </div>
              <div className="panel-body">
                <div className="region-bar" style={{ marginBottom: 18 }}>
                  {REGIOES.map(r => (
                    <button key={r} className={regioes.has(r) ? 'on' : ''} onClick={() => toggleRegiao(r)}>{r}</button>
                  ))}
                </div>
                {temSerie ? (
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={serieIndice} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="data" tick={{ fontSize: 12, fill: DIM }} />
                        <YAxis tick={{ fontSize: 12, fill: DIM }} width={52} domain={['auto', 'auto']}
                          tickFormatter={(v: number) => `R$${v}`} />
                        <Tooltip formatter={(v) => brl(Number(v))} />
                        {REGIOES.filter(r => !regioes.size || regioes.has(r)).map(r => (
                          <Line key={r} type="monotone" dataKey={r} name={r}
                            stroke={CORES_REGIAO[r]} strokeWidth={regioes.has(r) ? 2.5 : 1.8} dot={{ r: 3 }} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {REGIOES.map(r => {
                      const vals = custos.filter(c => c.pratos.regiao === r).map(c => c.custo_total)
                      const v = mediana(vals) * fator
                      const max = Math.max(...REGIOES.map(rr => mediana(custos.filter(c => c.pratos.regiao === rr).map(c => c.custo_total)))) * fator || 1
                      return (
                        <div key={r} className="flex items-center gap-3 text-sm">
                          <span className="w-28 shrink-0 font-semibold text-ink-2">{r}</span>
                          <div className="flex-1 h-5 bg-surface-3 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${v / max * 100}%`, background: CORES_REGIAO[r] }} />
                          </div>
                          <span className="tnum font-bold w-20 text-right">{brl(v)}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ===== DESTAQUES DA SEMANA ===== */}
            {movers && (movers.altas.length > 0 || movers.quedas.length > 0) && (
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Destaques da coleta</h2>
                    <div className="sub">Variação de cada prato vs a coleta anterior — {rotuloRecorte}</div>
                  </div>
                </div>
                <div className="panel-body">
                  <div className="movers-grid">
                    <div className="mover-col">
                      <h3>Maiores altas</h3>
                      {movers.altas.map((m, i) => (
                        <div key={m.prato.id} className="mover" onClick={() => { const c = custos.find(x => x.pratos.id === m.prato.id); if (c) setSelecionado(c) }}>
                          <div className="rank">{i + 1}</div>
                          <div className="mn">{limparNome(m.prato.nome)}</div>
                          <span className="spark"><Sparkline valores={m.serie} cor={COR_ALTA} w={74} h={26} /></span>
                          <div className="mp up">+{m.delta.toFixed(1)}%</div>
                        </div>
                      ))}
                      {!movers.altas.length && <p className="text-xs text-dim">Nenhuma alta entre as duas últimas coletas.</p>}
                    </div>
                    <div className="mover-col">
                      <h3>Maiores quedas</h3>
                      {movers.quedas.map((m, i) => (
                        <div key={m.prato.id} className="mover" onClick={() => { const c = custos.find(x => x.pratos.id === m.prato.id); if (c) setSelecionado(c) }}>
                          <div className="rank">{i + 1}</div>
                          <div className="mn">{limparNome(m.prato.nome)}</div>
                          <span className="spark"><Sparkline valores={m.serie} cor={COR_QUEDA} w={74} h={26} /></span>
                          <div className="mp down">{m.delta.toFixed(1)}%</div>
                        </div>
                      ))}
                      {!movers.quedas.length && <p className="text-xs text-dim">Nenhuma queda entre as duas últimas coletas.</p>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <AdSlot slot="leaderboard" />

            {/* ===== TABELA DE PRATOS ===== */}
            <div className="panel" id="tabela-pratos">
              <div className="panel-head">
                <div>
                  <h2>Pratos Feitos{regioes.size > 0 && <span className="premium-tag" style={{ background: 'var(--info-bg)', color: 'var(--azul)' }}>{rotuloRecorte}</span>}</h2>
                  <div className="sub">{lista.length} pratos · {nivel.label}{snapshot ? ` · coleta de ${fmtData(snapshot.data)}` : ''}</div>
                </div>
                <div className="panel-tools">
                  {filtroIng && (
                    <button onClick={() => setFiltroIng(null)}
                      className="text-xs bg-accent/10 text-accent border border-accent/30 rounded-full px-2.5 py-1 hover:bg-accent/20 transition cursor-pointer">
                      com {filtroIng.nome} · limpar ×
                    </button>
                  )}
                  <input className="f-search" style={{ width: 180 }} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Filtrar pratos..." />
                  <button className="btn-mk sm" onClick={() => setShare(true)} aria-label="Compartilhar">{ICO.share}</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="tbl-mk">
                  <thead>
                    <tr>
                      <th onClick={() => toggleSort('nome')}>Prato{sort.col === 'nome' ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</th>
                      <th className="max-sm:hidden" onClick={() => toggleSort('regiao')}>Região{sort.col === 'regiao' ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</th>
                      <th style={{ textAlign: 'right' }} onClick={() => toggleSort('custo')}>Custo{sort.col === 'custo' ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</th>
                      {temSerie && <th className="max-md:hidden" style={{ textAlign: 'right' }} onClick={() => toggleSort('delta')}>Δ última{sort.col === 'delta' ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</th>}
                      {temSerie && <th className="max-lg:hidden" style={{ textAlign: 'right', cursor: 'default' }}>Tendência</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((c, idx) => {
                      const pp = porPrato[c.pratos.id]
                      const adRow = idx === 8 ? (
                        <tr><td colSpan={temSerie ? 5 : 3} style={{ padding: 0 }}><AdSlot slot="nativo" /></td></tr>
                      ) : null
                      return (
                        <Fragment key={c.pratos.id}>
                          {adRow}
                          <tr onClick={() => setSelecionado(c)}>
                            <td className="font-medium">{limparNome(c.pratos.nome)}</td>
                            <td className="max-sm:hidden text-dim">{c.pratos.regiao}</td>
                            <td className="text-right font-semibold tnum">{brl(c.custo_total * fator)}</td>
                            {temSerie && (
                              <td className="max-md:hidden text-right tnum font-semibold"
                                style={{ color: pp?.delta == null ? undefined : pp.delta > 0 ? COR_ALTA : pp.delta < 0 ? COR_QUEDA : undefined }}>
                                {pp?.delta == null ? '—' : `${pp.delta > 0 ? '+' : ''}${pp.delta.toFixed(1)}%`}
                                {comparar && (
                                  <span className="pct-prev" style={{ justifyContent: 'flex-end' }}>
                                    <span className="lbl">ant.</span>
                                    <span className={`pv ${pp?.deltaAnt == null ? 'flat' : pp.deltaAnt > 0 ? 'up' : 'down'}`}>
                                      {pp?.deltaAnt == null ? '—' : `${pp.deltaAnt > 0 ? '+' : ''}${pp.deltaAnt.toFixed(1)}%`}
                                    </span>
                                  </span>
                                )}
                              </td>
                            )}
                            {temSerie && (
                              <td className="max-lg:hidden text-right">
                                {pp && <Sparkline valores={pp.serie} cor={DIM} />}
                              </td>
                            )}
                          </tr>
                        </Fragment>
                      )
                    })}
                    {!lista.length && (
                      <tr><td colSpan={temSerie ? 5 : 3} className="text-center text-dim" style={{ padding: '32px 16px' }}>Nenhum prato encontrado.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ===== PRODUTOS POR REGIÃO (PREMIUM) — segue o filtro por ingrediente ===== */}
            {produtosRegiao.length > 0 && (
              <AdGate slot="gate-tabela">
                <TabelaProdutosRegiao linhas={produtosRegiaoFiltrados} destravada={isAdmin || isPremium}
                  filtroNome={filtroIng?.nome} onLimparFiltro={() => setFiltroIng(null)}
                  onIngrediente={abrirIngrediente} />
              </AdGate>
            )}
          </div>
        </div>
      </div>

      {selecionado && snapshot && (
        <DetalhePrato dish={selecionado}
          itens={detalhes ? (detalhes[selecionado.pratos.id] ?? []) : null}
          fontesPorIngrediente={fontes} manuaisPorIngrediente={fontesManuais} fator={fator} modo={modo}
          dataColeta={snapshot.data}
          serie={serie ? { labels: serie.snaps.map(s => fmtCurta(s.data)), valores: serie.custos[selecionado.pratos.id] ?? [] } : undefined}
          onShare={() => setShare(true)}
          onClose={() => setSelecionado(null)} />
      )}

      {share && <ShareModal contexto={`${rotuloRecorte} · ${nivel.label}`} onClose={() => setShare(false)} />}

      {/* drill de produto — modal central do mockup (openProductDrill) */}
      {ingModal && (
        <div className="modal-back z-[100]" onClick={() => setIngModal(null)}>
          <div onClick={e => e.stopPropagation()} className="modal-mk wide">
            <div className="modal-head">
              <div>
                <h2>{ingModal.nome}</h2>
                <p>preço rastreado · margem ±5%</p>
              </div>
              <div className="modal-x" onClick={() => setIngModal(null)}>×</div>
            </div>
            <div className="modal-body">
              <div className="segbar" style={{ marginBottom: 14 }}>
                {NIVEIS_PRECO.map(n => (
                  <button key={n.key} disabled={!n.disponivel} className={modo === n.key ? 'on' : ''}
                    onClick={() => n.disponivel && setModo(n.key as ModoKey)}>
                    {n.grupo === 'consumidor' ? (n.key === 'online' ? 'Online' : 'Mercado') : n.label}
                  </button>
                ))}
              </div>
              {serieIng && serieIng.length >= 2 ? (
                <>
                  <div className="h-52 mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={serieIng.map(p => ({ data: fmtCurta(p.data), valor: +(p.valor * fator).toFixed(2) }))}
                        margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="data" tick={{ fontSize: 11, fill: DIM }} />
                        <YAxis tick={{ fontSize: 11, fill: DIM }} width={46} domain={['auto', 'auto']}
                          tickFormatter={(v: number) => `R$${v}`} />
                        <Tooltip formatter={(v) => `${brl(Number(v))}${serieIng[0]?.label ? `/${serieIng[0].label}` : ''}`} />
                        <Line type="monotone" dataKey="valor" name="Preço"
                          stroke={NIVEL_HEX[modo]} strokeWidth={2.5} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {(() => {
                    const v = serieIng.map(p => p.valor * fator)
                    const a = v[v.length - 1], p0 = v[v.length - 2], i0 = v[0]
                    const dA = p0 > 0 ? (a - p0) / p0 * 100 : null
                    const dI = i0 > 0 && v.length > 2 ? (a - i0) / i0 * 100 : null
                    const cor = (x: number | null) => x == null ? 'var(--faint)' : x > 0 ? 'var(--danger)' : 'var(--ok)'
                    const pc = (x: number | null) => x == null ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(1)}%`
                    return (
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="stat-mini"><span className="k">Preço atual</span><b className="tnum">{brl(a)}{serieIng[0]?.label ? `/${serieIng[0].label}` : ''}</b></div>
                        <div className="stat-mini"><span className="k">vs coleta anterior</span><b className="tnum" style={{ color: cor(dA) }}>{pc(dA)}</b></div>
                        <div className="stat-mini"><span className="k">desde a 1ª coleta</span><b className="tnum" style={{ color: cor(dI) }}>{pc(dI)}</b></div>
                      </div>
                    )
                  })()}
                </>
              ) : serieIng == null ? <p className="text-sm text-dim py-2">Carregando…</p>
                : <p className="text-sm text-dim py-2">Série disponível a partir da 2ª coleta.</p>}

              <h3 className="text-xs font-bold uppercase tracking-wide text-dim mb-2">Pratos que usam este produto</h3>
              {!pratosDoIng ? (
                <p className="text-sm text-dim py-2">Carregando…</p>
              ) : !pratosDoIng.length ? (
                <p className="text-sm text-dim py-2">Nenhum prato usa este produto.</p>
              ) : (
                <>
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
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setFiltroIng({ id: ingModal.id, nome: ingModal.nome, ids: new Set(pratosDoIng.map(p => p.prato_id)) })
                        setIngModal(null)
                        document.getElementById('tabela-pratos')?.scrollIntoView({ behavior: 'smooth' })
                      }}
                      className="btn-mk primary flex-1 justify-center">
                      Filtrar tabelas por esses pratos
                    </button>
                    <button className="btn-mk" onClick={() => setIngModal(null)}>Fechar</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
