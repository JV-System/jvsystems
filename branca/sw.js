// Service Worker desactivado — la app requiere conexión a internet
// v4 — "siempre red" no alcanzaba: fetch(event.request) sin mas sigue sujeto
// al cache HTTP normal del navegador (Cache-Control del servidor), asi que
// un dispositivo podia seguir viendo una version vieja de la app aunque el
// service worker "no cacheara nada" del lado de la Cache Storage API. Hace
// falta "no-store" explicito para forzar red de verdad en cada pedido.
const SW_VERSION = 5;

self.addEventListener('install', function(event) {
  // Tomar control inmediatamente sin esperar a que se cierren las tabs
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  // Borrar TODOS los cachés viejos y tomar control de todas las tabs
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) { return caches.delete(k); }));
    }).then(function() {
      return self.clients.claim();
    }).then(function() {
      // Forzar recarga de todas las tabs abiertas para que carguen HTML fresco
      return self.clients.matchAll({ type: 'window' });
    }).then(function(clients) {
      clients.forEach(function(client) {
        client.navigate(client.url);
      });
    })
  );
});

self.addEventListener('fetch', function(event) {
  // Sin caché — siempre red, ignorando el cache HTTP del navegador
  event.respondWith(fetch(event.request, { cache: 'no-store' }));
});
