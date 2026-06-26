'use client'

import { useEffect, useState } from 'react'
import { getAuditLog, getLogins, type AuditRow, type LoginRow } from '@/lib/queries'
import { resumoDispositivo } from '@/lib/contexto'

const TABELAS = ['contribuicoes', 'pagamentos', 'profiles', 'precos_manuais_hist', 'ingredientes']
const ACAO_CLS: Record<string, string> = {
  INSERT: 'text-olive border-olive/30 bg-olive/5',
  UPDATE: 'text-muted border-line',
  DELETE: 'text-red-600 border-red-200 bg-red-50',
}
function mapaLink(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return null
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`
}
// campos que mudaram entre antes e depois
function diffCampos(antes: any, depois: any) {
  const ks = new Set([...Object.keys(antes || {}), ...Object.keys(depois || {})])
  const out: { campo: string; antes: any; depois: any }[] = []
  ks.forEach(k => {
    const a = antes?.[k], d = depois?.[k]
    if (JSON.stringify(a) !== JSON.stringify(d)) out.push({ campo: k, antes: a, depois: d })
  })
  return out
}
const val = (v: any) => v == null ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v)

export default function Auditoria() {
  const [sub, setSub] = useState<'alteracoes' | 'logins'>('alteracoes')
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  const [logins, setLogins] = useState<LoginRow[] | null>(null)
  const [tabela, setTabela] = useState(''); const [acao, setAcao] = useState(''); const [desde, setDesde] = useState('')
  const [aberto, setAberto] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  async function carregar() {
    setBusy(true)
    setRows(await getAuditLog({
      tabela: tabela || undefined, acao: acao || undefined,
      desde: desde ? new Date(desde + 'T00:00:00').toISOString() : undefined,
    }))
    setBusy(false)
  }
  useEffect(() => { carregar() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])
  useEffect(() => { if (sub === 'logins' && logins === null) getLogins().then(setLogins) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sub])

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 border-b border-line">
        {([['alteracoes', 'Alterações'], ['logins', 'Logins']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setSub(k)}
            className={`text-sm pb-2 -mb-px border-b-2 transition ${sub === k ? 'border-paprika text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      {sub === 'alteracoes' ? (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <label className="text-xs">Tabela
              <select value={tabela} onChange={e => setTabela(e.target.value)} className={inputCls}>
                <option value="">Todas</option>
                {TABELAS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="text-xs">Ação
              <select value={acao} onChange={e => setAcao(e.target.value)} className={inputCls}>
                <option value="">Todas</option>
                <option value="INSERT">Criação</option>
                <option value="UPDATE">Edição</option>
                <option value="DELETE">Exclusão</option>
              </select>
            </label>
            <label className="text-xs">A partir de
              <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className={inputCls} />
            </label>
            <button onClick={carregar} disabled={busy}
              className="text-sm bg-paprika text-white px-4 py-1.5 rounded-md hover:brightness-95 transition disabled:opacity-60">
              {busy ? 'Filtrando…' : 'Aplicar'}
            </button>
          </div>

          {rows === null ? <p className="text-sm text-muted">Carregando…</p>
            : !rows.length ? <p className="text-sm text-muted text-center py-8">Nenhuma alteração para este filtro.</p>
            : (
              <div className="space-y-2">
                {rows.map(r => {
                  const campos = r.acao === 'UPDATE' ? diffCampos(r.dados_antes, r.dados_depois)
                    : r.acao === 'INSERT' ? diffCampos(null, r.dados_depois)
                    : diffCampos(r.dados_antes, null)
                  const ab = aberto === r.id
                  return (
                    <div key={r.id} className="border border-line rounded-lg bg-panel">
                      <button onClick={() => setAberto(ab ? null : r.id)} className="w-full flex items-center gap-2 p-3 text-left hover:bg-cream transition rounded-lg text-sm">
                        <span className={`text-[0.6rem] uppercase tracking-wide border rounded px-1.5 py-0.5 shrink-0 ${ACAO_CLS[r.acao] || ''}`}>{r.acao}</span>
                        <span className="font-medium">{r.tabela}</span>
                        <span className="text-muted">#{r.registro_id ?? '—'}</span>
                        <span className="text-muted ml-auto shrink-0 text-xs">{r.ator_nome} · {new Date(r.criado_em).toLocaleString('pt-BR')}</span>
                        <span className="text-muted text-xs">{ab ? '−' : '+'}</span>
                      </button>
                      {ab && (
                        <div className="px-3 pb-3 border-t border-line/60 pt-2">
                          {!campos.length ? <p className="text-xs text-muted">Sem diferenças registradas.</p> : (
                            <table className="w-full text-xs">
                              <thead><tr className="text-left text-muted"><th className="font-medium py-1">Campo</th><th className="font-medium py-1">Antes</th><th className="font-medium py-1">Depois</th></tr></thead>
                              <tbody>
                                {campos.map(c => (
                                  <tr key={c.campo} className="border-t border-line/60 align-top">
                                    <td className="py-1 pr-2 font-medium">{c.campo}</td>
                                    <td className="py-1 pr-2 text-muted break-all">{val(c.antes)}</td>
                                    <td className="py-1 break-all">{val(c.depois)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                {rows.length === 500 && <p className="text-xs text-muted text-center">Mostrando as 500 mais recentes.</p>}
              </div>
            )}
        </div>
      ) : (
        <div>
          {logins === null ? <p className="text-sm text-muted">Carregando…</p>
            : !logins.length ? <p className="text-sm text-muted text-center py-8">Nenhum login registrado ainda.</p>
            : (
              <div className="border border-line rounded-lg bg-panel overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted border-b border-line">
                      <th className="font-medium px-3 py-2">Usuário</th>
                      <th className="font-medium px-3 py-2">Dispositivo</th>
                      <th className="font-medium px-3 py-2">Local</th>
                      <th className="font-medium px-3 py-2">Quando</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logins.map(l => {
                      const link = mapaLink(l.lat, l.lng)
                      return (
                        <tr key={l.id} className="border-t border-line/60">
                          <td className="px-3 py-2 truncate max-w-[10rem]">{l.nome || '—'}</td>
                          <td className="px-3 py-2 text-muted" title={l.dispositivo || ''}>{resumoDispositivo(l.dispositivo)}</td>
                          <td className="px-3 py-2">{link ? <a href={link} target="_blank" rel="noopener noreferrer" className="text-paprika hover:underline">ver no mapa</a> : <span className="text-muted">—</span>}</td>
                          <td className="px-3 py-2 text-muted">{new Date(l.criado_em).toLocaleString('pt-BR')}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}
    </div>
  )
}

const inputCls = 'w-full bg-cream border border-line rounded-md px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-paprika mt-1'
