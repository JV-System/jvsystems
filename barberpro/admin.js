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
    weekCursor: toISO(new Date())
  };

  function render(){
    applyBranding("Administración");
    renderOwner();
  }
  // un cliente reservó desde otra pestaña: refrescar la agenda sin pisar formularios abiertos
  hooks.refresh = function(){
    applyBranding("Administración");
    if(session.ownerAuthed && (session.ownerTab==="agenda" || session.ownerTab==="saldos")) renderOwner();
  };

  // inició o cerró sesión (Firebase Authentication)
  hooks.authChanged = function(){
    session.ownerAuthed = !!(window.cloudAuth && cloudAuth.user());
    renderOwner();
  };

  function renderOwner(){
    var main = document.getElementById("main");
    if(!session.ownerAuthed){
      main.innerHTML = ownerLogin();
      bindOwnerLogin();
      return;
    }

    var unseen = state.bookings.filter(function(b){ return !b.seenByOwner && b.status==="confirmed"; }).length;
    var html = '<div class="owner-nav-row">' +
      '<div class="owner-nav-scroll"><div class="owner-nav">' +
        navBtn("agenda","Agenda", unseen) +
        navBtn("horarios","Horarios") +
        navBtn("cierres","Cierres") +
        navBtn("negocio","Negocio", needsSetup() ? "!" : 0) +
        navBtn("precios","Precios") +
        navBtn("saldos","Saldos", Object.keys(state.debts).length) +
      '</div></div>' +
      '<button class="btn-logout" id="btnLogout">Salir</button>' +
      '</div>';

    if(session.ownerTab==="agenda") html += ownerAgenda();
    else if(session.ownerTab==="horarios") html += ownerHorarios();
    else if(session.ownerTab==="cierres") html += ownerCierres();
    else if(session.ownerTab==="negocio") html += ownerNegocio();
    else if(session.ownerTab==="precios") html += ownerPrecios();
    else html += ownerSaldos();

    main.innerHTML = html;
    bindOwnerNav();

    if(session.ownerTab==="agenda"){
      markAllSeen();
      bindAgendaEvents();
    } else if(session.ownerTab==="horarios") bindHorariosEvents();
    else if(session.ownerTab==="cierres") bindCierresEvents();
    else if(session.ownerTab==="negocio") bindNegocioEvents();
    else if(session.ownerTab==="precios") bindPreciosEvents();
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

  function ownerLogin(){
    if(CLOUD){
      if(!cloudAuth.isReady()){
        return '<div class="card lockcard"><div class="lockicon">⏳</div><h2>Un momento...</h2><div class="sub">Verificando tu sesión</div></div>';
      }
      return '<div class="card lockcard">' +
        '<div class="lockicon">🔒</div>' +
        '<h2>Acceso del dueño</h2>' +
        '<div class="sub">Ingresá con tu mail y contraseña</div>' +
        '<input type="email" id="inpOwnerEmail" placeholder="tu@mail.com" autocomplete="username" autocapitalize="off" style="text-align:center;">' +
        '<input type="password" id="inpOwnerPass" placeholder="Contraseña" autocomplete="current-password" style="text-align:center;">' +
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
        if(!email || !pass){ showToast("Escribí tu mail y tu contraseña."); return; }
        btn.disabled = true; btn.textContent = "Ingresando...";
        cloudAuth.login(email, pass).catch(function(e){
          btn.disabled = false; btn.textContent = "Ingresar";
          showToast(authErrorMsg(e));
        });
      }
      btn.onclick = go;
      passEl.onkeydown = function(e){ if(e.key === "Enter") go(); };
      document.getElementById("btnOwnerReset").onclick = function(){
        var email = emailEl.value.trim();
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
      el.onclick = function(){ session.ownerTab = el.getAttribute("data-tab"); renderOwner(); };
    });
    var lo = document.getElementById("btnLogout");
    if(lo) lo.onclick = function(){
      if(CLOUD){ cloudAuth.logout(); return; }          // authChanged vuelve a dibujar la pantalla de acceso
      session.ownerAuthed=false; sessionStorage.removeItem(OWNER_KEY); renderOwner();
    };
  }

  function ownerAgenda(){
    var todayISO = toISO(new Date());
    var todays = state.bookings.filter(function(b){ return b.date===todayISO && b.status!=="cancelled"; });
    var toCollect = todays.filter(function(b){ return !b.paid; }).reduce(function(s,b){ return s + b.price + (b.debtCharged||0); }, 0);

    var html = '<div class="stat-row">' +
      '<div class="stat-tile"><div class="num">'+todays.length+'</div><div class="lbl">Turnos hoy</div></div>' +
      '<div class="stat-tile"><div class="num">'+money(toCollect)+'</div><div class="lbl">A cobrar hoy</div></div>' +
      '</div>';

    if(hasExampleData()){
      html += '<div class="notice info" style="align-items:center;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5m0 3h.01"/></svg>' +
        '<div>Estás viendo turnos de ejemplo para mostrar cómo se ve la agenda llena. <button id="btnClearExamples" style="background:none; border:none; color:var(--accent-1); font-weight:800; font-family:inherit; font-size:13px; cursor:pointer; padding:0; text-decoration:underline;">Borrarlos</button></div></div>';
    }

    html += reminderCard();

    html += '<div class="agenda-subnav">' +
      ['dia','semana','mes'].map(function(v){
        var lbl = v==='dia'?'Día':v==='semana'?'Gantt semanal':'Mes';
        return '<button class="agendaViewBtn'+(session.agendaView===v?' active':'')+'" data-v="'+v+'">'+lbl+'</button>';
      }).join('') + '</div>';

    if(session.agendaView==="dia") html += agendaDia();
    else if(session.agendaView==="semana") html += agendaSemana();
    else html += agendaMes();

    return html;
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
      html += list.map(bookingRow).join("");
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
      cells += '<div class="month-cell'+(other?' other':'')+(closed&&!other?' closed':'')+(iso===todayISO?' today':'')+'" '+(other?'':'data-jump="'+iso+'"')+'>' +
        '<div class="dn">'+d.getDate()+'</div>' +
        (count && !other ? '<div class="dot"></div>' : '') +
        '</div>';
    }
    return '<div class="nav-arrows">' +
      '<button data-mnav="-1">‹</button>' +
      '<div class="lbl">'+MONTHS[month]+' '+year+'</div>' +
      '<button data-mnav="1">›</button>' +
      '</div>' +
      '<div class="month-grid">'+cells+'</div>';
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

  render();
})();
