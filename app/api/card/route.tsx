// GET /api/card — card PNG do índice atual (compartilhamento social).
// Dados públicos (snapshots via REST com a anon key); sem service role.
import { ImageResponse } from 'next/og'

export const revalidate = 3600   // cache de 1h — o índice muda 1×/semana

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yhgdlmmtiyvdgeoxavzn.supabase.co'
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZ2RsbW10aXl2ZGdlb3hhdnpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyNzMzMzYsImV4cCI6MjA2NTg0OTMzNn0.kdjSuqEXfp1LmnDA6voNC1WCUDV18XG1QVQtj4L2SN8'

const GRAD = 'linear-gradient(100deg, #8D4CB2, #6954BD 22%, #0069D4 46%, #00A7E2 70%, #20C58C 100%)'
const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`

export async function GET() {
  let indice: number | null = null, data = '', delta: number | null = null
  try {
    const r = await fetch(
      `${URL_SB}/rest/v1/snapshots?select=data,custo_total_pf&custo_total_pf=gt.0&order=data.desc&limit=2`,
      { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` }, next: { revalidate: 3600 } },
    )
    const snaps = await r.json()
    if (Array.isArray(snaps) && snaps[0]) {
      indice = Number(snaps[0].custo_total_pf)
      const [a, m, d] = String(snaps[0].data).split('-')
      data = `${d}/${m}/${a}`
      if (snaps[1] && Number(snaps[1].custo_total_pf) > 0) {
        delta = (indice - Number(snaps[1].custo_total_pf)) / Number(snaps[1].custo_total_pf) * 100
      }
    }
  } catch { /* card sai sem número */ }

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: '#f4f6fb', padding: 72, justifyContent: 'space-between',
      }}>
        {/* marca */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 88, height: 88, borderRadius: 22, backgroundImage: GRAD,
            color: '#ffffff', fontSize: 52, fontWeight: 700,
          }}>PF</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 44, fontWeight: 700, color: '#12203a' }}>Índice PF</div>
            <div style={{ fontSize: 22, color: '#6b7a93', letterSpacing: 3 }}>BY INFINITY</div>
          </div>
        </div>

        {/* índice */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 30, color: '#6b7a93' }}>Custo de produção do prato feito no Brasil</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 28 }}>
            <div style={{ fontSize: 148, fontWeight: 700, color: '#0069D4', lineHeight: 1.1 }}>
              {indice != null ? brl(indice) : 'Índice PF'}
            </div>
            {delta != null && (
              <div style={{ fontSize: 44, fontWeight: 700, color: delta > 0 ? '#ef4444' : '#12b76a' }}>
                {`${delta > 0 ? '+' : '-'}${Math.abs(delta).toFixed(1)}%`}
              </div>
            )}
          </div>
          <div style={{ fontSize: 26, color: '#6b7a93', marginTop: 8 }}>
            {`mediana de 100 pratos regionais${data ? ` · coleta de ${data}` : ''}`}
          </div>
        </div>

        {/* rodapé com a régua da marca */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 24, color: '#9aa7bd' }}>indicepf.com.br — dados do varejo e de campo, abertos até a fonte</div>
          <div style={{ display: 'flex', height: 10, borderRadius: 5, backgroundImage: GRAD, width: '100%' }} />
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
