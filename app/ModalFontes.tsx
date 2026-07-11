'use client'

import { brl } from '@/lib/format'
import { useDialogo } from '@/components/ui/useDialogo'
import type { Fonte } from '@/lib/types'
import type { FonteManual } from '@/lib/queries'

const fmtBr = (d: string) => { const [a, m, dia] = d.split('-'); return `${dia}/${m}/${a}` }

export default function ModalFontes({ nome, fontes, manuais, dataColeta, onClose }: {
  nome: string; fontes: Fonte[]; manuais: FonteManual[]; dataColeta?: string; onClose: () => void
}) {
  const ref = useDialogo<HTMLDivElement>(onClose)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 px-4" onClick={onClose}>
      <div ref={ref} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Fontes — ${nome}`}
        className="bg-panel border border-line rounded-lg max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-xl">
        <div className="flex justify-between items-center px-5 py-4 border-b border-line sticky top-0 bg-panel">
          <h4 className="font-[family-name:var(--font-serif)] text-lg">Fontes — {nome}</h4>
          <button onClick={onClose} aria-label="Fechar" className="text-muted hover:text-ink text-xl leading-none"><span aria-hidden="true">×</span></button>
        </div>
        <div className="p-4 space-y-4">
          {manuais.length > 0 && (
            <div className="space-y-2">
              <p className="text-[0.65rem] uppercase tracking-wide text-muted">Leituras de campo e manuais (janela ±10 dias)</p>
              {manuais.map((m, i) => (
                <div key={i} className="border border-line rounded-md px-3 py-2.5">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm truncate">
                        {m.loja || (m.origem === 'campo' ? 'Coleta de campo' : 'Coleta manual')}
                        <span className="ml-1.5 text-[0.6rem] uppercase tracking-wide text-muted border border-line rounded px-1 py-px align-middle">
                          {m.origem === 'campo' ? 'usuário' : 'manual'}
                        </span>
                      </p>
                      <p className="text-xs text-muted">{new Date(m.criado_em).toLocaleDateString('pt-BR')}
                        {m.link && <> · <a href={m.link} target="_blank" rel="noopener noreferrer" className="text-paprika hover:underline">link</a></>}
                      </p>
                    </div>
                    <p className="text-sm font-medium tnum text-paprika shrink-0">{m.preco_manual != null ? `${brl(Number(m.preco_manual))}/kg` : '—'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {fontes.length > 0 && (
            <div className="space-y-2">
              <p className="text-[0.65rem] uppercase tracking-wide text-muted">Fontes online{dataColeta ? ` · coleta de ${fmtBr(dataColeta)}` : ''}</p>
              {fontes.map((f, i) => (
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
              ))}
            </div>
          )}
          {!manuais.length && !fontes.length && <p className="text-sm text-muted">Sem fontes registradas.</p>}
        </div>
      </div>
    </div>
  )
}
