'use client'

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

// Substitui o caractere ⓘ (U+24D8) que pode aparecer como ? em alguns ambientes
function IcoInfo({ className = "text-slate-600" }: { className?: string }) {
  return (
    <span aria-hidden className={`inline-flex items-center justify-center rounded-full border border-current font-bold cursor-help select-none ${className}`}
      style={{ width: '1em', height: '1em', fontSize: '0.72em', lineHeight: 1 }}>
      i
    </span>
  )
}
import { supabase, HistoricoPreco } from '@/lib/supabase'
import {
  ComposedChart, BarChart, Bar, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts'

// ─── Paleta ───────────────────────────────────────────────────────────────────
const PALETTE = [
  '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316',
  '#84cc16','#ec4899','#14b8a6','#a78bfa','#fb923c','#4ade80','#60a5fa',
  '#fbbf24','#f472b6','#34d399','#818cf8','#fb7185','#a3e635','#2dd4bf',
  '#c084fc','#fdba74','#86efac','#93c5fd','#fde68a','#d946ef',
]

const CATEGORIA: Record<string, string> = {
  'Frango (coxa/sobrecoxa)': 'Proteína', 'Carne Bovina': 'Proteína',
  'Bisteca Suína': 'Proteína', 'Ovo': 'Proteína',
  'Arroz Branco': 'Base', 'Feijão Carioca': 'Base',
  'Batata Inglesa': 'Guarnição', 'Mandioca': 'Guarnição',
  'Macarrão Espaguete': 'Guarnição', 'Farinha de Mandioca': 'Guarnição',
  'Alface': 'Salada', 'Tomate': 'Salada', 'Pepino': 'Salada',
  'Cenoura': 'Salada', 'Beterraba': 'Salada',
  'Alho': 'Temperos', 'Cebola': 'Temperos', 'Sal': 'Temperos',
  'Colorau': 'Temperos', 'Pimenta do Reino': 'Temperos', 'Cheiro-verde': 'Temperos',
  'Extrato de Tomate': 'Temperos', 'Caldo de Galinha': 'Temperos',
  'Óleo de Soja': 'Temperos', 'Azeite de Oliva': 'Temperos',
  'Vinagre': 'Temperos', 'Limão': 'Temperos',
}

const CATEGORIAS_ORDEM = ['Proteína', 'Base', 'Guarnição', 'Salada', 'Temperos']
const CORES_CAT: Record<string, string> = {
  'Proteína': '#ef4444', 'Base': '#f59e0b',
  'Guarnição': '#8b5cf6', 'Salada': '#10b981', 'Temperos': '#06b6d4',
}
const COR_MEDIANA = '#f59e0b'
const CORES_LINHA = ['#f59e0b','#3b82f6','#10b981','#ef4444','#8b5cf6','#06b6d4']

const LABEL_EXPLICACAO: Record<string, string> = {
  'kg*': 'Estimativa em R$/kg a partir de peso fixo por unidade (ex: cabeça de alface ≈ 300g). Será substituído por preço por unidade na próxima coleta.',
  'bdj30': 'Preço por bandeja com 30 unidades.',
  'maço': 'Preço por maço. Peso estimado ≈ 50g.',
}

type Metrica = 'mediana' | 'media' | 'minimo' | 'maximo'
type Aba = 'dashboard' | 'admin'
type OrdemDir = 'asc' | 'desc'
type GraficoTipo = 'barras' | 'linhas'

type FonteItem = {
  titulo: string
  loja: string
  preco_bruto: number
  preco_normalizado: number
  exibicao: string
  link: string
}

function fmtData(d: string) {
  const [, m, dia] = d.split('-')
  return `${dia}/${m}`
}
function fmtR(v: number | null | undefined) {
  if (v == null || isNaN(Number(v))) return 'N/A'
  return `R$ ${Number(v).toFixed(2)}`
}

// ─── Tooltip gráfico de linhas ─────────────────────────────────────────────
const TooltipPF = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  const items = payload.filter((p: any) => !['dp_superior','dp_inferior'].includes(p.dataKey))
  if (!items.length) return null
  const sup = payload.find((p: any) => p.dataKey === 'dp_superior')?.value
  const inf = payload.find((p: any) => p.dataKey === 'dp_inferior')?.value
  const estimado = payload.find((p: any) => p.dataKey === 'dp_superior')?.payload?.dp_estimado
  return (
    <div className="bg-slate-900 border border-slate-600 rounded-lg p-3 text-xs shadow-xl min-w-44">
      <p className="text-slate-400 mb-2 font-semibold">{label}</p>
      {items.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.stroke || p.color }} />
          <span className="text-slate-300">{p.name}:</span>
          <span className="font-bold text-white">R$ {Number(p.value).toFixed(2)}</span>
        </div>
      ))}
      {sup != null && inf != null && (
        <div className="border-t border-slate-700 mt-2 pt-2 text-slate-500">
          <p>banda ±DP: R${Number(inf).toFixed(2)} – R${Number(sup).toFixed(2)}</p>
          {estimado && <p className="text-slate-600 mt-0.5 italic">* DP estimado (±8%)</p>}
        </div>
      )}
    </div>
  )
}

// ─── Tooltip gráfico de barras/linhas por categoria ───────────────────────
const TooltipCategorias = ({ active, payload, label, tipo }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900 border border-slate-600 rounded-lg p-3 text-xs shadow-xl min-w-48">
      <p className="text-slate-400 mb-2 font-semibold">{label}</p>
      {[...payload].reverse().map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: p.fill || p.stroke }} />
            <span className="text-slate-300">{p.name}</span>
          </div>
          <span className="font-bold text-white">
            {tipo === 'barras' ? `${Number(p.value).toFixed(1)}%` : `R$${Number(p.value).toFixed(2)}`}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Card com hover ────────────────────────────────────────────────────────
function CardInfo({ label, value, sub, color, info }: {
  label: string; value: string; sub: string; color: string; info?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 relative cursor-default"
      onMouseEnter={() => info && setShow(true)}
      onMouseLeave={() => setShow(false)}>
      <div className="flex items-center gap-1.5 mb-1">
        <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
        {info && <IcoInfo className="text-slate-500" />}
      </div>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-1">{sub}</p>
      {show && info && (
        <div className="absolute z-50 top-full left-0 mt-2 w-80 bg-slate-900 border border-slate-500 rounded-lg p-4 text-xs text-slate-300 shadow-2xl leading-relaxed">
          {info}
        </div>
      )}
    </div>
  )
}

// ─── Célula unidade com hover ──────────────────────────────────────────────
function CelulaUnidade({ label }: { label: string }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)
  const explicacao = LABEL_EXPLICACAO[label]
  const handleEnter = () => {
    if (!explicacao || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({ top: r.top - 8, left: r.left + r.width / 2 })
  }
  return (
    <span ref={ref} className="inline-flex items-center gap-1 cursor-default"
      onMouseEnter={handleEnter} onMouseLeave={() => setPos(null)}>
      <span className="text-slate-500">{label}</span>
      {explicacao && <IcoInfo className="text-slate-600" />}
      {pos && explicacao && (
        <span className="fixed z-[200] w-60 bg-slate-900 border border-slate-500 rounded-lg p-3 text-xs text-slate-300 shadow-2xl leading-relaxed whitespace-normal pointer-events-none"
          style={{ top: pos.top, left: pos.left, transform: 'translate(-50%, -100%)' }}>
          {explicacao}
        </span>
      )}
    </span>
  )
}

// ─── Modal de fontes ───────────────────────────────────────────────────────
function ModalFontes({ ingrediente, fontes, data, onClose }: {
  ingrediente: string; fontes: FonteItem[]; data: string; onClose: () => void
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  const isFallback = (link: string) => link.includes('google.com/search?')
  const todosFallback = fontes.every(f => isFallback(f.link))

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60"
      onClick={onClose}>
      <div className="bg-slate-900 border border-slate-600 rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="font-semibold text-slate-200">📦 Fontes — {ingrediente}</h3>
            <p className="text-xs text-slate-500 mt-0.5">snapshot: {data}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-xl leading-none">×</button>
        </div>
        <p className="text-xs text-slate-500 mb-3">{fontes.length} resultado{fontes.length !== 1 ? 's' : ''} únicos coletados do Google Shopping</p>
        {todosFallback && (
          <p className="text-xs text-amber-500/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-3">
            ⚠️ A API não retornou links diretos. Os botões abaixo abrem a busca no Google Shopping para este produto.
          </p>
        )}
        <div className="space-y-2">
          {fontes.map((f, i) => (
            <a key={i} href={f.link || undefined} target="_blank" rel="noopener noreferrer"
              className={`block bg-slate-800 rounded-lg p-3 border transition-colors ${f.link ? 'border-slate-700 hover:border-blue-500 hover:bg-slate-700 cursor-pointer' : 'border-slate-700 cursor-default'}`}
              onClick={e => { if (!f.link) e.preventDefault() }}>
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-slate-200 text-sm font-medium truncate">{f.titulo}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{f.loja}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-amber-400 font-bold text-sm">R$ {Number(f.preco_bruto).toFixed(2)}</p>
                  <p className="text-slate-500 text-xs">{f.exibicao}</p>
                </div>
              </div>
              {f.link && (
                <p className={`mt-2 text-xs ${isFallback(f.link) ? 'text-amber-400/70' : 'text-blue-400'}`}>
                  {isFallback(f.link) ? '🔍 buscar no Google Shopping' : '🔗 ver produto'}
                </p>
              )}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

const PROTEINAS = ['Frango (coxa/sobrecoxa)', 'Carne Bovina', 'Bisteca Suína', 'Ovo']
const PESO_PROTEINA: Record<string, number> = {
  'Frango (coxa/sobrecoxa)': 1.0,
  'Ovo': 1.0,
  'Bisteca Suína': 1.2,
  'Carne Bovina': 1.2,
  'Tilápia': 1.1,
  'Merluza': 1.1,
}

// Calcula custo do PF com média ponderada de proteínas
function calcularCustoPF(
  rows: HistoricoPreco[],
  metrica: Metrica,
  visiveis: Record<string, boolean>
): number {
  const ativos = rows.filter(d => visiveis[d.nome_ingrediente])

  // Separa proteínas ativas
  const proteinas = ativos.filter(d => CATEGORIA[d.nome_ingrediente] === 'Proteína')
  const resto     = ativos.filter(d => CATEGORIA[d.nome_ingrediente] !== 'Proteína')

  // Média ponderada das proteínas ativas
  let custoProteina = 0
  if (proteinas.length > 0) {
    const getPreco = (d: HistoricoPreco) => {
      const base = Number(d.preco) || 0
      if (metrica === 'media'  && d.media)  return Number(d.media)
      if (metrica === 'minimo' && d.minimo) return Number(d.minimo)
      if (metrica === 'maximo' && d.maximo) return Number(d.maximo)
      return base
    }
    // custo_porcao já usa 200g para proteínas — multiplica pelo peso relativo
    const totalPeso = proteinas.reduce((s, d) => s + (PESO_PROTEINA[d.nome_ingrediente] || 1.0), 0)
    const somaPond  = proteinas.reduce((s, d) => {
      if (!d.custo_porcao || !d.preco) return s
      const fator = getPreco(d) / (Number(d.preco) || 1)
      return s + Number(d.custo_porcao) * fator * (PESO_PROTEINA[d.nome_ingrediente] || 1.0)
    }, 0)
    custoProteina = somaPond / totalPeso  // média ponderada = 1 porção de proteína
  }

  // Soma normal dos demais ingredientes
  const custoResto = resto.reduce((acc, d) => {
    if (!d.custo_porcao || !d.preco) return acc
    let val = Number(d.preco)
    if (metrica === 'media'  && d.media)  val = Number(d.media)
    if (metrica === 'minimo' && d.minimo) val = Number(d.minimo)
    if (metrica === 'maximo' && d.maximo) val = Number(d.maximo)
    return acc + Number(d.custo_porcao) * (val / Number(d.preco))
  }, 0)

  return custoProteina + custoResto
}
const GradienteDP = () => (
  <defs>
    <linearGradient id="gradDP" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stopColor={COR_MEDIANA} stopOpacity={0.20} />
      <stop offset="100%" stopColor={COR_MEDIANA} stopOpacity={0.05} />
    </linearGradient>
  </defs>
)

function IconeOrdem({ col, ordemCol, ordemDir }: { col: string; ordemCol: string; ordemDir: OrdemDir }) {
  if (col !== ordemCol) return <span className="text-slate-700 ml-1">↕</span>
  return <span className="text-blue-400 ml-1">{ordemDir === 'asc' ? '↑' : '↓'}</span>
}

function ColunaHeader({ col, label, tip, ordemCol, ordemDir, onClick }: {
  col: string; label: string; tip?: string | null
  ordemCol: string; ordemDir: OrdemDir; onClick: () => void
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const iconRef = useRef<HTMLSpanElement>(null)

  // Renderiza tooltip via portal no document.body para escapar do
  // overflow:hidden implícito da tabela — que impedia o z-index de funcionar.
  const mostrar = useCallback(() => {
    if (!iconRef.current) return
    const r = iconRef.current.getBoundingClientRect()
    setPos({ x: r.left + r.width / 2, y: r.top - 6 })
  }, [])
  const esconder = useCallback(() => setPos(null), [])

  useEffect(() => {
    if (!pos) return
    const hide = () => setPos(null)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => { window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide) }
  }, [pos])

  return (
    <th onClick={onClick}
      className={`font-semibold text-slate-400 uppercase pb-3 pr-2 whitespace-nowrap cursor-pointer hover:text-slate-200 select-none transition-colors ${col === 'nome' ? 'text-left' : 'text-right'}`}>
      <span className="inline-flex items-center gap-1">
        {label}
        {tip && (
          <span ref={iconRef}
            className="cursor-help transition-colors text-slate-600 hover:text-blue-400"
            onMouseEnter={e => { e.stopPropagation(); mostrar() }}
            onMouseLeave={esconder}>
            <IcoInfo />
          </span>
        )}
        <IconeOrdem col={col} ordemCol={ordemCol} ordemDir={ordemDir} />
      </span>
      {pos && tip && typeof document !== 'undefined' && createPortal(
        <span
          role="tooltip"
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y,
            transform: 'translate(-50%, -100%)',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
          className="w-64 bg-slate-900 border border-slate-500 rounded-lg px-3 py-2.5 text-xs text-slate-300 font-normal normal-case shadow-2xl leading-relaxed whitespace-normal text-left">
          {tip}
          <span style={{
            position: 'absolute', bottom: -5, left: '50%',
            transform: 'translateX(-50%)',
            borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
            borderTop: '5px solid #334155',
          }} />
        </span>,
        document.body
      )}
    </th>
  )
}

export default function Dashboard() {
  const [historico, setHistorico]       = useState<HistoricoPreco[]>([])
  const [ultimaData, setUltimaData]     = useState('')
  const [aba, setAba]                   = useState<Aba>('dashboard')
  const [dataInicio, setDataInicio]     = useState('')
  const [dataFim, setDataFim]           = useState('')
  const [visiveis, setVisiveis]         = useState<Record<string, boolean>>({})
  const [metricas, setMetricas]         = useState<Metrica[]>(['mediana'])
  const [mostrarDP, setMostrarDP]       = useState(true)
  const [qtdPratos, setQtdPratos]       = useState(50)
  const [descAtacado, setDescAtacado]   = useState(15)
  const [ordemCol, setOrdemCol]         = useState('nome')
  const [ordemDir, setOrdemDir]         = useState<OrdemDir>('asc')
  const [grafico2Tipo, setGrafico2Tipo] = useState<GraficoTipo>('barras')
  const [loading, setLoading]           = useState(true)
  const [dataTabela, setDataTabela]     = useState('')
  const [modalFontes, setModalFontes]   = useState<{ ingrediente: string; fontes: FonteItem[]; data: string } | null>(null)
  const [fontesCache, setFontesCache]   = useState<Record<string, FonteItem[]>>({})

  useEffect(() => {
    async function carregar() {
      const { data } = await supabase
        .from('historico_precos').select('*').order('data', { ascending: true })
      if (data?.length) {
        setHistorico(data)
        const datas = [...new Set(data.map((d: HistoricoPreco) => d.data))].sort()
        setUltimaData(datas[datas.length - 1])
        setDataTabela(datas[datas.length - 1])
        setDataInicio(datas[0])
        setDataFim(datas[datas.length - 1])
        const vis: Record<string, boolean> = {}
        ;[...new Set(data.map((d: HistoricoPreco) => d.nome_ingrediente))].forEach(i => vis[i] = true)
        setVisiveis(vis)
      }
      setLoading(false)
    }
    carregar()
  }, [])

  // Carrega fontes do ingrediente ao clicar em ...
  async function abrirFontes(ingrediente: string, data?: string) {
    const dataAlvo = data || ultimaData
    const cacheKey = `${ingrediente}__${dataAlvo}`
    if (fontesCache[cacheKey]) {
      setModalFontes({ ingrediente, fontes: fontesCache[cacheKey], data: dataAlvo })
      return
    }
    // Busca snapshot_id da data selecionada
    const { data: snaps } = await supabase
      .from('snapshots')
      .select('id')
      .eq('data', dataAlvo)
      .limit(1)
    const snapshotId = snaps?.[0]?.id
    if (!snapshotId) return

    const { data: rows } = await supabase
      .from('resultados_brutos')
      .select('titulo, loja, preco_bruto, preco_normalizado, exibicao, link')
      .eq('nome_ingrediente', ingrediente)
      .eq('snapshot_id', snapshotId)
      .order('preco_bruto', { ascending: true })

    // Deduplica por título+loja
    const vistos = new Set<string>()
    const fontes = ((rows || []) as FonteItem[]).filter(f => {
      const key = `${f.titulo}__${f.loja}`
      if (vistos.has(key)) return false
      vistos.add(key)
      return true
    })
    setFontesCache(c => ({ ...c, [cacheKey]: fontes }))
    setModalFontes({ ingrediente, fontes, data: dataAlvo })
  }

  const ingredientes = useMemo(() =>
    [...new Set(historico.map(d => d.nome_ingrediente))].sort(), [historico])

  const coresMap = useMemo(() => {
    const m: Record<string, string> = {}
    ingredientes.forEach((n, i) => { m[n] = PALETTE[i % PALETTE.length] })
    return m
  }, [ingredientes])

  const hFiltrado = useMemo(() =>
    historico.filter(d => d.data >= dataInicio && d.data <= dataFim)
  , [historico, dataInicio, dataFim])

  const custoPFMetrica = useMemo(() => {
    const rows = historico.filter(d => d.data === ultimaData)
    return calcularCustoPF(rows, metricas[0], visiveis)
  }, [historico, ultimaData, visiveis, metricas])

  // ── Dados gráfico linhas ──────────────────────────────────────────────────
  const dadosLinha = useMemo(() => {
    const datas = [...new Set(hFiltrado.map(d => d.data))].sort()
    return datas.map(data => {
      const rowsData = hFiltrado.filter(d => d.data === data)
      const ponto: Record<string, any> = { data: fmtData(data) }

      if (metricas.includes('mediana')) {
        const custo = calcularCustoPF(rowsData, 'mediana', visiveis)
        if (custo > 0) ponto['Mediana'] = Number(custo.toFixed(2))
      }

      ;(['media','minimo','maximo'] as Metrica[]).forEach(m => {
        if (!metricas.includes(m)) return
        const label = m === 'media' ? 'Média' : m === 'minimo' ? 'Mínimo' : 'Máximo'
        const custo = calcularCustoPF(rowsData, m, visiveis)
        if (custo > 0) ponto[label] = Number(custo.toFixed(2))
      })

      if (mostrarDP && metricas.includes('mediana') && ponto['Mediana']) {
        const med = ponto['Mediana']
        const rowsAtivos = rowsData.filter(d => visiveis[d.nome_ingrediente])
        const dpReal = rowsAtivos.reduce((acc, d) => {
          if (!d.desvio_padrao || !d.preco || !d.custo_porcao) return acc
          return acc + (Number(d.desvio_padrao) / Number(d.preco)) * Number(d.custo_porcao)
        }, 0)
        if (dpReal > 0) {
          ponto['dp_superior'] = Number((med + dpReal).toFixed(2))
          ponto['dp_inferior'] = Number((med - dpReal).toFixed(2))
          ponto['dp_estimado'] = false
        } else {
          const dpEst = med * 0.08
          ponto['dp_superior'] = Number((med + dpEst).toFixed(2))
          ponto['dp_inferior'] = Number((med - dpEst).toFixed(2))
          ponto['dp_estimado'] = true
        }
      }
      return ponto
    })
  }, [hFiltrado, visiveis, metricas, mostrarDP])

  const linhasKeys = useMemo(() => {
    if (!dadosLinha.length) return []
    return Object.keys(dadosLinha[0]).filter(k =>
      k !== 'data' && !['dp_superior','dp_inferior','dp_estimado'].includes(k)
    )
  }, [dadosLinha])

  // ── Dados gráfico 2 — barras (%) ou linhas (R$) por categoria ────────────
  const dadosCategorias = useMemo(() => {
    const datas = [...new Set(hFiltrado.map(d => d.data))].sort()
    return datas.map(data => {
      const rowsData = hFiltrado.filter(d => d.data === data)
      const custoCat: Record<string, number> = {}
      CATEGORIAS_ORDEM.forEach(c => custoCat[c] = 0)

      // Proteína: usa média ponderada (mesmo critério do índice)
      const proteinas = rowsData.filter(d => CATEGORIA[d.nome_ingrediente] === 'Proteína' && visiveis[d.nome_ingrediente])
      if (proteinas.length > 0) {
        const totalPeso = proteinas.reduce((s, d) => s + (PESO_PROTEINA[d.nome_ingrediente] || 1.0), 0)
        const somaPond  = proteinas.reduce((s, d) => {
          if (!d.custo_porcao) return s
          return s + Number(d.custo_porcao) * (PESO_PROTEINA[d.nome_ingrediente] || 1.0)
        }, 0)
        custoCat['Proteína'] = somaPond / totalPeso
      }

      // Demais categorias: soma normal
      rowsData
        .filter(d => CATEGORIA[d.nome_ingrediente] !== 'Proteína' && visiveis[d.nome_ingrediente])
        .forEach(d => {
          const cat = CATEGORIA[d.nome_ingrediente] || 'Temperos'
          if (d.custo_porcao) custoCat[cat] += Number(d.custo_porcao)
        })

      const total = Object.values(custoCat).reduce((a, b) => a + b, 0)
      if (total < 0.1) return null
      const ponto: Record<string, any> = { data: fmtData(data) }
      if (grafico2Tipo === 'barras') {
        CATEGORIAS_ORDEM.forEach(c => {
          ponto[c] = Number(((custoCat[c] / total) * 100).toFixed(1))
        })
      } else {
        CATEGORIAS_ORDEM.forEach(c => {
          ponto[c] = Number(custoCat[c].toFixed(3))
        })
      }
      return ponto
    }).filter(Boolean)
  }, [hFiltrado, visiveis, grafico2Tipo])

  // ── Tabela ────────────────────────────────────────────────────────────────
  const tabelaBase = useMemo(() => {
    return ingredientes.filter(n => visiveis[n]).map(nome => {
      const serie    = historico.filter(d => d.nome_ingrediente === nome)
      const snapshot = serie.find(d => d.data === dataTabela)
      const primeiro = hFiltrado.filter(d => d.nome_ingrediente === nome).find(d => d.data >= dataInicio)
      const ultimo   = hFiltrado.filter(d => d.nome_ingrediente === nome).filter(d => d.data <= dataFim).pop()
      const inflacao = (primeiro?.preco && ultimo?.preco)
        ? ((Number(ultimo.preco) - Number(primeiro.preco)) / Number(primeiro.preco) * 100) : null
      return {
        nome,
        categoria: CATEGORIA[nome] || 'Temperos',
        label:    snapshot?.label   || '',
        mediana:  Number(snapshot?.preco)         || null,
        media:    Number(snapshot?.media)         || null,
        minimo:   Number(snapshot?.minimo)        || null,
        maximo:   Number(snapshot?.maximo)        || null,
        dp:       Number(snapshot?.desvio_padrao) || null,
        custo:    Number(snapshot?.custo_porcao)  || null,
        inflacao,
        cor: coresMap[nome],
      }
    })
  }, [ingredientes, visiveis, historico, hFiltrado, dataTabela, dataInicio, dataFim, coresMap])

  const tabelaOrdenada = useMemo(() => {
    return [...tabelaBase].sort((a, b) => {
      let va: any = (a as any)[ordemCol]
      let vb: any = (b as any)[ordemCol]
      if (va == null) va = ordemDir === 'asc' ? Infinity : -Infinity
      if (vb == null) vb = ordemDir === 'asc' ? Infinity : -Infinity
      if (typeof va === 'string') return ordemDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      return ordemDir === 'asc' ? va - vb : vb - va
    })
  }, [tabelaBase, ordemCol, ordemDir])

  const clicarColuna = (col: string) => {
    if (ordemCol === col) setOrdemDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setOrdemCol(col); setOrdemDir('asc') }
  }

  const toggleMetrica = (m: Metrica) =>
    setMetricas(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])

  const toggleTodos = (val: boolean) => {
    const novo: Record<string, boolean> = {}
    ingredientes.forEach(i => novo[i] = val)
    setVisiveis(novo)
  }

  const EXPLICACAO_INDICE = `O Índice PF calcula o custo de UMA porção de prato feito com quantidades fixas:

• Proteína (200g): média ponderada entre frango (×1.0), peixe (×1.1) e carne vermelha (×1.2)
• Arroz: 80g cru → ~200g cozido
• Feijão: 60g cru → ~150g cozido
• Guarnição (150g): média entre batata, mandioca, macarrão e farinha
• Salada (80g total): média dos itens de salada
• Temperos: quantidades fixas por ingrediente

A mediana é usada por ingrediente para reduzir o impacto de preços outliers. A banda sombreada mostra ±1 desvio padrão propagado (real no último snapshot, estimado ±8% nos demais).`

  const colunas = [
    { key: 'nome',      label: 'Produto',      tip: null },
    { key: 'categoria', label: 'Categoria',    tip: null },
    { key: 'label',     label: 'Unidade',      tip: null },
    { key: 'mediana',   label: 'Mediana',      tip: 'Valor central dos preços coletados no Google Shopping, após remoção de outliers pelo método IQR.' },
    { key: 'media',     label: 'Média',        tip: 'Média aritmética dos preços válidos coletados neste snapshot.' },
    { key: 'minimo',    label: 'Mín',          tip: 'Menor preço válido encontrado após remoção de outliers.' },
    { key: 'maximo',    label: 'Máx',          tip: 'Maior preço válido encontrado após remoção de outliers.' },
    { key: 'dp',        label: '±DP',          tip: 'Desvio padrão dos preços coletados. Indica dispersão: quanto maior, maior a variação de preços entre lojas.' },
    { key: 'custo',     label: 'Custo/porção', tip: 'Custo estimado deste ingrediente em uma porção de PF, com base na quantidade padrão (ex: 80g de arroz cru, 200g de proteína). Para proteínas, usa média ponderada entre as proteínas ativas.' },
    { key: 'inflacao',  label: 'Inflação',     tip: 'Variação percentual do preço mediano entre o início e o fim do período selecionado nos filtros.' },
  ]

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center">
        <div className="text-5xl mb-4">🍽️</div>
        <p className="text-slate-400 text-sm">Carregando dados...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 flex flex-col"
      style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {modalFontes && (
        <ModalFontes
          ingrediente={modalFontes.ingrediente}
          fontes={modalFontes.fontes}
          data={modalFontes.data}
          onClose={() => setModalFontes(null)} />
      )}

      <nav className="bg-slate-950 px-6 py-4 flex justify-between items-center border-b border-slate-800">
        <h1 className="text-lg font-semibold flex items-center gap-3">
          🛒 Índice PF
          <span className="bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">BETA</span>
        </h1>
        <div className="flex gap-2">
          {(['dashboard','admin'] as Aba[]).map(a => (
            <button key={a} onClick={() => setAba(a)}
              className={`px-4 py-2 rounded-md text-sm transition-colors ${aba === a ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
              {a === 'dashboard' ? '📊 Visão do Cliente' : '⚙️ Backoffice'}
            </button>
          ))}
        </div>
      </nav>

      <div className="flex-1 p-6 max-w-screen-2xl mx-auto w-full">
        {aba === 'dashboard' && (
          <div className="grid gap-6" style={{ gridTemplateColumns: '300px 1fr' }}>

            {/* SIDEBAR */}
            <aside className="bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-5 h-fit">
              <h3 className="font-semibold border-b border-slate-700 pb-3">Filtros de Análise</h3>

              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-2">Métrica do Preço</label>
                <div className="space-y-1">
                  {([['mediana','Mediana'],['media','Média'],['minimo','Mínimo'],['maximo','Máximo']] as [Metrica,string][]).map(([m, lbl]) => (
                    <label key={m} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-700 cursor-pointer">
                      <input type="checkbox" checked={metricas.includes(m)} onChange={() => toggleMetrica(m)} />
                      <span className="text-slate-300 text-sm">{lbl}</span>
                      {m === 'mediana' && <span className="text-xs text-slate-600 ml-auto">padrão</span>}
                    </label>
                  ))}
                  {metricas.includes('mediana') && (
                    <label className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-700 cursor-pointer border-t border-slate-700 pt-2 mt-1">
                      <input type="checkbox" checked={mostrarDP} onChange={() => setMostrarDP(v => !v)} />
                      <span className="text-slate-400 text-xs">Mostrar banda ±DP</span>
                    </label>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-2 px-2">Média/Mín/Máx: último snapshot real. Banda ±DP: estimada (±8%) para semanas históricas.</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-2">Período</label>
                <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 text-slate-200 rounded-md px-3 py-2 text-sm mb-2 focus:outline-none" />
                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 text-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none" />
              </div>

              {/* Ingredientes com hover explicativo */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <div className="relative group">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide cursor-help">
                      Ingredientes <IcoInfo className="text-slate-600" />
                    </label>
                    <div className="absolute z-50 bottom-full left-0 mb-2 w-64 bg-slate-900 border border-slate-500 rounded-lg p-3 text-xs text-slate-300 shadow-2xl leading-relaxed hidden group-hover:block">
                      Selecione os ingredientes que você usa no seu restaurante para personalizar o cálculo do custo do PF. Desmarque proteínas ou itens que não fazem parte do seu cardápio.
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => toggleTodos(true)} className="text-xs text-blue-400 hover:text-blue-300">Todos</button>
                    <button onClick={() => toggleTodos(false)} className="text-xs text-slate-500 hover:text-slate-300">Nenhum</button>
                  </div>
                </div>
                <div className="max-h-52 overflow-y-auto border border-slate-700 rounded-md bg-slate-900 p-2">
                  {CATEGORIAS_ORDEM.map(cat => (
                    <div key={cat} className="mb-2">
                      <p className="text-xs uppercase px-2 pt-1 pb-0.5 font-semibold" style={{ color: CORES_CAT[cat] }}>{cat}</p>
                      {ingredientes.filter(n => CATEGORIA[n] === cat).map(nome => (
                        <label key={nome} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-800 cursor-pointer">
                          <input type="checkbox" checked={!!visiveis[nome]}
                            onChange={() => setVisiveis(v => ({ ...v, [nome]: !v[nome] }))} />
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: coresMap[nome] }} />
                          <span className="text-slate-300 text-xs">{nome}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Calculadora */}
              <div className="bg-slate-900 rounded-lg p-4 border border-slate-700 space-y-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Calculadora de Custo</p>
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">Pratos por dia</p>
                  <div className="flex gap-1.5 mb-2 flex-wrap">
                    {[30,50,100,200].map(n => (
                      <button key={n} onClick={() => setQtdPratos(n)}
                        className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${qtdPratos === n ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}>{n}</button>
                    ))}
                  </div>
                  <input type="number" value={qtdPratos} onChange={e => setQtdPratos(Number(e.target.value))}
                    className="w-full bg-slate-700 border border-slate-600 text-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none" />
                </div>
                <div className="border-t border-slate-700 pt-3 space-y-1">
                  <div className="flex justify-between items-baseline">
                    <p className="text-xs text-slate-400">Varejo</p>
                    <p className="text-amber-400 font-bold text-lg">{fmtR(custoPFMetrica * qtdPratos)}</p>
                  </div>
                  <p className="text-xs text-slate-600">{qtdPratos} × {fmtR(custoPFMetrica)}</p>
                </div>
                <div className="bg-slate-800 rounded-lg p-3 border border-slate-600 space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="text-xs font-semibold text-emerald-400">🏭 Simulação Atacado</p>
                    <span className="text-xs text-slate-300 bg-slate-700 px-2 py-0.5 rounded font-bold">-{descAtacado}%</span>
                  </div>
                  <input type="range" min={5} max={30} step={1} value={descAtacado}
                    onChange={e => setDescAtacado(Number(e.target.value))}
                    className="w-full accent-emerald-500" />
                  <div className="flex justify-between text-xs text-slate-600"><span>-5%</span><span>-30%</span></div>
                  <div className="flex justify-between items-baseline">
                    <p className="text-xs text-slate-400">Atacado</p>
                    <p className="text-emerald-400 font-bold text-lg">{fmtR(custoPFMetrica * qtdPratos * (1 - descAtacado / 100))}</p>
                  </div>
                  <p className="text-xs text-slate-500">
                    economia: <span className="text-emerald-500 font-semibold">{fmtR(custoPFMetrica * qtdPratos * descAtacado / 100)}</span>/dia
                  </p>
                </div>
              </div>
            </aside>

            {/* MAIN */}
            <main className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <CardInfo label="Custo PF / Porção" value={fmtR(custoPFMetrica)}
                  sub={`27 ingredientes · ${ultimaData}`} color="text-amber-400" info={EXPLICACAO_INDICE} />
                {(() => {
                  const serie = historico.filter(d => d.nome_ingrediente === 'Feijão Carioca').sort((a,b) => a.data.localeCompare(b.data))
                  const ini = serie.find(d => d.data >= dataInicio)
                  const fim = serie.filter(d => d.data <= dataFim).pop()
                  const v   = (ini && fim) ? ((Number(fim.custo_total_pf) - Number(ini.custo_total_pf)) / Number(ini.custo_total_pf) * 100) : null
                  return (
                    <CardInfo label="Variação no Período"
                      value={v != null ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : 'N/A'}
                      sub={`${fmtData(dataInicio)} → ${fmtData(dataFim)}`}
                      color={v == null ? 'text-slate-400' : v > 0 ? 'text-red-400' : 'text-emerald-400'} />
                  )
                })()}
                <CardInfo label="Ingredientes Ativos"
                  value={`${Object.values(visiveis).filter(Boolean).length} / 27`}
                  sub="selecione na sidebar" color="text-blue-400" />
              </div>

              {/* Gráfico 1 — Evolução custo total */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-5" style={{ height: 320 }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-slate-400 uppercase tracking-wide">Evolução do Custo Total do PF (R$/porção)</p>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    {mostrarDP && metricas.includes('mediana') && (
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded-sm opacity-30 inline-block" style={{ backgroundColor: COR_MEDIANA }} />
                        banda ±DP
                      </span>
                    )}
                    {linhasKeys.map((k, i) => (
                      <span key={k} className="flex items-center gap-1">
                        <span className="w-4 h-0.5 inline-block rounded" style={{ backgroundColor: CORES_LINHA[i % CORES_LINHA.length] }} />
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height="88%">
                  <ComposedChart data={dadosLinha}>
                    <GradienteDP />
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="data" tick={{ fill: '#64748b', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => `R$${v}`} width={62} domain={['auto','auto']} />
                    <Tooltip content={<TooltipPF />} />
                    {mostrarDP && metricas.includes('mediana') && <>
                      <Area type="monotone" dataKey="dp_superior" stroke="none"
                        fill="url(#gradDP)" fillOpacity={1} legendType="none"
                        name="dp_superior" connectNulls isAnimationActive={false} />
                      <Area type="monotone" dataKey="dp_inferior" stroke="none"
                        fill="#1e293b" fillOpacity={1} legendType="none"
                        name="dp_inferior" connectNulls isAnimationActive={false} />
                    </>}
                    {linhasKeys.map((key, i) => (
                      <Line key={key} type="monotone" dataKey={key}
                        stroke={CORES_LINHA[i % CORES_LINHA.length]}
                        strokeWidth={key === 'Mediana' ? 2.5 : 1.5}
                        dot={key === 'Mediana' ? { fill: CORES_LINHA[0], r: 3 } : false}
                        strokeDasharray={key === 'Mínimo' || key === 'Máximo' ? '4 2' : undefined}
                        connectNulls legendType="none" name={key} />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Gráfico 2 — Categorias com toggle barras/linhas */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-5" style={{ height: 300 }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-slate-400 uppercase tracking-wide">
                    Composição do Custo por Categoria
                    <span className="text-slate-600 ml-2">
                      {grafico2Tipo === 'barras' ? '(% do total)' : '(R$/porção)'}
                    </span>
                  </p>
                  <div className="flex items-center gap-2">
                    {/* Toggle barras/linhas */}
                    <div className="flex bg-slate-700 rounded-md p-0.5">
                      <button onClick={() => setGrafico2Tipo('barras')}
                        className={`px-2.5 py-1 rounded text-xs transition-colors ${grafico2Tipo === 'barras' ? 'bg-slate-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                        ▦ Barras
                      </button>
                      <button onClick={() => setGrafico2Tipo('linhas')}
                        className={`px-2.5 py-1 rounded text-xs transition-colors ${grafico2Tipo === 'linhas' ? 'bg-slate-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                        ∿ Linhas
                      </button>
                    </div>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height="85%">
                  {grafico2Tipo === 'barras' ? (
                    <BarChart data={dadosCategorias}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="data" tick={{ fill: '#64748b', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => `${v}%`} width={40} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} />
                      <Tooltip content={<TooltipCategorias tipo="barras" />} />
                      {CATEGORIAS_ORDEM.map(cat => (
                        <Bar key={cat} dataKey={cat} stackId="a" fill={CORES_CAT[cat]} name={cat} />
                      ))}
                    </BarChart>
                  ) : (
                    <ComposedChart data={dadosCategorias}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="data" tick={{ fill: '#64748b', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => `R$${v}`} width={62} domain={['auto','auto']} />
                      <Tooltip content={<TooltipCategorias tipo="linhas" />} />
                      {CATEGORIAS_ORDEM.map(cat => (
                        <Line key={cat} type="monotone" dataKey={cat}
                          stroke={CORES_CAT[cat]} strokeWidth={2}
                          dot={{ fill: CORES_CAT[cat], r: 3 }}
                          name={cat} connectNulls />
                      ))}
                    </ComposedChart>
                  )}
                </ResponsiveContainer>
              </div>

              {/* Tabela */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">📉 Detalhamento Financeiro</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Snapshot:</span>
                    <select
                      value={dataTabela}
                      onChange={e => { setDataTabela(e.target.value); setFontesCache({}) }}
                      className="bg-slate-700 border border-slate-600 text-slate-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 cursor-pointer">
                      {[...new Set(historico.map(d => d.data))].sort().reverse().map(d => (
                        <option key={d} value={d}>{d}{d === ultimaData ? ' (último)' : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-700">
                        {colunas.map(({ key, label, tip }) => (
                          <ColunaHeader key={key} col={key} label={label} tip={tip}
                            ordemCol={ordemCol} ordemDir={ordemDir}
                            onClick={() => clicarColuna(key)} />
                        ))}
                        <th className="font-semibold text-slate-400 uppercase pb-3 text-center whitespace-nowrap">Fontes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tabelaOrdenada.map(item => (
                        <tr key={item.nome} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                          <td className="py-2.5 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.cor }} />
                              <span className="text-slate-300 whitespace-nowrap">{item.nome}</span>
                            </div>
                          </td>
                          <td className="py-2.5 pr-2 text-right">
                            <span className="px-1.5 py-0.5 rounded text-xs whitespace-nowrap"
                              style={{ backgroundColor: CORES_CAT[item.categoria] + '22', color: CORES_CAT[item.categoria] }}>
                              {item.categoria}
                            </span>
                          </td>
                          <td className="py-2.5 pr-2 text-right whitespace-nowrap">
                            <CelulaUnidade label={item.label} />
                          </td>
                          <td className="py-2.5 pr-2 text-right font-semibold text-amber-400 whitespace-nowrap">
                            {item.mediana ? `R$${item.mediana.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-2.5 pr-2 text-right text-slate-300 whitespace-nowrap">
                            {item.media ? `R$${item.media.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-2.5 pr-2 text-right text-emerald-400 whitespace-nowrap">
                            {item.minimo ? `R$${item.minimo.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-2.5 pr-2 text-right text-red-400 whitespace-nowrap">
                            {item.maximo ? `R$${item.maximo.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-2.5 pr-2 text-right text-slate-500 whitespace-nowrap">
                            {item.dp ? `±${item.dp.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-2.5 pr-2 text-right text-slate-400 whitespace-nowrap">
                            {item.custo ? `R$${item.custo.toFixed(3)}` : '—'}
                          </td>
                          <td className="py-2.5 text-right whitespace-nowrap">
                            {item.inflacao == null
                              ? <span className="text-slate-500">—</span>
                              : item.inflacao > 2
                              ? <span className="text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded font-bold">+{item.inflacao.toFixed(1)}%</span>
                              : item.inflacao < -2
                              ? <span className="text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded font-bold">{item.inflacao.toFixed(1)}%</span>
                              : <span className="text-slate-400 bg-slate-700 px-1.5 py-0.5 rounded">{item.inflacao > 0 ? '+' : ''}{item.inflacao.toFixed(1)}%</span>
                            }
                          </td>
                          <td className="py-2.5 text-center">
                            <button onClick={() => abrirFontes(item.nome, dataTabela)}
                              className="text-slate-500 hover:text-blue-400 transition-colors text-xs px-2 py-0.5 rounded hover:bg-slate-700">
                              •••
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </main>
          </div>
        )}

        {/* BACKOFFICE */}
        {aba === 'admin' && (
          <div className="grid grid-cols-2 gap-6 max-w-5xl">
            <div className="space-y-6">
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                <h2 className="font-semibold text-lg mb-2">Robô de Scraping</h2>
                <p className="text-sm text-slate-400 mb-4">Execute o scraper Python manualmente ou configure automação semanal.</p>
                <div className="bg-slate-900 rounded-lg p-4 border border-slate-700 font-mono text-xs text-emerald-400 space-y-1">
                  <p>$ python scraper_pf.py</p>
                  <p>$ python salvar_supabase.py</p>
                </div>
                <div className="mt-4 text-xs text-slate-500 space-y-1">
                  <p>✅ Última execução: {ultimaData}</p>
                  <p>✅ 27 ingredientes monitorados</p>
                  <p>✅ Cache local ativo</p>
                </div>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                <h2 className="font-semibold text-lg mb-4">Status do Banco</h2>
                <div className="text-sm">
                  {[
                    ['Snapshots', `${[...new Set(historico.map(d => d.data))].length} semanas`],
                    ['Registros de preço', historico.length],
                    ['Ingredientes', 27],
                    ['Fonte', 'Google Shopping / SerpAPI'],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="flex justify-between py-2.5 border-b border-slate-700">
                      <span className="text-slate-400">{k}</span>
                      <span className="text-slate-200 font-semibold">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
              <h2 className="font-semibold text-lg mb-4">Ingredientes Cadastrados</h2>
              <div className="max-h-[580px] overflow-y-auto">
                {CATEGORIAS_ORDEM.map(cat => (
                  <div key={cat} className="mb-4">
                    <p className="text-xs font-semibold uppercase mb-1 px-1" style={{ color: CORES_CAT[cat] }}>{cat}</p>
                    {ingredientes.filter(n => CATEGORIA[n] === cat).map(nome => {
                      const p = historico.find(d => d.nome_ingrediente === nome && d.data === ultimaData)
                      return (
                        <div key={nome} className="flex items-center justify-between py-2 px-2 border-b border-slate-700/40 hover:bg-slate-700/30 rounded">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: coresMap[nome] }} />
                            <span className="text-slate-300 text-sm">{nome}</span>
                          </div>
                          <span className="text-xs text-slate-500">
                            {p ? `R$${Number(p.preco).toFixed(2)}/${p.label}` : 'N/A'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="border-t border-slate-800 px-6 py-3 text-xs text-slate-600 flex justify-between">
        <span>Índice PF · dados coletados via Google Shopping</span>
        <span>atualização semanal · {ultimaData}</span>
      </footer>
    </div>
  )
}
