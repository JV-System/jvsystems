/* =============================================
   MARCACIÓN LABORAL — Portal empleado v4
   JV Systems · Soluciones Digitales
   ============================================= */

let empleados       = [];
let selectedEmp     = null;
let gpsCoords       = null;
let marcTipo        = null;   // 'Entrada' | 'Salida'
let entradaHora     = null;   // hora última Entrada de hoy
let horasRequeridas = 0;      // horas trabajadas (Entrada→Salida)
let marcFecha       = null;
let marcHora        = null;
let proyectos       = [];
let cargaLineas     = [];
let cargaCounter    = 0;

const AVATAR_COLORS = [
  '#3B82F6','#8B5CF6','#EC4899','#10B981',
  '#F59E0B','#EF4444','#06B6D4','#84CC16','#F97316'
];
const empColorMap = {};
function empColor(name) {
  if (!empColorMap[name])
    empColorMap[name] = AVATAR_COLORS[Object.keys(empColorMap).length % AVATAR_COLORS.length];
  return empColorMap[name];
}
function empInitials(name) {
  const p = (name||'').trim().split(/\s+/);
  return p.length >= 2 ? (p[0][0]+p[1][0]).toUpperCase() : (name||'?').substring(0,2).toUpperCase();
}

// ── Init ───────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  loadEmpleados();
  loadProyectos();
  requestGPS();
  document.addEventListener('click', e => {
    if (!e.target.closest('#nameFieldWrap'))
      document.getElementById('autoList').style.display = 'none';
  });
});

async function loadEmpleados() {
  try {
    const r = await fetch(`${CONFIG.SCRIPT_URL}?action=empleados`);
    const d = await r.json();
    if (d.success) empleados = d.empleados;
  } catch {}
}

async function loadProyectos() {
  try {
    const r = await fetch(`${CONFIG.SCRIPT_URL}?action=proyectos`);
    const d = await r.json();
    if (d.success) proyectos = d.proyectos;
  } catch {}
}

// ── GPS ────────────────────────────────────────────────────────────────────

function requestGPS() {
  setGPS('pulse','Obteniendo ubicación...');
  if (!navigator.geolocation) { setGPS('err','GPS no disponible'); return; }
  navigator.geolocation.getCurrentPosition(
    pos => {
      gpsCoords = { lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) };
      setGPS('ok', `Ubicación obtenida (±${Math.round(pos.coords.accuracy)}m)`);
    },
    () => setGPS('err','Sin GPS — se registra sin ubicación'),
    { timeout: 15000, maximumAge: 60000, enableHighAccuracy: true }
  );
}
function setGPS(state, text) {
  const dot = document.getElementById('gpsDot');
  const txt = document.getElementById('gpsText');
  if (dot) dot.className = `gps-dot-d${state==='ok'?' ok':state==='pulse'?' pulse':''}`;
  if (txt) txt.textContent = text;
}

// ── Autocomplete ───────────────────────────────────────────────────────────

function onEmpSearch(val) {
  const q = val.trim().toLowerCase();
  const list = document.getElementById('autoList');
  if (!q) { list.style.display='none'; return; }
  const matches = empleados.filter(e => e.toLowerCase().includes(q)).slice(0,7);
  if (!matches.length) { list.style.display='none'; return; }
  list.innerHTML = matches.map(e =>
    `<div class="ac-item" onclick="selectEmp('${e.replace(/'/g,"\\'")}')">
       <div class="ac-init" style="background:${empColor(e)}">${empInitials(e)}</div>
       ${e}
     </div>`).join('');
  list.style.display = 'block';
}
function showAutoList() { onEmpSearch(document.getElementById('empSearch').value); }

function selectEmp(name) {
  selectedEmp = name;
  document.getElementById('empSearch').value = name;
  document.getElementById('autoList').style.display = 'none';
  const av = document.getElementById('portalAvatar');
  av.style.background = empColor(name);
  av.textContent = empInitials(name);
  av.classList.add('found');
  document.getElementById('dniSection').style.display = 'block';
  document.getElementById('loginHint').style.display  = 'none';
  document.getElementById('loginError').style.display = 'none';
  setTimeout(() => document.getElementById('dniInput').focus(), 80);
}

function clearEmpSearch() {
  document.getElementById('empSearch').value = '';
  document.getElementById('autoList').style.display = 'none';
  document.getElementById('dniSection').style.display = 'none';
  document.getElementById('loginHint').style.display  = 'block';
  selectedEmp = null;
  const av = document.getElementById('portalAvatar');
  av.style.background=''; av.textContent='?'; av.classList.remove('found');
}

// ── Login DNI ──────────────────────────────────────────────────────────────

async function doLogin() {
  const dni   = document.getElementById('dniInput').value.trim();
  const errEl = document.getElementById('loginError');
  if (!selectedEmp) { showPortalToast('Seleccioná tu nombre primero','error'); return; }
  if (!dni)         { errEl.textContent='Ingresá tu DNI'; errEl.style.display='block'; return; }
  errEl.style.display = 'none';
  showPortalLoading('Verificando...');
  try {
    const vr = await fetch(`${CONFIG.SCRIPT_URL}?action=validarDNI&empleado=${encodeURIComponent(selectedEmp)}&dni=${encodeURIComponent(dni)}`);
    const vd = await vr.json();
    if (!vd.success) {
      hidePortalLoading();
      errEl.textContent = vd.error || 'DNI incorrecto';
      errEl.style.display = 'block';
      document.getElementById('dniInput').value = '';
      document.getElementById('dniInput').focus();
      return;
    }
    const tr = await fetch(`${CONFIG.SCRIPT_URL}?action=tipoSugerido&empleado=${encodeURIComponent(selectedEmp)}`);
    const td = await tr.json();
    hidePortalLoading();
    marcTipo    = td.tipo          || 'Entrada';
    entradaHora = td.ultimaEntrada || null;
    goToMarcScreen();
  } catch {
    hidePortalLoading();
    showPortalToast('Error de conexión','error');
  }
}

// ── Pantalla marcación ─────────────────────────────────────────────────────

function goToMarcScreen() {
  showScreen('marcScreen');
  const av = document.getElementById('marcAvatar');
  av.style.background = empColor(selectedEmp);
  av.textContent      = empInitials(selectedEmp);
  document.getElementById('marcNombre').textContent = selectedEmp;
  const isEnt = marcTipo === 'Entrada';
  const badge = document.getElementById('marcBadge');
  badge.textContent = isEnt ? '🟢 Registrando Entrada' : '🔴 Registrando Salida';
  badge.className   = `marc-tipo-badge ${isEnt ? 'entrada' : 'salida'}`;
  document.getElementById('marcBtn').disabled = false;
}
function volverLogin() {
  showScreen('loginScreen');
  document.getElementById('dniInput').value = '';
}

// ── Submit marcación ───────────────────────────────────────────────────────

async function submitMarcacion() {
  document.getElementById('marcBtn').disabled = true;
  showPortalLoading('Registrando marcación...');
  try {
    const res  = await fetch(`${CONFIG.SCRIPT_URL}?action=marcar&empleado=${encodeURIComponent(selectedEmp)}&tipo=${marcTipo}&lat=${gpsCoords?.lat||''}&lng=${gpsCoords?.lng||''}`);
    const data = await res.json();
    hidePortalLoading();
    if (data.success) {
      marcFecha = data.fecha;
      marcHora  = data.hora;
      if (marcTipo === 'Salida') {
        calcularHorasRequeridas(data.hora);
        goToCargaScreen();
      } else {
        goToSuccessScreen(false);
      }
    } else {
      showPortalToast(data.error || 'Error al registrar','error');
      document.getElementById('marcBtn').disabled = false;
    }
  } catch {
    hidePortalLoading();
    showPortalToast('Error de conexión','error');
    document.getElementById('marcBtn').disabled = false;
  }
}

// ── Cálculo horas requeridas ───────────────────────────────────────────────

function calcularHorasRequeridas(horaSalida) {
  if (!entradaHora) { horasRequeridas = 0; return; }
  const toMin = t => { const p=(t||'').split(':').map(Number); return (p[0]||0)*60+(p[1]||0); };
  const diffMin = toMin(horaSalida) - toMin(entradaHora);
  horasRequeridas = diffMin > 0 ? Math.round(diffMin/60*2)/2 : 0;
}

// ── Pantalla carga de horas ────────────────────────────────────────────────

function goToCargaScreen() {
  cargaLineas = []; cargaCounter = 0;
  showScreen('cargaScreen');
  // Mostrar horas requeridas en el indicador
  const reqEl = document.getElementById('horasReqVal');
  if (reqEl) reqEl.textContent = horasRequeridas > 0 ? `${horasRequeridas} h` : '—';
  document.getElementById('cargaLineas').innerHTML = '';
  addCargaLinea();
  updateCargaTotal();
}

function addCargaLinea() {
  cargaCounter++;
  const id   = `cl${cargaCounter}`;
  const hDef = horasRequeridas > 0 ? horasRequeridas : 8;
  cargaLineas.push({ id, ot:'', nombreOt:'', item:'', horas: hDef });

  const otOpts = proyectos.map(p =>
    `<option value="${esc(p['Número OT'])}" data-nombre="${esc(p['Nombre'])}">OT ${esc(p['Número OT'])} — ${esc(p['Nombre'])}</option>`
  ).join('');

  const div = document.createElement('div');
  div.className = 'carga-linea'; div.id = id;
  div.innerHTML = `
    <div class="carga-linea-header">
      <span class="carga-linea-num">Línea ${cargaCounter}</span>
      <button class="carga-remove" id="${id}_rem" onclick="removeCargaLinea('${id}')">✕</button>
    </div>
    <select class="carga-sel" id="${id}_ot" onchange="onOTChange('${id}')">
      <option value="">— Seleccioná OT / Proyecto —</option>${otOpts}
    </select>
    <select class="carga-sel" id="${id}_item" disabled onchange="onItemChange('${id}')">
      <option value="">Primero seleccioná una OT</option>
    </select>
    <div class="horas-row" style="margin-top:.5rem">
      <button class="h-step" onclick="stepHoras('${id}',-0.5)">−</button>
      <input class="h-val" type="number" id="${id}_hs" value="${hDef}" min="0.5" max="24" step="0.5" oninput="onHorasChange('${id}')">
      <button class="h-step" onclick="stepHoras('${id}',0.5)">+</button>
      <span class="h-unit">horas</span>
    </div>`;
  document.getElementById('cargaLineas').appendChild(div);
  updateRemoveBtns(); updateCargaTotal();
}

function removeCargaLinea(id) {
  cargaLineas = cargaLineas.filter(l => l.id !== id);
  document.getElementById(id)?.remove();
  updateRemoveBtns(); updateCargaTotal();
}
function updateRemoveBtns() {
  document.querySelectorAll('[id$="_rem"]').forEach(b => { b.style.display = cargaLineas.length > 1 ? '' : 'none'; });
}

async function onOTChange(id) {
  const sel     = document.getElementById(`${id}_ot`);
  const itemSel = document.getElementById(`${id}_item`);
  const lin     = cargaLineas.find(l => l.id === id);
  const ot      = sel.value;
  if (!ot) { itemSel.innerHTML='<option>Primero seleccioná una OT</option>'; itemSel.disabled=true; if(lin){lin.ot='';lin.item='';} return; }
  const nombre = sel.options[sel.selectedIndex].dataset.nombre || '';
  if (lin) { lin.ot=ot; lin.nombreOt=nombre; lin.item=''; }
  itemSel.innerHTML = '<option>Cargando...</option>'; itemSel.disabled = true;
  try {
    const r = await fetch(`${CONFIG.SCRIPT_URL}?action=items&ot=${encodeURIComponent(ot)}`);
    const d = await r.json();
    if (d.success && d.items.length > 0) {
      itemSel.innerHTML = '<option value="">— Seleccioná una tarea —</option>' +
        d.items.map(it => `<option value="${esc(it['Código'])}">${esc(it['Código'])} — ${esc(it['Descripción'])}</option>`).join('');
      itemSel.disabled = false;
    } else { itemSel.innerHTML='<option value="General">General</option>'; itemSel.disabled=false; if(lin)lin.item='General'; }
  } catch { itemSel.innerHTML='<option value="General">General</option>'; itemSel.disabled=false; }
}

function onItemChange(id) { const l=cargaLineas.find(l=>l.id===id); if(l) l.item=document.getElementById(`${id}_item`).value; }
function stepHoras(id, delta) {
  const inp = document.getElementById(`${id}_hs`);
  inp.value = Math.max(0.5, Math.min(24, Math.round((parseFloat(inp.value||0)+delta)*2)/2));
  onHorasChange(id);
}
function onHorasChange(id) {
  const l = cargaLineas.find(l=>l.id===id);
  if (l) l.horas = parseFloat(document.getElementById(`${id}_hs`).value)||0;
  updateCargaTotal();
}

function updateCargaTotal() {
  const total = Math.round(cargaLineas.reduce((s,l)=>s+(l.horas||0),0)*10)/10;
  document.getElementById('cargaTotalVal').textContent = total + ' h';
  updateValidacion(total);
}

function updateValidacion(totalCargado) {
  const el = document.getElementById('horasValidacion');
  if (!el || horasRequeridas <= 0) { if(el) el.style.display='none'; return; }
  if (totalCargado === 0) { el.style.display='none'; return; }
  const diff = Math.abs(totalCargado - horasRequeridas);
  const ok   = diff <= 0.5;
  el.style.display     = 'flex';
  el.style.background  = ok ? 'rgba(16,185,129,.1)'  : 'rgba(239,68,68,.08)';
  el.style.borderColor = ok ? 'rgba(16,185,129,.28)' : 'rgba(239,68,68,.25)';
  el.innerHTML = ok
    ? `<span style="color:#34d399;font-size:.8rem">✅ Horas correctas — coincide con las ${horasRequeridas}h trabajadas</span>`
    : `<span style="color:#f87171;font-size:.8rem">⚠️ Diferencia de ${Math.round(Math.abs(totalCargado-horasRequeridas)*10)/10}h respecto a las ${horasRequeridas}h trabajadas</span>`;
}

async function submitCarga() {
  const validas = cargaLineas.filter(l => l.ot && l.horas > 0);
  if (!validas.length) { showPortalToast('Seleccioná al menos una OT','error'); return; }

  const total = Math.round(validas.reduce((s,l)=>s+l.horas,0)*10)/10;
  if (horasRequeridas > 0 && Math.abs(total - horasRequeridas) > 0.5) {
    if (!confirm(
      `Las horas cargadas (${total}h) no coinciden con las horas trabajadas (${horasRequeridas}h).\n`+
      `Diferencia: ${Math.round(Math.abs(total-horasRequeridas)*10)/10}h\n\n¿Enviás igual?`
    )) return;
  }

  showPortalLoading('Guardando horas...');
  let allOk = true;
  for (const lin of validas) {
    try {
      const p = new URLSearchParams({ empleado:selectedEmp, ot:lin.ot, nombreOt:lin.nombreOt, item:lin.item||'General', horas:lin.horas, fecha:marcFecha });
      const r = await fetch(`${CONFIG.SCRIPT_URL}?action=cargarHoras&${p}`);
      const d = await r.json();
      if (!d.success) allOk = false;
    } catch { allOk = false; }
  }
  hidePortalLoading();
  if (allOk) goToSuccessScreen(true);
  else showPortalToast('Error al guardar algunas horas','error');
}

function skipCarga() { goToSuccessScreen(false); }

// ── Success ────────────────────────────────────────────────────────────────

function goToSuccessScreen(conHoras) {
  showScreen('successScreen');
  const isEnt  = marcTipo === 'Entrada';
  const icon   = document.getElementById('sucIcon');
  icon.textContent = isEnt ? '✅' : '👋';
  icon.className   = `suc-icon ${isEnt ? 'entrada' : 'salida'}`;
  document.getElementById('sucTitle').textContent = isEnt ? '¡Bienvenido! Entrada registrada' : '¡Hasta luego! Salida registrada';
  document.getElementById('sucSub').textContent   = conHoras ? 'Marcación y horas de proyecto guardadas' : 'Marcación guardada correctamente';
  const totalCarg = Math.round(cargaLineas.reduce((s,l)=>s+(l.horas||0),0)*10)/10;
  document.getElementById('sucDetails').innerHTML = `
    <div class="suc-row"><span class="lbl">Empleado</span><span class="val">${esc(selectedEmp)}</span></div>
    <div class="suc-row"><span class="lbl">Tipo</span><span class="val">${marcTipo}</span></div>
    <div class="suc-row"><span class="lbl">Fecha</span><span class="val">${marcFecha||'—'}</span></div>
    <div class="suc-row"><span class="lbl">Hora</span><span class="val">${marcHora||'—'}</span></div>
    ${!isEnt&&totalCarg>0?`<div class="suc-row"><span class="lbl">Horas imputadas</span><span class="val" style="color:#ff8c00">${totalCarg}h</span></div>`:''}
    ${gpsCoords?`<div class="suc-row"><span class="lbl">GPS</span><span class="val" style="font-size:.76rem">${gpsCoords.lat}, ${gpsCoords.lng}</span></div>`:''}`;
}

// ── Reset ──────────────────────────────────────────────────────────────────

function resetPortal() {
  selectedEmp=null; gpsCoords=null; marcTipo=null; entradaHora=null;
  horasRequeridas=0; marcFecha=null; marcHora=null; cargaLineas=[]; cargaCounter=0;
  document.getElementById('empSearch').value=''; document.getElementById('dniInput').value='';
  document.getElementById('dniSection').style.display='none';
  document.getElementById('loginHint').style.display='block';
  const av=document.getElementById('portalAvatar'); av.style.background=''; av.textContent='?'; av.classList.remove('found');
  showScreen('loginScreen');
  requestGPS();
}

function showScreen(id) {
  ['loginScreen','marcScreen','cargaScreen','successScreen'].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.style.display = s===id ? 'block' : 'none';
  });
}
function showPortalLoading(txt) { document.getElementById('loadingTxt').textContent=txt; document.getElementById('portalLoading').style.display='flex'; }
function hidePortalLoading()    { document.getElementById('portalLoading').style.display='none'; }
function showPortalToast(msg, type='') {
  const t=document.getElementById('portalToast'); t.textContent=msg; t.className=`portal-toast ${type} show`;
  setTimeout(()=>t.classList.remove('show'),3500);
}
function esc(s) { return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
