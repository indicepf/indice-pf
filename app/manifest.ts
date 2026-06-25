import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Índice PF — custo do prato feito',
    short_name: 'Índice PF',
    description: 'O custo de produção de pratos feitos regionais brasileiros, medido a cada coleta.',
    start_url: '/',
    display: 'standalone',
    background_color: '#faf7f2',
    theme_color: '#c0492b',
    lang: 'pt-BR',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
