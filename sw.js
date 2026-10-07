// VoxelCraft PWA Service Worker (v1)
// Architecture: Safe Static Caching without WebSocket/Network Interference

const CACHE_NAME = 'voxelcraft-pwa-v1';

// Essential static shell and branding assets (relative paths resolve against SW registration scope)
const PRECACHE_ASSETS = [
  './',
  './manifest.webmanifest',
  './favicon.ico',
  './apple-touch-icon.png',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './icons/icon-maskable-512x512.png',
  './icons/app-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => {
        // Non-blocking: ensure install completes even if an asset fails to fetch
        console.warn('[SW] Precache notice:', err);
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // 1. Only handle standard HTTP/HTTPS GET requests
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // 2. CRITICAL MULTIPLAYER RULE: NEVER intercept or cache WebSocket or /ws connections
  if (
    url.pathname.startsWith('/ws') ||
    request.headers.get('Upgrade') === 'websocket' ||
    url.protocol === 'ws:' ||
    url.protocol === 'wss:'
  ) {
    return;
  }

  // 3. Skip chrome-extension, internal schemes, or dev hot-reload sockets
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // 4. Navigation Requests (HTML shell): Network-First with Cache Fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const rootCached = (await caches.match('./')) || (await caches.match('/'));
          if (rootCached) return rootCached;
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        })
    );
    return;
  }

  // 5. Static Assets (JS, CSS, icons, images, fonts): Stale-While-Revalidate / Cache-First
  const isStaticAsset =
    url.origin === self.location.origin &&
    (url.pathname.includes('/assets/') ||
      url.pathname.includes('/icons/') ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.ico') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.webmanifest') ||
      url.pathname.endsWith('.json'));

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
  }
});
