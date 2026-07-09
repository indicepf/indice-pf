'use client'

import { Fragment, useEffect, useState } from 'react'
import { inputBase } from '@/components/ui'
import { getStatusUltimaColeta, setPrecoManual, recalcularCustos, aprovarUltimaColeta, getHistoricoManual, editarLeituraManual, getLatestSnapshot, getSnapshotsNovos, getDetalheEncontrados, getEntradasIngrediente, excluirEntradaERecalcular, getColetas, type StatusColeta, type ItemColeta, type PrecoManualHist, type ItemEncontrado, type EntradaBruta, type ColetaResumo } from '@/lib/queries'
import { capturarContexto } from '@/lib/contexto'
import { brl } from '@/lib/format'

// tipos de local para leituras manuais (pedido de 09/07)
const TIPOS_LOCAL = ['Mercado', 'Atacarejo', 'Feira', 'Conveniência', 'Hortifruti', 'Açougue', 'Outro'] as const

// unidades de compra aceitas na leitura manual; unidade/maço/dúzia convertem
// para R$/kg pelo peso de referência do ingrediente (peso_ref_g)
const UNIDADES = ['kg', 'g', 'unidade', 'maço', 'dúzia'] as const
type Unidade = typeof UNIDADES[number]

// preço pago + quantidade + unidade → R$/kg (null = falta peso de referência)
function paraRsKg(preco: number, qtd: number, un: Unidade, pesoRefG: number | null): number | null {
  if (!(preco > 0) || !(qtd > 0)) return null
  let gramas: number
  if (un === 'kg') gramas = qtd * 1000
  else if (un === 'g') gramas = qtd
  else {
    if (!pesoRefG || pesoRefG <= 0) return null
    gramas = qtd * pesoRefG * (un === 'dúzia' ? 12 : 1)
  }
  return preco / (gramas / 1000)
}

const COLUNAS_ENC = [
  ['nome', 'Ingrediente', 'left'], ['mediana', 'Mediana', 'right'], ['delta', 'Δ anterior', 'right'],
  ['minimo', 'Min–Max', 'right'], ['amplitude', 'Amplitude', 'right'], ['n', 'Result.', 'right'],
] as const
type ColEnc = typeof COLUNAS_ENC[number][0] | 'score'

export default function StatusColeta() {
  const [status, setStatus] = useState<StatusColeta | null | undefined>(undefined)
  const [modal, setModal] = useState(false)
  const [encontrados, setEncontrados] = useState<ItemEncontrado[] | null>(null)   // modal de auditoria dos achados
  const [encSnapshot, setEncSnapshot] = useState<{ id: number; data: string } | null>(null)  // qual coleta o modal mostra
  const [encBusca, setEncBusca] = useState('')
  const [encSort, setEncSort] = useState<{ col: ColEnc; dir: 1 | -1 }>({ col: 'score', dir: -1 })
  const [fontes, setFontes] = useState<Record<number, EntradaBruta[]>>({})        // fontes expandidas por ingrediente
  const [excluindo, setExcluindo] = useState<number | null>(null)
  // histórico de coletas (cards recolhidos, filtro por data, paginação)
  const [coletas, setColetas] = useState<ColetaResumo[]>([])
  const [coletasTotal, setColetasTotal] = useState(0)
  const [coletasPage, setColetasPage] = useState(0)
  const [colIni, setColIni] = useState(''); const [colFim, setColFim] = useState('')
  const POR_PAGINA = 10
  const [valores, setValores] = useState<Record<number, string>>({})
  const [qtds, setQtds] = useState<Record<number, string>>({})
  const [unidades, setUnidades] = useState<Record<number, Unidade>>({})
  const [lojas, setLojas] = useState<Record<number, string>>({})
  const [links, setLinks] = useState<Record<number, string>>({})
  const [tipos, setTipos] = useState<Record<number, string>>({})
  const [hist, setHist] = useState<Record<number, PrecoManualHist[]>>({})
  // edição inline de uma leitura do histórico (leituras antigas sem tipo de local)
  const [editando, setEditando] = useState<{ histId: number; ingId: number; preco: string; tipo: string; loja: string; link: string } | null>(null)
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)
  const [salvandoId, setSalvandoId] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const [pendente, setPendente] = useState(false)   // staging: coleta gravada sem custos_pratos
  const [aprovando, setAprovando] = useState(false)

  async function recarregar() {
    setStatus(await getStatusUltimaColeta())
    // staging (auditoria antes de integrar): a última coleta ainda não tem
    // custos_pratos → não entra no índice até ser aprovada aqui
    const [ultimo, novos] = await Promise.all([getLatestSnapshot(), getSnapshotsNovos()])
    setPendente(!!ultimo && !novos.some(s => s.id === ultimo.id))
  }
  useEffect(() => { recarregar() }, [])

  // histórico de coletas: recarrega com filtro de datas e página
  useEffect(() => {
    getColetas({ ini: colIni || undefined, fim: colFim || undefined, page: coletasPage, porPagina: POR_PAGINA })
      .then(r => { setColetas(r.coletas); setColetasTotal(r.total) })
  }, [colIni, colFim, coletasPage])

  async function aprovarColeta() {
    setAprovando(true); setMsg('')
    const { error } = await aprovarUltimaColeta()
    setAprovando(false)
    if (error) { setMsg(`Erro ao integrar a coleta: ${error.message}`); return }
    setMsg('Coleta aprovada e integrada ao índice.')
    recarregar()
  }

  async function salvarManual(item: ItemColeta) {
    const preco = Number((valores[item.id] ?? '').replace(',', '.'))
    const un = unidades[item.id] ?? 'kg'
    const qtd = un === 'kg' ? Number((qtds[item.id] || '1').replace(',', '.')) : Number((qtds[item.id] ?? '').replace(',', '.'))
    if (!(preco > 0)) { setMsg(`Informe um preço válido para ${item.nome}.`); return }
    if (!(qtd > 0)) { setMsg(`Informe a quantidade comprada de ${item.nome} (ex.: 600 para 600 g).`); return }
    const precoKg = paraRsKg(preco, qtd, un, item.peso_ref_g)
    if (precoKg == null) { setMsg(`${item.nome} não tem peso de referência cadastrado — não dá para converter ${un} em R$/kg. Use g ou kg.`); return }
    setSalvandoId(item.id); setMsg('')
    const { error } = await setPrecoManual(item.id, { preco_manual: +precoKg.toFixed(2), loja: lojas[item.id] || '', link: links[item.id] || '', tipo: tipos[item.id] || '' })
    if (error) { setSalvandoId(null); setMsg(`Erro ao salvar ${item.nome}: ${error.message}`); return }
    await recalcularCustos()
    setSalvandoId(null)
    setValores(v => ({ ...v, [item.id]: '' })); setQtds(q => ({ ...q, [item.id]: '' })); setLojas(l => ({ ...l, [item.id]: '' })); setLinks(l => ({ ...l, [item.id]: '' })); setTipos(t => ({ ...t, [item.id]: '' }))
    if (item.id in hist) { const d = await getHistoricoManual(item.id); setHist(h => ({ ...h, [item.id]: d })) }
    setMsg(`Leitura de ${item.nome} registrada e custos recalculados.`)
    recarregar()
  }

  async function abrirEncontrados(snap?: { id: number; data: string }) {
    const alvo = snap ?? (status ? { id: status.snapshotId, data: status.data } : null)
    if (!alvo) return
    setEncSnapshot(alvo); setEncontrados([]); setFontes({}); setEncBusca(''); setEncSort({ col: 'score', dir: -1 })
    setEncontrados(await getDetalheEncontrados(alvo.id))
  }

  async function toggleFontes(ingId: number) {
    if (ingId in fontes) { setFontes(f => { const c = { ...f }; delete c[ingId]; return c }); return }
    setFontes(f => ({ ...f, [ingId]: [] }))   // abre (carregando)
    const { entradas } = await getEntradasIngrediente(ingId, encSnapshot?.id ?? status?.snapshotId)
    setFontes(f => ({ ...f, [ingId]: entradas }))
  }

  async function excluirFonte(ingId: number, e: EntradaBruta) {
    const snapId = encSnapshot?.id ?? status?.snapshotId
    if (!snapId) return
    if (!confirm(`Excluir esta fonte? A mediana do ingrediente será recalculada.\n\n${e.titulo}\n${e.exibicao}`)) return
    setExcluindo(e.id); setMsg('')
    const ctx = await capturarContexto()
    const { error } = await excluirEntradaERecalcular(e.id, snapId, ingId, ctx)
    setExcluindo(null)
    if (error) { setMsg(`Erro ao excluir: ${error.message}`); return }
    setFontes(f => ({ ...f, [ingId]: (f[ingId] || []).filter(x => x.id !== e.id) }))
    setEncontrados(await getDetalheEncontrados(snapId))   // mediana/Δ/amplitude mudaram
    recarregar()
  }

  function ordenarEnc(col: ColEnc) {
    setEncSort(s => s.col === col ? { col, dir: (s.dir === 1 ? -1 : 1) } : { col, dir: col === 'nome' ? 1 : -1 })
  }

  async function salvarEdicao() {
    if (!editando) return
    const preco = Number(editando.preco.replace(',', '.'))
    if (!(preco > 0)) { setMsg('Informe um preço válido (R$/kg).'); return }
    setSalvandoEdicao(true); setMsg('')
    const { error } = await editarLeituraManual(editando.histId, {
      preco_manual: preco, tipo: editando.tipo, loja: editando.loja, link: editando.link,
    })
    setSalvandoEdicao(false)
    if (error) { setMsg(`Erro ao editar: ${error.message}`); return }
    const ingId = editando.ingId
    setEditando(null)
    setHist(h => ({ ...h }))   // mantém aberto; recarrega abaixo
    const d = await getHistoricoManual(ingId)
    setHist(h => ({ ...h, [ingId]: d }))
    await recalcularCustos()
    setMsg('Leitura atualizada e custos recalculados.')
    recarregar()
  }

  async function verHistorico(id: number) {
    if (id in hist) { setHist(h => { const c = { ...h }; delete c[id]; return c }); return }  // fecha
    setHist(h => ({ ...h, [id]: [] }))                  // abre (carregando)
    const data = await getHistoricoManual(id)
    setHist(h => ({ ...h, [id]: data }))
  }

  if (status === undefined) return <p className="text-sm text-dim">Carregando…</p>
  if (status === null) return <p className="text-sm text-dim">Nenhuma coleta registrada ainda.</p>

  const total = status.achados.length + status.naoAchados.length
  const dataFmt = new Date(status.data + 'T00:00:00').toLocaleDateString('pt-BR')

  return (
    <div className="space-y-5">
      <p className="text-sm text-dim">
        Resultado da última coleta online (snapshot mais recente). Os itens <strong>não encontrados</strong> continuam
        sendo raspados a cada coleta — aqui você define um preço manual de segurança para eles.
      </p>

      {pendente && (
        <div className="border border-warn/40 bg-warn/5 rounded-lg p-4">
          <p className="text-sm font-medium">Coleta em auditoria — ainda fora do índice</p>
          <p className="text-xs text-dim mt-1 leading-relaxed">
            Esta coleta foi gravada mas <strong>não entrou no índice</strong>. Revise as variações fortes e as
            entradas na aba <strong>Variações</strong> (exclua fontes erradas) e então aprove abaixo — a aprovação
            calcula os custos dos pratos e publica a coleta no dashboard. Sem aprovação manual, ela entra
            <strong> automaticamente no índice após 5 dias</strong> (migração 29).
          </p>
          <button onClick={aprovarColeta} disabled={aprovando}
            className="mt-3 text-sm bg-ok text-white px-4 py-1.5 rounded-md hover:brightness-95 transition disabled:opacity-60 cursor-pointer">
            {aprovando ? 'Integrando…' : 'Aprovar coleta e integrar ao índice'}
          </button>
        </div>
      )}

      <div className="border border-border rounded-lg bg-surface p-5">
        <p className="text-xs text-dim mb-1">Último scrape</p>
        <p className="font-bold tracking-tight text-xl mb-4">{dataFmt}</p>
        <div className="grid grid-cols-3 gap-3">
          <Card n={total} label="itens no snapshot" cls="text-ink" onClick={() => setModal(true)} />
          <Card n={status.achados.length} label="encontrados" cls="text-ok" onClick={() => abrirEncontrados()} />
          <Card n={status.naoAchados.length} label="não encontrados" cls="text-accent" onClick={() => setModal(true)} />
        </div>
      </div>

      {/* não encontrados: define preço manual inline */}
      <div>
        <h3 className="text-sm font-medium mb-1 text-accent">Não encontrados ({status.naoAchados.length})</h3>
        <p className="text-xs text-dim mb-3">Sem cotação online neste snapshot. Registre uma leitura (R$/kg) com a fonte (loja/link) para cobrir o custo até o scraper encontrá-los. Cada leitura fica arquivada no histórico.</p>
        {msg && <p className="text-xs text-dim mb-3">{msg}</p>}
        {!status.naoAchados.length ? <p className="text-sm text-dim">Todos os itens foram encontrados nesta coleta.</p> : (
          <div className="space-y-2">
            {status.naoAchados.map(item => (
              <div key={item.id} className="border border-border rounded-lg bg-surface p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{item.nome}</span>
                  <span className="text-xs text-dim">
                    {item.preco_manual != null ? `manual atual: ${brl(Number(item.preco_manual))}/kg` : 'sem manual'}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3 text-xs">
                  <label>Preço pago (R$)
                    <input value={valores[item.id] ?? ''} inputMode="decimal" placeholder="ex: 8,90"
                      onChange={e => setValores(v => ({ ...v, [item.id]: e.target.value }))} className={inputCls} />
                  </label>
                  <label>Quantidade
                    <input value={qtds[item.id] ?? ''} inputMode="decimal"
                      placeholder={['unidade', 'maço', 'dúzia'].includes(unidades[item.id] ?? '') ? 'ex: 1' : 'ex: 600'}
                      onChange={e => setQtds(q => ({ ...q, [item.id]: e.target.value }))} className={inputCls} />
                  </label>
                  <label>Unidade
                    <select value={unidades[item.id] ?? 'kg'}
                      onChange={e => setUnidades(u => ({ ...u, [item.id]: e.target.value as Unidade }))} className={inputCls}>
                      {UNIDADES.map(u => (
                        <option key={u} value={u} disabled={['unidade', 'maço', 'dúzia'].includes(u) && !item.peso_ref_g}>
                          {u}{['unidade', 'maço', 'dúzia'].includes(u) && !item.peso_ref_g ? ' (sem peso ref.)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  {(() => {
                    const preco = Number((valores[item.id] ?? '').replace(',', '.'))
                    const un = unidades[item.id] ?? 'kg'
                    const qtd = un === 'kg' ? Number((qtds[item.id] || '1').replace(',', '.')) : Number((qtds[item.id] ?? '').replace(',', '.'))
                    const kg = paraRsKg(preco, qtd, un, item.peso_ref_g)
                    return kg != null ? (
                      <p className="col-span-2 sm:col-span-3 text-dim -mt-1">
                        = <strong className="text-ink tnum">{brl(kg)}/kg</strong>
                        {['unidade', 'maço', 'dúzia'].includes(un) && item.peso_ref_g ? ` (peso de referência: ${item.peso_ref_g} g por ${un === 'dúzia' ? 'unidade' : un})` : ''}
                      </p>
                    ) : null
                  })()}
                  <label>Tipo de local
                    <select value={tipos[item.id] ?? ''}
                      onChange={e => setTipos(t => ({ ...t, [item.id]: e.target.value }))} className={inputCls}>
                      <option value="">—</option>
                      {TIPOS_LOCAL.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                  <label>Fonte (nome do local)
                    <input value={lojas[item.id] ?? ''} placeholder="ex: Feira da Torre"
                      onChange={e => setLojas(l => ({ ...l, [item.id]: e.target.value }))} className={inputCls} />
                  </label>
                  <label>Link
                    <input value={links[item.id] ?? ''} placeholder="https://…"
                      onChange={e => setLinks(l => ({ ...l, [item.id]: e.target.value }))} className={inputCls} />
                  </label>
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <button onClick={() => salvarManual(item)} disabled={salvandoId === item.id}
                    className="btn-mk primary sm disabled:opacity-60">
                    {salvandoId === item.id ? 'Salvando…' : 'Salvar'}
                  </button>
                  <button onClick={() => verHistorico(item.id)}
                    className="text-xs text-accent hover:underline">{item.id in hist ? 'ocultar histórico' : 'histórico'}</button>
                </div>
                {item.id in hist && (
                  <div className="mt-3 border-t border-border pt-3">
                    {!hist[item.id].length ? <p className="text-xs text-dim">Sem histórico ainda.</p> : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-dim">
                            <th className="font-medium py-1">Data</th>
                            <th className="font-medium py-1 text-right">R$/kg</th>
                            <th className="font-medium py-1">Tipo</th>
                            <th className="font-medium py-1">Fonte</th>
                            <th className="py-1" />
                          </tr>
                        </thead>
                        <tbody>
                          {hist[item.id].map(h => editando?.histId === h.id ? (
                            <tr key={h.id} className="border-t border-border/60 bg-surface-2">
                              <td colSpan={5} className="py-2">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  <label>R$/kg
                                    <input value={editando.preco} inputMode="decimal"
                                      onChange={e => setEditando(ed => ed && { ...ed, preco: e.target.value })} className={inputCls} />
                                  </label>
                                  <label>Tipo de local
                                    <select value={editando.tipo}
                                      onChange={e => setEditando(ed => ed && { ...ed, tipo: e.target.value })} className={inputCls}>
                                      <option value="">—</option>
                                      {TIPOS_LOCAL.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                  </label>
                                  <label>Fonte (nome do local)
                                    <input value={editando.loja}
                                      onChange={e => setEditando(ed => ed && { ...ed, loja: e.target.value })} className={inputCls} />
                                  </label>
                                  <label>Link
                                    <input value={editando.link}
                                      onChange={e => setEditando(ed => ed && { ...ed, link: e.target.value })} className={inputCls} />
                                  </label>
                                </div>
                                <div className="flex gap-3 mt-2">
                                  <button onClick={salvarEdicao} disabled={salvandoEdicao}
                                    className="text-xs bg-accent text-white px-3 py-1 rounded-md hover:brightness-95 transition disabled:opacity-60 cursor-pointer">
                                    {salvandoEdicao ? 'Salvando…' : 'Salvar edição'}
                                  </button>
                                  <button onClick={() => setEditando(null)} className="text-xs text-dim hover:text-ink cursor-pointer">cancelar</button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            <tr key={h.id} className="border-t border-border/60">
                              <td className="py-1 text-dim">{new Date(h.criado_em).toLocaleString('pt-BR')}</td>
                              <td className="py-1 text-right tnum">{h.preco_manual != null ? brl(Number(h.preco_manual)) : '—'}</td>
                              <td className="py-1 text-dim">{h.tipo_local || '—'}</td>
                              <td className="py-1">{h.loja || (h.link ? <a href={h.link} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">fonte</a> : '—')}</td>
                              <td className="py-1 text-right">
                                <button onClick={() => setEditando({
                                  histId: h.id, ingId: item.id,
                                  preco: h.preco_manual != null ? String(h.preco_manual).replace('.', ',') : '',
                                  tipo: h.tipo_local || '', loja: h.loja || '', link: h.link || '',
                                })} className="text-accent hover:underline cursor-pointer">editar</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* histórico de coletas: cards recolhidos, filtro por data e paginação */}
      <div>
        <h3 className="text-sm font-medium mb-1">Coletas anteriores</h3>
        <p className="text-xs text-dim mb-3">Clique em &quot;abrir&quot; para auditar os encontrados daquela coleta (mesma tabela com fontes).</p>
        <div className="flex items-end gap-3 mb-3 text-xs flex-wrap">
          <label>De
            <input type="date" value={colIni} onChange={e => { setColIni(e.target.value); setColetasPage(0) }} className={inputCls} />
          </label>
          <label>Até
            <input type="date" value={colFim} onChange={e => { setColFim(e.target.value); setColetasPage(0) }} className={inputCls} />
          </label>
          {(colIni || colFim) && (
            <button onClick={() => { setColIni(''); setColFim(''); setColetasPage(0) }}
              className="text-accent hover:underline pb-2 cursor-pointer">limpar</button>
          )}
        </div>
        {!coletas.length ? <p className="text-sm text-dim">Nenhuma coleta no filtro.</p> : (
          <div className="space-y-2">
            {coletas.map(c => (
              <div key={c.id} className="border border-border rounded-lg bg-surface px-4 py-3 flex items-center gap-4 flex-wrap">
                <span className="text-sm font-medium tnum">{new Date(c.data + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                <span className={`text-[0.65rem] uppercase tracking-wide px-2 py-0.5 rounded-full ${c.integrada ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>
                  {c.integrada ? 'no índice' : 'pendente'}
                </span>
                <span className="text-xs text-dim">índice: <strong className="text-ink tnum">{c.custo_total_pf != null ? brl(c.custo_total_pf) : '—'}</strong></span>
                <span className="text-xs text-dim"><strong className="text-ok">{c.achados}</strong> encontrados · <strong className="text-accent">{c.naoAchados}</strong> não</span>
                <button onClick={() => abrirEncontrados({ id: c.id, data: c.data })}
                  className="ml-auto text-xs text-accent hover:underline cursor-pointer">abrir</button>
              </div>
            ))}
          </div>
        )}
        {coletasTotal > POR_PAGINA && (
          <div className="flex items-center gap-3 mt-3 text-xs">
            <button disabled={coletasPage === 0} onClick={() => setColetasPage(p => p - 1)}
              className="text-accent hover:underline disabled:opacity-40 disabled:no-underline cursor-pointer">← anteriores</button>
            <span className="text-dim">página {coletasPage + 1} de {Math.ceil(coletasTotal / POR_PAGINA)}</span>
            <button disabled={(coletasPage + 1) * POR_PAGINA >= coletasTotal} onClick={() => setColetasPage(p => p + 1)}
              className="text-accent hover:underline disabled:opacity-40 disabled:no-underline cursor-pointer">próximas →</button>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center px-4" onClick={() => setModal(false)}>
          <div className="bg-surface-2 border border-border rounded-lg max-w-2xl w-full max-h-[80vh] overflow-auto p-6"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold tracking-tight text-lg">Coleta de {dataFmt}</h3>
              <button onClick={() => setModal(false)} className="text-sm text-dim hover:text-ink">fechar ✕</button>
            </div>
            <div className="grid sm:grid-cols-2 gap-6">
              <Lista titulo="Não encontrados" cls="text-accent" itens={status.naoAchados} />
              <Lista titulo="Encontrados" cls="text-ok" itens={status.achados} />
            </div>
          </div>
        </div>
      )}

      {/* auditoria dos encontrados: preço, Δ% vs coleta anterior e amplitude min→max */}
      {encontrados && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center px-4" onClick={() => setEncontrados(null)}>
          <div className="bg-surface-2 border border-border rounded-lg max-w-3xl w-full max-h-[85vh] overflow-auto p-6"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold tracking-tight text-lg">
                Encontrados — coleta de {encSnapshot ? new Date(encSnapshot.data + 'T00:00:00').toLocaleDateString('pt-BR') : dataFmt}
              </h3>
              <button onClick={() => setEncontrados(null)} className="text-sm text-dim hover:text-ink">fechar ✕</button>
            </div>
            <p className="text-xs text-dim mb-3 leading-relaxed">
              <strong>Δ anterior</strong> = variação da mediana vs a coleta anterior; <strong>amplitude</strong> = razão
              entre o resultado mais caro e o mais barato da busca — amplitude alta indica itens premium/gourmet/preparados
              misturados. <strong>Clique no item</strong> para ver as fontes e excluir as erradas; clique nos títulos das
              colunas para ordenar.
            </p>
            <input value={encBusca} onChange={e => setEncBusca(e.target.value)} placeholder="Buscar ingrediente…"
              className={`${inputCls} mb-3 max-w-xs`} />
            {msg && <p className="text-xs text-danger mb-3">{msg}</p>}
            {!encontrados.length ? <p className="text-sm text-dim">Carregando…</p> : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-dim select-none">
                    {COLUNAS_ENC.map(([col, rotulo, alin]) => (
                      <th key={col} onClick={() => ordenarEnc(col)}
                        className={`font-medium py-1.5 cursor-pointer hover:text-ink ${alin === 'right' ? 'text-right' : ''}`}>
                        {rotulo}{encSort.col === col ? (encSort.dir === 1 ? ' ▲' : ' ▼') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...encontrados]
                    .filter(e => !encBusca.trim() || e.nome.toLowerCase().includes(encBusca.trim().toLowerCase()))
                    .sort((a, b) => {
                      const { col, dir } = encSort
                      if (col === 'score') return (score(b) - score(a)) * (dir === -1 ? 1 : -1)
                      if (col === 'nome') return a.nome.localeCompare(b.nome) * dir
                      const va = (a as any)[col], vb = (b as any)[col]
                      if (va == null && vb == null) return 0
                      if (va == null) return 1
                      if (vb == null) return -1
                      return (va - vb) * dir
                    })
                    .map(e => {
                      const deltaForte = e.delta != null && Math.abs(e.delta) > 20
                      const ampForte = e.amplitude != null && e.amplitude > 4
                      const novoFraco = e.delta == null && e.n <= 2   // sem referência e 1–2 resultados: conferir na mão
                      const aberto = e.id in fontes
                      return (
                        <Fragment key={e.id}>
                          <tr onClick={() => toggleFontes(e.id)}
                            className={`border-t border-border/60 cursor-pointer hover:bg-surface ${deltaForte || ampForte || novoFraco ? 'bg-warn/5' : ''}`}>
                            <td className="py-1.5">{aberto ? '▾ ' : '▸ '}{e.nome}</td>
                            <td className="py-1.5 text-right tnum whitespace-nowrap">{e.mediana != null ? `${brl(e.mediana)}/${e.label || 'kg'}` : '—'}</td>
                            <td className={`py-1.5 text-right tnum font-medium ${deltaForte ? 'text-danger' : e.delta != null && e.delta < 0 ? 'text-ok' : 'text-dim'}`}>
                              {e.delta != null ? `${e.delta > 0 ? '+' : ''}${e.delta.toFixed(1)}%` : 'novo'}
                            </td>
                            <td className="py-1.5 text-right tnum text-dim whitespace-nowrap">
                              {e.minimo != null && e.maximo != null ? `${brl(e.minimo)} – ${brl(e.maximo)}` : '—'}
                            </td>
                            <td className={`py-1.5 text-right tnum font-medium ${ampForte ? 'text-danger' : 'text-dim'}`}>
                              {e.amplitude != null ? `${e.amplitude.toFixed(1)}×` : '—'}
                            </td>
                            <td className="py-1.5 text-right tnum text-dim">{e.n}</td>
                          </tr>
                          {aberto && (
                            <tr className="border-t border-border/40 bg-surface">
                              <td colSpan={6} className="py-2 pl-4">
                                {!fontes[e.id].length ? <p className="text-dim py-1">Carregando fontes…</p> : (
                                  <ul className="space-y-1">
                                    {fontes[e.id].map(f => (
                                      <li key={f.id} className="flex items-center gap-2">
                                        <span className="tnum shrink-0 w-24 text-right">{f.exibicao}</span>
                                        <span className="truncate flex-1" title={f.titulo}>
                                          {f.link
                                            ? <a href={f.link} target="_blank" rel="noopener noreferrer" className="hover:underline">{f.titulo}</a>
                                            : f.titulo}
                                          {f.loja ? <span className="text-dim"> · {f.loja}</span> : null}
                                        </span>
                                        <button onClick={ev => { ev.stopPropagation(); excluirFonte(e.id, f) }}
                                          disabled={excluindo === f.id}
                                          className="text-danger hover:underline shrink-0 disabled:opacity-50 cursor-pointer">
                                          {excluindo === f.id ? 'excluindo…' : 'excluir'}
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const inputCls = inputBase

// prioridade de auditoria de um encontrado: Δ forte vs anterior, amplitude alta
// dentro da busca, ou item novo com pouquíssimos resultados (1 anúncio errado
// vira a mediana — caso do fígado a R$5.555 em 09/07)
function score(e: ItemEncontrado) {
  return Math.max(
    Math.abs(e.delta ?? 0),
    ((e.amplitude ?? 1) - 1) * 25,
    e.delta == null && e.n <= 2 ? 30 : 0,
  )
}

function Card({ n, label, cls, onClick }: { n: number; label: string; cls: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="border border-border rounded-md bg-surface-2 p-3 text-left hover:border-accent transition">
      <span className={`block font-bold tracking-tight text-2xl tnum ${cls}`}>{n}</span>
      <span className="block text-xs text-dim">{label}</span>
    </button>
  )
}

function Lista({ titulo, cls, itens }: { titulo: string; cls: string; itens: ItemColeta[] }) {
  return (
    <div>
      <p className={`text-sm font-medium mb-2 ${cls}`}>{titulo} ({itens.length})</p>
      {!itens.length ? <p className="text-xs text-dim">nenhum</p> : (
        <ul className="text-sm space-y-1">
          {itens.map(i => <li key={i.id} className="text-ink">{i.nome}</li>)}
        </ul>
      )}
    </div>
  )
}
