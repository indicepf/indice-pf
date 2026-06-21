export const MODOS = [
  { key: 'online',    label: 'Online',    desc: 0.00, nota: 'preço coletado no varejo online' },
  { key: 'mercado',   label: 'Mercado',   desc: 0.10, nota: 'estimativa −10% sobre o online' },
  { key: 'atacarejo', label: 'Atacarejo', desc: 0.22, nota: 'estimativa −22% sobre o online' },
] as const

export const REGIOES = ['Sul', 'Sudeste', 'Centro-oeste', 'Nordeste', 'Norte'] as const

export const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function fmtData(d: string) {
  const [a, m, dia] = d.split('-')
  return `${dia}/${m}/${a}`
}

// remove o "12. " do início do nome do prato
export function limparNome(nome: string) {
  return nome.replace(/^\d+\.\s*/, '')
}

// (XX) XXXXX-XXXX
export function mascararTel(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
export const telValido = (v: string) => v.replace(/\D/g, '').length >= 10
