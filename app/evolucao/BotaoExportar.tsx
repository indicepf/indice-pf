'use client'

import { baixarCSV, baixarXLSX, type AbaExport } from '@/lib/exportar'

// Botão de exportar: CSV (1ª aba) ou XLSX (todas as abas). `abas` é uma função para
// gerar os dados só no clique (evita recomputar a cada render).
export default function BotaoExportar({ nome, abas }: { nome: string; abas: () => AbaExport[] }) {
  return (
    <div className="inline-flex items-center border border-line rounded-md overflow-hidden text-xs bg-panel">
      <span className="px-2.5 py-1.5 text-muted">Exportar</span>
      <button onClick={() => { const a = abas(); baixarCSV(nome, a[0]?.linhas || []) }}
        className="px-2.5 py-1.5 border-l border-line text-muted hover:text-ink transition-colors">CSV</button>
      <button onClick={() => baixarXLSX(nome, abas())}
        className="px-2.5 py-1.5 border-l border-line text-muted hover:text-ink transition-colors">XLSX</button>
    </div>
  )
}
