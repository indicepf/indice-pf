'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { getAllDetalhes, GRUPOS_CAT, type Evolucao, type FonteKey } from '@/lib/queries'
import { brl } from '@/lib/format'
import { mediana } from '@/lib/stats'
import { ACCENT, BRAND, CHART_SERIES, CORES_GRUPO, DIM, INK } from '@/lib/theme'
import type { ItemDetalhe } from '@/lib/types'
import { Modal } from '@/components/ui'
import { PREDITORES_DIARIOS, PREDITORES_MENSAIS, PREDITOR_POR_KEY, fmtValorPreditor } from '@/lib/preditores'
import { regressaoLinear, type ResultadoRegressao } from '@/lib/regressao'
import SeletorPrato from './SeletorPrato'
import SeletorSeries from './SeletorSeries'
import BotaoExportar from './BotaoExportar'
import InfoTip from '../../InfoTip'

const COR = { paprika: ACCENT, olive: BRAND.verde, ink: INK, muted: DIM, azul: BRAND.ciano }
const FONTES: [FonteKey, string][] = [['blend', 'Blend'], ['online', 'Online'], ['manual', 'Manual']]
const fmt = (d: string) => { const [, m, dia] = d.split('-'); return `${dia}/${m}` }
const fmtDia = (d: string) => d.split('-').reverse().join('/')   // DD/MM/AAAA
const ts = (d: string) => new Date(d + 'T00:00:00Z').getTime()
const r2 = (n: number) => Math.round(n * 100) / 100
const ORDEM_REG = ['Norte', 'Nordeste', 'Centro-oeste', 'Sudeste', 'Sul']

// liga/desliga uma chave num Set de estado
const alternar = (set: React.Dispatch<React.SetStateAction<Set<string>>>) => (k: string) =>
  set(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })

// carry-forward: último valor da série (asc) com data <= d
const cf = (serie: { data: string; valor: number }[], d: string): number | null => {
  let v: number | null = null
  for (const p of serie) { if (p.data <= d) v = p.valor; else break }
  return v
}

// Aba "Índice" do histórico, extraída de /evolucao para ser reusada na área do
// usuário. Autossuficiente: recebe os dados já carregados e mantém o próprio
// estado de UI (fonte, prato, região, métricas, período, "e se").
export default function IndicePainel({ ev, snapsNovos, admin = false }: {
  ev: Evolucao
  snapsNovos: { id: number; data: string }[]
  admin?: boolean
}) {
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
  const [dataDetalhes, setDataDetalhes] = useState('')   // coleta usada no "Simular"
  // overlay (eixo direito) e regressão — só admin. Gráfico principal usa séries
  // DIÁRIAS (casam com a coleta semanal); o painel mensal usa as MENSAIS.
  const [overlayVars, setOverlayVars] = useState<Set<string>>(new Set())
  const [overlaySeries, setOverlaySeries] = useState<Record<string, { data: string; valor: number }[]>>({})
  const [regVars, setRegVars] = useState<Set<string>>(new Set())
  const [overlayVarsM, setOverlayVarsM] = useState<Set<string>>(new Set())
  const [overlaySeriesM, setOverlaySeriesM] = useState<Record<string, { data: string; valor: number }[]>>({})
  const [regVarsM, setRegVarsM] = useState<Set<string>>(new Set())
  const [normalizar, setNormalizar] = useState(true)   // z-score quando >1 preditor
  const [modelo, setModelo] = useState<ResultadoRegressao | { erro: string } | null>(null)
  const [modalAberto, setModalAberto] = useState(false)
  const [calculando, setCalculando] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const noPeriodo = (d: string) => (!ini || d >= ini) && (!fim || d <= fim)
  const compData = useMemo(() => {
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

  const poucos = ev.serie.length < 2
  const dadosP = dados.filter(d => noPeriodo(new Date(d.ts).toISOString().slice(0, 10)))
  const ticks = dadosP.map(d => d.ts)
  const mediaIndice = nacional && dadosP.length ? dadosP.reduce((s, d) => s + ((d as any).mediana || 0), 0) / dadosP.length : null
  const regioes = [...new Set(ev.pratos.map(p => p.regiao))].sort((a, b) => ORDEM_REG.indexOf(a) - ORDEM_REG.indexOf(b))
  function preset(dias: number) {
    if (!ev.serie.length) return
    const ultima = ev.serie[ev.serie.length - 1].data
    setFim(ultima)
    if (dias === 0) { setIni(''); setFim('') } else { const d = new Date(ultima + 'T00:00:00Z'); d.setDate(d.getDate() - dias); setIni(d.toISOString().slice(0, 10)) }
  }

  // ── admin: overlay + regressão ──
  const datasColeta = dadosP.map(d => new Date(d.ts).toISOString().slice(0, 10))
  // janela da consulta = coletas ±buffer. Sem isto o Supabase corta em 1000
  // linhas (traz as mais antigas, 2010-2013, e a carry-forward pega valor velho).
  const rangeQS = datasColeta.length
    ? (() => {
        const de = new Date(datasColeta[0] + 'T00:00:00Z'); de.setDate(de.getDate() - 60)
        return `&de=${de.toISOString().slice(0, 10)}&ate=${datasColeta[datasColeta.length - 1]}`
      })()
    : ''
  // overlay múltiplo: alinha cada série às datas das coletas e, quando há mais
  // de uma (ou escalas muito diferentes), normaliza por z-score para caberem
  // no mesmo eixo direito. Os valores originais seguem no tooltip.
  const overlayKeys = admin ? [...overlayVars].filter(k => (overlaySeries[k] || []).length) : []
  // z-score é escolha do usuário, não depende de quantas séries há. Quando
  // ligado, o ÍNDICE também é normalizado: comparar formatos só faz sentido se
  // as duas curvas passarem pela mesma transformação (eixo único em σ).
  const zAtivo = admin && normalizar && overlayKeys.length > 0
  const dadosChart = useMemo(() => {
    if (!overlayKeys.length) return dadosP
    const z = (vs: (number | null)[]) => {
      const ok = vs.filter((v): v is number => v != null)
      const m = ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : 0
      const s = ok.length > 1 ? Math.sqrt(ok.reduce((a, b) => a + (b - m) ** 2, 0) / (ok.length - 1)) : 0
      return (v: number | null) => v == null ? null : s > 0 ? (v - m) / s : 0
    }
    const brutos: Record<string, (number | null)[]> = {}
    for (const k of overlayKeys) brutos[k] = datasColeta.map(d => cf(overlaySeries[k], d))
    const zDe: Record<string, (v: number | null) => number | null> = {}
    for (const k of overlayKeys) zDe[k] = z(brutos[k])
    // normalizadores das séries do índice, na mesma janela
    const chaveIndice = nacional ? ['mediana', 'media', 'min', 'max'] : ['blend', 'online', 'manual']
    const zIndice: Record<string, (v: number | null) => number | null> = {}
    if (zAtivo) for (const c of chaveIndice) zIndice[c] = z(dadosP.map((d: any) => d[c] ?? null))

    return dadosP.map((d: any, i) => {
      const row: any = { ...d }
      if (zAtivo) {
        for (const c of chaveIndice) if (d[c] != null) { row[`z_${c}`] = zIndice[c](d[c]); row[`raw_${c}`] = d[c] }
        row.faixa = undefined                       // banda em R$ não cabe no eixo σ
      }
      for (const k of overlayKeys) {
        const v = brutos[k][i]
        row[`p_${k}`] = v == null ? null : zAtivo ? zDe[k](v) : v
        row[`raw_${k}`] = v
      }
      return row
    })
  }, [dadosP, datasColeta, overlaySeries, overlayKeys.join(','), zAtivo, nacional])
  const pontosDiarios = dadosP.map((d: any, i) => ({ data: datasColeta[i], y: nacional ? d.mediana : d.blend }))

  // índice agregado por mês (média da mediana/blend das coletas do mês)
  const pontosMensais = useMemo(() => {
    const byMes = new Map<string, number[]>()
    dadosP.forEach((d: any) => {
      const ym = new Date(d.ts).toISOString().slice(0, 7)
      const y = nacional ? d.mediana : d.blend
      if (y != null) { const arr = byMes.get(ym) ?? []; arr.push(y); byMes.set(ym, arr) }
    })
    return [...byMes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([ym, ys]) => ({
      ym, data: `${ym}-01`, ts: new Date(`${ym}-01T00:00:00Z`).getTime(),
      indice: r2(ys.reduce((s, v) => s + v, 0) / ys.length),
    }))
  }, [dadosP, nacional])
  const overlayKeysM = admin ? [...overlayVarsM].filter(k => (overlaySeriesM[k] || []).length) : []
  const zAtivoM = admin && normalizar && overlayKeysM.length > 0
  const dadosMes = useMemo(() => {
    if (!overlayKeysM.length) return pontosMensais
    const z = (vs: (number | null)[]) => {
      const ok = vs.filter((v): v is number => v != null)
      const m = ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : 0
      const s = ok.length > 1 ? Math.sqrt(ok.reduce((a, b) => a + (b - m) ** 2, 0) / (ok.length - 1)) : 0
      return (v: number | null) => v == null ? null : s > 0 ? (v - m) / s : 0
    }
    const brutos: Record<string, (number | null)[]> = {}
    for (const k of overlayKeysM) brutos[k] = pontosMensais.map(p => cf(overlaySeriesM[k], p.data))
    const zDe: Record<string, (v: number | null) => number | null> = {}
    for (const k of overlayKeysM) zDe[k] = z(brutos[k])
    const zInd = zAtivoM ? z(pontosMensais.map(p => p.indice)) : null

    return pontosMensais.map((p, i) => {
      const row: any = { ...p }
      if (zInd) { row.z_indice = zInd(p.indice); row.raw_indice = p.indice }
      for (const k of overlayKeysM) {
        const v = brutos[k][i]
        row[`p_${k}`] = v == null ? null : zAtivoM ? zDe[k](v) : v
        row[`raw_${k}`] = v
      }
      return row
    })
  }, [pontosMensais, overlaySeriesM, overlayKeysM.join(','), zAtivoM])

  // séries dos preditores sobrepostos (eixo direito), limitadas à janela das coletas
  const varsQS = [...overlayVars].sort().join(',')
  const varsQSM = [...overlayVarsM].sort().join(',')
  useEffect(() => {
    if (!admin || !varsQS) { setOverlaySeries({}); return }
    let vivo = true
    fetch(`/api/preditores?vars=${varsQS}${rangeQS}`).then(r => r.json())
      .then(j => { if (vivo) setOverlaySeries(j || {}) })
      .catch(() => { if (vivo) setOverlaySeries({}) })
    return () => { vivo = false }
  }, [admin, varsQS, rangeQS])
  useEffect(() => {
    if (!admin || !varsQSM) { setOverlaySeriesM({}); return }
    let vivo = true
    fetch(`/api/preditores?vars=${varsQSM}${rangeQS}`).then(r => r.json())
      .then(j => { if (vivo) setOverlaySeriesM(j || {}) })
      .catch(() => { if (vivo) setOverlaySeriesM({}) })
    return () => { vivo = false }
  }, [admin, varsQSM, rangeQS])

  async function gerarModelo(keys: string[], pontos: { data: string; y: number }[]) {
    if (!keys.length) return
    setCalculando(true)
    try {
      const j = await fetch(`/api/preditores?vars=${keys.join(',')}${rangeQS}`).then(r => r.json())
      const y: number[] = []
      const cols: number[][] = keys.map(() => [])
      pontos.forEach(pt => {
        const xs = keys.map(k => cf(j[k] || [], pt.data))
        if (pt.y != null && xs.every(v => v != null)) {
          y.push(pt.y); keys.forEach((k, ki) => cols[ki].push(xs[ki] as number))
        }
      })
      setModelo(regressaoLinear(y, keys.map((k, ki) => ({ nome: PREDITOR_POR_KEY[k].label, valores: cols[ki] }))))
    } catch (err) {
      setModelo({ erro: `Falha ao buscar preditores: ${String(err)}` })
    } finally {
      setModalAberto(true); setCalculando(false); setCopiado(false)
    }
  }

  // resumo do modelo em texto (colar em planilha/mensagem)
  function textoModelo(m: ResultadoRegressao): string {
    const p = (v: number) => isNaN(v) ? '—' : v < 0.001 ? '<0,001' : v.toFixed(3)
    return [
      `Modelo de regressão — Índice PF (${nacional ? 'mediana nacional' : 'blend do prato'})`,
      `R² ${m.r2.toFixed(3)} · R² ajust. ${m.r2Ajustado.toFixed(3)} · F ${m.f.toFixed(2)} (p ${p(m.fP)}) · n ${m.n} · gl ${m.gl}`,
      '',
      'Variável\tCoef.\tErro-padrão\tt\tp-valor',
      ...m.coeficientes.map(c => `${c.nome}\t${c.coef.toFixed(4)}\t${c.erroPadrao.toFixed(4)}\t${isNaN(c.t) ? '—' : c.t.toFixed(2)}\t${p(c.p)}`),
    ].join('\n')
  }

  return (
   <>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* controles */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 flex-wrap">
          <div className="text-xs text-dim">Prato
            <SeletorPrato pratos={ev.pratos} value={pratoId} onChange={setPratoId} />
          </div>
          <div className="text-xs text-dim">Fonte do preço
            <div className="flex w-fit border border-border rounded-md overflow-hidden bg-surface text-sm mt-1">
              {FONTES.map(([k, label]) => (
                <button key={k} onClick={() => setFonte(k)}
                  className={`px-3 py-1.5 transition-colors ${fonte === k ? 'bg-accent text-white' : 'text-dim hover:text-ink'}`}
                  disabled={!nacional}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-dim">Período:</span>
          <div className="inline-flex border border-border rounded-md overflow-hidden bg-surface">
            {([['30d', 30], ['3m', 90], ['6m', 180], ['Tudo', 0]] as const).map(([label, d]) => (
              <button key={label} onClick={() => preset(d)} className="px-3 py-1.5 text-dim hover:text-ink transition-colors">{label}</button>
            ))}
          </div>
          <input type="date" value={ini} onChange={e => setIni(e.target.value)} className="bg-surface-2 border border-border rounded px-2 py-1 focus:outline-none focus:border-accent" />
          <span className="text-dim">até</span>
          <input type="date" value={fim} onChange={e => setFim(e.target.value)} className="bg-surface-2 border border-border rounded px-2 py-1 focus:outline-none focus:border-accent" />
          {mediaIndice != null && <span className="ml-1 text-dim">Média do índice: <strong className="text-accent tnum">{brl(mediaIndice)}</strong> · {dadosP.length} coleta{dadosP.length === 1 ? '' : 's'}</span>}
        </div>

        {nacional && (
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-dim">Região:</span>
            <div className="inline-flex border border-border rounded-md overflow-hidden bg-surface">
              <button onClick={() => setRegiao('')}
                className={`px-3 py-1.5 transition-colors ${regiao === '' ? 'bg-accent text-white' : 'text-dim hover:text-ink'}`}>Todas</button>
              {regioes.map(r => (
                <button key={r} onClick={() => setRegiao(r)}
                  className={`px-3 py-1.5 transition-colors border-l border-border ${regiao === r ? 'bg-accent text-white' : 'text-dim hover:text-ink'}`}>{r}</button>
              ))}
            </div>
          </div>
        )}

        {nacional && (
          <div className="flex items-center gap-4 flex-wrap text-xs">
            <span className="text-dim">Métrica:</span>
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

        {admin && (
          <div className="border border-brand-roxo/30 bg-brand-roxo/5 rounded-lg p-4 space-y-3">
            <p className="text-xs font-semibold text-brand-roxo uppercase tracking-wide">Análise (admin) · séries diárias</p>
            <SeletorSeries titulo="Sobrepor no gráfico" opcoes={PREDITORES_DIARIOS}
              selecionadas={overlayVars} onToggle={alternar(setOverlayVars)}
              cor={k => CHART_SERIES[([...overlayVars].indexOf(k) + 1) % CHART_SERIES.length]} />
            <label className="flex items-center gap-1.5 cursor-pointer text-xs text-dim w-fit">
              <input type="checkbox" checked={normalizar} onChange={e => setNormalizar(e.target.checked)} />
              Normalizar em z-score (índice e preditores no mesmo eixo, em desvios-padrão)
            </label>
            <div className="border-t border-border/60 pt-3">
              <SeletorSeries titulo={`Regressão: índice ${nacional ? '(mediana nacional)' : '(blend do prato)'} ~ preditores`}
                opcoes={PREDITORES_DIARIOS} selecionadas={regVars} onToggle={alternar(setRegVars)}
                cor={() => COR.muted} />
              <button onClick={() => gerarModelo([...regVars], pontosDiarios)} disabled={!regVars.size || calculando} className="btn-mk sm mt-2">
                {calculando ? 'Calculando…' : 'Gerar modelo'}
              </button>
            </div>
          </div>
        )}

        {/* gráfico */}
        <div className="panel p-5">
          <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium mb-1">
            {nacional ? 'Custo do prato feito (R$) — distribuição dos 100 pratos' : 'Custo do prato (R$) — por fonte'}
            <InfoTip texto={nacional
              ? 'Cada coleta reúne o custo dos 100 pratos. A mediana é o índice nacional; a faixa mostra o prato mais barato e o mais caro. Escolha a fonte (blend/online/manual), a região e o período.'
              : 'Custo deste prato ao longo do tempo, em cada fonte: blend (o índice real), online (só cotação online) e manual (só leituras manuais).'} />
          </p>
          <BotaoExportar nome="indice-pf-serie" abas={() => [{ nome: 'Série', linhas: dadosP.map((d: any) => ({ Data: new Date(d.ts).toISOString().slice(0, 10), ...(nacional ? { Mediana: d.mediana, Média: d.media, Minimo: d.min, Maximo: d.max } : { Blend: d.blend, Online: d.online, Manual: d.manual }) })) }]} />
          </div>
          <p className="text-xs text-dim mb-4">
            {nacional ? `Fonte: ${FONTES.find(f => f[0] === fonte)![1]}` : 'blend × online × manual'}
            {poucos && ' · série curta (poucas coletas) — cresce a cada coleta.'}
          </p>
          <div style={{ width: '100%', height: 360 }}>
            <ResponsiveContainer>
              <ComposedChart data={dadosChart} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
                <defs>
                  <linearGradient id="grad-ind" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COR.paprika} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={COR.paprika} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']}
                  ticks={ticks} tickFormatter={(t: number) => fmt(new Date(t).toISOString().slice(0, 10))}
                  tick={{ fontSize: 13, fill: COR.muted }} />
                <YAxis yAxisId="left" tick={{ fontSize: 13, fill: COR.muted }} width={zAtivo ? 46 : 48}
                  tickFormatter={v => zAtivo ? `${Number(v).toFixed(1)}σ` : `R$${v}`} />
                {overlayKeys.length > 0 && !zAtivo && (
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 13, fill: COR.muted }} width={64}
                    tickFormatter={v => {
                      const u = PREDITOR_POR_KEY[overlayKeys[0]]?.unidade
                      return u === 'R$' ? `R$${v}` : u === '%' ? `${v}%` : `${v}`
                    }} />
                )}
                <Tooltip formatter={(v: any, _n: any, p: any) => {
                  const dk = String(p?.dataKey || '')
                  if (dk.startsWith('p_')) {
                    const k = dk.slice(2)
                    const raw = p?.payload?.[`raw_${k}`]
                    const info = PREDITOR_POR_KEY[k]
                    return raw == null ? '—' : fmtValorPreditor(Number(raw), info?.formato ?? 'numero')
                  }
                  if (dk.startsWith('z_')) {                     // índice normalizado: mostra o R$ original
                    const raw = p?.payload?.[`raw_${dk.slice(2)}`]
                    return raw == null ? '—' : `R$ ${Number(raw).toFixed(2)}`
                  }
                  return Array.isArray(v)
                    ? `R$ ${Number(v[0]).toFixed(2)} – R$ ${Number(v[1]).toFixed(2)}`
                    : `R$ ${Number(v).toFixed(2)}`
                }}
                  labelFormatter={(t: any) => fmtDia(new Date(t).toISOString().slice(0, 10))} />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                {nacional ? (
                  <>
                    {banda && !zAtivo && <Area yAxisId="left" type="monotone" dataKey="faixa" name="faixa mín–máx" fill={COR.paprika} fillOpacity={0.1} stroke="none" />}
                    {metricas.mediana && <Area yAxisId="left" type="monotone" dataKey={zAtivo ? 'z_mediana' : 'mediana'} name="Mediana" stroke={COR.paprika} strokeWidth={2.5} dot={{ r: 3 }} fill={zAtivo ? 'none' : 'url(#grad-ind)'} />}
                    {metricas.media && <Line yAxisId="left" type="monotone" dataKey={zAtivo ? 'z_media' : 'media'} name="Média" stroke={COR.olive} strokeWidth={2} dot={{ r: 3 }} />}
                    {metricas.min && <Line yAxisId="left" type="monotone" dataKey={zAtivo ? 'z_min' : 'min'} name="Mínimo" stroke={COR.muted} strokeWidth={1.5} dot={{ r: 2 }} />}
                    {metricas.max && <Line yAxisId="left" type="monotone" dataKey={zAtivo ? 'z_max' : 'max'} name="Máximo" stroke={COR.ink} strokeWidth={1.5} dot={{ r: 2 }} />}
                  </>
                ) : (
                  <>
                    <Area yAxisId="left" type="monotone" dataKey={zAtivo ? 'z_blend' : 'blend'} name="Blend" stroke={COR.paprika} strokeWidth={2.5} dot={{ r: 3 }} fill={zAtivo ? 'none' : 'url(#grad-ind)'} />
                    <Line yAxisId="left" type="monotone" dataKey={zAtivo ? 'z_online' : 'online'} name="Online" stroke={COR.azul} strokeWidth={2} dot={{ r: 3 }} />
                    <Line yAxisId="left" type="monotone" dataKey={zAtivo ? 'z_manual' : 'manual'} name="Manual" stroke={COR.olive} strokeWidth={2} dot={{ r: 3 }} />
                  </>
                )}
                {overlayKeys.map((k, i) => (
                  <Line key={k} yAxisId={zAtivo ? 'left' : 'right'} type="monotone" dataKey={`p_${k}`}
                    name={PREDITOR_POR_KEY[k]?.label || k}
                    stroke={CHART_SERIES[(i + 1) % CHART_SERIES.length]}
                    strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {admin && (
          <div className="border border-border rounded-lg bg-surface p-4 space-y-3">
            <p className="text-sm font-medium">Índice mensal × preditores mensais (admin)
              <InfoTip texto="Índice agregado por mês (média das coletas do mês) para casar com as variáveis mensais do IPCA/juros/salário. Sobreponha uma variável no eixo direito ou rode a regressão mensal." /></p>
            <div className="border border-brand-roxo/30 bg-brand-roxo/5 rounded-lg p-3 space-y-3">
              <SeletorSeries titulo="Sobrepor no gráfico" opcoes={PREDITORES_MENSAIS}
                selecionadas={overlayVarsM} onToggle={alternar(setOverlayVarsM)}
                cor={k => CHART_SERIES[([...overlayVarsM].indexOf(k) + 1) % CHART_SERIES.length]} />
              <div className="border-t border-border/60 pt-3">
                <SeletorSeries titulo="Regressão: índice mensal ~ preditores mensais"
                  opcoes={PREDITORES_MENSAIS} selecionadas={regVarsM} onToggle={alternar(setRegVarsM)}
                  cor={() => COR.muted} />
                <button onClick={() => gerarModelo([...regVarsM], pontosMensais.map(p => ({ data: p.data, y: p.indice })))}
                  disabled={!regVarsM.size || calculando} className="btn-mk sm mt-2">
                  {calculando ? 'Calculando…' : 'Gerar modelo mensal'}
                </button>
              </div>
            </div>
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <ComposedChart data={dadosMes} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
                  <defs>
                    <linearGradient id="grad-mes" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COR.paprika} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={COR.paprika} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']}
                    ticks={dadosMes.map(p => p.ts)} tickFormatter={(t: number) => new Date(t).toISOString().slice(0, 7).split('-').reverse().join('/')}
                    tick={{ fontSize: 12, fill: COR.muted }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 12, fill: COR.muted }} width={zAtivoM ? 46 : 48}
                    tickFormatter={v => zAtivoM ? `${Number(v).toFixed(1)}σ` : `R$${v}`} />
                  {overlayKeysM.length > 0 && !zAtivoM && (
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: COR.muted }} width={64}
                      tickFormatter={v => {
                        const u = PREDITOR_POR_KEY[overlayKeysM[0]]?.unidade
                        return u === 'R$' ? `R$${v}` : u === '%' ? `${v}%` : `${v}`
                      }} />
                  )}
                  <Tooltip formatter={(v: any, _n: any, p: any) => {
                    const dk = String(p?.dataKey || '')
                    if (dk.startsWith('p_')) {
                      const k = dk.slice(2)
                      const raw = p?.payload?.[`raw_${k}`]
                      const info = PREDITOR_POR_KEY[k]
                      return raw == null ? '—' : fmtValorPreditor(Number(raw), info?.formato ?? 'numero')
                    }
                    if (dk === 'z_indice') return `R$ ${Number(p?.payload?.raw_indice).toFixed(2)}`
                    return `R$ ${Number(v).toFixed(2)}`
                  }} labelFormatter={(t: any) => new Date(t).toISOString().slice(0, 7).split('-').reverse().join('/')} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area yAxisId="left" type="monotone" dataKey={zAtivoM ? 'z_indice' : 'indice'} name="Índice (mês)"
                    stroke={COR.paprika} strokeWidth={2.5} dot={{ r: 3 }} fill={zAtivoM ? 'none' : 'url(#grad-mes)'} />
                  {overlayKeysM.map((k, i) => (
                    <Line key={k} yAxisId={zAtivoM ? 'left' : 'right'} type="monotone" dataKey={`p_${k}`}
                      name={PREDITOR_POR_KEY[k]?.label || k}
                      stroke={CHART_SERIES[(i + 1) % CHART_SERIES.length]}
                      strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* composição por grupo (total quando nacional; do prato quando selecionado) */}
        <div className="panel p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <p className="text-sm font-medium">{nacional ? 'Composição do custo por grupo de alimento' : 'Composição do prato por grupo'}
                <InfoTip texto="Quanto cada grupo de alimento pesa no custo (blend). Média por prato quando é o índice; do prato quando um está selecionado. As 17 categorias viram 7 grupos. Alterne R$ e % do total." /></p>
              <p className="text-xs text-dim">{nacional ? (regiao ? `Média por prato · ${regiao} · blend` : 'Média por prato · blend') : 'blend'}{poucos && ' · série curta, cresce a cada coleta.'}</p>
            </div>
            <div className="inline-flex border border-border rounded-md overflow-hidden bg-surface text-sm">
              {([['abs', 'R$'], ['pct', '% do total']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setPercentual(k === 'pct')}
                  className={`px-3 py-1.5 transition-colors ${(percentual ? 'pct' : 'abs') === k ? 'bg-accent text-white' : 'text-dim hover:text-ink'}`}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{ width: '100%', height: 340 }}>
            <ResponsiveContainer>
              <BarChart data={compData} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
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
            <div className="panel p-5">
              <p className="text-sm font-medium mb-1">Simular sem ingredientes
                <InfoTip texto="Desmarque ingredientes para ver o custo do prato sem eles (última coleta, blend). O R$ de cada item é o custo da quantidade da receita (em gramas)." /></p>
              <p className="text-xs text-dim mb-3">
                Custo do prato = soma dos ingredientes marcados ({dataDetalhes ? `coleta de ${fmt(dataDetalhes)}` : 'última coleta'} · blend). O R$ ao lado de cada
                item é o custo da <strong>quantidade da receita</strong> (em gramas). Desmarque para ver o prato sem ele.
              </p>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="font-bold tracking-tight text-2xl text-accent tnum">{brl(atual)}</span>
                {off.size > 0 && <span className="text-xs text-dim">de {brl(cheio)} · −{brl(cheio - atual)}</span>}
              </div>
              <div className="space-y-3">
                {(() => {
                  const grupos: Record<string, ItemDetalhe[]> = {}
                  its.forEach(it => (grupos[it.categoria || 'Outro'] ||= []).push(it))
                  const soma = (arr: ItemDetalhe[]) => arr.reduce((s, x) => s + (off.has(x.ingrediente_id) ? 0 : x.custo), 0)
                  const cats = Object.keys(grupos).sort((a, b) => grupos[b].reduce((s, x) => s + x.custo, 0) - grupos[a].reduce((s, x) => s + x.custo, 0))
                  return cats.map(cat => (
                    <div key={cat}>
                      <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-wide text-dim border-b border-border/60 pb-1">
                        <span>{cat}</span><span className="tnum">{brl(soma(grupos[cat]))}</span>
                      </div>
                      {grupos[cat].map(it => (
                        <label key={it.ingrediente_id} className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-border/40 cursor-pointer">
                          <span className="flex items-center gap-2 min-w-0">
                            <input type="checkbox" checked={!off.has(it.ingrediente_id)}
                              onChange={() => setOff(s => { const n = new Set(s); n.has(it.ingrediente_id) ? n.delete(it.ingrediente_id) : n.add(it.ingrediente_id); return n })} />
                            <span className={off.has(it.ingrediente_id) ? 'line-through text-dim' : ''}>{it.nome}</span>
                            <span className="text-xs text-dim shrink-0">{it.qtd_g} g</span>
                          </span>
                          <span className="tnum text-dim">{brl(it.custo)}</span>
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

      {admin && modalAberto && modelo && (
        <Modal title="Modelo de regressão temporal" onClose={() => setModalAberto(false)} wide>
          {'erro' in modelo ? (
            <p className="text-sm text-accent">{modelo.erro}</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span className="text-dim">R² <strong className="text-ink tnum">{modelo.r2.toFixed(3)}</strong></span>
                <span className="text-dim">R² ajust. <strong className="text-ink tnum">{modelo.r2Ajustado.toFixed(3)}</strong></span>
                <span className="text-dim">F <strong className="text-ink tnum">{modelo.f.toFixed(2)}</strong> (p {modelo.fP < 0.001 ? '<0,001' : modelo.fP.toFixed(3)})</span>
                <span className="text-dim">n <strong className="text-ink tnum">{modelo.n}</strong> · gl {modelo.gl}</span>
              </div>
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[0.65rem] uppercase tracking-wide text-dim border-b border-border">
                      <th className="px-3 py-2">Variável</th>
                      <th className="px-3 py-2 text-right">Coef.</th>
                      <th className="px-3 py-2 text-right">Erro-padrão</th>
                      <th className="px-3 py-2 text-right">t</th>
                      <th className="px-3 py-2 text-right">p-valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelo.coeficientes.map(c => (
                      <tr key={c.nome} className="border-t border-border/60">
                        <td className="px-3 py-1.5">{c.nome}</td>
                        <td className="px-3 py-1.5 text-right tnum">{c.coef.toFixed(4)}</td>
                        <td className="px-3 py-1.5 text-right tnum text-dim">{c.erroPadrao.toFixed(4)}</td>
                        <td className="px-3 py-1.5 text-right tnum">{isNaN(c.t) ? '—' : c.t.toFixed(2)}</td>
                        <td className={`px-3 py-1.5 text-right tnum ${c.p < 0.05 ? 'text-ok font-medium' : 'text-dim'}`}>{isNaN(c.p) ? '—' : c.p < 0.001 ? '<0,001' : c.p.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-dim">p-valor &lt; 0,05 (verde) = preditor significativo. Preditores alinhados por carry-forward à data de cada coleta.</p>
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer>
                  <ComposedChart data={modelo.observado.map((o, i) => ({ i: i + 1, obs: o, prev: modelo.previsto[i] }))} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="i" tick={{ fontSize: 12, fill: COR.muted }} />
                    <YAxis tick={{ fontSize: 12, fill: COR.muted }} width={48} tickFormatter={v => `R$${v}`} />
                    <Tooltip formatter={(v: any) => `R$ ${Number(v).toFixed(2)}`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="obs" name="Observado" stroke={COR.paprika} strokeWidth={2} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="prev" name="Previsto" stroke={COR.azul} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button className="btn-mk sm primary" onClick={async () => {
                  await navigator.clipboard.writeText(textoModelo(modelo))
                  setCopiado(true); setTimeout(() => setCopiado(false), 2000)
                }}>{copiado ? 'Copiado ✓' : 'Copiar resultados'}</button>
                <a className="btn-mk sm" target="_blank" rel="noopener noreferrer"
                  href={`https://wa.me/?text=${encodeURIComponent(textoModelo(modelo))}`}>Compartilhar no WhatsApp</a>
              </div>
            </div>
          )}
        </Modal>
      )}
   </>
  )
}
