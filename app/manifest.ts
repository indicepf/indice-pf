import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Índice PF — custo do prato feito',
    short_name: 'Índice PF',
    description: 'O custo de produção de pratos feitos regionais brasileiros, medido a cada coleta.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4f6fb',
    theme_color: '#0069D4',
    lang: 'pt-BR',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
