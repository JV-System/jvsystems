/* BarberPro Turnos - núcleo compartido: datos, utilidades, disponibilidad y reservas.
   Lo usan la app del cliente (index.html) y el panel (admin.html). */
// true cuando hay Firebase configurado y cargado (lo activa cloud.js); false = modo local de demo
var CLOUD = false;

var STORAGE_KEY = "barberpro_turnos_v2";
var PROFILE_KEY = "barberpro_client_profile_v2";
// versiones anteriores (datos de prueba): se borran del dispositivo la primera vez que se abre la app
["barberpro_turnos_v1","barberpro_client_profile","montal_turnos_v4","montal_client_profile"].forEach(function(k){
  try{ localStorage.removeItem(k); }catch(e){}
});
var OWNER_KEY = "barberpro_owner_authed";
var INTRO_KEY = "barberpro_intro_seen";
var DOW_KEYS = ["sun","mon","tue","wed","thu","fri","sat"];
var DOW_LABEL = {sun:"Domingo",mon:"Lunes",tue:"Martes",wed:"Miércoles",thu:"Jueves",fri:"Viernes",sat:"Sábado"};
var DOW_SHORT = {sun:"DOM",mon:"LUN",tue:"MAR",wed:"MIÉ",thu:"JUE",fri:"VIE",sat:"SÁB"};
var MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

function defaultHoursDay(morningActive, afternoonActive){
  return {
    morning:{active:morningActive, start:"09:00", end:"13:00"},
    afternoon:{active:afternoonActive, start:"16:00", end:"20:00"}
  };
}

// Datos de esta barbería que vienen en config.js (viajan a todos los celulares).
// Solo cuentan los textos que no estén vacíos; lo que se guarde desde el panel en un navegador los pisa.
function fileDefaults(){
  var f = window.BARBERPRO_CONFIG || {}, out = {};
  ["businessName","tagline","address","mapsLink","heroImage","mapboxToken","whatsappDisplay","whatsappLink","payAlias","payHolder","payMpLink"].forEach(function(k){
    if(typeof f[k] === "string" && f[k].trim()) out[k] = f[k].trim();
  });
  if(out.whatsappDisplay && !out.whatsappLink) out.whatsappLink = out.whatsappDisplay.replace(/\D/g,"");
  if(Array.isArray(f.mapCenter) && f.mapCenter.length === 2 && isFinite(f.mapCenter[0]) && isFinite(f.mapCenter[1])) out.mapCenter = [Number(f.mapCenter[0]), Number(f.mapCenter[1])];
  var h = fileHours(f.hours);
  if(h){ out.hours = h; out.hoursSig = JSON.stringify(f.hours); }
  return out;
}

// config.js: hours = { mon:[["09:30","17:00"]], ..., sat:[["10:00","12:30"]], sun:[] } (hasta 2 tramos por día)
function fileHours(spec){
  if(!spec || typeof spec !== "object") return null;
  var out = {}, keys = ["sun","mon","tue","wed","thu","fri","sat"];
  keys.forEach(function(k){
    var r = Array.isArray(spec[k]) ? spec[k] : [];
    function shift(i, ds, de){
      var t = r[i];
      return t && t[0] && t[1] ? {active:true, start:t[0], end:t[1]} : {active:false, start:ds, end:de};
    }
    out[k] = { morning: shift(0,"09:00","13:00"), afternoon: shift(1,"16:00","20:00") };
  });
  return out;
}

function defaultState(){
  var st = baseState();
  Object.assign(st.config, fileDefaults());
  return st;
}

function baseState(){
  return {
    config:{
      businessName:"Tu Barbería",
      tagline:"Reservá tu turno online",
      address:"",
      whatsappDisplay:"",
      whatsappLink:"",
      payAlias:"",
      payHolder:"",
      payMpLink:"",
      mapsLink:"",
      heroImage:"",
      mapboxToken:"",
      mapCenter:null,
      price:8000,
      priceIsExample:true,
      slotMinutes:30,
      ownerPin:"1234",
      hours:{
        mon:defaultHoursDay(true,true), tue:defaultHoursDay(true,true), wed:defaultHoursDay(true,true),
        thu:defaultHoursDay(true,true), fri:defaultHoursDay(true,true),
        sat:defaultHoursDay(true,false), sun:defaultHoursDay(false,false)
      }
    },
    closures:[],
    bookings:[],
    debts:{}
  };
}

function seedExampleData(s){
  var d0 = toISO(new Date());
  var days = []; for(var i=0;i<7;i++) days.push(addDays(d0,i));

  function slotsFor(iso){
    var day = s.config.hours[DOW_KEYS[fromISO(iso).getDay()]];
    var ranges = [];
    if(day.morning.active) ranges.push(day.morning);
    if(day.afternoon.active) ranges.push(day.afternoon);
    var slotMin = s.config.slotMinutes, slots = [];
    ranges.forEach(function(r){
      var start=timeToMin(r.start), end=timeToMin(r.end);
      for(var t=start; t+slotMin<=end; t+=slotMin) slots.push(minToTime(t));
    });
    return slots;
  }
  function mk(name,lastname,phone,date,time){
    return {id:uid(), name:name, lastname:lastname, phone:phone||"", email:(name+lastname).toLowerCase().replace(/[^a-z]/g,"")+"@example.com", date:date, time:time,
      price:s.config.price, debtCharged:0, status:"confirmed", createdAt:Date.now(),
      seenByOwner:true, clientKey:clientKeyOf(name,lastname,phone), isExample:true};
  }

  var names = [
    ["Lucas","Gómez","1155550111"], ["Martina","Fernández","1155550222"], ["Ezequiel","Ríos",""],
    ["Brisa","Acosta","1155550333"], ["Tomás","Benítez",""], ["Camila","Torres","1155550555"],
    ["Nicolás","Herrera",""], ["Valentina","Cruz","1155550666"], ["Franco","Molina",""],
    ["Agustina","Paz","1155550777"], ["Bruno","Sosa",""], ["Micaela","Ortiz","1155550888"],
    ["Joaquín","Duarte",""], ["Delfina","Ibáñez","1155550999"], ["Mateo","Aguirre",""]
  ];
  var ni = 0;
  function nextName(){ var n = names[ni % names.length]; ni++; return n; }

  // hoy: un par de turnos sueltos entre horarios libres
  var d0Slots = slotsFor(days[0]);
  if(d0Slots.length){
    var a = nextName();
    s.bookings.push(mk(a[0],a[1],a[2], days[0], d0Slots[Math.min(1, d0Slots.length-1)]));
    if(d0Slots.length>4){ var a2=nextName(); s.bookings.push(mk(a2[0],a2[1],a2[2], days[0], d0Slots[d0Slots.length-2])); }
  }

  // para el resto de la semana, uso los días que realmente tengan horario abierto
  // (así el ejemplo "día completo" no cae justo en un domingo cerrado)
  var openRest = [];
  for(var j=1;j<7;j++){ if(slotsFor(days[j]).length) openRest.push(days[j]); }

  // el primer día abierto: bastante ocupado (3 de cada 4 horarios)
  if(openRest[0]){
    slotsFor(openRest[0]).forEach(function(time, idx){
      if(idx % 4 !== 0){ var n = nextName(); s.bookings.push(mk(n[0],n[1],n[2], openRest[0], time)); }
    });
  }
  // el segundo: día completo, sin ningún horario libre (para ver "no hay horarios disponibles")
  if(openRest[1]){
    slotsFor(openRest[1]).forEach(function(time){
      var n = nextName(); s.bookings.push(mk(n[0],n[1],n[2], openRest[1], time));
    });
  }
  // el tercero: a la mitad
  if(openRest[2]){
    slotsFor(openRest[2]).forEach(function(time, idx){
      if(idx % 2 === 0){ var n = nextName(); s.bookings.push(mk(n[0],n[1],n[2], openRest[2], time)); }
    });
  }
  // el cuarto: un solo turno
  if(openRest[3]){
    var s4 = slotsFor(openRest[3]);
    if(s4.length){ var n4 = nextName(); s.bookings.push(mk(n4[0],n4[1],n4[2], openRest[3], s4[0])); }
  }
  // el resto de los días abiertos quedan a propósito totalmente libres, para ver ese caso también

  // saldos pendientes de ejemplo
  var f1 = clientKeyOf("Facundo","Silva","1155550444");
  s.debts[f1] = {name:"Facundo", lastname:"Silva", phone:"1155550444", since:Date.now(), isExample:true};
  var f2 = clientKeyOf("Rocío","Navarro","");
  s.debts[f2] = {name:"Rocío", lastname:"Navarro", phone:"", since:Date.now(), isExample:true};
}

function loadState(){
  try{
    var raw = localStorage.getItem(STORAGE_KEY);
    if(!raw){
      var fresh = defaultState();
      // arranca vacío; los turnos de ejemplo solo se cargan si config.js pide demoData:true
      if(window.BARBERPRO_CONFIG && window.BARBERPRO_CONFIG.demoData) seedExampleData(fresh);
      return fresh;
    }
    var parsed = JSON.parse(raw);
    var d = defaultState();
    var savedSig = (parsed.config || {}).hoursSig;     // la firma que había guardada, antes de mezclar con los valores de fábrica
    parsed.config = Object.assign({}, d.config, parsed.config||{});
    // un campo vacío en este navegador cae al valor de config.js (si hay)
    // (también si el navegador sigue con el texto genérico de fábrica, que no cuenta como "personalizado")
    var fd = fileDefaults(), generic = baseState().config;
    Object.keys(fd).forEach(function(k){
      if(k==="hours" || k==="hoursSig") return;
      if(!parsed.config[k] || parsed.config[k]===generic[k]) parsed.config[k] = fd[k];
    });
    parsed.config.hours = Object.assign({}, d.config.hours, (parsed.config||{}).hours||{});
    // si cambiaron los horarios en config.js, se adoptan una vez; los que edite el dueño después se respetan
    if(fd.hours && savedSig !== fd.hoursSig){ parsed.config.hours = fd.hours; parsed.config.hoursSig = fd.hoursSig; }
    parsed.closures = parsed.closures||[];
    parsed.bookings = parsed.bookings||[];
    parsed.debts = parsed.debts||{};
    return parsed;
  }catch(e){ return defaultState(); }
}

function saveState(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
}

var state = loadState();

// cada página (cliente / admin) engancha acá lo que hay que redibujar cuando cambian los datos
var hooks = { refresh: function(){}, authChanged: function(){} };

// releer los datos (por ejemplo cuando el otro tab de este navegador guardó algo)
function reloadState(){ state = loadState(); }

// sincroniza cliente y admin abiertos en el mismo navegador
window.addEventListener("storage", function(e){
  if(e.key === STORAGE_KEY){ reloadState(); hooks.refresh(); }
});

// pinta nombre, frase, dirección, WhatsApp y título según la configuración del negocio
function applyBranding(titleSuffix){
  var c = state.config;
  function $(id){ return document.getElementById(id); }
  var wa = $("whatsAppHeaderLink"), ad = $("addressChip");
  if(wa){ wa.href = "https://wa.me/" + c.whatsappLink; wa.hidden = !c.whatsappLink; }
  if($("whatsAppDisplayText")) $("whatsAppDisplayText").textContent = c.whatsappDisplay;
  if($("addressText")) $("addressText").textContent = c.address;
  if(ad){ ad.hidden = !c.address; ad.href = mapsLink() || "#"; }
  if($("metaRow")) $("metaRow").hidden = !c.whatsappLink && !c.address;
  if($("wordmarkText")) $("wordmarkText").textContent = c.businessName;
  if($("taglineText")){ $("taglineText").textContent = c.tagline; $("taglineText").hidden = !c.tagline; }
  if($("footerText")) $("footerText").textContent = c.businessName + " · " + titleSuffix;
  document.title = c.businessName + " · " + titleSuffix;
}

// medios de cobro que el dueño dejó configurados (el pago en el local siempre está)
function payMethods(){
  var c = state.config, m = [{id:"local", label:"En el local", hint:"Abonás cuando venís"}];
  if(c.payAlias) m.push({id:"transfer", label:"Transferencia", hint:"Alias: " + c.payAlias});
  if(c.payMpLink) m.push({id:"mp", label:"Mercado Pago", hint:"Pagás online con un link"});
  return m;
}
function payMethodLabel(id){
  return id==="transfer" ? "Transferencia" : id==="mp" ? "Mercado Pago" : "En el local";
}


// ---------- utils ----------
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function pad2(n){ return n<10 ? "0"+n : ""+n; }
function toISO(d){ return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate()); }
function fromISO(iso){ var p=iso.split("-").map(Number); return new Date(p[0],p[1]-1,p[2]); }
function addDays(iso,n){ var d=fromISO(iso); d.setDate(d.getDate()+n); return toISO(d); }
function addMonths(iso,n){ var d=fromISO(iso); d.setMonth(d.getMonth()+n); d.setDate(1); return toISO(d); }
function weekdayKey(iso){ return DOW_KEYS[fromISO(iso).getDay()]; }
function timeToMin(t){ var p=t.split(":").map(Number); return p[0]*60+p[1]; }
function minToTime(m){ return pad2(Math.floor(m/60))+":"+pad2(m%60); }
function money(n){ return "$" + Math.round(n).toLocaleString("es-AR"); }
function esc(s){ return (s||"").replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function formatDateLong(iso){
  var d = fromISO(iso);
  var wd = DOW_LABEL[DOW_KEYS[d.getDay()]];
  return wd + " " + d.getDate() + " de " + MONTHS[d.getMonth()];
}
function formatDateShort(iso){
  var d = fromISO(iso);
  return d.getDate() + " " + MONTHS[d.getMonth()].slice(0,3);
}
function normalize(s){ return (s||"").trim().toLowerCase().replace(/\s+/g," "); }
function digitsOnly(s){ return (s||"").replace(/\D/g,""); }
function clientKeyOf(name,lastname,phone){
  var ph = digitsOnly(phone);
  if(ph.length>=6) return "tel:"+ph;
  return "name:"+normalize(name+" "+lastname);
}

function askConfirm(title, message, onYes){
  var overlay = document.getElementById("modalOverlay");
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalMsg").textContent = message;
  overlay.classList.add("show");
  function cleanup(){ overlay.classList.remove("show"); yesBtn.onclick=null; noBtn.onclick=null; }
  var yesBtn = document.getElementById("modalYes");
  var noBtn = document.getElementById("modalNo");
  yesBtn.onclick = function(){ cleanup(); onYes(); };
  noBtn.onclick = function(){ cleanup(); };
}

function showToast(msg){
  var t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._h);
  showToast._h = setTimeout(function(){ t.classList.remove("show"); }, 2600);
}

// ---------- availability ----------
function getClosure(iso){
  for(var i=0;i<state.closures.length;i++){ if(state.closures[i].date===iso) return state.closures[i]; }
  return null;
}
function getRangesForDate(iso){
  if(getClosure(iso)) return [];
  var day = state.config.hours[weekdayKey(iso)];
  var ranges = [];
  if(day.morning.active) ranges.push(day.morning);
  if(day.afternoon.active) ranges.push(day.afternoon);
  return ranges;
}
function isDayFullyClosed(iso){ return getRangesForDate(iso).length===0; }
function generateSlots(iso){
  var ranges = getRangesForDate(iso);
  var slotMin = state.config.slotMinutes;
  var slots = [];
  ranges.forEach(function(r){
    var start=timeToMin(r.start), end=timeToMin(r.end);
    for(var t=start; t+slotMin<=end; t+=slotMin){ slots.push(minToTime(t)); }
  });
  var todayISO = toISO(new Date());
  if(iso===todayISO){
    var nowMin = new Date().getHours()*60+new Date().getMinutes();
    slots = slots.filter(function(s){ return timeToMin(s) > nowMin; });
  }
  var taken = takenTimes(iso);
  slots = slots.filter(function(s){ return !taken[s]; });
  return slots;
}
function getSlotStatuses(iso){
  var ranges = getRangesForDate(iso);
  var slotMin = state.config.slotMinutes;
  var slots = [];
  ranges.forEach(function(r){
    var start=timeToMin(r.start), end=timeToMin(r.end);
    for(var t=start; t+slotMin<=end; t+=slotMin){ slots.push(minToTime(t)); }
  });
  var todayISO = toISO(new Date());
  if(iso===todayISO){
    var nowMin = new Date().getHours()*60+new Date().getMinutes();
    slots = slots.filter(function(s){ return timeToMin(s) > nowMin; });
  }
  var takenSet = takenTimes(iso);
  return slots.map(function(s){ return {time:s, taken:!!takenSet[s]}; });
}

// ---------- operaciones de datos ----------
// Versión LOCAL (demo, guarda en este navegador). cloud.js las reemplaza por la versión de Firestore cuando hay Firebase configurado,
// así client.js y admin.js funcionan igual en los dos modos.

// horarios ocupados de un día: { "10:00": true, ... }
function takenTimes(iso){
  var out = {};
  state.bookings.forEach(function(b){ if(b.date===iso && b.status!=="cancelled") out[b.time] = true; });
  return out;
}

// guarda una reserva nueva (devuelve una promesa). Si traía un saldo anterior, queda cobrado en este turno.
function persistBooking(b){
  state.bookings.push(b);
  if(b.debtCharged > 0) delete state.debts[b.clientKey];
  saveState();
  return Promise.resolve(b);
}

// cambia campos de una reserva existente (pagado, avisado, estado...)
function updateBooking(id, patch){
  var b = state.bookings.filter(function(x){ return x.id===id; })[0];
  if(!b) return Promise.resolve();
  Object.assign(b, patch);
  saveState();
  hooks.refresh();
  return Promise.resolve();
}

// el dueño abrió la agenda: lo nuevo pasa a "visto"
function markAllSeen(){
  var changed = false;
  state.bookings.forEach(function(b){ if(!b.seenByOwner){ b.seenByOwner = true; changed = true; } });
  if(changed) saveState();
}

// borra todos los turnos, saldos y cierres
function resetAllData(){
  state.bookings = []; state.debts = {}; state.closures = [];
  saveState();
  hooks.refresh();
  return Promise.resolve();
}

// ¿este cliente tiene un saldo pendiente? (en local ya está cargado en state.debts)
function loadDebtFlag(key){ return Promise.resolve(); }

// ---------- cuentas de clientes (usuario = mail + contraseña) ----------
// Una cuenta tiene: name, lastname, nickname, phone, email y una foto de perfil opcional (JPEG chico en formato data:).
// Versión LOCAL (demo): las cuentas quedan en este navegador. cloud.js las reemplaza por Firebase Authentication + Firestore.
function sha256Hex(text){
  if(window.crypto && crypto.subtle && window.TextEncoder){
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function(buf){
      return Array.prototype.map.call(new Uint8Array(buf), function(b){ return ("0" + b.toString(16)).slice(-2); }).join("");
    });
  }
  return Promise.reject(new Error("sin-crypto"));
}
function cleanProfile(p){
  var out = {name: p.name, lastname: p.lastname, nickname: p.nickname || "", phone: p.phone, email: String(p.email || "").trim().toLowerCase()};
  if(p.photo) out.photo = p.photo;
  return out;
}
function authErr(code){ var e = new Error(code); e.code = code; return e; }

var ACCOUNTS_KEY = "barberpro_accounts_v2";
function localAccounts(){ try{ return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "{}"); }catch(e){ return {}; } }
function saveLocalAccounts(m){ try{ localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(m)); }catch(e){} }
function withUid(p){ var o = cleanProfile(p); o.uid = o.email; return o; }
function setLocalSession(email, remember){
  try{
    (remember ? localStorage : sessionStorage).setItem(PROFILE_KEY, email);
    (remember ? sessionStorage : localStorage).removeItem(PROFILE_KEY);
  }catch(e){}
}

var clientAuth = {
  // ¿hay una sesión abierta en este dispositivo? -> promesa con el perfil o null
  restore: function(){
    var email = null;
    try{ email = localStorage.getItem(PROFILE_KEY) || sessionStorage.getItem(PROFILE_KEY); }catch(e){}
    var acc = email && localAccounts()[email];
    return Promise.resolve(acc ? withUid(acc.profile) : null);
  },
  register: function(p, password, remember){
    var email = String(p.email || "").trim().toLowerCase(), m = localAccounts();
    if(m[email]) return Promise.reject(authErr("auth/email-already-in-use"));
    if(String(password).length < 6) return Promise.reject(authErr("auth/weak-password"));
    return sha256Hex(password).then(function(h){
      m[email] = {profile: cleanProfile(p), hash: h};
      saveLocalAccounts(m); setLocalSession(email, remember);
      return withUid(m[email].profile);
    });
  },
  login: function(email, password, remember){
    email = String(email || "").trim().toLowerCase();
    var acc = localAccounts()[email];
    return sha256Hex(password).then(function(h){
      if(!acc || acc.hash !== h) throw authErr("auth/invalid-credential");
      setLocalSession(email, remember);
      return withUid(acc.profile);
    });
  },
  logout: function(){
    try{ localStorage.removeItem(PROFILE_KEY); sessionStorage.removeItem(PROFILE_KEY); }catch(e){}
    return Promise.resolve();
  },
  update: function(p){
    var m = localAccounts(), email = String(p.email || "").trim().toLowerCase();
    if(!m[email]) return Promise.reject(authErr("auth/user-not-found"));
    m[email].profile = cleanProfile(p); saveLocalAccounts(m);
    return Promise.resolve(withUid(m[email].profile));
  },
  resetPassword: function(){ return Promise.reject(authErr("local-mode")); }
};

function authMessage(e){
  var code = e && e.code ? e.code : "";
  if(code === "auth/email-already-in-use") return "Ya hay una cuenta con ese mail. Iniciá sesión.";
  if(code === "auth/weak-password") return "La contraseña tiene que tener al menos 6 caracteres.";
  if(code === "auth/invalid-email") return "Ese mail no es válido.";
  if(code === "auth/too-many-requests") return "Demasiados intentos. Esperá unos minutos y probá de nuevo.";
  if(code === "auth/network-request-failed") return "Sin conexión. Revisá tu internet.";
  if(code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") return "Mail o contraseña incorrectos.";
  if(code === "local-mode") return "En la versión de prueba no se puede recuperar la contraseña.";
  return "No se pudo completar. Intentá de nuevo.";
}

// Ícono de ojo para mostrar / ocultar contraseñas
var PW_EYE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
var PW_EYE_OFF = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.9 17.9A10.4 10.4 0 0 1 12 19c-6.4 0-10-7-10-7a17.6 17.6 0 0 1 4.1-4.9M9.9 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17.7 17.7 0 0 1-2.2 3.2M1 1l22 22"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
function pwField(id, placeholder, autocomplete){
  return '<div class="pw-wrap"><input type="password" id="'+id+'" placeholder="'+placeholder+'" autocomplete="'+autocomplete+'">' +
    '<button type="button" class="pw-eye" data-eye="'+id+'" aria-label="Mostrar contraseña" aria-pressed="false">'+PW_EYE+'</button></div>';
}
function bindPwEyes(){
  document.querySelectorAll("[data-eye]").forEach(function(btn){
    btn.onclick = function(){
      var inp = document.getElementById(btn.getAttribute("data-eye")), show = inp.type === "password";
      inp.type = show ? "text" : "password";
      btn.innerHTML = show ? PW_EYE_OFF : PW_EYE;
      btn.setAttribute("aria-pressed", show ? "true" : "false");
      btn.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
    };
  });
}

// perfiles de los clientes para el panel del dueño (local: las cuentas de este navegador; cloud.js los trae de Firestore)
function ownerClientProfiles(){
  var m = localAccounts();
  return Object.keys(m).map(function(k){ return withUid(m[k].profile); });
}

// "Tus turnos" del cliente. Local: sus reservas guardadas en este navegador. cloud.js las reemplaza por Firestore.
function watchMyTurnos(profile){}
function stopWatchTurnos(){}
function myTurnos(profile){
  var d = digitsOnly(profile.phone), m = String(profile.email || "").trim().toLowerCase();
  return state.bookings.filter(function(b){ return digitsOnly(b.phone) === d && String(b.email || "").trim().toLowerCase() === m; });
}

// el cliente cancela su propio turno. Local: misma lógica que el dueño (si es del mismo día queda una seña pendiente).
// cloud.js lo reemplaza por la versión de Firestore. Devuelve una promesa.
function cancelMyTurno(t, profile){
  cancelBooking(t.id);
  return Promise.resolve();
}

// ---------- booking ops ----------
function activeDebtFor(key){ return state.debts[key] || null; }
function currentPenalty(){ return Math.round(state.config.price/2); }


function cancelBooking(id){
  var b = state.bookings.filter(function(x){ return x.id===id; })[0];
  if(!b) return;
  var todayISO = toISO(new Date());
  var penalized = (b.date===todayISO && b.status==="confirmed");
  if(penalized){
    state.debts[b.clientKey] = {name:b.name, lastname:b.lastname, phone:b.phone, since:Date.now()};
  }
  b.status = "cancelled";
  saveState();
  hooks.refresh();
  showToast(penalized ? "Turno cancelado. Se registró una seña pendiente (cancelación del mismo día)." : "Turno cancelado sin cargo.");
}

function completeBooking(id){
  var b = state.bookings.filter(function(x){ return x.id===id; })[0];
  if(!b) return;
  b.status = "completed";
  saveState();
  hooks.refresh();
}

function hasExampleData(){
  return state.bookings.some(function(b){ return b.isExample; }) ||
    Object.keys(state.debts).some(function(k){ return state.debts[k].isExample; });
}
function clearExampleData(){
  state.bookings = state.bookings.filter(function(b){ return !b.isExample; });
  Object.keys(state.debts).forEach(function(k){ if(state.debts[k].isExample) delete state.debts[k]; });
  saveState();
  hooks.refresh();
  showToast("Datos de ejemplo borrados.");
}

function settleDebt(key){
  delete state.debts[key];
  saveState();
  hooks.refresh();
  showToast("Saldo marcado como pagado.");
}

// ---------- contacto, recordatorios y calendario ----------
function isValidEmail(e){ return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((e||"").trim()); }

// Número listo para wa.me. Los clientes escriben su teléfono local (código de área + número, sin 0 ni 15);
// se le antepone el prefijo del país (por defecto 549 = Argentina, celular). Se puede cambiar con waCountryPrefix en config.js.
function waNumber(phone){
  var d = digitsOnly(phone).replace(/^0+/, "");
  if(!d) return "";
  var cc = (window.BARBERPRO_CONFIG && window.BARBERPRO_CONFIG.waCountryPrefix) || "549";
  if(d.length >= 12) return d;            // ya trae código de país
  return cc + d;
}

function reminderText(b){
  var c = state.config;
  return "Hola " + (b.nickname || b.name) + "! Te recordamos que mañana " + formatDateLong(b.date) + " a las " + b.time +
    " hs tenés turno en " + c.businessName + (c.address ? " (" + c.address + ")" : "") +
    ". Si no podés venir, avisanos con tiempo: cancelar el mismo día tiene una seña del 50%. ¡Te esperamos!";
}
function reminderWaLink(b){ return "https://wa.me/" + waNumber(b.phone) + "?text=" + encodeURIComponent(reminderText(b)); }
function reminderMailLink(b){
  return "mailto:" + b.email + "?subject=" + encodeURIComponent("Recordatorio de tu turno de mañana en " + state.config.businessName) +
    "&body=" + encodeURIComponent(reminderText(b));
}

// fecha/hora local sin zona horaria (el calendario la toma en la zona del teléfono)
function icsStamp(iso, time, addMin){
  var p = iso.split("-").map(Number), t = time.split(":").map(Number);
  var d = new Date(p[0], p[1]-1, p[2], t[0], t[1] + (addMin||0), 0);
  return d.getFullYear() + pad2(d.getMonth()+1) + pad2(d.getDate()) + "T" + pad2(d.getHours()) + pad2(d.getMinutes()) + "00";
}
function icsEsc(t){ return String(t||"").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }

function calendarInfo(b){
  var c = state.config;
  return {
    title: "Turno en " + c.businessName,
    where: c.address || "",
    details: "Corte " + money(b.price) + (b.debtCharged ? " + saldo anterior " + money(b.debtCharged) : "") +
      ". Si cancelás el mismo día se cobra el 50% de seña.",
    start: icsStamp(b.date, b.time, 0),
    end: icsStamp(b.date, b.time, state.config.slotMinutes)
  };
}
// archivo .ics con aviso 1 día antes y otro 2 horas antes
function icsDataUri(b){
  var i = calendarInfo(b), now = new Date();
  var stamp = now.getUTCFullYear() + pad2(now.getUTCMonth()+1) + pad2(now.getUTCDate()) + "T" + pad2(now.getUTCHours()) + pad2(now.getUTCMinutes()) + pad2(now.getUTCSeconds()) + "Z";
  var L = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//BarberPro//Turnos//ES","CALSCALE:GREGORIAN","BEGIN:VEVENT",
    "UID:" + b.id + "@barberpro","DTSTAMP:" + stamp,"DTSTART:" + i.start,"DTEND:" + i.end,
    "SUMMARY:" + icsEsc(i.title),"LOCATION:" + icsEsc(i.where),"DESCRIPTION:" + icsEsc(i.details),
    "BEGIN:VALARM","TRIGGER:-P1D","ACTION:DISPLAY","DESCRIPTION:" + icsEsc("Mañana tenés turno en " + state.config.businessName),"END:VALARM",
    "BEGIN:VALARM","TRIGGER:-PT2H","ACTION:DISPLAY","DESCRIPTION:" + icsEsc("En 2 horas tenés turno en " + state.config.businessName),"END:VALARM",
    "END:VEVENT","END:VCALENDAR"];
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(L.join("\r\n"));
}
function googleCalendarLink(b){
  var i = calendarInfo(b);
  return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(i.title) +
    "&dates=" + i.start + "/" + i.end + "&details=" + encodeURIComponent(i.details) + "&location=" + encodeURIComponent(i.where);
}

// ---------- ubicación y horarios (para mostrarle al cliente todos los datos del lugar) ----------
// El mapa se arma con nombre + dirección (Google resuelve el local); si config.js trae mapsLink se usa ese.
function mapsQuery(){
  var c = state.config;
  if(!c.address) return "";
  var named = c.businessName && c.businessName !== "Tu Barbería";
  return (named ? c.businessName + ", " : "") + c.address;
}
function mapsLink(){
  var c = state.config;
  if(c.mapsLink) return c.mapsLink;
  var q = mapsQuery();
  return q ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q) : "";
}
function mapsEmbed(){
  var q = mapsQuery();
  // t=k = vista satélite; z=18 = a nivel de cuadra
  return q ? "https://www.google.com/maps?q=" + encodeURIComponent(q) + "&z=18&t=k&output=embed" : "";
}

// [{days:"Lun", text:"09:30 a 17:00"}, {days:"Mar a Vie", text:"09:30 a 19:30"}, ...] agrupando días seguidos iguales
function hoursSummary(){
  var order = ["mon","tue","wed","thu","fri","sat","sun"];
  var short = {mon:"Lun", tue:"Mar", wed:"Mié", thu:"Jue", fri:"Vie", sat:"Sáb", sun:"Dom"};
  function txt(k){
    var d = state.config.hours[k], r = [];
    if(d.morning.active) r.push(d.morning.start + " a " + d.morning.end);
    if(d.afternoon.active) r.push(d.afternoon.start + " a " + d.afternoon.end);
    return r.length ? r.join(" y ") : "Cerrado";
  }
  var groups = [];
  order.forEach(function(k){
    var t = txt(k), g = groups[groups.length-1];
    if(g && g.t === t) g.to = k; else groups.push({from:k, to:k, t:t});
  });
  return groups.map(function(g){
    return {days: g.from === g.to ? short[g.from] : short[g.from] + " a " + short[g.to], text: g.t};
  });
}

// Fondo del encabezado: vista satelital inclinada del local (Mapbox Static Images). Necesita mapboxToken y mapCenter [lng, lat] en config.js.
// Mapbox no tiene bien cargadas todas las calles argentinas, por eso las coordenadas se indican a mano en vez de buscarlas por dirección.
function heroMapUrl(){
  var c = state.config;
  if(c.heroImage) return c.heroImage;      // una foto propia del local tiene prioridad sobre el mapa en vivo
  if(!c.mapboxToken || !c.mapCenter || c.mapCenter.length !== 2) return "";
  return "https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/" + c.mapCenter[0] + "," + c.mapCenter[1] +
    ",17,25,55/600x300@2x?attribution=false&access_token=" + encodeURIComponent(c.mapboxToken);
}
