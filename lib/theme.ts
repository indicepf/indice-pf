// Fonte única das cores usadas FORA do CSS (Recharts, mapas, OG images).
// Espelha os tokens de app/globals.css — manter os dois em sincronia.
// Consumidores migram para cá nas Fases 2 e 5 (plano em docs/migracao-frontend-v1.html).

export const BRAND = {
  magenta: '#8D4CB2',
  roxo: '#6954BD',
  azul: '#0069D4',
  ciano: '#00A7E2',
  verde: '#20C58C',
} as const

// acento primário de UI (D1)
export const ACCENT = BRAND.azul

export const SEMANTIC = {
  ok: '#12b76a',
  warn: '#f59e0b',
  danger: '#ef4444',
  info: '#0ea5e9',
} as const

export const INK = '#12203a'
export const DIM = '#6b7a93'
export const FAINT = '#9aa7bd'
export const SURFACE = '#ffffff'
export const BORDER = '#e2e8f2'

// convenção V1 de variação de preço: alta = vermelho, queda = verde
export const COR_ALTA = SEMANTIC.danger
export const COR_QUEDA = SEMANTIC.ok

// séries categóricas de gráficos (ordem pensada para contraste entre vizinhas)
export const CHART_SERIES = [
  BRAND.azul,
  BRAND.verde,
  BRAND.magenta,
  SEMANTIC.warn,
  BRAND.ciano,
  BRAND.roxo,
] as const

// cor fixa por região (chaves = REGIOES de lib/format.ts; papéis de matiz
// próximos aos usados na V0 em admin/Painel.tsx para não trocar a leitura)
export const CORES_REGIAO: Record<string, string> = {
  'Sul': BRAND.azul,
  'Sudeste': BRAND.magenta,
  'Centro-oeste': SEMANTIC.warn,
  'Nordeste': BRAND.verde,
  'Norte': BRAND.roxo,
}

// grupos de ingredientes (GRUPOS_CAT de lib/queries.ts — barras empilhadas do Histórico)
export const CORES_GRUPO: Record<string, string> = {
  'Proteína': BRAND.magenta,
  'Base': SEMANTIC.warn,
  'Guarnição': BRAND.roxo,
  'Verdura/Fruta': BRAND.verde,
  'Temperos': BRAND.ciano,
  'Gordura/Laticínio': BRAND.azul,
  'Outro': FAINT,
}

// extremos da escala sequencial (ex.: intensidade de custo em mapas/heatmaps)
export const ESCALA_SEQ = { claro: '#e7eefb', escuro: BRAND.azul } as const
