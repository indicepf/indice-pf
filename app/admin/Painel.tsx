'use client'

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import dynamic from 'next/dynamic'
import {
  getPainelContribuicoes, getPerfis, getUsoPorIngrediente, getLatestSnapshot,
  editarContribuicaoAprovada, moderarContribuicao, recalcularCustos,
  superExcluir, superEditarPerfil,
  type PainelContrib, type PerfilBasico,
} from '@/lib/queries'
import { capturarContexto } from '@/lib/contexto'
import { brl, idade, SEXOS, unidadeCurta } from '@/lib/format'
import type { Ing } from '@/lib/types'

const MapaLocal = dynamic(() => import('../MapaLocal'), {
  ssr: false,
  loading: () => <div className="h-[420px] rounded-lg border border-line grid place-items-center text-muted text-sm">carregando mapa…</div>,
})

// cores por região (mesma ordem de REGIOES)
const CORES_REGIAO: Record<string, string> = {
  'Sul': '#2563eb', 'Sudeste': '#c0492b', 'Centro-oeste': '#ca8a04', 'Nordeste': '#16a34a', 'Norte': '#9333ea',
}
const sexoLabel = (v: string | null) => SEXOS.find(s => s.value === v)?.label ?? '—'
function dias(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}
function frescor(d: number | null): { txt: string; cls: string } {
  if (d == null) return { txt: 'nunca', cls: 'text-red-600 border-red-200 bg-red-50' }
  if (d <= 5) return { txt: `há ${d}d`, cls: 'text-olive border-olive/30 bg-olive/5' }
  if (d <= 30) return { txt: `há ${d}d`, cls: 'text-muted border-line' }
  return { txt: `há ${d}d`, cls: 'text-red-600 border-red-200 bg-red-50' }
}
function rsKgDe(c: PainelContrib, ings: Ing[]): number | null {
  const ing = ings.find(i => i.id === c.ingrediente_id)
  if (!ing || !c.preco || !c.peso_g || c.preco <= 0 || c.peso_g <= 0) return null
  const g = (ing.unidade === 'unidade' || ing.unidade === 'maco') ? c.peso_g * (ing.peso_ref_g || 0) : c.peso_g
  if (!g || g <= 0) return null
  return c.preco / g * 1000
}
// form de edição inline de uma contribuição (usado no detalhe do usuário e do ingrediente)
function FormEdicao({ edit, setEdit, ings, salvando, onSalvar }: {
  edit: PainelContrib; setEdit: Dispatch<SetStateAction<PainelContrib | null>>
  ings: Ing[]; salvando: boolean; onSalvar: () => void
}) {
  const rk = rsKgDe(edit, ings)
  return (
    <div className="border border-line rounded-lg bg-panel p-3 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        <label>Ingrediente
          <select value={edit.ingrediente_id ?? ''} onChange={e => setEdit(v => v && ({ ...v, ingrediente_id: e.target.value ? Number(e.target.value) : null }))} className={inputCls}>
            <option value="">—</option>
            {ings.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
          </select>
        </label>
        <label>Preço (R$)
          <input value={edit.preco ?? ''} onChange={e => setEdit(v => v && ({ ...v, preco: e.target.value ? Number(e.target.value.replace(',', '.')) : null }))} inputMode="decimal" className={inputCls} />
        </label>
        <label>Qtd ({unidadeCurta(ings.find(i => i.id === edit.ingrediente_id)?.unidade)})
          <input value={edit.peso_g ?? ''} onChange={e => setEdit(v => v && ({ ...v, peso_g: e.target.value ? Number(e.target.value.replace(',', '.')) : null }))} inputMode="decimal" className={inputCls} />
        </label>
        <label>Marca
          <input value={edit.marca ?? ''} onChange={e => setEdit(v => v && ({ ...v, marca: e.target.value || null }))} placeholder="opcional" className={inputCls} />
        </label>
        <label>Mercado
          <input value={edit.mercado ?? ''} onChange={e => setEdit(v => v && ({ ...v, mercado: e.target.value || null }))} className={inputCls} />
        </label>
        <label>Tipo de loja
          <input value={edit.tipo_loja ?? ''} onChange={e => setEdit(v => v && ({ ...v, tipo_loja: e.target.value || null }))} className={inputCls} />
        </label>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={onSalvar} disabled={salvando} className="text-sm bg-paprika text-white px-4 py-1.5 rounded-md hover:brightness-95 transition disabled:opacity-60">{salvando ? 'Salvando…' : 'Salvar'}</button>
        <button onClick={() => setEdit(null)} className="text-sm border border-line text-muted px-3 py-1.5 rounded-md hover:bg-cream transition">Cancelar</button>
        <span className={`text-xs px-2 py-1 rounded ${rk == null ? 'text-muted' : rk > 100 ? 'bg-paprika/10 text-paprika font-medium' : 'text-muted'}`}>{rk == null ? 'não calibra o índice' : `${brl(rk)}/kg${rk > 100 ? ' · confira' : ''}`}</span>
        <span className="text-[0.6rem] uppercase tracking-wide text-muted ml-auto">{edit.status}</span>
      </div>
    </div>
  )
}
function baixarCSV(nome: string, linhas: (string | number | null)[][]) {
  const csv = linhas.map(l => l.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = nome; a.click(); URL.revokeObjectURL(url)
}

export default function Painel({ ings, souSuper }: { ings: Ing[]; souSuper: boolean }) {
  const [contribs, setContribs] = useState<PainelContrib[] | null>(null)
  const [perfis, setPerfis] = useState<Record<string, PerfilBasico>>({})
  const [editPerfil, setEditPerfil] = useState<PerfilBasico | null>(null)
  const [uso, setUso] = useState<Record<number, number>>({})
  const [indice, setIndice] = useState<number | null>(null)
  const [sub, setSub] = useState<'usuarios' | 'mapa' | 'ingredientes'>('usuarios')
  const [userSel, setUserSel] = useState<string | null>(null)
  const [ingAberto, setIngAberto] = useState<number | null>(null)
  const [ingBusca, setIngBusca] = useState(''); const [ingDesde, setIngDesde] = useState(''); const [ingPrecoMin, setIngPrecoMin] = useState('')
  const [edit, setEdit] = useState<PainelContrib | null>(null)  // contribuição em edição inline (cópia)
  const [salvandoEdit, setSalvandoEdit] = useState(false); const [recalcDirty, setRecalcDirty] = useState(false); const [editMsg, setEditMsg] = useState('')

  useEffect(() => {
    (async () => {
      const cs = await getPainelContribuicoes()
      setContribs(cs)
      const ids = [...new Set(cs.map(c => c.user_id).filter(Boolean))]
      const [ps, u, snap] = await Promise.all([getPerfis(ids), getUsoPorIngrediente(), getLatestSnapshot()])
      const pm: Record<string, PerfilBasico> = {}; ps.forEach(p => { pm[p.id] = p })
      setPerfis(pm); setUso(u); setIndice(snap?.custo_total_pf ?? null)
    })()
  }, [])

  const nomeIng = useMemo(() => { const m: Record<number, string> = {}; ings.forEach(i => { m[i.id] = i.nome }); return m }, [ings])

  // ── resumo ────────────────────────────────────────────────────────────────
  const resumo = useMemo(() => {
    if (!contribs) return null
    const contribuidores = new Set(contribs.map(c => c.user_id).filter(Boolean)).size
    const cobertos = new Set(contribs.filter(c => c.status === 'aprovada' && c.ingrediente_id != null).map(c => c.ingrediente_id)).size
    return {
      total: contribs.length, contribuidores, aprovadas: contribs.filter(c => c.status === 'aprovada').length,
      cobertura: ings.length ? Math.round((cobertos / ings.length) * 100) : 0,
    }
  }, [contribs, ings.length])

  // ── usuários ──────────────────────────────────────────────────────────────
  const usuarios = useMemo(() => {
    if (!contribs) return []
    const m: Record<string, { count: number; aprovadas: number; rejeitadas: number; pendentes: number; cidades: Set<string>; ultima: string }> = {}
    contribs.forEach(c => {
      const u = (m[c.user_id] ||= { count: 0, aprovadas: 0, rejeitadas: 0, pendentes: 0, cidades: new Set(), ultima: c.criado_em })
      u.count++
      if (c.status === 'aprovada') u.aprovadas++; else if (c.status === 'rejeitada') u.rejeitadas++; else u.pendentes++
      if (c.cidade) u.cidades.add(c.cidade)
      if (c.criado_em > u.ultima) u.ultima = c.criado_em
    })
    return Object.entries(m).map(([id, v]) => ({ id, ...v, cidades: [...v.cidades] })).sort((a, b) => b.count - a.count)
  }, [contribs])

  // ── ingredientes (cobertura) ────────────────────────────────────────────────
  const cobertura = useMemo(() => {
    const desdeISO = ingDesde ? new Date(ingDesde + 'T00:00:00').toISOString() : null
    const precoMin = ingPrecoMin.trim() ? Number(ingPrecoMin.replace(',', '.')) : null
    const porIng: Record<number, PainelContrib[]> = {}
    ;(contribs || []).forEach(c => {
      if (c.ingrediente_id == null) return
      if (desdeISO && c.criado_em < desdeISO) return
      if (precoMin != null && (c.preco == null || c.preco < precoMin)) return
      (porIng[c.ingrediente_id] ||= []).push(c)
    })
    const b = ingBusca.trim().toLowerCase()
    const lista = ings.filter(i => !b || i.nome.toLowerCase().includes(b)).map(i => {
      const cs = (porIng[i.id] || []).sort((a, c) => c.criado_em.localeCompare(a.criado_em))
      return { ing: i, n: cs.length, ultima: cs[0]?.criado_em ?? null, uso: uso[i.id] || 0, cs }
    })
    return {
      faltam: lista.filter(x => x.n === 0).sort((a, b) => b.uso - a.uso),
      cobertos: lista.filter(x => x.n > 0).sort((a, b) => (b.ultima || '').localeCompare(a.ultima || '')),
    }
  }, [contribs, ings, uso, ingBusca, ingDesde, ingPrecoMin])

  async function salvarEdit() {
    if (!edit) return
    setSalvandoEdit(true); setEditMsg('')
    const campos = {
      ingrediente_id: edit.ingrediente_id, preco: edit.preco, peso_g: edit.peso_g,
      marca: edit.marca, mercado: edit.mercado, tipo_loja: edit.tipo_loja, produto: edit.produto,
    }
    // aprovada → RPC que reescreve a leitura e calibra o índice; senão, update simples
    const { error } = edit.status === 'aprovada'
      ? await editarContribuicaoAprovada(edit.id, campos)
      : await moderarContribuicao(edit.id, campos)
    setSalvandoEdit(false)
    if (error) { setEditMsg(`Erro: ${error.message}`); return }
    if (edit.status === 'aprovada') setRecalcDirty(true)
    const novoNome = edit.ingrediente_id != null ? { nome: nomeIng[edit.ingrediente_id] ?? '' } : null
    setContribs(prev => (prev || []).map(c => c.id === edit.id ? { ...c, ...campos, ingredientes: novoNome } : c))
    setEdit(null)
  }
  async function recalcEdit() {
    setSalvandoEdit(true); setEditMsg('')
    const { error } = await recalcularCustos()
    setSalvandoEdit(false); setRecalcDirty(false)
    setEditMsg(error ? `Erro ao recalcular: ${error.message}` : 'Custos do índice recalculados.')
  }

  async function salvarPerfil(p: PerfilBasico) {
    const ctx = await capturarContexto()
    const { error } = await superEditarPerfil(p.id, {
      nome: p.nome, telefone: p.telefone, regiao: p.regiao,
      is_admin: !!p.is_admin, is_super: !!p.is_super,
    }, ctx)
    if (error) { setEditMsg('Erro ao salvar perfil: ' + error.message); return }
    setPerfis(prev => ({ ...prev, [p.id]: p }))
    setEditPerfil(null)
  }
  async function excluirPerfil(id: string) {
    if (!confirm('Excluir DEFINITIVAMENTE este perfil? A ação fica registrada em "Ações do super".')) return
    const ctx = await capturarContexto()
    const { error } = await superExcluir('profiles', id, ctx)
    if (error) { setEditMsg('Erro ao excluir perfil: ' + error.message); return }
    setPerfis(prev => { const c = { ...prev }; delete c[id]; return c })
    setUserSel(null)
  }
  async function excluirIngrediente(id: number, nome: string) {
    if (!confirm(`Excluir o ingrediente "${nome}"? Isso pode quebrar os custos dos pratos que o usam. A ação fica registrada em "Ações do super".`)) return
    const ctx = await capturarContexto()
    const { error } = await superExcluir('ingredientes', id, ctx)
    if (error) { alert('Erro ao excluir: ' + error.message); return }
    window.location.reload()
  }

  if (!contribs) return <p className="text-sm text-muted text-center py-16">Carregando painel…</p>

  // ── detalhe de um usuário ───────────────────────────────────────────────────
  if (userSel) {
    const p = perfis[userSel]
    const cs = contribs.filter(c => c.user_id === userSel)
    const ap = cs.filter(c => c.status === 'aprovada').length
    const rj = cs.filter(c => c.status === 'rejeitada').length
    const taxa = ap + rj > 0 ? Math.round((ap / (ap + rj)) * 100) : null
    const pontos = cs.filter(c => c.lat != null && c.lng != null).map(c => ({
      lat: c.lat as number, lng: c.lng as number, color: CORES_REGIAO[p?.regiao ?? ''] ?? '#c0492b',
      label: `${c.ingredientes?.nome || c.produto || 'Produto'}${c.preco != null ? ` — ${brl(Number(c.preco))}` : ''}`,
    }))
    return (
      <div className="space-y-5">
        <button onClick={() => setUserSel(null)} className="text-sm text-paprika hover:underline">← todos os usuários</button>
        <div className="border border-line rounded-lg bg-panel p-4">
          <p className="font-medium text-lg">{p?.nome || 'Usuário sem nome'}</p>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2 text-sm mt-3">
            <div><dt className="text-xs text-muted">Região</dt><dd>{p?.regiao || '—'}</dd></div>
            <div><dt className="text-xs text-muted">Sexo</dt><dd>{sexoLabel(p?.sexo ?? null)}</dd></div>
            <div><dt className="text-xs text-muted">Idade</dt><dd>{idade(p?.data_nascimento) ?? '—'}{idade(p?.data_nascimento) != null ? ' anos' : ''}</dd></div>
            <div><dt className="text-xs text-muted">Telefone</dt><dd>{p?.telefone || '—'}</dd></div>
            <div><dt className="text-xs text-muted">Contribuições</dt><dd>{cs.length}</dd></div>
            <div><dt className="text-xs text-muted">Aprovadas</dt><dd className="text-olive">{ap}</dd></div>
            <div><dt className="text-xs text-muted">Rejeitadas</dt><dd className="text-red-600">{rj}</dd></div>
            <div><dt className="text-xs text-muted">Taxa de aprovação</dt><dd>{taxa != null ? `${taxa}%` : '—'}</dd></div>
          </dl>
          {souSuper && (
            <div className="mt-3 pt-3 border-t border-line flex items-center gap-2 flex-wrap">
              <button onClick={() => setEditPerfil(editPerfil?.id === userSel ? null : { ...(p ?? { id: userSel, nome: null, regiao: null, telefone: null, sexo: null, data_nascimento: null, is_admin: false, is_super: false }) })}
                className="text-sm border border-line text-muted px-3 py-1.5 rounded-md hover:bg-cream transition">
                {editPerfil?.id === userSel ? 'Cancelar' : 'Editar perfil'}
              </button>
              <button onClick={() => excluirPerfil(userSel)}
                className="text-sm border border-red-200 text-red-600 px-3 py-1.5 rounded-md hover:bg-red-50 transition">Excluir perfil</button>
              {editMsg && <span className="text-xs text-muted">{editMsg}</span>}
            </div>
          )}
          {souSuper && editPerfil?.id === userSel && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <label>Nome
                <input value={editPerfil.nome ?? ''} onChange={e => setEditPerfil(v => v && ({ ...v, nome: e.target.value || null }))} className={inputCls} />
              </label>
              <label>Telefone
                <input value={editPerfil.telefone ?? ''} onChange={e => setEditPerfil(v => v && ({ ...v, telefone: e.target.value || null }))} className={inputCls} />
              </label>
              <label>Região
                <input value={editPerfil.regiao ?? ''} onChange={e => setEditPerfil(v => v && ({ ...v, regiao: e.target.value || null }))} className={inputCls} />
              </label>
              <label className="flex items-center gap-2 mt-1 col-span-2 sm:col-span-1">
                <input type="checkbox" checked={!!editPerfil.is_admin} onChange={e => setEditPerfil(v => v && ({ ...v, is_admin: e.target.checked }))} /> admin
              </label>
              <label className="flex items-center gap-2 mt-1 col-span-2 sm:col-span-1">
                <input type="checkbox" checked={!!editPerfil.is_super} onChange={e => setEditPerfil(v => v && ({ ...v, is_super: e.target.checked }))} /> superusuário
              </label>
              <button onClick={() => salvarPerfil(editPerfil)}
                className="text-sm bg-paprika text-white px-4 py-1.5 rounded-md hover:brightness-95 transition col-span-2 sm:col-span-1 self-end">Salvar perfil</button>
            </div>
          )}
        </div>
        {pontos.length > 0 && <MapaLocal points={pontos} height="320px" />}
        {(recalcDirty || editMsg) && (
          <div className="flex items-center gap-3">
            {recalcDirty && (
              <button onClick={recalcEdit} disabled={salvandoEdit}
                className="text-sm bg-olive text-white px-4 py-1.5 rounded-md hover:brightness-95 transition disabled:opacity-60">
                {salvandoEdit ? 'Recalculando…' : 'Recalcular custos do índice'}
              </button>
            )}
            {editMsg && <span className="text-xs text-muted">{editMsg}</span>}
          </div>
        )}
        <div className="space-y-2">
          {cs.map(c => edit?.id === c.id ? (
            <FormEdicao key={c.id} edit={edit} setEdit={setEdit} ings={ings} salvando={salvandoEdit} onSalvar={salvarEdit} />
          ) : (
            <div key={c.id} className="flex items-center gap-3 border border-line rounded-md p-2 bg-panel text-sm">
              <span className="flex-1 min-w-0 truncate">{c.ingredientes?.nome || c.produto || 'Produto'}</span>
              <span className="tnum">{c.preco != null ? brl(Number(c.preco)) : '—'}</span>
              <span className="text-xs text-muted shrink-0">{new Date(c.criado_em).toLocaleDateString('pt-BR')}{c.cidade ? ` · ${c.cidade}` : ''}</span>
              <span className="text-[0.6rem] uppercase tracking-wide text-muted shrink-0">{c.status}</span>
              <button onClick={() => { setEdit({ ...c }); setEditMsg('') }} className="text-xs text-paprika hover:underline shrink-0">editar</button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* resumo */}
      {resumo && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card titulo="Contribuições" valor={String(resumo.total)} sub={`${resumo.aprovadas} aprovadas`} />
          <Card titulo="Contribuidores" valor={String(resumo.contribuidores)} />
          <Card titulo="Cobertura" valor={`${resumo.cobertura}%`} sub={`de ${ings.length} ingredientes`} />
          <Card titulo="Índice atual" valor={indice != null ? brl(indice) : '—'} />
        </div>
      )}

      {/* sub-abas */}
      <div className="flex items-center gap-4 border-b border-line">
        {([['usuarios', 'Usuários'], ['mapa', 'Mapa'], ['ingredientes', 'Ingredientes']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setSub(k)}
            className={`text-sm pb-2 -mb-px border-b-2 transition ${sub === k ? 'border-paprika text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
            {label}
          </button>
        ))}
        <button
          onClick={() => baixarCSV('contribuicoes.csv', [
            ['usuario', 'regiao', 'ingrediente', 'preco', 'peso_g', 'mercado', 'cidade', 'status', 'data'],
            ...contribs.map(c => [perfis[c.user_id]?.nome ?? '', perfis[c.user_id]?.regiao ?? '', c.ingredientes?.nome ?? nomeIng[c.ingrediente_id ?? -1] ?? '', c.preco, c.peso_g, c.mercado, c.cidade, c.status, new Date(c.criado_em).toLocaleDateString('pt-BR')]),
          ])}
          className="text-xs text-paprika hover:underline ml-auto self-center">Exportar CSV</button>
      </div>

      {/* USUÁRIOS */}
      {sub === 'usuarios' && (
        <div className="space-y-2">
          {!usuarios.length && <p className="text-sm text-muted">Nenhuma contribuição ainda.</p>}
          {usuarios.map(u => (
            <button key={u.id} onClick={() => setUserSel(u.id)}
              className="w-full text-left border border-line rounded-lg bg-panel p-3 hover:bg-cream transition flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{perfis[u.id]?.nome || 'Usuário sem nome'}
                  <span className="text-xs text-muted font-normal"> · {perfis[u.id]?.regiao || 'região —'}</span>
                </p>
                <p className="text-xs text-muted truncate">{u.cidades.join(', ') || 'sem cidade'} · última {new Date(u.ultima).toLocaleDateString('pt-BR')}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm tnum"><span className="font-medium">{u.count}</span> contrib.</p>
                <p className="text-xs text-muted"><span className="text-olive">{u.aprovadas}✓</span> {u.rejeitadas > 0 && <span className="text-red-600">{u.rejeitadas}✗</span>} {u.pendentes > 0 && <span>{u.pendentes}⋯</span>}</p>
              </div>
              <span className="text-muted">›</span>
            </button>
          ))}
        </div>
      )}

      {/* MAPA */}
      {sub === 'mapa' && (() => {
        const pontos = contribs.filter(c => c.lat != null && c.lng != null).map(c => ({
          lat: c.lat as number, lng: c.lng as number,
          color: CORES_REGIAO[perfis[c.user_id]?.regiao ?? ''] ?? '#9ca3af',
          label: `${c.ingredientes?.nome || c.produto || 'Produto'}${c.preco != null ? ` — ${brl(Number(c.preco))}` : ''}${c.cidade ? ` · ${c.cidade}` : ''}`,
        }))
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {Object.entries(CORES_REGIAO).map(([r, cor]) => (
                <span key={r} className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full" style={{ background: cor }} />{r}</span>
              ))}
              <span className="text-muted">{pontos.length} pontos · zoom para ver as ruas</span>
            </div>
            {pontos.length ? <MapaLocal points={pontos} height="460px" /> : <p className="text-sm text-muted">Nenhuma contribuição com localização.</p>}
          </div>
        )
      })()}

      {/* INGREDIENTES */}
      {sub === 'ingredientes' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <label className="text-xs flex-1">Buscar ingrediente
              <input value={ingBusca} onChange={e => setIngBusca(e.target.value)} placeholder="ex: cebola" className={inputCls} />
            </label>
            <label className="text-xs">Contribuições a partir de
              <input type="date" value={ingDesde} onChange={e => setIngDesde(e.target.value)} className={inputCls} />
            </label>
            <label className="text-xs">Preço ≥ R$
              <input value={ingPrecoMin} onChange={e => setIngPrecoMin(e.target.value)} inputMode="decimal" placeholder="ex: 10" className={inputCls} />
            </label>
          </div>

          {(recalcDirty || editMsg) && (
            <div className="flex items-center gap-3">
              {recalcDirty && (
                <button onClick={recalcEdit} disabled={salvandoEdit}
                  className="text-sm bg-olive text-white px-4 py-1.5 rounded-md hover:brightness-95 transition disabled:opacity-60">
                  {salvandoEdit ? 'Recalculando…' : 'Recalcular custos do índice'}
                </button>
              )}
              {editMsg && <span className="text-xs text-muted">{editMsg}</span>}
            </div>
          )}

          {/* o que falta — priorizado por impacto */}
          {cobertura.faltam.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">Sem contribuições <span className="text-muted font-normal">— priorizado por impacto (nº de pratos)</span></h3>
              <div className="flex flex-wrap gap-2">
                {cobertura.faltam.map(x => (
                  <span key={x.ing.id} className="text-xs border border-red-200 bg-red-50 text-red-700 rounded-md px-2 py-1">
                    {x.ing.nome} <span className="text-red-400">· {x.uso} prato{x.uso === 1 ? '' : 's'}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* com contribuições */}
          <div>
            <h3 className="text-sm font-medium mb-2">Com contribuições <span className="text-muted font-normal">— {cobertura.cobertos.length} itens</span></h3>
            <div className="space-y-2">
              {cobertura.cobertos.map(x => {
                const f = frescor(dias(x.ultima))
                const aberto = ingAberto === x.ing.id
                return (
                  <div key={x.ing.id} className="border border-line rounded-lg bg-panel">
                    <button onClick={() => setIngAberto(aberto ? null : x.ing.id)} className="w-full flex items-center gap-3 p-3 text-left hover:bg-cream transition rounded-lg">
                      <span className="flex-1 min-w-0 truncate text-sm font-medium">{x.ing.nome}</span>
                      <span className="text-xs text-muted">{x.uso} prato{x.uso === 1 ? '' : 's'}</span>
                      <span className="text-sm tnum">{x.n}×</span>
                      <span className={`text-[0.6rem] uppercase tracking-wide border rounded px-1.5 py-0.5 ${f.cls}`}>{f.txt}</span>
                      <span className="text-muted text-xs">{aberto ? '−' : '+'}</span>
                    </button>
                    {aberto && (
                      <div className="px-3 pb-3 border-t border-line/60 space-y-2 pt-2">
                        {x.cs.map(c => edit?.id === c.id ? (
                          <FormEdicao key={c.id} edit={edit} setEdit={setEdit} ings={ings} salvando={salvandoEdit} onSalvar={salvarEdit} />
                        ) : (
                          <div key={c.id} className="flex items-center gap-3 text-xs py-1">
                            <span className="text-muted shrink-0">{new Date(c.criado_em).toLocaleDateString('pt-BR')}</span>
                            <span className="tnum">{c.preco != null ? brl(Number(c.preco)) : '—'}</span>
                            <span className="text-muted truncate min-w-0 flex-1">{c.mercado || '—'}{c.cidade ? ` · ${c.cidade}` : ''}</span>
                            <span className="text-[0.6rem] uppercase tracking-wide text-muted shrink-0">{c.status}</span>
                            <button onClick={() => { setEdit({ ...c }); setEditMsg('') }} className="text-paprika hover:underline shrink-0">editar</button>
                          </div>
                        ))}
                        {souSuper && (
                          <button onClick={() => excluirIngrediente(x.ing.id, x.ing.nome)}
                            className="text-xs text-red-600 hover:underline">excluir ingrediente</button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Card({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) {
  return (
    <div className="border border-line rounded-lg bg-panel p-3">
      <p className="text-xs text-muted">{titulo}</p>
      <p className="font-[family-name:var(--font-serif)] text-2xl tnum mt-0.5">{valor}</p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

const inputCls = 'w-full bg-cream border border-line rounded-md px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-paprika mt-1'
