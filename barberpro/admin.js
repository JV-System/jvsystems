/* BarberPro Turnos - panel de administración del dueño.
   Depende de core.js (estado, utilidades, disponibilidad). */
(function(){
"use strict";
  var session = {
    ownerAuthed: CLOUD ? false : (sessionStorage.getItem(OWNER_KEY)==="1"),
    ownerTab: "agenda",
    agendaView: "dia",
    agendaDate: toISO(new Date()),
    monthCursor: toISO(new Date()),
    weekCursor: toISO(new Date()),
    clientDetail: null,      // clave del cliente cuya ficha se está viendo
    clientQuery: "",
    clientSort: "turnos",
    payRange: "mes",
    paySort: "pagado",
    payQuery: ""
  };

  function render(){
    applyBranding("Administración");
    renderOwner();
  }
  // un cliente reservó desde otra pestaña: refrescar la agenda sin pisar formularios abiertos
  hooks.refresh = function(){
    applyBranding("Administración");
    if(!session.ownerAuthed) return;
    var t = session.ownerTab;
    if(t==="agenda" || t==="saldos") renderOwner();
    else if(t==="clientes" && document.activeElement !== document.getElementById("inpClientSearch")) renderOwner();
    else if(t==="pagos" && document.activeElement !== document.getElementById("inpPaySearch")) renderOwner();
  };

  // inició o cerró sesión (Firebase Authentication)
  hooks.authChanged = function(){
    session.ownerAuthed = !!(window.cloudAuth && cloudAuth.user());
    renderOwner();
  };

  function renderOwner(){
    var main = document.getElementById("main");
    main.className = session.ownerAuthed ? "is-owner" : "";
    if(!session.ownerAuthed){
      main.innerHTML = ownerLogin();
      bindOwnerLogin();
      return;
    }

    var unseen = state.bookings.filter(function(b){ return !b.seenByOwner && b.status==="confirmed"; }).length;
    var html = '<div class="owner-nav-row">' +
      '<div class="owner-nav-scroll"><div class="owner-nav">' +
        navBtn("agenda","Agenda", unseen) +
        navBtn("clientes","Clientes") +
        navBtn("pagos","Pagos") +
        navBtn("horarios","Horarios") +
        navBtn("cierres","Cierres") +
        navBtn("negocio","Negocio", needsSetup() ? "!" : 0) +
        navBtn("precios","Precios") +
        navBtn("saldos","Saldos", Object.keys(state.debts).length) +
        navBtn("config","Configuración") +
      '</div></div>' +
      '<button class="btn-logout" id="btnLogout">Salir</button>' +
      '</div>';

    html += '<div class="owner-content tab-' + session.ownerTab + '">';
    if(session.ownerTab==="agenda") html += ownerAgenda();
    else if(session.ownerTab==="horarios") html += ownerHorarios();
    else if(session.ownerTab==="cierres") html += ownerCierres();
    else if(session.ownerTab==="negocio") html += ownerNegocio();
    else if(session.ownerTab==="precios") html += ownerPrecios();
    else if(session.ownerTab==="clientes") html += ownerClientes();
    else if(session.ownerTab==="pagos") html += ownerPagos();
    else if(session.ownerTab==="config") html += ownerConfig();
    else html += ownerSaldos();
    html += '</div>';

    main.innerHTML = html;
    bindOwnerNav();
    bindPwEyes();
    document.querySelectorAll("[data-demo-on]").forEach(function(el){
      el.onclick = function(){ loadExampleData(); renderOwner(); };
    });

    if(session.ownerTab==="agenda"){
      markAllSeen();
      bindAgendaEvents();
    } else if(session.ownerTab==="horarios") bindHorariosEvents();
    else if(session.ownerTab==="cierres") bindCierresEvents();
    else if(session.ownerTab==="negocio") bindNegocioEvents();
    else if(session.ownerTab==="precios") bindPreciosEvents();
    else if(session.ownerTab==="clientes") bindClientesEvents();
    else if(session.ownerTab==="pagos") bindPagosEvents();
    else if(session.ownerTab==="config") bindConfigEvents();
    else bindSaldosEvents();
  }

  function navBtn(id,label,count){
    var active = session.ownerTab===id ? " active" : "";
    var badge = count ? ' <span class="bell-dot" style="position:static; margin-left:5px; display:inline-flex;">'+count+'</span>' : "";
    return '<button class="ownerNavBtn'+active+'" data-tab="'+id+'">'+label+badge+'</button>';
  }

  function authErrorMsg(e){
    var code = e && e.code ? e.code : "";
    if(code === "auth/too-many-requests") return "Demasiados intentos. Esperá unos minutos y probá de nuevo.";
    if(code === "auth/network-request-failed") return "Sin conexión. Revisá tu internet.";
    if(code.indexOf("auth/") === 0) return "Mail o contraseña incorrectos.";
    return "No se pudo iniciar sesión. Intentá de nuevo.";
  }

  var EYE_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.9 17.9A10.4 10.4 0 0 1 12 19c-6.4 0-10-7-10-7a17.6 17.6 0 0 1 4.1-4.9M9.9 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17.7 17.7 0 0 1-2.2 3.2M1 1l22 22"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  var OWNER_EMAIL_KEY = "barberpro_owner_email";
  function rememberedOwnerEmail(){ try{ return localStorage.getItem(OWNER_EMAIL_KEY) || ""; }catch(e){ return ""; } }

  function ownerLogin(){
    if(CLOUD){
      if(!cloudAuth.isReady()){
        return '<div class="card lockcard"><div class="lockicon">⏳</div><h2>Un momento...</h2><div class="sub">Verificando tu sesión</div></div>';
      }
      return '<div class="card lockcard">' +
        '<div class="lockicon">🔒</div>' +
        '<h2>Acceso del dueño</h2>' +
        '<div class="sub">Ingresá con tu mail y contraseña</div>' +
        '<input type="text" id="inpOwnerEmail" inputmode="email" placeholder="'+(((window.BARBERPRO_CONFIG || {}).ownerEmail) ? 'usuario o mail' : 'tu@mail.com')+'" autocomplete="username" autocapitalize="off" value="'+esc(rememberedOwnerEmail())+'" style="text-align:center;">' +
        '<div class="pw-wrap"><input type="password" id="inpOwnerPass" placeholder="Contraseña" autocomplete="current-password" style="text-align:center;">' +
          '<button type="button" class="pw-eye" id="btnPwEye" aria-label="Mostrar contraseña" aria-pressed="false">' + EYE_SVG + '</button></div>' +
        '<label class="checkline" style="justify-content:center;"><input type="checkbox" id="inpOwnerRemember" checked><span>Recordar en este dispositivo</span></label>' +
        '<button class="btn btn-primary" id="btnOwnerLogin" style="max-width:240px; margin:0 auto;">Ingresar</button>' +
        '<button class="link-btn" id="btnOwnerReset" type="button" style="margin-top:14px;">Olvidé mi contraseña</button>' +
        '</div>';
    }
    return '<div class="card lockcard">' +
      '<div class="lockicon">🔒</div>' +
      '<h2>Acceso del dueño</h2>' +
      '<div class="sub">Ingresá el PIN para ver la agenda</div>' +
      '<input type="password" id="inpPin" placeholder="PIN" style="text-align:center; letter-spacing:4px; max-width:160px; margin:0 auto 14px;">' +
      '<button class="btn btn-primary" id="btnOwnerLogin" style="max-width:220px; margin:0 auto;">Ingresar</button>' +
      '<div class="field-hint" style="margin-top:12px;">PIN de ejemplo: 1234 (cambialo en Precios → Acceso)</div>' +
      '</div>';
  }

  function bindOwnerLogin(){
    var btn = document.getElementById("btnOwnerLogin");
    if(!btn) return;
    if(CLOUD){
      var emailEl = document.getElementById("inpOwnerEmail"), passEl = document.getElementById("inpOwnerPass");
      function go(){
        var email = emailEl.value.trim(), pass = passEl.value;
        // atajo: si escribe un usuario sin @ (ej. "admin") se usa el mail del dueño cargado en config.js
        var ownerMail = (window.BARBERPRO_CONFIG || {}).ownerEmail;
        if(email && email.indexOf("@") < 0 && ownerMail) email = ownerMail;
        var remember = document.getElementById("inpOwnerRemember").checked;
        if(!email || !pass){ showToast("Escribí tu mail y tu contraseña."); return; }
        btn.disabled = true; btn.textContent = "Ingresando...";
        try{ if(remember) localStorage.setItem(OWNER_EMAIL_KEY, emailEl.value.trim()); else localStorage.removeItem(OWNER_EMAIL_KEY); }catch(e){}
        cloudAuth.login(email, pass, remember).catch(function(e){
          btn.disabled = false; btn.textContent = "Ingresar";
          showToast(authErrorMsg(e));
        });
      }
      var eye = document.getElementById("btnPwEye");
      eye.onclick = function(){
        var show = passEl.type === "password";
        passEl.type = show ? "text" : "password";
        eye.innerHTML = show ? EYE_OFF_SVG : EYE_SVG;
        eye.setAttribute("aria-pressed", show ? "true" : "false");
        eye.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
      };
      btn.onclick = go;
      passEl.onkeydown = function(e){ if(e.key === "Enter") go(); };
      document.getElementById("btnOwnerReset").onclick = function(){
        var email = emailEl.value.trim(), ownerMail = (window.BARBERPRO_CONFIG || {}).ownerEmail;
        if(email && email.indexOf("@") < 0 && ownerMail) email = ownerMail;
        if(!email){ showToast("Escribí tu mail arriba y volvé a tocar este botón."); return; }
        cloudAuth.resetPassword(email).then(function(){
          showToast("Si ese mail es el del dueño, te mandamos un correo para cambiar la contraseña.");
        }).catch(function(){ showToast("No se pudo enviar el correo. Revisá el mail e intentá de nuevo."); });
      };
      return;
    }
    btn.onclick = function(){
      var pin = document.getElementById("inpPin").value;
      if(pin === state.config.ownerPin){
        session.ownerAuthed = true;
        sessionStorage.setItem(OWNER_KEY,"1");
        renderOwner();
      }else{
        showToast("PIN incorrecto.");
      }
    };
  }

  function bindOwnerNav(){
    document.querySelectorAll(".ownerNavBtn").forEach(function(el){
      el.onclick = function(){ session.ownerTab = el.getAttribute("data-tab"); session.clientDetail = null; renderOwner(); };
    });
    var lo = document.getElementById("btnLogout");
    if(lo) lo.onclick = function(){
      if(CLOUD){ cloudAuth.logout(); return; }          // authChanged vuelve a dibujar la pantalla de acceso
      session.ownerAuthed=false; sessionStorage.removeItem(OWNER_KEY); renderOwner();
    };
  }

  // cuando todavía no hay turnos: invita a cargar los datos de ejemplo para ver el panel con actividad
  function demoCta(){
    if(state.bookings.length || hasExampleData()) return "";
    return '<div class="card demo-cta"><h2>Todavía no hay turnos</h2>' +
      '<div class="sub">¿Querés ver cómo se ve el panel con actividad? Cargá clientes y turnos de ejemplo' + (CLOUD ? ' (solo en este navegador, no se guardan en tu base).' : '.') + '</div>' +
      '<button class="btn btn-primary" data-demo-on="1">Cargar datos de ejemplo</button></div>';
  }

  function ownerAgenda(){
    var todayISO = toISO(new Date());
    var todays = state.bookings.filter(function(b){ return b.date===todayISO && b.status!=="cancelled"; });
    var toCollect = todays.filter(function(b){ return !b.paid; }).reduce(function(s,b){ return s + b.price + (b.debtCharged||0); }, 0);

    var html = '<div class="agenda-layout"><aside class="agenda-side">' + demoCta() + '<div class="stat-row">' +
      '<div class="stat-tile"><div class="num">'+todays.length+'</div><div class="lbl">Turnos hoy</div></div>' +
      '<div class="stat-tile"><div class="num">'+money(toCollect)+'</div><div class="lbl">A cobrar hoy</div></div>' +
      '</div>';

    if(hasExampleData()){
      html += '<div class="notice info" style="align-items:center;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5m0 3h.01"/></svg>' +
        '<div>Estás viendo turnos de ejemplo para mostrar cómo se ve la agenda llena. <button id="btnClearExamples" style="background:none; border:none; color:var(--accent-1); font-weight:800; font-family:inherit; font-size:13px; cursor:pointer; padding:0; text-decoration:underline;">Borrarlos</button></div></div>';
    }

    html += reminderCard();
    html += proximosCard();
    html += '</aside><section class="agenda-main">';

    html += '<div class="agenda-subnav">' +
      ['dia','semana','mes'].map(function(v){
        var lbl = v==='dia'?'Día':v==='semana'?'Gantt semanal':'Mes';
        return '<button class="agendaViewBtn'+(session.agendaView===v?' active':'')+'" data-v="'+v+'">'+lbl+'</button>';
      }).join('') + '</div>';

    if(session.agendaView==="dia") html += agendaDia();
    else if(session.agendaView==="semana") html += agendaSemana();
    else html += agendaMes();

    return html + '</section></div>';
  }

  // los próximos turnos confirmados (hoy en adelante); un toque abre ese día
  function proximosCard(){
    var now = new Date(), today = toISO(now), nowMin = now.getHours()*60 + now.getMinutes();
    var list = state.bookings.filter(function(b){
      return b.status==="confirmed" && (b.date > today || (b.date===today && timeToMin(b.time) >= nowMin - 30));
    }).sort(function(a,b){ return (a.date+a.time) < (b.date+b.time) ? -1 : 1; }).slice(0, 8);
    return '<div class="card next-card"><h2>Próximos turnos</h2>' +
      (list.length ? list.map(function(b){
        return '<button type="button" class="next-row" data-jump="'+b.date+'">' +
          '<span class="next-when"><b>'+b.time+'</b>'+(b.date===today ? 'Hoy' : formatDateLong(b.date))+'</span>' +
          '<span class="next-who">'+esc(b.name)+' '+esc(b.lastname)+'</span>' +
          (b.paid ? '<span class="paystate ok">Pagado</span>' : '') + '</button>';
      }).join("") : '<div class="empty-note">No hay turnos próximos.</div>') +
      '</div>';
  }

  // turnos de mañana: un toque por cliente abre WhatsApp o el mail con el recordatorio ya escrito
  function tomorrowBookings(){
    var t = addDays(toISO(new Date()), 1);
    return state.bookings.filter(function(b){ return b.date===t && b.status==="confirmed"; })
      .sort(function(a,b){ return timeToMin(a.time)-timeToMin(b.time); });
  }
  function reminderCard(){
    var list = tomorrowBookings();
    if(!list.length) return "";
    var pending = list.filter(function(b){ return !b.reminded; }).length;
    return '<div class="card remind-card"><h2>Recordatorios de mañana</h2>' +
      '<div class="sub">'+(pending ? pending+' sin avisar de '+list.length : 'Todos avisados')+' · tocá para mandar el mensaje listo</div>' +
      list.map(function(b){
        var who = esc(b.name)+' '+esc(b.lastname);
        return '<div class="remind-row'+(b.reminded?' done':'')+'">' +
          '<div class="remind-who"><b>'+b.time+'</b> '+who+(b.reminded?' <span class="remind-ok">✓ avisado</span>':'')+'</div>' +
          '<div class="remind-btns">' +
            (b.phone ? '<a class="btn btn-wa btn-sm" data-remind="'+b.id+'" href="'+reminderWaLink(b)+'" target="_blank" rel="noopener">WhatsApp</a>' : '') +
            (b.email ? '<a class="btn btn-ghost btn-sm" data-remind="'+b.id+'" href="'+reminderMailLink(b)+'">Mail</a>' : '') +
            (!b.phone && !b.email ? '<span class="remind-none">sin contacto</span>' : '') +
          '</div></div>';
      }).join('') + '</div>';
  }

  function agendaDia(){
    var iso = session.agendaDate;
    var list = state.bookings.filter(function(b){ return b.date===iso; }).sort(function(a,b){ return timeToMin(a.time)-timeToMin(b.time); });
    var html = '<div class="nav-arrows">' +
      '<button data-dnav="-1">‹</button>' +
      '<div class="lbl">'+formatDateLong(iso)+'</div>' +
      '<button data-dnav="1">›</button>' +
      '</div>';
    if(list.length===0){
      html += '<div class="empty-note">Sin turnos este día'+(isDayFullyClosed(iso)?' · Local cerrado':'')+'.</div>';
    } else {
      html += '<div class="booking-list">' + list.map(bookingRow).join("") + '</div>';
    }
    return html;
  }

  function bookingRow(b){
    var badgeClass = b.status;
    var badgeLabel = b.status==="confirmed"?"Confirmado":b.status==="cancelled"?"Cancelado":"Completado";
    var total = b.price + (b.debtCharged||0);
    var actions = "";
    if(b.status==="confirmed"){
      actions = '<div class="actions">' +
        (b.paid ? '' : '<button class="btn btn-primary btn-sm" data-paid="'+b.id+'">Cobrado</button>') +
        '<button class="btn btn-ghost btn-sm" data-complete="'+b.id+'">Completar</button>' +
        '<button class="btn btn-danger btn-sm" data-cancel="'+b.id+'">Cancelar</button>' +
        (b.phone ? '<a class="btn btn-ghost btn-sm" href="https://wa.me/'+waNumber(b.phone)+'" target="_blank" rel="noopener">WhatsApp</a>' : "") +
        (b.email ? '<a class="btn btn-ghost btn-sm" href="mailto:'+esc(b.email)+'">Mail</a>' : "") +
        '</div>';
    }
    return '<div class="booking-row">' +
      '<div class="top"><span class="time">'+b.time+'</span><span class="badge '+badgeClass+'">'+badgeLabel+'</span></div>' +
      '<div class="name">'+esc(b.name)+' '+esc(b.lastname)+(b.nickname?' <span class="nick">“'+esc(b.nickname)+'”</span>':'')+(b.isExample?'<span class="example-tag">Ejemplo</span>':'')+'</div>' +
      '<div class="sub">'+(b.phone?esc(b.phone)+' · ':'')+(b.email?esc(b.email)+' · ':'')+'<span class="price">'+money(total)+'</span>' +
      (b.debtCharged?' <span class="debt-tag">(incluye '+money(b.debtCharged)+' de seña)</span>':'') +
      '</div>' + payLine(b) + actions +
      '</div>';
  }

  function payLine(b){
    if(b.status==="cancelled") return "";
    return '<div class="payline"><span class="paychip">'+payMethodLabel(b.payMethod||"local")+'</span>' +
      '<span class="paystate '+(b.paid?'ok':'pend')+'">'+(b.paid?'Pagado':'Pago pendiente')+'</span></div>';
  }

  function markPaid(id){
    var b = state.bookings.filter(function(x){ return x.id===id; })[0];
    if(!b) return;
    updateBooking(id, {paid: true});
    if(b.debtCharged > 0) settleDebt(b.clientKey);       // el saldo anterior que traía este turno queda saldado
    showToast("Cobro registrado.");
  }

  function agendaSemana(){
    var start = fromISO(session.weekCursor);
    var wd = start.getDay();
    var mondayOffset = (wd===0? -6 : 1-wd);
    start.setDate(start.getDate()+mondayOffset);
    var startISO = toISO(start);
    var todayISO = toISO(new Date());
    var days = [];
    for(var i=0;i<7;i++) days.push(addDays(startISO,i));

    var nav = '<div class="nav-arrows">' +
      '<button data-wnav="-1">‹</button>' +
      '<div class="lbl">'+formatDateShort(startISO)+' – '+formatDateShort(addDays(startISO,6))+'</div>' +
      '<button data-wnav="1">›</button>' +
      '</div>';

    // rango horario global: min inicio / max fin entre los turnos activos de la semana (o de la config si esa semana está toda cerrada)
    var minStart=null, maxEnd=null;
    days.forEach(function(iso){
      getRangesForDate(iso).forEach(function(r){
        var s=timeToMin(r.start), e=timeToMin(r.end);
        if(minStart===null||s<minStart) minStart=s;
        if(maxEnd===null||e>maxEnd) maxEnd=e;
      });
    });
    if(minStart===null){
      DOW_KEYS.forEach(function(k){
        ["morning","afternoon"].forEach(function(sh){
          var shift = state.config.hours[k][sh];
          if(shift.active){
            var s=timeToMin(shift.start), e=timeToMin(shift.end);
            if(minStart===null||s<minStart) minStart=s;
            if(maxEnd===null||e>maxEnd) maxEnd=e;
          }
        });
      });
    }
    if(minStart===null) return nav + '<div class="empty-note">No hay horarios configurados.</div>';

    var slotMin = state.config.slotMinutes;
    var rows = [];
    for(var t=minStart; t<maxEnd; t+=slotMin) rows.push(t);

    var head = '<div class="gantt-row gantt-head"><div class="gantt-time"></div>' +
      days.map(function(iso){
        var d = fromISO(iso);
        return '<div class="gantt-col-head'+(iso===todayISO?' today':'')+'">'+DOW_SHORT[DOW_KEYS[d.getDay()]]+'<span>'+d.getDate()+'</span></div>';
      }).join('') + '</div>';

    var body = rows.map(function(t){
      var timeLbl = minToTime(t);
      var row = '<div class="gantt-row"><div class="gantt-time">'+timeLbl+'</div>';
      days.forEach(function(iso){
        var open = getRangesForDate(iso).some(function(r){ return t>=timeToMin(r.start) && t<timeToMin(r.end); });
        var booking = state.bookings.filter(function(b){ return b.date===iso && b.time===timeLbl && b.status!=="cancelled"; })[0];
        var cls = "gantt-cell" + (open?"":" closed") + (booking?" booked":"") + (iso===todayISO?" today":"");
        var content = booking ? '<span class="gantt-name">'+esc(booking.name)+' '+esc((booking.lastname||"").charAt(0))+'.</span>' : "";
        row += '<div class="'+cls+'"'+(booking?' data-jump="'+iso+'" title="'+esc(booking.name)+' '+esc(booking.lastname)+' · '+timeLbl+'hs"':'')+'>'+content+'</div>';
      });
      return row + '</div>';
    }).join('');

    return nav +
      '<div class="gantt-outer"><div class="gantt-wrap"><div class="gantt">'+head+body+'</div></div></div>' +
      '<div class="gantt-hint">◀ Deslizá para ver los 7 días ▶</div>' +
      '<div class="gantt-legend">' +
        '<span><i style="background:var(--accent-grad)"></i>Ocupado</span>' +
        '<span><i style="background:var(--surface-2); border:1px solid var(--border);"></i>Libre</span>' +
        '<span><i style="background:var(--surface-3); opacity:.6;"></i>Cerrado</span>' +
      '</div>';
  }

  // ocupación del día: turnos tomados sobre el total de horarios que abre el local ese día
  function dayOccupancy(iso, count){
    var slotMin = state.config.slotMinutes, total = 0;
    getRangesForDate(iso).forEach(function(r){
      for(var t = timeToMin(r.start); t + slotMin <= timeToMin(r.end); t += slotMin) total++;
    });
    if(!total) return null;
    var pct = Math.min(100, Math.round(count * 100 / total));
    return {total: total, count: count, pct: pct, level: pct >= 85 ? "high" : pct >= 50 ? "mid" : "low"};
  }

  function agendaMes(){
    var cursor = fromISO(session.monthCursor);
    var year = cursor.getFullYear(), month = cursor.getMonth();
    var firstOfMonth = new Date(year,month,1);
    var startOffset = (firstOfMonth.getDay()===0? 6 : firstOfMonth.getDay()-1);
    var gridStart = new Date(year,month,1-startOffset);
    var todayISO = toISO(new Date());
    var cells = "";
    var dows = ["LUN","MAR","MIÉ","JUE","VIE","SÁB","DOM"];
    dows.forEach(function(d){ cells += '<div class="month-dow">'+d+'</div>'; });
    for(var i=0;i<42;i++){
      var d = new Date(gridStart); d.setDate(gridStart.getDate()+i);
      var iso = toISO(d);
      var other = d.getMonth()!==month;
      var count = state.bookings.filter(function(b){ return b.date===iso && b.status!=="cancelled"; }).length;
      var closed = isDayFullyClosed(iso);
      var occ = (!other && !closed) ? dayOccupancy(iso, count) : null;
      cells += '<div class="month-cell'+(other?' other':'')+(closed&&!other?' closed':'')+(iso===todayISO?' today':'')+'" '+(other?'':'data-jump="'+iso+'"')+
        (occ ? ' title="'+count+' de '+occ.total+' horarios ocupados ('+occ.pct+'%)"' : '')+'>' +
        '<div class="dn">'+d.getDate()+'</div>' +
        (occ ? '<div class="occ"><span class="occ-txt">'+occ.pct+'%</span><span class="occ-track"><i class="occ-fill '+occ.level+'" style="width:'+occ.pct+'%"></i></span><span class="occ-n">'+count+'/'+occ.total+'</span></div>' : '') +
        '</div>';
    }
    return '<div class="nav-arrows">' +
      '<button data-mnav="-1">‹</button>' +
      '<div class="lbl">'+MONTHS[month]+' '+year+'</div>' +
      '<button data-mnav="1">›</button>' +
      '</div>' +
      '<div class="month-grid">'+cells+'</div>' +
      '<div class="gantt-legend occ-legend"><span><i class="occ-fill low"></i>Hasta 49%</span><span><i class="occ-fill mid"></i>50 a 84%</span><span><i class="occ-fill high"></i>85% o más (casi lleno)</span></div>';
  }

  function bindAgendaEvents(){
    var ce = document.getElementById("btnClearExamples");
    if(ce) ce.onclick = function(){
      askConfirm("Borrar datos de ejemplo", "¿Borrar los turnos y saldos de ejemplo? Los turnos reales no se tocan.", clearExampleData);
    };
    document.querySelectorAll(".agendaViewBtn").forEach(function(el){
      el.onclick = function(){ session.agendaView = el.getAttribute("data-v"); renderOwner(); };
    });
    document.querySelectorAll("[data-remind]").forEach(function(el){
      el.addEventListener("click", function(){
        var id = el.getAttribute("data-remind");
        var b = state.bookings.filter(function(x){ return x.id===id; })[0];
        if(b && !b.reminded) updateBooking(id, {reminded: true});
      });
    });
    document.querySelectorAll("[data-paid]").forEach(function(el){
      el.onclick = function(){ markPaid(el.getAttribute("data-paid")); };
    });
    document.querySelectorAll("[data-complete]").forEach(function(el){
      el.onclick = function(){ completeBooking(el.getAttribute("data-complete")); };
    });
    document.querySelectorAll("[data-cancel]").forEach(function(el){
      el.onclick = function(){
        var id = el.getAttribute("data-cancel");
        askConfirm("Cancelar turno", "¿Cancelar este turno? Si es el mismo día, se registrará una seña del 50% a nombre del cliente.", function(){ cancelBooking(id); });
      };
    });
    document.querySelectorAll("[data-dnav]").forEach(function(el){
      el.onclick = function(){ session.agendaDate = addDays(session.agendaDate, parseInt(el.getAttribute("data-dnav"),10)); renderOwner(); };
    });
    document.querySelectorAll("[data-wnav]").forEach(function(el){
      el.onclick = function(){ session.weekCursor = addDays(session.weekCursor, 7*parseInt(el.getAttribute("data-wnav"),10)); renderOwner(); };
    });
    document.querySelectorAll("[data-mnav]").forEach(function(el){
      el.onclick = function(){ session.monthCursor = addMonths(session.monthCursor, parseInt(el.getAttribute("data-mnav"),10)); renderOwner(); };
    });
    document.querySelectorAll("[data-jump]").forEach(function(el){
      el.onclick = function(){ session.agendaDate = el.getAttribute("data-jump"); session.agendaView="dia"; renderOwner(); };
    });
  }

  function ownerHorarios(){
    var html = '<div class="card"><h2>Horarios de atención</h2><div class="sub">Definí cuándo abrís (si cerrás al mediodía, usá el segundo horario)</div>';
    DOW_KEYS.filter(function(k){ return k!=="sun"; }).concat(["sun"]).forEach(function(k){
      var day = state.config.hours[k];
      html += '<div class="hours-day">' +
        '<div class="dlabel">'+DOW_LABEL[k]+'</div>' +
        shiftRow(k,"morning","Horario",day.morning) +
        shiftRow(k,"afternoon","Horario 2",day.afternoon) +
        '</div>';
    });
    html += '<button class="btn btn-primary" id="btnSaveHours" style="margin-top:16px;">Guardar horarios</button></div>';
    return html;
  }
  function shiftRow(dayKey, shiftKey, label, shift){
    var dis = shift.active ? "" : " disabled";
    return '<div class="hours-shift'+dis+'">' +
      '<span class="shiftname">'+label+'</span>' +
      '<input type="checkbox" data-shift-active="'+dayKey+'.'+shiftKey+'" '+(shift.active?'checked':'')+'>' +
      '<input type="time" data-shift-start="'+dayKey+'.'+shiftKey+'" value="'+shift.start+'" '+(shift.active?'':'disabled')+'>' +
      '<input type="time" data-shift-end="'+dayKey+'.'+shiftKey+'" value="'+shift.end+'" '+(shift.active?'':'disabled')+'>' +
      '</div>';
  }
  function bindHorariosEvents(){
    document.querySelectorAll("[data-shift-active]").forEach(function(el){
      el.onchange = function(){
        var parts = el.getAttribute("data-shift-active").split(".");
        state.config.hours[parts[0]][parts[1]].active = el.checked;
        renderOwner();
      };
    });
    var btn = document.getElementById("btnSaveHours");
    if(btn) btn.onclick = function(){
      document.querySelectorAll("[data-shift-start]").forEach(function(el){
        var p = el.getAttribute("data-shift-start").split(".");
        state.config.hours[p[0]][p[1]].start = el.value;
      });
      document.querySelectorAll("[data-shift-end]").forEach(function(el){
        var p = el.getAttribute("data-shift-end").split(".");
        state.config.hours[p[0]][p[1]].end = el.value;
      });
      saveState();
      showToast("Horarios guardados.");
    };
  }

  function ownerCierres(){
    var html = '<div class="card"><h2>Cierres puntuales</h2><div class="sub">Días u horarios que cerrás por motivos personales</div>' +
      '<label>Fecha</label><input type="date" id="inpClosureDate">' +
      '<label>Motivo (opcional)</label><input type="text" id="inpClosureReason" placeholder="Ej: Turno médico">' +
      '<button class="btn btn-primary" id="btnAddClosure">Agregar cierre</button>' +
      '</div>';
    html += '<div class="card"><h2>Próximos cierres</h2>';
    var upcoming = state.closures.slice().sort(function(a,b){ return a.date<b.date?-1:1; });
    if(upcoming.length===0) html += '<div class="empty-note">No hay cierres cargados.</div>';
    else html += upcoming.map(function(c){
      return '<div class="closure-item"><div><div class="cd">'+formatDateLong(c.date)+'</div>'+(c.reason?'<div class="cr">'+esc(c.reason)+'</div>':'')+'</div><button data-delclosure="'+c.id+'">✕</button></div>';
    }).join("");
    html += '</div>';
    return html;
  }
  function bindCierresEvents(){
    var btn = document.getElementById("btnAddClosure");
    if(btn) btn.onclick = function(){
      var date = document.getElementById("inpClosureDate").value;
      var reason = document.getElementById("inpClosureReason").value.trim();
      if(!date){ showToast("Elegí una fecha."); return; }
      state.closures.push({id:uid(), date:date, reason:reason});
      saveState();
      renderOwner();
      showToast("Cierre agregado.");
    };
    document.querySelectorAll("[data-delclosure]").forEach(function(el){
      el.onclick = function(){
        var id = el.getAttribute("data-delclosure");
        state.closures = state.closures.filter(function(c){ return c.id!==id; });
        saveState();
        renderOwner();
      };
    });
  }

  function needsSetup(){ return !state.config.whatsappLink || !state.config.address; }

  function ownerNegocio(){
    var c = state.config;
    return '<div class="card"><h2>Datos del negocio</h2>' +
      '<div class="sub">Es lo que ven tus clientes al entrar a reservar</div>' +
      (needsSetup() ? '<div class="notice info"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5m0 3h.01"/></svg><div>Completá la dirección y el WhatsApp: los clientes los ven arriba y el WhatsApp recibe la confirmación de cada turno.</div></div>' : '') +
      '<label>Nombre de la barbería</label><input type="text" id="inpBizName" value="'+esc(c.businessName)+'" maxlength="30" placeholder="Ej: Barbería El Corte">' +
      '<label>Frase corta <span class="opt">(opcional)</span></label><input type="text" id="inpBizTagline" value="'+esc(c.tagline)+'" maxlength="40" placeholder="Ej: Cortes y barba desde 2015">' +
      '<label>Dirección</label><input type="text" id="inpBizAddress" value="'+esc(c.address)+'" maxlength="60" placeholder="Ej: Av. Siempreviva 742">' +
      '<label>WhatsApp del negocio</label><input type="tel" id="inpBizWa" value="'+esc(c.whatsappDisplay)+'" placeholder="Ej: 5491123456789">' +
      '<div class="field-hint">Con código de país y sin el +. Argentina celular: 549 + código de área + número.</div>' +
      '<button class="btn btn-primary" id="btnSaveNegocio">Guardar datos</button></div>' +
      '<div class="card"><h2>Cobros</h2>' +
      '<div class="sub">Cómo pueden pagar tus clientes al reservar (el pago en el local siempre está)</div>' +
      '<label>Alias o CBU para transferencias <span class="opt">(opcional)</span></label><input type="text" id="inpPayAlias" value="'+esc(c.payAlias)+'" maxlength="40" placeholder="Ej: barberia.elcorte">' +
      '<label>Titular de la cuenta <span class="opt">(opcional)</span></label><input type="text" id="inpPayHolder" value="'+esc(c.payHolder)+'" maxlength="40" placeholder="Ej: Juan Pérez">' +
      '<label>Link de pago de Mercado Pago <span class="opt">(opcional)</span></label><input type="text" id="inpPayMp" value="'+esc(c.payMpLink)+'" maxlength="200" placeholder="https://mpago.la/...">' +
      '<div class="field-hint">Creálo en la app de Mercado Pago: Cobrar → Link de pago, por el precio del corte.</div>' +
      '<div class="field-hint">Los pagos los confirmás vos a mano desde la agenda (botón "Cobrado").</div>' +
      '<button class="btn btn-primary" id="btnSaveCobros">Guardar cobros</button></div>' +
      '<div class="card"><h2>Empezar de cero</h2>' +
      '<div class="sub">Borra todos los turnos, saldos y cierres cargados. No toca tus datos, horarios ni precio. Sirve para limpiar lo que se cargó probando la app.</div>' +
      '<button class="btn btn-danger" id="btnResetAll">Borrar todos los turnos</button></div>';
  }
  function bindNegocioEvents(){
    var br = document.getElementById("btnResetAll");
    if(br) br.onclick = function(){
      askConfirm("Empezar de cero", "Se borran todos los turnos, saldos y cierres. Esto no se puede deshacer. ¿Seguimos?", function(){
        resetAllData().then(function(){
          renderOwner();
          showToast("Listo: la agenda quedó vacía.");
        });
      });
    };
    var bc = document.getElementById("btnSaveCobros");
    if(bc) bc.onclick = function(){
      var mp = document.getElementById("inpPayMp").value.trim();
      if(mp && !/^https:\/\//i.test(mp)){ showToast("El link de Mercado Pago tiene que empezar con https://"); return; }
      state.config.payAlias = document.getElementById("inpPayAlias").value.trim();
      state.config.payHolder = document.getElementById("inpPayHolder").value.trim();
      state.config.payMpLink = mp;
      saveState();
      showToast("Cobros guardados.");
    };
    var btn = document.getElementById("btnSaveNegocio");
    if(btn) btn.onclick = function(){
      var name = document.getElementById("inpBizName").value.trim();
      if(!name){ showToast("Ponele un nombre a tu barbería."); return; }
      var wa = document.getElementById("inpBizWa").value.trim();
      var waDigits = digitsOnly(wa);
      if(wa && waDigits.length < 10){ showToast("El WhatsApp parece incompleto (código de país + número)."); return; }
      state.config.businessName = name;
      state.config.tagline = document.getElementById("inpBizTagline").value.trim();
      state.config.address = document.getElementById("inpBizAddress").value.trim();
      state.config.whatsappDisplay = wa;
      state.config.whatsappLink = waDigits;
      saveState();
      render();
      showToast("Datos guardados.");
    };
  }

  function ownerPrecios(){
    return '<div class="card"><h2>Precio y duración</h2>' +
      (state.config.priceIsExample ? '<div class="notice info"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5m0 3h.01"/></svg><div>Este precio es un valor de ejemplo. Actualizalo con el precio real del corte.</div></div>' : '') +
      '<label>Precio del corte ($)</label><input type="number" id="inpPrice" value="'+state.config.price+'">' +
      '<label>Duración del turno (minutos)</label>' +
      '<select id="inpSlotMin">' + [15,20,30,45,60].map(function(m){ return '<option value="'+m+'" '+(state.config.slotMinutes===m?'selected':'')+'>'+m+' min</option>'; }).join("") + '</select>' +
      '<button class="btn btn-primary" id="btnSavePrecios">Guardar</button>' +
      '</div>' +
      (CLOUD ? '' :
        '<div class="card"><h2>Acceso</h2><div class="sub">PIN para entrar al panel del dueño</div>' +
        '<label>Nuevo PIN</label><input type="text" id="inpNewPin" value="'+state.config.ownerPin+'">' +
        '<button class="btn btn-ghost" id="btnSavePin">Guardar PIN</button></div>');
  }
  function bindPreciosEvents(){
    var btn = document.getElementById("btnSavePrecios");
    if(btn) btn.onclick = function(){
      var p = parseInt(document.getElementById("inpPrice").value,10);
      if(!isNaN(p) && p>0){ state.config.price = p; state.config.priceIsExample=false; }
      state.config.slotMinutes = parseInt(document.getElementById("inpSlotMin").value,10);
      saveState();
      renderOwner();
      showToast("Guardado.");
    };
    var btnPin = document.getElementById("btnSavePin");
    if(btnPin) btnPin.onclick = function(){
      var v = document.getElementById("inpNewPin").value.trim();
      if(v){ state.config.ownerPin = v; saveState(); showToast("PIN actualizado."); }
    };
  }

  function ownerSaldos(){
    var keys = Object.keys(state.debts);
    var html = '<div class="card"><h2>Clientes con saldo pendiente</h2><div class="sub">Cancelaciones del mismo día · se cobra el 50% del precio actual</div>';
    if(keys.length===0) html += '<div class="empty-note">No hay saldos pendientes.</div>';
    else html += keys.map(function(k){
      var d = state.debts[k];
      return '<div class="debt-item"><div><div class="n">'+esc(d.name)+' '+esc(d.lastname)+(d.isExample?'<span class="example-tag">Ejemplo</span>':'')+'</div>'+(d.phone?'<div class="cr" style="font-size:12px;color:var(--text-faint);">'+esc(d.phone)+'</div>':'')+'</div>' +
        '<div style="text-align:right;"><div class="amt">'+money(currentPenalty())+'</div>' +
        '<button class="btn btn-ghost btn-sm" style="margin-top:6px;" data-settle="'+k+'">Marcar pagado</button></div></div>';
    }).join("");
    html += '</div>';
    return html;
  }
  function bindSaldosEvents(){
    document.querySelectorAll("[data-settle]").forEach(function(el){
      el.onclick = function(){ settleDebt(el.getAttribute("data-settle")); };
    });
  }

  // ================= CLIENTES =================
  // Junta los perfiles (cuentas) con las reservas de cada uno. La clave es el id de la cuenta (cid) o, en reservas viejas, el mail.
  function emailKey(s){ return String(s || "").trim().toLowerCase(); }

  // pred (opcional): se queda solo con las reservas que cumplen (ej. las de un período); los saldos pendientes no dependen de eso
  function allClients(pred){
    var map = {}, byEmail = {};
    ownerClientProfiles().forEach(function(p){
      map[p.uid] = {key: p.uid, profile: p, bookings: [], clientKeys: {}};
      if(p.email) byEmail[emailKey(p.email)] = p.uid;
    });
    state.bookings.forEach(function(b){
      var k = b.cid && map[b.cid] ? b.cid : (byEmail[emailKey(b.email)] || b.cid || emailKey(b.email) || b.clientKey);
      if(!map[k]) map[k] = {key: k, profile: {uid: k, name: b.name, lastname: b.lastname, nickname: b.nickname, phone: b.phone, email: b.email}, bookings: [], clientKeys: {}};
      if(b.clientKey) map[k].clientKeys[b.clientKey] = 1;
      if(!pred || pred(b)) map[k].bookings.push(b);
    });
    return Object.keys(map).map(function(k){ return clientStats(map[k]); });
  }

  function mostFrequent(list){
    var c = {}, best = null;
    list.forEach(function(x){ c[x] = (c[x] || 0) + 1; if(best === null || c[x] > c[best]) best = x; });
    return best;
  }

  function clientStats(c){
    var today = toISO(new Date());
    var valid = c.bookings.filter(function(b){ return b.status !== "cancelled"; });
    var past = valid.filter(function(b){ return b.date <= today; }).sort(function(a, b){ return (a.date + a.time) < (b.date + b.time) ? -1 : 1; });
    var upcoming = valid.filter(function(b){ return b.date > today || (b.date === today && b.status === "confirmed"); })
      .sort(function(a, b){ return (a.date + a.time) < (b.date + b.time) ? -1 : 1; });
    var amount = function(b){ return b.price + (b.debtCharged || 0); };

    var dates = [], seen = {};
    past.forEach(function(b){ if(!seen[b.date]){ seen[b.date] = 1; dates.push(b.date); } });
    var gap = null;
    if(dates.length >= 2){
      var sum = 0;
      for(var i = 1; i < dates.length; i++) sum += (fromISO(dates[i]) - fromISO(dates[i - 1])) / 86400000;
      gap = Math.round(sum / (dates.length - 1));
    }

    var debtKeys = Object.keys(c.clientKeys || {}).filter(function(k){ return !!state.debts[k]; });

    c.turnos = valid.length;
    c.done = c.bookings.filter(function(b){ return b.status === "completed"; }).length;
    c.cancelled = c.bookings.length - valid.length;
    c.last = past.length ? past[past.length - 1] : null;
    c.next = upcoming.length ? upcoming[0] : null;
    var paidList = valid.filter(function(b){ return b.paid; });
    c.paidCount = paidList.length;
    c.sealPaid = paidList.reduce(function(s, b){ return s + (b.debtCharged || 0); }, 0);
    c.spent = paidList.reduce(function(s, b){ return s + amount(b); }, 0);
    c.toCollect = past.filter(function(b){ return !b.paid; }).reduce(function(s, b){ return s + amount(b); }, 0);
    c.debtKeys = debtKeys;
    c.debt = debtKeys.length * currentPenalty();
    c.gap = gap;
    c.favPay = mostFrequent(valid.map(function(b){ return b.payMethod || "local"; }));
    c.favTime = mostFrequent(valid.map(function(b){ return b.time; }));
    c.sortName = (c.profile.name + " " + c.profile.lastname).toLowerCase();
    return c;
  }

  function clientAvatar(p, size){
    var cls = "avatar" + (size ? " " + size : "");
    if(p.photo) return '<img class="'+cls+'" src="'+esc(p.photo)+'" alt="">';
    return '<span class="'+cls+'">'+esc(((p.name || p.nickname || "?") + "").trim().charAt(0).toUpperCase())+'</span>';
  }

  function shortDate(iso){
    var d = fromISO(iso);
    return d.getDate() + " " + MONTHS[d.getMonth()].slice(0, 3).toLowerCase() + " " + String(d.getFullYear()).slice(2);
  }

  var CLIENT_SORTS = [
    {id: "turnos", label: "Más turnos"},
    {id: "ultimo", label: "Última visita"},
    {id: "gasto",  label: "Más gastó"},
    {id: "deuda",  label: "Con deuda"},
    {id: "nombre", label: "A–Z"}
  ];

  function sortClients(list){
    var s = session.clientSort;
    return list.slice().sort(function(a, b){
      if(s === "nombre") return a.sortName < b.sortName ? -1 : 1;
      if(s === "ultimo") return ((b.last ? b.last.date : "") < (a.last ? a.last.date : "")) ? -1 : ((b.last ? b.last.date : "") > (a.last ? a.last.date : "") ? 1 : 0);
      if(s === "gasto") return (b.spent - a.spent) || (b.turnos - a.turnos);
      if(s === "deuda") return ((b.debt + b.toCollect) - (a.debt + a.toCollect)) || (b.turnos - a.turnos);
      return (b.turnos - a.turnos) || (b.done - a.done) || (a.sortName < b.sortName ? -1 : 1);
    });
  }

  function filterClients(list){
    var q = session.clientQuery.trim().toLowerCase();
    if(!q) return list;
    var qd = digitsOnly(q);
    return list.filter(function(c){
      var p = c.profile;
      var hay = (p.name + " " + p.lastname + " " + (p.nickname || "") + " " + (p.email || "")).toLowerCase();
      return hay.indexOf(q) >= 0 || (qd.length >= 3 && digitsOnly(p.phone).indexOf(qd) >= 0);
    });
  }

  function ownerClientes(){
    if(session.clientDetail){
      var one = allClients().filter(function(c){ return c.key === session.clientDetail; })[0];
      if(one) return clienteDetalle(one);
      session.clientDetail = null;
    }
    var all = allClients();
    var cta = demoCta();
    var turnosTot = all.reduce(function(s, c){ return s + c.turnos; }, 0);
    var cancTot = all.reduce(function(s, c){ return s + c.cancelled; }, 0);
    var facturado = all.reduce(function(s, c){ return s + c.spent; }, 0);
    var conDeuda = all.filter(function(c){ return c.debt > 0 || c.toCollect > 0; }).length;
    var recurrentes = all.filter(function(c){ return c.turnos >= 2; }).length;

    var top = all.filter(function(c){ return c.turnos > 0; }).sort(function(a, b){ return (b.turnos - a.turnos) || (b.done - a.done); }).slice(0, 5);
    var max = top.length ? top[0].turnos : 1;

    var html = cta + '<div class="stat-grid">' +
      '<div class="stat-tile"><div class="num">'+all.length+'</div><div class="lbl">Clientes</div></div>' +
      '<div class="stat-tile"><div class="num">'+turnosTot+'</div><div class="lbl">Turnos (sin cancelados)</div></div>' +
      '<div class="stat-tile"><div class="num">'+money(facturado)+'</div><div class="lbl">Cobrado en total</div></div>' +
      '<div class="stat-tile"><div class="num">'+recurrentes+'</div><div class="lbl">Vuelven (2+ turnos)</div></div>' +
      '<div class="stat-tile"><div class="num">'+conDeuda+'</div><div class="lbl">Con deuda o por cobrar</div></div>' +
      '<div class="stat-tile"><div class="num">'+(turnosTot + cancTot ? Math.round(cancTot * 100 / (turnosTot + cancTot)) : 0)+'%</div><div class="lbl">Cancelaciones</div></div>' +
      '</div>';

    html += '<div class="card"><h2>Los que más se cortan</h2><div class="sub">Ranking por cantidad de turnos (sin contar cancelados)</div>' +
      (top.length ? '<div class="rank">' + top.map(function(c, i){
        return '<button class="rank-row" type="button" data-client="'+esc(c.key)+'">' +
          '<span class="rank-pos">'+(i + 1)+'</span>' + clientAvatar(c.profile, "sm") +
          '<span class="rank-body"><span class="rank-name">'+esc(c.profile.name)+' '+esc(c.profile.lastname)+'</span>' +
          '<span class="rank-bar"><i style="width:'+Math.max(6, Math.round(c.turnos * 100 / max))+'%"></i></span></span>' +
          '<span class="rank-n">'+c.turnos+'</span></button>';
      }).join("") + '</div>' : '<div class="empty-note">Todavía no hay turnos para armar el ranking.</div>') +
      '</div>';

    html += '<div class="card"><h2>Lista de clientes</h2>' +
      '<input type="text" id="inpClientSearch" placeholder="Buscar por nombre, teléfono o mail" value="'+esc(session.clientQuery)+'" autocomplete="off">' +
      '<div class="chips">' + CLIENT_SORTS.map(function(s){
        return '<button type="button" class="chip'+(session.clientSort === s.id ? ' on' : '')+'" data-csort="'+s.id+'">'+s.label+'</button>';
      }).join("") + '</div>' +
      '<div id="clientList">'+clientListHtml(all)+'</div></div>';
    return html;
  }

  function clientListHtml(all){
    var list = sortClients(filterClients(all || allClients()));
    if(!list.length) return '<div class="empty-note">'+(session.clientQuery ? 'Ningún cliente coincide con la búsqueda.' : 'Todavía no hay clientes registrados.')+'</div>';
    return '<div class="clist-head"><span>Cliente</span><span>Turnos</span><span>Última visita</span><span>Cobrado</span><span>Deuda</span></div>' +
      list.map(function(c){
        var p = c.profile, owes = c.debt + c.toCollect;
        return '<button type="button" class="crow" data-client="'+esc(c.key)+'">' +
          '<span class="crow-who">'+clientAvatar(p, "sm")+'<span class="crow-txt"><b>'+esc(p.name)+' '+esc(p.lastname)+'</b>' +
            (p.nickname ? ' <span class="nick">“'+esc(p.nickname)+'”</span>' : '') +
            '<i>'+esc(p.phone || p.email || "")+'</i></span></span>' +
          '<span class="crow-c" data-l="Turnos">'+c.turnos+(c.cancelled ? ' <small>('+c.cancelled+' canc.)</small>' : '')+'</span>' +
          '<span class="crow-c" data-l="Última visita">'+(c.last ? shortDate(c.last.date) : (c.next ? 'Próximo '+shortDate(c.next.date) : '—'))+'</span>' +
          '<span class="crow-c" data-l="Cobrado">'+money(c.spent)+'</span>' +
          '<span class="crow-c" data-l="Deuda">'+(owes ? '<span class="owe">'+money(owes)+'</span>' : '—')+'</span>' +
          '</button>';
      }).join("");
  }

  function clienteDetalle(c){
    var p = c.profile;
    var tile = function(n, l){ return '<div class="stat-tile"><div class="num">'+n+'</div><div class="lbl">'+l+'</div></div>'; };
    var hist = c.bookings.slice().sort(function(a, b){ return (a.date + a.time) < (b.date + b.time) ? 1 : -1; });
    var line = function(k, v){ return v ? '<div class="summary-row"><span class="k">'+k+'</span><span class="v">'+v+'</span></div>' : ''; };

    var html = '<button class="link-btn" id="btnClientBack" type="button" style="margin-bottom:14px;">‹ Volver a clientes</button>' +
      '<div class="card cdetail-head">' + clientAvatar(p, "lg") +
        '<div class="cdetail-who"><h2>'+esc(p.name)+' '+esc(p.lastname)+(p.nickname ? ' <span class="nick">“'+esc(p.nickname)+'”</span>' : '')+'</h2>' +
        '<div class="sub">'+(p.phone ? esc(p.phone)+' · ' : '')+esc(p.email || "")+'</div>' +
        '<div class="cal-actions" style="justify-content:flex-start;">' +
          (p.phone ? '<a class="btn btn-wa btn-sm" href="https://wa.me/'+waNumber(p.phone)+'" target="_blank" rel="noopener">WhatsApp</a>' : '') +
          (p.email ? '<a class="btn btn-ghost btn-sm" href="mailto:'+esc(p.email)+'">Mail</a>' : '') +
        '</div></div></div>';

    html += '<div class="stat-grid">' +
      tile(c.turnos, 'Turnos') + tile(c.done, 'Realizados') + tile(c.cancelled, 'Cancelados') +
      tile(money(c.spent), 'Cobrado') + tile(money(c.toCollect), 'Por cobrar') + tile(money(c.debt), 'Deuda por cancelación') +
      '</div>';

    if(c.debtKeys.length){
      html += '<div class="debt-item"><div><div class="n">Tiene una seña pendiente por cancelar el mismo día</div>' +
        '<div class="cr" style="font-size:12px;color:var(--text-faint);">Se suma al próximo turno que reserve</div></div>' +
        '<div style="text-align:right;"><div class="amt">'+money(c.debt)+'</div>' +
        '<button class="btn btn-ghost btn-sm" style="margin-top:6px;" data-settle="'+esc(c.debtKeys[0])+'">Marcar pagado</button></div></div>';
    }

    html += '<div class="card"><h2>Hábitos</h2>' +
      line('Última visita', c.last ? formatDateLong(c.last.date) + ' · ' + c.last.time + ' hs' : '') +
      line('Próximo turno', c.next ? formatDateLong(c.next.date) + ' · ' + c.next.time + ' hs' : '') +
      line('Cada cuánto viene', c.gap ? 'cada ' + c.gap + ' días' : '') +
      line('Horario preferido', c.favTime ? c.favTime + ' hs' : '') +
      line('Medio de pago habitual', c.favPay ? payMethodLabel(c.favPay) : '') +
      (!c.turnos ? '<div class="empty-note">Todavía no reservó ningún turno.</div>' : '') +
      '</div>';

    html += '<div class="card"><h2>Historial de turnos</h2><div class="sub">'+hist.length+' en total</div>' +
      (hist.length ? '<div class="hist">' + hist.map(function(b){
        var label = b.status === "confirmed" ? "Confirmado" : b.status === "cancelled" ? "Cancelado" : "Completado";
        var total = b.price + (b.debtCharged || 0);
        return '<div class="hist-row'+(b.status === "cancelled" ? ' off' : '')+'">' +
          '<div class="hist-when"><b>'+formatDateLong(b.date)+'</b> · '+b.time+' hs</div>' +
          '<span class="badge '+b.status+'">'+label+'</span>' +
          '<div class="hist-pay">'+money(total)+' · '+payMethodLabel(b.payMethod || "local") +
            (b.status === "cancelled" ? '' : ' · <span class="paystate '+(b.paid ? 'ok' : 'pend')+'">'+(b.paid ? 'Pagado' : 'Pago pendiente')+'</span>') +
            (b.debtCharged ? ' · <span class="debt-tag">incluye '+money(b.debtCharged)+' de seña</span>' : '') + '</div>' +
          (b.status !== "cancelled" && !b.paid ? '<button class="btn btn-primary btn-sm" data-paid="'+b.id+'">Cobrado</button>' : '') +
          '</div>';
      }).join("") + '</div>' : '<div class="empty-note">Sin turnos.</div>') +
      '</div>';
    return html;
  }

  function bindClientRows(root){
    (root || document).querySelectorAll("[data-client]").forEach(function(el){
      el.onclick = function(){ session.clientDetail = el.getAttribute("data-client"); renderOwner(); window.scrollTo(0, 0); };
    });
  }

  function bindClientesEvents(){
    bindClientRows();
    var back = document.getElementById("btnClientBack");
    if(back) back.onclick = function(){ session.clientDetail = null; renderOwner(); };
    var search = document.getElementById("inpClientSearch");
    if(search) search.oninput = function(){
      session.clientQuery = search.value;
      var box = document.getElementById("clientList");
      box.innerHTML = clientListHtml();
      bindClientRows(box);
    };
    document.querySelectorAll("[data-csort]").forEach(function(el){
      el.onclick = function(){ session.clientSort = el.getAttribute("data-csort"); renderOwner(); };
    });
    document.querySelectorAll("[data-paid]").forEach(function(el){
      el.onclick = function(){ markPaid(el.getAttribute("data-paid")); };
    });
    document.querySelectorAll("[data-settle]").forEach(function(el){
      el.onclick = function(){ settleDebt(el.getAttribute("data-settle")); };
    });
  }

  // ================= PAGOS =================
  var PAY_RANGES = [
    {id: "mes",     label: "Este mes"},
    {id: "mesprev", label: "Mes anterior"},
    {id: "30d",     label: "Últimos 30 días"},
    {id: "90d",     label: "Últimos 90 días"},
    {id: "anio",    label: "Este año"},
    {id: "todo",    label: "Todo"}
  ];
  var PAY_METHOD_NAMES = {local: "En el local", transfer: "Transferencia", mp: "Mercado Pago"};
  var DOW_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

  function monthBounds(y, m){   // m = 0..11 (puede salirse de rango: se normaliza)
    var first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
    return {from: toISO(first), to: toISO(last)};
  }

  // períodos para comparar: el elegido y el anterior equivalente
  function payBounds(id){
    var now = new Date(), today = toISO(now), y = now.getFullYear(), m = now.getMonth(), cur, prev = null;
    // el mes en curso se compara con el mismo tramo (mismos días transcurridos) del mes anterior, no con el mes entero
    if(id === "mes"){
      cur = monthBounds(y, m); prev = monthBounds(y, m - 1);
      var pm = fromISO(prev.from), plast = new Date(pm.getFullYear(), pm.getMonth() + 1, 0).getDate();
      prev.to = toISO(new Date(pm.getFullYear(), pm.getMonth(), Math.min(now.getDate(), plast)));
    }
    else if(id === "mesprev"){ cur = monthBounds(y, m - 1); prev = monthBounds(y, m - 2); }
    else if(id === "30d"){ cur = {from: addDays(today, -29), to: today}; prev = {from: addDays(today, -59), to: addDays(today, -30)}; }
    else if(id === "90d"){ cur = {from: addDays(today, -89), to: today}; prev = {from: addDays(today, -179), to: addDays(today, -90)}; }
    else if(id === "anio"){ cur = {from: y + "-01-01", to: y + "-12-31"}; prev = {from: (y - 1) + "-01-01", to: toISO(new Date(y - 1, m, now.getDate()))}; }
    else cur = {from: "0000-01-01", to: "9999-12-31"};
    return {cur: cur, prev: prev, today: today};
  }

  function inRange(b, r){ return b.date >= r.from && b.date <= r.to; }
  function bTotal(b){ return b.price + (b.debtCharged || 0); }

  // totales de un conjunto de turnos
  function paySummary(list, today){
    var s = {paid: 0, cortes: 0, senas: 0, count: 0, toCollect: 0, toCollectCount: 0, byMethod: {local: 0, transfer: 0, mp: 0}, byDow: [0, 0, 0, 0, 0, 0, 0]};
    list.forEach(function(b){
      if(b.status === "cancelled") return;
      if(b.paid){
        s.paid += bTotal(b); s.cortes += b.price; s.senas += (b.debtCharged || 0); s.count++;
        s.byMethod[b.payMethod || "local"] = (s.byMethod[b.payMethod || "local"] || 0) + bTotal(b);
        s.byDow[fromISO(b.date).getDay()] += bTotal(b);
      } else if(b.date <= today){
        s.toCollect += bTotal(b); s.toCollectCount++;
      }
    });
    return s;
  }

  function pctChange(now, before){
    if(!before) return null;
    return Math.round((now - before) * 100 / before);
  }

  function payTile(num, lbl, sub, cls){
    return '<div class="stat-tile pay-tile'+(cls ? ' '+cls : '')+'"><div class="num">'+num+'</div><div class="lbl">'+lbl+'</div>'+(sub ? '<div class="pay-sub">'+sub+'</div>' : '')+'</div>';
  }

  // barras verticales: items = [{label, a, b}] (a = cortes, b = señas) apiladas
  function barChart(items, unit){
    var max = 0;
    items.forEach(function(it){ max = Math.max(max, it.a + (it.b || 0)); });
    if(!max) return '<div class="empty-note">Todavía no hay pagos para mostrar.</div>';
    return '<div class="bars">' + items.map(function(it){
      var tot = it.a + (it.b || 0), h = Math.round(tot * 100 / max), hb = tot ? Math.round((it.b || 0) * 100 / tot) : 0;
      return '<div class="bar-col" title="'+esc(it.label)+': '+money(tot)+(it.b ? ' (señas '+money(it.b)+')' : '')+'">' +
        '<span class="bar-val">'+(tot ? money(tot).replace(/\.000$/, "k") : '')+'</span>' +
        '<span class="bar-stack" style="height:calc((100% - 38px) * '+(Math.max(h, tot ? 3 : 0) / 100)+')">' +
          (it.b ? '<i class="bar-seal" style="height:'+hb+'%"></i>' : '') + '<i class="bar-main" style="height:'+(100 - hb)+'%"></i></span>' +
        '<span class="bar-lbl">'+esc(it.label)+'</span></div>';
    }).join("") + '</div>';
  }

  function methodBars(byMethod, total){
    var keys = ["local", "transfer", "mp"];
    if(!total) return '<div class="empty-note">Todavía no hay pagos para mostrar.</div>';
    return '<div class="hbars">' + keys.map(function(k){
      var v = byMethod[k] || 0, p = Math.round(v * 100 / total);
      return '<div class="hbar"><div class="hbar-top"><span>'+PAY_METHOD_NAMES[k]+'</span><b>'+money(v)+' <small>'+p+'%</small></b></div>' +
        '<span class="hbar-track"><i class="hbar-fill m-'+k+'" style="width:'+Math.max(p, v ? 2 : 0)+'%"></i></span></div>';
    }).join("") + '</div>';
  }

  function payChips(c){
    var chips = [];
    if(c.paidCount && !c.toCollect) chips.push('<span class="pchip ok">Pagado</span>');
    if(c.sealPaid) chips.push('<span class="pchip seal">Seña cobrada</span>');
    if(c.debt) chips.push('<span class="pchip warn">Señado · pendiente</span>');
    if(c.toCollect) chips.push('<span class="pchip due">Por cobrar</span>');
    return chips.length ? chips.join("") : '<span class="pchip none">Sin pagos</span>';
  }

  function ownerPagos(){
    var b = payBounds(session.payRange), today = b.today;
    var inCur = state.bookings.filter(function(x){ return inRange(x, b.cur); });
    var cur = paySummary(inCur, today);
    var prev = b.prev ? paySummary(state.bookings.filter(function(x){ return inRange(x, b.prev); }), today) : null;
    var delta = prev ? pctChange(cur.paid, prev.paid) : null;

    var pendingSeals = Object.keys(state.debts).length, pendingSealAmt = pendingSeals * currentPenalty();
    var totalDue = cur.paid + cur.toCollect;
    var collectRate = totalDue ? Math.round(cur.paid * 100 / totalDue) : 0;
    var avg = cur.count ? Math.round(cur.paid / cur.count) : 0;

    var html = '<div class="chips pay-ranges">' + PAY_RANGES.map(function(r){
      return '<button type="button" class="chip'+(session.payRange === r.id ? ' on' : '')+'" data-prange="'+r.id+'">'+r.label+'</button>';
    }).join("") + '</div>';

    html += '<div class="stat-grid pay-grid">' +
      payTile(money(cur.paid), 'Cobrado', delta === null ? '' : '<span class="delta '+(delta >= 0 ? 'up' : 'down')+'">'+(delta >= 0 ? '▲ ' : '▼ ')+Math.abs(delta)+'% vs '+(session.payRange === 'mes' || session.payRange === 'anio' ? 'mismo tramo anterior' : 'período anterior')+'</span>', 'pay-main') +
      payTile(money(cur.cortes), 'Cortes cobrados', cur.count + ' turnos pagados') +
      payTile(money(cur.senas), 'Señas cobradas', 'sumadas a turnos pagados') +
      payTile(money(cur.toCollect), 'Por cobrar', cur.toCollectCount + ' turnos ya realizados sin pagar', cur.toCollect ? 'is-warn' : '') +
      payTile(money(pendingSealAmt), 'Señas pendientes', pendingSeals + (pendingSeals === 1 ? ' cliente' : ' clientes') + ' por cancelar el mismo día', pendingSeals ? 'is-warn' : '') +
      payTile(money(avg), 'Ticket promedio', 'por turno pagado') +
      payTile(collectRate + '%', 'Tasa de cobro', 'cobrado sobre lo que ya correspondía') +
      payTile(String(cur.count), 'Turnos cobrados', inCur.filter(function(x){ return x.status === "cancelled"; }).length + ' cancelados en el período') +
      '</div>';

    // evolución de los últimos 6 meses (no depende del período elegido)
    var now = new Date(), months = [];
    for(var i = 5; i >= 0; i--){
      var mb = monthBounds(now.getFullYear(), now.getMonth() - i), md = fromISO(mb.from);
      var sm = paySummary(state.bookings.filter(function(x){ return inRange(x, mb); }), today);
      months.push({label: MONTHS[md.getMonth()].slice(0, 3), a: sm.cortes, b: sm.senas});
    }
    var dows = [1, 2, 3, 4, 5, 6, 0].map(function(d){ return {label: DOW_SHORT[d], a: cur.byDow[d], b: 0}; });

    html += '<div class="pay-charts">' +
      '<div class="card"><h2>Cobrado por mes</h2><div class="sub">Últimos 6 meses · <i class="lg lg-main"></i>cortes <i class="lg lg-seal"></i>señas</div>' + barChart(months) + '</div>' +
      '<div class="card"><h2>Medios de pago</h2><div class="sub">Cómo pagan en el período elegido</div>' + methodBars(cur.byMethod, cur.paid) + '</div>' +
      '<div class="card"><h2>Por día de la semana</h2><div class="sub">Cuándo se cobra más</div>' + barChart(dows) + '</div>' +
      '</div>';

    // detalle por persona
    var all = allClients(function(x){ return inRange(x, b.cur); });
    var q = session.payQuery.trim().toLowerCase();
    var list = all.filter(function(c){
      if(q){
        var p = c.profile, hay = (p.name + " " + p.lastname + " " + (p.nickname || "") + " " + (p.email || "")).toLowerCase();
        return hay.indexOf(q) >= 0 || (digitsOnly(q).length >= 3 && digitsOnly(p.phone).indexOf(digitsOnly(q)) >= 0);
      }
      return c.paidCount || c.toCollect || c.debt || c.sealPaid;
    });
    html += '<div class="card"><h2>Pagos por persona</h2><div class="sub">Qué pagó, qué señó y qué debe cada cliente en el período elegido (las señas pendientes son las de hoy)</div>' +
      '<input type="text" id="inpPaySearch" placeholder="Buscar por nombre, teléfono o mail" value="'+esc(session.payQuery)+'" autocomplete="off">' +
      '<div class="chips">' + [{id: "pagado", l: "Más pagó"}, {id: "debe", l: "Más debe"}, {id: "nombre", l: "A–Z"}].map(function(s){
        return '<button type="button" class="chip'+(session.paySort === s.id ? ' on' : '')+'" data-psort="'+s.id+'">'+s.l+'</button>';
      }).join("") + '</div>' +
      '<div id="payList">' + payListHtml(list) + '</div></div>';
    return html;
  }

  function payListHtml(list){
    var s = session.paySort;
    list = list.slice().sort(function(a, b){
      if(s === "nombre") return a.sortName < b.sortName ? -1 : 1;
      if(s === "debe") return ((b.debt + b.toCollect) - (a.debt + a.toCollect)) || (b.spent - a.spent);
      return (b.spent - a.spent) || (b.paidCount - a.paidCount);
    });
    if(!list.length) return '<div class="empty-note">No hay pagos para ese período o búsqueda.</div>';
    var tot = list.reduce(function(t, c){ t.spent += c.spent; t.seal += c.sealPaid; t.debt += c.debt; t.due += c.toCollect; return t; }, {spent: 0, seal: 0, debt: 0, due: 0});
    return '<div class="plist-head"><span>Cliente</span><span>Pagado</span><span>Seña cobrada</span><span>Seña pendiente</span><span>Por cobrar</span><span>Estado</span></div>' +
      list.map(function(c){
        var p = c.profile;
        return '<button type="button" class="prow" data-pclient="'+esc(c.key)+'">' +
          '<span class="crow-who">'+clientAvatar(p, "sm")+'<span class="crow-txt"><b>'+esc(p.name)+' '+esc(p.lastname)+'</b>' +
            (p.nickname ? ' <span class="nick">“'+esc(p.nickname)+'”</span>' : '') + '<i>'+c.paidCount+' '+(c.paidCount === 1 ? 'turno pagado' : 'turnos pagados')+'</i></span></span>' +
          '<span class="crow-c" data-l="Pagado">'+money(c.spent)+'</span>' +
          '<span class="crow-c" data-l="Seña cobrada">'+(c.sealPaid ? money(c.sealPaid) : '—')+'</span>' +
          '<span class="crow-c" data-l="Seña pendiente">'+(c.debt ? '<span class="owe">'+money(c.debt)+'</span>' : '—')+'</span>' +
          '<span class="crow-c" data-l="Por cobrar">'+(c.toCollect ? '<span class="owe">'+money(c.toCollect)+'</span>' : '—')+'</span>' +
          '<span class="crow-c pchips" data-l="Estado">'+payChips(c)+'</span></button>';
      }).join("") +
      '<div class="plist-total"><span>Total ('+list.length+' clientes)</span><span>'+money(tot.spent)+'</span><span>'+money(tot.seal)+'</span><span>'+money(tot.debt)+'</span><span>'+money(tot.due)+'</span><span></span></div>';
  }

  function bindPagosEvents(){
    document.querySelectorAll("[data-prange]").forEach(function(el){
      el.onclick = function(){ session.payRange = el.getAttribute("data-prange"); renderOwner(); };
    });
    document.querySelectorAll("[data-psort]").forEach(function(el){
      el.onclick = function(){ session.paySort = el.getAttribute("data-psort"); renderOwner(); };
    });
    var bindRows = function(root){
      root.querySelectorAll("[data-pclient]").forEach(function(el){
        el.onclick = function(){ session.ownerTab = "clientes"; session.clientDetail = el.getAttribute("data-pclient"); renderOwner(); window.scrollTo(0, 0); };
      });
    };
    bindRows(document);
    var search = document.getElementById("inpPaySearch");
    if(search) search.oninput = function(){
      session.payQuery = search.value;
      renderOwnerPaysList();
    };
  }
  // vuelve a dibujar solo la lista (sin perder el foco del buscador)
  function renderOwnerPaysList(){
    var box = document.getElementById("payList");
    if(!box) return;
    var b = payBounds(session.payRange), q = session.payQuery.trim().toLowerCase();
    var list = allClients(function(x){ return inRange(x, b.cur); }).filter(function(c){
      if(q){
        var p = c.profile, hay = (p.name + " " + p.lastname + " " + (p.nickname || "") + " " + (p.email || "")).toLowerCase();
        return hay.indexOf(q) >= 0 || (digitsOnly(q).length >= 3 && digitsOnly(p.phone).indexOf(digitsOnly(q)) >= 0);
      }
      return c.paidCount || c.toCollect || c.debt || c.sealPaid;
    });
    box.innerHTML = payListHtml(list);
    box.querySelectorAll("[data-pclient]").forEach(function(el){
      el.onclick = function(){ session.ownerTab = "clientes"; session.clientDetail = el.getAttribute("data-pclient"); renderOwner(); window.scrollTo(0, 0); };
    });
  }

  // ================= CONFIGURACIÓN =================
  function ownerConfig(){
    var user = CLOUD && window.cloudAuth ? cloudAuth.user() : null;
    var html = '<div class="card"><h2>Tu cuenta</h2>';
    if(CLOUD){
      html += '<div class="summary-row"><span class="k">Usuario</span><span class="v">'+esc(user ? user.email : "")+'</span></div>' +
        '<div class="sub" style="margin-top:14px;">Cambiar contraseña</div>' +
        '<label>Contraseña actual</label>' + pwField("inpPassCur", "Tu contraseña actual", "current-password") +
        '<label>Contraseña nueva</label>' + pwField("inpPassNew", "Mínimo 6 caracteres", "new-password") +
        '<label>Repetir contraseña nueva</label>' + pwField("inpPassNew2", "Repetila", "new-password") +
        '<button class="btn btn-primary" id="btnChangePass">Cambiar contraseña</button>' +
        '<div class="field-hint" style="margin-top:10px;">Si no te acordás de la actual, cerrá sesión y usá “Olvidé mi contraseña” en la pantalla de acceso.</div>';
    } else {
      html += '<div class="sub">Versión de prueba: se entra con un PIN. Podés cambiarlo en Precios → Acceso.</div>';
    }
    html += '</div>';

    html += '<div class="card"><h2>Sesión</h2>' +
      '<div class="sub">Cerrá sesión si usás una computadora que no es tuya.</div>' +
      '<button class="btn btn-ghost" id="btnConfigLogout">Cerrar sesión</button></div>';

    html += '<div class="card"><h2>Datos de ejemplo</h2>' +
      '<div class="sub">Cargá clientes, turnos y saldos inventados para ver cómo se ve el panel con actividad (clientes fieles, cancelaciones, deudas, recordatorios). ' +
      (CLOUD ? 'Solo se ven en este navegador: no se guardan en tu base ni los ven los clientes.' : 'Se guardan en este navegador.') + '</div>' +
      (hasExampleData()
        ? '<button class="btn btn-danger" id="btnDemoOff">Borrar datos de ejemplo</button>'
        : '<button class="btn btn-ghost" id="btnDemoOn">Cargar datos de ejemplo</button>') +
      '</div>';

    html += '<div class="card"><h2>Más ajustes</h2>' +
      '<div class="sub">Datos del local, horarios, precio y cierres se cambian desde sus secciones del menú.</div>' +
      '<div class="cal-actions" style="justify-content:flex-start;">' +
        '<button class="btn btn-ghost btn-sm" data-tab-go="negocio">Datos del local</button>' +
        '<button class="btn btn-ghost btn-sm" data-tab-go="horarios">Horarios</button>' +
        '<button class="btn btn-ghost btn-sm" data-tab-go="precios">Precio</button>' +
        '<a class="btn btn-ghost btn-sm" href="index.html" target="_blank" rel="noopener">Ver la app del cliente</a>' +
      '</div></div>';
    return html;
  }

  function bindConfigEvents(){
    var dOn = document.getElementById("btnDemoOn");
    if(dOn) dOn.onclick = function(){ loadExampleData(); renderOwner(); };
    var dOff = document.getElementById("btnDemoOff");
    if(dOff) dOff.onclick = function(){ askConfirm("Borrar datos de ejemplo", "¿Borrar los turnos y saldos de ejemplo? Los datos reales no se tocan.", function(){ clearExampleData(); renderOwner(); }); };
    var lo = document.getElementById("btnConfigLogout");
    if(lo) lo.onclick = function(){ var b = document.getElementById("btnLogout"); if(b) b.click(); };
    document.querySelectorAll("[data-tab-go]").forEach(function(el){
      el.onclick = function(){ session.ownerTab = el.getAttribute("data-tab-go"); renderOwner(); };
    });
    var cp = document.getElementById("btnChangePass");
    if(cp) cp.onclick = function(){
      var cur = document.getElementById("inpPassCur").value, nw = document.getElementById("inpPassNew").value, nw2 = document.getElementById("inpPassNew2").value;
      if(!cur){ showToast("Escribí tu contraseña actual."); return; }
      if(nw.length < 6){ showToast("La contraseña nueva tiene que tener al menos 6 caracteres."); return; }
      if(nw !== nw2){ showToast("Las contraseñas nuevas no coinciden."); return; }
      if(nw === cur){ showToast("La nueva tiene que ser distinta de la actual."); return; }
      cp.disabled = true; cp.textContent = "Cambiando...";
      cloudAuth.changePassword(cur, nw).then(function(){
        showToast("Contraseña cambiada.");
        ["inpPassCur", "inpPassNew", "inpPassNew2"].forEach(function(id){ document.getElementById(id).value = ""; });
      }).catch(function(e){
        showToast(e && (e.code === "auth/wrong-password" || e.code === "auth/invalid-credential") ? "La contraseña actual no es correcta." : authMessage(e));
      }).then(function(){ cp.disabled = false; cp.textContent = "Cambiar contraseña"; });
    };
  }

  render();
})();
