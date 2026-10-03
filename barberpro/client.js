/* BarberPro Turnos - app del cliente: registrarse, reservar y pagar.
   Depende de core.js (estado, utilidades, disponibilidad). */
(function(){
"use strict";

var client = {
  step:1,
  name:"", lastname:"", nickname:"", phone:"", registered:false,
  selectedDate:null, selectedTime:null,
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
    setTimeout(function(){
      overlay.classList.add("hide");
      try{ sessionStorage.setItem(INTRO_KEY,"1"); }catch(e){}
    }, 1200);
  }
})();

// ---------- reserva ----------
function createBooking(){
  var key = clientKeyOf(client.name, client.lastname, client.phone);
  var hasDebt = !!activeDebtFor(key);
  var debtAmount = hasDebt ? currentPenalty() : 0;
  var booking = {
    id:uid(), name:client.name, lastname:client.lastname, nickname:client.nickname, phone:client.phone,
    date:client.selectedDate, time:client.selectedTime,
    price:state.config.price, debtCharged:debtAmount,
    payMethod:client.payMethod, paid:false,
    status:"confirmed", createdAt:Date.now(), seenByOwner:false, clientKey:key
  };
  state.bookings.push(booking);
  if(hasDebt) delete state.debts[key];
  saveState();
  return booking;
}

function bookingTotal(b){ return b.price + (b.debtCharged||0); }

function buildWaLink(b){
  var msg = "Hola! Soy "+b.name+" "+b.lastname+(b.nickname?" ("+b.nickname+")":"")+". Reservé un turno en "+state.config.businessName+
    " para el "+formatDateLong(b.date)+" a las "+b.time+"hs. Total: "+money(bookingTotal(b))+" ("+payMethodLabel(b.payMethod).toLowerCase()+").";
  if(b.debtCharged>0) msg += " Incluye "+money(b.debtCharged)+" de una cancelación anterior.";
  if(b.payMethod==="transfer") msg += " Te paso el comprobante de la transferencia.";
  msg += " ¡Gracias!";
  return "https://wa.me/"+state.config.whatsappLink+"?text="+encodeURIComponent(msg);
}

// ================= VISTA =================
function renderClient(){
  var main = document.getElementById("main");
  var html = '<div class="stepper">' +
    [1,2,3,4].map(function(n){ return '<div class="dot'+(client.step>=n?' done':'')+'"></div>'; }).join("") +
    '</div>';

  if(client.step===1) html += stepDatos();
  else if(client.step===2) html += stepFecha();
  else if(client.step===3) html += stepConfirmacion();
  else html += stepExito();

  main.innerHTML = html;
  bindClientEvents();
}

function render(){
  applyBranding("Turnos");
  renderClient();
}
// si el dueño cambia algo en otra pestaña, se actualiza (sin pisar lo que se está escribiendo)
hooks.refresh = function(){
  applyBranding("Turnos");
  if(client.step !== 1) renderClient();
};

function stepDatos(){
  var editing = client.registered;
  return '<div class="card">' +
    '<h2>'+(editing ? 'Tus datos' : 'Registrate para reservar')+'</h2>' +
    '<div class="sub">'+(editing ? 'Podés corregirlos cuando quieras' : 'Una sola vez · después reservás con un toque')+'</div>' +
    '<div class="row2">' +
      '<div><label>Nombre</label><input type="text" id="inpName" value="'+esc(client.name)+'" placeholder="Juan" autocomplete="given-name"></div>' +
      '<div><label>Apellido</label><input type="text" id="inpLastname" value="'+esc(client.lastname)+'" placeholder="Pérez" autocomplete="family-name"></div>' +
    '</div>' +
    '<label>Apodo <span class="opt">(opcional)</span></label>' +
    '<input type="text" id="inpNickname" value="'+esc(client.nickname)+'" placeholder="Cómo te dicen" maxlength="20">' +
    '<label>Teléfono</label>' +
    '<input type="tel" id="inpPhone" value="'+esc(client.phone)+'" placeholder="Ej: 11 2345 6789" autocomplete="tel">' +
    '<div class="field-hint">Te identifica si volvés y sirve para avisarte cambios de turno.</div>' +
    '<button class="btn btn-primary" id="btnStep1">'+(editing ? 'Guardar y continuar' : 'Registrarme y continuar')+'</button>' +
    '</div>';
}

function stepFecha(){
  var days = [];
  for(var i=0;i<21;i++) days.push(addDays(toISO(new Date()), i));
  var strip = days.map(function(iso){
    var closed = isDayFullyClosed(iso);
    var d = fromISO(iso);
    var sel = client.selectedDate===iso ? " selected" : "";
    var cls = "date-chip" + sel + (closed?" closed":"");
    return '<div class="'+cls+'" data-date="'+iso+'"'+(closed?"":' data-pick="1"')+'>' +
      '<div class="dow">'+DOW_SHORT[DOW_KEYS[d.getDay()]]+'</div>' +
      '<div class="num">'+d.getDate()+'</div></div>';
  }).join("");

  var debt = activeDebtFor(clientKeyOf(client.name, client.lastname, client.phone));
  var debtNotice = debt ? '<div class="notice warn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4m0 4h.01M10.3 3.9 2.5 17a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg><div>Tenés un saldo pendiente de '+money(currentPenalty())+' por una cancelación anterior. Se va a sumar a este turno.</div></div>' : "";

  var slotsHtml = "";
  if(client.selectedDate){
    var statuses = getSlotStatuses(client.selectedDate);
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
    '<div class="hello"><div><h2>Hola, '+esc(who)+'</h2><div class="sub">Elegí fecha y horario · Corte '+money(state.config.price)+'</div></div>' +
    '<button class="link-btn" id="btnEditProfile">Mis datos</button></div>' +
    debtNotice +
    '<div class="date-strip">'+strip+'</div>' +
    slotsHtml +
    '</div>' +
    '<button class="btn btn-primary" id="btnStep2" '+(client.selectedDate&&client.selectedTime?'':'disabled')+'>Continuar</button>';
}

function payOptions(){
  var methods = payMethods();
  if(!methods.some(function(m){ return m.id===client.payMethod; })) client.payMethod = "local";
  return '<div class="pay-title">¿Cómo querés pagar?</div>' +
    '<div class="pay-opts">' + methods.map(function(m){
      var on = client.payMethod===m.id;
      return '<button type="button" class="pay-opt'+(on?' on':'')+'" data-pay="'+m.id+'" aria-pressed="'+on+'">' +
        '<span class="pay-radio"></span><span class="pay-txt"><b>'+m.label+'</b><i>'+esc(m.hint)+'</i></span></button>';
    }).join('') + '</div>';
}

function stepConfirmacion(){
  var debt = activeDebtFor(clientKeyOf(client.name, client.lastname, client.phone));
  var debtAmount = debt ? currentPenalty() : 0;
  var total = state.config.price + debtAmount;
  return '<div class="card">' +
    '<h2>Confirmá y pagá</h2>' +
    '<div class="sub">Revisá los datos antes de reservar</div>' +
    '<div class="summary-row"><span class="k">Fecha</span><span class="v">'+formatDateLong(client.selectedDate)+'</span></div>' +
    '<div class="summary-row"><span class="k">Horario</span><span class="v">'+client.selectedTime+' hs</span></div>' +
    '<div class="summary-row"><span class="k">Corte</span><span class="v">'+money(state.config.price)+'</span></div>' +
    (debtAmount ? '<div class="summary-row"><span class="k">Saldo anterior</span><span class="v" style="color:var(--warn)">'+money(debtAmount)+'</span></div>' : "") +
    '<div class="summary-row total"><span class="k">Total</span><span class="v">'+money(total)+'</span></div>' +
    payOptions() +
    '</div>' +
    cancelPolicyNote() +
    '<div class="btn-row">' +
      '<button class="btn btn-ghost" id="btnBack2">Atrás</button>' +
      '<button class="btn btn-primary" id="btnConfirm">Confirmar turno</button>' +
    '</div>';
}

function cancelPolicyNote(){
  return '<div class="notice info"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5m0 3h.01"/></svg>' +
    '<div>Política de cancelación: si cancelás el mismo día del turno, se cobra el 50% como seña y queda registrado a tu nombre para el próximo turno.</div></div>';
}

function payInstructions(b){
  var c = state.config, total = money(bookingTotal(b));
  if(b.payMethod==="transfer"){
    return '<div class="pay-box"><div class="pay-box-title">Transferí '+total+'</div>' +
      '<div class="pay-alias"><span>'+esc(c.payAlias)+'</span><button class="link-btn" id="btnCopyAlias" type="button">Copiar</button></div>' +
      (c.payHolder ? '<div class="pay-holder">Titular: '+esc(c.payHolder)+'</div>' : '') +
      '<div class="pay-note">El local confirma tu pago al recibirlo. Si podés, mandá el comprobante por WhatsApp.</div></div>';
  }
  if(b.payMethod==="mp"){
    return '<div class="pay-box"><div class="pay-box-title">Pagá '+total+' online</div>' +
      '<a class="btn btn-mp" href="'+esc(c.payMpLink)+'" target="_blank" rel="noopener">Pagar con Mercado Pago</a>' +
      '<div class="pay-note">El local confirma tu pago cuando le llega.</div></div>';
  }
  return '<div class="pay-box"><div class="pay-box-title">Pagás '+total+' en el local</div>' +
    '<div class="pay-note">Podés abonar en efectivo o como te quede cómodo al llegar.</div></div>';
}

function stepExito(){
  var b = client.lastBooking;
  if(!b) return '<div class="card">Algo salió mal.</div>';
  return '<div class="card" style="text-align:center;">' +
    '<div class="success-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4fae83" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg></div>' +
    '<h2>¡Turno reservado!</h2>' +
    '<div class="sub">Te esperamos el '+formatDateLong(b.date)+' a las '+b.time+' hs</div>' +
    payInstructions(b) +
    '</div>' +
    (state.config.whatsappLink ? '<a class="btn btn-wa" href="'+buildWaLink(b)+'" target="_blank" rel="noopener" style="margin-bottom:10px;">Avisar por WhatsApp</a>' : '') +
    '<button class="btn btn-ghost" id="btnNewBooking">Reservar otro turno</button>';
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

function bindClientEvents(){
  var b1 = document.getElementById("btnStep1");
  if(b1) b1.onclick = function(){
    var name = document.getElementById("inpName").value.trim();
    var lastname = document.getElementById("inpLastname").value.trim();
    var nickname = document.getElementById("inpNickname").value.trim();
    var phone = document.getElementById("inpPhone").value.trim();
    if(!name || !lastname){ showToast("Completá nombre y apellido."); return; }
    if(digitsOnly(phone).length < 8){ showToast("Ingresá un teléfono válido (mínimo 8 dígitos)."); return; }
    client.name = name; client.lastname = lastname; client.nickname = nickname; client.phone = phone;
    client.registered = true;
    try{ localStorage.setItem(PROFILE_KEY, JSON.stringify({name:name,lastname:lastname,nickname:nickname,phone:phone})); }catch(e){}
    client.step = 2;
    renderClient();
  };
  var editP = document.getElementById("btnEditProfile");
  if(editP) editP.onclick = function(){ client.step = 1; renderClient(); };

  document.querySelectorAll(".date-chip[data-pick]").forEach(function(el){
    el.onclick = function(){ client.selectedDate = el.getAttribute("data-date"); client.selectedTime = null; renderClient(); };
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
    var free = getSlotStatuses(client.selectedDate).some(function(s){ return s.time===client.selectedTime && !s.taken; });
    if(!free){
      showToast("Ese horario se acaba de ocupar. Elegí otro.");
      client.selectedTime = null; client.step = 2; renderClient();
      return;
    }
    client.lastBooking = createBooking();
    client.step = 4;
    renderClient();
  };
  var cp = document.getElementById("btnCopyAlias");
  if(cp) cp.onclick = function(){ copyText(state.config.payAlias); };
  var nb = document.getElementById("btnNewBooking");
  if(nb) nb.onclick = function(){
    client.step=2; client.selectedDate=null; client.selectedTime=null; client.lastBooking=null; client.payMethod="local";
    renderClient();
  };
}

// si el cliente ya se registró en este dispositivo, entra directo a elegir fecha
(function(){
  try{
    var raw = localStorage.getItem(PROFILE_KEY);
    if(raw){
      var p = JSON.parse(raw);
      if(p && p.name && p.lastname && digitsOnly(p.phone||"").length >= 8){
        client.name=p.name; client.lastname=p.lastname; client.nickname=p.nickname||""; client.phone=p.phone;
        client.registered = true; client.step = 2;
      }
    }
  }catch(e){}
})();

render();
})();
