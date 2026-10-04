/* BarberPro Turnos - panel de administración del dueño.
   Depende de core.js (estado, utilidades, disponibilidad). */
(function(){
"use strict";
  // local (versión de prueba): "1" = dueño, "emp:<id>" = empleado
  var _lv = CLOUD ? null : sessionStorage.getItem(OWNER_KEY);
  var session = {
    ownerAuthed: CLOUD ? false : !!_lv,
    localRole: _lv && _lv.indexOf("emp:") === 0 ? "employee" : "owner",
    localBarber: _lv && _lv.indexOf("emp:") === 0 ? _lv.slice(4) : null,
    agendaBarber: "all",
    ownerTab: "hoy",          // al abrir el panel se ven las novedades del día
    agendaView: "dia",
    agendaDate: toISO(new Date()),
    monthCursor: toISO(new Date()),
    weekCursor: toISO(new Date()),
    clientDetail: null,      // clave del cliente cuya ficha se está viendo
    clientQuery: "",
    clientSort: "turnos",
    payRange: "mes",
    teamRange: "mes",
    moveFilter: "todos",
    moveQuery: "",
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
    if(t==="agenda" || t==="saldos" || t==="cobros" || t==="hoy") renderOwner();
    else if(t==="movimientos" && document.activeElement !== document.getElementById("inpMoveSearch")) renderOwner();
    else if(t==="equipo"){ var ae = document.activeElement; if(!(ae && ae.closest && ae.closest(".owner-content"))) renderOwner(); }
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

    if(isEmployee() && EMP_TABS.indexOf(session.ownerTab) < 0) session.ownerTab = "hoy";
    var unseen = bk().filter(function(b){ return !b.seenByOwner && b.status==="confirmed"; }).length;
    var cobrosCount = isEmployee() ? bk().filter(function(b){
      return b.status !== "cancelled" && ((b.deposit > 0 && depState(b) === "informed") || balState(b) === "informed" || (turnoEnded(b) && balanceDue(b) > 0));
    }).length : 0;
    var hoyBadge = hoyAttentionCount();
    var navHtml = isEmployee()
      ? navBtn("hoy","Hoy", hoyBadge) + navBtn("agenda","Mi agenda", unseen) + navBtn("cobros","Cobros", cobrosCount) + navBtn("movimientos","Movimientos") + navBtn("config","Mi cuenta")
      : navBtn("hoy","Hoy", hoyBadge) + navBtn("agenda","Agenda", unseen) +
        navBtn("clientes","Clientes") +
        navBtn("pagos","Pagos") +
        navBtn("movimientos","Movimientos") +
        navBtn("equipo","Equipo") +
        navBtn("horarios","Horarios") +
        navBtn("cierres","Cierres") +
        navBtn("negocio","Negocio", needsSetup() ? "!" : 0) +
        navBtn("precios","Precios") +
        navBtn("saldos","Saldos", Object.keys(state.debts).length) +
        navBtn("config","Configuración");
    var html = '<div class="owner-nav-row">' +
      (isEmployee() ? '<div class="whoami">'+barberAvatar(myBarber(), "")+'<div><b>'+esc((barberById(myBarber()) || {}).name || "Empleado")+'</b><i>Empleado</i></div></div>' : '') +
      '<div class="owner-nav-scroll"><div class="owner-nav">' + navHtml + '</div></div>' +
      '<button class="btn-logout" id="btnLogout">Salir</button>' +
      '</div>';

    html += '<div class="owner-content tab-' + session.ownerTab + '">';
    if(session.ownerTab==="hoy") html += ownerHoy();
    else if(session.ownerTab==="agenda") html += ownerAgenda();
    else if(session.ownerTab==="horarios") html += ownerHorarios();
    else if(session.ownerTab==="cierres") html += ownerCierres();
    else if(session.ownerTab==="negocio") html += ownerNegocio();
    else if(session.ownerTab==="precios") html += ownerPrecios();
    else if(session.ownerTab==="clientes") html += ownerClientes();
    else if(session.ownerTab==="pagos") html += ownerPagos();
    else if(session.ownerTab==="movimientos") html += ownerMovimientos();
    else if(session.ownerTab==="equipo") html += ownerEquipo();
    else if(session.ownerTab==="cobros") html += ownerCobros();
    else if(session.ownerTab==="config") html += ownerConfig();
    else html += ownerSaldos();
    html += '</div>';

    main.innerHTML = html;
    bindOwnerNav();
    bindPwEyes();
    document.querySelectorAll("[data-demo-on]").forEach(function(el){
      el.onclick = function(){ loadExampleData(); renderOwner(); };
    });

    if(session.ownerTab==="hoy") bindHoyEvents();
    else if(session.ownerTab==="agenda"){
      markAllSeen();
      bindAgendaEvents();
    } else if(session.ownerTab==="horarios") bindHorariosEvents();
    else if(session.ownerTab==="cierres") bindCierresEvents();
    else if(session.ownerTab==="negocio") bindNegocioEvents();
    else if(session.ownerTab==="precios") bindPreciosEvents();
    else if(session.ownerTab==="clientes") bindClientesEvents();
    else if(session.ownerTab==="pagos") bindPagosEvents();
    else if(session.ownerTab==="movimientos") bindMovimientosEvents();
    else if(session.ownerTab==="equipo") bindEquipoEvents();
    else if(session.ownerTab==="cobros") bindCobrosEvents();
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
      var pins = state.config.staffPins || {};
      var empId = Object.keys(pins).filter(function(id){ return pins[id] && pins[id] === pin && barberById(id) && barberById(id).role === "employee"; })[0];
      if(pin === state.config.ownerPin){
        session.ownerAuthed = true; session.localRole = "owner"; session.localBarber = null;
        sessionStorage.setItem(OWNER_KEY,"1");
        renderOwner();
      }else if(empId){
        session.ownerAuthed = true; session.localRole = "employee"; session.localBarber = empId;
        sessionStorage.setItem(OWNER_KEY,"emp:"+empId);
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
    if(isEmployee() || state.bookings.length || hasExampleData()) return "";
    return '<div class="card demo-cta"><h2>Todavía no hay turnos</h2>' +
      '<div class="sub">¿Querés ver cómo se ve el panel con actividad? Cargá clientes y turnos de ejemplo' + (CLOUD ? ' (solo en este navegador, no se guardan en tu base).' : '.') + '</div>' +
      '<button class="btn btn-primary" data-demo-on="1">Cargar datos de ejemplo</button></div>';
  }

  function ownerAgenda(){
    var todayISO = toISO(new Date());
    var todays = bk().filter(function(b){ return b.date===todayISO && b.status!=="cancelled"; });
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
    html += barberFilterHtml();

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
    var list = bk().filter(function(b){
      return b.status==="confirmed" && (b.date > today || (b.date===today && timeToMin(b.time) >= nowMin - 30));
    }).sort(function(a,b){ return (a.date+a.time) < (b.date+b.time) ? -1 : 1; }).slice(0, 8);
    return '<div class="card next-card"><h2>Próximos turnos</h2>' +
      (list.length ? list.map(function(b){
        return '<button type="button" class="next-row" data-jump="'+b.date+'">' +
          '<span class="next-when"><b>'+b.time+'</b>'+(b.date===today ? 'Hoy' : formatDateLong(b.date))+'</span>' +
          '<span class="next-who">'+esc(b.name)+' '+esc(b.lastname)+(!isEmployee() && activeBarbers().length > 1 && barberNameOf(b) ? ' <small>· '+esc(barberNameOf(b))+'</small>' : '')+'</span>' +
          (b.paid ? '<span class="paystate ok">Pagado</span>' : '') + '</button>';
      }).join("") : '<div class="empty-note">No hay turnos próximos.</div>') +
      '</div>';
  }

  // turnos de mañana: un toque por cliente abre WhatsApp o el mail con el recordatorio ya escrito
  function tomorrowBookings(){
    var t = addDays(toISO(new Date()), 1);
    return bk().filter(function(b){ return b.date===t && b.status==="confirmed"; })
      .sort(function(a,b){ return timeToMin(a.time)-timeToMin(b.time); });
  }
  function reminderCard(){
    var list = tomorrowBookings();
    if(!list.length) return "";
    var pending = list.filter(function(b){ return !b.reminded; }).length;
    return '<div class="card remind-card"><h2>Recordatorios de mañana</h2>' +
      '<div class="sub">'+(pending ? pending+' sin avisar de '+list.length : 'Todos avisados')+' · tocá para mandar el mensaje listo</div>' +
      '<button class="btn btn-primary" type="button" data-remind-all="1" style="margin-bottom:10px;">'+(pending ? 'Enviar recordatorios a todos ('+pending+')' : 'Volver a enviar a todos')+'</button>' +
      list.map(function(b){
        var who = esc(b.name)+' '+esc(b.lastname);
        return '<div class="remind-row'+(b.reminded?' done':'')+'">' +
          '<div class="remind-who"><b>'+b.time+'</b> '+who+(b.reminded?' <span class="remind-ok">✓ avisado</span>':'')+'</div>' +
          '<div class="remind-btns">' +
            (b.phone ? '<a class="btn btn-wa btn-sm" data-remind="'+b.id+'" data-rch="wa" href="'+reminderWaLink(b)+'" target="_blank" rel="noopener">WhatsApp</a>' : '') +
            (b.email ? '<a class="btn btn-ghost btn-sm" data-remind="'+b.id+'" data-rch="mail" href="'+reminderMailLink(b)+'">Mail</a>' : '') +
            (!b.phone && !b.email ? '<span class="remind-none">sin contacto</span>' : '') +
          '</div></div>';
      }).join('') + '</div>';
  }

  function agendaDia(){
    var iso = session.agendaDate;
    var list = bk().filter(function(b){ return b.date===iso; }).sort(function(a,b){ return timeToMin(a.time)-timeToMin(b.time); });
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

  var METHOD_NAMES = {local: "efectivo", cash: "efectivo", transfer: "transferencia", mp: "Mercado Pago"};

  function bookingRow(b){
    var badgeClass = b.status;
    var badgeLabel = b.status==="confirmed"?"Confirmado":b.status==="cancelled"?(b.lateCancel?"Suspendido":"Cancelado con aviso"):"Completado";
    var total = bookingTotal(b);
    var actions = "";
    if(b.status !== "cancelled"){
      actions = '<div class="actions">' + payActions(b) +
        (b.status==="confirmed" ? '<button class="btn btn-ghost btn-sm" data-complete="'+b.id+'">Completar</button>' +
                                   (isEmployee() ? '' : '<button class="btn btn-danger btn-sm" data-cancel="'+b.id+'">Cancelar</button>') : '') +
        (b.status==="confirmed" && !isEmployee() && turnoEnded(b) ? '<button class="btn btn-danger btn-sm" data-noshow="'+b.id+'">No vino</button>' : '') +
        (b.status==="confirmed" && !turnoEnded(b) && activeBarbers().length > 1 ? '<button class="btn btn-ghost btn-sm" data-transfer="'+b.id+'">Pasar a otro barbero</button>' : '') +
        (b.phone ? '<a class="btn btn-ghost btn-sm" href="https://wa.me/'+waNumber(b.phone)+'" target="_blank" rel="noopener">WhatsApp</a>' : "") +
        (b.email ? '<a class="btn btn-ghost btn-sm" href="mailto:'+esc(b.email)+'">Mail</a>' : "") +
        '</div>';
    } else if(depositKept(b) && !b.lateCancel){
      actions = '<div class="actions"><button class="btn btn-primary btn-sm" data-refund="'+b.id+'">Seña devuelta</button></div>';
    }
    return '<div class="booking-row">' +
      '<div class="top"><span class="time">'+b.time+'</span><span class="badge '+badgeClass+'">'+badgeLabel+'</span></div>' +
      '<div class="name">'+esc(b.name)+' '+esc(b.lastname)+(b.nickname?' <span class="nick">“'+esc(b.nickname)+'”</span>':'')+(b.isExample?'<span class="example-tag">Ejemplo</span>':'')+'</div>' +
      '<div class="sub">'+(b.phone?esc(b.phone)+' · ':'')+(b.email?esc(b.email)+' · ':'')+'<span class="price">'+money(total)+'</span>' +
      (!isEmployee() && activeBarbers().length > 1 && barberNameOf(b) ? ' · <span class="with-barber">con '+esc(barberNameOf(b))+'</span>' : '') +
      (b.rescheduled ? ' · <span class="with-barber">cambió de día (antes: '+shortDate(b.originalDate)+' '+esc(b.originalTime||"")+')</span>' : '') +
      (b.debtCharged?' <span class="debt-tag">(incluye '+money(b.debtCharged)+' de cargo anterior)</span>':'') +
      '</div>' + payLine(b) + actions +
      '</div>';
  }

  function stChip(st){
    return st === "paid" ? '<span class="paystate ok">pagada</span>' : st === "informed" ? '<span class="paystate info">avisó que pagó</span>' : '<span class="paystate pend">pendiente</span>';
  }

  // estado de la seña y del saldo de un turno
  function payLine(b){
    if(b.status === "cancelled"){
      if(!depositKept(b) && !(b.deposit > 0 && b.depositRefunded)) return "";
      return '<div class="payline">' + (b.depositRefunded ? '<span class="paystate ok">Seña devuelta</span>'
        : b.lateCancel ? '<span class="paystate pend">Seña retenida '+money(b.deposit)+' (canceló el mismo día)</span>'
        : '<span class="paystate info">Devolver seña '+money(b.deposit)+'</span>') + '</div>';
    }
    if(b.walkIn){              // orden de llegada: un solo pago, el total
      var bs0 = balState(b);
      return '<div class="payline"><span class="paychip walkin-chip">⚡ Orden de llegada</span><span class="paychip">Total '+money(bookingTotal(b))+'</span>' + stChip(bs0) +
        (bs0 !== "pending" && b.balanceMethod ? '<span class="paychip">'+METHOD_NAMES[b.balanceMethod]+'</span>' : '') + '</div>';
    }
    if(!(b.deposit > 0)){      // turno sin seña (o anterior a la seña): un solo pago
      return '<div class="payline"><span class="paychip">'+payMethodLabel(b.payMethod||"local")+'</span>' +
        '<span class="paystate '+(b.paid?'ok':'pend')+'">'+(b.paid?'Pagado':'Pago pendiente')+'</span></div>';
    }
    var ds = depState(b), bs = balState(b);
    return '<div class="payline">' +
      '<span class="paychip">Seña '+money(b.deposit)+'</span>' + stChip(ds) + (ds !== "pending" && b.payMethod ? '<span class="paychip">'+METHOD_NAMES[b.payMethod]+'</span>' : '') +
      '<span class="paychip">Saldo '+money(Math.max(0, bookingTotal(b) - b.deposit))+'</span>' + stChip(bs) + (bs !== "pending" && b.balanceMethod ? '<span class="paychip">'+METHOD_NAMES[b.balanceMethod]+'</span>' : '') +
      '</div>';
  }

  // botones de cobro: confirmar la seña, confirmar el saldo que avisó el cliente o cobrarlo en efectivo
  function payActions(b){
    var out = "", ds = depState(b), bs = balState(b);
    if(b.deposit > 0 && ds !== "paid"){
      out += '<button class="btn '+(ds === "informed" ? 'btn-primary' : 'btn-ghost')+' btn-sm" data-dep="'+b.id+'">'+(ds === "informed" ? 'Confirmar seña' : 'Seña recibida')+'</button>';
    }
    if(bs !== "paid"){
      if(bs === "informed") out += '<button class="btn btn-primary btn-sm" data-bal="'+b.id+'">Confirmar saldo</button>';
      out += '<button class="btn '+(bs === "informed" ? 'btn-ghost' : 'btn-primary')+' btn-sm" data-cash="'+b.id+'">Cobrado en efectivo</button>';
    }
    return out;
  }

  function findBooking(id){ return state.bookings.filter(function(x){ return x.id===id; })[0]; }

  // la seña llegó (por transferencia, Mercado Pago o en el local)
  function ownerDepositPaid(id){
    var b = findBooking(id); if(!b) return;
    updateBooking(id, {depositState: "paid", paid: balState(b) === "paid"});
    showToast("Seña confirmada.");
  }
  // el saldo se pagó: queda todo pagado y el turno se completa. method: "cash" | "mp" | "transfer"
  function ownerBalancePaid(id, method){
    var b = findBooking(id); if(!b) return;
    var patch = {depositState: "paid", balanceState: "paid", balanceMethod: method, paid: true, status: "completed"};
    updateBooking(id, patch);
    if(b.debtCharged > 0) settleDebt(b.clientKey);       // el cargo anterior que traía este turno queda saldado
    showToast(method === "cash" ? "Cobrado en efectivo. Turno completo." : "Pago confirmado. Turno completo.");
  }

  function bindPayActions(root){
    root = root || document;
    root.querySelectorAll("[data-transfer]").forEach(function(el){ el.onclick = function(){ transferFlow(el.getAttribute("data-transfer")); }; });
    root.querySelectorAll("[data-noshow]").forEach(function(el){
      el.onclick = function(){
        var id = el.getAttribute("data-noshow"), b = findBooking(id);
        askConfirm("Marcar como suspendido", "El cliente no vino ni avisó. " + (b && depositKept(b) ? "La seña ("+money(b.deposit)+") queda en el local." : "Como no pagó la seña, queda un cargo pendiente del 50% a su nombre.") + " ¿Lo marcamos?", function(){ cancelBooking(id, {noShow: true}); });
      };
    });
    root.querySelectorAll("[data-dep]").forEach(function(el){ el.onclick = function(){ ownerDepositPaid(el.getAttribute("data-dep")); }; });
    root.querySelectorAll("[data-bal]").forEach(function(el){
      el.onclick = function(){ var id = el.getAttribute("data-bal"), b = findBooking(id); ownerBalancePaid(id, (b && b.balanceMethod) || "transfer"); };
    });
    root.querySelectorAll("[data-cash],[data-paid]").forEach(function(el){
      el.onclick = function(){ ownerBalancePaid(el.getAttribute("data-cash") || el.getAttribute("data-paid"), "cash"); };
    });
    root.querySelectorAll("[data-refund]").forEach(function(el){
      el.onclick = function(){ updateBooking(el.getAttribute("data-refund"), {depositRefunded: true}); showToast("Seña marcada como devuelta."); };
    });
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
      viewBarbers().forEach(function(m){
        barberRanges(iso, m).forEach(function(r){
          var s=timeToMin(r.start), e=timeToMin(r.end);
          if(minStart===null||s<minStart) minStart=s;
          if(maxEnd===null||e>maxEnd) maxEnd=e;
        });
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
        var open = viewBarbers().some(function(m){ return barberRanges(iso, m).some(function(r){ return t>=timeToMin(r.start) && t<timeToMin(r.end); }); });
        var here = bk().filter(function(b){ return b.date===iso && b.time===timeLbl && b.status!=="cancelled"; }), booking = here[0];
        var cls = "gantt-cell" + (open?"":" closed") + (booking?" booked":"") + (iso===todayISO?" today":"");
        var content = booking ? '<span class="gantt-name">'+esc(booking.name)+' '+esc((booking.lastname||"").charAt(0))+'.'+(here.length > 1 ? ' <b class="gantt-more">+'+(here.length-1)+'</b>' : '')+'</span>' : "";
        var tip = here.map(function(b){ return esc(b.name)+' '+esc(b.lastname)+(activeBarbers().length > 1 && barberNameOf(b) ? ' ('+esc(barberNameOf(b))+')' : ''); }).join(' / ');
        row += '<div class="'+cls+'"'+(booking?' data-jump="'+iso+'" title="'+tip+' · '+timeLbl+'hs"':'')+'>'+content+'</div>';
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
    // capacidad = turnos que se pueden dar ese día: la suma de lo que atiende cada barbero según SU horario (y su tope por día)
    var cap = 0;
    viewBarbers().forEach(function(m){ cap += barberDayCapacity(m, iso); });
    if(!cap) return null;
    var pct = Math.min(100, Math.round(count * 100 / cap));
    return {total: cap, count: count, pct: pct, level: pct >= 85 ? "high" : pct >= 50 ? "mid" : "low"};   // alto = verde (agenda llena), bajo = rojo
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
      var count = bk().filter(function(b){ return b.date===iso && b.status!=="cancelled"; }).length;
      var closed = !viewBarbers().some(function(m){ return barberWorks(m, iso); });
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
      '<div class="gantt-legend occ-legend"><span><i class="occ-fill low"></i>Hasta 49% (flojo)</span><span><i class="occ-fill mid"></i>50 a 84%</span><span><i class="occ-fill high"></i>85% o más (lleno)</span></div>';
  }

  function bindAgendaEvents(){
    var ce = document.getElementById("btnClearExamples");
    if(ce) ce.onclick = function(){
      askConfirm("Borrar datos de ejemplo", "¿Borrar los turnos y saldos de ejemplo? Los turnos reales no se tocan.", clearExampleData);
    };
    document.querySelectorAll("[data-abarber]").forEach(function(el){
      el.onclick = function(){ session.agendaBarber = el.getAttribute("data-abarber"); renderOwner(); };
    });
    document.querySelectorAll(".agendaViewBtn").forEach(function(el){
      el.onclick = function(){ session.agendaView = el.getAttribute("data-v"); renderOwner(); };
    });
    bindReminders();
    bindPayActions();
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
      '<label>Link general de Mercado Pago <span class="opt">(opcional · se usa si no hay uno del monto exacto)</span></label><input type="text" id="inpPayMp" value="'+esc(c.payMpLink)+'" maxlength="200" placeholder="https://mpago.la/...">' +
      '<div class="field-hint">Un link de Mercado Pago cobra un monto fijo. Por eso abajo podés cargar uno por cada monto y la app le muestra al cliente el que coincide.</div>' +
      mpLinksHtml() +
      '<div class="field-hint">Los pagos los confirmás vos a mano desde la agenda (botón "Cobrado").</div>' +
      '<button class="btn btn-primary" id="btnSaveCobros">Guardar cobros</button></div>' +
      '<div class="card"><h2>Empezar de cero</h2>' +
      '<div class="sub">Borra todos los turnos, saldos y cierres cargados. No toca tus datos, horarios ni precio. Sirve para limpiar lo que se cargó probando la app.</div>' +
      '<button class="btn btn-danger" id="btnResetAll">Borrar todos los turnos</button></div>';
  }
  // links de Mercado Pago por monto, con los montos que hoy se cobran (seña, saldo y total) y si tienen link
  function mpLinksHtml(){
    var c = state.config, list = (Array.isArray(c.payMpLinks) ? c.payMpLinks : []).slice();
    var dep = depositFor(c.price), needs = [];
    if(dep > 0) needs.push(['Seña', dep]);
    needs.push([dep > 0 ? 'Saldo' : 'Total', c.price - dep]);
    if(dep > 0) needs.push(['Total (orden de llegada)', c.price]);
    var has = function(a){ return list.some(function(l){ return Math.round(Number(l.amount)) === a && l.url; }); };
    var html = '<label>Links de Mercado Pago por monto <span class="opt">(opcional)</span></label>' +
      '<div class="mpl-needs">' + needs.map(function(n){
        return '<span class="'+(has(n[1]) ? 'ok' : (c.payMpLink ? 'gen' : 'no'))+'">'+n[0]+' '+money(n[1])+' · '+(has(n[1]) ? 'link cargado' : (c.payMpLink ? 'usa el general' : 'sin link'))+'</span>';
      }).join('') + '</div><div id="mplRows">';
    if(!list.length) list.push({amount: "", url: ""});
    html += list.map(mplRow).join('') + '</div>' +
      '<button class="link-btn" type="button" id="btnMplAdd" style="margin:2px 0 10px;">+ Agregar otro link</button>';
    return html;
  }
  function mplRow(l){
    return '<div class="mpl-row"><input type="number" min="1" data-mpl-amount placeholder="Monto $" value="'+esc(String(l.amount === undefined || l.amount === null ? "" : l.amount))+'">' +
      '<input type="text" data-mpl-url placeholder="https://mpago.la/..." value="'+esc(l.url)+'">' +
      '<button type="button" class="link-btn link-out" data-mpl-del aria-label="Quitar">✕</button></div>';
  }
  function bindMplRows(){
    document.querySelectorAll("[data-mpl-del]").forEach(function(b){ b.onclick = function(){ b.closest(".mpl-row").remove(); }; });
  }

  function bindNegocioEvents(){
    bindMplRows();
    var addL = document.getElementById("btnMplAdd");
    if(addL) addL.onclick = function(){
      var t = document.createElement("div"); t.innerHTML = mplRow({amount: "", url: ""});
      document.getElementById("mplRows").appendChild(t.firstChild); bindMplRows();
    };
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
      var links = [], badLink = false;
      document.querySelectorAll(".mpl-row").forEach(function(r){
        var amt = parseInt(r.querySelector("[data-mpl-amount]").value, 10), url = r.querySelector("[data-mpl-url]").value.trim();
        if(!url && !amt) return;
        if(!(amt > 0) || !/^https:\/\//i.test(url)){ badLink = true; return; }
        links.push({amount: amt, url: url});
      });
      if(badLink){ showToast("Cada link necesita un monto y empezar con https://"); return; }
      state.config.payMpLink = mp;
      state.config.payMpLinks = links;
      saveState();
      renderOwner();
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
      '<label>Seña al reservar (% del precio)</label><input type="number" id="inpDeposit" min="0" max="100" value="'+(state.config.depositPercent === undefined ? 50 : state.config.depositPercent)+'">' +
      '<div class="field-hint">0 = sin seña. Con el precio actual, la seña es de '+money(depositFor(state.config.price))+' y el saldo de '+money(state.config.price - depositFor(state.config.price))+'. Si cancelan el mismo día, la seña queda en el local; si cancelan antes, se devuelve.</div>' +
      '<label>Orden de llegada (minutos)</label><input type="number" id="inpWalkIn" min="0" max="240" value="'+(state.config.walkInMinutes === undefined ? 90 : state.config.walkInMinutes)+'">' +
      '<div class="field-hint">Si hay un horario libre de hoy que empieza dentro de este tiempo, el cliente lo puede tomar al instante pagando el total (sin seña). 0 = no ofrecer.</div>' +
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
      var dp = parseInt(document.getElementById("inpDeposit").value, 10);
      state.config.depositPercent = isNaN(dp) ? 50 : Math.max(0, Math.min(100, dp));
      var wi = parseInt(document.getElementById("inpWalkIn").value, 10);
      state.config.walkInMinutes = isNaN(wi) ? 90 : Math.max(0, Math.min(240, wi));
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
    // cobrado = seña y/o saldo ya confirmados; la seña de un turno cancelado el mismo día también es plata cobrada
    var collectedList = valid.filter(function(b){ return collectedOf(b) > 0; });
    var retained = c.bookings.filter(function(b){ return b.status === "cancelled" && b.lateCancel && depositKept(b); });
    var sum = function(list, fn){ return list.reduce(function(s, b){ return s + fn(b); }, 0); };
    c.paidCount = collectedList.length;
    c.sealPaid = sum(valid, function(b){ return (b.deposit > 0 && depState(b) === "paid") ? b.deposit : 0; }) + sum(retained, function(b){ return b.deposit; });
    c.spent = sum(collectedList, collectedOf) + sum(retained, function(b){ return b.deposit; });
    c.depositDue = sum(valid, function(b){ return (b.deposit > 0 && depState(b) !== "paid") ? b.deposit : 0; });
    // señas según el estado del turno: por venir (señado), retenida (suspendido) y a devolver (canceló con aviso)
    var noticeList = c.bookings.filter(function(b){ return b.status === "cancelled" && !b.lateCancel; });
    c.depUpcoming = sum(valid, function(b){ return (b.deposit > 0 && depState(b) === "paid" && !turnoEnded(b)) ? b.deposit : 0; });
    c.depKept = sum(retained, function(b){ return b.deposit; });
    c.depRefund = sum(noticeList, function(b){ return (b.deposit > 0 && depState(b) === "paid" && !b.depositRefunded) ? b.deposit : 0; });
    c.cancelNotice = noticeList.length;
    c.suspended = c.bookings.filter(function(b){ return b.status === "cancelled" && b.lateCancel; }).length;
    c.toCollect = past.reduce(function(s, b){ return s + balanceDue(b); }, 0);
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
      tile(c.turnos, 'Turnos') + tile(c.done, 'Realizados') + tile(c.cancelNotice, 'Cancelados con aviso') + tile(c.suspended, 'Suspendidos') +
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
        var label = b.status === "confirmed" ? "Confirmado" : b.status === "cancelled" ? (b.lateCancel ? "Suspendido" : "Cancelado con aviso") : "Completado";
        var total = b.price + (b.debtCharged || 0);
        return '<div class="hist-row'+(b.status === "cancelled" ? ' off' : '')+'">' +
          '<div class="hist-when"><b>'+formatDateLong(b.date)+'</b> · '+b.time+' hs</div>' +
          '<span class="badge '+b.status+'">'+label+'</span>' +
          '<div class="hist-pay">'+money(total)+' · '+payMethodLabel(b.payMethod || "local") +
            (b.status === "cancelled" ? '' : ' · <span class="paystate '+(b.paid ? 'ok' : 'pend')+'">'+(b.paid ? 'Pagado' : 'Pago pendiente')+'</span>') +
            (b.debtCharged ? ' · <span class="debt-tag">incluye '+money(b.debtCharged)+' de seña</span>' : '') + '</div>' +
          (b.status !== "cancelled" && !b.paid ? '<button class="btn btn-primary btn-sm" data-cash="'+b.id+'">Cobrado en efectivo</button>' : '') +
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
    bindPayActions();
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
  var PAY_DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

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
  // cobrado = señas confirmadas + saldos confirmados (cortes = saldos, por compatibilidad con el nombre viejo)
  function paySummary(list, today){
    var s = {paid: 0, cortes: 0, senas: 0, count: 0, toCollect: 0, toCollectCount: 0, depositDue: 0, upcomingDep: 0, kept: 0, refund: 0, noticeCount: 0, suspCount: 0, byMethod: {local: 0, transfer: 0, mp: 0}, byDow: [0, 0, 0, 0, 0, 0, 0]};
    list.forEach(function(b){
      var dep = 0, bal = 0;
      if(b.status === "cancelled"){
        if(b.lateCancel){                                                 // suspendido: la seña queda en el local
          s.suspCount++;
          if(depositKept(b)){ dep = b.deposit; s.kept += b.deposit; }
        } else {                                                          // canceló con aviso: la seña se devuelve
          s.noticeCount++;
          if(b.deposit > 0 && depState(b) === "paid" && !b.depositRefunded) s.refund += b.deposit;
        }
      } else {
        dep = (b.deposit > 0 && depState(b) === "paid") ? b.deposit : 0;
        if(dep && !turnoEnded(b)) s.upcomingDep += dep;                   // señado: el turno todavía no se hizo
        bal = collectedOf(b) - dep;
        if(b.deposit > 0 && depState(b) !== "paid") s.depositDue += b.deposit;
        if(b.date <= today && balanceDue(b) > 0){ s.toCollect += balanceDue(b); s.toCollectCount++; }
      }
      var tot = dep + bal;
      if(!tot) return;
      s.paid += tot; s.senas += dep; s.cortes += bal;
      if(b.status !== "cancelled") s.count++;
      var depM = b.payMethod || "local", balM = b.balanceMethod === "cash" ? "local" : (b.balanceMethod || b.payMethod || "local");
      s.byMethod[depM] = (s.byMethod[depM] || 0) + dep;
      s.byMethod[balM] = (s.byMethod[balM] || 0) + bal;
      s.byDow[fromISO(b.date).getDay()] += tot;
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

  // tres listas separadas: señado (turno por venir), cancelado con aviso y suspendido
  function payStateLists(b){
    var today = b.today, groups = {senado: [], aviso: [], susp: []};
    allClients(function(x){ return inRange(x, b.cur); }).forEach(function(c){
      c.bookings.forEach(function(bk){
        var row = {c: c, b: bk};
        if(bk.status === "cancelled"){ (bk.lateCancel ? groups.susp : groups.aviso).push(row); }
        else if(bk.deposit > 0 && depState(bk) !== "pending" && !turnoEnded(bk)) groups.senado.push(row);
      });
    });
    var sorter = function(x, y){ return (x.b.date + x.b.time) < (y.b.date + y.b.time) ? -1 : 1; };
    var line = function(r, chip){
      var p = r.c.profile, wh = !isEmployee() && activeBarbers().length > 1 && barberNameOf(r.b) ? ' · '+esc(barberNameOf(r.b)) : '';
      return '<button type="button" class="slrow" data-pclient="'+esc(r.c.key)+'"><span class="sl-who"><b>'+esc(p.name)+' '+esc(p.lastname)+'</b>' +
        '<i>'+formatDateLong(r.b.date)+' · '+r.b.time+' hs'+wh+'</i></span><span class="sl-chip">'+chip+'</span></button>';
    };
    var col = function(title, sub, rows, mk){
      return '<div class="card sl-card"><h2>'+title+' <span class="count-pill">'+rows.length+'</span></h2><div class="sub">'+sub+'</div>' +
        (rows.length ? rows.sort(sorter).map(mk).join("") : '<div class="empty-note">Ninguno en este período.</div>') + '</div>';
    };
    return '<div class="sl-grid">' +
      col("Señados", "Pagaron la seña y su turno todavía no se hizo", groups.senado, function(r){
        return line(r, '<span class="pchip seal">'+money(r.b.deposit)+(depState(r.b) === "informed" ? ' · avisó' : '')+'</span>');
      }) +
      col("Cancelados con aviso", "Avisaron con tiempo: la seña se devuelve", groups.aviso, function(r){
        var d = r.b.deposit > 0 && depState(r.b) === "paid";
        return line(r, d ? (r.b.depositRefunded ? '<span class="pchip ok">Seña devuelta</span>' : '<span class="pchip warn">Devolver '+money(r.b.deposit)+'</span>') : '<span class="pchip none">Sin seña</span>');
      }) +
      col("Suspendidos", "No vinieron o cancelaron el mismo día", groups.susp, function(r){
        return line(r, depositKept(r.b) ? '<span class="pchip due">Seña retenida '+money(r.b.deposit)+'</span>' : '<span class="pchip due">Sin seña · cargo</span>');
      }) +
      '</div>';
  }

  function payChips(c){
    var chips = [];
    if(c.paidCount && !c.toCollect && !c.depositDue) chips.push('<span class="pchip ok">Pagado</span>');
    if(c.depUpcoming) chips.push('<span class="pchip seal">Señado</span>');
    if(c.cancelNotice) chips.push('<span class="pchip none">Cancelado con aviso</span>');
    if(c.suspended) chips.push('<span class="pchip due">Suspendido</span>');
    if(c.depositDue) chips.push('<span class="pchip warn">Seña pendiente</span>');
    if(c.toCollect) chips.push('<span class="pchip due">Debe saldo</span>');
    if(c.debt) chips.push('<span class="pchip warn">Cargo por cancelación</span>');
    return chips.length ? chips.join("") : '<span class="pchip none">Sin pagos</span>';
  }

  function ownerPagos(){
    var b = payBounds(session.payRange), today = b.today;
    var inCur = state.bookings.filter(function(x){ return inRange(x, b.cur); });
    var cur = paySummary(inCur, today);
    var prev = b.prev ? paySummary(state.bookings.filter(function(x){ return inRange(x, b.prev); }), today) : null;
    var delta = prev ? pctChange(cur.paid, prev.paid) : null;

    var pendingSeals = Object.keys(state.debts).length, pendingSealAmt = pendingSeals * currentPenalty();
    var totalDue = cur.paid + cur.toCollect + cur.depositDue;
    var collectRate = totalDue ? Math.round(cur.paid * 100 / totalDue) : 0;
    var avg = cur.count ? Math.round(cur.paid / cur.count) : 0;

    var html = '<div class="chips pay-ranges">' + PAY_RANGES.map(function(r){
      return '<button type="button" class="chip'+(session.payRange === r.id ? ' on' : '')+'" data-prange="'+r.id+'">'+r.label+'</button>';
    }).join("") + '</div>';

    html += '<div class="stat-grid pay-grid">' +
      payTile(money(cur.paid), 'Cobrado', delta === null ? '' : '<span class="delta '+(delta >= 0 ? 'up' : 'down')+'">'+(delta >= 0 ? '▲ ' : '▼ ')+Math.abs(delta)+'% vs '+(session.payRange === 'mes' || session.payRange === 'anio' ? 'mismo tramo anterior' : 'período anterior')+'</span>', 'pay-main') +
      payTile(money(cur.upcomingDep), 'Señado · turnos por venir', 'señas pagadas de turnos que todavía faltan') +
      payTile(money(cur.cortes), 'Saldos cobrados', cur.count + ' turnos con pagos · al terminar el corte') +
      payTile(money(cur.kept), 'Señas retenidas', cur.suspCount + (cur.suspCount === 1 ? ' turno suspendido' : ' turnos suspendidos') + ' (no vinieron o cancelaron el mismo día)') +
      payTile(money(cur.refund), 'Señas a devolver', cur.noticeCount + (cur.noticeCount === 1 ? ' turno cancelado con aviso' : ' turnos cancelados con aviso'), cur.refund ? 'is-warn' : '') +
      payTile(money(cur.depositDue), 'Señas por cobrar', 'turnos reservados que todavía no pagaron la seña', cur.depositDue ? 'is-warn' : '') +
      payTile(money(cur.toCollect), 'Saldos por cobrar', cur.toCollectCount + ' turnos ya realizados sin pagar', cur.toCollect ? 'is-warn' : '') +
      payTile(money(pendingSealAmt), 'Cargos pendientes', pendingSeals + (pendingSeals === 1 ? ' cliente' : ' clientes') + ' por cancelar el mismo día sin seña', pendingSeals ? 'is-warn' : '') +
      payTile(money(avg), 'Ticket promedio', 'por turno con pagos') +
      payTile(collectRate + '%', 'Tasa de cobro', 'cobrado sobre lo que ya correspondía') +
      '</div>';

    // evolución de los últimos 6 meses (no depende del período elegido)
    var now = new Date(), months = [];
    for(var i = 5; i >= 0; i--){
      var mb = monthBounds(now.getFullYear(), now.getMonth() - i), md = fromISO(mb.from);
      var sm = paySummary(state.bookings.filter(function(x){ return inRange(x, mb); }), today);
      months.push({label: MONTHS[md.getMonth()].slice(0, 3), a: sm.cortes, b: sm.senas});
    }
    var dows = [1, 2, 3, 4, 5, 6, 0].map(function(d){ return {label: PAY_DOW[d], a: cur.byDow[d], b: 0}; });

    html += '<div class="pay-charts">' +
      '<div class="card"><h2>Cobrado por mes</h2><div class="sub">Últimos 6 meses · <i class="lg lg-main"></i>saldos <i class="lg lg-seal"></i>señas</div>' + barChart(months) + '</div>' +
      '<div class="card"><h2>Medios de pago</h2><div class="sub">Cómo pagan en el período elegido</div>' + methodBars(cur.byMethod, cur.paid) + '</div>' +
      '<div class="card"><h2>Por día de la semana</h2><div class="sub">Cuándo se cobra más</div>' + barChart(dows) + '</div>' +
      '</div>';

    html += payStateLists(b);

    // detalle por persona
    var all = allClients(function(x){ return inRange(x, b.cur); });
    var q = session.payQuery.trim().toLowerCase();
    var list = all.filter(function(c){
      if(q){
        var p = c.profile, hay = (p.name + " " + p.lastname + " " + (p.nickname || "") + " " + (p.email || "")).toLowerCase();
        return hay.indexOf(q) >= 0 || (digitsOnly(q).length >= 3 && digitsOnly(p.phone).indexOf(digitsOnly(q)) >= 0);
      }
      return c.paidCount || c.toCollect || c.debt || c.sealPaid || c.depositDue;
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
      if(s === "debe") return ((b.debt + b.toCollect + b.depositDue) - (a.debt + a.toCollect + a.depositDue)) || (b.spent - a.spent);
      return (b.spent - a.spent) || (b.paidCount - a.paidCount);
    });
    if(!list.length) return '<div class="empty-note">No hay pagos para ese período o búsqueda.</div>';
    var tot = list.reduce(function(t, c){ t.spent += c.spent; t.up += c.depUpcoming; t.kept += c.depKept; t.refund += c.depRefund; t.due += c.toCollect; return t; }, {spent: 0, up: 0, kept: 0, refund: 0, due: 0});
    return '<div class="plist-head"><span>Cliente</span><span>Pagado</span><span>Señado (por venir)</span><span>Seña retenida</span><span>Seña a devolver</span><span>Saldo por cobrar</span><span>Estado</span></div>' +
      list.map(function(c){
        var p = c.profile;
        return '<button type="button" class="prow" data-pclient="'+esc(c.key)+'">' +
          '<span class="crow-who">'+clientAvatar(p, "sm")+'<span class="crow-txt"><b>'+esc(p.name)+' '+esc(p.lastname)+'</b>' +
            (p.nickname ? ' <span class="nick">“'+esc(p.nickname)+'”</span>' : '') + '<i>'+c.paidCount+' '+(c.paidCount === 1 ? 'turno pagado' : 'turnos pagados')+'</i></span></span>' +
          '<span class="crow-c" data-l="Pagado">'+money(c.spent)+'</span>' +
          '<span class="crow-c" data-l="Señado (por venir)">'+(c.depUpcoming ? money(c.depUpcoming) : '—')+'</span>' +
          '<span class="crow-c" data-l="Seña retenida">'+(c.depKept ? '<span class="owe">'+money(c.depKept)+'</span>' : '—')+'</span>' +
          '<span class="crow-c" data-l="Seña a devolver">'+(c.depRefund ? '<span class="owe">'+money(c.depRefund)+'</span>' : '—')+'</span>' +
          '<span class="crow-c" data-l="Saldo por cobrar">'+(c.toCollect ? '<span class="owe">'+money(c.toCollect)+'</span>' : '—')+'</span>' +
          '<span class="crow-c pchips" data-l="Estado">'+payChips(c)+'</span></button>';
      }).join("") +
      '<div class="plist-total"><span>Total ('+list.length+' clientes)</span><span>'+money(tot.spent)+'</span><span>'+money(tot.up)+'</span><span>'+money(tot.kept)+'</span><span>'+money(tot.refund)+'</span><span>'+money(tot.due)+'</span><span></span></div>';
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
      return c.paidCount || c.toCollect || c.debt || c.sealPaid || c.depositDue;
    });
    box.innerHTML = payListHtml(list);
    box.querySelectorAll("[data-pclient]").forEach(function(el){
      el.onclick = function(){ session.ownerTab = "clientes"; session.clientDetail = el.getAttribute("data-pclient"); renderOwner(); window.scrollTo(0, 0); };
    });
  }

  // ================= EQUIPO Y ROLES =================
  var EMP_TABS = ["hoy", "agenda", "cobros", "movimientos", "config"];       // lo que ve un empleado: su agenda, sus cobros y su cuenta
  function curRole(){ return CLOUD ? (cloudAuth.role() || "owner") : session.localRole; }
  function myBarber(){ return CLOUD ? cloudAuth.barberId() : session.localBarber; }
  function isEmployee(){ return curRole() === "employee"; }

  // reservas que se ven: el empleado solo las de su barbero; el dueño todas o las del barbero elegido en el filtro
  function bk(){
    var list = state.bookings;
    if(isEmployee()){ var me = myBarber(); return list.filter(function(b){ return barberOfBooking(b) === me; }); }
    var f = session.agendaBarber;
    if(!f || f === "all") return list;
    return list.filter(function(b){ return barberOfBooking(b) === f; });
  }

  // barberos que cuentan en la vista actual: el empleado, solo él; el dueño, todos o el del filtro
  function viewBarbers(){
    if(isEmployee()){ var me = barberById(myBarber()); return me ? [me] : activeBarbers(); }
    var f = session.agendaBarber;
    if(f && f !== "all"){ var m = barberById(f); if(m) return [m]; }
    return activeBarbers();
  }

  function barberNameOf(b){
    var m = barberById(barberOfBooking(b));
    return (m && m.name) || b.barberName || "";
  }

  // filtro por barbero (solo dueño y solo si hay más de uno)
  function barberFilterHtml(){
    if(isEmployee() || activeBarbers().length < 2) return "";
    var opts = [{id: "all", name: "Todos"}].concat(activeBarbers());
    return '<div class="chips barber-filter">' + opts.map(function(m){
      return '<button type="button" class="chip'+(session.agendaBarber === m.id ? ' on' : '')+'" data-abarber="'+esc(m.id)+'">'+esc(m.name)+'</button>';
    }).join("") + '</div>';
  }

  // avatar de un barbero: su foto o la inicial
  function barberAvatar(id, size){
    var m = barberById(id), cls = "avatar" + (size ? " " + size : ""), photo = barberPhoto(id);
    if(photo) return '<img class="'+cls+'" src="'+esc(photo)+'" alt="">';
    return '<span class="'+cls+'">'+esc(((m && m.name) || "?").trim().charAt(0).toUpperCase())+'</span>';
  }

  // bloque para cambiar la foto (la ven el equipo y los clientes al elegir con quién cortarse)
  function photoEditHtml(id, title){
    var has = !!barberPhoto(id);
    return '<div class="avatar-edit">' + barberAvatar(id, "lg") +
      '<div class="avatar-btns"><button class="link-btn" type="button" data-photo-pick="'+esc(id)+'">'+(has ? 'Cambiar foto' : 'Agregar foto')+'</button>' +
      (has ? '<button class="link-btn link-out" type="button" data-photo-del="'+esc(id)+'">Quitar</button>' : '') +
      '<input type="file" accept="image/*" hidden data-photo-file="'+esc(id)+'"></div></div>';
  }

  function bindPhotoControls(){
    document.querySelectorAll("[data-photo-pick]").forEach(function(el){
      el.onclick = function(){ var f = document.querySelector('[data-photo-file="'+el.getAttribute("data-photo-pick")+'"]'); if(f) f.click(); };
    });
    document.querySelectorAll("[data-photo-file]").forEach(function(inp){
      inp.onchange = function(){
        var id = inp.getAttribute("data-photo-file"), f = inp.files && inp.files[0];
        if(!f) return;
        if(f.type && f.type.indexOf("image/") !== 0){ showToast("Elegí una imagen (JPG o PNG)."); return; }
        readPhoto(f).then(function(url){ return saveBarberPhoto(id, url); })
          .then(function(){ showToast("Foto guardada."); renderOwner(); })
          .catch(function(e){ console.error(e); showToast("No se pudo guardar la foto. Probá con otra imagen."); });
      };
    });
    document.querySelectorAll("[data-photo-del]").forEach(function(el){
      el.onclick = function(){
        saveBarberPhoto(el.getAttribute("data-photo-del"), "").then(function(){ showToast("Foto quitada."); renderOwner(); })
          .catch(function(e){ console.error(e); showToast("No se pudo quitar la foto."); });
      };
    });
  }

  // ---------- cortes por barbero (dueño) ----------
  function teamStatsHtml(){
    var b = payBounds(session.teamRange), today = b.today;
    var done = function(x){ return x.status === "completed"; };
    var rows = teamList().map(function(m){
      var mine = function(x){ return barberOfBooking(x) === m.id; };
      var list = state.bookings.filter(function(x){ return mine(x) && inRange(x, b.cur); });
      var prev = b.prev ? state.bookings.filter(function(x){ return mine(x) && inRange(x, b.prev); }) : null;
      var sm = paySummary(list, today);
      return {m: m, cortes: list.filter(done).length, prev: prev ? prev.filter(done).length : null,
        porVenir: list.filter(function(x){ return x.status === "confirmed" && !turnoEnded(x); }).length,
        sinCerrar: list.filter(function(x){ return x.status === "confirmed" && turnoEnded(x); }).length,
        aviso: list.filter(function(x){ return x.status === "cancelled" && !x.lateCancel; }).length,
        susp: list.filter(function(x){ return x.status === "cancelled" && x.lateCancel; }).length,
        cobrado: sm.paid, ticket: sm.count ? Math.round(sm.paid / sm.count) : 0};
    });
    var total = rows.reduce(function(t, r){ return t + r.cortes; }, 0);
    var max = rows.reduce(function(t, r){ return Math.max(t, r.cortes); }, 0);
    var ranked = rows.slice().sort(function(x, y){ return y.cortes - x.cortes; });

    var html = '<div class="chips pay-ranges">' + PAY_RANGES.map(function(r){
      return '<button type="button" class="chip'+(session.teamRange === r.id ? ' on' : '')+'" data-trange="'+r.id+'">'+r.label+'</button>';
    }).join("") + '</div>';

    html += '<div class="card"><h2>Cortes por barbero</h2><div class="sub">Turnos completados en el período · '+total+(total === 1 ? ' corte' : ' cortes')+' en total</div>' +
      (total ? '<div class="hbars">' + ranked.map(function(r, i){
        var p = total ? Math.round(r.cortes * 100 / total) : 0;
        return '<div class="hbar"><div class="hbar-top"><span class="rk-who">'+(i === 0 && r.cortes ? '🏆 ' : '')+barberAvatar(r.m.id, "xs")+' '+esc(r.m.name)+'</span><b>'+r.cortes+' <small>'+p+'%</small></b></div>' +
          '<span class="hbar-track"><i class="hbar-fill" style="width:'+Math.max(r.cortes ? 3 : 0, max ? Math.round(r.cortes * 100 / max) : 0)+'%"></i></span></div>';
      }).join("") + '</div>' : '<div class="empty-note">Todavía no hay cortes completados en este período.</div>') + '</div>';

    html += '<div class="team-grid">' + rows.map(function(r){
      var delta = r.prev === null ? null : pctChange(r.cortes, r.prev);
      return '<div class="card tcard">' +
        '<div class="tcard-head">' + barberAvatar(r.m.id, "") + '<div><b>'+esc(r.m.name)+'</b><i>'+(r.m.role === "owner" ? 'Dueño' : 'Empleado')+(r.m.active === false ? ' · no atiende' : '')+'</i></div></div>' +
        '<div class="tcard-num"><span class="num">'+r.cortes+'</span><span class="lbl">cortes</span>' +
          (delta === null ? '' : '<span class="delta '+(delta >= 0 ? 'up' : 'down')+'">'+(delta >= 0 ? '▲ ' : '▼ ')+Math.abs(delta)+'% vs anterior</span>') + '</div>' +
        '<div class="summary-row"><span class="k">Turnos por venir</span><span class="v">'+r.porVenir+'</span></div>' +
        (r.sinCerrar ? '<div class="summary-row"><span class="k">Pasaron sin cerrar</span><span class="v" style="color:var(--warn)">'+r.sinCerrar+'</span></div>' : '') +
        '<div class="summary-row"><span class="k">Cancelados con aviso</span><span class="v">'+r.aviso+'</span></div>' +
        '<div class="summary-row"><span class="k">Suspendidos</span><span class="v">'+r.susp+'</span></div>' +
        '<div class="summary-row"><span class="k">Cobrado</span><span class="v">'+money(r.cobrado)+'</span></div>' +
        '<div class="summary-row"><span class="k">Ticket promedio</span><span class="v">'+money(r.ticket)+'</span></div>' +
        '</div>';
    }).join("") + '</div>';
    return html;
  }

  // ---------- cobros pendientes (empleado) ----------
  function ownerCobros(){
    var list = bk().filter(function(b){ return b.status !== "cancelled"; });
    var sorter = function(a, b){ return (a.date + a.time) < (b.date + b.time) ? -1 : 1; };
    var confirmar = list.filter(function(b){ return (b.deposit > 0 && depState(b) === "informed") || balState(b) === "informed"; }).sort(sorter);
    var saldos = list.filter(function(b){ return confirmar.indexOf(b) < 0 && turnoEnded(b) && balanceDue(b) > 0; }).sort(sorter);
    var senas = list.filter(function(b){ return confirmar.indexOf(b) < 0 && !turnoEnded(b) && b.deposit > 0 && depState(b) === "pending"; }).sort(sorter);
    var section = function(title, sub, items){
      return '<div class="card"><h2>'+title+' <span class="count-pill">'+items.length+'</span></h2><div class="sub">'+sub+'</div>' +
        (items.length ? items.map(function(b){ return '<div class="cobro-date">'+formatDateLong(b.date)+'</div>'+bookingRow(b); }).join("") : '<div class="empty-note">Nada por acá.</div>') + '</div>';
    };
    return section("Para confirmar", "El cliente avisó que pagó: confirmalo al ver el pago", confirmar) +
      section("Saldos por cobrar", "Turnos que ya terminaron y tienen saldo pendiente", saldos) +
      section("Señas pendientes", "Turnos reservados que todavía no pagaron la seña", senas);
  }
  function bindCobrosEvents(){
    bindPayActions();
    document.querySelectorAll("[data-complete]").forEach(function(el){
      el.onclick = function(){ completeBooking(el.getAttribute("data-complete")); };
    });
  }

  // ---------- Equipo (dueño) ----------
  function staffRecordFor(id){ return (state.staff || []).filter(function(s){ return s.barberId === id; })[0]; }

  // horario de trabajo de un barbero: igual al del local o uno propio (por día, hasta 2 tramos)
  function tmShift(id, dayKey, shiftKey, label, shift, off){
    var key = id + "|" + dayKey + "|" + shiftKey, dis = off || !shift.active;
    return '<div class="hours-shift'+(shift.active ? '' : ' disabled')+'"><span class="shiftname">'+label+'</span>' +
      '<input type="checkbox" data-tmh-a="'+esc(key)+'" '+(shift.active ? 'checked' : '')+(off ? ' disabled' : '')+'>' +
      '<input type="time" data-tmh-s="'+esc(key)+'" value="'+shift.start+'"'+(dis ? ' disabled' : '')+'>' +
      '<input type="time" data-tmh-e="'+esc(key)+'" value="'+shift.end+'"'+(dis ? ' disabled' : '')+'></div>';
  }
  function memberHoursHtml(m){
    var custom = !!m.hours, base = m.hours || state.config.hours;
    var rows = DOW_KEYS.filter(function(k){ return k !== "sun"; }).concat(["sun"]).map(function(k){
      var day = base[k] || state.config.hours[k];
      return '<div class="hours-day"><div class="dlabel">'+DOW_LABEL[k]+'</div>' +
        tmShift(m.id, k, "morning", "Horario", day.morning, !custom) + tmShift(m.id, k, "afternoon", "Horario 2", day.afternoon, !custom) + '</div>';
    }).join("");
    return '<label>Horario de trabajo</label>' +
      '<label class="checkline"><input type="checkbox" data-tm-same="'+esc(m.id)+'" '+(custom ? '' : 'checked')+'><span>Igual al horario del local</span></label>' +
      '<details class="tm-hours" '+(custom ? 'open' : '')+'><summary>Ver o cambiar el horario de '+esc(m.name)+'</summary>'+rows+
      '<div class="field-hint">Cada barbero puede tener su propio horario. Dos barberos pueden tener turnos a la misma hora: cada uno atiende a un cliente distinto.</div></details>';
  }

  function ownerEquipo(){
    var team = teamList();
    var html = teamStatsHtml() + '<div class="card"><h2>Equipo</h2>' +
      '<div class="sub">Quiénes atienden. El cliente elige con quién cortarse al reservar y el aviso del turno le llega al WhatsApp de ese barbero. ' +
      'Los empleados entran al panel con su usuario y ven solo su agenda, sus cobros pendientes y su cuenta (no ven el análisis de dinero ni nada del dueño).</div>';
    html += team.map(function(m){
      var emp = m.role === "employee", rec = emp && CLOUD ? staffRecordFor(m.id) : null;
      var pin = !CLOUD && emp ? ((state.config.staffPins || {})[m.id] || "") : "";
      var access = "";
      if(emp){
        if(CLOUD){
          access = rec
            ? '<div class="tm-access">Usuario: <b>'+esc(rec.email)+'</b> <button class="link-btn" type="button" data-tm-reset="'+esc(rec.email)+'">Mandarle mail para cambiar la contraseña</button></div>'
            : '<div class="tm-access"><div class="field-hint" style="margin:0 0 6px;">Todavía no tiene usuario para entrar al panel.</div>' +
              '<div class="row2"><div><label>Mail</label><input type="email" data-tm-email="'+esc(m.id)+'" placeholder="empleado@mail.com" autocapitalize="off"></div>' +
              '<div><label>Contraseña</label><input type="text" data-tm-pass="'+esc(m.id)+'" placeholder="Mínimo 6 caracteres"></div></div>' +
              '<button class="btn btn-ghost btn-sm" type="button" data-tm-create="'+esc(m.id)+'">Crear acceso</button></div>';
        } else {
          access = '<div class="tm-access"><label>PIN de acceso <span class="opt">(versión de prueba)</span></label><input type="text" data-tm-pin="'+esc(m.id)+'" value="'+esc(pin)+'" placeholder="Ej: 2222" style="max-width:160px;"></div>';
        }
      }
      return '<div class="tm-row" data-tm="'+esc(m.id)+'">' +
        '<div class="tm-head">' + barberAvatar(m.id, "") +
          '<div><b>'+esc(m.name)+'</b><span class="tm-role">'+(emp ? 'Empleado' : 'Dueño · administrador')+'</span></div>' +
          '<label class="checkline tm-active"><input type="checkbox" data-tm-active="'+esc(m.id)+'" '+(m.active !== false ? 'checked' : '')+'><span>Atiende</span></label></div>' +
        '<div class="row2"><div><label>Nombre</label><input type="text" data-tm-name="'+esc(m.id)+'" value="'+esc(m.name)+'" maxlength="40"></div>' +
          '<div><label>WhatsApp <span class="opt">(con código de país)</span></label><input type="tel" data-tm-wa="'+esc(m.id)+'" value="'+esc(m.whatsapp || "")+'" placeholder="5493415551234"></div></div>' +
        '<label>Foto de perfil</label>' + photoEditHtml(m.id) +
        memberHoursHtml(m) +
        '<label>Máximo de turnos por día <span class="opt">(vacío = todos los horarios de su jornada)</span></label>' +
        '<input type="number" min="0" max="200" data-tm-max="'+esc(m.id)+'" value="'+(m.maxPerDay || "")+'" placeholder="Ej: 12" style="max-width:160px;">' +
        access +
        '<div class="actions"><button class="btn btn-primary btn-sm" type="button" data-tm-save="'+esc(m.id)+'">Guardar</button>' +
          (emp ? '<button class="btn btn-danger btn-sm" type="button" data-tm-del="'+esc(m.id)+'">Quitar del equipo</button>' : '') + '</div>' +
        '</div>';
    }).join("");
    html += '</div>';

    html += '<div class="card"><h2>Agregar empleado</h2><div class="sub">Se crea su usuario para que entre al panel y aparece como opción al reservar.</div>' +
      '<div class="row2"><div><label>Nombre</label><input type="text" id="inpNewTmName" maxlength="40" placeholder="Ej: Julián"></div>' +
      '<div><label>WhatsApp <span class="opt">(con código de país)</span></label><input type="tel" id="inpNewTmWa" placeholder="5493415551234"></div></div>' +
      (CLOUD
        ? '<div class="row2"><div><label>Mail (su usuario)</label><input type="email" id="inpNewTmEmail" placeholder="empleado@mail.com" autocapitalize="off"></div>' +
          '<div><label>Contraseña</label><input type="text" id="inpNewTmPass" placeholder="Mínimo 6 caracteres"></div></div>'
        : '<label>PIN de acceso</label><input type="text" id="inpNewTmPin" placeholder="Ej: 2222" style="max-width:160px;">') +
      '<button class="btn btn-primary" id="btnAddTm" type="button">Agregar al equipo</button></div>';
    return html;
  }

  function saveTeam(list, msg){
    state.config.team = cleanTeam(list);
    saveState();
    renderOwner();
    showToast(msg || "Equipo guardado.");
  }

  function bindEquipoEvents(){
    bindPhotoControls();
    document.querySelectorAll("[data-trange]").forEach(function(el){
      el.onclick = function(){ session.teamRange = el.getAttribute("data-trange"); renderOwner(); };
    });
    var val = function(attr, id){ var el = document.querySelector('['+attr+'="'+id+'"]'); return el ? el.value.trim() : ""; };
    // "igual al local": bloquea o habilita las horas del barbero; cada tramo se activa o apaga con su tilde
    document.querySelectorAll("[data-tm-same]").forEach(function(el){
      el.onchange = function(){
        var id = el.getAttribute("data-tm-same");
        document.querySelectorAll('[data-tmh-a^="'+id+'|"]').forEach(function(a){
          a.disabled = el.checked;
          var key = a.getAttribute("data-tmh-a");
          [document.querySelector('[data-tmh-s="'+key+'"]'), document.querySelector('[data-tmh-e="'+key+'"]')].forEach(function(t){ t.disabled = el.checked || !a.checked; });
        });
        var det = el.closest(".tm-row").querySelector(".tm-hours"); if(det && !el.checked) det.open = true;
      };
    });
    document.querySelectorAll("[data-tmh-a]").forEach(function(a){
      a.onchange = function(){
        var key = a.getAttribute("data-tmh-a");
        [document.querySelector('[data-tmh-s="'+key+'"]'), document.querySelector('[data-tmh-e="'+key+'"]')].forEach(function(t){ t.disabled = !a.checked; });
        a.closest(".hours-shift").classList.toggle("disabled", !a.checked);
      };
    });
    document.querySelectorAll("[data-tm-save]").forEach(function(el){
      el.onclick = function(){
        var id = el.getAttribute("data-tm-save"), bad = "";
        var team = teamList().map(function(m){
          if(m.id !== id) return m;
          var act = document.querySelector('[data-tm-active="'+id+'"]');
          var same = document.querySelector('[data-tm-same="'+id+'"]'), hours = null;
          if(same && !same.checked){
            hours = {};
            DOW_KEYS.forEach(function(k){
              hours[k] = {};
              ["morning", "afternoon"].forEach(function(sh){
                var key = id + "|" + k + "|" + sh;
                var a = document.querySelector('[data-tmh-a="'+key+'"]'), st = document.querySelector('[data-tmh-s="'+key+'"]'), en = document.querySelector('[data-tmh-e="'+key+'"]');
                var on = !!(a && a.checked);
                if(on && st.value >= en.value){ bad = DOW_LABEL[k] + ": la hora de salida tiene que ser después de la de entrada."; }
                hours[k][sh] = {active: on, start: (st && st.value) || "09:00", end: (en && en.value) || "13:00"};
              });
            });
          }
          var upd = Object.assign({}, m, {name: val("data-tm-name", id) || m.name, whatsapp: val("data-tm-wa", id), active: act ? act.checked : true,
                                          maxPerDay: parseInt(val("data-tm-max", id), 10) || 0});
          delete upd.days;
          if(hours) upd.hours = hours; else delete upd.hours;
          return upd;
        });
        if(!CLOUD){
          var pinEl = document.querySelector('[data-tm-pin="'+id+'"]');
          if(pinEl){ state.config.staffPins = Object.assign({}, state.config.staffPins || {}); state.config.staffPins[id] = pinEl.value.trim(); }
        }
        if(bad){ showToast(bad); return; }
        if(!team.filter(function(m){ return m.active !== false; }).length){ showToast("Tiene que haber al menos un barbero que atienda."); return; }
        saveTeam(team);
      };
    });
    document.querySelectorAll("[data-tm-del]").forEach(function(el){
      el.onclick = function(){
        var id = el.getAttribute("data-tm-del"), m = barberById(id);
        askConfirm("Quitar del equipo", "¿Quitar a " + (m ? m.name : "este empleado") + "? Deja de aparecer al reservar y pierde el acceso al panel. Sus turnos ya reservados no se borran.", function(){
          var rec = CLOUD ? staffRecordFor(id) : null;
          if(rec) cloudAuth.removeStaff(rec.uid).catch(function(e){ console.error(e); });
          if(!CLOUD && state.config.staffPins) delete state.config.staffPins[id];
          saveTeam(teamList().filter(function(x){ return x.id !== id; }), "Empleado quitado del equipo.");
        });
      };
    });
    document.querySelectorAll("[data-tm-reset]").forEach(function(el){
      el.onclick = function(){
        cloudAuth.resetPassword(el.getAttribute("data-tm-reset")).then(function(){ showToast("Le mandamos un mail para que cambie la contraseña."); })
          .catch(function(){ showToast("No se pudo enviar el mail."); });
      };
    });
    document.querySelectorAll("[data-tm-create]").forEach(function(el){
      el.onclick = function(){
        var id = el.getAttribute("data-tm-create"), m = barberById(id);
        var email = val("data-tm-email", id), pass = val("data-tm-pass", id);
        if(!isValidEmail(email)){ showToast("Escribí un mail válido."); return; }
        if(pass.length < 6){ showToast("La contraseña tiene que tener al menos 6 caracteres."); return; }
        el.disabled = true; el.textContent = "Creando...";
        cloudAuth.createStaff(email, pass, m).then(function(){ showToast("Acceso creado. Pasale el mail y la contraseña a " + m.name + "."); })
          .catch(function(e){ console.error(e); showToast(authMessage(e)); el.disabled = false; el.textContent = "Crear acceso"; });
      };
    });
    var add = document.getElementById("btnAddTm");
    if(add) add.onclick = function(){
      var name = document.getElementById("inpNewTmName").value.trim(), wa = document.getElementById("inpNewTmWa").value.trim();
      if(!name){ showToast("Escribí el nombre del empleado."); return; }
      var team = teamList().slice(), id = cleanTeam([{name: name}])[0].id, n = 2, base = id;
      while(team.some(function(m){ return m.id === id; })) id = base + (n++);
      var member = {id: id, name: name, role: "employee", whatsapp: wa, active: true};
      var done = function(){ team.push(member); saveTeam(team, name + " se sumó al equipo."); };
      if(CLOUD){
        var email = document.getElementById("inpNewTmEmail").value.trim(), pass = document.getElementById("inpNewTmPass").value;
        if(!isValidEmail(email)){ showToast("Escribí un mail válido."); return; }
        if(pass.length < 6){ showToast("La contraseña tiene que tener al menos 6 caracteres."); return; }
        add.disabled = true; add.textContent = "Creando...";
        cloudAuth.createStaff(email, pass, member).then(done).catch(function(e){ console.error(e); showToast(authMessage(e)); add.disabled = false; add.textContent = "Agregar al equipo"; });
      } else {
        var pin = document.getElementById("inpNewTmPin").value.trim();
        if(pin){ state.config.staffPins = Object.assign({}, state.config.staffPins || {}); state.config.staffPins[id] = pin; }
        done();
      }
    };
  }

  // ================= NOVEDADES DEL DÍA =================
  // Primera pestaña al abrir el panel: todo lo que hay que tener en cuenta hoy. El empleado ve lo de su barbero; el dueño, todo.
  function myBookings(){
    if(isEmployee()){ var me = myBarber(); return state.bookings.filter(function(b){ return barberOfBooking(b) === me; }); }
    return state.bookings;
  }

  function hoyData(){
    var now = new Date(), today = toISO(now), tomorrow = addDays(today, 1), ago = function(n){ return addDays(today, -n); };
    var byTime = function(a, b){ return (a.date + a.time) < (b.date + b.time) ? -1 : 1; };
    var all = myBookings(), active = all.filter(function(b){ return b.status !== "cancelled"; });
    var d = {today: today, tomorrow: tomorrow};
    d.hoy = active.filter(function(b){ return b.date === today; }).sort(byTime);
    d.proximo = d.hoy.filter(function(b){ return b.status === "confirmed" && !turnoEnded(b); })[0] || null;
    d.informados = active.filter(function(b){ return (b.deposit > 0 && depState(b) === "informed") || balState(b) === "informed"; }).sort(byTime);
    d.sinCerrar = active.filter(function(b){ return b.status === "confirmed" && turnoEnded(b) && b.date >= ago(30); }).sort(byTime);
    d.saldos = active.filter(function(b){
      return turnoEnded(b) && balanceDue(b) > 0 && b.date >= ago(60) && d.informados.indexOf(b) < 0 && d.sinCerrar.indexOf(b) < 0;
    }).sort(byTime);
    d.senas = active.filter(function(b){ return b.status === "confirmed" && b.deposit > 0 && depState(b) === "pending" && (b.date === today || b.date === tomorrow); }).sort(byTime);
    d.nuevas = active.filter(function(b){ return !b.seenByOwner && b.status === "confirmed"; }).sort(byTime);
    d.cancelados = all.filter(function(b){ return b.status === "cancelled" && b.date >= ago(1) && b.date <= addDays(today, 7); }).sort(byTime);
    d.cambios = active.filter(function(b){ return b.rescheduled && b.date >= today && b.date <= addDays(today, 7); }).sort(byTime);
    d.conCargo = d.hoy.filter(function(b){ return b.debtCharged > 0 || (!isEmployee() && state.debts[b.clientKey]); });
    d.devolver = isEmployee() ? [] : all.filter(function(b){ return b.status === "cancelled" && !b.lateCancel && depositKept(b); }).sort(byTime);
    // requieren atención = pagos por confirmar + turnos pasados sin cerrar + saldos por cobrar (sin repetir)
    var seen = {}, att = [];
    [d.informados, d.sinCerrar, d.saldos].forEach(function(list){ list.forEach(function(b){ if(!seen[b.id]){ seen[b.id] = 1; att.push(b); } }); });
    d.atencion = att.sort(byTime);
    return d;
  }

  function hoyAttentionCount(){
    var d = hoyData();
    return d.atencion.length + d.nuevas.length + d.devolver.length;
  }

  function newsWho(b){
    return esc(b.name) + ' ' + esc(b.lastname) +
      (!isEmployee() && activeBarbers().length > 1 && barberNameOf(b) ? ' <small>· ' + esc(barberNameOf(b)) + '</small>' : '');
  }
  // fila compacta: toque = abre ese día en la agenda
  function newsLine(b, chip, showDate){
    return '<button type="button" class="news-line" data-jump="'+b.date+'">' +
      '<span class="nl-time"><b>'+b.time+'</b>'+(showDate ? '<i>'+(b.date === toISO(new Date()) ? 'Hoy' : formatDateLong(b.date))+'</i>' : '')+'</span>' +
      '<span class="nl-who">'+newsWho(b)+(b.walkIn ? ' <em>⚡ orden de llegada</em>' : '')+'</span>' +
      (chip ? '<span class="nl-chip">'+chip+'</span>' : '') + '</button>';
  }
  function newsCard(title, sub, count, body, tone){
    return '<div class="card news-card'+(tone ? ' tone-'+tone : '')+'"><h2>'+title+' <span class="count-pill">'+count+'</span></h2>' +
      (sub ? '<div class="sub">'+sub+'</div>' : '') + body + '</div>';
  }
  function attentionReasons(b, d){
    var r = [];
    if(d.informados.indexOf(b) >= 0) r.push('<span class="pchip seal">Avisó que pagó: confirmalo</span>');
    if(d.sinCerrar.indexOf(b) >= 0) r.push('<span class="pchip warn">Pasó sin cerrar: completalo o marcá "No vino"</span>');
    if(d.saldos.indexOf(b) >= 0) r.push('<span class="pchip due">Saldo por cobrar '+money(balanceDue(b))+'</span>');
    return '<div class="news-reasons"><span class="cobro-date" style="margin:0 8px 0 0;">'+formatDateLong(b.date)+'</span>'+r.join("")+'</div>';
  }

  // cómo está cargado cada barbero hoy: capacidad, turnos, lo que le falta cobrar y su línea de tiempo del día
  function barberDayCards(d, owner){
    var today = d.today, ago60 = addDays(today, -60);
    var byTime = function(a, b){ return a.time < b.time ? -1 : 1; };
    var members = isEmployee() ? viewBarbers() : activeBarbers();
    return '<div class="hoy-team-head"><h2>Cómo está cada barbero hoy</h2><div class="sub">Capacidad según la jornada de cada uno · tocá un turno para abrir su día</div></div>' +
      '<div class="hoy-team">' + members.map(function(m){
        var mine = myBookings().filter(function(b){ return barberOfBooking(b) === m.id; });
        var live = mine.filter(function(b){ return b.status !== "cancelled"; });
        var hoy = live.filter(function(b){ return b.date === today; }).sort(byTime);
        var works = barberWorks(m, today), cap = barberDayCapacity(m, today);
        var hechos = hoy.filter(function(b){ return b.status === "completed"; }).length;
        var porVenir = hoy.filter(function(b){ return b.status === "confirmed" && !turnoEnded(b); }).length;
        var manana = live.filter(function(b){ return b.date === d.tomorrow; }).length;
        var porConfirmar = live.filter(function(b){ return (b.deposit > 0 && depState(b) === "informed") || balState(b) === "informed"; }).length;
        var saldos = live.filter(function(b){ return turnoEnded(b) && balanceDue(b) > 0 && b.date >= ago60; }).length;
        var cobrado = owner ? paySummary(hoy, today).paid : 0, aCobrar = owner ? hoy.reduce(function(t, b){ return t + balanceDue(b); }, 0) : 0;
        var pct = cap ? Math.min(100, Math.round(hoy.length * 100 / cap)) : 0, level = pct >= 85 ? "high" : pct >= 50 ? "mid" : "low";
        var next = hoy.filter(function(b){ return b.status === "confirmed" && !turnoEnded(b); })[0];
        var hours = barberRanges(today, m).map(function(r){ return r.start + ' a ' + r.end; }).join(' y ');
        return '<div class="card bcard'+(works ? '' : ' off')+'">' +
          '<div class="bcard-head">' + barberAvatar(m.id, "") + '<div><b>'+esc(m.name)+'</b><i>'+(works ? 'Hoy de '+hours : 'No atiende hoy')+'</i></div>' +
            (next ? '<span class="pchip seal">Próximo '+next.time+'</span>' : '') + '</div>' +
          (works ? '<div class="bcard-cap"><div class="bcard-cap-top"><span>'+hoy.length+' de '+cap+' turnos</span><b>'+pct+'%</b></div>' +
            '<span class="occ-track"><i class="occ-fill '+level+'" style="width:'+pct+'%"></i></span></div>' : '') +
          '<div class="bcard-stats">' +
            '<div><b>'+hechos+'</b><span>Cortes hechos</span></div><div><b>'+porVenir+'</b><span>Por venir</span></div><div><b>'+manana+'</b><span>Mañana</span></div>' +
            (owner ? '<div><b>'+money(cobrado)+'</b><span>Cobrado hoy</span></div><div><b>'+money(aCobrar)+'</b><span>A cobrar hoy</span></div>' : '') +
          '</div>' +
          ((porConfirmar || saldos) ? '<div class="bcard-alerts">' + (porConfirmar ? '<span class="pchip seal">'+porConfirmar+' pago'+(porConfirmar === 1 ? '' : 's')+' por confirmar</span>' : '') +
            (saldos ? '<span class="pchip due">'+saldos+' saldo'+(saldos === 1 ? '' : 's')+' por cobrar</span>' : '') + '</div>' : '') +
          '<div class="bcard-line">' + (hoy.length ? hoy.map(function(b){
            var chip = b.status === "completed" ? '<span class="paystate ok">Completado</span>'
              : (next && next.id === b.id ? '<span class="pchip seal">Próximo</span>' : (turnoEnded(b) ? '<span class="pchip warn">Ya pasó</span>' : ''));
            return newsLine(b, chip);
          }).join("") : '<div class="empty-note">'+(works ? 'Sin turnos hoy.' : 'Hoy no trabaja.')+'</div>') + '</div>' +
          '</div>';
      }).join("") + '</div>';
  }

  function ownerHoy(){
    var d = hoyData(), today = d.today, owner = !isEmployee();
    var team = isEmployee() ? viewBarbers() : activeBarbers();
    var crew = team.filter(function(m){ return barberWorks(m, today); }), off = team.filter(function(m){ return !barberWorks(m, today); });
    var hoursOf = function(m){ return barberRanges(today, m).map(function(r){ return r.start+' a '+r.end; }).join(' y '); };

    // ----- columna lateral: resumen, estado del local y avisos -----
    var toCollectToday = d.hoy.reduce(function(s, b){ return s + balanceDue(b); }, 0);
    var tiles = '<div class="stat-row">' +
      '<div class="stat-tile"><div class="num">'+d.hoy.length+'</div><div class="lbl">Turnos hoy</div></div>' +
      '<div class="stat-tile"><div class="num">'+(d.proximo ? d.proximo.time : '—')+'</div><div class="lbl">Próximo turno</div></div>' +
      '<div class="stat-tile'+(d.atencion.length ? ' is-warn' : '')+'"><div class="num">'+d.atencion.length+'</div><div class="lbl">Requieren atención</div></div>' +
      '<div class="stat-tile"><div class="num">'+d.nuevas.length+'</div><div class="lbl">Reservas nuevas</div></div>' +
      (owner ? '<div class="stat-tile"><div class="num">'+money(toCollectToday)+'</div><div class="lbl">A cobrar hoy</div></div>' : '') +
      '</div>';
    var teamView = activeBarbers().length > 1;
    var closedNote = (!teamView || crew.length) ? '' : '<div class="notice warn" style="margin-bottom:14px;"><div>El local está cerrado hoy: ningún barbero atiende.</div></div>';
    var local = '<div class="card news-card"><h2>El local hoy</h2>' +
      (crew.length ? crew.map(function(m){ return '<div class="summary-row"><span class="k">'+(team.length > 1 ? esc(m.name) : 'Horario')+'</span><span class="v">'+hoursOf(m)+'</span></div>'; }).join("")
                   : '<div class="notice warn"><div>El local está cerrado hoy.</div></div>') +
      (team.length > 1 && crew.length && off.length ? '<div class="summary-row"><span class="k">No atienden hoy</span><span class="v">'+off.map(function(m){ return esc(m.name); }).join(", ")+'</span></div>' : '') +
      '</div>';
    var avisos = [];
    if(owner){
      var debts = Object.keys(state.debts).length;
      if(debts) avisos.push('<div class="news-row tone-warn"><span>💰</span><div><b>'+debts+(debts === 1 ? ' cliente con cargo pendiente' : ' clientes con cargo pendiente')+'</b><i>Por cancelar el mismo día o no venir sin haber pagado la seña</i></div><button class="btn btn-ghost btn-sm" data-goto="saldos">Ver saldos</button></div>');
      if(!state.config.payAlias && !hasMpLinks()) avisos.push('<div class="news-row tone-warn"><span>🔗</span><div><b>Falta cargar un medio de pago online</b><i>Sin alias ni link de Mercado Pago el cliente no puede pagar desde la app</i></div><button class="btn btn-ghost btn-sm" data-goto="negocio">Cargar</button></div>');
      var sinWa = teamList().filter(function(m){ return m.active !== false && !m.whatsapp; });
      if(sinWa.length && activeBarbers().length > 1) avisos.push('<div class="news-row tone-info"><span>📱</span><div><b>Falta el WhatsApp de '+sinWa.map(function(m){ return esc(m.name); }).join(", ")+'</b><i>Con el número, el aviso del turno le llega directo</i></div><button class="btn btn-ghost btn-sm" data-goto="equipo">Cargar</button></div>');
      if(state.config.priceIsExample) avisos.push('<div class="news-row tone-info"><span>🏷️</span><div><b>El precio del corte es el de ejemplo</b><i>Cargá el precio real</i></div><button class="btn btn-ghost btn-sm" data-goto="precios">Cambiar</button></div>');
    }
    var side = (teamView ? '' : local) + (avisos.length ? '<div class="card news-card"><h2>Avisos <span class="count-pill">'+avisos.length+'</span></h2>'+avisos.join("")+'</div>' : '');

    // ----- columna principal -----
    var left = "", right = "";
    var turnosHoyCard = newsCard("Turnos de hoy", d.hoy.length ? formatDateLong(today) : "Hoy no hay turnos reservados", d.hoy.length,
      d.hoy.length ? d.hoy.map(function(b){
        var chip = b.status === "completed" ? '<span class="paystate ok">Completado</span>'
          : (d.proximo && d.proximo.id === b.id ? '<span class="pchip seal">Próximo</span>' : (turnoEnded(b) ? '<span class="pchip warn">Ya pasó</span>' : ''));
        return newsLine(b, chip);
      }).join("") : '<div class="empty-note">Sin turnos para hoy.</div>');

    left += newsCard("Requieren tu atención", "Pagos por confirmar, turnos que pasaron sin cerrar y saldos por cobrar", d.atencion.length,
      d.atencion.length ? '<div class="att-grid">' + d.atencion.map(function(b){ return '<div class="att-item">' + attentionReasons(b, d) + bookingRow(b) + '</div>'; }).join("") + '</div>'
                        : '<div class="empty-note">Todo en orden por acá. ✓</div>', d.atencion.length ? "warn" : "");

    if(d.nuevas.length){
      left += newsCard("Reservas nuevas", "Todavía no las viste", d.nuevas.length,
        d.nuevas.slice(0, 8).map(function(b){ return newsLine(b, '', true); }).join("") +
        '<button class="btn btn-ghost btn-sm" type="button" data-seen="1" style="margin-top:6px;">Marcar como vistas</button>', "info");
    }
    if(d.conCargo.length){
      left += newsCard("Vienen hoy con un cargo", "Tienen un saldo anterior sumado a este turno", d.conCargo.length,
        d.conCargo.map(function(b){ return newsLine(b, '<span class="pchip warn">'+(b.debtCharged ? '+'+money(b.debtCharged) : 'Debe cargo')+'</span>'); }).join(""), "warn");
    }
    if(d.senas.length){
      right += newsCard("Señas pendientes", "Turnos de hoy y mañana que todavía no pagaron la seña", d.senas.length,
        d.senas.map(function(b){ return newsLine(b, '<span class="pchip warn">'+money(b.deposit)+'</span>', true); }).join(""));
    }
    if(d.cancelados.length){
      right += newsCard("Cancelaciones y suspensiones", "De ayer a los próximos 7 días", d.cancelados.length,
        d.cancelados.map(function(b){
          var chip = b.lateCancel ? '<span class="pchip due">Suspendido'+(depositKept(b) ? ' · seña retenida' : '')+'</span>' : '<span class="pchip none">Cancelado con aviso</span>';
          return newsLine(b, chip, true);
        }).join(""));
    }
    if(d.devolver.length){
      left += newsCard("Señas a devolver", "Cancelaron con aviso: devolvé la seña y marcala", d.devolver.length,
        d.devolver.map(function(b){
          return '<div class="news-line static"><span class="nl-time"><b>'+money(b.deposit)+'</b></span><span class="nl-who">'+newsWho(b)+'<small> · turno del '+formatDateLong(b.date)+'</small></span>' +
            '<button class="btn btn-primary btn-sm" type="button" data-refund="'+b.id+'">Seña devuelta</button></div>';
        }).join(""), "warn");
    }
    if(d.cambios.length){
      right += newsCard("Cambios de día", "Turnos que el cliente movió (próximos 7 días)", d.cambios.length,
        d.cambios.map(function(b){ return newsLine(b, '<span class="pchip none">antes: '+shortDate(b.originalDate)+' '+esc(b.originalTime || "")+'</span>', true); }).join(""));
    }
    right += reminderCard();
    if(!teamView) left = turnosHoyCard + left;
    right += side;

    return '<div class="hoy-banner"><div><h2>Novedades de hoy</h2><div class="sub">'+formatDateLong(today)+(isEmployee() ? ' · tus turnos' : '')+'</div></div>' +
      '<button class="btn btn-ghost btn-sm" data-goto="agenda" type="button">Ir a la agenda</button></div>' +
      closedNote +
      '<div class="hoy-top">' + tiles + '</div>' +
      (teamView ? barberDayCards(d, owner) : '') +
      '<div class="hoy-cols"><section class="hoy-col">'+left+'</section><section class="hoy-col">'+right+'</section></div>';
  }

  function bindHoyEvents(){
    bindPayActions();
    document.querySelectorAll("[data-goto]").forEach(function(el){
      el.onclick = function(){ session.ownerTab = el.getAttribute("data-goto"); session.clientDetail = null; renderOwner(); window.scrollTo(0, 0); };
    });
    document.querySelectorAll("[data-jump]").forEach(function(el){
      el.onclick = function(){ session.agendaDate = el.getAttribute("data-jump"); session.agendaView = "dia"; session.ownerTab = "agenda"; renderOwner(); window.scrollTo(0, 0); };
    });
    document.querySelectorAll("[data-complete]").forEach(function(el){ el.onclick = function(){ completeBooking(el.getAttribute("data-complete")); }; });
    document.querySelectorAll("[data-cancel]").forEach(function(el){
      el.onclick = function(){
        var id = el.getAttribute("data-cancel");
        askConfirm("Cancelar turno", "¿Cancelar este turno? Si es el mismo día, se aplican las reglas de seña y cargo.", function(){ cancelBooking(id); });
      };
    });
    bindReminders();
    document.querySelectorAll("[data-seen]").forEach(function(el){ el.onclick = function(){ markAllSeen(); renderOwner(); }; });
  }

  // ================= PASAR EL CORTE A UN COMPAÑERO + MOVIMIENTOS =================
  // quién hace cada cosa en el registro de movimientos
  actor = function(){
    return isEmployee() ? {role: "staff", name: (barberById(myBarber()) || {}).name || "Empleado"} : {role: "owner", name: (ownerBarber() || {}).name || "Dueño"};
  };

  function barberBusyAt(m, b){
    if(CLOUD) return !!takenTimes(b.date, m.id)[b.time];
    return state.bookings.some(function(x){ return x.id !== b.id && x.date === b.date && x.time === b.time && x.status !== "cancelled" && barberOfBooking(x) === m.id; });
  }

  function transferFlow(id){
    var b = findBooking(id);
    if(!b) return;
    var cur = barberOfBooking(b);
    var opts = activeBarbers().filter(function(m){ return m.id !== cur; }).map(function(m){
      var works = barberSlotTimes(b.date, m).indexOf(b.time) >= 0, busy = works && barberBusyAt(m, b);
      return {id: m.id, label: m.name, sub: !works ? "Fuera de su horario a esa hora" : busy ? "Ya tiene un turno a esa hora" : "Libre a esa hora", disabled: !works || busy};
    });
    if(!opts.length){ showToast("No hay otro barbero para pasarle el corte."); return; }
    var note = shouldNotifyChange(b)
      ? "Faltan más de 30 minutos: al pasarlo te armo el mensaje para avisarle al cliente."
      : "Falta menos de media hora: se pasa sin avisarle al cliente.";
    askChoose("Pasar este corte a otro barbero", esc2(b.name + " " + b.lastname) + " · " + formatDateLong(b.date) + " · " + b.time + " hs. " + note, opts, function(toId){
      transferBooking(id, toId).then(function(res){
        if(!res.notify){
          showToast("Listo: el corte pasó a " + res.to + ". Faltaba menos de media hora, así que no se le avisa al cliente.");
          return;
        }
        var nb = Object.assign({}, b, {barberName: res.to}), txt = transferText(nb, res.from), links = [];
        if(b.phone) links.push({label: "Avisar por WhatsApp", sub: "Se abre el mensaje ya escrito para " + b.name, href: "https://wa.me/" + waNumber(b.phone) + "?text=" + encodeURIComponent(txt)});
        if(b.email) links.push({label: "Avisar por mail", sub: b.email, href: "mailto:" + b.email + "?subject=" + encodeURIComponent("Tu turno en " + state.config.businessName) + "&body=" + encodeURIComponent(txt)});
        if(!links.length){ showToast("Corte pasado a " + res.to + ". El cliente no tiene teléfono ni mail cargados para avisarle."); return; }
        askChoose("Corte pasado a " + res.to, "El cliente ya lo ve en su app. Como faltaba más de media hora, avisale por acá:", links, null);
      }).catch(function(e){
        console.error(e);
        var busy = e && (e.code === "slot-taken" || e.code === "permission-denied" || e.code === "already-exists" || e.code === "aborted");
        showToast(busy ? "Ese compañero ya tiene un turno a esa hora (o no se puede pasar este turno)." : "No se pudo pasar el corte. Intentá de nuevo.");
      });
    });
  }
  function esc2(t){ return String(t); }      // el texto del aviso se muestra como texto plano

  // ---------- pestaña Movimientos ----------
  var MOVE_GROUPS = [
    {id: "todos", label: "Todos", types: null},
    {id: "transferencia", label: "Transferencias", types: ["transferencia"]},
    {id: "pago", label: "Pagos", types: ["pago"]},
    {id: "cancel", label: "Cancelaciones", types: ["cancelacion", "suspension"]},
    {id: "cambio", label: "Cambios de día", types: ["cambio_dia"]},
    {id: "reserva", label: "Reservas", types: ["reserva"]},
    {id: "completado", label: "Completados", types: ["completado"]},
    {id: "recordatorio", label: "Recordatorios", types: ["recordatorio"]}
  ];
  var MOVE_ROLE = {owner: "Dueño", staff: "Empleado", client: "Cliente"};

  function fmtStamp(ts){
    var d = new Date(ts);
    return d.getDate() + " " + MONTHS[d.getMonth()].slice(0, 3).toLowerCase() + " · " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  function visibleMovements(){
    var list = (state.movements || []).slice();
    if(isEmployee()){ var me = myBarber(); list = list.filter(function(m){ return (m.barbers || []).indexOf(me) >= 0; }); }
    return list.sort(function(a, b){ return b.at - a.at; });
  }

  function movesHtml(list){
    var g = MOVE_GROUPS.filter(function(x){ return x.id === session.moveFilter; })[0] || MOVE_GROUPS[0];
    var q = session.moveQuery.trim().toLowerCase();
    var rows = list.filter(function(m){
      if(g.types && g.types.indexOf(m.type) < 0) return false;
      if(!q) return true;
      return (m.clientName + " " + m.text + " " + m.byName).toLowerCase().indexOf(q) >= 0;
    });
    if(!rows.length) return '<div class="empty-note">No hay movimientos para este filtro.</div>';
    return rows.slice(0, 300).map(function(m){
      var who = esc(m.byName || "") + (m.byName ? ' · ' : '') + (MOVE_ROLE[m.byRole] || m.byRole);
      return '<div class="mv-row"><span class="mv-when">'+fmtStamp(m.at)+'</span>' +
        '<span class="mv-type t-'+esc(m.type)+'">'+(MOVE_TYPES[m.type] || esc(m.type))+'</span>' +
        '<div class="mv-body"><b>'+esc(m.text)+'</b><i>'+esc(m.clientName || "")+' · turno del '+formatDateLong(m.date)+' '+esc(m.time)+' hs · '+who+'</i></div></div>';
    }).join("") + (rows.length > 300 ? '<div class="field-hint">Se muestran los 300 más recientes.</div>' : '');
  }

  function ownerMovimientos(){
    var list = visibleMovements();
    var count = function(g){ return g.types ? list.filter(function(m){ return g.types.indexOf(m.type) >= 0; }).length : list.length; };
    return '<div class="card"><h2>Movimientos</h2><div class="sub">Registro de todo lo que pasa con los turnos: reservas, pagos, cancelaciones, cambios de día y cortes pasados entre barberos' + (isEmployee() ? ' (los de tu agenda)' : '') + '</div>' +
      '<input type="text" id="inpMoveSearch" placeholder="Buscar por cliente, barbero o detalle" value="'+esc(session.moveQuery)+'" autocomplete="off">' +
      '<div class="chips">' + MOVE_GROUPS.map(function(g){
        return '<button type="button" class="chip'+(session.moveFilter === g.id ? ' on' : '')+'" data-mfilter="'+g.id+'">'+g.label+' <small>'+count(g)+'</small></button>';
      }).join("") + '</div><div id="moveList">'+movesHtml(list)+'</div></div>';
  }

  function bindMovimientosEvents(){
    document.querySelectorAll("[data-mfilter]").forEach(function(el){
      el.onclick = function(){ session.moveFilter = el.getAttribute("data-mfilter"); renderOwner(); };
    });
    var s = document.getElementById("inpMoveSearch");
    if(s) s.oninput = function(){ session.moveQuery = s.value; document.getElementById("moveList").innerHTML = movesHtml(visibleMovements()); };
  }

  // ================= RECORDATORIOS: ENVÍO GUIADO =================
  // Un solo botón arma la cola de recordatorios de mañana (WhatsApp y/o mail). Ningún navegador puede mandar un WhatsApp o un mail por sí
  // solo (eso requiere un servicio de pago), así que cada paso abre el mensaje ya escrito con un toque y la app lo va marcando como avisado
  // y dejándolo en el registro de movimientos. Quien manda solo toca "Enviar" en WhatsApp o en su mail.
  function markReminded(id, channel){
    var b = findBooking(id);
    if(!b) return;
    logMovement(b, "recordatorio", "Recordatorio enviado por " + (channel === "wa" ? "WhatsApp" : "mail"));
    if(!b.reminded) updateBooking(id, {reminded: true});
  }

  function bindReminders(){
    document.querySelectorAll("[data-remind]").forEach(function(el){
      el.addEventListener("click", function(){ markReminded(el.getAttribute("data-remind"), el.getAttribute("data-rch")); });
    });
    document.querySelectorAll("[data-remind-all]").forEach(function(el){ el.onclick = remindFlow; });
  }

  var rem = null;       // estado del envío guiado: {steps, i, sent, clients}

  function remindOverlay(){
    var ov = document.getElementById("remindOverlay");
    if(!ov){
      ov = document.createElement("div"); ov.id = "remindOverlay"; ov.className = "modal-overlay";
      ov.innerHTML = '<div class="modal-box remind-box" id="remindBox"></div>';
      document.body.appendChild(ov);
    }
    return ov;
  }
  function closeRemind(){ remindOverlay().classList.remove("show"); rem = null; renderOwner(); }

  function remindFlow(){
    var all = tomorrowBookings();
    if(!all.length){ showToast("No hay turnos mañana."); return; }
    var todo = all.filter(function(b){ return !b.reminded; });
    var repeat = !todo.length;
    if(repeat) todo = all;
    rem = {todo: todo, steps: [], i: 0, sent: 0, done: {}};
    var nWa = todo.filter(function(b){ return b.phone; }).length, nMail = todo.filter(function(b){ return b.email; }).length;
    var box = document.getElementById("remindBox") || (remindOverlay(), document.getElementById("remindBox"));
    box.innerHTML = '<h3>Enviar recordatorios de mañana</h3>' +
      '<p>'+(repeat ? 'Todos ya estaban avisados: se manda de nuevo a los ' : 'Faltan avisar ')+todo.length+(todo.length === 1 ? ' cliente' : ' clientes')+'. Elegí por dónde:</p>' +
      '<label class="checkline"><input type="checkbox" id="rmWa" '+(nWa ? 'checked' : 'disabled')+'><span>WhatsApp ('+nWa+')</span></label>' +
      '<label class="checkline"><input type="checkbox" id="rmMail" '+(nMail ? 'checked' : 'disabled')+'><span>Mail ('+nMail+')</span></label>' +
      '<div class="field-hint" style="margin:2px 0 12px;">Te voy abriendo cada mensaje ya escrito, uno por uno: solo tocás Enviar en WhatsApp o en tu mail. Lo que mandes queda marcado como avisado.</div>' +
      '<div class="btn-row"><button class="btn btn-ghost" id="rmCancel">Cancelar</button><button class="btn btn-primary" id="rmStart">Empezar</button></div>';
    remindOverlay().classList.add("show");
    document.getElementById("rmCancel").onclick = closeRemind;
    document.getElementById("rmStart").onclick = function(){
      var wa = document.getElementById("rmWa").checked, mail = document.getElementById("rmMail").checked;
      if(!wa && !mail){ showToast("Elegí WhatsApp, mail o los dos."); return; }
      todo.forEach(function(b){
        if(wa && b.phone) rem.steps.push({b: b, ch: "wa"});
        if(mail && b.email) rem.steps.push({b: b, ch: "mail"});
      });
      if(!rem.steps.length){ showToast("Esos clientes no tienen ese dato de contacto."); return; }
      remindStep();
    };
  }

  function remindStep(){
    var box = document.getElementById("remindBox");
    if(!rem) return;
    if(rem.i >= rem.steps.length){
      var clients = Object.keys(rem.done).length;
      box.innerHTML = '<h3>¡Listo!</h3><p>Mandaste '+rem.sent+(rem.sent === 1 ? ' recordatorio' : ' recordatorios')+' a '+clients+(clients === 1 ? ' cliente' : ' clientes')+'. Quedaron marcados como avisados y registrados en Movimientos.</p>' +
        '<button class="btn btn-primary" id="rmEnd">Cerrar</button>';
      document.getElementById("rmEnd").onclick = closeRemind;
      return;
    }
    var st = rem.steps[rem.i], b = st.b, wa = st.ch === "wa", n = rem.steps.length;
    var href = wa ? reminderWaLink(b) : reminderMailLink(b);
    box.innerHTML = '<div class="rm-progress"><i style="width:'+Math.round(rem.i * 100 / n)+'%"></i></div>' +
      '<div class="rm-step">Paso '+(rem.i + 1)+' de '+n+'</div>' +
      '<h3>'+(wa ? 'WhatsApp' : 'Mail')+' a '+esc(b.name)+' '+esc(b.lastname)+'</h3>' +
      '<p><b>'+b.time+' hs</b>'+(activeBarbers().length > 1 && barberNameOf(b) ? ' · con '+esc(barberNameOf(b)) : '')+' · '+esc(wa ? b.phone : b.email)+'</p>' +
      '<div class="rm-preview">'+esc(reminderText(b))+'</div>' +
      '<a class="btn '+(wa ? 'btn-wa' : 'btn-primary')+'" id="rmGo" href="'+esc(href)+'" target="_blank" rel="noopener">'+(wa ? 'Abrir WhatsApp y enviar' : 'Abrir mail y enviar')+'</a>' +
      '<div class="btn-row" style="margin-top:10px;"><button class="btn btn-ghost" id="rmSkip">Saltar</button><button class="btn btn-ghost" id="rmStop">Cerrar</button></div>';
    document.getElementById("rmGo").onclick = function(){
      markReminded(b.id, st.ch);
      rem.sent++; rem.done[b.id] = 1; rem.i++;
      setTimeout(remindStep, 350);            // el mensaje se abre en otra pestaña o app; acá pasa al siguiente
    };
    document.getElementById("rmSkip").onclick = function(){ rem.i++; remindStep(); };
    document.getElementById("rmStop").onclick = closeRemind;
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

    var myId = isEmployee() ? myBarber() : ownerBarber().id;
    html += '<div class="card"><h2>Mi foto de perfil</h2><div class="sub">La ven tu equipo y los clientes cuando eligen con quién cortarse.</div>' + photoEditHtml(myId) + '</div>';
    html += '<div class="card"><h2>Sesión</h2>' +
      '<div class="sub">Cerrá sesión si usás una computadora que no es tuya.</div>' +
      '<button class="btn btn-ghost" id="btnConfigLogout">Cerrar sesión</button></div>';

    if(isEmployee()) return html;       // el empleado solo ve su cuenta y su sesión
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
    bindPhotoControls();
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
