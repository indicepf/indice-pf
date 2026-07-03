'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import AuthControls from './Auth'
import DetalhePrato from './DetalhePrato'
import { getDishCostsRange, getSnapshotsNovos, getAllDetalhes, getAllFontes, getAllFontesManuais, type FonteManual } from '@/lib/queries'
import { MODOS, REGIOES, brl, fmtData, limparNome } from '@/lib/format'
import type { ModoKey, OrdemKey, Snapshot, DishCost, ItemDetalhe, Fonte } from '@/lib/types'

// mapa real do Brasil (d3/react-simple-maps) — só no cliente
const MapaBrasil = dynamic(() => import('./MapaBrasil'), {
  ssr: false,
  loading: () => <div className="w-full max-w-[360px] h-[300px] grid place-items-center text-muted text-sm">carregando mapa…</div>,
})

export default function Dashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [custos, setCustos]     = useState<DishCost[]>([])
  const [loading, setLoading]   = useState(true)
  const [snapsNovos, setSnapsNovos] = useState<{ id: number; data: string }[]>([])
  const [ini, setIni] = useState(''); const [fim, setFim] = useState('')   // período (vazio = última coleta)

  const [modo, setModo]         = useState<ModoKey>('online')
  const [regioes, setRegioes]   = useState<Set<string>>(new Set())   // vazio = todas
  const [busca, setBusca]       = useState('')
  const [ordem, setOrdem]       = useState<OrdemKey>('custo')
  const [selecionado, setSelecionado] = useState<DishCost | null>(null)
  const [detalhes, setDetalhes] = useState<Record<number, ItemDetalhe[]> | null>(null)
  const [fontes, setFontes]     = useState<Record<number, Fonte[]>>({})
  const [fontesManuais, setFontesManuais] = useState<Record<number, FonteManual[]>>({})

  useEffect(() => { getSnapshotsNovos().then(setSnapsNovos) }, [])
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
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapsNovos, ini, fim])
  const nColetasHome = (!ini && !fim) ? 1 : snapsNovos.filter(s => (!ini || s.data >= ini) && (!fim || s.data <= fim)).length
  function presetHome(dias: number) {
    if (!snapsNovos.length) return
    if (dias === 0) { setIni(snapsNovos[snapsNovos.length - 1].data); setFim(snapsNovos[0].data) }   // Tudo = da 1ª à última
    else { setFim(snapsNovos[0].data); const d = new Date(snapsNovos[0].data + 'T00:00:00Z'); d.setDate(d.getDate() - dias); setIni(d.toISOString().slice(0, 10)) }
  }

  const fator = 1 - MODOS.find(m => m.key === modo)!.desc

  const regionais = useMemo(() => {
    const acc: Record<string, number[]> = {}
    custos.forEach(c => { (acc[c.pratos.regiao] ||= []).push(c.custo_total) })
    return REGIOES.map(r => {
      const arr = acc[r] || []
      const media = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
      return { regiao: r, media: media * fator, n: arr.length }
    })
  }, [custos, fator])

  const indiceNacional = useMemo(() => {
    if (!custos.length) return 0
    const v = custos.map(c => c.custo_total).sort((a, b) => a - b)
    const meio = Math.floor(v.length / 2)
    const mediana = v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2
    return mediana * fator
  }, [custos, fator])

  const lista = useMemo(() => {
    let l = custos
    if (regioes.size) l = l.filter(c => regioes.has(c.pratos.regiao))
    if (busca.trim()) {
      const q = busca.toLowerCase()
      l = l.filter(c => c.pratos.nome.toLowerCase().includes(q))
    }
    return [...l].sort((a, b) => {
      if (ordem === 'custo') return a.custo_total - b.custo_total
      if (ordem === 'nome')  return a.pratos.nome.localeCompare(b.pratos.nome)
      return a.pratos.regiao.localeCompare(b.pratos.regiao) || a.custo_total - b.custo_total
    })
  }, [custos, regioes, busca, ordem])

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center text-muted">
        <p className="font-[family-name:var(--font-serif)] text-lg">Carregando o Índice PF…</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-cream/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--font-serif)] text-2xl leading-none">Índice PF</h1>
            <p className="text-xs text-muted mt-1">
              custo do prato feito no Brasil{snapshot ? ` · coleta de ${fmtData(snapshot.data)}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <a href="/evolucao" className="text-sm text-muted hover:text-ink">Histórico</a>
            <ToggleModo modo={modo} setModo={setModo} />
            <AuthControls />
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-12">
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center gap-8 sm:gap-12">
            <div className="sm:flex-1">
              <p className="text-[0.7rem] uppercase tracking-[0.12em] text-muted">Índice nacional</p>
              <p className="font-[family-name:var(--font-serif)] text-5xl sm:text-6xl text-paprika tnum mt-1">
                {brl(indiceNacional)}
              </p>
              <p className="text-xs text-muted mt-2">mediana de {custos.length} pratos · {MODOS.find(m => m.key === modo)!.nota}</p>
              <p className="text-sm text-muted mt-4 max-w-sm leading-relaxed">
                A cor de cada região indica o custo médio do prato feito ali. Clique numa região para destacá-la
                e filtrar os pratos; clique de novo ou use o filtro da lista para voltar.
              </p>
              <div className="mt-5 text-xs text-muted">
                <p className="mb-1.5">Período do cálculo</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="inline-flex border border-line rounded-md overflow-hidden bg-panel">
                    {([['30d', 30], ['3m', 90], ['6m', 180], ['Tudo', 0]] as const).map(([label, d]) => (
                      <button key={label} onClick={() => presetHome(d)} className="px-2.5 py-1.5 text-muted hover:text-ink transition-colors">{label}</button>
                    ))}
                  </div>
                  <input type="date" value={ini} onChange={e => setIni(e.target.value)} className="bg-panel border border-line rounded px-2 py-1 focus:outline-none focus:border-paprika" />
                  <span>até</span>
                  <input type="date" value={fim} onChange={e => setFim(e.target.value)} className="bg-panel border border-line rounded px-2 py-1 focus:outline-none focus:border-paprika" />
                </div>
                {nColetasHome > 1 && <p className="mt-1.5">Índice = média de {nColetasHome} coletas do período.</p>}
              </div>
            </div>
            <MapaBrasil regionais={regionais} sel={regioes}
              onSel={(r) => setRegioes(prev => { const n = new Set(prev); n.has(r) ? n.delete(r) : n.add(r); return n })}
              onLimpar={() => setRegioes(new Set())} />
          </div>
        </section>

        <section>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <h2 className="font-[family-name:var(--font-serif)] text-xl mr-auto">Pratos</h2>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar prato…"
              className="bg-panel border border-line rounded-md px-3 py-1.5 text-sm w-full sm:w-48 focus:outline-none focus:border-paprika" />
            <select value={regioes.size === 1 ? [...regioes][0] : ''} onChange={e => setRegioes(e.target.value ? new Set([e.target.value]) : new Set())}
              className="bg-panel border border-line rounded-md px-3 py-1.5 text-sm focus:outline-none cursor-pointer">
              <option value="">{regioes.size > 1 ? `${regioes.size} regiões` : 'Todas as regiões'}</option>
              {REGIOES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={ordem} onChange={e => setOrdem(e.target.value as OrdemKey)}
              className="bg-panel border border-line rounded-md px-3 py-1.5 text-sm focus:outline-none cursor-pointer">
              <option value="custo">Por custo</option>
              <option value="nome">Por nome</option>
              <option value="regiao">Por região</option>
            </select>
          </div>

          <div className="border border-line rounded-md overflow-hidden bg-panel">
            <table className="w-full text-[0.95rem]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted border-b border-line">
                  <th className="font-medium px-4 py-3">Prato</th>
                  <th className="font-medium px-4 py-3 hidden sm:table-cell">Região</th>
                  <th className="font-medium px-4 py-3 text-right">Custo</th>
                  <th className="font-medium px-4 py-3 text-right hidden sm:table-cell">Cobertura</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(c => (
                  <tr key={c.pratos.id} onClick={() => setSelecionado(c)}
                    className="border-b border-line/70 last:border-0 hover:bg-cream cursor-pointer transition-colors">
                    <td className="px-4 py-3">{limparNome(c.pratos.nome)}</td>
                    <td className="px-4 py-3 text-muted hidden sm:table-cell">{c.pratos.regiao}</td>
                    <td className="px-4 py-3 text-right font-medium tnum">{brl(c.custo_total * fator)}</td>
                    <td className="px-4 py-3 text-right text-muted tnum hidden sm:table-cell">
                      {c.ingredientes_cobertos}/{c.ingredientes_total}
                    </td>
                  </tr>
                ))}
                {!lista.length && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">Nenhum prato encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted mt-3">
            Os preços de Mercado e Atacarejo são estimativas sobre o preço online; serão calibrados com dados de campo.
          </p>
        </section>
      </div>

      {selecionado && snapshot && (
        <DetalhePrato dish={selecionado}
          itens={detalhes ? (detalhes[selecionado.pratos.id] ?? []) : null}
          fontesPorIngrediente={fontes} manuaisPorIngrediente={fontesManuais} fator={fator}
          dataColeta={snapshot.data}
          onClose={() => setSelecionado(null)} />
      )}

      <footer className="border-t border-line mt-8">
        <div className="max-w-5xl mx-auto px-6 py-4 text-xs text-muted flex justify-between">
          <span>Índice PF · dados coletados no varejo online</span>
          <span>{snapshot ? fmtData(snapshot.data) : ''}</span>
        </div>
      </footer>
    </main>
  )
}

function ToggleModo({ modo, setModo }: { modo: ModoKey; setModo: (m: ModoKey) => void }) {
  return (
    <div className="inline-flex border border-line rounded-md overflow-hidden bg-panel text-sm">
      {MODOS.map(m => (
        <button key={m.key} onClick={() => setModo(m.key)}
          className={`px-3 py-1.5 transition-colors ${modo === m.key ? 'bg-paprika text-white' : 'text-muted hover:bg-cream'}`}>
          {m.label}
        </button>
      ))}
    </div>
  )
}
