/* BarberPro - app instalable (Android y iPhone) y avisos de turnos para dueño y empleados.
   Se carga solo en el panel (admin.html). Los avisos usan Web Push estándar: funcionan en Android (Chrome) y en iPhone (iOS 16.4 o más)
   siempre que la app esté instalada en la pantalla de inicio. Las suscripciones se guardan en Firestore (pushSubs) y las manda una función del servidor. */
(function(){
"use strict";
var cfg = window.BARBERPRO_CONFIG || {};
var KEY = cfg.pushPublicKey || "";
var deferred = null;

function ios(){ return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
function standalone(){ return window.navigator.standalone === true || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches); }
function supported(){ return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
function b64ToU8(b64){
  var pad = "=".repeat((4 - b64.length % 4) % 4), s = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/")), out = new Uint8Array(s.length);
  for(var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

window.addEventListener("beforeinstallprompt", function(e){
  e.preventDefault(); deferred = e;
  try{ hooks.refresh(); }catch(err){}
});
window.addEventListener("appinstalled", function(){ deferred = null; try{ hooks.refresh(); }catch(err){} });

// el service worker solo se registra con la base en la nube (en la versión de prueba local no hace falta)
if(CLOUD && "serviceWorker" in navigator && /^https?:$/.test(location.protocol)){
  window.addEventListener("load", function(){ navigator.serviceWorker.register("sw.js").catch(function(e){ console.error("sw", e); }); });
}

function registration(){ return navigator.serviceWorker.ready; }
function currentSub(){ return registration().then(function(r){ return r.pushManager.getSubscription(); }); }

window.PWA = {
  isIOS: ios, isStandalone: standalone, supported: supported,
  canInstall: function(){ return !!deferred; },
  install: function(){
    if(!deferred) return Promise.resolve(false);
    deferred.prompt();
    return deferred.userChoice.then(function(c){ deferred = null; return c.outcome === "accepted"; });
  },
  // "local" (versión de prueba) | "nokey" (el servidor de avisos todavía no está configurado) | "ios-install" | "unsupported" | "denied" | "off" | "on"
  status: function(){
    if(!CLOUD) return Promise.resolve("local");
    if(!KEY) return Promise.resolve("nokey");
    if(ios() && !standalone()) return Promise.resolve("ios-install");
    if(!supported()) return Promise.resolve("unsupported");
    if(Notification.permission === "denied") return Promise.resolve("denied");
    return currentSub().then(function(s){ return s && Notification.permission === "granted" ? "on" : "off"; }).catch(function(){ return "off"; });
  },
  // hay que llamarlo desde un toque del usuario (iPhone lo exige)
  enable: function(){
    return Notification.requestPermission().then(function(p){
      if(p !== "granted"){ var e = new Error("denied"); e.code = "denied"; throw e; }
      return registration();
    }).then(function(reg){
      return reg.pushManager.getSubscription().then(function(s){ return s || reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64ToU8(KEY)}); });
    }).then(function(sub){ return cloudAuth.pushSave(sub); });
  },
  disable: function(){
    return currentSub().then(function(s){
      if(!s) return;
      return cloudAuth.pushRemove(s).catch(function(){}).then(function(){ return s.unsubscribe(); });
    });
  },
  // vuelve a guardar la suscripción con el rol y el barbero de quien está logueado (por si cambió de usuario en el mismo celular)
  resync: function(){
    if(!CLOUD || !KEY || !supported() || Notification.permission !== "granted") return Promise.resolve();
    return currentSub().then(function(s){ return s ? cloudAuth.pushSave(s) : null; }).catch(function(e){ console.error("push resync", e); });
  },
  // aviso local de prueba (comprueba que el celular muestra notificaciones de esta app)
  test: function(){
    return registration().then(function(r){
      return r.showNotification("Aviso de prueba", {body: "Así te van a llegar los turnos nuevos.", icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: {url: "admin.html"}});
    });
  }
};
})();
