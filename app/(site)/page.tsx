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
import { NIVEIS_PRECO, REGIOES, brl, fmtData, limparNome } from '@/lib/format'
import { mediana } from '@/lib/stats'
import { CORES_REGIAO, COR_ALTA, COR_QUEDA, DIM, NIVEL_HEX } from '@/lib/theme'
import { Modal } from '@/components/ui'
import Sparkline from '@/components/dashboard/Sparkline'
import TabelaProdutosRegiao from '@/components/dashboard/TabelaProdutosRegiao'
import AdSlot from '@/components/ads/AdSlot'
import AdGate from '@/components/ads/AdGate'
import AdPopup from '@/components/ads/AdPopup'
import ShareModal from '@/components/dashboard/ShareModal'
import OrientPopup from '@/components/site/OrientPopup'
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
  const [filtroIng, setFiltroIng] = useState<{ nome: string; ids: Set<number> } | null>(null)
  const [share, setShare] = useState(false)
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
      const row: Record<string, number | string> = { data: fmtCurta(s.data), indice: +(mediana(vals) * fator).toFixed(2) }
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
      else {
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
      <section className="hero-mk">
        <div className="max-w-6xl mx-auto px-6 pt-11 pb-14 relative z-[1] flex items-center gap-12 justify-between flex-wrap">
          <div className="flex-1 min-w-0">
            <h1>O <span className="underline decoration-white/40 underline-offset-4">custo de produção</span> do Prato Feito brasileiro</h1>
            <p className="hero-p">
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
          <div className="w-[300px] shrink-0 max-lg:hidden"><AdSlot slot="hero-lado" /></div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-6 py-6">
        <AdSlot slot="hero" className="mb-6" />

        <div className="grid lg:grid-cols-[264px_1fr] gap-[22px] items-start">
          {/* ===== FILTROS (painel do mockup) ===== */}
          <aside className="filters-mk">
            <div className="filters-head">
              <h3>Filtros</h3>
              <span className="clr" onClick={() => { setRegioes(new Set()); setBusca(''); setFiltroIng(null); setPendIni(''); setPendFim(''); setIni(''); setFim('') }}>Limpar</span>
            </div>
            <div className="f-group">
              <div className="f-label">Busca</div>
              <input className="f-search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Prato..." />
            </div>
            <div className="f-group">
              <div className="f-label">Nível de preço</div>
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
              <div className="f-label">Região</div>
              <div className="region-bar">
                {REGIOES.map(r => (
                  <button key={r} className={regioes.has(r) ? 'on' : ''} onClick={() => toggleRegiao(r)}>{r}</button>
                ))}
              </div>
            </div>
            <div className="f-group">
              <div className="f-label">Período</div>
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
              </div>
            </div>
            <div className="f-group">
              <AdSlot slot="lateral" />
            </div>
          </aside>

          {/* ===== CONTEÚDO ===== */}
          <div className="flex flex-col gap-[22px] min-w-0">
            {/* banner de metodologia (mockup) */}
            {banner && (
              <div className="method-banner">
                <div>i</div>
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

            {/* KPIs — um por nível de preço (estrutura do mockup) */}
            <div className="grid sm:grid-cols-3 gap-[14px]">
              {NIVEIS_PRECO.filter(n => n.disponivel).map(n => {
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
                    <div className="kval tnum">{brl(indice * f)}</div>
                    <div className={`ktrend ${cls}`}>
                      {arrow} {deltaIndice != null ? `${deltaIndice > 0 ? '+' : ''}${deltaIndice.toFixed(1)}% vs coleta anterior` : 'primeira coleta do recorte'}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* ===== ÍNDICE PF GERAL ===== */}
            <AdGate slot="gate-grafico">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h2>Índice PF Geral{regioes.size > 0 && (
                    <span className="premium-tag" style={{ background: 'var(--info-bg)', color: 'var(--azul)' }}>{rotuloRecorte}</span>
                  )}</h2>
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
                  <button className="btn-mk sm" onClick={() => setShare(true)}>Compartilhar</button>
                </div>
              </div>
              <div className="panel-body">
                {temSerie ? (
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={serieIndice} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="data" tick={{ fontSize: 12, fill: DIM }} />
                        <YAxis tick={{ fontSize: 12, fill: DIM }} width={52} domain={['auto', 'auto']}
                          tickFormatter={(v: number) => `R$${v}`} />
                        <Tooltip formatter={(v) => brl(Number(v))} />
                        <Line type="monotone" dataKey="indice" name={`Índice — ${rotuloRecorte}`}
                          stroke={NIVEL_HEX[modo]} strokeWidth={2.5} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
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
                  <button className="btn-mk sm" onClick={() => setShare(true)}>Compartilhar</button>
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
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="mover-col">
                      <h3>Maiores altas</h3>
                      {movers.altas.map((m, i) => (
                        <div key={m.prato.id} className="mover" onClick={() => { const c = custos.find(x => x.pratos.id === m.prato.id); if (c) setSelecionado(c) }}>
                          <div className="rank">{i + 1}</div>
                          <div className="mn">{limparNome(m.prato.nome)}</div>
                          <Sparkline valores={m.serie} cor={COR_ALTA} />
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
                          <Sparkline valores={m.serie} cor={COR_QUEDA} />
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
                  <button className="btn-mk sm" onClick={() => setShare(true)}>Compartilhar</button>
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

            {/* ===== PRODUTOS POR REGIÃO (PREMIUM) ===== */}
            {produtosRegiao.length > 0 && (
              <AdGate slot="gate-tabela">
                <TabelaProdutosRegiao linhas={produtosRegiao} destravada={isAdmin || isPremium} onIngrediente={abrirIngrediente} />
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
          onClose={() => setSelecionado(null)} />
      )}

      {share && <ShareModal onClose={() => setShare(false)} />}

      {ingModal && (
        <Modal title={`Pratos com ${ingModal.nome}`} onClose={() => setIngModal(null)}>
          {/* evolução do preço do produto (drill do mockup) */}
          {serieIng && serieIng.length >= 2 && (
            <div className="h-44 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={serieIng.map(p => ({ data: fmtCurta(p.data), valor: p.valor }))}
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
          )}
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
                className="btn-mk primary w-full justify-center">
                Mostrar só esses pratos na tabela
              </button>
            </>
          )}
        </Modal>
      )}
    </main>
  )
}
