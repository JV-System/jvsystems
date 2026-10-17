/* BarberPro - service worker de la app del equipo (dueño y empleados).
   - Siempre pide primero la versión nueva a internet (así la app nunca queda desactualizada) y solo usa la copia guardada si no hay conexión.
   - Recibe los avisos (turno nuevo, cancelación, cambio de día) y los muestra como notificación del celular. */
var CACHE = "barberpro-equipo-v1";
var SHELL = ["admin.html", "app.css", "config.js", "core.js", "cloud.js", "pwa.js", "admin.js", "icons/icon-192.png"];

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(SHELL); }).catch(function(){}).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys().then(function(keys){ return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); })); })
      .then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(e){
  var req = e.request, url = new URL(req.url);
  if(req.method !== "GET" || url.origin !== self.location.origin) return;     // Firebase y fuentes van directo a internet
  e.respondWith(
    fetch(req, {cache: "no-cache"}).then(function(res){
      if(res && res.ok){ var copy = res.clone(); caches.open(CACHE).then(function(c){ c.put(req, copy); }); }
      return res;
    }).catch(function(){
      return caches.match(req).then(function(hit){ return hit || (req.mode === "navigate" ? caches.match("admin.html") : Response.error()); });
    })
  );
});

self.addEventListener("push", function(e){
  var d = {};
  try{ d = e.data ? e.data.json() : {}; }catch(err){ d = {body: e.data ? e.data.text() : ""}; }
  var title = d.title || "BarberPro";
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || "",
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: d.tag || undefined,            // el mismo "tag" reemplaza el aviso anterior en vez de apilar
    renotify: !!d.tag,
    data: {url: d.url || "admin.html"}
  }));
});

self.addEventListener("notificationclick", function(e){
  e.notification.close();
  var target = new URL((e.notification.data && e.notification.data.url) || "admin.html", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type: "window", includeUncontrolled: true}).then(function(list){
    for(var i = 0; i < list.length; i++){
      if(list[i].url.indexOf("admin.html") >= 0 && "focus" in list[i]) return list[i].focus();
    }
    return self.clients.openWindow(target);
  }));
});
