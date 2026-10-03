/* BarberPro Turnos - núcleo compartido: datos, utilidades, disponibilidad y reservas.
   Lo usan la app del cliente (index.html) y el panel (admin.html). */
var STORAGE_KEY = "barberpro_turnos_v1";
var PROFILE_KEY = "barberpro_client_profile";
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

function defaultState(){
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
    return {id:uid(), name:name, lastname:lastname, phone:phone||"", date:date, time:time,
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
      seedExampleData(fresh);
      return fresh;
    }
    var parsed = JSON.parse(raw);
    var d = defaultState();
    parsed.config = Object.assign({}, d.config, parsed.config||{});
    parsed.config.hours = Object.assign({}, d.config.hours, (parsed.config||{}).hours||{});
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
var hooks = { refresh: function(){} };

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
  if(ad) ad.hidden = !c.address;
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
  var taken = state.bookings.filter(function(b){ return b.date===iso && b.status!=="cancelled"; }).map(function(b){ return b.time; });
  slots = slots.filter(function(s){ return taken.indexOf(s)===-1; });
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
  var takenSet = {};
  state.bookings.filter(function(b){ return b.date===iso && b.status!=="cancelled"; }).forEach(function(b){ takenSet[b.time]=true; });
  return slots.map(function(s){ return {time:s, taken:!!takenSet[s]}; });
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

