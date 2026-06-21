'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import AuthControls from './Auth'

// mapa real do Brasil (d3/react-simple-maps) — só no cliente
const MapaBrasil = dynamic(() => import('./MapaBrasil'), {
  ssr: false,
  loading: () => <div className="w-full max-w-[360px] h-[300px] grid place-items-center text-muted text-sm">carregando mapa…</div>,
})

// ─── Constantes ───────────────────────────────────────────────────────────────
const MODOS = [
  { key: 'online',    label: 'Online',    desc: 0.00, nota: 'preço coletado no varejo online' },
  { key: 'mercado',   label: 'Mercado',   desc: 0.10, nota: 'estimativa −10% sobre o online' },
  { key: 'atacarejo', label: 'Atacarejo', desc: 0.22, nota: 'estimativa −22% sobre o online' },
] as const
type ModoKey = typeof MODOS[number]['key']

const REGIOES = ['Sul', 'Sudeste', 'Centro-oeste', 'Nordeste', 'Norte'] as const
type OrdemKey = 'custo' | 'nome' | 'regiao'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ─── Tipos ────────────────────────────────────────────────────────────────────
type DishCost = {
  custo_total: number
  ingredientes_cobertos: number
  ingredientes_estimados: number | null
  ingredientes_total: number
  pratos: { id: number; regiao: string; nome: string }
}
type Snapshot = { id: number; data: string; custo_total_pf: number | null }

type ItemDetalhe = {
  ingrediente_id: number
  nome: string
  categoria: string | null
  qtd_g: number
  preco_g: number | null     // R$/g já normalizado
  origem: 'online' | 'manual' | 'fixo' | 'sem'
  custo: number
}
type Fonte = { titulo: string; loja: string; preco_bruto: number; exibicao: string; link: string }

// ─── Componente raiz ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [custos, setCustos]     = useState<DishCost[]>([])
  const [loading, setLoading]   = useState(true)

  const [modo, setModo]         = useState<ModoKey>('online')
  const [regiao, setRegiao]     = useState<string>('Todas')
  const [busca, setBusca]       = useState('')
  const [ordem, setOrdem]       = useState<OrdemKey>('custo')

  const [selecionado, setSelecionado] = useState<DishCost | null>(null)

  // carga inicial
  useEffect(() => {
    (async () => {
      const { data: snaps } = await supabase
        .from('snapshots').select('id,data,custo_total_pf')
        .order('data', { ascending: false }).limit(1)
      const snap = snaps?.[0] as Snapshot | undefined
      if (!snap) { setLoading(false); return }
      setSnapshot(snap)

      const { data: cp } = await supabase
        .from('custos_pratos')
        .select('custo_total,ingredientes_cobertos,ingredientes_estimados,ingredientes_total,pratos(id,regiao,nome)')
        .eq('snapshot_id', snap.id)
      setCustos((cp as unknown as DishCost[]) || [])
      setLoading(false)
    })()
  }, [])

  const fator = 1 - MODOS.find(m => m.key === modo)!.desc

  // médias regionais + índice nacional (média dos pratos), já ajustados pelo modo
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
    const v = [...custos].map(c => c.custo_total).sort((a, b) => a - b)
    const meio = Math.floor(v.length / 2)
    const mediana = v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2
    return mediana * fator
  }, [custos, fator])

  const lista = useMemo(() => {
    let l = custos
    if (regiao !== 'Todas') l = l.filter(c => c.pratos.regiao === regiao)
    if (busca.trim()) {
      const q = busca.toLowerCase()
      l = l.filter(c => c.pratos.nome.toLowerCase().includes(q))
    }
    return [...l].sort((a, b) => {
      if (ordem === 'custo') return a.custo_total - b.custo_total
      if (ordem === 'nome')  return a.pratos.nome.localeCompare(b.pratos.nome)
      return a.pratos.regiao.localeCompare(b.pratos.regiao) || a.custo_total - b.custo_total
    })
  }, [custos, regiao, busca, ordem])

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center text-muted">
        <p className="font-[family-name:var(--font-serif)] text-lg">Carregando o Índice PF…</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen">
      {/* Cabeçalho */}
      <header className="border-b border-line bg-cream/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--font-serif)] text-2xl leading-none">Índice PF</h1>
            <p className="text-xs text-muted mt-1">
              custo do prato feito no Brasil{snapshot ? ` · coleta de ${fmtData(snapshot.data)}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <ToggleModo modo={modo} setModo={setModo} />
            <AuthControls />
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-12">
        {/* Índice nacional + regiões */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center gap-8 sm:gap-12">
            <div className="sm:flex-1">
              <p className="text-[0.7rem] uppercase tracking-[0.12em] text-muted">Índice nacional</p>
              <p className="font-[family-name:var(--font-serif)] text-5xl sm:text-6xl text-paprika tnum mt-1">
                {brl(indiceNacional)}
              </p>
              <p className="text-xs text-muted mt-2">mediana de {custos.length} pratos · {MODOS.find(m => m.key === modo)!.nota}</p>
              <p className="text-sm text-muted mt-4 max-w-sm leading-relaxed">
                A cor de cada região indica o custo médio do prato feito ali. Clique numa região para filtrar
                os pratos (e dar zoom); clique de novo ou use o filtro da lista para voltar.
              </p>
            </div>
            <MapaBrasil regionais={regionais} sel={regiao}
              onSel={(r) => setRegiao(prev => (prev === r ? 'Todas' : r))} />
          </div>
        </section>

        {/* Explorador */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <h2 className="font-[family-name:var(--font-serif)] text-xl mr-auto">Pratos</h2>
            <input
              value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar prato…"
              className="bg-panel border border-line rounded-md px-3 py-1.5 text-sm w-full sm:w-48 focus:outline-none focus:border-paprika"
            />
            <select value={regiao} onChange={e => setRegiao(e.target.value)}
              className="bg-panel border border-line rounded-md px-3 py-1.5 text-sm focus:outline-none cursor-pointer">
              <option value="Todas">Todas as regiões</option>
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
                  <tr key={c.pratos.id}
                    onClick={() => setSelecionado(c)}
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
        <DetalhePrato dish={selecionado} snapshotId={snapshot.id} fator={fator}
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

// ─── Toggle dos 3 preços ──────────────────────────────────────────────────────
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

// ─── Painel de detalhe do prato ───────────────────────────────────────────────
function DetalhePrato({ dish, snapshotId, fator, onClose }: {
  dish: DishCost; snapshotId: number; fator: number; onClose: () => void
}) {
  const [itens, setItens] = useState<ItemDetalhe[] | null>(null)
  const [fonteAberta, setFonteAberta] = useState<{ nome: string; id: number } | null>(null)

  useEffect(() => {
    (async () => {
      const [{ data: rec }, { data: precos }] = await Promise.all([
        supabase.from('receitas')
          .select('qtd_g,ingrediente_id,ingredientes(nome,categoria,custo_fixo,preco_manual)')
          .eq('prato_id', dish.pratos.id),
        supabase.from('precos')
          .select('ingrediente_id,mediana_normalizada')
          .eq('snapshot_id', snapshotId),
      ])
      const precoMap: Record<number, number> = {}
      ;(precos || []).forEach((p: any) => { if (p.mediana_normalizada != null) precoMap[p.ingrediente_id] = Number(p.mediana_normalizada) })

      const out: ItemDetalhe[] = (rec || []).map((r: any) => {
        const ing = r.ingredientes
        const qtd = Number(r.qtd_g)
        let preco_g: number | null = null, origem: ItemDetalhe['origem'] = 'sem', custo = 0
        if (ing.custo_fixo != null)        { origem = 'fixo';   custo = Number(ing.custo_fixo) }
        else if (ing.preco_manual != null) { origem = 'manual'; preco_g = Number(ing.preco_manual) / 1000; custo = preco_g * qtd }
        else if (precoMap[r.ingrediente_id] != null) { origem = 'online'; preco_g = precoMap[r.ingrediente_id]; custo = preco_g * qtd }
        return { ingrediente_id: r.ingrediente_id, nome: ing.nome, categoria: ing.categoria, qtd_g: qtd, preco_g, origem, custo }
      }).sort((a, b) => b.custo - a.custo)
      setItens(out)
    })()
  }, [dish, snapshotId])

  const total = (itens || []).reduce((s, i) => s + i.custo, 0) * fator

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/20" />
      <aside onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md bg-cream h-full overflow-y-auto border-l border-line shadow-xl">
        <div className="sticky top-0 bg-cream border-b border-line px-6 py-4 flex justify-between items-start">
          <div>
            <p className="text-[0.7rem] uppercase tracking-wide text-muted">{dish.pratos.regiao}</p>
            <h3 className="font-[family-name:var(--font-serif)] text-xl leading-tight mt-0.5">{limparNome(dish.pratos.nome)}</h3>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-2xl leading-none">×</button>
        </div>

        <div className="px-6 py-5">
          <div className="flex items-baseline justify-between mb-5">
            <span className="text-sm text-muted">Custo do prato</span>
            <span className="font-[family-name:var(--font-serif)] text-3xl text-paprika tnum">{brl(total)}</span>
          </div>

          {!itens ? (
            <p className="text-sm text-muted">Carregando composição…</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[0.65rem] uppercase tracking-wide text-muted border-b border-line">
                  <th className="font-medium py-2">Ingrediente</th>
                  <th className="font-medium py-2 text-right">Qtd</th>
                  <th className="font-medium py-2 text-right">Custo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {itens.map(i => (
                  <tr key={i.ingrediente_id} className="border-b border-line/60">
                    <td className="py-2">
                      {i.nome}
                      {i.origem === 'manual' && <Etiqueta texto="manual" />}
                      {i.origem === 'fixo' && <Etiqueta texto="fixo" />}
                      {i.origem === 'sem' && <Etiqueta texto="sem preço" />}
                    </td>
                    <td className="py-2 text-right text-muted tnum">{i.qtd_g} g</td>
                    <td className="py-2 text-right tnum">{brl(i.custo * fator)}</td>
                    <td className="py-2 text-right">
                      {i.origem === 'online' && (
                        <button onClick={() => setFonteAberta({ nome: i.nome, id: i.ingrediente_id })}
                          className="text-xs text-paprika hover:underline">fontes</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </aside>

      {fonteAberta && (
        <ModalFontes nome={fonteAberta.nome} ingredienteId={fonteAberta.id} snapshotId={snapshotId}
          onClose={() => setFonteAberta(null)} />
      )}
    </div>
  )
}

function Etiqueta({ texto }: { texto: string }) {
  return <span className="ml-1.5 text-[0.6rem] uppercase tracking-wide text-muted border border-line rounded px-1 py-px align-middle">{texto}</span>
}

// ─── Modal de fontes (produtos reais coletados) ───────────────────────────────
function ModalFontes({ nome, ingredienteId, snapshotId, onClose }: {
  nome: string; ingredienteId: number; snapshotId: number; onClose: () => void
}) {
  const [fontes, setFontes] = useState<Fonte[] | null>(null)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('resultados_brutos')
        .select('titulo,loja,preco_bruto,exibicao,link')
        .eq('ingrediente_id', ingredienteId).eq('snapshot_id', snapshotId)
        .order('preco_bruto', { ascending: true })
      setFontes((data as Fonte[]) || [])
    })()
  }, [ingredienteId, snapshotId])
  const esc = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }, [onClose])
  useEffect(() => { document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc) }, [esc])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 px-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-panel border border-line rounded-lg max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-xl">
        <div className="flex justify-between items-center px-5 py-4 border-b border-line sticky top-0 bg-panel">
          <h4 className="font-[family-name:var(--font-serif)] text-lg">Fontes — {nome}</h4>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">×</button>
        </div>
        <div className="p-4 space-y-2">
          {!fontes ? <p className="text-sm text-muted">Carregando…</p> :
            fontes.length ? fontes.map((f, i) => (
              <a key={i} href={f.link || undefined} target="_blank" rel="noopener noreferrer"
                className="block border border-line rounded-md px-3 py-2.5 hover:border-paprika transition-colors">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{f.titulo}</p>
                    <p className="text-xs text-muted">{f.loja}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium tnum text-paprika">{brl(Number(f.preco_bruto))}</p>
                    <p className="text-xs text-muted">{f.exibicao}</p>
                  </div>
                </div>
              </a>
            )) : <p className="text-sm text-muted">Sem fontes registradas.</p>}
        </div>
      </div>
    </div>
  )
}

// ─── Utilidades ───────────────────────────────────────────────────────────────
function fmtData(d: string) {
  const [a, m, dia] = d.split('-')
  return `${dia}/${m}/${a}`
}
// remove o "12. " do início do nome do prato
function limparNome(nome: string) {
  return nome.replace(/^\d+\.\s*/, '')
}
