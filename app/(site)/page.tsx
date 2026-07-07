'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import DetalhePrato from '../DetalhePrato'
import { useAuth } from '../useAuth'
import { getDishCostsRange, getSnapshotsNovos, getAllDetalhes, getAllFontes, getAllFontesManuais, type FonteManual } from '@/lib/queries'
import { MODOS, REGIOES, brl, fmtData, limparNome } from '@/lib/format'
import { mediana } from '@/lib/stats'
import type { ModoKey, OrdemKey, Snapshot, DishCost, ItemDetalhe, Fonte } from '@/lib/types'

// mapa real do Brasil (d3/react-simple-maps) — só no cliente
const MapaBrasil = dynamic(() => import('../MapaBrasil'), {
  ssr: false,
  loading: () => <div className="w-full max-w-[360px] h-[300px] grid place-items-center text-dim text-sm">carregando mapa…</div>,
})

export default function Dashboard() {
  const { profile } = useAuth()
  const isAdmin = !!profile?.is_admin
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
      // mediana (mesma estatística do índice) para o valor da região bater com o índice filtrado
      return { regiao: r, media: mediana(arr) * fator, n: arr.length }
    })
  }, [custos, fator])

  // pratos do índice: filtrados pela(s) região(ões) selecionada(s) — o índice e a
  // contagem seguem o mesmo recorte da lista/mapa.
  const custosRegiao = useMemo(() => regioes.size ? custos.filter(c => regioes.has(c.pratos.regiao)) : custos, [custos, regioes])
  const indiceNacional = useMemo(
    () => mediana(custosRegiao.map(c => c.custo_total)) * fator,
    [custosRegiao, fator]
  )

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
      <main className="min-h-screen grid place-items-center text-dim">
        <p className="font-bold tracking-tight text-lg">Carregando o Índice PF…</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-12">
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center gap-8 sm:gap-12">
            <div className="sm:flex-1">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[0.7rem] uppercase tracking-[0.12em] text-dim">{regioes.size === 0 ? 'Índice nacional' : regioes.size === 1 ? `Índice — ${[...regioes][0]}` : `Índice — ${regioes.size} regiões`}</p>
                <ToggleModo modo={modo} setModo={setModo} />
              </div>
              <p className="font-bold tracking-tight text-5xl sm:text-6xl text-accent tnum mt-1">
                {brl(indiceNacional)}
              </p>
              {snapshot && <p className="text-xs text-faint mt-1.5">coleta de {fmtData(snapshot.data)}</p>}
              <p className="text-xs text-dim mt-2">mediana de {custosRegiao.length} pratos · {MODOS.find(m => m.key === modo)!.nota}</p>
              <p className="text-sm text-dim mt-4 max-w-sm leading-relaxed">
                A cor de cada região indica o custo mediano do prato feito ali. Clique numa região para destacá-la
                e filtrar os pratos; clique de novo ou use o filtro da lista para voltar.
              </p>
              {isAdmin && (
                <div className="mt-5 text-xs text-dim">
                  <p className="mb-1.5">Período do cálculo</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="inline-flex border border-border rounded-md overflow-hidden bg-surface">
                      {([['7d', 7], ['15d', 15], ['30d', 30], ['3m', 90], ['6m', 180], ['Tudo', 0]] as const).map(([label, d]) => (
                        <button key={label} onClick={() => presetHome(d)} className="px-2.5 py-1.5 text-dim hover:text-ink transition-colors">{label}</button>
                      ))}
                    </div>
                    <input type="date" value={ini} onChange={e => setIni(e.target.value)} className="bg-surface border border-border rounded px-2 py-1 focus:outline-none focus:border-accent" />
                    <span>até</span>
                    <input type="date" value={fim} onChange={e => setFim(e.target.value)} className="bg-surface border border-border rounded px-2 py-1 focus:outline-none focus:border-accent" />
                  </div>
                  {nColetasHome > 1 && <p className="mt-1.5">Índice = média de {nColetasHome} coletas do período.</p>}
                </div>
              )}
            </div>
            <MapaBrasil regionais={regionais} sel={regioes}
              onSel={(r) => setRegioes(prev => { const n = new Set(prev); n.has(r) ? n.delete(r) : n.add(r); return n })}
              onLimpar={() => setRegioes(new Set())} />
          </div>
        </section>

        <section>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <h2 className="font-bold tracking-tight text-xl mr-auto">Pratos</h2>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar prato…"
              className="bg-surface border border-border rounded-md px-3 py-1.5 text-sm w-full sm:w-48 focus:outline-none focus:border-accent" />
            <select value={regioes.size === 1 ? [...regioes][0] : ''} onChange={e => setRegioes(e.target.value ? new Set([e.target.value]) : new Set())}
              className="bg-surface border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none cursor-pointer">
              <option value="">{regioes.size > 1 ? `${regioes.size} regiões` : 'Todas as regiões'}</option>
              {REGIOES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={ordem} onChange={e => setOrdem(e.target.value as OrdemKey)}
              className="bg-surface border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none cursor-pointer">
              <option value="custo">Por custo</option>
              <option value="nome">Por nome</option>
              <option value="regiao">Por região</option>
            </select>
          </div>

          <div className="border border-border rounded-md overflow-hidden bg-surface">
            <table className="w-full text-[0.95rem]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-dim border-b border-border">
                  <th className="font-medium px-4 py-3">Prato</th>
                  <th className="font-medium px-4 py-3 hidden sm:table-cell">Região</th>
                  <th className="font-medium px-4 py-3 text-right">Custo</th>
                  <th className="font-medium px-4 py-3 text-right hidden sm:table-cell">Cobertura</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(c => (
                  <tr key={c.pratos.id} onClick={() => setSelecionado(c)}
                    className="border-b border-border/70 last:border-0 hover:bg-surface-2 cursor-pointer transition-colors">
                    <td className="px-4 py-3">{limparNome(c.pratos.nome)}</td>
                    <td className="px-4 py-3 text-dim hidden sm:table-cell">{c.pratos.regiao}</td>
                    <td className="px-4 py-3 text-right font-medium tnum">{brl(c.custo_total * fator)}</td>
                    <td className="px-4 py-3 text-right text-dim tnum hidden sm:table-cell">
                      {c.ingredientes_cobertos}/{c.ingredientes_total}
                    </td>
                  </tr>
                ))}
                {!lista.length && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-dim">Nenhum prato encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-dim mt-3">
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

    </main>
  )
}

function ToggleModo({ modo, setModo }: { modo: ModoKey; setModo: (m: ModoKey) => void }) {
  return (
    <div className="inline-flex border border-border rounded-md overflow-hidden bg-surface text-sm">
      {MODOS.map(m => (
        <button key={m.key} onClick={() => setModo(m.key)}
          className={`px-3 py-1.5 transition-colors ${modo === m.key ? 'bg-accent text-white' : 'text-dim hover:bg-surface-2'}`}>
          {m.label}
        </button>
      ))}
    </div>
  )
}
