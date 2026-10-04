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
  // El panel del dueño y la app del cliente usan sesiones SEPARADAS: la app del cliente corre en una app de Firebase aparte
  // ("cliente"), así que el dueño logueado en el panel no queda logueado como cliente (ni al revés) en el mismo navegador.
  var isAdminPage = window.BARBERPRO_PAGE === "admin";
  var fbApp = isAdminPage ? firebase.initializeApp(cfg.firebase) : firebase.initializeApp(cfg.firebase, "cliente");
  var db = fbApp.firestore();
  var auth = firebase.auth ? fbApp.auth() : null;

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
  // además se guarda una copia resumida bajo la ficha del cliente (clients/{id}/turnos) para su lista "Mis turnos"
  function turnoCopy(b){
    return {id: b.id, date: b.date, time: b.time, price: b.price, debtCharged: b.debtCharged, payMethod: b.payMethod,
            paid: b.paid, status: b.status, createdAt: b.createdAt};
  }
  persistBooking = function(b){
    return Promise.resolve(b.cid).then(function(cid){
      var batch = db.batch();
      batch.set(db.doc("slots/" + slotDocId(b)), {date: b.date, time: b.time, bid: b.id});
      batch.set(db.doc("bookings/" + b.id), b);
      if(cid) batch.set(db.doc("clients/" + cid + "/turnos/" + b.id), turnoCopy(b));
      if(b.debtCharged > 0) batch.update(db.doc("debtFlags/" + docKey(b.clientKey)), {chargedBy: b.id});   // el saldo ya se sumó a este turno
      return batch.commit().then(function(){ return b; });
    });
  };

  // "Mis turnos": el cliente ve sus reservas y el estado en vivo (el dueño actualiza la copia al cancelar / completar / cobrar)
  var unsubTurnos = null;
  state.myTurnos = [];
  stopWatchTurnos = function(){
    if(unsubTurnos){ try{ unsubTurnos(); }catch(e){} unsubTurnos = null; }
    state.myTurnos = [];
  };
  watchMyTurnos = function(profile){
    stopWatchTurnos();
    if(!profile || !profile.uid) return;
    unsubTurnos = db.collection("clients/" + profile.uid + "/turnos").onSnapshot(function(snap){
      var arr = []; snap.forEach(function(d){ arr.push(d.data()); });
      state.myTurnos = arr;
      hooks.refresh();
    }, function(e){ console.error("turnos", e); });
  };
  myTurnos = function(){ return state.myTurnos.slice(); };

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

  // cuentas de clientes: mail + contraseña (Firebase Authentication); el perfil (con foto) vive en clients/{uid}
  if(!isAdminPage && auth){
    var persist = function(remember){
      var P = firebase.auth.Auth.Persistence;
      return auth.setPersistence(remember === false ? P.SESSION : P.LOCAL);
    };
    var loadProfile = function(u){
      return db.doc("clients/" + u.uid).get().then(function(snap){
        return snap.exists ? Object.assign({uid: u.uid}, snap.data()) : null;
      });
    };
    clientAuth = {
      restore: function(){
        return new Promise(function(resolve){
          var un = auth.onAuthStateChanged(function(u){
            un();
            if(!u) return resolve(null);
            loadProfile(u).then(resolve).catch(function(){ resolve(null); });
          });
        });
      },
      register: function(p, password, remember){
        var prof = cleanProfile(p);
        return persist(remember).then(function(){ return auth.createUserWithEmailAndPassword(prof.email, password); })
          .then(function(cred){
            var u = cred.user;
            return db.doc("clients/" + u.uid).set(prof).then(function(){ return Object.assign({uid: u.uid}, prof); })
              .catch(function(e){ u.delete().catch(function(){}); throw e; });   // sin perfil no queda cuenta a medias
          });
      },
      login: function(email, password, remember){
        return persist(remember).then(function(){ return auth.signInWithEmailAndPassword(String(email).trim(), password); })
          .then(function(cred){
            return loadProfile(cred.user).then(function(p){
              if(!p){ auth.signOut(); throw authErr("auth/user-not-found"); }
              return p;
            });
          });
      },
      logout: function(){ return auth.signOut(); },
      update: function(p){
        var u = auth.currentUser, prof = cleanProfile(p);
        if(!u) return Promise.reject(authErr("auth/user-not-found"));
        return db.doc("clients/" + u.uid).set(prof).then(function(){ return Object.assign({uid: u.uid}, prof); });
      },
      resetPassword: function(email){ return auth.sendPasswordResetEmail(String(email).trim()); }
    };
  }

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
    unsubAdmin.push(db.collection("clients").onSnapshot(function(snap){
      var arr = []; snap.forEach(function(d){ arr.push(Object.assign({uid: d.id}, d.data())); });
      state.clients = arr;
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
  if(auth && isAdminPage){
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
    // remember: la sesión queda en este dispositivo (sigue al cerrar el navegador) o solo mientras la pestaña esté abierta
    login: function(email, pass, remember){
      var P = firebase.auth.Auth.Persistence;
      return auth.setPersistence(remember === false ? P.SESSION : P.LOCAL).then(function(){
        return auth.signInWithEmailAndPassword(email, pass);
      });
    },
    logout: function(){ return auth.signOut(); },
    resetPassword: function(email){ return auth.sendPasswordResetEmail(email); },
    // cambiar la contraseña: se confirma primero la actual (Firebase lo exige para operaciones sensibles)
    changePassword: function(current, next){
      var u = auth.currentUser;
      if(!u) return Promise.reject(authErr("auth/user-not-found"));
      var cred = firebase.auth.EmailAuthProvider.credential(u.email, current);
      return u.reauthenticateWithCredential(cred).then(function(){ return u.updatePassword(next); });
    }
  };
  state.clients = [];
  ownerClientProfiles = function(){ return state.clients; };

  // en la nube lo único que se guarda "en bloque" es la configuración; las reservas se actualizan una por una
  saveState = function(){
    var c = state.config, out = {};
    CONFIG_KEYS.forEach(function(k){ if(c[k] !== undefined) out[k] = c[k]; });
    out.closures = state.closures || [];
    return db.doc("config/main").set(out).catch(function(e){ fail(e, "No se pudo guardar. ¿Iniciaste sesión como dueño?"); });
  };

  // fecha de hoy en Argentina (las reglas de seguridad deciden con esta misma fecha si una cancelación es "del mismo día")
  function hoyAR(){ return new Intl.DateTimeFormat("en-CA", {timeZone: "America/Argentina/Buenos_Aires"}).format(new Date()); }

  // el cliente cancela su turno: se libera el horario y, si es del mismo día, queda una seña pendiente a su nombre.
  // Todo en un lote; las reglas verifican que la reserva sea suya y que la cancelación tardía sea de verdad del mismo día.
  cancelMyTurno = function(t, profile){
    var u = auth && auth.currentUser;
    if(!u) return Promise.reject(authErr("auth/user-not-found"));
    var uid = u.uid, late = (t.date === hoyAR());
    return db.doc("debtFlags/" + uid).get().then(function(snap){
      var flag = snap.exists ? snap.data() : null, batch = db.batch(), now = Date.now();
      batch.update(db.doc("bookings/" + t.id), {status: "cancelled", lateCancel: late});
      batch.update(db.doc("clients/" + uid + "/turnos/" + t.id), {status: "cancelled"});
      batch.delete(db.doc("slots/" + t.date + "_" + String(t.time).replace(":", "")));        // el horario vuelve a quedar libre
      var next = flag;
      if(flag && flag.chargedBy === t.id){                                                    // el saldo que traía este turno vuelve a estar pendiente
        batch.update(db.doc("debtFlags/" + uid), {chargedBy: null});
        next = Object.assign({}, flag, {chargedBy: null});
      }
      if(late && !flag){
        batch.set(db.doc("debts/" + uid), {name: profile.name, lastname: profile.lastname, phone: profile.phone, since: now, bid: t.id});
        batch.set(db.doc("debtFlags/" + uid), {since: now, bid: t.id});
        next = {since: now, bid: t.id};
      }
      return batch.commit().then(function(){
        state.debtFlags[docKey(uid)] = next;
        showToast(late ? "Turno cancelado. Quedó una seña pendiente (cancelación del mismo día)." : "Turno cancelado sin cargo.");
      });
    });
  };

  // referencia a la copia "Mis turnos" de una reserva (las reservas viejas no traen cid: se calcula)
  function turnoRefFor(b){
    return Promise.resolve(b.cid ? db.doc("clients/" + b.cid + "/turnos/" + b.id) : null);
  }
  // cambios que el cliente tiene que ver reflejados en su lista
  function turnoPatch(patch){
    var out = {}, any = false;
    ["status", "paid"].forEach(function(k){ if(patch[k] !== undefined){ out[k] = patch[k]; any = true; } });
    return any ? out : null;
  }

  updateBooking = function(id, patch){
    var b = state.bookings.filter(function(x){ return x.id === id; })[0], tp = turnoPatch(patch);
    if(!b || !tp) return db.doc("bookings/" + id).update(patch).catch(function(e){ fail(e); });
    return turnoRefFor(b).then(function(ref){
      var batch = db.batch();
      batch.update(db.doc("bookings/" + id), patch);
      if(ref) batch.set(ref, Object.assign(turnoCopy(b), tp), {merge: true});
      return batch.commit();
    }).catch(function(e){ fail(e); });
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
    turnoRefFor(b).then(function(ref){
      var batch = db.batch();
      batch.update(db.doc("bookings/" + id), {status: "cancelled"});
      if(ref) batch.set(ref, Object.assign(turnoCopy(b), {status: "cancelled"}), {merge: true});
      batch.delete(db.doc("slots/" + slotDocId(b)));                    // el horario vuelve a quedar libre
      if(penalized){
        var k = docKey(b.clientKey);
        batch.set(db.doc("debts/" + k), {name: b.name, lastname: b.lastname, phone: b.phone, since: Date.now()});
        batch.set(db.doc("debtFlags/" + k), {since: Date.now()});
      }
      return batch.commit();
    }).then(function(){
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
    var turnos = db.collection("clients").get().then(function(cs){
      return Promise.all(cs.docs.map(function(c){ return c.ref.collection("turnos").get(); }));
    });
    return Promise.all(names.map(function(n){ return db.collection(n).get(); }).concat([turnos])).then(function(snaps){
      var refs = [];
      snaps.slice(0, names.length).forEach(function(s){ s.forEach(function(d){ refs.push(d.ref); }); });
      snaps[names.length].forEach(function(s){ s.forEach(function(d){ refs.push(d.ref); }); });
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
