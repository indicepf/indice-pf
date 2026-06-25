// Service worker mínimo do Índice PF — habilita instalação (PWA) e um cache
// leve do shell para resiliência offline. Não cacheia a API do Supabase
// (cross-origin é ignorado), então os dados são sempre frescos quando online.
const CACHE = 'indice-pf-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copia = res.clone()
        caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {})
        return res
      })
      .catch(() => caches.match(req))
  )
})
