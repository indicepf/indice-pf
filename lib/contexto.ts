// Contexto de uma ação para auditoria: dispositivo (user agent) + GPS.
// Best-effort: nunca lança nem trava a ação — se o GPS for negado/demorar,
// lat/lng ficam null e a ação segue normalmente.

// fonte: 'gps' = preciso (autorizado) · 'ip' = aproximado (Vercel) · null = sem local
export type Contexto = { dispositivo: string; lat: number | null; lng: number | null; precisao: number | null; fonte: 'gps' | 'ip' | null }

export async function capturarContexto(): Promise<Contexto> {
  const dispositivo = typeof navigator !== 'undefined' ? navigator.userAgent : ''

  // 1. GPS preciso (se autorizado)
  const pos = await new Promise<GeolocationPosition | null>((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      p => resolve(p),
      () => resolve(null),
      { timeout: 8000, maximumAge: 300000, enableHighAccuracy: true },
    )
  })
  if (pos) return { dispositivo, lat: pos.coords.latitude, lng: pos.coords.longitude, precisao: pos.coords.accuracy, fonte: 'gps' }

  // 2. fallback: geo aproximada por IP (Vercel)
  try {
    const r = await fetch('/api/geo')
    if (r.ok) {
      const g = await r.json()
      if (g.lat != null && g.lng != null) return { dispositivo, lat: g.lat, lng: g.lng, precisao: null, fonte: 'ip' }
    }
  } catch { /* sem fallback */ }

  return { dispositivo, lat: null, lng: null, precisao: null, fonte: null }
}

// resumo legível de um user agent ("Chrome · Android", etc.)
export function resumoDispositivo(ua: string | null): string {
  if (!ua) return '—'
  const so = /Android/i.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
    : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X/i.test(ua) ? 'macOS'
    : /Linux/i.test(ua) ? 'Linux' : '—'
  const nav = /Edg\//i.test(ua) ? 'Edge'
    : /OPR\/|Opera/i.test(ua) ? 'Opera'
    : /Chrome\//i.test(ua) ? 'Chrome'
    : /Firefox\//i.test(ua) ? 'Firefox'
    : /Safari\//i.test(ua) ? 'Safari' : 'navegador'
  return `${nav} · ${so}`
}
