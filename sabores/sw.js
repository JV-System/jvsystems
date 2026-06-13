const CACHE = 'sabores-v12';
// Rutas relativas al scope del SW (/sabores/)
const ASSETS = [
  './manifest.json',
  './jvs-logo.png',
  './jvs-icon.png',
  './LogoYerba.png'
];

// Clic en notificación: abrir/enfocar la app y navegar a Comunicación
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const app = clients.find(c => c.url.includes('/sabores/'));
      if(app){ app.focus(); app.postMessage({ type: 'OPEN_CHAT' }); }
      else { self.clients.openWindow('./index.html'); }
    })
  );
});

// Instalar: cachear assets estáticos + skipWaiting inmediato
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(ASSETS.map(url => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

// Activar: limpiar caches viejos, tomar control, notificar clientes
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => {
        return self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }));
        });
      })
  );
});

// Mensaje desde la app: forzar skipWaiting
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Fetch: network-first para HTML (siempre fresco), cache-first para assets
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (!url.pathname.startsWith('/sabores/') && !url.pathname.includes('sabores')) return;

  const isHTML = url.pathname.endsWith('.html') || url.pathname.endsWith('/');

  if (isHTML) {
    // Network-first: siempre busca la versión nueva, cae a caché si no hay red
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' }).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request)
               .then(cached => cached || caches.match('./index.html'))
      )
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        }).catch(() => caches.match('./index.html'));
      })
    );
  }
});
