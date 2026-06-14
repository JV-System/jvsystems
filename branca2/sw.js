// Service Worker desactivado — la app requiere conexión a internet
// v3 — forzar actualización en todos los dispositivos
const SW_VERSION = 3;

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
  // Sin caché — siempre red
  event.respondWith(fetch(event.request));
});
