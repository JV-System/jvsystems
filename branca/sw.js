// Service Worker desactivado — la app requiere conexión a internet
// Este archivo existe solo para desregistrar versiones anteriores

self.addEventListener('install', function() { self.skipWaiting(); });
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) { return caches.delete(k); }));
    }).then(function() { return self.clients.claim(); })
  );
});
self.addEventListener('fetch', function(event) {
  event.respondWith(fetch(event.request));
});
