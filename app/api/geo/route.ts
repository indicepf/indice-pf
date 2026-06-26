// Geolocalização aproximada por IP, dos cabeçalhos que a Vercel injeta na
// requisição. Usada como fallback quando o usuário nega o GPS preciso.
// Em localhost os cabeçalhos não existem → retorna nulls (sem local em dev).
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const h = req.headers
  const dec = (v: string | null) => (v ? decodeURIComponent(v) : null)
  const num = (v: string | null) => (v ? Number(v) : null)
  return Response.json({
    cidade: dec(h.get('x-vercel-ip-city')),
    uf: h.get('x-vercel-ip-country-region'),
    pais: h.get('x-vercel-ip-country'),
    lat: num(h.get('x-vercel-ip-latitude')),
    lng: num(h.get('x-vercel-ip-longitude')),
  })
}
