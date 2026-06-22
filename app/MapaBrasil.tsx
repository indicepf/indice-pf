'use client'

import { useMemo } from 'react'
import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker } from 'react-simple-maps'
import { merge } from 'topojson-client'
import topo from './brazil-uf-topo.json'

// centro aproximado [lng, lat] de cada região — para rótulo e zoom
const REGIAO_CENTRO: Record<string, [number, number]> = {
  'Norte':        [-60, -4],
  'Nordeste':     [-41, -9],
  'Centro-oeste': [-54, -15],
  'Sudeste':      [-44, -20],
  'Sul':          [-52, -28],
}
const BR_CENTRO: [number, number] = [-54, -15]
// grafia do topojson ("Centro-Oeste") → nossa ("Centro-oeste")
const normReg = (s: string) => (s === 'Centro-Oeste' ? 'Centro-oeste' : s)

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)
const corCusto = (t: number) => `rgb(${lerp(245, 192, t)},${lerp(227, 73, t)},${lerp(216, 43, t)})`

// funde os 27 estados em 5 polígonos de região (uma vez)
const REGIOES_FC = (() => {
  const geoms = (topo as any).objects.uf.geometries as any[]
  const grupos: Record<string, any[]> = {}
  geoms.forEach(g => { const r = normReg(g.properties.regiao); (grupos[r] ||= []).push(g) })
  return {
    type: 'FeatureCollection',
    features: Object.entries(grupos).map(([regiao, gs]) => ({
      type: 'Feature', properties: { regiao }, geometry: merge(topo as any, gs),
    })),
  }
})()

export default function MapaBrasil({ regionais, sel, onSel }: {
  regionais: { regiao: string; media: number; n: number }[]
  sel: string
  onSel: (r: string) => void
}) {
  // cor por RANK → discrimina regiões de custo próximo (Sul/Sudeste)
  const corPorRegiao = useMemo(() => {
    const ranked = regionais.filter(r => r.media > 0).sort((a, b) => a.media - b.media)
    const m: Record<string, string> = {}
    ranked.forEach((r, i) => { m[r.regiao] = corCusto(ranked.length > 1 ? i / (ranked.length - 1) : 0.5) })
    return m
  }, [regionais])

  const valorPorRegiao = useMemo(
    () => Object.fromEntries(regionais.map(r => [r.regiao, r.media])) as Record<string, number>,
    [regionais],
  )

  const center = sel !== 'Todas' && REGIAO_CENTRO[sel] ? REGIAO_CENTRO[sel] : BR_CENTRO
  const zoom = sel !== 'Todas' ? 2.6 : 1

  return (
    <div className="w-full max-w-[440px]">
      <ComposableMap projection="geoMercator"
        projectionConfig={{ center: BR_CENTRO, scale: 620 }}
        width={440} height={460} style={{ width: '100%', height: 'auto', background: 'transparent' }}>
        <ZoomableGroup center={center} zoom={zoom} minZoom={1} maxZoom={4}
          filterZoomEvent={() => false}>
          <Geographies geography={REGIOES_FC as object}>
            {({ geographies }: { geographies: any[] }) =>
              geographies.map((geo) => {
                const regiao = geo.properties.regiao as string
                const ativo = sel === regiao
                const ofusca = sel !== 'Todas' && !ativo
                return (
                  <Geography key={regiao} geography={geo}
                    onClick={() => onSel(regiao)}
                    fill={corPorRegiao[regiao] || '#eee'}
                    stroke="#faf7f2" strokeWidth={1}
                    style={{
                      default: { outline: 'none', opacity: ofusca ? 0.32 : 1, transition: 'opacity .2s' },
                      hover:   { outline: 'none', cursor: 'pointer', filter: 'brightness(0.93)' },
                      pressed: { outline: 'none' },
                    }} />
                )
              })
            }
          </Geographies>

          {regionais.filter(r => r.media > 0 && REGIAO_CENTRO[r.regiao]).map(r => {
            const ofusca = sel !== 'Todas' && sel !== r.regiao
            return (
              <Marker key={r.regiao} coordinates={REGIAO_CENTRO[r.regiao]}
                style={{ default: { pointerEvents: 'none' } }} opacity={ofusca ? 0.3 : 1}>
                <rect x={-32} y={-13} width={64} height={26} rx={5}
                  fill="rgba(255,255,255,0.82)" />
                <text textAnchor="middle" y={-1} className="tnum"
                  style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, fill: '#1a1a1a' }}>
                  {brl(valorPorRegiao[r.regiao])}
                </text>
                <text textAnchor="middle" y={8.5}
                  style={{ fontFamily: 'var(--font-sans)', fontSize: 6, fill: '#9a8f86', letterSpacing: 0.5 }}>
                  {r.regiao.toUpperCase()}
                </text>
              </Marker>
            )
          })}
        </ZoomableGroup>
      </ComposableMap>

      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-2 text-[0.62rem] text-muted">
          <span>menor</span>
          <span className="h-1.5 w-20 rounded-full"
            style={{ background: 'linear-gradient(to right, rgb(245,227,216), rgb(192,73,43))' }} />
          <span>maior custo</span>
        </div>
        {sel !== 'Todas' && (
          <button onClick={() => onSel(sel)} className="text-xs text-paprika hover:underline">
            ver Brasil todo ×
          </button>
        )}
      </div>
    </div>
  )
}
