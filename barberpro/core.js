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

// ---------- equipo ----------
// El dueño (administrador) también es un barbero. Los empleados entran al panel con su usuario y ven solo sus turnos.
function cleanTeam(list){
  var seen = {};
  return (list || []).map(function(m){
    var id = String(m.id || m.name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "").slice(0, 24);
    if(!id || seen[id]) return null;
    seen[id] = 1;
    return {id: id, name: String(m.name || id).slice(0, 40), role: m.role === "employee" ? "employee" : "owner",
            whatsapp: String(m.whatsapp || "").replace(/[^\d]/g, ""), active: m.active !== false};
  }).filter(Boolean);
}
function teamList(){
  var t = state.config.team;
  return Array.isArray(t) && t.length ? t : [{id: "dueno", name: "Dueño", role: "owner", whatsapp: "", active: true}];
}
function activeBarbers(){ return teamList().filter(function(m){ return m.active !== false; }); }
function barberById(id){ return teamList().filter(function(m){ return m.id === id; })[0] || null; }
function ownerBarber(){ return teamList().filter(function(m){ return m.role === "owner"; })[0] || teamList()[0]; }
// a quién se le asigna una reserva: las anteriores al equipo (sin barbero) son del dueño
function barberOfBooking(b){ return b.barberId || ownerBarber().id; }

// Datos de esta barbería que vienen en config.js (viajan a todos los celulares).
// Solo cuentan los textos que no estén vacíos; lo que se guarde desde el panel en un navegador los pisa.
function fileDefaults(){
  var f = window.BARBERPRO_CONFIG || {}, out = {};
  ["businessName","tagline","address","mapsLink","heroImage","mapboxToken","whatsappDisplay","whatsappLink","payAlias","payHolder","payMpLink"].forEach(function(k){
    if(typeof f[k] === "string" && f[k].trim()) out[k] = f[k].trim();
  });
  if(out.whatsappDisplay && !out.whatsappLink) out.whatsappLink = out.whatsappDisplay.replace(/\D/g,"");
  if(Array.isArray(f.team) && f.team.length) out.team = cleanTeam(f.team);
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
      depositPercent:50,        // seña que se paga al reservar (% del precio); 0 = sin seña
      team:[],                  // equipo: [{id, name, role:"owner"|"employee", whatsapp, active}]; vacío = un solo barbero
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
  var crew = (Array.isArray(s.config.team) && s.config.team.length ? s.config.team : [{id:"dueno", name:"Dueño"}]), bi = 0;
  function mk(name,lastname,phone,date,time){
    var who = crew[bi++ % crew.length];
    return {id:uid(), name:name, lastname:lastname, phone:phone||"", email:(name+lastname).toLowerCase().replace(/[^a-z]/g,"")+"@example.com", date:date, time:time,
      price:s.config.price, debtCharged:0, status:"confirmed", createdAt:Date.now(),
      barberId:who.id, barberName:who.name,
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

  seedClientStories(s);
}

// Cinco clientes inventados con historias distintas (para ver el panel con actividad real):
//  1) Matías "El Gato": cliente fiel, se corta cada ~2 semanas hace casi 6 meses, paga por transferencia
//  2) Nico: cada 3 semanas, paga con Mercado Pago, canceló una vez con aviso y tiene turno mañana (aparece en recordatorios)
//  3) Fede: cancelador, una cancelación del mismo día (seña pendiente) y un turno pasado sin cobrar
//  4) Tomi: cliente nuevo, vino hace unos días y quedó sin pagar; tiene turno hoy
//  5) Joaquín: dejó de venir hace más de 4 meses
function seedClientStories(s){
  var today = toISO(new Date());
  var price = s.config.price;

  function slotsOf(iso){
    var day = (s.config.hours || {})[DOW_KEYS[fromISO(iso).getDay()]];
    var out = [];
    if(!day) return out;
    [day.morning, day.afternoon].forEach(function(r){
      if(r && r.active){
        for(var t = timeToMin(r.start); t + s.config.slotMinutes <= timeToMin(r.end); t += s.config.slotMinutes) out.push(minToTime(t));
      }
    });
    return out;
  }
  // el día abierto más cercano (hacia atrás o hacia adelante) y, dentro de ese día, el horario más parecido al preferido
  function openDay(iso, dir){
    for(var i = 0; i < 8 && !slotsOf(iso).length; i++) iso = addDays(iso, dir);
    return iso;
  }
  function pickTime(iso, pref){
    var sl = slotsOf(iso), want = timeToMin(pref), best = sl[0];
    sl.forEach(function(t){ if(Math.abs(timeToMin(t) - want) < Math.abs(timeToMin(best) - want)) best = t; });
    return best;
  }

  var crewS = (Array.isArray(s.config.team) && s.config.team.length ? s.config.team : [{id:"dueno", name:"Dueño"}]);
  function person(name, lastname, nickname, phone, crewIdx){
    var who = crewS[(crewIdx || 0) % crewS.length];
    var mail = (name + lastname).toLowerCase().replace(/[^a-z]/g, "") + "@example.com";
    var p = {name: name, lastname: lastname, nickname: nickname, phone: phone, email: mail, barberId: who.id, barberName: who.name};
    p.key = clientKeyOf(name, lastname, phone);
    return p;
  }
  // offset: días respecto de hoy (negativo = pasado)
  function add(p, offset, pref, o){
    o = o || {};
    var iso = openDay(addDays(today, offset), offset < 0 ? -1 : 1);
    var time = pickTime(iso, pref);
    if(!time) return null;
    // seña y saldo: o.dep / o.bal = "paid" | "informed" | "pending" (por defecto: pagados si o.paid, si no pendientes)
    var dep = depositFor(price);
    var depSt = dep > 0 ? (o.dep || (o.paid ? "paid" : "pending")) : "paid";
    var balSt = o.bal || (o.paid ? "paid" : "pending");
    var b = {
      id: uid() + Math.random().toString(36).slice(2, 5), name: p.name, lastname: p.lastname, nickname: p.nickname, phone: p.phone, email: p.email,
      date: iso, time: time, price: price, debtCharged: o.debt || 0,
      payMethod: o.pay || "local", deposit: dep, depositState: depSt, balanceState: balSt,
      paid: depSt === "paid" && balSt === "paid", status: o.status || "completed",
      createdAt: fromISO(addDays(iso, -2)).getTime(), seenByOwner: true, clientKey: p.key, isExample: true,
      barberId: p.barberId, barberName: p.barberName
    };
    if(balSt !== "pending") b.balanceMethod = o.pay === "mp" ? "mp" : o.pay === "transfer" ? "transfer" : "cash";
    if(o.status === "cancelled" && o.late){ b.lateCancel = true; }
    s.bookings.push(b);
    return b;
  }

  // 1) Matías: 12 cortes, ~cada 14 días, todos pagados (casi siempre por transferencia) + próximo turno
  var matias = person("Matías", "Romero", "El Gato", "3415550101", 0);
  var gaps = [9, 14, 15, 13, 14, 14, 16, 12, 14, 15, 14, 13];
  var off = -4;
  gaps.forEach(function(g, i){
    add(matias, off, "18:00", {pay: i % 4 === 3 ? "local" : "transfer", paid: true});
    off -= g;
  });
  add(matias, 8, "18:00", {pay: "transfer", status: "confirmed", dep: "paid"});               // ya pagó la seña

  // 2) Nico: 7 cortes cada 3 semanas con Mercado Pago, una cancelación con aviso, turno mañana ya pagado
  var nico = person("Nicolás", "Benítez", "Nico", "3415550102", 2);
  for(var k = 0; k < 7; k++) add(nico, -9 - 21 * k, "11:00", {pay: "mp", paid: true});
  add(nico, -30, "11:00", {pay: "mp", status: "cancelled", dep: "paid"});   // canceló con tiempo: hay que devolverle la seña
  add(nico, 1, "10:30", {pay: "mp", status: "confirmed", dep: "paid"});       // turno de mañana, seña paga

  // 3) Fede: cancela bastante. Una seña pendiente por cancelar el mismo día, otro turno que no se marcó ni se cobró
  var fede = person("Federico", "Acosta", "Fede", "3415550103", 1);
  add(fede, -96, "16:00", {paid: true});
  add(fede, -75, "16:00", {status: "cancelled"});
  add(fede, -52, "16:00", {paid: true});
  add(fede, -40, "16:00", {status: "cancelled"});
  add(fede, -27, "16:00", {paid: true});
  add(fede, -12, "16:30", {status: "confirmed"});                      // vino (o no) y quedó sin completar ni cobrar
  add(fede, -3, "16:00", {status: "cancelled", late: true});             // cancelada el mismo día sin haber pagado seña: queda el cargo
  s.debts[fede.key] = {name: fede.name, lastname: fede.lastname, phone: fede.phone, since: fromISO(addDays(today, -3)).getTime(), isExample: true};
  add(fede, 6, "16:00", {status: "confirmed", dep: "informed", pay: "transfer"});   // avisó que transfirió la seña (falta confirmarla)

  // 4) Tomi: nuevo. Su primer corte quedó sin pagar y hoy tiene otro turno
  var tomi = person("Tomás", "Giménez", "Tomi", "3415550104", 1);
  add(tomi, -3, "12:00", {pay: "transfer", status: "completed", dep: "paid", bal: "informed"});   // pagó la seña y avisó que transfirió el saldo
  add(tomi, 0, "15:00", {pay: "mp", status: "confirmed", dep: "paid"});

  // seña retenida: canceló el mismo día habiendo pagado la seña
  add(matias, -60, "18:00", {pay: "transfer", status: "cancelled", dep: "paid", late: true});

  // 5) Joaquín: 5 cortes mensuales y dejó de venir hace más de 4 meses
  var joa = person("Joaquín", "Peralta", "", "3415550105", 0);
  for(var j = 0; j < 5; j++) add(joa, -128 - 31 * j, "10:00", {paid: true});
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
    if(!Array.isArray(parsed.config.team) || !parsed.config.team.length) parsed.config.team = fd.team || [];
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
// ---------- seña y saldo ----------
// Un turno se paga en dos partes: la SEÑA al reservar y el SALDO al terminar el corte. Cada parte pasa por
// "pendiente" -> "informado" (el cliente avisó que pagó) -> "pagado" (el local lo confirmó o lo cobró en efectivo).
function depositFor(price){
  var p = state.config.depositPercent;
  if(p === undefined || p === null || p === "") p = 50;
  p = Math.max(0, Math.min(100, Number(p) || 0));
  return Math.round(price * p / 100);
}
function bookingTotal(b){ return b.price + (b.debtCharged || 0); }
function depState(b){ return b.depositState || (b.paid ? "paid" : "pending"); }
function balState(b){ return b.balanceState || (b.paid ? "paid" : "pending"); }
// la seña se quedó en el local (pagada y con monto): si cancela el mismo día no se devuelve
function depositKept(b){ return (b.deposit || 0) > 0 && depState(b) === "paid" && !b.depositRefunded; }
// dinero ya cobrado de este turno
function collectedOf(b){
  var total = bookingTotal(b), dep = b.deposit || 0;
  if(b.paid) return total;
  var c = 0;
  if(depState(b) === "paid") c += dep;
  if(balState(b) === "paid") c += Math.max(0, total - dep);
  return c;
}
function balanceDue(b){ return Math.max(0, bookingTotal(b) - collectedOf(b)); }
// ya pasó la hora en que termina el turno
function turnoEnded(b){
  var now = new Date(), today = toISO(now);
  if(b.date < today) return true;
  if(b.date > today) return false;
  return timeToMin(b.time) + state.config.slotMinutes <= now.getHours() * 60 + now.getMinutes();
}
// el cliente avisa que pagó (kind: "deposit" | "balance"; method: "mp" | "transfer"). Local: se anota en el navegador.
// cloud.js lo reemplaza por la versión de Firestore.
function informPayment(t, kind, method){
  var b = state.bookings.filter(function(x){ return x.id === t.id; })[0];
  if(!b) return Promise.resolve();
  if(kind === "deposit"){ b.depositState = "informed"; b.payMethod = method; }
  else { b.balanceState = "informed"; b.balanceMethod = method; }
  saveState();
  hooks.refresh();
  showToast("Listo, avisamos al local. Va a confirmar tu pago.");
  return Promise.resolve();
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
function generateSlots(iso, barber){
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
  var taken = takenTimes(iso, barber);
  slots = slots.filter(function(s){ return !taken[s]; });
  return slots;
}
function getSlotStatuses(iso, barber){
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
  var takenSet = takenTimes(iso, barber);
  return slots.map(function(s){ return {time:s, taken:!!takenSet[s]}; });
}

// ---------- operaciones de datos ----------
// Versión LOCAL (demo, guarda en este navegador). cloud.js las reemplaza por la versión de Firestore cuando hay Firebase configurado,
// así client.js y admin.js funcionan igual en los dos modos.

// horarios ocupados de un día: { "10:00": true, ... }
// barber (opcional): solo cuentan los turnos de ese barbero (las reservas sin barbero bloquean a todos)
function takenTimes(iso, barber){
  var out = {};
  state.bookings.forEach(function(b){
    if(b.date===iso && b.status!=="cancelled" && (!barber || !b.barberId || b.barberId===barber)) out[b.time] = true;
  });
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
  var late = (b.date===todayISO && b.status==="confirmed");
  var kept = depositKept(b);
  var penalized = late && !kept;                        // si ya pagó la seña, esa es la penalidad: no se le suma una deuda
  if(penalized){
    state.debts[b.clientKey] = {name:b.name, lastname:b.lastname, phone:b.phone, since:Date.now()};
  }
  b.status = "cancelled";
  b.lateCancel = late;
  saveState();
  hooks.refresh();
  showToast(penalized ? "Turno cancelado. Se registró una seña pendiente (cancelación del mismo día)."
    : late && kept ? "Turno cancelado. La seña queda en el local (cancelación del mismo día)."
    : kept ? "Turno cancelado. Hay que devolver la seña." : "Turno cancelado sin cargo.");
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
// carga los datos de ejemplo (clientes, turnos y saldos inventados) para ver el panel con actividad. cloud.js lo reemplaza.
function loadExampleData(){
  if(hasExampleData()) return;
  seedExampleData(state);
  saveState();
  hooks.refresh();
  showToast("Datos de ejemplo cargados.");
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
