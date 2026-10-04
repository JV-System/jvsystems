/* BarberPro Turnos - datos en la nube (Firebase: Firestore + Authentication).

   Se activa solo si config.js trae `firebase` y el SDK de Firebase cargó; si no, la app sigue en modo local (demo, localStorage).
   Cuando se activa, reemplaza las funciones de core.js que leen/guardan datos para que client.js y admin.js no cambien.

   Qué ve cada uno (las reglas de seguridad están en backend/firestore.rules):
     - cualquiera:  config/main (datos del negocio) y slots (horarios ocupados: solo fecha y hora)
     - cualquiera puede CREAR una reserva (junto con su horario), pero no leer las de otros
     - el dueño (inicia sesión con mail y contraseña): ve y edita todo
*/
(function(){
  "use strict";

  var cfg = window.BARBERPRO_CONFIG || {};
  if(!cfg.firebase || !window.firebase || !firebase.firestore) return;   // sin Firebase: queda el modo local

  CLOUD = true;
  firebase.initializeApp(cfg.firebase);
  var db = firebase.firestore();
  var auth = firebase.auth ? firebase.auth() : null;      // solo lo carga la página del panel

  // el estado en la nube arranca con los valores de fábrica + config.js y se completa con lo que llega de Firestore
  state = defaultState();
  state.slots = {};              // { "2026-10-13": { "10:00": true } }  horarios ocupados (público)
  state.debtFlags = {};          // saldos pendientes consultados (lado cliente)
  state.debtFlagsLoaded = {};

  // campos de config que se guardan en Firestore (el PIN, el mapa y la foto del encabezado quedan fuera: son de config.js)
  var CONFIG_KEYS = ["businessName","tagline","address","mapsLink","whatsappDisplay","whatsappLink",
                     "payAlias","payHolder","payMpLink","price","priceIsExample","slotMinutes","hours"];

  function docKey(k){ return String(k).replace(/[^A-Za-z0-9:_-]/g, "_"); }
  function slotDocId(b){ return b.date + "_" + String(b.time).replace(":", ""); }
  function fail(e, msg){
    console.error(e);
    showToast(msg || "No se pudo completar. Revisá tu conexión e intentá de nuevo.");
  }

  // ---------- datos públicos: configuración y horarios ocupados ----------
  db.doc("config/main").onSnapshot(function(snap){
    if(snap.exists){
      var d = snap.data(), c = defaultState().config;
      CONFIG_KEYS.forEach(function(k){ if(d[k] !== undefined && d[k] !== null) c[k] = d[k]; });
      state.config = c;
      state.closures = Array.isArray(d.closures) ? d.closures : [];
    }
    hooks.refresh();
  }, function(e){ console.error("config", e); });

  db.collection("slots").where("date", ">=", toISO(new Date())).onSnapshot(function(snap){
    var m = {};
    snap.forEach(function(doc){ var d = doc.data(); (m[d.date] = m[d.date] || {})[d.time] = true; });
    state.slots = m;
    hooks.refresh();
  }, function(e){ console.error("slots", e); });

  takenTimes = function(iso){
    var out = {}, m = state.slots[iso];
    if(m) Object.keys(m).forEach(function(t){ out[t] = true; });
    return out;
  };

  // ---------- el cliente reserva ----------
  // reserva + marca de horario ocupado en un mismo lote; si alguien tomó el horario antes, Firestore lo rechaza
  persistBooking = function(b){
    var batch = db.batch();
    batch.set(db.doc("slots/" + slotDocId(b)), {date: b.date, time: b.time, bid: b.id});
    batch.set(db.doc("bookings/" + b.id), b);
    if(b.debtCharged > 0) batch.update(db.doc("debtFlags/" + docKey(b.clientKey)), {chargedBy: b.id});   // el saldo ya se sumó a este turno
    return batch.commit().then(function(){ return b; });
  };

  // ¿tiene un saldo pendiente? (se consulta de a uno; no se pueden listar)
  loadDebtFlag = function(key){
    var dk = docKey(key);
    return db.doc("debtFlags/" + dk).get().then(function(snap){
      state.debtFlags[dk] = snap.exists ? snap.data() : null;
      state.debtFlagsLoaded[key] = true;
      hooks.refresh();
    }).catch(function(e){ console.error("debtFlag", e); });
  };
  activeDebtFor = function(key){
    var f = state.debtFlags[docKey(key)];
    return (f && !f.chargedBy) ? f : null;
  };

  // fichas de clientes (id = hash de teléfono + mail): permiten "Iniciar sesión" desde otro celular
  findClient = function(phone, email){
    return clientDocId(phone, email).then(function(id){ return db.doc("clients/" + id).get(); })
      .then(function(snap){ return snap.exists ? snap.data() : null; });
  };
  saveClientProfile = function(p){
    return clientDocId(p.phone, p.email).then(function(id){ return db.doc("clients/" + id).set(cleanProfile(p)); });
  };

  reloadState = function(){};            // los datos ya llegan en vivo
  hasExampleData = function(){ return false; };
  clearExampleData = function(){};

  // ---------- el dueño ----------
  var unsubAdmin = [];
  function stopAdminListeners(){
    unsubAdmin.forEach(function(u){ try{ u(); }catch(e){} });
    unsubAdmin = [];
  }
  function adminError(e){
    console.error("panel", e);
    if(e && e.code === "permission-denied"){
      showToast("Esta cuenta no es la del dueño de la barbería.");
      if(auth) auth.signOut();
    }
  }
  function startAdminListeners(){
    stopAdminListeners();
    unsubAdmin.push(db.collection("bookings").onSnapshot(function(snap){
      var arr = []; snap.forEach(function(d){ arr.push(d.data()); });
      state.bookings = arr;
      hooks.refresh();
    }, adminError));
    unsubAdmin.push(db.collection("debts").onSnapshot(function(snap){
      var m = {}; snap.forEach(function(d){ m[d.id] = d.data(); });
      state.debts = m;
      hooks.refresh();
    }, adminError));
    // la primera vez que entra el dueño, se guarda la configuración inicial (config.js + valores de fábrica)
    db.doc("config/main").get().then(function(s){ if(!s.exists) saveState(); }).catch(function(e){ console.error(e); });
  }

  var authReady = false;
  if(auth){
    auth.onAuthStateChanged(function(u){
      authReady = true;
      if(u){ startAdminListeners(); }
      else { stopAdminListeners(); state.bookings = []; state.debts = {}; }
      hooks.authChanged();
      hooks.refresh();
    });
  }
  window.cloudAuth = {
    available: !!auth,
    isReady: function(){ return authReady || !auth; },
    user: function(){ return auth ? auth.currentUser : null; },
    login: function(email, pass){ return auth.signInWithEmailAndPassword(email, pass); },
    logout: function(){ return auth.signOut(); },
    resetPassword: function(email){ return auth.sendPasswordResetEmail(email); }
  };

  // en la nube lo único que se guarda "en bloque" es la configuración; las reservas se actualizan una por una
  saveState = function(){
    var c = state.config, out = {};
    CONFIG_KEYS.forEach(function(k){ if(c[k] !== undefined) out[k] = c[k]; });
    out.closures = state.closures || [];
    return db.doc("config/main").set(out).catch(function(e){ fail(e, "No se pudo guardar. ¿Iniciaste sesión como dueño?"); });
  };

  updateBooking = function(id, patch){
    return db.doc("bookings/" + id).update(patch).catch(function(e){ fail(e); });
  };

  markAllSeen = function(){
    var unseen = state.bookings.filter(function(b){ return !b.seenByOwner; });
    if(!unseen.length) return;
    var batch = db.batch();
    unseen.forEach(function(b){ batch.update(db.doc("bookings/" + b.id), {seenByOwner: true}); });
    batch.commit().catch(function(e){ console.error(e); });
  };

  cancelBooking = function(id){
    var b = state.bookings.filter(function(x){ return x.id === id; })[0];
    if(!b) return;
    var penalized = (b.date === toISO(new Date()) && b.status === "confirmed");
    var batch = db.batch();
    batch.update(db.doc("bookings/" + id), {status: "cancelled"});
    batch.delete(db.doc("slots/" + slotDocId(b)));                    // el horario vuelve a quedar libre
    if(penalized){
      var k = docKey(b.clientKey);
      batch.set(db.doc("debts/" + k), {name: b.name, lastname: b.lastname, phone: b.phone, since: Date.now()});
      batch.set(db.doc("debtFlags/" + k), {since: Date.now()});
    }
    batch.commit().then(function(){
      showToast(penalized ? "Turno cancelado. Se registró una seña pendiente (cancelación del mismo día)." : "Turno cancelado sin cargo.");
    }).catch(function(e){ fail(e); });
  };

  completeBooking = function(id){ updateBooking(id, {status: "completed"}); };

  settleDebt = function(key){
    var k = docKey(key), batch = db.batch();
    batch.delete(db.doc("debts/" + k));
    batch.delete(db.doc("debtFlags/" + k));
    return batch.commit().then(function(){ showToast("Saldo marcado como pagado."); }).catch(function(e){ fail(e); });
  };

  resetAllData = function(){
    var names = ["bookings", "slots", "debts", "debtFlags"];
    return Promise.all(names.map(function(n){ return db.collection(n).get(); })).then(function(snaps){
      var refs = [];
      snaps.forEach(function(s){ s.forEach(function(d){ refs.push(d.ref); }); });
      var jobs = [];
      for(var i = 0; i < refs.length; i += 400){
        var batch = db.batch();
        refs.slice(i, i + 400).forEach(function(r){ batch.delete(r); });
        jobs.push(batch.commit());
      }
      state.closures = [];
      jobs.push(saveState());
      return Promise.all(jobs);
    }).catch(function(e){ fail(e); });
  };
})();
