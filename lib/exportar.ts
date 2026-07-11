// xlsx aparece no npm audit (prototype pollution + ReDoS, sem fix publicado no
// npm). Ambas as falhas estão no PARSING de arquivos de terceiros — aqui o
// pacote só ESCREVE planilhas a partir de dados do próprio app, nunca lê
// arquivo de usuário. Risco aceito; se um dia houver import de planilha,
// trocar por exceljs antes.
import * as XLSX from 'xlsx'

export type AbaExport = { nome: string; linhas: Record<string, any>[] }

export function baixarXLSX(arquivo: string, abas: AbaExport[]) {
  const wb = XLSX.utils.book_new()
  for (const a of abas) {
    const ws = XLSX.utils.json_to_sheet(a.linhas.length ? a.linhas : [{}])
    XLSX.utils.book_append_sheet(wb, ws, a.nome.slice(0, 31))
  }
  XLSX.writeFile(wb, arquivo.endsWith('.xlsx') ? arquivo : arquivo + '.xlsx')
}

export function baixarCSV(arquivo: string, linhas: Record<string, any>[]) {
  const ws = XLSX.utils.json_to_sheet(linhas.length ? linhas : [{}])
  const csv = XLSX.utils.sheet_to_csv(ws)
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = arquivo.endsWith('.csv') ? arquivo : arquivo + '.csv'
  a.click(); URL.revokeObjectURL(url)
}
