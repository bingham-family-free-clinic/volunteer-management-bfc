export const dynamic = 'force-dynamic'

export async function GET() {
  const isNonProd = process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production'
  const icon192 = isNonProd ? '/logos/logo4-192.webp' : '/logos/logo3-192.webp'
  const icon512 = isNonProd ? '/logos/logo4-512.webp' : '/logos/logo3-512.webp'

  const body = `
const CACHE_NAME = 'bfc-v2'
const OFFLINE_URL = '/offline'
const ICON_URL = '${icon192}'
const LOGO_URLS = [
  '/logos/logo2-96.webp',
  '${icon192}',
  '${icon512}',
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll([OFFLINE_URL, ...LOGO_URLS]))
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  if (event.request.method === 'GET' && url.origin === self.location.origin && url.pathname.startsWith('/logos/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached
        return fetch(event.request).then(response => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy))
          return response
        })
      })
    )
    return
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL))
    )
  }
})

self.addEventListener('push', event => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'New message', {
      body: data.body ?? '',
      icon: ICON_URL,
      data: { url: data.url ?? '/' },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const targetUrl = event.notification.data.url
      const existing = list.find(c => c.url === targetUrl || c.url.includes(targetUrl))
      if (existing) {
        existing.focus()
        if (targetUrl !== existing.url) {
          existing.navigate(targetUrl)
        }
      } else {
        clients.openWindow(targetUrl)
      }
    })
  )
})
`

  return new Response(body, {
    headers: {
      'Content-Type': 'application/javascript',
      'Service-Worker-Allowed': '/',
      'Cache-Control': 'no-cache',
    },
  })
}