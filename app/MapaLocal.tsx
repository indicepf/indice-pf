'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export type Ponto = { lat: number; lng: number; label?: string }

function Ajuste({ points }: { points: Ponto[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 16)
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng])), { padding: [30, 30] })
  }, [points, map])
  return null
}

export default function MapaLocal({ points, height = '320px' }: { points: Ponto[]; height?: string }) {
  const center: [number, number] = points.length ? [points[0].lat, points[0].lng] : [-15, -54]
  return (
    <MapContainer center={center} zoom={points.length ? 13 : 4}
      style={{ height, width: '100%' }} scrollWheelZoom={false}
      className="rounded-lg border border-line z-0">
      <TileLayer attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {points.map((p, i) => (
        <CircleMarker key={i} center={[p.lat, p.lng]} radius={8}
          pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#c0492b', fillOpacity: 0.9 }}>
          {p.label && <Popup>{p.label}</Popup>}
        </CircleMarker>
      ))}
      <Ajuste points={points} />
    </MapContainer>
  )
}
