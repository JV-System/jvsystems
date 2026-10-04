/* BarberPro Turnos - app del cliente: registrarse, reservar y pagar.
   Depende de core.js (estado, utilidades, disponibilidad). */
(function(){
"use strict";

var client = {
  step:6,   // 6 cargando sesión, 0 inicio (iniciar sesión / crear cuenta), 5 iniciar sesión, 1 datos, 2 fecha, 3 confirmar, 4 listo
  name:"", lastname:"", nickname:"", phone:"", email:"", photo:"", uid:"", registered:false,
  selectedDate:null, selectedTime:null, calMonth:null, barber:"",
  payMethod:"local",
  lastBooking:null
};

// ---------- apertura ----------
(function(){
  var overlay = document.getElementById("introOverlay");
  if(!overlay) return;
  var seen = false;
  try{ seen = sessionStorage.getItem(INTRO_KEY)==="1"; }catch(e){}
  if(seen){
    overlay.style.display = "none";
  } else {
    // bienvenida con el nombre de la barbería; un toque la saltea
    var nm = document.getElementById("introName"), tg = document.getElementById("introTag");
    if(nm){ nm.innerHTML = brandMarkup(state.config.businessName || ""); nm.setAttribute("aria-label", state.config.businessName || ""); }
    if(tg) tg.textContent = state.config.tagline || "";
    var closeIntro = function(){
      overlay.classList.add("hide");
      try{ sessionStorage.setItem(INTRO_KEY,"1"); }catch(e){}
    };
    overlay.onclick = closeIntro;
    setTimeout(closeIntro, 3200);
  }
})();

// ---------- reserva ----------
// arma la reserva (guardarla es persistBooking: en el navegador o en Firestore según el modo)
function buildBooking(){
  var key = myDebtKey();
  var hasDebt = !!activeDebtFor(key);
  var debtAmount = hasDebt ? currentPenalty() : 0;
  var dep = depositFor(state.config.price);
  return {
    id:uid(), name:client.name, lastname:client.lastname, nickname:client.nickname, phone:client.phone, email:client.email,
    date:client.selectedDate, time:client.selectedTime,
    price:state.config.price, debtCharged:debtAmount,
    barberId:chosenBarber(), barberName:(barberById(chosenBarber()) || {}).name || "",
    payMethod:defaultPayMethod(), paid:false,
    deposit:dep, depositState:dep > 0 ? "pending" : "paid", balanceState:"pending",
    status:"confirmed", createdAt:Date.now(), seenByOwner:false, clientKey:key, cid:client.uid
  };
}

// ---------- con quién se corta ----------
// con un solo barbero se elige solo; con varios, el cliente elige antes de ver el calendario
function chosenBarber(){
  var a = activeBarbers();
  if(a.length === 1) return a[0].id;
  var m = client.barber && barberById(client.barber);
  return m && m.active !== false ? m.id : "";
}

function barberPickerHtml(){
  var a = activeBarbers();
  if(a.length < 2) return "";
  var cur = chosenBarber();
  return '<div class="barber-pick"><div class="myt-title">¿Con quién te querés cortar?</div><div class="barber-opts">' + a.map(function(m){
    var on = m.id === cur;
    return '<button type="button" class="barber-opt'+(on ? ' on' : '')+'" data-barber="'+esc(m.id)+'" aria-pressed="'+on+'">' +
      '<span class="avatar">'+esc(m.name.trim().charAt(0).toUpperCase())+'</span>' +
      '<b>'+esc(m.name)+'</b><i>'+(m.role === "owner" ? 'Dueño' : 'Barbero')+'</i></button>';
  }).join("") + '</div></div>';
}

// clave del saldo pendiente del cliente: en la nube es el id de su cuenta
function myDebtKey(){ return CLOUD ? client.uid : clientKeyOf(client.name, client.lastname, client.phone); }

// WhatsApp al que se avisa del turno: el del barbero elegido (si cargó el suyo) o el del local
function waTargetFor(b){
  var m = b.barberId && barberById(b.barberId);
  if(m && m.whatsapp) return {num: waNumber(m.whatsapp), name: m.name};
  return {num: state.config.whatsappLink, name: ""};
}

function buildWaLink(b){
  var msg = "Hola! Soy "+b.name+" "+b.lastname+(b.nickname?" ("+b.nickname+")":"")+". Reservé un turno en "+state.config.businessName+
    " para el "+formatDateLong(b.date)+" a las "+b.time+"hs. Total: "+money(bookingTotal(b))+" ("+payMethodLabel(b.payMethod).toLowerCase()+").";
  if(b.debtCharged>0) msg += " Incluye "+money(b.debtCharged)+" de una cancelación anterior.";
  if(b.payMethod==="transfer") msg += " Te paso el comprobante de la transferencia.";
  msg += " ¡Gracias!";
  return "https://wa.me/"+waTargetFor(b).num+"?text="+encodeURIComponent(msg);
}

// ================= VISTA =================
function renderClient(){
  var main = document.getElementById("main");
  var html = (client.step === 0 || client.step === 5 || client.step === 6) ? '' : '<div class="stepper">' +
    [1,2,3,4].map(function(n){ return '<div class="dot'+(client.step>=n?' done':'')+'"></div>'; }).join("") +
    '</div>';

  if(client.step===6) html += '<div class="card lockcard"><div class="lockicon">⏳</div><h2>Un momento...</h2></div>';
  else if(client.step===0) html += stepInicio();
  else if(client.step===5) html += stepLogin();
  else if(client.step===1) html += stepDatos();
  else if(client.step===2) html += stepFecha();
  else if(client.step===3) html += stepConfirmacion();
  else html += stepExito();

  main.innerHTML = html;
  bindClientEvents();
  bindPwEyes();
  initPlaceMap();
  if(client.registered && client.watching !== client.uid){ client.watching = client.uid; watchMyTurnos(client); }
  if(CLOUD && client.registered){
    var dkey = myDebtKey();
    if(!state.debtFlagsLoaded[dkey]){ state.debtFlagsLoaded[dkey] = true; loadDebtFlag(dkey); }
  }
}

// fondo satelital del encabezado (si no hay token/coordenadas o la imagen falla, queda el encabezado de siempre)
function applyHeroMap(){
  var hero = document.getElementById("heroSection"), layer = document.getElementById("heroMap");
  if(!hero || !layer) return;
  var url = heroMapUrl(), img = layer.querySelector("img");
  if(!url){ hero.classList.remove("has-map"); layer.hidden = true; return; }
  var own = !!state.config.heroImage;               // foto propia: sin atribución de Mapbox y centrada
  layer.querySelector(".map-attrib").hidden = own;
  img.style.objectPosition = own ? "center" : "center bottom";
  if(img.getAttribute("src") === url) return;
  img.onload = function(){ layer.hidden = false; hero.classList.add("has-map"); img.classList.add("loaded"); };
  img.onerror = function(){ layer.hidden = true; hero.classList.remove("has-map"); };
  img.src = url;
}

function render(){
  applyBranding("Turnos");
  applyHeroMap();
  renderClient();
}
// si el dueño cambia algo en otra pestaña, se actualiza (sin pisar lo que se está escribiendo)
hooks.refresh = function(){
  applyBranding("Turnos");
  if(client.step !== 1 && client.step !== 5) renderClient();   // sin pisar lo que se está escribiendo
};

// foto de perfil: la imagen elegida o, si no hay, un círculo con la inicial
function avatarHtml(size){
  var cls = "avatar" + (size ? " " + size : "");
  if(client.photo) return '<img class="'+cls+'" src="'+esc(client.photo)+'" alt="Tu foto de perfil">';
  var ini = (client.name || client.nickname || "?").trim().charAt(0).toUpperCase();
  return '<span class="'+cls+'">'+esc(ini)+'</span>';
}

function stepInicio(){
  return '<div class="card welcome">' +
    '<h2>Reservá tu turno</h2>' +
    '<div class="sub">Elegí fecha y horario en un minuto</div>' +
    '<button class="btn btn-primary" id="btnGoLogin">Iniciar sesión</button>' +
    '<button class="btn btn-ghost" id="btnGoRegister" style="margin-top:10px;">Crear cuenta</button>' +
    '<div class="field-hint" style="margin:14px 0 0; text-align:center;">Tu usuario es tu mail. Con tu cuenta ves tus turnos y reservás con un toque.</div>' +
    '</div>';
}

function stepLogin(){
  return '<div class="card">' +
    '<h2>Iniciar sesión</h2>' +
    '<div class="sub">Con tu mail y tu contraseña</div>' +
    '<label>Mail</label>' +
    '<input type="email" id="inpLoginEmail" value="'+esc(client.email)+'" placeholder="tunombre@gmail.com" autocomplete="username" autocapitalize="off">' +
    '<label>Contraseña</label>' +
    pwField("inpLoginPass", "Tu contraseña", "current-password") +
    '<label class="checkline"><input type="checkbox" id="inpRemember" checked><span>Recordar en este dispositivo</span></label>' +
    '<button class="btn btn-primary" id="btnLogin">Entrar</button>' +
    '<button class="link-btn plain" id="btnForgot" type="button" style="display:block; margin:12px auto 0;">Olvidé mi contraseña</button>' +
    '<button class="btn btn-ghost" id="btnLoginBack" style="margin-top:10px;">Volver</button>' +
    '<div class="field-hint" style="margin:14px 0 0; text-align:center;">¿Todavía no tenés cuenta? <button class="link-btn" id="btnLoginToRegister" type="button">Crear cuenta</button></div>' +
    '</div>';
}

function stepDatos(){
  var editing = client.registered;
  return '<div class="card">' +
    '<h2>'+(editing ? 'Tu perfil' : 'Creá tu cuenta')+'</h2>' +
    '<div class="sub">'+(editing ? 'Podés corregirlo cuando quieras' : 'Una sola vez · después reservás con un toque')+'</div>' +
    '<div class="avatar-edit"><div id="avatarPreview">'+avatarHtml("lg")+'</div>' +
      '<div class="avatar-btns"><button class="link-btn" id="btnPhoto" type="button">'+(client.photo ? 'Cambiar foto' : 'Agregar foto')+'</button>' +
      (client.photo ? '<button class="link-btn link-out" id="btnPhotoDel" type="button">Quitar</button>' : '') +
      '<input type="file" id="inpPhoto" accept="image/*" hidden></div></div>' +
    '<div class="row2">' +
      '<div><label>Nombre</label><input type="text" id="inpName" value="'+esc(client.name)+'" placeholder="Juan" autocomplete="given-name"></div>' +
      '<div><label>Apellido</label><input type="text" id="inpLastname" value="'+esc(client.lastname)+'" placeholder="Pérez" autocomplete="family-name"></div>' +
    '</div>' +
    '<div class="row2">' +
      '<div><label>Apodo <span class="opt">(opcional)</span></label><input type="text" id="inpNickname" value="'+esc(client.nickname)+'" placeholder="Cómo te dicen" maxlength="20"></div>' +
      '<div><label>Teléfono</label><input type="tel" id="inpPhone" value="'+esc(client.phone)+'" placeholder="11 2345 6789" autocomplete="tel"></div>' +
    '</div>' +
    '<label>Mail <span class="opt">(es tu usuario)</span></label>' +
    '<input type="email" id="inpEmail" value="'+esc(client.email)+'" placeholder="tunombre@gmail.com" autocomplete="username" autocapitalize="off"'+(editing ? ' readonly' : '')+'>' +
    (editing ? '' :
      '<label>Contraseña</label>' + pwField("inpPass", "Mínimo 6 caracteres", "new-password") +
      '<label class="checkline"><input type="checkbox" id="inpRemember" checked><span>Recordar en este dispositivo</span></label>') +
    '<div class="field-hint">Teléfono con código de área, sin 0 ni 15. El local lo usa para confirmarte el turno y recordártelo.</div>' +
    '<button class="btn btn-primary" id="btnStep1">'+(editing ? 'Guardar y continuar' : 'Crear cuenta y continuar')+'</button>' +
    (editing ? '<button class="btn btn-ghost" id="btnChangePass" type="button" style="margin-top:10px;">Cambiar contraseña</button>' +
               '<button class="btn btn-ghost" data-logout="1" style="margin-top:10px;">Salir de esta cuenta</button>'
             : '<button class="btn btn-ghost" id="btnRegBack" style="margin-top:10px;">Volver</button>') +
    '</div>';
}

// ---------- calendario mensual ----------
var BOOKING_DAYS = 60;   // hasta cuántos días adelante se puede reservar

function calendarHtml(){
  var today = toISO(new Date()), last = addDays(today, BOOKING_DAYS);
  if(!client.calMonth) client.calMonth = (client.selectedDate || today).slice(0, 8) + "01";
  var first = client.calMonth, fd = fromISO(first);
  var y = fd.getFullYear(), m = fd.getMonth(), dim = new Date(y, m + 1, 0).getDate();
  var offset = (fd.getDay() === 0 ? 6 : fd.getDay() - 1);        // la semana empieza el lunes
  var rows = Math.ceil((offset + dim) / 7);
  var canPrev = first > today.slice(0, 8) + "01";
  var canNext = addMonths(first, 1) <= last;

  var dows = ["LUN","MAR","MIÉ","JUE","VIE","SÁB","DOM"].map(function(d){ return '<div class="cal-dow">'+d+'</div>'; }).join("");
  var cells = "";
  for(var i = 0; i < rows * 7; i++){
    var n = i - offset + 1;
    if(n < 1 || n > dim){ cells += '<span class="cal-day blank"></span>'; continue; }
    var iso = y + "-" + pad2(m + 1) + "-" + pad2(n);
    var inRange = iso >= today && iso <= last;
    var open = inRange && !isDayFullyClosed(iso);
    var free = open ? getSlotStatuses(iso, chosenBarber()).filter(function(s){ return !s.taken; }).length : 0;
    var cls = "cal-day" + (iso === today ? " today" : "") + (client.selectedDate === iso ? " selected" : "");
    var dot = "";
    if(!inRange || !open) cls += " off";
    else if(free === 0){ cls += " off full"; dot = '<i class="dot full"></i>'; }
    else dot = '<i class="dot ok"></i>';
    var pick = (open && free > 0) ? ' data-pick="1" data-date="'+iso+'"' : '';
    var label = n + (open ? (free ? ", con horarios libres" : ", sin horarios") : ", cerrado");
    cells += '<button type="button" class="'+cls+'"'+pick+(pick ? '' : ' disabled')+' aria-label="'+label+'"><span>'+n+'</span>'+dot+'</button>';
  }

  return '<div class="cal">' +
    '<div class="cal-head">' +
      '<button type="button" class="cal-nav" data-calnav="-1"'+(canPrev ? '' : ' disabled')+' aria-label="Mes anterior">‹</button>' +
      '<div class="cal-title">'+MONTHS[m]+' '+y+'</div>' +
      '<button type="button" class="cal-nav" data-calnav="1"'+(canNext ? '' : ' disabled')+' aria-label="Mes siguiente">›</button>' +
    '</div>' +
    '<div class="cal-grid">'+dows+cells+'</div>' +
    '<div class="cal-legend"><span><i class="dot ok"></i>Libre</span><span><i class="dot full"></i>Completo</span><span><i class="dot none"></i>Cerrado</span></div>' +
  '</div>';
}

// ---------- mis turnos ----------
var TURNO_STATE = {confirmed:"Confirmado", completed:"Realizado", cancelled:"Cancelado"};

function turnoRow(t){
  var past = t.date < toISO(new Date()) && t.status === "confirmed";
  var label = past ? "Pasado" : (TURNO_STATE[t.status] || t.status);
  var total = t.price + (t.debtCharged || 0);
  var pay = "";
  if(t.status !== "cancelled"){
    if(t.paid) pay = '<span class="paystate ok">Pagado</span>';
    else if(t.deposit > 0) pay = 'Seña '+money(t.deposit)+' '+stateChip(depState(t)) + (depState(t) === "paid" || balState(t) !== "pending" || turnoEnded(t) ? ' · Saldo '+money(balanceDue(t))+' '+stateChip(balState(t)) : '');
    else pay = '<span class="paystate pend">Pago pendiente</span>';
  } else if(depositKept(t)){
    pay = t.lateCancel ? '<span class="paystate pend">Seña retenida</span>' : '<span class="paystate info">Seña a devolver</span>';
  }
  return '<div class="myt-row'+(t.status === "cancelled" ? ' off' : '')+'">' +
    '<div class="myt-main"><b>'+formatDateLong(t.date)+' · '+t.time+' hs</b>' + (t.barberName && activeBarbers().length > 1 ? '<span class="myt-with">con '+esc(t.barberName)+'</span>' : '') +
      '<span class="myt-sub">'+money(total)+(pay ? ' · ' : '')+pay+'</span></div>' +
    '<span class="myt-side"><span class="badge '+(past ? 'completed' : t.status)+'">'+label+'</span>' +
      (canCancelTurno(t) ? '<button type="button" class="myt-cancel" data-cancel-turno="'+t.id+'">Cancelar</button>' : '') + '</span></div>';
}

// se puede cancelar un turno confirmado que todavía no pasó
function canCancelTurno(t){
  if(t.status !== "confirmed") return false;
  var now = new Date(), today = toISO(now);
  return t.date > today || (t.date === today && timeToMin(t.time) > now.getHours() * 60 + now.getMinutes());
}

function cancelTurnoFlow(id){
  var t = myTurnos(client).filter(function(x){ return x.id === id; })[0];
  if(!t || !canCancelTurno(t)) return;
  var late = (t.date === toISO(new Date())), kept = depositKept(t);
  var msg = late
    ? (kept ? "Vas a cancelar el turno de hoy a las " + t.time + " hs. Como es el mismo día, perdés la seña que ya pagaste (" + money(t.deposit) + "): queda en el local."
            : "Vas a cancelar el turno de hoy a las " + t.time + " hs. Como es el mismo día, perdés la seña del 50% (" + money(currentPenalty()) + "): queda a tu nombre y se suma a tu próximo turno.")
    : "Vas a cancelar el turno del " + formatDateLong(t.date) + " a las " + t.time + " hs. " +
      (kept ? "Como cancelás antes del día del turno, el local te devuelve la seña (" + money(t.deposit) + ")."
            : "No tiene costo, pero si cancelás el mismo día del turno se cobra el 50% de seña.");
  if(t.debtCharged > 0) msg += " El saldo anterior de " + money(t.debtCharged) + " vuelve a quedar pendiente.";
  askConfirm(late ? "Cancelar y perder la seña" : "Cancelar turno", msg + " ¿Cancelamos?", function(){
    cancelMyTurno(t, client).then(function(){ renderClient(); }).catch(function(e){
      console.error(e);
      showToast("No pudimos cancelar el turno. Revisá tu conexión e intentá de nuevo.");
    });
  });
}

// tarjetas de pago: la seña de un turno que todavía no la pagó y el saldo de un turno que ya terminó
function pagosPendientesHtml(all){
  var cards = [];
  all.forEach(function(t){
    if(t.status === "cancelled") return;
    if(t.status === "confirmed" && t.deposit > 0 && depState(t) === "pending" && !turnoEnded(t)){
      cards.push('<div class="card pay-card"><h2>Seña de tu turno</h2><div class="sub">'+formatDateLong(t.date)+' · '+t.time+' hs</div>'+payBox(t, "deposit")+'</div>');
    }
    if((t.status === "confirmed" || t.status === "completed") && turnoEnded(t) && balState(t) !== "paid" && balanceDue(t) > 0){
      cards.push('<div class="card pay-card due"><h2>¡Terminó tu turno!</h2><div class="sub">'+formatDateLong(t.date)+' · '+t.time+' hs · realizá el pago acá</div>'+payBox(t, "balance")+'</div>');
    }
  });
  return cards.join("");
}

function misTurnosHtml(){
  var today = toISO(new Date());
  var all = myTurnos(client);
  if(!all.length) return "";
  var next = all.filter(function(t){ return t.status === "confirmed" && t.date >= today; })
    .sort(function(a, b){ return (a.date + a.time) < (b.date + b.time) ? -1 : 1; });
  var hist = all.filter(function(t){ return next.indexOf(t) < 0; })
    .sort(function(a, b){ return (a.date + a.time) < (b.date + b.time) ? 1 : -1; });
  return pagosPendientesHtml(all) + '<div class="myt">' +
    '<div class="myt-title">Tus turnos</div>' +
    (next.length ? next.map(turnoRow).join("") : '<div class="field-hint" style="margin:0 0 8px;">No tenés turnos próximos.</div>') +
    (hist.length ? '<details class="myt-hist"><summary>Historial ('+hist.length+')</summary>' + hist.slice(0, 10).map(turnoRow).join("") + '</details>' : '') +
    '</div>';
}

function stepFecha(){
  var barber = chosenBarber();
  var cal = barber ? calendarHtml() : '<div class="empty-note">Elegí con quién te querés cortar para ver los horarios.</div>';

  var debt = activeDebtFor(myDebtKey());
  var debtNotice = debt ? '<div class="notice warn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4m0 4h.01M10.3 3.9 2.5 17a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg><div>Tenés un saldo pendiente de '+money(currentPenalty())+' por una cancelación anterior. Se va a sumar a este turno.</div></div>' : "";

  var slotsHtml = "";
  if(client.selectedDate && barber){
    var statuses = getSlotStatuses(client.selectedDate, barber);
    if(statuses.length===0){
      slotsHtml = '<div class="empty-note">No hay horarios disponibles ese día. Probá con otra fecha.</div>';
    }else{
      slotsHtml = '<div class="slot-grid">' + statuses.map(function(st){
        if(st.taken){
          return '<button class="slot-btn taken" disabled>'+st.time+'<span class="taken-lbl">Ocupado</span></button>';
        }
        var sel = client.selectedTime===st.time ? " selected" : "";
        return '<button class="slot-btn'+sel+'" data-time="'+st.time+'">'+st.time+'</button>';
      }).join("") + '</div>';
    }
  }

  var who = client.nickname || client.name;
  return '<div class="card">' +
    '<div class="hello"><div class="hello-who">'+avatarHtml("")+'<div><h2>Hola, '+esc(who)+'</h2><div class="sub">Elegí fecha y horario · Corte '+money(state.config.price)+'</div></div></div>' +
    '<div class="hello-btns"><button class="link-btn" id="btnEditProfile">Mi perfil</button><button class="link-btn link-out" data-logout="1">Salir</button></div></div>' +
    debtNotice +
    misTurnosHtml() +
    barberPickerHtml() +
    cal +
    slotsHtml +
    '</div>' +
    '<button class="btn btn-primary" id="btnStep2" '+(barber&&client.selectedDate&&client.selectedTime?'':'disabled')+'>Continuar</button>';
}

// ---------- seña y saldo ----------
// método con el que se propone pagar la seña (después puede elegir otro al avisar que pagó)
function defaultPayMethod(){
  var c = state.config;
  return c.payMpLink ? "mp" : c.payAlias ? "transfer" : "local";
}

function stateChip(st){
  return st === "paid" ? '<span class="paystate ok">pagada</span>' : st === "informed" ? '<span class="paystate info">avisada, la confirma el local</span>' : '<span class="paystate pend">pendiente</span>';
}

function stepConfirmacion(){
  var debt = activeDebtFor(myDebtKey());
  var debtAmount = debt ? currentPenalty() : 0;
  var price = state.config.price, total = price + debtAmount;
  var dep = depositFor(price);
  return '<div class="card">' +
    '<h2>Confirmá tu turno</h2>' +
    '<div class="sub">Revisá los datos antes de reservar</div>' +
    '<div class="summary-row"><span class="k">Fecha</span><span class="v">'+formatDateLong(client.selectedDate)+'</span></div>' +
    '<div class="summary-row"><span class="k">Horario</span><span class="v">'+client.selectedTime+' hs</span></div>' +
    (activeBarbers().length > 1 ? '<div class="summary-row"><span class="k">Con</span><span class="v">'+esc((barberById(chosenBarber()) || {}).name || "")+'</span></div>' : '') +
    (state.config.address ? '<div class="summary-row"><span class="k">Lugar</span><span class="v place-v">'+esc(state.config.address)+'</span></div>' : '') +
    '<div class="summary-row"><span class="k">Corte</span><span class="v">'+money(price)+'</span></div>' +
    (debtAmount ? '<div class="summary-row"><span class="k">Saldo anterior</span><span class="v" style="color:var(--warn)">'+money(debtAmount)+'</span></div>' : "") +
    '<div class="summary-row total"><span class="k">Total</span><span class="v">'+money(total)+'</span></div>' +
    (dep > 0
      ? '<div class="pay-split">' +
          '<div class="pay-split-item"><span>1. Seña para reservar</span><b>'+money(dep)+'</b><i>Se paga ahora, después de confirmar</i></div>' +
          '<div class="pay-split-item"><span>2. Saldo al terminar</span><b>'+money(total - dep)+'</b><i>Lo pagás desde la app o en efectivo</i></div>' +
        '</div>'
      : '<div class="notice info"><div>Pagás el total ('+money(total)+') al terminar el corte, desde la app o en efectivo.</div></div>') +
    '</div>' +
    cancelPolicyNote(dep) +
    '<div class="btn-row">' +
      '<button class="btn btn-ghost" id="btnBack2">Atrás</button>' +
      '<button class="btn btn-primary" id="btnConfirm">Confirmar turno</button>' +
    '</div>';
}

function cancelPolicyNote(dep){
  var txt = dep > 0
    ? 'Política de cancelación: la seña ('+money(dep)+') asegura tu horario. Si cancelás antes del día del turno te la devolvemos; si cancelás el mismo día, queda en el local.'
    : 'Política de cancelación: si cancelás el mismo día del turno, se cobra el 50% como seña y queda registrado a tu nombre para el próximo turno.';
  return '<div class="notice info"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5m0 3h.01"/></svg>' +
    '<div>'+txt+'</div></div>';
}

// cuadro para pagar una parte (seña o saldo): link de Mercado Pago, alias para copiar (transferencia, MODO, billeteras) y avisar que pagó
function payBox(t, kind){
  var c = state.config, deposit = kind === "deposit";
  var amount = deposit ? (t.deposit || 0) : balanceDue(t);
  var st = deposit ? depState(t) : balState(t);
  var title = deposit ? 'Pagá la seña de '+money(amount) : 'Pagá el saldo de '+money(amount);
  if(st === "paid") return '<div class="pay-box ok"><div class="pay-box-title">'+(deposit ? 'Seña' : 'Saldo')+' pagado ✓</div></div>';
  if(st === "informed") return '<div class="pay-box"><div class="pay-box-title">Avisaste que pagaste '+money(amount)+'</div><div class="pay-note">El local lo confirma apenas lo vea. No hace falta que hagas nada más.</div></div>';
  var opts = "";
  if(c.payMpLink){
    opts += '<div class="pay-opt-block"><a class="btn btn-mp" href="'+esc(c.payMpLink)+'" target="_blank" rel="noopener">Pagar '+money(amount)+' con Mercado Pago</a>' +
      '<button class="link-btn plain" type="button" data-inform="'+kind+'|mp|'+esc(t.id)+'">Ya pagué con Mercado Pago</button></div>';
  }
  if(c.payAlias){
    opts += '<div class="pay-opt-block"><div class="pay-note" style="margin:0 0 6px;">O transferí '+money(amount)+' (también sirve MODO o tu billetera):</div>' +
      '<div class="pay-alias"><span>'+esc(c.payAlias)+'</span><button class="link-btn" data-copy-alias="1" type="button">Copiar alias</button></div>' +
      (c.payHolder ? '<div class="pay-holder">Titular: '+esc(c.payHolder)+'</div>' : '') +
      '<button class="link-btn plain" type="button" data-inform="'+kind+'|transfer|'+esc(t.id)+'">Ya transferí</button></div>';
  }
  if(!opts) opts = '<div class="pay-note">El local todavía no cargó un medio de pago online: pagás en efectivo en el local.</div>';
  return '<div class="pay-box"><div class="pay-box-title">'+title+'</div>' + opts +
    '<div class="pay-note">'+(deposit ? 'Si preferís, dejás la seña en efectivo en el local.' : 'Si pagás en efectivo en el local, el barbero lo registra y el turno queda completo.')+'</div></div>';
}

// pantalla de "turno reservado": cómo pagar la seña
function payInstructions(b){
  if(!(b.deposit > 0)) return '<div class="pay-box"><div class="pay-box-title">Pagás '+money(bookingTotal(b))+' al terminar</div>' +
    '<div class="pay-note">Cuando termine el corte, entrás a la app y pagás desde acá, o en efectivo en el local.</div></div>';
  return payBox(b, "deposit") +
    '<div class="pay-note" style="text-align:center;">El saldo ('+money(bookingTotal(b) - b.deposit)+') lo pagás cuando termina el corte: te aparece acá en la app.</div>';
}

function stepExito(){
  var b = client.lastBooking;
  if(!b) return '<div class="card">Algo salió mal.</div>';
  return '<div class="card" style="text-align:center;">' +
    '<div class="success-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4fae83" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg></div>' +
    '<h2>¡Turno reservado!</h2>' +
    '<div class="sub">Te esperamos el '+formatDateLong(b.date)+' a las '+b.time+' hs'+(b.barberName && activeBarbers().length > 1 ? ' con '+esc(b.barberName) : '')+'</div>' +
    payInstructions(b) +
    '</div>' +
    placeCard() +
    '<div class="card"><h2>Que no se te pase</h2>' +
    '<div class="sub">Guardalo en tu calendario y te avisa un día antes y 2 horas antes.</div>' +
    '<div class="cal-actions">' +
      '<a class="btn btn-primary" href="'+icsDataUri(b)+'" download="turno-'+b.date+'.ics">Guardar en mi calendario</a>' +
      '<a class="btn btn-ghost" href="'+googleCalendarLink(b)+'" target="_blank" rel="noopener">Agregar a Google Calendar</a>' +
    '</div></div>' +
    (waTargetFor(b).num ? '<a class="btn btn-wa" href="'+buildWaLink(b)+'" target="_blank" rel="noopener" style="margin-bottom:10px;">'+(waTargetFor(b).name ? 'Avisarle a '+esc(waTargetFor(b).name)+' por WhatsApp' : 'Avisar por WhatsApp')+'</a>' : '') +
    '<button class="btn btn-ghost" id="btnNewBooking">Reservar otro turno</button>' +
    '<button class="btn btn-ghost" data-logout="1" style="margin-top:10px;">Salir</button>';
}

// Mapa de "Dónde es": Leaflet (código abierto, guardado en vendor/) con los mapas de OpenStreetMap. Sin claves ni costo.
var placeMapInstance = null;
var PIN_SVG = '<svg width="34" height="44" viewBox="0 0 34 44"><path d="M17 43s14-14.2 14-26A14 14 0 0 0 3 17c0 11.8 14 26 14 26Z" fill="#29b6f6" stroke="#ffffff" stroke-width="2.5"/><circle cx="17" cy="17" r="5.5" fill="#ffffff"/></svg>';
function initPlaceMap(retry){
  if(placeMapInstance){ try{ placeMapInstance.remove(); }catch(e){} placeMapInstance = null; }
  var el = document.getElementById("placeMap"), c = state.config;
  if(!el || !c.mapCenter) return;
  if(!window.L){ if(!retry) setTimeout(function(){ initPlaceMap(true); }, 700); return; }   // la librería carga con defer
  var ll = [c.mapCenter[1], c.mapCenter[0]];           // config guarda [longitud, latitud]; Leaflet usa [latitud, longitud]
  var map = L.map(el, {center: ll, zoom: 17, scrollWheelZoom: false, dragging: !L.Browser.mobile});   // en el celular no se arrastra, para no trabar el scroll de la página
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>'
  }).addTo(map);
  L.marker(ll, {icon: L.divIcon({className: "pin-icon", html: PIN_SVG, iconSize: [34, 44], iconAnchor: [17, 42]})}).addTo(map);
  placeMapInstance = map;
}

function placeCard(){
  var c = state.config, link = mapsLink(), embed = mapsEmbed();
  var hasPin = !!(c.mapCenter && c.mapCenter.length === 2);   // con coordenadas: mapa propio (Leaflet + OpenStreetMap)
  if(!c.address && !c.whatsappLink) return "";
  return '<div class="card place-card"><h2>Dónde es</h2>' +
    '<div class="sub">'+esc(c.businessName)+(c.address ? ' · '+esc(c.address) : '')+'</div>' +
    (hasPin ? '<div class="place-map" id="placeMap"></div>' : embed ? '<div class="map-wrap"><a class="map-fallback" href="'+esc(link)+'" target="_blank" rel="noopener"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11Z"/><circle cx="12" cy="10" r="2.4"/></svg><span>'+esc(c.address)+'</span><i>Ver en Google Maps</i></a>' +
      '<iframe class="map-embed" src="'+embed+'" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Mapa"></iframe></div>' : '') +
    '<div class="cal-actions">' +
      (link ? '<a class="btn btn-primary" href="'+esc(link)+'" target="_blank" rel="noopener">Cómo llegar</a>' : '') +
      (c.whatsappLink ? '<a class="btn btn-ghost" href="https://wa.me/'+c.whatsappLink+'" target="_blank" rel="noopener">Escribirle al local</a>' : '') +
    '</div>' +
    '</div>';
}

function copyText(text){
  function fallback(){
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    var ok = false; try{ ok = document.execCommand("copy"); }catch(e){}
    document.body.removeChild(ta);
    showToast(ok ? "Alias copiado." : "Alias: " + text);
  }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){ showToast("Alias copiado."); }, fallback);
  } else fallback();
}

function logoutClient(){
  askConfirm("Salir", "Vas a tener que volver a iniciar sesión para reservar. Los turnos que ya reservaste no se borran.", function(){
    clientAuth.logout().catch(function(e){ console.error(e); }).then(function(){
      stopWatchTurnos(); client.watching = null;
      client.name = ""; client.lastname = ""; client.nickname = ""; client.phone = ""; client.email = ""; client.photo = ""; client.uid = "";
      client.registered = false; client.step = 0;
      client.selectedDate = null; client.selectedTime = null; client.lastBooking = null; client.payMethod = "local"; client.barber = "";
      renderClient();
      showToast("Saliste de la cuenta.");
    });
  });
}

function applyProfile(p){
  client.name = p.name; client.lastname = p.lastname; client.nickname = p.nickname || ""; client.phone = p.phone; client.email = p.email;
  client.photo = p.photo || ""; client.uid = p.uid || p.email;
  client.registered = true;
}

// achica la foto elegida a un cuadrado de 192 px (JPEG) para que pese poco y entre en el perfil del cliente
function readPhoto(file){
  return new Promise(function(resolve, reject){
    var fr = new FileReader();
    fr.onerror = function(){ reject(new Error("lectura")); };
    fr.onload = function(){
      var img = new Image();
      img.onerror = function(){ reject(new Error("imagen")); };
      img.onload = function(){
        var S = 192, cv = document.createElement("canvas"); cv.width = S; cv.height = S;
        var side = Math.min(img.width, img.height), sx = (img.width - side) / 2, sy = (img.height - side) / 2;
        var ctx = cv.getContext("2d"); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, S, S);
        ctx.drawImage(img, sx, sy, side, side, 0, 0, S, S);
        resolve(cv.toDataURL("image/jpeg", 0.82));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

function bindClientEvents(){
  document.querySelectorAll("[data-logout]").forEach(function(el){ el.onclick = logoutClient; });
  document.querySelectorAll("[data-cancel-turno]").forEach(function(el){
    el.onclick = function(){ cancelTurnoFlow(el.getAttribute("data-cancel-turno")); };
  });
  var goL = document.getElementById("btnGoLogin");
  if(goL) goL.onclick = function(){ client.step = 5; renderClient(); };
  var goR = document.getElementById("btnGoRegister");
  if(goR) goR.onclick = function(){ client.step = 1; renderClient(); };
  var l2r = document.getElementById("btnLoginToRegister");
  if(l2r) l2r.onclick = function(){ client.step = 1; renderClient(); };
  var lb = document.getElementById("btnLoginBack");
  if(lb) lb.onclick = function(){ client.step = 0; renderClient(); };
  var rb = document.getElementById("btnRegBack");
  if(rb) rb.onclick = function(){ client.step = 0; renderClient(); };

  var bl = document.getElementById("btnLogin");
  if(bl){
    var passEl = document.getElementById("inpLoginPass"), mailEl = document.getElementById("inpLoginEmail");
    var doLogin = function(){
      var email = mailEl.value.trim(), pass = passEl.value;
      if(!isValidEmail(email)){ showToast("Ingresá tu mail."); return; }
      if(!pass){ showToast("Ingresá tu contraseña."); return; }
      bl.disabled = true; bl.textContent = "Ingresando...";
      clientAuth.login(email, pass, document.getElementById("inpRemember").checked).then(function(p){
        applyProfile(p); client.step = 2; renderClient();
      }).catch(function(e){
        console.error(e);
        showToast(authMessage(e));
        bl.disabled = false; bl.textContent = "Entrar";
      });
    };
    bl.onclick = doLogin;
    passEl.onkeydown = function(e){ if(e.key === "Enter") doLogin(); };
  }
  var forgot = document.getElementById("btnForgot");
  if(forgot) forgot.onclick = function(){
    var email = document.getElementById("inpLoginEmail").value.trim();
    if(!isValidEmail(email)){ showToast("Escribí tu mail arriba y volvé a tocar este botón."); return; }
    clientAuth.resetPassword(email).then(function(){
      showToast("Si ese mail tiene cuenta, te mandamos un correo para cambiar la contraseña.");
    }).catch(function(e){ showToast(e && e.code === "local-mode" ? authMessage(e) : "No se pudo enviar el correo. Revisá el mail e intentá de nuevo."); });
  };
  var chp = document.getElementById("btnChangePass");
  if(chp) chp.onclick = function(){
    clientAuth.resetPassword(client.email).then(function(){
      showToast("Te mandamos un correo a " + client.email + " para cambiar la contraseña.");
    }).catch(function(e){ showToast(authMessage(e)); });
  };

  // foto de perfil (se ve al instante; se guarda con el botón de abajo)
  var photoBtn = document.getElementById("btnPhoto"), photoInp = document.getElementById("inpPhoto");
  if(photoBtn){
    photoBtn.onclick = function(){ photoInp.click(); };
    photoInp.onchange = function(){
      var f = photoInp.files && photoInp.files[0];
      if(!f) return;
      if(f.type && f.type.indexOf("image/") !== 0){ showToast("Elegí una imagen (JPG o PNG)."); return; }
      readPhoto(f).then(function(url){
        client.photo = url;
        document.getElementById("avatarPreview").innerHTML = avatarHtml("lg");
        photoBtn.textContent = "Cambiar foto";
      }).catch(function(){ showToast("No pudimos leer esa imagen. Probá con otra."); });
    };
  }
  var photoDel = document.getElementById("btnPhotoDel");
  if(photoDel) photoDel.onclick = function(){
    client.photo = "";
    document.getElementById("avatarPreview").innerHTML = avatarHtml("lg");
    photoDel.hidden = true; photoBtn.textContent = "Agregar foto";
  };

  var b1 = document.getElementById("btnStep1");
  if(b1) b1.onclick = function(){
    var name = document.getElementById("inpName").value.trim();
    var lastname = document.getElementById("inpLastname").value.trim();
    var nickname = document.getElementById("inpNickname").value.trim();
    var phone = document.getElementById("inpPhone").value.trim();
    var email = document.getElementById("inpEmail").value.trim();
    if(!name || !lastname){ showToast("Completá nombre y apellido."); return; }
    if(digitsOnly(phone).length < 8){ showToast("Ingresá un teléfono válido (mínimo 8 dígitos)."); return; }
    if(!isValidEmail(email)){ showToast("Ingresá un mail válido, por ejemplo tunombre@gmail.com."); return; }
    var profile = {name:name, lastname:lastname, nickname:nickname, phone:phone, email:email, photo:client.photo};
    var label = b1.textContent;
    var done = function(p){ applyProfile(p); client.step = 2; renderClient(); };
    var fail = function(msg){ return function(e){ console.error(e); showToast(msg || authMessage(e)); b1.disabled = false; b1.textContent = label; }; };
    if(client.registered){
      b1.disabled = true; b1.textContent = "Guardando...";
      clientAuth.update(Object.assign({}, profile, {email: client.email})).then(done).catch(fail("No pudimos guardar los cambios. Intentá de nuevo."));
    } else {
      var pass = document.getElementById("inpPass").value;
      if(pass.length < 6){ showToast("La contraseña tiene que tener al menos 6 caracteres."); return; }
      b1.disabled = true; b1.textContent = "Creando cuenta...";
      clientAuth.register(profile, pass, document.getElementById("inpRemember").checked).then(done).catch(fail());
    }
  };
  var editP = document.getElementById("btnEditProfile");
  if(editP) editP.onclick = function(){ client.step = 1; renderClient(); };

  document.querySelectorAll("[data-calnav]").forEach(function(el){
    el.onclick = function(){ client.calMonth = addMonths(client.calMonth, parseInt(el.getAttribute("data-calnav"), 10)); renderClient(); };
  });
  document.querySelectorAll(".cal-day[data-pick]").forEach(function(el){
    el.onclick = function(){
      client.selectedDate = el.getAttribute("data-date"); client.selectedTime = null;
      client.calMonth = client.selectedDate.slice(0, 8) + "01";
      renderClient();
      var g = document.querySelector(".slot-grid"); if(g) g.scrollIntoView({behavior: "smooth", block: "nearest"});
    };
  });
  document.querySelectorAll(".slot-btn").forEach(function(el){
    el.onclick = function(){ client.selectedTime = el.getAttribute("data-time"); renderClient(); };
  });
  var s2 = document.getElementById("btnStep2");
  if(s2) s2.onclick = function(){ if(client.selectedDate && client.selectedTime){ client.step=3; renderClient(); } };

  document.querySelectorAll("[data-pay]").forEach(function(el){
    el.onclick = function(){ client.payMethod = el.getAttribute("data-pay"); renderClient(); };
  });
  var back2 = document.getElementById("btnBack2");
  if(back2) back2.onclick = function(){ client.step=2; renderClient(); };
  var conf = document.getElementById("btnConfirm");
  if(conf) conf.onclick = function(){
    // otra persona pudo haber tomado el horario mientras se decidía
    reloadState();
    var free = getSlotStatuses(client.selectedDate, chosenBarber()).some(function(s){ return s.time===client.selectedTime && !s.taken; });
    if(!free){
      showToast("Ese horario se acaba de ocupar. Elegí otro.");
      client.selectedTime = null; client.step = 2; renderClient();
      return;
    }
    var b = buildBooking();
    conf.disabled = true; conf.textContent = "Reservando...";
    persistBooking(b).then(function(){
      client.lastBooking = b;
      client.step = 4;
      renderClient();
    }).catch(function(e){
      console.error(e);
      var taken = e && (e.code === "permission-denied" || e.code === "already-exists" || e.code === "aborted");
      if(taken){
        showToast("Ese horario se acaba de ocupar. Elegí otro.");
        client.selectedTime = null; client.step = 2; renderClient();
      } else {
        showToast("No pudimos guardar tu turno. Revisá tu conexión e intentá de nuevo.");
        conf.disabled = false; conf.textContent = "Confirmar turno";
      }
    });
  };
  document.querySelectorAll("[data-barber]").forEach(function(el){
    el.onclick = function(){
      client.barber = el.getAttribute("data-barber");
      client.selectedDate = null; client.selectedTime = null; client.calMonth = null;
      renderClient();
    };
  });
  document.querySelectorAll("[data-copy-alias]").forEach(function(el){
    el.onclick = function(){ copyText(state.config.payAlias); };
  });
  // "Ya pagué": avisa al local (pasa a "informado"); él lo confirma
  document.querySelectorAll("[data-inform]").forEach(function(el){
    el.onclick = function(){
      var p = el.getAttribute("data-inform").split("|"), kind = p[0], method = p[1], id = p[2];
      var t = (client.lastBooking && client.lastBooking.id === id) ? client.lastBooking : myTurnos(client).filter(function(x){ return x.id === id; })[0];
      if(!t) return;
      el.disabled = true;
      informPayment(t, kind, method).then(function(){
        if(kind === "deposit"){ t.depositState = "informed"; t.payMethod = method; } else { t.balanceState = "informed"; t.balanceMethod = method; }
        renderClient();
      }).catch(function(e){
        console.error(e);
        el.disabled = false;
        showToast("No pudimos avisar al local. Revisá tu conexión e intentá de nuevo.");
      });
    };
  });
  var nb = document.getElementById("btnNewBooking");
  if(nb) nb.onclick = function(){
    client.step=2; client.selectedDate=null; client.selectedTime=null; client.lastBooking=null; client.payMethod="local"; client.calMonth=null;
    renderClient();
  };
}

// ¿ya hay una sesión abierta en este dispositivo? Entra directo a elegir fecha; si no, pantalla de inicio
render();
clientAuth.restore().then(function(p){
  if(p){ applyProfile(p); client.step = 2; } else { client.step = 0; }
  renderClient();
}).catch(function(e){ console.error(e); client.step = 0; renderClient(); });
})();
