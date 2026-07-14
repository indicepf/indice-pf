'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import {
  getCalculadora, getSeriePrecos, getPratosSalvos, salvarPratoUsuario,
  GRUPOS_CAT, LIMITE_PRATOS_FREE, LIMITE_PRATOS_PREMIUM,
  type ItemCalc, type SeriePrecos, type PratoSalvo,
} from '@/lib/queries'
import { NIVEIS_PRECO, brl } from '@/lib/format'
import { CORES_GRUPO, NIVEL_HEX, DIM } from '@/lib/theme'
import { useAuth } from '@/app/useAuth'
import { Button, Input, Modal } from '@/components/ui'
import ShareModal from '@/components/dashboard/ShareModal'

// Calculadora de PF: o usuário monta o prato clicando nos ingredientes
// (chips aninhados por grupo → subcategoria) e ajustando a porção SERVIDA;
// compra e custo saem pela metodologia do índice (compra = servido × FC).
type Linha = { id: number; g: number }

const G_PADRAO: Record<string, number> = {
  'Proteína': 150, 'Base': 150, 'Guarnição': 100, 'Verdura/Fruta': 50,
  'Gordura/Laticínio': 15, 'Temperos': 3, 'Outro': 30,
}

// Subcategoria por afinidade dentro do grupo — agrupamento APROVADO pelo
// responsável em 13/07/2026. Listas explícitas de nomes (nunca regex de
// substring: "ovina" ⊂ "bOVINA" causou o bug de 12/07); ingrediente fora
// das listas cai no subgrupo padrão da categoria dele (fallback, não some).
const SUB_POR_NOME: Record<string, string> = {}
const def = (sub: string, nomes: string[]) => nomes.forEach(n => { SUB_POR_NOME[n] = sub })
// Proteína
def('Miúdos bovinos', ['Fígado bovino', 'Bucho/Dobradinha bovina', 'Mocotó (pata bovina)', 'Rabada bovina'])
def('Embutidos e defumados', ['Linguiça calabresa', 'Linguiça defumada', 'Linguiça toscana (suína)', 'Bacon', 'Presunto'])
def('Miúdos suínos', ['Miúdos suínos'])
def('Frutos do mar', ['Camarão fresco', 'Camarão seco', 'Carne de siri', 'Sururu'])
def('Peixe de água doce', ['Pintado (peixe)', 'Tambaqui (peixe)', 'Pacu (peixe)', 'Pirarucu seco'])
// Base
def('Feijões e leguminosas', ['Feijão branco', 'Feijão carioca', 'Feijão de corda', 'Feijão preto', 'Grão-de-bico'])
def('Farinhas e fubás', ['Farinha de mandioca', 'Farinha de rosca', 'Farinha de trigo', 'Fubá de milho', 'Flocão de milho (cuscuz)', 'Goma de tapioca'])
def('Arroz e massas', ['Arroz branco', 'Macarrão'])
def('Pães', ['Pão francês', 'Pão de alho (bisnaga)'])
// Verdura/Fruta
def('Folhas', ['Alface', 'Rúcula', 'Escarola/Chicória', 'Couve', 'Jambu', 'Maniva (folha de mandioca)'])
def('Legumes', ['Abóbora', 'Cenoura', 'Milho verde', 'Pimentão', 'Quiabo', 'Repolho', 'Tomate'])
def('Conservas e regionais', ['Champignon (conserva)', 'Palmito', 'Guariroba'])
// Temperos
def('Base de cozinha', ['Alho', 'Cebola', 'Sal'])
def('Ervas frescas', ['Cheiro-verde', 'Coentro', 'Hortelã', 'Manjericão'])
def('Especiarias e pimentas', ['Açafrão da terra', 'Colorau/Urucum', 'Cominho', 'Louro (folha)', 'Orégano', 'Pimenta do reino', 'Pimenta (fresca)'])
def('Regionais', ['Tucupi', 'Açaí (polpa)'])
// Gordura/Laticínio
def('Óleos e gorduras', ['Óleo de soja', 'Azeite de oliva', 'Azeite de dendê', 'Banha suína'])
def('Queijos', ['Queijo coalho', 'Queijo mussarela', 'Queijo parmesão', 'Queijo prato'])
def('Leites, cremes e manteiga', ['Leite', 'Leite de coco', 'Creme de leite', 'Manteiga'])

// fallback por categoria (item novo sem lista aparece aqui, nunca some)
const SUB_PADRAO: Record<string, string> = {
  'Proteína bovina': 'Bovinos', 'Proteína suína': 'Suínos',
  'Proteína ovina/caprina': 'Ovinos e caprinos', 'Proteína caprina': 'Ovinos e caprinos',
  'Proteína aves': 'Aves', 'Ovos': 'Ovos',
  'Pescado': 'Peixe do mar', 'Proteína pescado': 'Peixe do mar',
  'Grão/Cereal': 'Farinhas e fubás', 'Leguminosa': 'Feijões e leguminosas',
  'Tubérculo/Raiz': 'Tubérculos e raízes',
  'Legume/Verdura': 'Legumes', 'Fruta': 'Frutas',
  'Tempero/Erva': 'Especiarias e pimentas', 'Condimento/Molho': 'Molhos e condimentos',
  'Líquido regional': 'Regionais',
  'Gordura/Óleo': 'Óleos e gorduras', 'Laticínio': 'Leites, cremes e manteiga',
}
function subgrupo(i: ItemCalc): string {
  return SUB_POR_NOME[i.nome] ?? SUB_PADRAO[i.categoria || ''] ?? 'Outros'
}

const tsDe = (d: string) => new Date(d + 'T00:00:00').getTime()
const fmtMs = (ms: number) => { const d = new Date(ms); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` }

export default function Calculadora() {
  const { user, isPremium } = useAuth()
  const [itens, setItens] = useState<ItemCalc[] | null>(null)
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [nivel, setNivel] = useState('online')
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<string | null>('Proteína')   // grupo expandido
  const [serie, setSerie] = useState<SeriePrecos | null>(null)
  const [diasSerie, setDiasSerie] = useState(0)                     // 0 = tudo
  const [share, setShare] = useState(false)
  const [salvos, setSalvos] = useState<PratoSalvo[]>([])
  const [modalSalvar, setModalSalvar] = useState(false)
  const [nomePrato, setNomePrato] = useState('')
  const [msgSalvar, setMsgSalvar] = useState('')
  const [msgOk, setMsgOk] = useState('')

  useEffect(() => {
    getCalculadora().then(setItens).catch(() => setItens([]))
    getSeriePrecos().then(setSerie).catch(() => {})
  }, [])
  useEffect(() => { if (user) getPratosSalvos(user.id).then(setSalvos) }, [user])

  // deep-link: ?itens=id:g,id:g&nivel= (é o que o Compartilhar copia)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const raw = q.get('itens')
    if (raw) setLinhas(raw.split(',').map(p => { const [id, g] = p.split(':').map(Number); return { id, g } })
      .filter(l => l.id > 0 && l.g > 0))
    const n = q.get('nivel'); if (n && NIVEIS_PRECO.some(x => x.key === n && x.disponivel)) setNivel(n)
  }, [])
  useEffect(() => {
    const q = new URLSearchParams()
    if (linhas.length) q.set('itens', linhas.map(l => `${l.id}:${l.g}`).join(','))
    if (nivel !== 'online') q.set('nivel', nivel)
    const qs = q.toString()
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
  }, [linhas, nivel])

  const porId = useMemo(() => new Map((itens || []).map(i => [i.id, i])), [itens])
  // grupo → subcategoria → itens (ordem estável)
  const arvore = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const out: Record<string, Record<string, ItemCalc[]>> = {}
    for (const i of itens || []) {
      if (q && !i.nome.toLowerCase().includes(q)) continue
      ;((out[i.grupo] ||= {})[subgrupo(i)] ||= []).push(i)
    }
    return out
  }, [itens, busca])

  const fator = 1 - (NIVEIS_PRECO.find(n => n.key === nivel)?.desc ?? 0)
  const usados = useMemo(() => new Set(linhas.map(l => l.id)), [linhas])

  function toggle(i: ItemCalc) {
    setLinhas(ls => usados.has(i.id) ? ls.filter(l => l.id !== i.id)
      : [...ls, { id: i.id, g: G_PADRAO[i.grupo] ?? 50 }])
  }

  const calc = linhas.map(l => {
    const i = porId.get(l.id); if (!i) return null
    const compra = l.g * i.fc
    return { ...l, item: i, compra, custo: i.preco_g * compra * fator }
  }).filter((x): x is NonNullable<typeof x> => x != null)
  const total = calc.reduce((s, c) => s + c.custo, 0)
  const servido = calc.reduce((s, c) => s + c.g, 0)

  // série do prato do usuário: Σ preço online da coleta × compra (carry-forward)
  const seriePrato = useMemo(() => {
    if (!serie || !calc.length) return []
    const corte = diasSerie > 0 && serie.snaps.length
      ? new Date(tsDe(serie.snaps[serie.snaps.length - 1].data) - diasSerie * 86400000)
      : null
    return serie.snaps.map((s, idx) => {
      let v = 0, cheio = true
      for (const c of calc) {
        const p = serie.precoG[c.id]?.[idx]
        if (p == null) { cheio = false; continue }
        v += p * c.compra
      }
      return { ts: tsDe(s.data), data: s.data, valor: +(v * fator).toFixed(2), cheio }
    }).filter(p => p.valor > 0 && (!corte || new Date(p.ts) >= corte))
  }, [serie, calc, fator, diasSerie])

  const limite = isPremium ? LIMITE_PRATOS_PREMIUM : LIMITE_PRATOS_FREE

  async function salvarPrato() {
    if (!user || !nomePrato.trim() || !linhas.length) return
    setMsgSalvar('')
    const { error } = await salvarPratoUsuario(user.id, nomePrato.trim(), linhas)
    if (error) { setMsgSalvar('Não foi possível salvar (a tabela de pratos pode não existir ainda).'); return }
    setModalSalvar(false); setNomePrato('')
    getPratosSalvos(user.id).then(setSalvos)
    setMsgOk('Prato salvo — acompanhe em Meus pratos.')
  }

  if (itens === null) return <p className="text-sm text-dim">Carregando ingredientes…</p>
  if (!itens.length) return <p className="text-sm text-dim">Sem preços disponíveis no momento.</p>

  // painel do grupo aberto (subcategorias → chips); renderizado em dois
  // pontos: logo abaixo do card clicado (mobile) ou abaixo do grid (sm+)
  const painelGrupo = aberto && arvore[aberto] ? (
    <div className="border border-border rounded-[var(--r)] bg-surface p-4 space-y-3">
      {Object.entries(arvore[aberto]).sort(([a], [b]) => a.localeCompare(b)).map(([sub, lista]) => (
        <div key={sub}>
          <p className="text-[0.68rem] uppercase tracking-[0.1em] font-bold text-dim mb-1.5">{sub}</p>
          <div className="flex flex-wrap gap-1.5">
            {lista.map(i => {
              const on = usados.has(i.id)
              return (
                <button key={i.id} onClick={() => toggle(i)} aria-pressed={on}
                  title={`${brl(i.preco_g * 1000 * fator)}/kg cru`}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition cursor-pointer ${
                    on ? 'bg-accent text-white border-accent'
                       : 'bg-surface text-ink-2 border-border-2 hover:border-accent/60 hover:text-ink'}`}>
                  {on ? '✓ ' : ''}{i.nome}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  ) : null

  return (
    <section>
      <p className="text-sm text-dim leading-relaxed">
        Clique nos ingredientes para montar o prato e ajuste os gramas <b>servidos</b>. A calculadora
        corrige pelo rendimento do preparo e usa os preços da última coleta — a mesma metodologia do índice.
      </p>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <input className="f-search max-w-xs" value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar ingrediente..." aria-label="Buscar ingrediente" />
        <div className="segbar">
          {NIVEIS_PRECO.filter(n => n.disponivel).map(n => (
            <button key={n.key} className={nivel === n.key ? 'on' : ''} onClick={() => setNivel(n.key)}>
              <span style={{ background: NIVEL_HEX[n.key], width: 8, height: 8, borderRadius: '50%', display: 'inline-block', marginRight: 5 }} />
              {n.label}
            </button>
          ))}
        </div>
      </div>

      {/* montador: cards por grupo (expande) → subcategorias → chips.
          No mobile o painel abre logo abaixo do card clicado; no desktop
          (sm+) segue abaixo do grid inteiro, como antes */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mt-4">
        {GRUPOS_CAT.map(g => {
          const subs = arvore[g]
          const n = subs ? Object.values(subs).reduce((s, l) => s + l.length, 0) : 0
          const sel = linhas.filter(l => porId.get(l.id)?.grupo === g).length
          return (
            <Fragment key={g}>
              <button disabled={!n} onClick={() => setAberto(a => a === g ? null : g)}
                className={`text-left border rounded-[var(--r)] p-3 transition cursor-pointer disabled:opacity-40 ${
                  aberto === g ? 'border-accent bg-accent/5' : 'border-border bg-surface hover:border-border-strong'}`}>
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span style={{ background: CORES_GRUPO[g], width: 10, height: 10, borderRadius: 3, display: 'inline-block' }} />
                  {g}
                </span>
                <span className="text-xs text-dim mt-0.5 block">{n} itens{sel ? ` · ${sel} no prato` : ''}</span>
              </button>
              {aberto === g && painelGrupo && <div className="sm:hidden">{painelGrupo}</div>}
            </Fragment>
          )
        })}
      </div>
      {painelGrupo && <div className="max-sm:hidden mt-2.5">{painelGrupo}</div>}

      {calc.length > 0 ? (
        <>
          <h3 className="text-[13px] font-bold mt-6 mb-2">Seu prato ({calc.length} ingrediente{calc.length === 1 ? '' : 's'})</h3>
          <div className="overflow-x-auto">
          <table className="tbl-mk compact">
            <thead>
              <tr>
                <th style={{ cursor: 'default' }}>Ingrediente</th>
                <th style={{ textAlign: 'right', cursor: 'default' }} title="Quanto você quer servido no prato">No prato (g)</th>
                <th style={{ textAlign: 'right', cursor: 'default' }} title="Quanto comprar cru, corrigido pelo rendimento do preparo">Compra (g)</th>
                <th className="max-sm:hidden" style={{ textAlign: 'right', cursor: 'default' }}>Preço/kg</th>
                <th style={{ textAlign: 'right', cursor: 'default' }}>Custo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {calc.map(c => (
                <tr key={c.id}>
                  <td className="font-medium">{c.item.nome}</td>
                  <td className="text-right">
                    <input type="number" min={1} max={2000} value={c.g}
                      aria-label={`Gramas de ${c.item.nome} no prato`}
                      onChange={e => {
                        const g = Math.max(0, Number(e.target.value))
                        setLinhas(ls => ls.map(l => l.id === c.id ? { ...l, g } : l))
                      }}
                      className="w-20 text-right tnum border border-border rounded-[var(--r-sm)] px-2 py-1 bg-surface" />
                  </td>
                  <td className="text-right tnum text-dim">{c.compra.toFixed(1)}</td>
                  <td className="max-sm:hidden text-right tnum text-dim">{brl(c.item.preco_g * 1000 * fator)}</td>
                  <td className="text-right tnum font-medium">{brl(c.custo)}</td>
                  <td className="text-right">
                    <button aria-label={`Remover ${c.item.nome}`}
                      onClick={() => setLinhas(ls => ls.filter(l => l.id !== c.id))}
                      className="text-dim hover:text-danger cursor-pointer px-1">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 mt-4">
            <div className="stat-mini"><span className="k">Custo do seu prato</span><b className="tnum">{brl(total)}</b></div>
            <div className="stat-mini"><span className="k">Peso servido</span><b className="tnum">{Math.round(servido)} g</b></div>
            <div className="stat-mini"><span className="k">Custo por 100 g servidos</span><b className="tnum">{servido > 0 ? brl(total / servido * 100) : '—'}</b></div>
          </div>

          {/* histórico do prato montado */}
          {seriePrato.length >= 2 && (
            <div className="border border-border rounded-[var(--r)] bg-surface p-4 mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 className="text-[13px] font-bold">Evolução do seu prato (preço online por coleta)</h3>
                <div className="flex gap-1.5">
                  {([['30d', 30], ['3m', 90], ['Tudo', 0]] as const).map(([label, d]) => (
                    <button key={label} onClick={() => setDiasSerie(d)}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                        diasSerie === d ? 'bg-accent text-white' : 'bg-surface-3 text-ink-2 hover:text-ink'}`}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={seriePrato} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="grad-calc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={NIVEL_HEX[nivel]} stopOpacity={0.22} />
                        <stop offset="100%" stopColor={NIVEL_HEX[nivel]} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']}
                      tickFormatter={fmtMs} tick={{ fontSize: 11, fill: DIM }} />
                    <YAxis tick={{ fontSize: 11, fill: DIM }} width={48} domain={['auto', 'auto']} tickFormatter={(v: number) => `R$${v}`} />
                    <Tooltip formatter={(v) => brl(Number(v))} labelFormatter={(l) => fmtMs(Number(l))} />
                    <Area type="monotone" dataKey="valor" name="Custo" stroke={NIVEL_HEX[nivel]}
                      strokeWidth={2.5} dot={{ r: 4 }} fill="url(#grad-calc)" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              {seriePrato.some(p => !p.cheio) && (
                <p className="text-xs text-faint mt-1.5">Em coletas antigas, ingredientes sem cotação ficam de fora do ponto — a série completa a partir da 1ª cotação de cada item.</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-4">
            <Button onClick={() => setShare(true)}>Compartilhar prato</Button>
            <Button variant="secondary" onClick={() => {
              if (salvos.length >= limite) { setMsgSalvar(`Limite de ${limite} pratos salvos no seu plano.`); return }
              setNomePrato(''); setMsgSalvar(''); setModalSalvar(true)
            }}>Salvar prato</Button>
            <Button variant="secondary" onClick={() => setLinhas([])}>Limpar</Button>
          </div>
          {msgSalvar && <p className="text-xs text-danger mt-2">{msgSalvar}</p>}
          {msgOk && <p className="text-xs text-ok mt-2">{msgOk} <Link href="/meus-pratos" className="underline">Ver agora</Link>.</p>}
        </>
      ) : (
        <p className="text-sm text-dim mt-6 border border-dashed border-border-2 rounded-[var(--r)] p-6 text-center">
          Abra um grupo e clique nos ingredientes para montar o prato — ex.: uma proteína, arroz, feijão e uma salada.
        </p>
      )}

      {share && <ShareModal contexto={`meu prato de ${brl(total)} na calculadora do Índice PF`}
        url={`${window.location.origin}/prato-compartilhado?itens=${linhas.map(l => `${l.id}:${l.g}`).join(',')}${nivel !== 'online' ? `&nivel=${nivel}` : ''}`}
        onClose={() => setShare(false)} />}

      {modalSalvar && (
        <Modal title="Salvar prato" onClose={() => setModalSalvar(false)}>
          <p className="text-sm text-dim">Dê um nome ao prato — ele fica em &ldquo;Meus pratos salvos&rdquo; com o custo atualizado a cada coleta.</p>
          <Input className="mt-3" value={nomePrato} onChange={e => setNomePrato(e.target.value)}
            placeholder="ex.: Meu PF de terça" maxLength={80} aria-label="Nome do prato" />
          {msgSalvar && <p className="text-xs text-danger mt-2">{msgSalvar}</p>}
          <div className="flex gap-2 mt-4">
            <Button variant="secondary" onClick={() => setModalSalvar(false)}>Cancelar</Button>
            <Button disabled={!nomePrato.trim()} onClick={salvarPrato}>Salvar</Button>
          </div>
        </Modal>
      )}
    </section>
  )
}
