'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, limparSessaoLocal, usuarioDoStorage } from '@/lib/supabase'
import {
  isAdmin, isSuper, getContribuicoes, getIngredientes, moderarContribuicao, aprovarContribuicao, getSaques, marcarSaquePago,
  getIngredientesManuais, setPrecoManual, limparPrecoManual, recalcularCustos, getHistoricoManual,
  getOrigensManuais, getContribuicoesAprovadas, editarContribuicaoAprovada, getTodosSaques,
  superExcluir, superEditarSaque,
  type IngManual, type PrecoManualHist,
} from '@/lib/queries'
import { brl, mascararCpf, unidadeCurta, VALOR_POR_FOTO } from '@/lib/format'
import { capturarContexto, resumoDispositivo } from '@/lib/contexto'
import type { ContribuicaoFull, Ing } from '@/lib/types'
import Painel from './Painel'
import Auditoria from './Auditoria'
import SuperAcoes from './SuperAcoes'

type Saque = { id: number; user_id: string; valor: number; cpf: string | null; chave_pix: string | null; status: string; criado_em: string; pago_em?: string | null; nome: string | null; telefone: string | null; aprovador?: string | null; pago_dispositivo?: string | null }
const SAQUE_ST: Record<string, { txt: string; cls: string }> = {
  pago:      { txt: 'pago',      cls: 'text-olive border-olive/30 bg-olive/5' },
  rejeitada: { txt: 'rejeitado', cls: 'text-red-600 border-red-200 bg-red-50' },
}

export default function AdminPage() {
  const router = useRouter()
  const [estado, setEstado] = useState<'carregando' | 'negado' | 'ok'>('carregando')
  const [aba, setAba] = useState<'mod' | 'aprovadas' | 'painel' | 'saques' | 'precos' | 'auditoria' | 'super'>('mod')
  const [souSuper, setSouSuper] = useState(false)
  const [itens, setItens] = useState<ContribuicaoFull[]>([])
  const [aprovadas, setAprovadas] = useState<ContribuicaoFull[]>([])
  const [aprLoaded, setAprLoaded] = useState(false); const [aprBusy, setAprBusy] = useState(false); const [aprTotal, setAprTotal] = useState(0)
  const [aprDesde, setAprDesde] = useState(''); const [aprPrecoMin, setAprPrecoMin] = useState(''); const [aprBusca, setAprBusca] = useState('')
  const [aprDirty, setAprDirty] = useState(false); const [aprMsg, setAprMsg] = useState(''); const [salvandoId, setSalvandoId] = useState<number | null>(null)
  const [ings, setIngs] = useState<Ing[]>([])
  const [saques, setSaques] = useState<Saque[]>([])
  const [histSaques, setHistSaques] = useState<Saque[] | null>(null)
  const [editSaque, setEditSaque] = useState<Saque | null>(null)
  const [manuais, setManuais] = useState<IngManual[]>([])
  const [addId, setAddId] = useState(''); const [addPreco, setAddPreco] = useState('')
  const [addFixo, setAddFixo] = useState(''); const [addLoja, setAddLoja] = useState(''); const [addLink, setAddLink] = useState('')
  const [precoMsg, setPrecoMsg] = useState(''); const [recalcBusy, setRecalcBusy] = useState(false)
  const [hist, setHist] = useState<Record<number, PrecoManualHist[]>>({})
  const [leituras, setLeituras] = useState<Record<number, string>>({})
  const [origens, setOrigens] = useState<Record<number, { net: boolean; campo: boolean }>>({})
  const [buscaPreco, setBuscaPreco] = useState('')
  const [filtroOrigem, setFiltroOrigem] = useState<'todos' | 'net' | 'campo'>('todos')
  const [visiveisPrecos, setVisiveisPrecos] = useState(20)
  const [addAberto, setAddAberto] = useState(false)

  const [uid, setUid] = useState<string | null | undefined>(undefined)

  // gate de auth: lê o usuário do storage (síncrono, sem lock) p/ renderizar na
  // hora e reconcilia com a auth real em segundo plano (login/logout)
  useEffect(() => {
    const u = usuarioDoStorage()                 // instantâneo (sem lock) → renderiza já
    if (u) setUid(u.id)
    let resolvido = !!u
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      resolvido = true
      setUid(session?.user?.id ?? null)
    })
    // salvaguarda: se a auth não resolver (token quebrado segurando o lock),
    // limpa a sessão e trata como deslogado em vez de congelar a tela
    const t = setTimeout(() => { if (!resolvido) { limparSessaoLocal(); setUid(null) } }, 4000)
    return () => { subscription.unsubscribe(); clearTimeout(t) }
  }, [])

  // carrega os dados FORA do callback de auth (chamar supabase lá dentro deadlocka)
  useEffect(() => {
    if (uid === undefined) return
    if (uid === null) { router.replace('/'); return }
    let cancelado = false
    ;(async () => {
      const [adminOk, superOk] = await Promise.all([isAdmin(uid), isSuper(uid)])
      if (!adminOk && !superOk) { if (!cancelado) setEstado('negado'); return }
      if (!cancelado) setSouSuper(superOk)
      const [ings, itens, saques, manuais, origens] = await Promise.all([
        getIngredientes(), getContribuicoes('pendente'), getSaques('solicitado'),
        getIngredientesManuais(), getOrigensManuais(),
      ])
      if (cancelado) return
      setIngs(ings); setItens(itens); setSaques(saques); setManuais(manuais); setOrigens(origens)
      setEstado('ok')
    })()
    return () => { cancelado = true }
  }, [uid, router])

  // carrega a esteira de aprovadas ao entrar na aba (1ª vez)
  useEffect(() => {
    if (aba === 'aprovadas' && estado === 'ok' && !aprLoaded && !aprBusy) carregarAprovadas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, estado])

  // mais=true → anexa a próxima página; senão recarrega do zero (novo filtro)
  async function carregarAprovadas(mais = false) {
    setAprBusy(true); setAprMsg('')
    const b = aprBusca.trim().toLowerCase()
    const ingIds = b ? ings.filter(i => i.nome.toLowerCase().includes(b)).map(i => i.id) : undefined
    const { rows, total } = await getContribuicoesAprovadas({
      desde: aprDesde ? new Date(aprDesde + 'T00:00:00').toISOString() : undefined,
      precoMin: aprPrecoMin.trim() ? Number(aprPrecoMin.replace(',', '.')) : undefined,
      busca: aprBusca, ingIds, offset: mais ? aprovadas.length : 0,
    })
    setAprovadas(prev => mais ? [...prev, ...rows] : rows)
    setAprTotal(total); setAprLoaded(true); setAprBusy(false)
  }
  function patchApr(id: number, campo: keyof ContribuicaoFull, valor: any) {
    setAprovadas(prev => prev.map(i => i.id === id ? { ...i, [campo]: valor } : i))
  }
  // R$/kg que a leitura terá — o índice usa R$/kg, então é aqui que o "799" aparece
  function rsPorKg(c: ContribuicaoFull): number | null {
    const ing = ings.find(i => i.id === c.ingrediente_id)
    if (!ing || !c.preco || !c.peso_g || c.preco <= 0 || c.peso_g <= 0) return null
    const gramas = (ing.unidade === 'unidade' || ing.unidade === 'maco') ? c.peso_g * (ing.peso_ref_g || 0) : c.peso_g
    if (!gramas || gramas <= 0) return null
    return c.preco / gramas * 1000
  }
  async function salvarAprovada(c: ContribuicaoFull) {
    setSalvandoId(c.id); setAprMsg('')
    const { error } = await editarContribuicaoAprovada(c.id, {
      ingrediente_id: c.ingrediente_id, preco: c.preco, peso_g: c.peso_g,
      marca: c.marca, mercado: c.mercado, tipo_loja: c.tipo_loja, produto: c.produto,
    })
    setSalvandoId(null)
    if (error) { setAprMsg(`Erro ao salvar #${c.id}: ${error.message}`); return }
    setAprDirty(true)
    setAprMsg(`Contribuição #${c.id} atualizada. Clique em “Recalcular custos” para refletir no índice.`)
  }
  async function recalcularApr() {
    setAprBusy(true); setAprMsg('')
    const { error } = await recalcularCustos()
    setAprBusy(false); setAprDirty(false)
    setAprMsg(error ? `Erro ao recalcular: ${error.message}` : 'Custos do índice recalculados.')
  }

  // histórico de saques carrega ao abrir a aba (1ª vez)
  useEffect(() => {
    if (aba === 'saques' && estado === 'ok' && histSaques === null) getTodosSaques().then(setHistSaques)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, estado])

  // exclusão god-mode: confirma, captura contexto, exclui via RPC (que registra
  // em "Ações do super") e, no sucesso, roda onOk para tirar a linha da tela.
  async function excluirSuper(tabela: string, id: number | string, onOk: () => void) {
    if (!confirm('Excluir DEFINITIVAMENTE este registro? A ação é irreversível e fica registrada em "Ações do super".')) return
    const ctx = await capturarContexto()
    const { error } = await superExcluir(tabela, id, ctx)
    if (error) { alert('Erro ao excluir: ' + error.message); return }
    onOk()
  }

  async function salvarSaqueSuper(s: Saque) {
    const ctx = await capturarContexto()
    const { error } = await superEditarSaque(s.id, { valor: Number(s.valor), status: s.status, chave_pix: s.chave_pix, cpf: s.cpf }, ctx)
    if (error) { alert('Erro ao salvar: ' + error.message); return }
    setEditSaque(null)
    // status pode ter mudado (ex.: solicitado→pago) → recarrega as duas listas
    setSaques(await getSaques('solicitado'))
    setHistSaques(await getTodosSaques())
  }

  async function pagar(s: Saque) {
    if (!confirm(`Confirmar pagamento de ${brl(Number(s.valor))} via PIX (${s.chave_pix})?`)) return
    const ctx = await capturarContexto()
    await marcarSaquePago(s.id, uid!, ctx)
    setSaques(prev => prev.filter(x => x.id !== s.id))
    setHistSaques(prev => [{ ...s, status: 'pago', pago_em: new Date().toISOString(), aprovador: 'você' }, ...(prev || [])])
  }

  function patchManual(id: number, campo: keyof IngManual, valor: any) {
    setManuais(prev => prev.map(m => m.id === id ? { ...m, [campo]: valor } : m))
  }
  function parseNum(v: any) { const n = Number(String(v ?? '').replace(',', '.')); return n > 0 ? n : null }

  async function salvarManual(m: IngManual) {
    setPrecoMsg('')
    const leitura = parseNum(leituras[m.id]), fixo = parseNum(m.custo_fixo)
    if (!leitura && !fixo && m.preco_manual == null) {
      setPrecoMsg(`Informe uma leitura (R$/kg) ou custo fixo para ${m.nome}.`); return
    }
    const { error } = await setPrecoManual(m.id, {
      preco_manual: leitura, custo_fixo: fixo, loja: m.preco_manual_loja || '', link: m.preco_manual_link || '',
    })
    if (error) { setPrecoMsg(error.message); return }
    await recalcularCustos()
    setLeituras(l => ({ ...l, [m.id]: '' }))
    setManuais(await getIngredientesManuais())
    setOrigens(await getOrigensManuais())
    if (m.id in hist) { const d = await getHistoricoManual(m.id); setHist(h => ({ ...h, [m.id]: d })) }
    setPrecoMsg(`Leitura registrada para ${m.nome} e custos atualizados.`)
  }
  async function removerManual(m: IngManual) {
    if (!confirm(`Remover o preço manual de ${m.nome}? Ele volta a ser coletado online.`)) return
    await limparPrecoManual(m.id)
    await recalcularCustos()
    setManuais(prev => prev.filter(x => x.id !== m.id))
    setPrecoMsg(`${m.nome} voltou ao modo online e custos atualizados.`)
  }
  async function adicionarManual() {
    setPrecoMsg('')
    const preco = parseNum(addPreco), fixo = parseNum(addFixo)
    if (!addId) { setPrecoMsg('Selecione um ingrediente.'); return }
    if (!preco && !fixo) { setPrecoMsg('Informe preço (R$/kg) ou custo fixo (R$/prato).'); return }
    const { error } = await setPrecoManual(Number(addId), { preco_manual: preco, custo_fixo: fixo, loja: addLoja, link: addLink })
    if (error) { setPrecoMsg(error.message); return }
    await recalcularCustos()
    setManuais(await getIngredientesManuais())
    setOrigens(await getOrigensManuais())
    setAddId(''); setAddPreco(''); setAddFixo(''); setAddLoja(''); setAddLink('')
    setAddAberto(false)
    setPrecoMsg('Preço manual definido e custos atualizados.')
  }
  async function verHistorico(id: number) {
    if (id in hist) { setHist(h => { const c = { ...h }; delete c[id]; return c }); return }  // fecha
    setHist(h => ({ ...h, [id]: [] }))                  // abre (carregando)
    const data = await getHistoricoManual(id)
    setHist(h => ({ ...h, [id]: data }))
  }
  async function recalcular() {
    setRecalcBusy(true); setPrecoMsg('')
    const { error } = await recalcularCustos()
    setRecalcBusy(false)
    setPrecoMsg(error ? `Erro ao recalcular: ${error.message}` : 'Custos do índice recalculados.')
  }

  async function moderar(c: ContribuicaoFull, status: 'aprovada' | 'rejeitada') {
    if (status === 'aprovada') {
      // aprova + registra a leitura de campo (calibra o índice) + recalcula
      const ctx = await capturarContexto()
      await aprovarContribuicao(c.id, c.ingrediente_id, c.preco, c.peso_g, c.marca, ctx)
      await recalcularCustos()
    } else {
      await moderarContribuicao(c.id, { status: 'rejeitada' })
    }
    setItens(prev => prev.filter(i => i.id !== c.id))
  }

  function patch(id: number, campo: keyof ContribuicaoFull, valor: any) {
    setItens(prev => prev.map(i => i.id === id ? { ...i, [campo]: valor } : i))
  }

  if (estado === 'carregando') return <main className="min-h-screen grid place-items-center text-muted text-sm">Carregando…</main>
  if (estado === 'negado') {
    return (
      <main className="min-h-screen grid place-items-center text-center px-6">
        <div>
          <h1 className="font-[family-name:var(--font-serif)] text-2xl mb-2">Acesso restrito</h1>
          <p className="text-sm text-muted mb-4">Esta área é só para moderadores.</p>
          <button onClick={() => router.push('/')} className="text-sm text-paprika hover:underline">voltar ao índice</button>
        </div>
      </main>
    )
  }

  const manuaisFiltrados = manuais.filter(m => {
    const o = origens[m.id]
    if (filtroOrigem === 'net' && !o?.net) return false
    if (filtroOrigem === 'campo' && !o?.campo) return false
    if (buscaPreco.trim() && !m.nome.toLowerCase().includes(buscaPreco.trim().toLowerCase())) return false
    return true
  })

  const abas: [typeof aba, string][] = [
    ['mod', `Moderação (${itens.length})`], ['aprovadas', `Aprovadas${aprLoaded ? ` (${aprTotal})` : ''}`],
    ['painel', 'Painel'], ['auditoria', 'Auditoria'], ['saques', `Saques (${saques.length})`],
    ['precos', `Preços manuais (${manuais.length})`], ...(souSuper ? [['super', 'Ações do super'] as [typeof aba, string]] : []),
  ]

  return (
    <main className="min-h-screen">
      <header className="border-b border-line sticky top-0 bg-cream/90 backdrop-blur z-10">
        <div className="max-w-3xl mx-auto px-6 pt-4 flex items-center gap-3">
          <button onClick={() => router.push('/')} className="text-sm text-muted hover:text-ink">← voltar</button>
          <h1 className="font-[family-name:var(--font-serif)] text-xl ml-1">Administração</h1>
        </div>
        <div className="max-w-3xl mx-auto px-6 mt-3">
          {/* mobile: dropdown (evita o menu correndo pro lado) */}
          <select value={aba} onChange={e => setAba(e.target.value as typeof aba)}
            className="sm:hidden w-full bg-cream border border-line rounded-md px-3 py-2 text-sm mb-2 focus:outline-none focus:border-paprika">
            {abas.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          {/* desktop: abas */}
          <div className="hidden sm:flex gap-5">
            {abas.map(([k, label]) => (
              <button key={k} onClick={() => setAba(k)}
                className={`text-sm pb-2 border-b-2 -mb-px transition whitespace-nowrap ${aba === k ? 'border-paprika text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {aba === 'mod' ? (
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6" key="mod">
        {!itens.length && <p className="text-sm text-muted text-center py-10">Nenhuma contribuição pendente.</p>}
        {itens.map(c => (
          <div key={c.id} className="border border-line rounded-lg bg-panel overflow-hidden sm:flex">
            <a href={c.foto_url || undefined} target="_blank" rel="noopener noreferrer" className="sm:w-56 shrink-0 block">
              {c.foto_url
                ? <img src={c.foto_url} alt="" className="w-full h-48 sm:h-full object-cover" />
                : <div className="w-full h-48 bg-cream grid place-items-center text-muted text-xs">sem foto</div>}
            </a>
            <div className="p-4 flex-1">
              <p className="text-[0.7rem] text-muted mb-2">
                {c.tipo_loja || '—'}{c.mercado ? ` · ${c.mercado}` : ''}{c.cidade ? ` · ${c.cidade}` : ''}
                {c.lat ? ` · ${c.lat}, ${c.lng}` : ''} · {new Date(c.criado_em).toLocaleString('pt-BR')}
              </p>
              {c.produto && <p className="text-sm mb-2">“{c.produto}”</p>}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <label>Ingrediente
                  <select value={c.ingrediente_id ?? ''} onChange={e => patch(c.id, 'ingrediente_id', e.target.value ? Number(e.target.value) : null)}
                    className={inputCls}>
                    <option value="">—</option>
                    {ings.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                  </select>
                </label>
                <label>Preço (R$)
                  <input value={c.preco ?? ''} onChange={e => patch(c.id, 'preco', Number(e.target.value.replace(',', '.')) || 0)}
                    inputMode="decimal" className={inputCls} />
                </label>
                <label>Qtd ({unidadeCurta(ings.find(i => i.id === c.ingrediente_id)?.unidade)})
                  <input value={c.peso_g ?? ''} onChange={e => patch(c.id, 'peso_g', e.target.value ? Number(e.target.value) : null)}
                    inputMode="decimal" className={inputCls} />
                </label>
                <label className="col-span-3">Marca (opcional — deixe vazio p/ itens sem marca)
                  <input value={c.marca ?? ''} onChange={e => patch(c.id, 'marca', e.target.value || null)}
                    placeholder="ex: Ancelli" className={inputCls} />
                </label>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => moderar(c, 'aprovada')}
                  className="text-sm bg-olive text-white px-4 py-1.5 rounded-md hover:brightness-95 transition">Aprovar</button>
                <button onClick={() => moderar(c, 'rejeitada')}
                  className="text-sm border border-line text-muted px-4 py-1.5 rounded-md hover:bg-cream transition">Rejeitar</button>
                {souSuper && (
                  <button onClick={() => excluirSuper('contribuicoes', c.id, () => setItens(prev => prev.filter(i => i.id !== c.id)))}
                    className="text-sm border border-red-200 text-red-600 px-4 py-1.5 rounded-md hover:bg-red-50 transition">Excluir</button>
                )}
                <span className="text-xs text-muted ml-auto self-center">vale {brl(VALOR_POR_FOTO)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      ) : aba === 'aprovadas' ? (
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-5" key="aprovadas">
        <p className="text-sm text-muted">
          Esteira de auditoria das contribuições já aprovadas. Editar aqui propaga para o
          índice (a leitura de campo é reescrita). O <strong>R$/kg</strong> ao lado do preço é o
          valor que entra no índice — confira-o para pegar erros de digitação.
        </p>

        {/* filtros */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <label className="text-xs">A partir de
            <input type="date" value={aprDesde} onChange={e => setAprDesde(e.target.value)} className={inputCls} />
          </label>
          <label className="text-xs">Preço ≥ R$
            <input value={aprPrecoMin} onChange={e => setAprPrecoMin(e.target.value)} inputMode="decimal" placeholder="ex: 50" className={inputCls} />
          </label>
          <label className="text-xs flex-1">Buscar (ingrediente / mercado / produto)
            <input value={aprBusca} onChange={e => setAprBusca(e.target.value)} placeholder="ex: cebola" className={inputCls} />
          </label>
          <button onClick={() => carregarAprovadas()} disabled={aprBusy}
            className="text-sm bg-paprika text-white px-4 py-1.5 rounded-md hover:brightness-95 transition disabled:opacity-60">
            {aprBusy ? 'Filtrando…' : 'Aplicar filtros'}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={recalcularApr} disabled={aprBusy}
            className={`text-sm px-4 py-1.5 rounded-md transition disabled:opacity-60 ${aprDirty ? 'bg-olive text-white hover:brightness-95' : 'border border-line text-muted hover:bg-cream'}`}>
            {aprBusy ? 'Recalculando…' : 'Recalcular custos do índice'}
          </button>
          {aprDirty && <span className="text-xs text-paprika">há edições não refletidas no índice</span>}
          {aprMsg && <span className="text-xs text-muted">{aprMsg}</span>}
        </div>

        {aprLoaded && !aprovadas.length && <p className="text-sm text-muted text-center py-10">Nenhuma contribuição aprovada para este filtro.</p>}

        {aprovadas.map(c => {
          const rk = rsPorKg(c)
          return (
          <div key={c.id} className="border border-line rounded-lg bg-panel overflow-hidden sm:flex">
            <a href={c.foto_url || undefined} target="_blank" rel="noopener noreferrer" className="sm:w-48 shrink-0 block">
              {c.foto_url
                ? <img src={c.foto_url} alt="" className="w-full h-40 sm:h-full object-cover" />
                : <div className="w-full h-40 bg-cream grid place-items-center text-muted text-xs">sem foto</div>}
            </a>
            <div className="p-4 flex-1">
              <p className="text-[0.7rem] text-muted mb-2">
                #{c.id} · {c.ingredientes?.nome || 'sem ingrediente'} · {new Date(c.criado_em).toLocaleString('pt-BR')}
                {c.aprovador_nome && <> · aprovado por <span className="text-ink">{c.aprovador_nome}</span>
                  {c.aprovado_dispositivo ? ` (${resumoDispositivo(c.aprovado_dispositivo)})` : ''}
                  {c.aprovado_lat != null && c.aprovado_lng != null && <> · <a href={`https://www.openstreetmap.org/?mlat=${c.aprovado_lat}&mlon=${c.aprovado_lng}#map=16/${c.aprovado_lat}/${c.aprovado_lng}`} target="_blank" rel="noopener noreferrer" className="text-paprika hover:underline">local</a></>}
                </>}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <label>Ingrediente
                  <select value={c.ingrediente_id ?? ''} onChange={e => patchApr(c.id, 'ingrediente_id', e.target.value ? Number(e.target.value) : null)} className={inputCls}>
                    <option value="">—</option>
                    {ings.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                  </select>
                </label>
                <label>Preço (R$)
                  <input value={c.preco ?? ''} onChange={e => patchApr(c.id, 'preco', e.target.value ? Number(e.target.value.replace(',', '.')) : null)} inputMode="decimal" className={inputCls} />
                </label>
                <label>Qtd ({unidadeCurta(ings.find(i => i.id === c.ingrediente_id)?.unidade)})
                  <input value={c.peso_g ?? ''} onChange={e => patchApr(c.id, 'peso_g', e.target.value ? Number(e.target.value.replace(',', '.')) : null)} inputMode="decimal" className={inputCls} />
                </label>
                <label>Marca
                  <input value={c.marca ?? ''} onChange={e => patchApr(c.id, 'marca', e.target.value || null)} placeholder="opcional" className={inputCls} />
                </label>
                <label>Mercado
                  <input value={c.mercado ?? ''} onChange={e => patchApr(c.id, 'mercado', e.target.value || null)} placeholder="ex: feira local" className={inputCls} />
                </label>
                <label>Tipo de loja
                  <input value={c.tipo_loja ?? ''} onChange={e => patchApr(c.id, 'tipo_loja', e.target.value || null)} placeholder="ex: Feira" className={inputCls} />
                </label>
                <label className="col-span-2 sm:col-span-3">Produto (descrição)
                  <input value={c.produto ?? ''} onChange={e => patchApr(c.id, 'produto', e.target.value || null)} placeholder="opcional" className={inputCls} />
                </label>
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <button onClick={() => salvarAprovada(c)} disabled={salvandoId === c.id}
                  className="text-sm bg-paprika text-white px-4 py-1.5 rounded-md hover:brightness-95 transition disabled:opacity-60">
                  {salvandoId === c.id ? 'Salvando…' : 'Salvar'}
                </button>
                <span className={`text-xs px-2 py-1 rounded ${rk == null ? 'text-muted' : rk > 100 ? 'bg-paprika/10 text-paprika font-medium' : 'text-muted'}`}>
                  {rk == null ? 'não calibra o índice' : `${brl(rk)}/kg${rk > 100 ? ' · confira' : ''}`}
                </span>
                {souSuper && (
                  <button onClick={() => excluirSuper('contribuicoes', c.id, () => { setAprovadas(prev => prev.filter(i => i.id !== c.id)); setAprTotal(t => Math.max(0, t - 1)) })}
                    className="text-sm border border-red-200 text-red-600 px-4 py-1.5 rounded-md hover:bg-red-50 transition">Excluir</button>
                )}
              </div>
            </div>
          </div>
          )
        })}

        {aprLoaded && aprovadas.length > 0 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            {aprovadas.length < aprTotal ? (
              <button onClick={() => carregarAprovadas(true)} disabled={aprBusy}
                className="text-sm text-paprika border border-line rounded-md px-4 py-2 hover:bg-cream transition disabled:opacity-60">
                {aprBusy ? 'Carregando…' : `Carregar mais (${aprTotal - aprovadas.length} restantes)`}
              </button>
            ) : null}
            <span className="text-xs text-muted">{aprovadas.length} de {aprTotal}</span>
          </div>
        )}
      </div>
      ) : aba === 'painel' ? (
      <div className="max-w-3xl mx-auto px-6 py-8" key="painel">
        <Painel ings={ings} souSuper={souSuper} />
      </div>
      ) : aba === 'auditoria' ? (
      <div className="max-w-3xl mx-auto px-6 py-8" key="auditoria">
        <Auditoria souSuper={souSuper} />
      </div>
      ) : aba === 'saques' ? (
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-3" key="saques">
        {!saques.length && <p className="text-sm text-muted text-center py-6">Nenhuma solicitação de saque pendente.</p>}
        {saques.map(s => (
          <div key={s.id} className="border border-line rounded-lg bg-panel p-4">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <p className="font-medium">{s.nome || 'Usuário sem nome'}</p>
              <p className="font-[family-name:var(--font-serif)] text-2xl tnum text-paprika">{brl(Number(s.valor))}</p>
            </div>
            <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted">Chave PIX</dt>
              <dd className="flex items-center gap-2 min-w-0">
                <span className="font-mono truncate">{s.chave_pix || '—'}</span>
                {s.chave_pix && (
                  <button onClick={() => navigator.clipboard?.writeText(s.chave_pix!)}
                    className="text-xs text-paprika hover:underline shrink-0">copiar</button>
                )}
              </dd>
              <dt className="text-muted">CPF</dt>
              <dd className="font-mono">{s.cpf ? mascararCpf(s.cpf) : '—'}</dd>
              <dt className="text-muted">Telefone</dt>
              <dd>{s.telefone || '—'}</dd>
              <dt className="text-muted">Solicitado</dt>
              <dd className="text-muted">{new Date(s.criado_em).toLocaleString('pt-BR')}</dd>
            </dl>
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-line flex-wrap">
              <p className="text-xs text-muted">Faça o PIX de {brl(Number(s.valor))} para a chave acima, depois:</p>
              <button onClick={() => pagar(s)}
                className="text-sm bg-olive text-white px-4 py-1.5 rounded-md hover:brightness-95 transition ml-auto shrink-0">
                Marcar como pago
              </button>
              {souSuper && <>
                <button onClick={() => setEditSaque(editSaque?.id === s.id ? null : { ...s })}
                  className="text-sm border border-line text-muted px-3 py-1.5 rounded-md hover:bg-cream transition shrink-0">
                  {editSaque?.id === s.id ? 'Cancelar' : 'Editar'}
                </button>
                <button onClick={() => excluirSuper('pagamentos', s.id, () => setSaques(prev => prev.filter(x => x.id !== s.id)))}
                  className="text-sm border border-red-200 text-red-600 px-3 py-1.5 rounded-md hover:bg-red-50 transition shrink-0">Excluir</button>
              </>}
            </div>
            {souSuper && editSaque?.id === s.id && (
              <div className="mt-3 pt-3 border-t border-line grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <label>Valor (R$)
                  <input value={editSaque.valor ?? ''} inputMode="decimal"
                    onChange={e => setEditSaque(v => v && ({ ...v, valor: Number(e.target.value.replace(',', '.')) || 0 }))} className={inputCls} />
                </label>
                <label>Status
                  <select value={editSaque.status} onChange={e => setEditSaque(v => v && ({ ...v, status: e.target.value }))} className={inputCls}>
                    {['solicitado', 'pago', 'rejeitada'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
                <label>Chave PIX
                  <input value={editSaque.chave_pix ?? ''} onChange={e => setEditSaque(v => v && ({ ...v, chave_pix: e.target.value || null }))} className={inputCls} />
                </label>
                <label>CPF
                  <input value={editSaque.cpf ?? ''} onChange={e => setEditSaque(v => v && ({ ...v, cpf: e.target.value || null }))} className={inputCls} />
                </label>
                <button onClick={() => salvarSaqueSuper(editSaque)}
                  className="text-sm bg-paprika text-white px-4 py-1.5 rounded-md hover:brightness-95 transition col-span-2 sm:col-span-1 self-end">Salvar</button>
              </div>
            )}
          </div>
        ))}

        {/* histórico de saques concluídos */}
        <div className="pt-6">
          <h3 className="text-sm font-medium mb-3">Histórico de saques</h3>
          {histSaques === null ? <p className="text-sm text-muted">Carregando…</p>
            : !histSaques.filter(s => s.status !== 'solicitado').length ? <p className="text-sm text-muted">Nenhum saque concluído ainda.</p>
            : (
              <div className="border border-line rounded-lg bg-panel overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted border-b border-line">
                      <th className="font-medium px-3 py-2">Usuário</th>
                      <th className="font-medium px-3 py-2 text-right">Valor</th>
                      <th className="font-medium px-3 py-2">Solicitado</th>
                      <th className="font-medium px-3 py-2">Pago</th>
                      <th className="font-medium px-3 py-2">Aprovado por</th>
                      <th className="font-medium px-3 py-2">Status</th>
                      {souSuper && <th className="font-medium px-3 py-2"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {histSaques.filter(s => s.status !== 'solicitado').map(s => {
                      const st = SAQUE_ST[s.status] || SAQUE_ST.pago
                      return (
                        <tr key={s.id} className="border-t border-line/60">
                          <td className="px-3 py-2 truncate max-w-[10rem]">{s.nome || '—'}</td>
                          <td className="px-3 py-2 text-right tnum">{brl(Number(s.valor))}</td>
                          <td className="px-3 py-2 text-muted">{new Date(s.criado_em).toLocaleDateString('pt-BR')}</td>
                          <td className="px-3 py-2 text-muted">{s.pago_em ? new Date(s.pago_em).toLocaleDateString('pt-BR') : '—'}</td>
                          <td className="px-3 py-2 text-muted" title={s.pago_dispositivo || ''}>{s.aprovador || '—'}</td>
                          <td className="px-3 py-2">
                            <span className={`text-[0.65rem] uppercase tracking-wide border rounded px-1.5 py-0.5 ${st.cls}`}>{st.txt}</span>
                          </td>
                          {souSuper && (
                            <td className="px-3 py-2 text-right">
                              <button onClick={() => excluirSuper('pagamentos', s.id, () => setHistSaques(prev => (prev || []).filter(x => x.id !== s.id)))}
                                className="text-xs text-red-600 hover:underline">excluir</button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      </div>
      ) : aba === 'super' ? (
      <div className="max-w-3xl mx-auto px-6 py-8" key="super">
        <SuperAcoes />
      </div>
      ) : (
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6" key="precos">
        <p className="text-sm text-muted">
          Preços definidos manualmente (R$/kg) para itens sem cotação online confiável. Editar grava direto em
          <code className="mx-1">ingredientes</code>; depois clique em “Recalcular custos” para refletir no índice.
        </p>

        <div className="flex items-center gap-3">
          <button onClick={recalcular} disabled={recalcBusy}
            className="text-sm bg-olive text-white px-4 py-1.5 rounded-md hover:brightness-95 transition disabled:opacity-60">
            {recalcBusy ? 'Recalculando…' : 'Recalcular custos do índice'}
          </button>
          {precoMsg && <span className="text-xs text-muted">{precoMsg}</span>}
        </div>

        {/* definir preço manual para outro ingrediente (recolhível, no topo) */}
        <div className="border border-line rounded-lg bg-panel">
          <button onClick={() => setAddAberto(a => !a)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-cream transition rounded-lg">
            <span>+ Definir preço manual para outro ingrediente</span>
            <span className="text-muted">{addAberto ? '−' : '+'}</span>
          </button>
          {addAberto && (
            <div className="px-4 pb-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <label className="col-span-2 sm:col-span-4">Ingrediente
                  <select value={addId} onChange={e => setAddId(e.target.value)} className={inputCls}>
                    <option value="">Selecione…</option>
                    {ings.filter(i => !manuais.some(m => m.id === i.id))
                      .map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                  </select>
                </label>
                <label>Preço (R$/kg)
                  <input value={addPreco} onChange={e => setAddPreco(e.target.value)} inputMode="decimal" placeholder="0,00" className={inputCls} />
                </label>
                <label>Custo fixo (R$/prato)
                  <input value={addFixo} onChange={e => setAddFixo(e.target.value)} inputMode="decimal" placeholder="simbólico" className={inputCls} />
                </label>
                <label>Loja/fonte
                  <input value={addLoja} onChange={e => setAddLoja(e.target.value)} placeholder="ex: feira local" className={inputCls} />
                </label>
                <label>Link
                  <input value={addLink} onChange={e => setAddLink(e.target.value)} placeholder="https://…" className={inputCls} />
                </label>
              </div>
              <button onClick={adicionarManual}
                className="text-sm bg-paprika text-white px-4 py-1.5 rounded-md hover:brightness-95 transition mt-3">Definir</button>
            </div>
          )}
        </div>

        {/* busca + filtro por origem */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <input value={buscaPreco} onChange={e => { setBuscaPreco(e.target.value); setVisiveisPrecos(20) }}
            placeholder="Buscar ingrediente…" className="bg-cream border border-line rounded-md px-3 py-1.5 text-sm w-full sm:w-56 focus:outline-none focus:border-paprika" />
          <div className="inline-flex border border-line rounded-md overflow-hidden bg-cream text-sm self-start">
            {([['todos', 'Todos'], ['net', 'Rede'], ['campo', 'Campo']] as const).map(([k, label]) => (
              <button key={k} onClick={() => { setFiltroOrigem(k); setVisiveisPrecos(20) }}
                className={`px-3 py-1.5 transition-colors ${filtroOrigem === k ? 'bg-paprika text-white' : 'text-muted hover:bg-cream'}`}>
                {label}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted sm:ml-auto">{manuaisFiltrados.length} de {manuais.length}</span>
        </div>

        {/* lista dos que têm preço manual */}
        <div className="space-y-3">
          {!manuais.length && <p className="text-sm text-muted">Nenhum preço manual definido.</p>}
          {manuais.length > 0 && !manuaisFiltrados.length && <p className="text-sm text-muted">Nenhum item para este filtro/busca.</p>}
          {manuaisFiltrados.slice(0, visiveisPrecos).map(m => (
            <div key={m.id} className="border border-line rounded-lg bg-panel p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium flex items-center gap-1.5 flex-wrap">
                  {m.nome}
                  {origens[m.id]?.net && <Badge texto="rede" cls="text-muted border-line" />}
                  {origens[m.id]?.campo && <Badge texto="campo" cls="text-olive border-olive/30 bg-olive/5" />}
                  {!origens[m.id] && m.custo_fixo != null && <Badge texto="fixo" cls="text-muted border-line" />}
                </p>
                <span className="text-xs text-muted">{m.categoria || '—'}</span>
              </div>
              <p className="text-xs text-muted mt-1">
                Preço usado: <span className="text-ink tnum">{m.preco_manual != null ? `${brl(Number(m.preco_manual))}/kg` : (m.custo_fixo != null ? `${brl(Number(m.custo_fixo))} fixo` : '—')}</span>
                {m.preco_manual != null && <span> · mediana das leituras dos últimos 5 dias (média 50/50 com o online, se houver)</span>}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-xs">
                <label>Nova leitura (R$/kg)
                  <input value={leituras[m.id] ?? ''} inputMode="decimal" placeholder="ex: 38,90"
                    onChange={e => setLeituras(l => ({ ...l, [m.id]: e.target.value }))} className={inputCls} />
                </label>
                <label>Custo fixo (R$/prato)
                  <input value={m.custo_fixo ?? ''} inputMode="decimal" placeholder="simbólico"
                    onChange={e => patchManual(m.id, 'custo_fixo', e.target.value)} className={inputCls} />
                </label>
                <label>Loja/fonte
                  <input value={m.preco_manual_loja ?? ''} placeholder="ex: feira local"
                    onChange={e => patchManual(m.id, 'preco_manual_loja', e.target.value)} className={inputCls} />
                </label>
                <label>Link
                  <input value={m.preco_manual_link ?? ''} placeholder="https://…"
                    onChange={e => patchManual(m.id, 'preco_manual_link', e.target.value)} className={inputCls} />
                </label>
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <button onClick={() => salvarManual(m)}
                  className="text-sm bg-paprika text-white px-4 py-1.5 rounded-md hover:brightness-95 transition">Salvar</button>
                <button onClick={() => removerManual(m)}
                  className="text-sm border border-line text-muted px-4 py-1.5 rounded-md hover:bg-cream transition">
                  Remover (voltar ao online)
                </button>
                <button onClick={() => verHistorico(m.id)}
                  className="text-xs text-paprika hover:underline">{m.id in hist ? 'ocultar histórico' : 'histórico'}</button>
                <span className="text-xs text-muted ml-auto self-center">
                  {m.preco_manual_em ? `atualizado ${new Date(m.preco_manual_em).toLocaleString('pt-BR')}` : 'sem data'}
                </span>
              </div>
              {m.id in hist && (
                <div className="mt-3 border-t border-line pt-3">
                  {!hist[m.id].length ? <p className="text-xs text-muted">Sem histórico ainda.</p> : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-muted">
                          <th className="font-medium py-1">Data</th>
                          <th className="font-medium py-1 text-right">R$/kg</th>
                          <th className="font-medium py-1 text-right">Fixo</th>
                          <th className="font-medium py-1">Loja</th>
                          {souSuper && <th className="font-medium py-1"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {hist[m.id].map(h => (
                          <tr key={h.id} className="border-t border-line/60">
                            <td className="py-1 text-muted">{new Date(h.criado_em).toLocaleString('pt-BR')}</td>
                            <td className="py-1 text-right tnum">{h.preco_manual != null ? brl(Number(h.preco_manual)) : '—'}</td>
                            <td className="py-1 text-right tnum">{h.custo_fixo != null ? brl(Number(h.custo_fixo)) : '—'}</td>
                            <td className="py-1">{h.loja || (h.link ? <a href={h.link} target="_blank" rel="noopener noreferrer" className="text-paprika hover:underline">fonte</a> : '—')}</td>
                            {souSuper && (
                              <td className="py-1 text-right">
                                <button onClick={() => excluirSuper('precos_manuais_hist', h.id, () => setHist(hh => ({ ...hh, [m.id]: hh[m.id].filter(x => x.id !== h.id) })))}
                                  className="text-xs text-red-600 hover:underline">excluir</button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
          {manuaisFiltrados.length > visiveisPrecos && (
            <button onClick={() => setVisiveisPrecos(v => v + 20)}
              className="w-full text-sm text-paprika border border-line rounded-md py-2 hover:bg-cream transition">
              Ver mais ({manuaisFiltrados.length - visiveisPrecos} restantes)
            </button>
          )}
        </div>

      </div>
      )}
    </main>
  )
}

const inputCls = 'w-full bg-cream border border-line rounded-md px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-paprika mt-1'

function Badge({ texto, cls }: { texto: string; cls: string }) {
  return <span className={`text-[0.6rem] uppercase tracking-wide border rounded px-1 py-px ${cls}`}>{texto}</span>
}
