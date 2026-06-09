// ================================================
//  SERVICE WORKER — Ingeniería Branca SRL
//  Versión: 3.0
//  index.html → NUNCA se cachea, siempre red
//  Imágenes/iconos → cache-first (no cambian)
// ================================================

const CACHE_NAME = 'branca-v31';

const STATIC_ASSETS = [
  '/branca/manifest.json',
  '/branca/icon-192.png',
  '/branca/icon-512.png',
  '/branca/branca-logo.png'
];

// ── Mensaje desde la página ──────────────────────
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Instalación ──────────────────────────────────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// ── Activación: limpiar caches viejos ────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      // Notificar a todas las pestañas abiertas que recarguen
      return self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    }).then(function(clients) {
      clients.forEach(function(client) {
        client.postMessage({ type: 'SW_UPDATED' });
      });
    })
  );
  self.clients.claim();
});

// ── Fetch ────────────────────────────────────────
self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // APIs externas (Apps Script, etc.) → siempre red, sin cache
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(event.request));
    return;
  }

  // index.html y raíz → NUNCA cache, siempre red fresca
  const isHTML = url.pathname === '/branca/'
              || url.pathname === '/branca/index.html'
              || url.pathname === '/branca';
  if (isHTML) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(function() {
          // Sin red → fallback al cache si existe
          return caches.match('/branca/index.html');
        })
    );
    return;
  }

  // Assets estáticos → cache-first
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
