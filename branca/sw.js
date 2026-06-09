// ================================================
//  SERVICE WORKER — Ingeniería Branca SRL
//  Versión: 2.0
//  Estrategia: Network-first para index.html
//              Cache-first para assets estáticos (imágenes, iconos)
// ================================================

const CACHE_NAME = 'branca-v20';

const CACHE_ASSETS = [
  '/branca/',
  '/branca/index.html',
  '/branca/manifest.json',
  '/branca/icon-192.png',
  '/branca/icon-512.png',
  '/branca/branca-logo.png'
];

// ── Instalación ──────────────────────────────────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(CACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// ── Activación: limpiar caches viejos ────────────
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

// ── Fetch ────────────────────────────────────────
self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Requests a Google Apps Script / APIs externas: sin cache nunca
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(event.request));
    return;
  }

  // index.html y raíz: NETWORK-FIRST — siempre intenta traer la versión nueva
  const isHTML = url.pathname === '/branca/' || url.pathname === '/branca/index.html';
  if (isHTML) {
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
          // Sin red → servir desde caché (modo offline)
          return caches.match(event.request);
        })
    );
    return;
  }

  // Assets estáticos (iconos, imágenes): cache-first
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
