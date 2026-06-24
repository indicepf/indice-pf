import { ImageResponse } from 'next/og'

// Imagem de compartilhamento (WhatsApp, Twitter, etc.) — gerada por código.
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Índice PF — custo do prato feito no Brasil'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 90,
          background: '#faf7f2',
        }}
      >
        {/* monograma da marca */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 150,
            height: 150,
            borderRadius: 32,
            background: '#c0492b',
            color: '#faf7f2',
            fontSize: 78,
            fontWeight: 700,
          }}
        >
          PF
        </div>

        {/* título + descrição */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 92, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.05 }}>
            Índice PF
          </div>
          <div style={{ fontSize: 46, color: '#c0492b', marginTop: 12 }}>
            custo do prato feito no Brasil
          </div>
          <div style={{ fontSize: 30, color: '#6b6b6b', marginTop: 28, maxWidth: 900 }}>
            O custo de produção de pratos feitos regionais brasileiros, medido a cada coleta.
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
