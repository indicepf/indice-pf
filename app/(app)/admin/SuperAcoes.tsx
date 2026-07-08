'use client'

import { useEffect, useState } from 'react'
import { inputBase } from '@/components/ui'
import { getSuperAcoes, type SuperAcaoRow } from '@/lib/queries'
import { resumoDispositivo } from '@/lib/contexto'
import { diffCampos, mapaLink, val } from './Auditoria'

const TABELAS = ['contribuicoes', 'pagamentos', 'profiles', 'login_log', 'precos_manuais_hist', 'ingredientes', 'resultados_brutos']
const ACAO_CLS: Record<string, string> = {
  UPDATE: 'text-dim border-border',
  DELETE: 'text-danger border-danger/30 bg-danger/5',
}

export default function SuperAcoes() {
  const [rows, setRows] = useState<SuperAcaoRow[] | null>(null)
  const [tabela, setTabela] = useState(''); const [acao, setAcao] = useState(''); const [desde, setDesde] = useState('')
  const [aberto, setAberto] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  async function carregar() {
    setBusy(true)
    setRows(await getSuperAcoes({
      tabela: tabela || undefined, acao: acao || undefined,
      desde: desde ? new Date(desde + 'T00:00:00').toISOString() : undefined,
    }))
    setBusy(false)
  }
  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-5">
      <p className="text-sm text-dim">
        Registro <strong>imutável</strong> de tudo que os superusuários excluíram ou editaram —
        ninguém (nem o próprio super) pode apagar ou alterar este histórico.
      </p>

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
            <option value="UPDATE">Edição</option>
            <option value="DELETE">Exclusão</option>
          </select>
        </label>
        <label className="text-xs">A partir de
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className={inputCls} />
        </label>
        <button onClick={carregar} disabled={busy}
          className="text-sm bg-accent text-white px-4 py-1.5 rounded-md hover:brightness-95 transition disabled:opacity-60">
          {busy ? 'Filtrando…' : 'Aplicar'}
        </button>
      </div>

      {rows === null ? <p className="text-sm text-dim">Carregando…</p>
        : !rows.length ? <p className="text-sm text-dim text-center py-8">Nenhuma ação para este filtro.</p>
        : (
          <div className="space-y-2">
            {rows.map(r => {
              const campos = r.acao === 'UPDATE' ? diffCampos(r.dados_antes, r.dados_depois) : diffCampos(r.dados_antes, null)
              const ab = aberto === r.id
              const link = mapaLink(r.lat, r.lng)
              return (
                <div key={r.id} className="border border-border rounded-lg bg-surface">
                  <button onClick={() => setAberto(ab ? null : r.id)} className="w-full min-w-0 flex items-center gap-2 p-3 text-left hover:bg-surface-2 transition rounded-lg text-sm">
                    <span className={`text-[0.6rem] uppercase tracking-wide border rounded px-1.5 py-0.5 shrink-0 ${ACAO_CLS[r.acao] || ''}`}>{r.acao}</span>
                    <span className="font-medium shrink-0">{r.tabela}</span>
                    <span className="text-dim shrink-0">#{r.registro_id ?? '—'}</span>
                    <span className="text-dim ml-auto text-xs truncate min-w-0">{r.ator_nome || 'super'} · {new Date(r.criado_em).toLocaleString('pt-BR')}</span>
                    <span className="text-dim text-xs shrink-0">{ab ? '−' : '+'}</span>
                  </button>
                  {ab && (
                    <div className="px-3 pb-3 border-t border-border/60 pt-2 space-y-2">
                      <p className="text-xs text-dim">
                        {resumoDispositivo(r.dispositivo)}
                        {link && <> · <a href={link} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">local</a></>}
                      </p>
                      {!campos.length ? <p className="text-xs text-dim">Sem dados registrados.</p> : (
                        <table className="w-full text-xs">
                          <thead><tr className="text-left text-dim"><th className="font-medium py-1">Campo</th><th className="font-medium py-1">Antes</th><th className="font-medium py-1">Depois</th></tr></thead>
                          <tbody>
                            {campos.map(c => (
                              <tr key={c.campo} className="border-t border-border/60 align-top">
                                <td className="py-1 pr-2 font-medium">{c.campo}</td>
                                <td className="py-1 pr-2 text-dim break-all">{val(c.antes)}</td>
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
            {rows.length === 500 && <p className="text-xs text-dim text-center">Mostrando as 500 mais recentes.</p>}
          </div>
        )}
    </div>
  )
}

const inputCls = inputBase
