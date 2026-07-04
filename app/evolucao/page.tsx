'use client'

import { useEffect, useMemo, useState, Fragment } from 'react'
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts'
import dynamic from 'next/dynamic'
import { getEvolucao, getAllDetalhes, getSnapshotsNovos, getContribuicoesMapa, getCalibracao, getAllFontes, GRUPOS_CAT, type Evolucao, type FonteKey, type PontoContrib, type Calibracao } from '@/lib/queries'
import { brl } from '@/lib/format'
import type { ItemDetalhe, Fonte } from '@/lib/types'
import TabelaIngredientes from './TabelaIngredientes'
import BotaoExportar from './BotaoExportar'
import InfoTip from '../InfoTip'
import AuthControls from '../Auth'
import RequireAdmin from '../RequireAdmin'

const MapaLocal = dynamic(() => import('../MapaLocal'), { ssr: false, loading: () => <div className="h-[440px] grid place-items-center text-muted text-sm">Carregando mapa…</div> })

// paleta categórica validada (dataviz validate_palette — todos os checks PASS em superfície branca)
const CORES_GRUPO: Record<string, string> = {
  'Proteína': '#c0492b', 'Base': '#c98500', 'Guarnição': '#9c5a1e', 'Verdura/Fruta': '#4e8b2f',
  'Temperos': '#008f7a', 'Gordura/Laticínio': '#7a4fb0', 'Outro': '#b0567f',
}

const COR = { paprika: '#c0492b', olive: '#6b7a3f', ink: '#1a1a1a', muted: '#9a9a9a', azul: '#3d6b8e' }
const FONTES: [FonteKey, string][] = [['blend', 'Blend'], ['online', 'Online'], ['manual', 'Manual']]
const fmt = (d: string) => { const [, m, dia] = d.split('-'); return `${dia}/${m}` }
const ts = (d: string) => new Date(d + 'T00:00:00Z').getTime()
const r2 = (n: number) => Math.round(n * 100) / 100
const numPrato = (nome: string) => parseInt(nome, 10) || 999   // prefixo "12. …"
const ORDEM_REG = ['Norte', 'Nordeste', 'Centro-oeste', 'Sudeste', 'Sul']
const mediana = (v: number[]) => { if (!v.length) return 0; const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const CORES_REG = ['#c98500', '#008f7a', '#9c5a1e', '#b0567f', '#4e8b2f']
const selCls = 'block bg-cream border border-line rounded-md px-2.5 py-2 text-sm text-ink focus:outline-none focus:border-paprika mt-1'

export default function EvolucaoPage() {
  return <RequireAdmin><EvolucaoInner /></RequireAdmin>
}

function EvolucaoInner() {
  const [aba, setAba] = useState<'indice' | 'variacao' | 'ingredientes' | 'mapa' | 'calibracao'>('indice')
  const [ev, setEv] = useState<Evolucao | null>(null)
  const [calib, setCalib] = useState<Calibracao | null>(null)
  const [calibIni, setCalibIni] = useState(''); const [calibFim, setCalibFim] = useState('')
  const [calibBusca, setCalibBusca] = useState('')
  const [calibOnline, setCalibOnline] = useState<Record<number, Fonte[]>>({})
  const [calibAberto, setCalibAberto] = useState<string | null>(null)
  const [fonte, setFonte] = useState<FonteKey>('blend')
  const [pratoId, setPratoId] = useState(0)          // 0 = índice nacional (todos os pratos)
  const [regiao, setRegiao] = useState('')           // '' = todas as regiões
  const [metricas, setMetricas] = useState({ mediana: true, media: false, min: false, max: false })
  const [banda, setBanda] = useState(true)
  const [percentual, setPercentual] = useState(false)
  const [ini, setIni] = useState('')   // período: início (YYYY-MM-DD, '' = desde o começo)
  const [fim, setFim] = useState('')   // período: fim ('' = até a última coleta)
  const [detalhes, setDetalhes] = useState<Record<number, ItemDetalhe[]>>({})
  const [off, setOff] = useState<Set<number>>(new Set())   // ingredientes desmarcados no "e se"
  const [ativos, setAtivos] = useState<Set<string>>(new Set(['nacional']))   // séries ativas na Variação
  const [pontos, setPontos] = useState<PontoContrib[]>([])
  const [fRegs, setFRegs] = useState<Set<string>>(new Set()); const [fTipo, setFTipo] = useState(''); const [fIng, setFIng] = useState(0)
  const [snapsNovos, setSnapsNovos] = useState<{ id: number; data: string }[]>([])
  const [dataDetalhes, setDataDetalhes] = useState('')   // coleta usada no "Simular"

  const noPeriodo = (d: string) => (!ini || d >= ini) && (!fim || d <= fim)
  const compData = useMemo(() => {
    if (!ev) return []
    let src: any[]
    if (pratoId !== 0) src = ev.porPratoComp[pratoId] || []
    else if (!regiao) src = ev.composicao
    else {
      // composição média dos pratos da região, por coleta
      const ids = ev.pratos.filter(pr => pr.regiao === regiao).map(pr => pr.id)
      const n = ids.length || 1
      src = ev.composicao.map((cp, i) => {
        const row: any = { data: cp.data }
        for (const g of GRUPOS_CAT) { let s = 0; for (const id of ids) s += ev.porPratoComp[id]?.[i]?.[g] || 0; row[g] = s / n }
        return row
      })
    }
    return src.filter(p => noPeriodo(p.data)).map(p => {
      const tot = GRUPOS_CAT.reduce((s, g) => s + (p[g] || 0), 0) || 1
      const row: any = { data: fmt(p.data) }
      for (const g of GRUPOS_CAT) row[g] = percentual ? (p[g] || 0) / tot * 100 : r2(p[g] || 0)   // % sem arredondar → soma exata 100
      return row
    })
  }, [ev, percentual, pratoId, regiao, ini, fim])

  useEffect(() => {
    getEvolucao().then(setEv)
    getSnapshotsNovos().then(setSnapsNovos)
    getContribuicoesMapa().then(setPontos)
  }, [])
  // calibração: (re)carrega ao abrir a aba e quando o período muda
  useEffect(() => {
    if (aba !== 'calibracao') return
    setCalib(null); setCalibAberto(null)
    getCalibracao(calibIni || undefined, calibFim || undefined).then(setCalib)
  }, [aba, calibIni, calibFim])
  // fontes online (resultados_brutos) da coleta de referência da calibração
  useEffect(() => {
    if (calib?.snapshotId) getAllFontes(calib.snapshotId).then(setCalibOnline)
    else setCalibOnline({})
  }, [calib?.snapshotId])
  function presetCalib(dias: number) {
    if (dias === 0 || !snapsNovos.length) { setCalibIni(''); setCalibFim(''); return }
    const f = snapsNovos[0].data; setCalibFim(f)
    const d = new Date(f + 'T00:00:00Z'); d.setDate(d.getDate() - dias); setCalibIni(d.toISOString().slice(0, 10))
  }
  // detalhe do "Simular" segue o período: usa a coleta mais recente dentro do intervalo
  useEffect(() => {
    if (!snapsNovos.length) return
    const ref = snapsNovos.filter(s => noPeriodo(s.data))[0] || snapsNovos[0]
    setDataDetalhes(ref.data)
    getAllDetalhes(ref.id, ref.data).then(setDetalhes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapsNovos, ini, fim])
  useEffect(() => { setOff(new Set()) }, [pratoId])   // troca de prato reseta o "e se"

  const nacional = pratoId === 0
  const dados = useMemo(() => {
    if (!ev) return []
    if (!nacional) return (ev.porPrato[pratoId] || []).map(p => ({ ts: ts(p.data), blend: r2(p.blend), online: r2(p.online), manual: r2(p.manual) }))
    if (!regiao) return ev.serie.map(p => {
      const f = p[fonte]
      return { ts: ts(p.data), mediana: r2(f.mediana), media: r2(f.media), min: r2(f.min), max: r2(f.max), faixa: [r2(f.min), r2(f.max)] as [number, number] }
    })
    // distribuição recomputada só com os pratos da região, a partir de porPrato
    const ids = ev.pratos.filter(p => p.regiao === regiao).map(p => p.id)
    return ev.serie.map((p, i) => {
      const vals = ids.map(id => ev.porPrato[id]?.[i]?.[fonte]).filter((v): v is number => v != null && v > 0).map(r2)
      const s = [...vals].sort((a, b) => a - b)
      const media = vals.length ? r2(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
      const min = s[0] ?? 0, max = s[s.length - 1] ?? 0
      return { ts: ts(p.data), mediana: r2(mediana(vals)), media, min, max, faixa: [min, max] as [number, number] }
    })
  }, [ev, fonte, pratoId, nacional, regiao])

  // Variação ACUMULADA em relação à 1ª coleta do período (base = 0%).
  // Δ% da coleta i = (custo_i − custo_base) / custo_base × 100. Linha subindo = mais caro.
  const variacao = useMemo(() => {
    if (!ev) return { rows: [] as any[], series: [] as { key: string; label: string; cor: string }[], base: '' }
    const idxs = ev.serie.map((_, i) => i).filter(i => noPeriodo(ev.serie[i].data))
    if (!idxs.length) return { rows: [] as any[], series: [] as { key: string; label: string; cor: string }[], base: '' }
    const base = idxs[0]
    const cumul = (getter: (i: number) => number) => { const b = getter(base); return idxs.map(i => b > 0 ? r2((getter(i) - b) / b * 100) : 0) }
    let defs: { key: string; label: string; cor: string; serie: number[] }[]
    if (pratoId !== 0) {
      defs = [{ key: 'prato', label: ev.pratos.find(p => p.id === pratoId)?.nome || 'prato', cor: '#c0492b', serie: cumul(i => ev.porPrato[pratoId]?.[i]?.[fonte] ?? 0) }]
    } else {
      const regs = [...new Set(ev.pratos.map(p => p.regiao))].sort((a, b) => ORDEM_REG.indexOf(a) - ORDEM_REG.indexOf(b))
      const regMed = (reg: string, i: number) => mediana(ev.pratos.filter(p => p.regiao === reg).map(p => ev.porPrato[p.id]?.[i]?.[fonte]).filter((v): v is number => v != null && v > 0))
      defs = [
        { key: 'nacional', label: 'Nacional', cor: '#c0492b', serie: cumul(i => ev.serie[i][fonte].mediana) },
        ...regs.map((r, idx) => ({ key: 'reg:' + r, label: r, cor: CORES_REG[idx % CORES_REG.length], serie: cumul(i => regMed(r, i)) })),
      ]
    }
    const rows = idxs.map((i, k) => { const row: any = { ts: ts(ev.serie[i].data), data: ev.serie[i].data }; for (const d of defs) row[d.key] = d.serie[k]; return row })
    return { rows, series: defs.map(({ key, label, cor }) => ({ key, label, cor })), base: ev.serie[base].data }
  }, [ev, pratoId, fonte, ini, fim])

  const poucos = !ev || ev.serie.length < 2
  const dadosP = dados.filter(d => noPeriodo(new Date(d.ts).toISOString().slice(0, 10)))
  const ticks = dadosP.map(d => d.ts)
  const mediaIndice = nacional && dadosP.length ? dadosP.reduce((s, d) => s + ((d as any).mediana || 0), 0) / dadosP.length : null
  const regioes = ev ? [...new Set(ev.pratos.map(p => p.regiao))].sort((a, b) => ORDEM_REG.indexOf(a) - ORDEM_REG.indexOf(b)) : []
  // opções e filtro do mapa
  const regContrib = [...new Set(pontos.map(p => p.regiao).filter(Boolean))] as string[]
  const tiposContrib = [...new Set(pontos.map(p => p.tipo_loja).filter(Boolean))] as string[]
  const ingsContrib = Array.from(new Map(pontos.filter(p => p.ingrediente_id).map(p => [p.ingrediente_id!, p.nome])).entries()).sort((a, b) => a[1].localeCompare(b[1]))
  const pontosFiltrados = pontos.filter(p => (!fRegs.size || (p.regiao != null && fRegs.has(p.regiao))) && (!fTipo || p.tipo_loja === fTipo) && (!fIng || p.ingrediente_id === fIng) && noPeriodo(p.data))
  function preset(dias: number) {
    if (!ev || !ev.serie.length) return
    const ultima = ev.serie[ev.serie.length - 1].data
    setFim(ultima)
    if (dias === 0) { setIni(''); setFim('') } else { const d = new Date(ultima + 'T00:00:00Z'); d.setDate(d.getDate() - dias); setIni(d.toISOString().slice(0, 10)) }
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-cream/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-end justify-between gap-4">
          <div>
            <a href="/" className="font-[family-name:var(--font-serif)] text-2xl leading-none hover:text-paprika transition-colors">Índice PF</a>
            <p className="text-xs text-muted mt-1">histórico do custo do prato feito</p>
          </div>
          <div className="flex items-center gap-4 flex-wrap justify-end">
            <a href="/" className="text-sm text-muted hover:text-ink">Início</a>
            <span className="text-sm text-paprika border-b-2 border-paprika pb-0.5">Histórico</span>
            <AuthControls />
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6">
        {/* abas */}
        <div className="flex gap-5 border-b border-line pt-2">
          {([['indice', 'Índice'], ['variacao', 'Variação'], ['ingredientes', 'Ingredientes'], ['mapa', 'Mapa'], ['calibracao', 'Calibração']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`text-sm pb-2 border-b-2 -mb-px transition ${aba === k ? 'border-paprika text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {aba === 'ingredientes' ? (
        <div className="max-w-5xl mx-auto px-6 py-8"><TabelaIngredientes /></div>
      ) : aba === 'calibracao' ? (
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-5">
        <p className="text-sm text-muted">
          Calibração dos preços de Mercado e Atacarejo com dados de campo. Para cada região e tipo de loja, compara o
          preço de campo aprovado com o preço online do mesmo ingrediente e mede o desconto real.
          <strong> Onde ainda não há dado de campo, usa os percentuais atuais (−10% Mercado, −22% Atacarejo).</strong>
          <InfoTip texto="Preço de campo = contribuições aprovadas com tipo de loja Mercado ou Atacarejo. Desconto medido = 1 − (mediana do preço de campo ÷ preço online). O índice calibrado recomputa o custo dos pratos da região aplicando, por ingrediente, o desconto medido onde existe e o percentual padrão onde não existe." />
        </p>

        {/* período: filtra as contribuições de campo e a coleta online de referência */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted">Período:</span>
          <div className="inline-flex border border-line rounded-md overflow-hidden bg-panel">
            {([['7d', 7], ['15d', 15], ['30d', 30], ['3m', 90], ['6m', 180], ['Tudo', 0]] as const).map(([label, d]) => (
              <button key={label} onClick={() => presetCalib(d)} className="px-3 py-1.5 text-muted hover:text-ink transition-colors">{label}</button>
            ))}
          </div>
          <input type="date" value={calibIni} onChange={e => setCalibIni(e.target.value)} className="bg-panel border border-line rounded px-2 py-1 focus:outline-none focus:border-paprika" />
          <span className="text-muted">até</span>
          <input type="date" value={calibFim} onChange={e => setCalibFim(e.target.value)} className="bg-panel border border-line rounded px-2 py-1 focus:outline-none focus:border-paprika" />
          {(calibIni || calibFim) && <button onClick={() => { setCalibIni(''); setCalibFim('') }} className="text-paprika hover:underline">limpar</button>}
        </div>

        {!calib ? <p className="text-sm text-muted">Carregando…</p> : (
          <>
            {calib.contribsUsadas === 0 && (
              <div className="border border-line rounded-lg bg-panel p-4 text-sm text-muted">
                Ainda não há contribuições de campo (Mercado/Atacarejo) aprovadas para calibrar. O índice calibrado é
                igual ao com os percentuais atuais — ele passa a divergir conforme chegam contribuições de campo.
              </div>
            )}
            <div className="border border-line rounded-lg bg-panel overflow-x-auto">
              <table className="w-full text-sm min-w-[46rem]">
                <thead>
                  <tr className="text-left text-[0.65rem] uppercase tracking-wide text-muted border-b border-line">
                    <th className="font-medium px-3 py-2">Região</th>
                    <th className="font-medium px-3 py-2 text-right">Índice online</th>
                    <th className="font-medium px-3 py-2 text-right">Mercado −10%</th>
                    <th className="font-medium px-3 py-2 text-right">Mercado calibrado</th>
                    <th className="font-medium px-3 py-2 text-right">Atacarejo −22%</th>
                    <th className="font-medium px-3 py-2 text-right">Atacarejo calibrado</th>
                  </tr>
                </thead>
                <tbody>
                  {calib.regioes.map(r => (
                    <tr key={r.regiao} className="border-t border-line/60">
                      <td className="px-3 py-2 whitespace-nowrap">{r.regiao} <span className="text-xs text-muted">· {r.nPratos} pratos</span></td>
                      <td className="px-3 py-2 text-right tnum">{r.indiceOnline > 0 ? brl(r.indiceOnline) : '—'}</td>
                      <td className="px-3 py-2 text-right tnum text-muted">{r.indiceOnline > 0 ? brl(r.mercado.indiceAssumido) : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <span className="tnum">{r.indiceOnline > 0 ? brl(r.mercado.indiceCalibrado) : '—'}</span>
                        <span className="block text-[0.65rem] text-muted">{r.mercado.medidoPct != null ? `medido ${r.mercado.medidoPct >= 0 ? '−' : '+'}${Math.abs(r.mercado.medidoPct * 100).toFixed(0)}% · ${r.mercado.cobertura} ingred.` : 'sem campo · −10%'}</span>
                      </td>
                      <td className="px-3 py-2 text-right tnum text-muted">{r.indiceOnline > 0 ? brl(r.atacarejo.indiceAssumido) : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <span className="tnum">{r.indiceOnline > 0 ? brl(r.atacarejo.indiceCalibrado) : '—'}</span>
                        <span className="block text-[0.65rem] text-muted">{r.atacarejo.medidoPct != null ? `medido ${r.atacarejo.medidoPct >= 0 ? '−' : '+'}${Math.abs(r.atacarejo.medidoPct * 100).toFixed(0)}% · ${r.atacarejo.cobertura} ingred.` : 'sem campo · −22%'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {calib.itens.length > 0 && (() => {
              const q = calibBusca.trim().toLowerCase()
              const filtrados = q ? calib.itens.filter(it => it.nome.toLowerCase().includes(q)) : calib.itens
              const fmtDia = (d: string) => d.split('-').reverse().join('/')
              return (
              <div>
                <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                  <h3 className="text-sm font-medium">Descontos medidos por ingrediente</h3>
                  <input value={calibBusca} onChange={e => setCalibBusca(e.target.value)} placeholder="Buscar ingrediente…"
                    className="bg-panel border border-line rounded-md px-3 py-1.5 text-sm w-full sm:w-56 focus:outline-none focus:border-paprika" />
                </div>
                <div className="border border-line rounded-lg bg-panel overflow-x-auto">
                  <table className="w-full text-sm min-w-[44rem]">
                    <thead>
                      <tr className="text-left text-[0.65rem] uppercase tracking-wide text-muted border-b border-line">
                        <th className="font-medium px-3 py-2">Região</th>
                        <th className="font-medium px-3 py-2">Tipo</th>
                        <th className="font-medium px-3 py-2">Ingrediente</th>
                        <th className="font-medium px-3 py-2 text-right">Campo</th>
                        <th className="font-medium px-3 py-2 text-right">Online</th>
                        <th className="font-medium px-3 py-2 text-right">Desconto</th>
                        <th className="font-medium px-3 py-2 text-right">Leituras</th>
                        <th className="font-medium px-3 py-2 text-right">Fontes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!filtrados.length && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted">Nenhum ingrediente para a busca.</td></tr>}
                      {filtrados.map(it => {
                        const key = `${it.regiao}|${it.tipo}|${it.ingrediente_id}`
                        const aberto = calibAberto === key
                        const online = calibOnline[it.ingrediente_id] || []
                        return (
                          <Fragment key={key}>
                            <tr className="border-t border-line/60">
                              <td className="px-3 py-2 whitespace-nowrap">{it.regiao}</td>
                              <td className="px-3 py-2">{it.tipo}</td>
                              <td className="px-3 py-2">{it.nome}</td>
                              <td className="px-3 py-2 text-right tnum">{brl(it.fieldKg)}/kg</td>
                              <td className="px-3 py-2 text-right tnum text-muted">{brl(it.onlineKg)}/kg</td>
                              <td className={`px-3 py-2 text-right tnum ${it.desconto >= 0 ? 'text-olive' : 'text-paprika'}`}>{it.desconto >= 0 ? '−' : '+'}{Math.abs(it.desconto * 100).toFixed(0)}%</td>
                              <td className="px-3 py-2 text-right tnum text-muted">{it.n}</td>
                              <td className="px-3 py-2 text-right">
                                <button onClick={() => setCalibAberto(aberto ? null : key)} className="text-xs text-paprika hover:underline whitespace-nowrap">{aberto ? 'ocultar' : `fontes (${it.n}·${online.length})`}</button>
                              </td>
                            </tr>
                            {aberto && (
                              <tr className="bg-cream/60">
                                <td colSpan={8} className="px-3 py-3">
                                  <div className="grid sm:grid-cols-2 gap-4">
                                    <div>
                                      <p className="text-[0.65rem] uppercase tracking-wide text-muted mb-1.5">Campo — {it.n} leitura{it.n === 1 ? '' : 's'} (quem · quando · onde)</p>
                                      <ul className="space-y-1">
                                        {it.fontes.map((f, j) => (
                                          <li key={j} className="text-xs flex justify-between gap-3">
                                            <span className="min-w-0 truncate">{f.nome} · {fmtDia(f.data)}{(f.cidade || f.uf) ? ` · ${[f.cidade, f.uf].filter(Boolean).join('/')}` : ''}</span>
                                            <span className="tnum text-paprika shrink-0">{brl(f.precoKg)}/kg</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                    <div>
                                      <p className="text-[0.65rem] uppercase tracking-wide text-muted mb-1.5">Online — {online.length} fonte{online.length === 1 ? '' : 's'}{calib.snapshotData ? ` (${fmtDia(calib.snapshotData)})` : ''}</p>
                                      {!online.length ? <p className="text-xs text-muted">Sem fontes online nesta coleta.</p> : (
                                        <ul className="space-y-1">
                                          {online.slice(0, 12).map((f, j) => (
                                            <li key={j} className="text-xs flex justify-between gap-3">
                                              <a href={f.link || undefined} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate hover:text-paprika">{f.titulo} <span className="text-muted">· {f.loja}</span></a>
                                              <span className="tnum text-paprika shrink-0">{brl(Number(f.preco_bruto))}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              )
            })()}

            <p className="text-xs text-muted">
              Base: preço online da coleta mais recente{calib.snapshotData ? ` (${calib.snapshotData.split('-').reverse().join('/')})` : ''}.
              Desconto positivo = campo mais barato que o online. No índice calibrado, o desconto por ingrediente é limitado
              a 0–60% para uma leitura isolada não distorcer o resultado.
            </p>
          </>
        )}
      </div>
      ) : aba === 'mapa' ? (
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-4">
        <p className="text-sm text-muted">
          Contribuições de campo aprovadas com localização. Filtre por período, região, tipo de mercado e ingrediente.
          <InfoTip texto="Cada ponto é uma foto aprovada de preço enviada por um usuário, na coordenada onde foi coletada. Os filtros combinam entre si." />
        </p>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted">Período:</span>
          <div className="inline-flex border border-line rounded-md overflow-hidden bg-panel">
            {([['30d', 30], ['3m', 90], ['6m', 180], ['Tudo', 0]] as const).map(([label, d]) => (
              <button key={label} onClick={() => preset(d)} className="px-3 py-1.5 text-muted hover:text-ink transition-colors">{label}</button>
            ))}
          </div>
          <input type="date" value={ini} onChange={e => setIni(e.target.value)} className="bg-cream border border-line rounded px-2 py-1 focus:outline-none focus:border-paprika" />
          <span className="text-muted">até</span>
          <input type="date" value={fim} onChange={e => setFim(e.target.value)} className="bg-cream border border-line rounded px-2 py-1 focus:outline-none focus:border-paprika" />
        </div>
        <div className="text-xs text-muted">Região
          <div className="flex items-center gap-4 flex-wrap mt-1">
            {regContrib.length ? regContrib.map(r => (
              <label key={r} className="flex items-center gap-1.5 cursor-pointer text-ink">
                <input type="checkbox" checked={fRegs.has(r)} onChange={() => setFRegs(s => { const n = new Set(s); n.has(r) ? n.delete(r) : n.add(r); return n })} />
                {r}
              </label>
            )) : <span className="text-muted">—</span>}
            {fRegs.size > 0 && <button onClick={() => setFRegs(new Set())} className="text-paprika hover:underline">limpar</button>}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <label className="text-xs text-muted">Tipo de mercado
            <select value={fTipo} onChange={e => setFTipo(e.target.value)} className={selCls}>
              <option value="">Todos</option>
              {tiposContrib.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted flex-1 min-w-[12rem]">Ingrediente
            <select value={fIng} onChange={e => setFIng(Number(e.target.value))} className={selCls}>
              <option value={0}>Todos</option>
              {ingsContrib.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
            </select>
          </label>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted">{pontosFiltrados.length} de {pontos.length} contribuição(ões)</p>
          {pontosFiltrados.length > 0 && <BotaoExportar nome="indice-pf-contribuicoes" abas={() => [{ nome: 'Contribuições', linhas: pontosFiltrados.map(p => ({ Data: p.criado_em, Ingrediente: p.nome, Preco: p.preco, Cidade: p.cidade, Regiao: p.regiao, UF: p.uf, TipoLoja: p.tipo_loja, Lat: p.lat, Lng: p.lng })) }]} />}
        </div>
        {pontosFiltrados.length ? (
          <MapaLocal points={pontosFiltrados.map(p => ({
            lat: p.lat, lng: p.lng,
            label: `${p.nome}${p.preco != null ? ` — R$ ${p.preco.toFixed(2)}` : ''}${p.cidade ? ` · ${p.cidade}` : ''}${p.data ? ` · ${fmt(p.data)}` : ''}`,
          }))} height="440px" />
        ) : <p className="text-sm text-muted py-6">Nenhuma contribuição para os filtros.</p>}

        {pontosFiltrados.length > 0 && (
          <div className="border border-line rounded-lg bg-panel overflow-x-auto">
            <table className="w-full text-xs min-w-[38rem]">
              <thead>
                <tr className="text-left text-[0.62rem] uppercase tracking-wide text-muted border-b border-line">
                  <th className="font-medium px-3 py-2">Data</th>
                  <th className="font-medium px-3 py-2">Hora</th>
                  <th className="font-medium px-3 py-2">Ingrediente</th>
                  <th className="font-medium px-3 py-2 text-right">Preço</th>
                  <th className="font-medium px-3 py-2">Local</th>
                  <th className="font-medium px-3 py-2">Região</th>
                </tr>
              </thead>
              <tbody>
                {pontosFiltrados.map((p, i) => {
                  const d = p.criado_em ? new Date(p.criado_em) : null
                  return (
                    <tr key={i} className="border-t border-line/60">
                      <td className="px-3 py-1.5 text-muted">{d ? d.toLocaleDateString('pt-BR') : '—'}</td>
                      <td className="px-3 py-1.5 text-muted tnum">{d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td className="px-3 py-1.5">{p.nome}</td>
                      <td className="px-3 py-1.5 text-right tnum text-paprika font-medium">{p.preco != null ? brl(p.preco) : '—'}</td>
                      <td className="px-3 py-1.5 text-muted">{[p.cidade, p.tipo_loja].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="px-3 py-1.5 text-muted">{p.regiao || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      ) : !ev ? (
        <p className="max-w-5xl mx-auto px-6 py-10 text-sm text-muted">Carregando…</p>
      ) : aba === 'variacao' ? (
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 flex-wrap">
          <div className="text-xs text-muted">Prato
            <SeletorPrato pratos={ev.pratos} value={pratoId} onChange={setPratoId} />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted">Período:</span>
          <div className="inline-flex border border-line rounded-md overflow-hidden bg-panel">
            {([['30d', 30], ['3m', 90], ['6m', 180], ['Tudo', 0]] as const).map(([label, d]) => (
              <button key={label} onClick={() => preset(d)} className="px-3 py-1.5 text-muted hover:text-ink transition-colors">{label}</button>
            ))}
          </div>
          <input type="date" value={ini} onChange={e => setIni(e.target.value)} className="bg-cream border border-line rounded px-2 py-1 focus:outline-none focus:border-paprika" />
          <span className="text-muted">até</span>
          <input type="date" value={fim} onChange={e => setFim(e.target.value)} className="bg-cream border border-line rounded px-2 py-1 focus:outline-none focus:border-paprika" />
        </div>
        <div className="text-xs text-muted">Fonte do dado
          <div className="flex w-fit border border-line rounded-md overflow-hidden bg-panel text-sm mt-1">
            {([['online', 'Online'], ['manual', 'Campo'], ['blend', 'Blend']] as [FonteKey, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setFonte(k)} className={`px-3 py-1.5 transition-colors ${fonte === k ? 'bg-paprika text-white' : 'text-muted hover:text-ink'}`}>{label}</button>
            ))}
          </div>
        </div>

        {nacional && (
          <div className="flex items-center gap-4 flex-wrap text-xs">
            <span className="text-muted">Linhas:</span>
            {variacao.series.map(s => (
              <label key={s.key} className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={ativos.has(s.key)} onChange={() => setAtivos(a => { const n = new Set(a); n.has(s.key) ? n.delete(s.key) : n.add(s.key); return n })} />
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: s.cor }} />
                {s.label}
              </label>
            ))}
          </div>
        )}

        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
          <p className="text-sm font-medium">Variação % acumulada do custo
            <InfoTip w="w-72" texto="Quanto o custo mudou em relação à 1ª coleta do período (a base = 0%). Linha subindo = mais caro; descendo = mais barato. Escolha o prato (ou Todos), a fonte e — em Todos — quais linhas mostrar. Explicação completa abaixo do gráfico." /></p>
          <p className="text-xs text-muted">
            {nacional ? 'Nacional e as regiões que você marcar.' : 'Só o prato selecionado.'} · Fonte: {fonte === 'online' ? 'online (raspado)' : fonte === 'manual' ? 'campo (leituras manuais)' : 'blend (média online × campo)'}
            {variacao.base && ` · base: coleta de ${fmt(variacao.base)} (0%)`}.
          </p>
          </div>
          <BotaoExportar nome="indice-pf-variacao" abas={() => [{ nome: 'Variação', linhas: variacao.rows.map((r: any) => { const o: any = { Data: r.data }; variacao.series.forEach(s => { o[s.label] = r[s.key] }); return o }) }]} />
        </div>

        <div className="border border-line rounded-lg bg-panel p-4">
          <div style={{ width: '100%', height: 360 }}>
            <ResponsiveContainer>
              <ComposedChart data={variacao.rows} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6e0d6" />
                <ReferenceLine y={0} stroke="#c3c2b7" />
                <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']}
                  ticks={variacao.rows.map(d => d.ts)} tickFormatter={(t: number) => fmt(new Date(t).toISOString().slice(0, 10))}
                  tick={{ fontSize: 13, fill: COR.muted }} />
                <YAxis tick={{ fontSize: 13, fill: COR.muted }} width={48} tickFormatter={v => `${v > 0 ? '+' : ''}${v}%`} />
                <Tooltip formatter={(v: any) => `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(1)}%`} labelFormatter={(t: any) => fmt(new Date(t).toISOString().slice(0, 10))} />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                {(nacional ? variacao.series.filter(s => ativos.has(s.key)) : variacao.series).map(s => (
                  <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.cor} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {poucos && <p className="text-xs text-muted mt-2">Série curta — a 1ª coleta é a base (0%); a variação aparece a partir da 2ª.</p>}
        </div>

        <div className="border border-line rounded-lg bg-panel p-4 text-xs text-muted leading-relaxed space-y-2">
          <p className="text-sm font-medium text-ink">Como ler este gráfico</p>
          <p>Cada ponto é a <strong>variação acumulada do custo em relação à 1ª coleta do período</strong> (a base). A base começa em <strong>0%</strong> e cada coleta seguinte mostra o quanto ficou mais caro (+) ou mais barato (−) desde ela. A fórmula:</p>
          <p className="text-ink"><code>Δ% = (custo desta coleta − custo da 1ª coleta) ÷ custo da 1ª coleta × 100</code></p>
          <p><strong>Exemplo:</strong> se o Nacional foi R$ 11,63 na 1ª coleta (base = 0%) e R$ 11,93 depois, esse ponto é (11,93 − 11,63) ÷ 11,63 = <strong>+2,6%</strong> — 2,6% mais caro que no começo.</p>
          <p><strong>Linha subindo</strong> = ficando mais caro · <strong>descendo</strong> = mais barato · acima de 0% = mais caro que a base; abaixo = mais barato.</p>
          <p>O <strong>custo</strong> de cada linha: <strong>Nacional</strong> = mediana dos 100 pratos; <strong>uma região</strong> = mediana dos pratos daquela região; <strong>um prato</strong> = o custo dele. A <strong>fonte</strong> define o preço de cada ingrediente: <strong>Online</strong> (raspado no varejo), <strong>Campo</strong> (leituras manuais/contribuições) ou <strong>Blend</strong> (média dos dois — o índice oficial).</p>
        </div>
      </div>
      ) : (
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* controles */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 flex-wrap">
          <div className="text-xs text-muted">Prato
            <SeletorPrato pratos={ev.pratos} value={pratoId} onChange={setPratoId} />
          </div>
          <div className="text-xs text-muted">Fonte do preço
            <div className="flex w-fit border border-line rounded-md overflow-hidden bg-panel text-sm mt-1">
              {FONTES.map(([k, label]) => (
                <button key={k} onClick={() => setFonte(k)}
                  className={`px-3 py-1.5 transition-colors ${fonte === k ? 'bg-paprika text-white' : 'text-muted hover:text-ink'}`}
                  disabled={!nacional}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted">Período:</span>
          <div className="inline-flex border border-line rounded-md overflow-hidden bg-panel">
            {([['30d', 30], ['3m', 90], ['6m', 180], ['Tudo', 0]] as const).map(([label, d]) => (
              <button key={label} onClick={() => preset(d)} className="px-3 py-1.5 text-muted hover:text-ink transition-colors">{label}</button>
            ))}
          </div>
          <input type="date" value={ini} onChange={e => setIni(e.target.value)} className="bg-cream border border-line rounded px-2 py-1 focus:outline-none focus:border-paprika" />
          <span className="text-muted">até</span>
          <input type="date" value={fim} onChange={e => setFim(e.target.value)} className="bg-cream border border-line rounded px-2 py-1 focus:outline-none focus:border-paprika" />
          {mediaIndice != null && <span className="ml-1 text-muted">Média do índice: <strong className="text-paprika tnum">{brl(mediaIndice)}</strong> · {dadosP.length} coleta{dadosP.length === 1 ? '' : 's'}</span>}
        </div>

        {nacional && (
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-muted">Região:</span>
            <div className="inline-flex border border-line rounded-md overflow-hidden bg-panel">
              <button onClick={() => setRegiao('')}
                className={`px-3 py-1.5 transition-colors ${regiao === '' ? 'bg-paprika text-white' : 'text-muted hover:text-ink'}`}>Todas</button>
              {regioes.map(r => (
                <button key={r} onClick={() => setRegiao(r)}
                  className={`px-3 py-1.5 transition-colors border-l border-line ${regiao === r ? 'bg-paprika text-white' : 'text-muted hover:text-ink'}`}>{r}</button>
              ))}
            </div>
          </div>
        )}

        {nacional && (
          <div className="flex items-center gap-4 flex-wrap text-xs">
            <span className="text-muted">Métrica:</span>
            {([['mediana', 'Mediana'], ['media', 'Média'], ['min', 'Mínimo'], ['max', 'Máximo']] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={metricas[k]} onChange={e => setMetricas(m => ({ ...m, [k]: e.target.checked }))} />
                {label}
              </label>
            ))}
            <label className="flex items-center gap-1.5 cursor-pointer ml-2">
              <input type="checkbox" checked={banda} onChange={e => setBanda(e.target.checked)} />
              Faixa mín–máx
            </label>
          </div>
        )}

        {/* gráfico */}
        <div className="border border-line rounded-lg bg-panel p-4">
          <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium mb-1">
            {nacional ? 'Custo do prato feito (R$) — distribuição dos 100 pratos' : 'Custo do prato (R$) — por fonte'}
            <InfoTip texto={nacional
              ? 'Cada coleta reúne o custo dos 100 pratos. A mediana é o índice nacional; a faixa mostra o prato mais barato e o mais caro. Escolha a fonte (blend/online/manual), a região e o período.'
              : 'Custo deste prato ao longo do tempo, em cada fonte: blend (o índice real), online (só cotação online) e manual (só leituras manuais).'} />
          </p>
          <BotaoExportar nome="indice-pf-serie" abas={() => [{ nome: 'Série', linhas: dadosP.map((d: any) => ({ Data: new Date(d.ts).toISOString().slice(0, 10), ...(nacional ? { Mediana: d.mediana, Média: d.media, Minimo: d.min, Maximo: d.max } : { Blend: d.blend, Online: d.online, Manual: d.manual }) })) }]} />
          </div>
          <p className="text-xs text-muted mb-4">
            {nacional ? `Fonte: ${FONTES.find(f => f[0] === fonte)![1]}` : 'blend × online × manual'}
            {poucos && ' · série curta (poucas coletas) — cresce a cada coleta.'}
          </p>
          <div style={{ width: '100%', height: 360 }}>
            <ResponsiveContainer>
              <ComposedChart data={dadosP} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6e0d6" />
                <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']}
                  ticks={ticks} tickFormatter={(t: number) => fmt(new Date(t).toISOString().slice(0, 10))}
                  tick={{ fontSize: 13, fill: COR.muted }} />
                <YAxis tick={{ fontSize: 13, fill: COR.muted }} width={48} tickFormatter={v => `R$${v}`} />
                <Tooltip formatter={(v: any) => Array.isArray(v)
                  ? `R$ ${Number(v[0]).toFixed(2)} – R$ ${Number(v[1]).toFixed(2)}`
                  : `R$ ${Number(v).toFixed(2)}`}
                  labelFormatter={(t: any) => fmt(new Date(t).toISOString().slice(0, 10))} />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                {nacional ? (
                  <>
                    {banda && <Area type="monotone" dataKey="faixa" name="faixa mín–máx" fill={COR.paprika} fillOpacity={0.1} stroke="none" />}
                    {metricas.mediana && <Line type="monotone" dataKey="mediana" name="Mediana" stroke={COR.paprika} strokeWidth={2} dot={{ r: 3 }} />}
                    {metricas.media && <Line type="monotone" dataKey="media" name="Média" stroke={COR.olive} strokeWidth={2} dot={{ r: 3 }} />}
                    {metricas.min && <Line type="monotone" dataKey="min" name="Mínimo" stroke={COR.muted} strokeWidth={1.5} dot={{ r: 2 }} />}
                    {metricas.max && <Line type="monotone" dataKey="max" name="Máximo" stroke={COR.ink} strokeWidth={1.5} dot={{ r: 2 }} />}
                  </>
                ) : (
                  <>
                    <Line type="monotone" dataKey="blend" name="Blend" stroke={COR.paprika} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="online" name="Online" stroke={COR.azul} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="manual" name="Manual" stroke={COR.olive} strokeWidth={2} dot={{ r: 3 }} />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* composição por grupo (total quando nacional; do prato quando selecionado) */}
        <div className="border border-line rounded-lg bg-panel p-4">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <p className="text-sm font-medium">{nacional ? 'Composição do custo por grupo de alimento' : 'Composição do prato por grupo'}
                <InfoTip texto="Quanto cada grupo de alimento pesa no custo (blend). Média por prato quando é o índice; do prato quando um está selecionado. As 17 categorias viram 7 grupos. Alterne R$ e % do total." /></p>
              <p className="text-xs text-muted">{nacional ? (regiao ? `Média por prato · ${regiao} · blend` : 'Média por prato · blend') : 'blend'}{poucos && ' · série curta, cresce a cada coleta.'}</p>
            </div>
            <div className="inline-flex border border-line rounded-md overflow-hidden bg-panel text-sm">
              {([['abs', 'R$'], ['pct', '% do total']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setPercentual(k === 'pct')}
                  className={`px-3 py-1.5 transition-colors ${(percentual ? 'pct' : 'abs') === k ? 'bg-paprika text-white' : 'text-muted hover:text-ink'}`}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{ width: '100%', height: 340 }}>
            <ResponsiveContainer>
              <BarChart data={compData} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6e0d6" vertical={false} />
                <XAxis dataKey="data" tick={{ fontSize: 13, fill: COR.muted }} />
                <YAxis tick={{ fontSize: 13, fill: COR.muted }} width={52} allowDataOverflow
                  domain={percentual ? [0, 100] : ['auto', 'auto']} ticks={percentual ? [0, 25, 50, 75, 100] : undefined}
                  tickFormatter={v => percentual ? `${Math.round(v)}%` : `R$${v}`} />
                <Tooltip formatter={(v: any, n: any) => [percentual ? `${Number(v).toFixed(1)}%` : `R$ ${Number(v).toFixed(2)}`, n]} />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                {GRUPOS_CAT.map(g => <Bar key={g} dataKey={g} stackId="a" fill={CORES_GRUPO[g]} stroke="#fff" strokeWidth={1} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {!nacional && (detalhes[pratoId]?.length ? (() => {
          const its = detalhes[pratoId]
          const cheio = its.reduce((s, it) => s + it.custo, 0)
          const atual = its.reduce((s, it) => s + (off.has(it.ingrediente_id) ? 0 : it.custo), 0)
          return (
            <div className="border border-line rounded-lg bg-panel p-4">
              <p className="text-sm font-medium mb-1">Simular sem ingredientes
                <InfoTip texto="Desmarque ingredientes para ver o custo do prato sem eles (última coleta, blend). O R$ de cada item é o custo da quantidade da receita (em gramas)." /></p>
              <p className="text-xs text-muted mb-3">
                Custo do prato = soma dos ingredientes marcados ({dataDetalhes ? `coleta de ${fmt(dataDetalhes)}` : 'última coleta'} · blend). O R$ ao lado de cada
                item é o custo da <strong>quantidade da receita</strong> (em gramas). Desmarque para ver o prato sem ele.
              </p>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="font-[family-name:var(--font-serif)] text-2xl text-paprika tnum">{brl(atual)}</span>
                {off.size > 0 && <span className="text-xs text-muted">de {brl(cheio)} · −{brl(cheio - atual)}</span>}
              </div>
              <div className="space-y-3">
                {(() => {
                  const grupos: Record<string, ItemDetalhe[]> = {}
                  its.forEach(it => (grupos[it.categoria || 'Outro'] ||= []).push(it))
                  const soma = (arr: ItemDetalhe[]) => arr.reduce((s, x) => s + (off.has(x.ingrediente_id) ? 0 : x.custo), 0)
                  const cats = Object.keys(grupos).sort((a, b) => grupos[b].reduce((s, x) => s + x.custo, 0) - grupos[a].reduce((s, x) => s + x.custo, 0))
                  return cats.map(cat => (
                    <div key={cat}>
                      <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-wide text-muted border-b border-line/60 pb-1">
                        <span>{cat}</span><span className="tnum">{brl(soma(grupos[cat]))}</span>
                      </div>
                      {grupos[cat].map(it => (
                        <label key={it.ingrediente_id} className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-line/40 cursor-pointer">
                          <span className="flex items-center gap-2 min-w-0">
                            <input type="checkbox" checked={!off.has(it.ingrediente_id)}
                              onChange={() => setOff(s => { const n = new Set(s); n.has(it.ingrediente_id) ? n.delete(it.ingrediente_id) : n.add(it.ingrediente_id); return n })} />
                            <span className={off.has(it.ingrediente_id) ? 'line-through text-muted' : ''}>{it.nome}</span>
                            <span className="text-xs text-muted shrink-0">{it.qtd_g} g</span>
                          </span>
                          <span className="tnum text-muted">{brl(it.custo)}</span>
                        </label>
                      ))}
                    </div>
                  ))
                })()}
              </div>
            </div>
          )
        })() : null)}
      </div>
      )}
    </main>
  )
}

// seletor de prato com busca, agrupado por região
function SeletorPrato({ pratos, value, onChange }: {
  pratos: { id: number; nome: string; regiao: string }[]; value: number; onChange: (id: number) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const sel = value === 0 ? 'Todos os pratos'
    : (() => { const p = pratos.find(x => x.id === value); return p ? `${p.nome} · ${p.regiao}` : '—' })()

  const b = busca.trim().toLowerCase()
  const filtrados = pratos
    .filter(p => !b || p.nome.toLowerCase().includes(b) || p.regiao.toLowerCase().includes(b))
    .sort((a, c) => a.regiao.localeCompare(c.regiao) || numPrato(a.nome) - numPrato(c.nome))
  const porRegiao: Record<string, typeof pratos> = {}
  filtrados.forEach(p => { (porRegiao[p.regiao] ||= []).push(p) })

  function escolher(id: number) { onChange(id); setAberto(false); setBusca('') }

  return (
    <div className="relative mt-1">
      <button onClick={() => setAberto(a => !a)}
        className="flex items-center justify-between gap-2 bg-cream border border-line rounded-md px-2.5 py-2 text-sm text-ink w-full sm:w-[22rem] hover:border-paprika transition">
        <span className="truncate">{sel}</span>
        <span className="text-muted shrink-0">▾</span>
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAberto(false)} />
          <div className="absolute z-40 mt-1 w-full sm:w-[22rem] bg-cream border border-line rounded-md shadow-lg max-h-[22rem] overflow-auto">
            <div className="sticky top-0 bg-cream p-2 border-b border-line">
              <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar prato ou região…"
                className="w-full bg-panel border border-line rounded px-2 py-1.5 text-sm focus:outline-none focus:border-paprika" />
            </div>
            <button onClick={() => escolher(0)}
              className={`block w-full text-left px-3 py-2 text-sm hover:bg-panel ${value === 0 ? 'text-paprika font-medium' : 'text-ink'}`}>
              Todos os pratos
            </button>
            {Object.keys(porRegiao).map(reg => (
              <div key={reg}>
                <div className="px-3 py-1 text-[0.65rem] uppercase tracking-wide text-muted bg-panel/60 sticky top-[3.25rem]">{reg}</div>
                {porRegiao[reg].map(p => (
                  <button key={p.id} onClick={() => escolher(p.id)}
                    className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-panel ${value === p.id ? 'text-paprika font-medium' : 'text-ink'}`}>
                    {p.nome}
                  </button>
                ))}
              </div>
            ))}
            {!filtrados.length && <p className="px-3 py-3 text-sm text-muted">Nenhum prato para “{busca}”.</p>}
          </div>
        </>
      )}
    </div>
  )
}
