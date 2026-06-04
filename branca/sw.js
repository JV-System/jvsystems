// ================================================
//  SERVICE WORKER — Ingeniería Branca SRL
//  Versión: 1.0
//  Estrategia: Cache-first para assets locales,
//              Network-first para fuentes externas.
// ================================================

const CACHE_NAME = 'branca-v4';

// Archivos que se cachean al instalar la app
const CACHE_ASSETS = [
  '/mantenimiento-app/',
  '/mantenimiento-app/index.html',
  '/mantenimiento-app/manifest.json',
  '/mantenimiento-app/icon-192.png',
  '/mantenimiento-app/icon-512.png',
  '/mantenimiento-app/branca-logo.png'
];

// ── Instalación: pre-cache de assets locales ──
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(CACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// ── Activación: limpiar caches viejos ──
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) { return caches.delete(name); })
      );
    })
  );
  self.clients.claim();
});

// ── Fetch: Cache-first con fallback a red ──
self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Para fuentes de Google / CDNs externos: network-first
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(function() {
          return caches.match(event.request);
        })
    );
    return;
  }

  // Para archivos locales: cache-first
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, clone);
        });
        return response;
      });
    })
  );
});
