'use client'

import { useEffect, useMemo, useState, Fragment } from 'react'
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts'
import dynamic from 'next/dynamic'
import { getEvolucao, getSnapshotsNovos, getContribuicoesMapa, getCalibracao, getAllFontes, type Evolucao, type FonteKey, type PontoContrib, type Calibracao } from '@/lib/queries'
import { brl } from '@/lib/format'
import { mediana } from '@/lib/stats'
import { ACCENT, BRAND, CHART_SERIES, CORES_REGIAO, DIM, INK } from '@/lib/theme'
import { inputBase } from '@/components/ui'
import type { Fonte } from '@/lib/types'
import TabelaIngredientes from './TabelaIngredientes'
import BotaoExportar from './BotaoExportar'
import IndicePainel from './IndicePainel'
import LabPreditores from './LabPreditores'
import SeletorPrato from './SeletorPrato'
import BotaoInicio from '../../BotaoInicio'
import InfoTip from '../../InfoTip'
import AuthControls from '../../Auth'
import RequireAdmin from '../../RequireAdmin'

const MapaLocal = dynamic(() => import('../../MapaLocal'), { ssr: false, loading: () => <div className="h-[440px] grid place-items-center text-dim text-sm">Carregando mapa…</div> })

// keys herdadas da V0 (paprika/olive) mapeadas para a paleta V1 de lib/theme;
// renomear junto com a reescrita da Fase 5
const COR = { paprika: ACCENT, olive: BRAND.verde, ink: INK, muted: DIM, azul: BRAND.ciano }
const fmt = (d: string) => { const [, m, dia] = d.split('-'); return `${dia}/${m}` }
const ts = (d: string) => new Date(d + 'T00:00:00Z').getTime()
const r2 = (n: number) => Math.round(n * 100) / 100
const ORDEM_REG = ['Norte', 'Nordeste', 'Centro-oeste', 'Sudeste', 'Sul']
const selCls = inputBase

export default function EvolucaoPage() {
  return <RequireAdmin><EvolucaoInner /></RequireAdmin>
}

function EvolucaoInner() {
  const [aba, setAba] = useState<'indice' | 'variacao' | 'ingredientes' | 'mapa' | 'calibracao' | 'preditores'>('indice')
  const [ev, setEv] = useState<Evolucao | null>(null)
  const [calib, setCalib] = useState<Calibracao | null>(null)
  const [calibIni, setCalibIni] = useState(''); const [calibFim, setCalibFim] = useState('')
  const [calibBusca, setCalibBusca] = useState('')
  const [calibOnline, setCalibOnline] = useState<Record<number, Fonte[]>>({})
  const [calibAberto, setCalibAberto] = useState<string | null>(null)
  const [fonte, setFonte] = useState<FonteKey>('blend')
  const [pratoId, setPratoId] = useState(0)          // 0 = índice nacional (todos os pratos)
  const [ini, setIni] = useState('')   // período: início (YYYY-MM-DD, '' = desde o começo)
  const [fim, setFim] = useState('')   // período: fim ('' = até a última coleta)
  const [ativos, setAtivos] = useState<Set<string>>(new Set(['nacional']))   // séries ativas na Variação
  const [pontos, setPontos] = useState<PontoContrib[]>([])
  const [fRegs, setFRegs] = useState<Set<string>>(new Set()); const [fTipo, setFTipo] = useState(''); const [fIng, setFIng] = useState(0)
  const [snapsNovos, setSnapsNovos] = useState<{ id: number; data: string }[]>([])

  const noPeriodo = (d: string) => (!ini || d >= ini) && (!fim || d <= fim)

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
  const nacional = pratoId === 0

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
        ...regs.map((r, idx) => ({ key: 'reg:' + r, label: r, cor: CORES_REGIAO[r] ?? CHART_SERIES[idx % CHART_SERIES.length], serie: cumul(i => regMed(r, i)) })),
      ]
    }
    const rows = idxs.map((i, k) => { const row: any = { ts: ts(ev.serie[i].data), data: ev.serie[i].data }; for (const d of defs) row[d.key] = d.serie[k]; return row })
    return { rows, series: defs.map(({ key, label, cor }) => ({ key, label, cor })), base: ev.serie[base].data }
  }, [ev, pratoId, fonte, ini, fim])

  const poucos = !ev || ev.serie.length < 2
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
      <header className="border-b border-border bg-surface-2">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-end justify-between gap-4">
          <div>
            <a href="/" className="font-bold tracking-tight text-2xl leading-none hover:text-accent transition-colors">Índice PF</a>
            <p className="text-xs text-dim mt-1">histórico do custo do prato feito</p>
          </div>
          <div className="flex items-center gap-4 flex-wrap justify-end">
            <BotaoInicio />
            <span className="text-sm text-accent border-b-2 border-accent pb-0.5">Histórico</span>
            <AuthControls />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6">
        {/* abas */}
        <div className="flex gap-5 border-b border-border pt-2">
          {([['indice', 'Índice'], ['variacao', 'Variação'], ['ingredientes', 'Ingredientes'], ['mapa', 'Mapa'], ['calibracao', 'Calibração'], ['preditores', 'Laboratório']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`text-sm pb-2 border-b-2 -mb-px transition ${aba === k ? 'border-accent text-ink' : 'border-transparent text-dim hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {aba === 'ingredientes' ? (
        <div className="max-w-6xl mx-auto px-6 py-8"><TabelaIngredientes /></div>
      ) : aba === 'calibracao' ? (
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-5">
        <p className="text-sm text-dim">
          Calibração dos preços de Mercado e Atacarejo com dados de campo. Para cada região e tipo de loja, compara o
          preço de campo aprovado com o preço online do mesmo ingrediente e mede o desconto real.
          <strong> Onde ainda não há dado de campo, usa os percentuais atuais (−10% Mercado, −22% Atacarejo).</strong>
          <InfoTip texto="Preço de campo = contribuições aprovadas com tipo de loja Mercado ou Atacarejo. Desconto medido = 1 − (mediana do preço de campo ÷ preço online). O índice calibrado recomputa o custo dos pratos da região aplicando, por ingrediente, o desconto medido onde existe e o percentual padrão onde não existe." />
        </p>

        {/* período: filtra as contribuições de campo e a coleta online de referência */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-dim">Período:</span>
          <div className="inline-flex border border-border rounded-md overflow-hidden bg-surface">
            {([['7d', 7], ['15d', 15], ['30d', 30], ['3m', 90], ['6m', 180], ['Tudo', 0]] as const).map(([label, d]) => (
              <button key={label} onClick={() => presetCalib(d)} className="px-3 py-1.5 text-dim hover:text-ink transition-colors">{label}</button>
            ))}
          </div>
          <input type="date" value={calibIni} onChange={e => setCalibIni(e.target.value)} className="bg-surface border border-border rounded px-2 py-1 focus:outline-none focus:border-accent" />
          <span className="text-dim">até</span>
          <input type="date" value={calibFim} onChange={e => setCalibFim(e.target.value)} className="bg-surface border border-border rounded px-2 py-1 focus:outline-none focus:border-accent" />
          {(calibIni || calibFim) && <button onClick={() => { setCalibIni(''); setCalibFim('') }} className="text-accent hover:underline">limpar</button>}
        </div>

        {!calib ? <p className="text-sm text-dim">Carregando…</p> : (
          <>
            {calib.contribsUsadas === 0 && (
              <div className="border border-border rounded-lg bg-surface p-4 text-sm text-dim">
                Ainda não há contribuições de campo (Mercado/Atacarejo) aprovadas para calibrar. O índice calibrado é
                igual ao com os percentuais atuais — ele passa a divergir conforme chegam contribuições de campo.
              </div>
            )}
            <div className="border border-border rounded-lg bg-surface overflow-x-auto">
              <table className="w-full text-sm min-w-[46rem]">
                <thead>
                  <tr className="text-left text-[0.65rem] uppercase tracking-wide text-dim border-b border-border">
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
                    <tr key={r.regiao} className="border-t border-border/60">
                      <td className="px-3 py-2 whitespace-nowrap">{r.regiao} <span className="text-xs text-dim">· {r.nPratos} pratos</span></td>
                      <td className="px-3 py-2 text-right tnum">{r.indiceOnline > 0 ? brl(r.indiceOnline) : '—'}</td>
                      <td className="px-3 py-2 text-right tnum text-dim">{r.indiceOnline > 0 ? brl(r.mercado.indiceAssumido) : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <span className="tnum">{r.indiceOnline > 0 ? brl(r.mercado.indiceCalibrado) : '—'}</span>
                        <span className="block text-[0.65rem] text-dim">{r.mercado.medidoPct != null ? `medido ${r.mercado.medidoPct >= 0 ? '−' : '+'}${Math.abs(r.mercado.medidoPct * 100).toFixed(0)}% · ${r.mercado.cobertura} ingred.` : 'sem campo · −10%'}</span>
                      </td>
                      <td className="px-3 py-2 text-right tnum text-dim">{r.indiceOnline > 0 ? brl(r.atacarejo.indiceAssumido) : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <span className="tnum">{r.indiceOnline > 0 ? brl(r.atacarejo.indiceCalibrado) : '—'}</span>
                        <span className="block text-[0.65rem] text-dim">{r.atacarejo.medidoPct != null ? `medido ${r.atacarejo.medidoPct >= 0 ? '−' : '+'}${Math.abs(r.atacarejo.medidoPct * 100).toFixed(0)}% · ${r.atacarejo.cobertura} ingred.` : 'sem campo · −22%'}</span>
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
                    className="bg-surface border border-border rounded-md px-3 py-1.5 text-sm w-full sm:w-56 focus:outline-none focus:border-accent" />
                </div>
                <div className="border border-border rounded-lg bg-surface overflow-x-auto">
                  <table className="w-full text-sm min-w-[44rem]">
                    <thead>
                      <tr className="text-left text-[0.65rem] uppercase tracking-wide text-dim border-b border-border">
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
                      {!filtrados.length && <tr><td colSpan={8} className="px-3 py-6 text-center text-dim">Nenhum ingrediente para a busca.</td></tr>}
                      {filtrados.map(it => {
                        const key = `${it.regiao}|${it.tipo}|${it.ingrediente_id}`
                        const aberto = calibAberto === key
                        const online = calibOnline[it.ingrediente_id] || []
                        return (
                          <Fragment key={key}>
                            <tr className="border-t border-border/60">
                              <td className="px-3 py-2 whitespace-nowrap">{it.regiao}</td>
                              <td className="px-3 py-2">{it.tipo}</td>
                              <td className="px-3 py-2">{it.nome}</td>
                              <td className="px-3 py-2 text-right tnum">{brl(it.fieldKg)}/kg</td>
                              <td className="px-3 py-2 text-right tnum text-dim">{brl(it.onlineKg)}/kg</td>
                              <td className={`px-3 py-2 text-right tnum ${it.desconto >= 0 ? 'text-ok' : 'text-accent'}`}>{it.desconto >= 0 ? '−' : '+'}{Math.abs(it.desconto * 100).toFixed(0)}%</td>
                              <td className="px-3 py-2 text-right tnum text-dim">{it.n}</td>
                              <td className="px-3 py-2 text-right">
                                <button onClick={() => setCalibAberto(aberto ? null : key)} className="text-xs text-accent hover:underline whitespace-nowrap">{aberto ? 'ocultar' : `fontes (${it.n}·${online.length})`}</button>
                              </td>
                            </tr>
                            {aberto && (
                              <tr className="bg-surface-2/60">
                                <td colSpan={8} className="px-3 py-3">
                                  <div className="grid sm:grid-cols-2 gap-4">
                                    <div>
                                      <p className="text-[0.65rem] uppercase tracking-wide text-dim mb-1.5">Campo — {it.n} leitura{it.n === 1 ? '' : 's'} (quem · quando · onde)</p>
                                      <ul className="space-y-1">
                                        {it.fontes.map((f, j) => (
                                          <li key={j} className="text-xs flex justify-between gap-3">
                                            <span className="min-w-0 truncate">{f.nome} · {fmtDia(f.data)}{(f.cidade || f.uf) ? ` · ${[f.cidade, f.uf].filter(Boolean).join('/')}` : ''}</span>
                                            <span className="tnum text-accent shrink-0">{brl(f.precoKg)}/kg</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                    <div>
                                      <p className="text-[0.65rem] uppercase tracking-wide text-dim mb-1.5">Online — {online.length} fonte{online.length === 1 ? '' : 's'}{calib.snapshotData ? ` (${fmtDia(calib.snapshotData)})` : ''}</p>
                                      {!online.length ? <p className="text-xs text-dim">Sem fontes online nesta coleta.</p> : (
                                        <ul className="space-y-1">
                                          {online.slice(0, 12).map((f, j) => (
                                            <li key={j} className="text-xs flex justify-between gap-3">
                                              <a href={f.link || undefined} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate hover:text-accent">{f.titulo} <span className="text-dim">· {f.loja}</span></a>
                                              <span className="tnum text-accent shrink-0">{brl(Number(f.preco_bruto))}</span>
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

            <p className="text-xs text-dim">
              Base: preço online da coleta mais recente{calib.snapshotData ? ` (${calib.snapshotData.split('-').reverse().join('/')})` : ''}.
              Desconto positivo = campo mais barato que o online. No índice calibrado, o desconto por ingrediente é limitado
              a 0–60% para uma leitura isolada não distorcer o resultado.
            </p>
          </>
        )}
      </div>
      ) : aba === 'mapa' ? (
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-4">
        <p className="text-sm text-dim">
          Contribuições de campo aprovadas com localização. Filtre por período, região, tipo de mercado e ingrediente.
          <InfoTip texto="Cada ponto é uma foto aprovada de preço enviada por um usuário, na coordenada onde foi coletada. Os filtros combinam entre si." />
        </p>
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
        </div>
        <div className="text-xs text-dim">Região
          <div className="flex items-center gap-4 flex-wrap mt-1">
            {regContrib.length ? regContrib.map(r => (
              <label key={r} className="flex items-center gap-1.5 cursor-pointer text-ink">
                <input type="checkbox" checked={fRegs.has(r)} onChange={() => setFRegs(s => { const n = new Set(s); n.has(r) ? n.delete(r) : n.add(r); return n })} />
                {r}
              </label>
            )) : <span className="text-dim">—</span>}
            {fRegs.size > 0 && <button onClick={() => setFRegs(new Set())} className="text-accent hover:underline">limpar</button>}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <label className="text-xs text-dim">Tipo de mercado
            <select value={fTipo} onChange={e => setFTipo(e.target.value)} className={selCls}>
              <option value="">Todos</option>
              {tiposContrib.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-xs text-dim flex-1 min-w-[12rem]">Ingrediente
            <select value={fIng} onChange={e => setFIng(Number(e.target.value))} className={selCls}>
              <option value={0}>Todos</option>
              {ingsContrib.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
            </select>
          </label>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-dim">{pontosFiltrados.length} de {pontos.length} contribuição(ões)</p>
          {pontosFiltrados.length > 0 && <BotaoExportar nome="indice-pf-contribuicoes" abas={() => [{ nome: 'Contribuições', linhas: pontosFiltrados.map(p => ({ Data: p.criado_em, Ingrediente: p.nome, Preco: p.preco, Cidade: p.cidade, Regiao: p.regiao, UF: p.uf, TipoLoja: p.tipo_loja, Lat: p.lat, Lng: p.lng })) }]} />}
        </div>
        {pontosFiltrados.length ? (
          <MapaLocal points={pontosFiltrados.map(p => ({
            lat: p.lat, lng: p.lng,
            label: `${p.nome}${p.preco != null ? ` — R$ ${p.preco.toFixed(2)}` : ''}${p.cidade ? ` · ${p.cidade}` : ''}${p.data ? ` · ${fmt(p.data)}` : ''}`,
          }))} height="440px" />
        ) : <p className="text-sm text-dim py-6">Nenhuma contribuição para os filtros.</p>}

        {pontosFiltrados.length > 0 && (
          <div className="border border-border rounded-lg bg-surface overflow-x-auto">
            <table className="w-full text-xs min-w-[38rem]">
              <thead>
                <tr className="text-left text-[0.62rem] uppercase tracking-wide text-dim border-b border-border">
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
                    <tr key={i} className="border-t border-border/60">
                      <td className="px-3 py-1.5 text-dim">{d ? d.toLocaleDateString('pt-BR') : '—'}</td>
                      <td className="px-3 py-1.5 text-dim tnum">{d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td className="px-3 py-1.5">{p.nome}</td>
                      <td className="px-3 py-1.5 text-right tnum text-accent font-medium">{p.preco != null ? brl(p.preco) : '—'}</td>
                      <td className="px-3 py-1.5 text-dim">{[p.cidade, p.tipo_loja].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="px-3 py-1.5 text-dim">{p.regiao || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      ) : !ev ? (
        <p className="max-w-6xl mx-auto px-6 py-10 text-sm text-dim">Carregando…</p>
      ) : aba === 'preditores' ? (
        <LabPreditores ev={ev} />
      ) : aba === 'variacao' ? (
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 flex-wrap">
          <div className="text-xs text-dim">Prato
            <SeletorPrato pratos={ev.pratos} value={pratoId} onChange={setPratoId} />
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
        </div>
        <div className="text-xs text-dim">Fonte do dado
          <div className="flex w-fit border border-border rounded-md overflow-hidden bg-surface text-sm mt-1">
            {([['online', 'Online'], ['manual', 'Campo'], ['blend', 'Blend']] as [FonteKey, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setFonte(k)} className={`px-3 py-1.5 transition-colors ${fonte === k ? 'bg-accent text-white' : 'text-dim hover:text-ink'}`}>{label}</button>
            ))}
          </div>
        </div>

        {nacional && (
          <div className="flex items-center gap-4 flex-wrap text-xs">
            <span className="text-dim">Linhas:</span>
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
          <p className="text-xs text-dim">
            {nacional ? 'Nacional e as regiões que você marcar.' : 'Só o prato selecionado.'} · Fonte: {fonte === 'online' ? 'online (raspado)' : fonte === 'manual' ? 'campo (leituras manuais)' : 'blend (média online × campo)'}
            {variacao.base && ` · base: coleta de ${fmt(variacao.base)} (0%)`}.
          </p>
          </div>
          <BotaoExportar nome="indice-pf-variacao" abas={() => [{ nome: 'Variação', linhas: variacao.rows.map((r: any) => { const o: any = { Data: r.data }; variacao.series.forEach(s => { o[s.label] = r[s.key] }); return o }) }]} />
        </div>

        <div className="border border-border rounded-lg bg-surface p-4">
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
          {poucos && <p className="text-xs text-dim mt-2">Série curta — a 1ª coleta é a base (0%); a variação aparece a partir da 2ª.</p>}
        </div>

        <div className="border border-border rounded-lg bg-surface p-4 text-xs text-dim leading-relaxed space-y-2">
          <p className="text-sm font-medium text-ink">Como ler este gráfico</p>
          <p>Cada ponto é a <strong>variação acumulada do custo em relação à 1ª coleta do período</strong> (a base). A base começa em <strong>0%</strong> e cada coleta seguinte mostra o quanto ficou mais caro (+) ou mais barato (−) desde ela. A fórmula:</p>
          <p className="text-ink"><code>Δ% = (custo desta coleta − custo da 1ª coleta) ÷ custo da 1ª coleta × 100</code></p>
          <p><strong>Exemplo:</strong> se o Nacional foi R$ 11,63 na 1ª coleta (base = 0%) e R$ 11,93 depois, esse ponto é (11,93 − 11,63) ÷ 11,63 = <strong>+2,6%</strong> — 2,6% mais caro que no começo.</p>
          <p><strong>Linha subindo</strong> = ficando mais caro · <strong>descendo</strong> = mais barato · acima de 0% = mais caro que a base; abaixo = mais barato.</p>
          <p>O <strong>custo</strong> de cada linha: <strong>Nacional</strong> = mediana dos 100 pratos; <strong>uma região</strong> = mediana dos pratos daquela região; <strong>um prato</strong> = o custo dele. A <strong>fonte</strong> define o preço de cada ingrediente: <strong>Online</strong> (raspado no varejo), <strong>Campo</strong> (leituras manuais/contribuições) ou <strong>Blend</strong> (média dos dois — o índice oficial).</p>
        </div>
      </div>
      ) : (
        <IndicePainel ev={ev} snapsNovos={snapsNovos} admin />
      )}
    </main>
  )
}
