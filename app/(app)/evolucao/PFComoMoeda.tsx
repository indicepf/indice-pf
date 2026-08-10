'use client'

import { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import type { Evolucao } from '@/lib/queries'
import { mediana } from '@/lib/stats'
import { fetchAdmin } from '@/lib/fetch-admin'
import { brl } from '@/lib/format'
import { ACCENT, BRAND, DIM } from '@/lib/theme'
import { CONVERSORES, converter, minutosDeTrabalho, fmtQuantidade, fmtTempo, REGIOES_PNAD } from '@/lib/numerario'
import InfoTip from '../../InfoTip'

// "PF como moeda" (admin, docs/031): o PF usado como unidade de conta — quanto
// dele um salário mínimo compra, quanto ele vale em dólar/ouro, e quanto tempo
// de trabalho ele custa. Aba fechada: nada aqui vai para a área pública, e a
// série reconstruída aparece só como contexto visual rotulado (decisão D5).

const ORDEM_REG = ['Norte', 'Nordeste', 'Centro-oeste', 'Sudeste', 'Sul']
const COR = { med: ACCENT, rec: BRAND.ciano, ipca: DIM }
const fmtYM = (ym: string) => ym.split('-').reverse().join('/')
const r2 = (v: number) => Math.round(v * 100) / 100

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

  useEffect(() => {
    const ctrl = new AbortController()
    Promise.all([
      fetchAdmin('/api/numerario', { signal: ctrl.signal }).then(r => r.json()),
      fetchAdmin('/api/indice-retropolado?desde=2015-01&confianca=alta,media', { signal: ctrl.signal })
        .then(async r => { const j = await r.json().catch(() => null); return j?.serie ? j.serie : [] }),
      fetchAdmin('/api/preditores?vars=salario_minimo,ipca&de=2015-01-01', { signal: ctrl.signal }).then(r => r.json()),
    ]).then(([n, s, p]) => {
      if (ctrl.signal.aborted) return
      if (n?.error) { setErro(n.error); return }
      setNum(n); setRetro(s); setSeries(p ?? {})
    }).catch(e => { if (!ctrl.signal.aborted) setErro(String(e)) })
      .finally(() => { if (!ctrl.signal.aborted) setCarregando(false) })
    return () => ctrl.abort()
  }, [])

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

  // Quantos PFs um salário mínimo compra, mês a mês. A parte reconstruída é
  // contexto: vem do backcast da cesta atual, não de medição.
  const serieSalario = useMemo(() => {
    const sm = new Map((series.salario_minimo ?? []).map(p => [p.data.slice(0, 7), p.valor]))
    const rec = new Map(retro.map(p => [p.ym, p.indice]))
    const med = new Map(medidoPorMes.map(p => [p.ym, p.nivel]))
    const meses = [...new Set([...rec.keys(), ...med.keys()])].sort()
    return meses.map(ym => {
      const salario = sm.get(ym) ?? null
      return {
        ym,
        reconstruido: converter(rec.get(ym) ?? null, salario, 'pfs_por_unidade'),
        medido: converter(med.get(ym) ?? null, salario, 'pfs_por_unidade'),
      }
    }).filter(p => p.reconstruido != null || p.medido != null)
  }, [series.salario_minimo, retro, medidoPorMes])

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

      {custoPF == null ? (
        <p className="text-sm text-dim border border-border rounded p-4">
          Este recorte não tem custo apurado na última coleta, então nenhuma conversão é possível. Nada é estimado no lugar.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CONVERSORES.map(c => {
            const v = num?.conversores[c.serie] ?? null
            const q = converter(custoPF, v?.valor ?? null, c.sentido)
            return (
              <div key={c.serie} className="border border-border rounded p-4">
                <p className="text-xs text-dim">{c.label}</p>
                <p className="text-lg mt-1">
                  {fmtQuantidade(q, c.casas)} <span className="text-sm text-dim">{c.unidade}</span>
                </p>
                <p className="text-xs text-dim mt-1">
                  {c.sentido === 'pfs_por_unidade' ? 'compra este tanto de PFs' : '1 PF vale este tanto'}
                  {v ? ` · ${brl(v.valor)} em ${v.data.split('-').reverse().join('/')}` : ' · sem cotação'}
                </p>
              </div>
            )
          })}
          <div className="border border-border rounded p-4">
            <p className="text-xs text-dim">Tempo de trabalho
              <InfoTip w="w-80" texto="Renda média mensal habitual dividida pelas horas habitualmente trabalhadas na semana (PNAD Contínua trimestral, IBGE), convertida em quanto se trabalha para pagar um PF. É rendimento NOMINAL: a variável 'real' do IBGE vem deflacionada a preços do trimestre de referência e não divide um custo corrente." /></p>
            <p className="text-lg mt-1">{fmtTempo(minutos)}</p>
            <p className="text-xs text-dim mt-1">
              {pnad.renda && pnad.horas
                ? <>{pnad.escopo} · {brl(pnad.renda.valor)}/mês em {pnad.horas.valor}h/sem · {fmtYM(pnad.renda.data.slice(0, 7))}
                  {pnad.caiuPraBrasil && ' · sem dado da região, usando Brasil'}</>
                : 'sem renda ou horas publicadas'}
            </p>
          </div>
        </div>
      )}

      <div className="border-t border-border pt-6">
        <p className="text-sm font-medium">Quantos PFs um salário mínimo compra
          <InfoTip w="w-80" texto="Recorte nacional: a série reconstruída existe só no agregado do país. A linha tracejada NÃO é medição — é o backcast da cesta atual (docs/027), que projeta a cesta de hoje para trás com as variações dos itens do IPCA. Serve de contexto visual; nenhuma afirmação numérica sai dela." /></p>
        {serieSalario.length < 2 ? (
          <p className="text-sm text-dim mt-3">Sem meses suficientes para desenhar a série.</p>
        ) : (
          <div className="h-72 mt-3">
            <ResponsiveContainer>
              <LineChart data={serieSalario} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="ym" tickFormatter={fmtYM} fontSize={11} minTickGap={40} />
                <YAxis fontSize={11} tickFormatter={v => `${v} PFs`} width={64} />
                <Tooltip labelFormatter={l => fmtYM(String(l))}
                  formatter={(v: any, n: any) => [`${fmtQuantidade(Number(v), 0)} PFs`, n]} />
                <Legend />
                <Line type="monotone" dataKey="reconstruido" name="Reconstruído (não medido)" stroke={COR.rec}
                  strokeDasharray="5 4" dot={false} connectNulls={false} />
                <Line type="monotone" dataKey="medido" name="Medido" stroke={COR.med} dot={{ r: 2 }} connectNulls={false} />
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
