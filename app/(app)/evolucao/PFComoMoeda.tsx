'use client'

import { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import type { Evolucao } from '@/lib/queries'
import { escalador, mediana } from '@/lib/stats'
import { fetchAdmin } from '@/lib/fetch-admin'
import { brl } from '@/lib/format'
import { ACCENT, BRAND, CHART_SERIES, DIM } from '@/lib/theme'
import {
  CONVERSORES, UNIDADES, UNIDADE_POR_KEY, converter, valorNaUnidade, minutosDeTrabalho,
  fmtQuantidade, fmtNaUnidade, fmtEixo, fmtTempo, REGIOES_PNAD,
} from '@/lib/numerario'
import { PREDITORES, PREDITOR_POR_KEY, estenderTrimestral, fmtValorPreditor } from '@/lib/preditores'
import SeletorSeries from './SeletorSeries'
import InfoTip from '../../InfoTip'

// "PF como moeda" (admin, docs/031): o PF usado como unidade de conta — quanto
// dele um salário mínimo compra, quanto ele vale em dólar/ouro, e quanto tempo
// de trabalho ele custa. Aba fechada: nada aqui vai para a área pública, e a
// série reconstruída aparece só como contexto visual rotulado (decisão D5).

const ORDEM_REG = ['Norte', 'Nordeste', 'Centro-oeste', 'Sudeste', 'Sul']
const COR = { med: ACCENT, rec: BRAND.ciano, ipca: DIM }
const fmtYM = (ym: string) => ym.split('-').reverse().join('/')
const r2 = (v: number) => Math.round(v * 100) / 100

// cards que viram linha do gráfico: os conversores e o tempo de trabalho (o
// custo em R$ não tem card — é o próprio índice, que a aba Índice já desenha)
const CARDS = UNIDADES.filter(u => u.key !== 'reais')
// índice -1 = série escolhida que não virou linha (sem dado na janela): fica
// cinza no chip, para não prometer uma cor que o gráfico não vai desenhar
const corDaLinha = (i: number) => (i < 0 ? DIM : CHART_SERIES[i % CHART_SERIES.length])

// Valor mensal de uma série: média das observações do mês. Para série mensal é
// o próprio valor; para diária, a média do mês (a mesma agregação que o índice
// mensal usa sobre as coletas). A trimestral é estendida pelos meses que o
// trimestre cobre — ver ALCANCE_TRIMESTRAL em lib/preditores.
function porMes(serie: { data: string; valor: number }[] | undefined, trimestral = false): Map<string, number> {
  const acc = new Map<string, number[]>()
  for (const p of serie ?? []) {
    const ym = p.data.slice(0, 7)
    const a = acc.get(ym) ?? []
    a.push(p.valor)
    acc.set(ym, a)
  }
  const m = new Map([...acc].map(([ym, vs]) => [ym, vs.reduce((s, v) => s + v, 0) / vs.length]))
  return trimestral ? estenderTrimestral(m) : m
}

type Vigente = { valor: number; data: string } | null
type Numerario = {
  ate: string
  conversores: Record<string, Vigente>
  pnad: Record<string, { renda: Vigente; horas: Vigente }>
}

export default function PFComoMoeda({ ev }: { ev: Evolucao }) {
  const [recorte, setRecorte] = useState('nacional')            // 'nacional' | 'reg:<Região>' | 'prato:<id>'
  const [num, setNum] = useState<Numerario | null>(null)
  const [erro, setErro] = useState('')
  const [retro, setRetro] = useState<{ ym: string; indice: number }[]>([])
  const [series, setSeries] = useState<Record<string, { data: string; valor: number }[]>>({})
  const [carregando, setCarregando] = useState(true)
  // cards ligados no gráfico (clicar no card liga/desliga a linha) + variáveis
  // do menu da aba Índice sobrepostas no mesmo gráfico
  const [ativos, setAtivos] = useState<Set<string>>(new Set(['salario_minimo']))
  const [overlayVars, setOverlayVars] = useState<Set<string>>(new Set())
  const [escala, setEscala] = useState<'base100' | 'z'>('base100')

  useEffect(() => {
    const ctrl = new AbortController()
    Promise.all([
      fetchAdmin('/api/numerario', { signal: ctrl.signal }).then(r => r.json()),
      fetchAdmin('/api/indice-retropolado?desde=2015-01&confianca=alta,media', { signal: ctrl.signal })
        .then(async r => { const j = await r.json().catch(() => null); return j?.serie ? j.serie : [] }),
    ]).then(([n, s]) => {
      if (ctrl.signal.aborted) return
      if (n?.error) { setErro(n.error); return }
      setNum(n); setRetro(s)
    }).catch(e => { if (!ctrl.signal.aborted) setErro(String(e)) })
      .finally(() => { if (!ctrl.signal.aborted) setCarregando(false) })
    return () => ctrl.abort()
  }, [])

  // séries necessárias: as dos cards ligados, as sobrepostas e o IPCA (que o
  // segundo gráfico usa sempre). O gráfico é sempre NACIONAL, então o tempo de
  // trabalho usa a PNAD do Brasil mesmo quando o recorte dos cards é regional.
  const varsQS = useMemo(() => {
    const s = new Set<string>(['ipca'])
    for (const k of ativos) UNIDADE_POR_KEY[k]?.series.forEach(x => s.add(x))
    for (const k of overlayVars) s.add(k)
    return [...s].sort().join(',')
  }, [ativos, overlayVars])

  useEffect(() => {
    const ctrl = new AbortController()
    fetchAdmin(`/api/preditores?vars=${varsQS}&de=2015-01-01`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(j => { if (!ctrl.signal.aborted) setSeries(j ?? {}) })
      .catch(e => { if (!ctrl.signal.aborted) setErro(String(e)) })
    return () => ctrl.abort()
  }, [varsQS])

  const regioes = useMemo(
    () => [...new Set(ev.pratos.map(p => p.regiao))].sort((a, b) => ORDEM_REG.indexOf(a) - ORDEM_REG.indexOf(b)),
    [ev.pratos])

  // custo do PF no recorte escolhido, na última coleta. Região = mediana dos
  // pratos daquela região, a mesma definição da aba Variação.
  const { custoPF, regiaoDoRecorte, rotuloRecorte, dataColeta } = useMemo(() => {
    const i = ev.serie.length - 1
    const data = ev.serie[i]?.data ?? null
    if (recorte.startsWith('prato:')) {
      const id = Number(recorte.slice(6))
      const prato = ev.pratos.find(p => p.id === id)
      return {
        custoPF: ev.porPrato[id]?.[i]?.blend ?? null,
        regiaoDoRecorte: prato?.regiao ?? null,
        rotuloRecorte: prato?.nome ?? 'Prato',
        dataColeta: data,
      }
    }
    if (recorte.startsWith('reg:')) {
      const reg = recorte.slice(4)
      const custos = ev.pratos.filter(p => p.regiao === reg)
        .map(p => ev.porPrato[p.id]?.[i]?.blend).filter((v): v is number => v != null && v > 0)
      return { custoPF: custos.length ? mediana(custos) : null, regiaoDoRecorte: reg, rotuloRecorte: reg, dataColeta: data }
    }
    return { custoPF: ev.serie[i]?.blend.mediana ?? null, regiaoDoRecorte: null, rotuloRecorte: 'Nacional', dataColeta: data }
  }, [ev, recorte])

  // PNAD do recorte: prato regional herda a renda da sua região; sem região
  // conhecida (ou sem dado publicado dela) cai no agregado Brasil, sempre dito.
  const pnad = useMemo(() => {
    if (!num) return { renda: null as Vigente, horas: null as Vigente, escopo: 'Brasil', caiuPraBrasil: false }
    const chave = regiaoDoRecorte ? REGIOES_PNAD[regiaoDoRecorte] : undefined
    const doRecorte = chave ? num.pnad[chave] : undefined
    if (doRecorte?.renda && doRecorte?.horas)
      return { renda: doRecorte.renda, horas: doRecorte.horas, escopo: regiaoDoRecorte!, caiuPraBrasil: false }
    return { ...num.pnad.br, escopo: 'Brasil', caiuPraBrasil: !!regiaoDoRecorte }
  }, [num, regiaoDoRecorte])

  const minutos = minutosDeTrabalho(custoPF, pnad.renda?.valor ?? null, pnad.horas?.valor ?? null)

  // índice medido agregado por mês: média das medianas das coletas do mês, a
  // mesma agregação do painel mensal da aba Índice
  const medidoPorMes = useMemo(() => {
    const por = new Map<string, number[]>()
    ev.serie.forEach(p => {
      const v = p.blend.mediana
      if (v != null && v > 0) { const a = por.get(p.data.slice(0, 7)) ?? []; a.push(v); por.set(p.data.slice(0, 7), a) }
    })
    return [...por.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, vs]) => ({ ym, nivel: r2(vs.reduce((s, v) => s + v, 0) / vs.length) }))
  }, [ev.serie])

  // valor mensal de cada série carregada
  const mensal = useMemo(() => {
    const out: Record<string, Map<string, number>> = {}
    for (const k of Object.keys(series)) out[k] = porMes(series[k], PREDITOR_POR_KEY[k]?.granularidade === 'trimestral')
    return out
  }, [series])

  const cardsAtivos = CARDS.filter(u => ativos.has(u.key))
  const overlayKeys = [...overlayVars].filter(k => (series[k] ?? []).length)
  const nLinhas = cardsAtivos.length + overlayKeys.length
  const chavesCards = cardsAtivos.map(u => u.key).join(',')
  const chavesOverlay = overlayKeys.join(',')
  // unidades diferentes só cabem no mesmo eixo depois de reescaladas; com uma
  // linha só não há o que compatibilizar, e ela vai na unidade original
  const normaliza = nLinhas > 1
  // a reconstruída é contexto (D5): com mais de uma linha o gráfico dobraria de
  // curvas e a tracejada deixaria de ser lida como o pano de fundo que é
  const mostraRec = cardsAtivos.length === 1 && overlayKeys.length === 0
  const unidadeUnica = !normaliza && cardsAtivos.length === 1 ? cardsAtivos[0] : null

  // Uma linha por card ligado (o índice medido convertido naquela unidade) mais
  // uma por variável sobreposta. A parte reconstruída vem do backcast da cesta
  // atual, não de medição.
  const grafico = useMemo(() => {
    const rec = new Map(retro.map(p => [p.ym, p.indice]))
    const med = new Map(medidoPorMes.map(p => [p.ym, p.nivel]))
    const meses = [...new Set([...(mostraRec ? rec.keys() : []), ...med.keys()])].sort()
    const valores = (u: typeof CARDS[number], ym: string) =>
      Object.fromEntries(u.series.map(s => [s, mensal[s]?.get(ym) ?? null]))

    const brutos: Record<string, (number | null)[]> = {}
    for (const u of cardsAtivos) brutos[u.key] = meses.map(ym => valorNaUnidade(u, med.get(ym) ?? null, valores(u, ym)))
    for (const k of overlayKeys) brutos[k] = meses.map(ym => mensal[k]?.get(ym) ?? null)
    const bruteRec = mostraRec
      ? meses.map(ym => valorNaUnidade(cardsAtivos[0], rec.get(ym) ?? null, valores(cardsAtivos[0], ym)))
      : null

    const chaves = Object.keys(brutos)
    const esc = Object.fromEntries(chaves.map(k => [k, escalador(brutos[k], escala)]))
    // série que a reescala não define (um ponto só, ou constante em z-score)
    const semEscala = normaliza
      ? chaves.filter(k => brutos[k].some(v => v != null) && brutos[k].every(v => esc[k](v) == null))
      : []

    const linhas = meses.map((ym, i) => {
      const row: any = { ym }
      for (const k of chaves) {
        row[`v_${k}`] = normaliza ? esc[k](brutos[k][i]) : brutos[k][i]
        row[`raw_${k}`] = brutos[k][i]
      }
      if (bruteRec) row.rec = bruteRec[i]
      return row
    }).filter(row => chaves.some(k => row[`v_${k}`] != null) || row.rec != null)

    return { linhas, semEscala }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retro, medidoPorMes, mensal, chavesCards, chavesOverlay, escala, normaliza, mostraRec])

  // rótulo e formatação de cada linha, para legenda e tooltip
  const META: Record<string, { nome: string; fmt: (v: number) => string }> = useMemo(() => {
    const m: Record<string, { nome: string; fmt: (v: number) => string }> = {}
    for (const u of cardsAtivos) m[u.key] = { nome: u.legenda, fmt: v => fmtNaUnidade(u, v) }
    for (const k of overlayKeys) {
      const p = PREDITOR_POR_KEY[k]
      m[k] = { nome: p?.label ?? k, fmt: v => fmtValorPreditor(v, p?.formato ?? 'numero') }
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chavesCards, chavesOverlay])
  const chavesLinha = Object.keys(META).filter(k => !grafico.semEscala.includes(k))

  // Índice PF × IPCA: SÓ sobre o índice medido. A série reconstruída é feita
  // aplicando as variações dos itens do IPCA à cesta-âncora — compará-la com o
  // IPCA seria circular, e o resultado não significaria nada.
  const serieIpca = useMemo(() => {
    const ipca = new Map((series.ipca ?? []).map(p => [p.data.slice(0, 7), p.valor]))
    if (medidoPorMes.length < 2) return []
    const base = medidoPorMes[0]
    let acumIpca = 0, faltaIpca = false
    const linhas = medidoPorMes.map((p, i) => {
      if (i > 0) {
        const v = ipca.get(p.ym)
        if (v == null) faltaIpca = true
        else acumIpca = ((1 + acumIpca / 100) * (1 + v / 100) - 1) * 100
      }
      return { ym: p.ym, pf: r2((p.nivel / base.nivel - 1) * 100), ipca: faltaIpca ? null : r2(acumIpca) }
    })
    return linhas.filter(l => l.ipca != null).length >= 2 ? linhas : []
  }, [series.ipca, medidoPorMes])

  if (carregando) return <p className="max-w-6xl mx-auto px-6 py-10 text-sm text-dim">Carregando…</p>
  if (erro) return <p className="max-w-6xl mx-auto px-6 py-10 text-sm text-danger">Erro ao carregar: {erro}</p>

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div>
        <p className="text-sm font-medium">O PF como unidade de conta
          <InfoTip w="w-80" texto="Em vez de medir o PF em reais, mede-se o resto em PFs. A unidade é o custo de INSUMO do prato feito (ingredientes na quantidade da receita), não o preço de um PF servido em restaurante — não há mão de obra, gás, aluguel nem margem aqui. Aba fechada: nada desta página é publicado." /></p>
        <p className="text-xs text-dim mt-1">
          Unidade: custo de insumo do PF{dataColeta && <> · última coleta {dataColeta.split('-').reverse().join('/')}</>} · fonte blend
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={recorte} onChange={e => setRecorte(e.target.value)}
          className="text-sm border border-border rounded px-2 py-1.5 bg-transparent">
          <option value="nacional">Nacional</option>
          {regioes.map(r => <option key={r} value={`reg:${r}`}>{r}</option>)}
          {ev.pratos.map(p => <option key={p.id} value={`prato:${p.id}`}>{p.nome} ({p.regiao})</option>)}
        </select>
        <span className="text-sm text-dim">
          {rotuloRecorte}: {custoPF != null ? <strong className="text-ink">{brl(custoPF)}</strong> : 'sem custo apurado nesta coleta'}
        </span>
      </div>

      {custoPF == null && (
        <p className="text-sm text-dim border border-border rounded p-4">
          Este recorte não tem custo apurado na última coleta, então nenhuma conversão é possível. Nada é estimado no lugar.
        </p>
      )}

      <div>
        <p className="text-xs text-dim mb-2">Clique num card para pôr (ou tirar) a série dele no gráfico abaixo.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map(u => {
            const on = ativos.has(u.key)
            const cor = corDaLinha(Object.keys(META).indexOf(u.key))
            const conv = CONVERSORES.find(c => c.serie === u.key)
            return (
              <button key={u.key} type="button" aria-pressed={on}
                onClick={() => setAtivos(s => { const n = new Set(s); n.has(u.key) ? n.delete(u.key) : n.add(u.key); return n })}
                className={`text-left border rounded p-4 transition ${on ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/60'}`}>
                <p className="text-xs text-dim flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ background: on ? cor : 'var(--border-2)' }} />
                  {u.label}
                  {u.key === 'tempo' && (
                    <InfoTip w="w-80" texto="Renda média mensal habitual dividida pelas horas habitualmente trabalhadas na semana (PNAD Contínua trimestral, IBGE), convertida em quanto se trabalha para pagar um PF. É rendimento NOMINAL: a variável 'real' do IBGE vem deflacionada a preços do trimestre de referência e não divide um custo corrente." />
                  )}
                </p>
                {conv ? (() => {
                  const v = num?.conversores[conv.serie] ?? null
                  const q = converter(custoPF, v?.valor ?? null, conv.sentido)
                  return (
                    <>
                      <p className="text-lg mt-1">
                        {fmtQuantidade(q, conv.casas)} <span className="text-sm text-dim">{conv.unidade}</span>
                      </p>
                      <p className="text-xs text-dim mt-1">
                        {conv.sentido === 'pfs_por_unidade' ? 'compra este tanto de PFs' : '1 PF vale este tanto'}
                        {v ? ` · ${brl(v.valor)} em ${v.data.split('-').reverse().join('/')}` : ' · sem cotação'}
                      </p>
                    </>
                  )
                })() : (
                  <>
                    <p className="text-lg mt-1">{fmtTempo(minutos)}</p>
                    <p className="text-xs text-dim mt-1">
                      {pnad.renda && pnad.horas
                        ? <>{pnad.escopo} · {brl(pnad.renda.valor)}/mês em {pnad.horas.valor}h/sem · {fmtYM(pnad.renda.data.slice(0, 7))}
                          {pnad.caiuPraBrasil && ' · sem dado da região, usando Brasil'}</>
                        : 'sem renda ou horas publicadas'}
                    </p>
                  </>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="border-t border-border pt-6 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium">O PF em cada unidade, mês a mês
              <InfoTip w="w-80" texto="Sempre no recorte NACIONAL, mesmo quando os cards acima estão num recorte regional: a série reconstruída só existe no agregado do país. A linha tracejada NÃO é medição — é o backcast da cesta atual (docs/027), que projeta a cesta de hoje para trás com as variações dos itens do IPCA. Serve de contexto visual; nenhuma afirmação numérica sai dela. Séries diárias entram pela média do mês. A PNAD é trimestral: o valor do trimestre é o nível vigente nos três meses e segue vigente até o trimestre seguinte ser publicado (o IBGE leva ~2 meses depois de o trimestre fechar). Além de 8 meses do carimbo a fonte está parada e a linha para, em vez de virar reta até hoje." /></p>
            <p className="text-xs text-dim mt-1">
              {nLinhas === 0
                ? 'Nenhuma série ligada.'
                : normaliza
                  ? `${nLinhas} séries em escala comum — as unidades originais seguem no tooltip.`
                  : `Unidade original${mostraRec ? ' · com a série reconstruída de contexto' : ''}.`}
            </p>
          </div>
          {normaliza && (
            <div className="inline-flex border border-border rounded-md overflow-hidden bg-surface text-sm">
              {([['base100', 'base 100'], ['z', 'z-score']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setEscala(k)}
                  className={`px-3 py-1.5 transition-colors ${escala === k ? 'bg-accent text-white' : 'text-dim hover:text-ink'}`}>{label}</button>
              ))}
            </div>
          )}
        </div>

        <div className="border border-brand-roxo/30 bg-brand-roxo/5 rounded-lg p-3">
          <SeletorSeries titulo="Sobrepor variáveis da aba Índice" opcoes={PREDITORES}
            selecionadas={overlayVars}
            onToggle={k => setOverlayVars(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })}
            cor={k => corDaLinha(Object.keys(META).indexOf(k))} />
        </div>

        {grafico.semEscala.length > 0 && (
          <p className="text-xs text-dim">
            Fora do gráfico porque a escala não é definível na janela: {grafico.semEscala.map(k => META[k]?.nome ?? k).join(', ')}.
            {escala === 'z'
              ? ' Em z-score, série com um ponto só ou sem variação não tem desvio-padrão para dividir — desenhar 0,0σ diria "está na média", que é diferente de "não dá para saber".'
              : ' Em base 100, o primeiro valor da janela precisa existir e ser diferente de zero.'}
          </p>
        )}

        {nLinhas === 0 ? (
          <p className="text-sm text-dim">Ligue ao menos um card acima (ou uma variável do menu) para desenhar o gráfico.</p>
        ) : grafico.linhas.length < 2 ? (
          <p className="text-sm text-dim">Sem meses suficientes para desenhar a série.</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={grafico.linhas} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="ym" tickFormatter={fmtYM} fontSize={11} minTickGap={40} />
                <YAxis fontSize={11} width={64}
                  tickFormatter={v => normaliza
                    ? (escala === 'z' ? `${Number(v).toFixed(1)}σ` : `${Math.round(Number(v))}`)
                    : unidadeUnica ? fmtEixo(unidadeUnica, Number(v)) : `${v}`} />
                <Tooltip labelFormatter={l => fmtYM(String(l))}
                  formatter={(v: any, n: any, p: any) => {
                    const dk = String(p?.dataKey || '')
                    if (dk === 'rec') return [unidadeUnica ? fmtNaUnidade(unidadeUnica, Number(v)) : String(v), n]
                    const k = dk.slice(2)
                    const raw = p?.payload?.[`raw_${k}`]
                    return [raw == null ? '—' : META[k]?.fmt(Number(raw)) ?? String(raw), n]
                  }} />
                <Legend />
                {mostraRec && (
                  <Line type="monotone" dataKey="rec" name="Reconstruído (não medido)" stroke={COR.rec}
                    strokeDasharray="5 4" dot={false} connectNulls={false} />
                )}
                {chavesLinha.map(k => (
                  <Line key={k} type="monotone" dataKey={`v_${k}`} name={META[k]?.nome ?? k}
                    stroke={corDaLinha(Object.keys(META).indexOf(k))}
                    strokeDasharray={overlayKeys.includes(k) ? '4 3' : undefined}
                    dot={{ r: 2 }} connectNulls={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="border-t border-border pt-6">
        <p className="text-sm font-medium">Índice PF × IPCA
          <InfoTip w="w-80" texto="Variação acumulada desde o primeiro mês MEDIDO. A série reconstruída fica fora de propósito: ela é construída aplicando as variações dos itens do IPCA à cesta-âncora, então compará-la com o IPCA é circular e o resultado não significaria nada." /></p>
        <p className="text-xs text-dim mt-1">
          O Índice PF mede custo de insumo de 100 pratos regionais; o IPCA mede o gasto de uma cesta de consumo inteira.
          Movimentos diferentes são esperados e não indicam erro em nenhum dos dois. Não é medida de inflação.
        </p>
        {serieIpca.length === 0 ? (
          <p className="text-sm text-dim mt-3">
            Precisa de pelo menos dois meses medidos com IPCA publicado no mesmo mês. Hoje há {medidoPorMes.length} mês(es)
            medido(s) e o IPCA sai por volta do dia 11 do mês seguinte.
          </p>
        ) : (
          <div className="h-72 mt-3">
            <ResponsiveContainer>
              <LineChart data={serieIpca} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="ym" tickFormatter={fmtYM} fontSize={11} minTickGap={40} />
                <YAxis fontSize={11} tickFormatter={v => `${Number(v).toFixed(1)}%`} width={56} />
                <Tooltip labelFormatter={l => fmtYM(String(l))}
                  formatter={(v: any, n: any) => [`${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(2)}%`, n]} />
                <Legend />
                <Line type="monotone" dataKey="pf" name="Índice PF (medido)" stroke={COR.med} dot={{ r: 2 }} connectNulls={false} />
                <Line type="monotone" dataKey="ipca" name="IPCA acumulado" stroke={COR.ipca} dot={{ r: 2 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
