import { ImageResponse } from 'next/og'

// Imagem de compartilhamento (WhatsApp, Twitter, etc.) — gerada por código.
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Índice PF — custo do prato feito no Brasil'

const GRAD = 'linear-gradient(100deg, #8D4CB2, #6954BD 22%, #0069D4 46%, #00A7E2 70%, #20C58C 100%)'

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
          background: '#f4f6fb',
        }}
      >
        {/* marca */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 150,
            height: 150,
            borderRadius: 36,
            backgroundImage: GRAD,
            color: '#ffffff',
            fontSize: 86,
            fontWeight: 700,
          }}
        >
          PF
        </div>

        {/* título + descrição */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 92, fontWeight: 700, color: '#12203a', lineHeight: 1.05 }}>
            Índice PF
          </div>
          <div style={{ fontSize: 46, color: '#0069D4', marginTop: 12 }}>
            custo do prato feito no Brasil
          </div>
          <div style={{ fontSize: 30, color: '#6b7a93', marginTop: 28, maxWidth: 900 }}>
            O custo de produção de pratos feitos regionais brasileiros, medido a cada coleta.
          </div>
        </div>

        <div style={{ display: 'flex', height: 12, borderRadius: 6, backgroundImage: GRAD, width: '100%' }} />
      </div>
    ),
    { ...size },
  )
}
