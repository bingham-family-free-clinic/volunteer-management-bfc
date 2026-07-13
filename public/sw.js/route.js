export const dynamic = 'force-dynamic'

export async function GET() {
  const isNonProd = process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production'
  const logo = isNonProd ? '/logo4.png' : '/logo3.png'

  const body = `
const CACHE_NAME = 'bfc-v1'
const OFFLINE_URL = '/offline'
const ICON_URL = '${logo}'

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll([OFFLINE_URL]))
  )
  self.skipWaiting()export const dynamic = 'force-dynamic'

export async function GET() {
  const isNonProd = process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production'
  const logo = isNonProd ? '/logo4.png' : '/logo3.png'

  const body = `
const CACHE_NAME = 'bfc-v1'
const OFFLINE_URL = '/offline'
const ICON_URL = '${logo}'

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll([OFFLINE_URL]))
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
      const existing = list.find(c => c.url.includes(event.notification.data.url))
      return existing ? existing.focus() : clients.openWindow(event.notification.data.url)
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

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
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
      const existing = list.find(c => c.url.includes(event.notification.data.url))
      return existing ? existing.focus() : clients.openWindow(event.notification.data.url)
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