const CACHE_NAME = 'skryptonite-v5'
const CORE_ASSETS = ['/', '/index.html', '/manifest.json', '/icon.png', '/skryptonite.ico']

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
    )
})

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys()
            await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
            await self.clients.claim()
        })()
    )
})

self.addEventListener('message', (event) => {
    if (event?.data?.type === 'SKRYPTONITE_SW_SKIP_WAITING') {
        self.skipWaiting()
    }
})

function isNavigationRequest(request) {
    return request.mode === 'navigate'
}

self.addEventListener('fetch', (event) => {
    const { request } = event
    if (request.method !== 'GET') return

    // Navigation: network-first so users get updates, but allow offline fallback.
    if (isNavigationRequest(request)) {
        event.respondWith(
            (async () => {
                try {
                    const response = await fetch(request)
                    const cache = await caches.open(CACHE_NAME)
                    cache.put(request, response.clone())
                    return response
                } catch (_) {
                    const cached = await caches.match(request)
                    return cached || caches.match('/index.html')
                }
            })()
        )
        return
    }

    // Assets/data: cache-first, then network.
    event.respondWith(
        (async () => {
            const cached = await caches.match(request)
            if (cached) return cached
            try {
                const response = await fetch(request)
                const cache = await caches.open(CACHE_NAME)
                cache.put(request, response.clone())
                return response
            } catch (_) {
                return cached
            }
        })()
    )
})
