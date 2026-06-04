/* =============================================
   MARCACIÓN LABORAL — Dashboard
   JV Systems · Soluciones Digitales
   ============================================= */

const ADMIN_USER = 'admin'; // usuario fijo (configurable aquí)

let adminPass        = '';
let allData          = [];
let allJornadas      = [];
let allHorasProyecto = [];
let currentTab  = 'jornada';
let activeChip  = null;

// Paleta de colores por empleado (avatar)
const AVATAR_COLORS = [
  '#3B82F6','#8B5CF6','#EC4899','#10B981','#F59E0B',
  '#EF4444','#06B6D4','#84CC16','#F97316','#6366F1'
];
const empColorMap = {};
function empColor(name) {
  if (!empColorMap[name]) {
    const keys = Object.keys(empColorMap);
    empColorMap[name] = AVATAR_COLORS[keys.length % AVATAR_COLORS.length];
  }
  return empColorMap[name];
}
function empInitials(name) {
  const parts = (name||'').trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : (name||'?').substring(0,2).toUpperCase();
}
function avatarHtml(name, size = 34) {
  const color    = empColor(name);
  const initials = empInitials(name);
  return `<div class="emp-avatar" style="background:${color};width:${size}px;height:${size}px;font-size:${size*0.28}px">${initials}</div>`;
}

// ── Auth ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const p = document.getElementById('loginPass');
  const u = document.getElementById('loginUser');
  if (p) p.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  if (u) u.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('loginPass')?.focus(); });
});

function splashDone() {
  const saved = sessionStorage.getItem('ml_pass');
  if (saved) {
    adminPass = saved;
    document.getElementById('dashPage').classList.remove('hidden');
    initDashboard();
  } else {
    document.getElementById('loginPage').classList.remove('hidden');
  }
}

async function doLogin() {
  const user  = (document.getElementById('loginUser')?.value || '').trim();
  const pass  = document.getElementById('loginPass').value;
  const btn   = document.getElementById('loginBtn');
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';

  if (!user || !pass) { errEl.textContent = 'Ingresá usuario y contraseña'; return; }
  if (user !== ADMIN_USER) { errEl.textContent = 'Usuario incorrecto'; return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Verificando...';
  try {
    const res  = await fetch(`${CONFIG.SCRIPT_URL}?action=login&pass=${encodeURIComponent(pass)}`);
    const data = await res.json();
    if (data.success) {
      adminPass = pass;
      sessionStorage.setItem('ml_pass', pass);
      document.getElementById('loginPage').classList.add('hidden');
      document.getElementById('dashPage').classList.remove('hidden');
      initDashboard();
    } else {
      errEl.textContent = data.error || 'Contraseña incorrecta';
    }
  } catch { errEl.textContent = 'Error de conexión.'; }
  finally  { btn.disabled = false; btn.textContent = 'Ingresar al panel'; }
}

function logout() {
  sessionStorage.removeItem('ml_pass');
  adminPass = ''; allData = []; allJornadas = []; allHorasProyecto = [];
  destroyCharts();
  document.getElementById('loginPage').classList.remove('hidden');
  document.getElementById('dashPage').classList.add('hidden');
  document.getElementById('loginPass').value = '';
  if (document.getElementById('loginUser')) document.getElementById('loginUser').value = '';
}

// ── Init ───────────────────────────────────────────────────────────────────

async function initDashboard() {
  document.getElementById('filterFrom').value = daysAgoISO(30);
  document.getElementById('filterTo').value   = todayISO();
  await Promise.all([loadEmpleados(), loadData()]);
}

async function loadEmpleados() {
  try {
    const res  = await fetch(`${CONFIG.SCRIPT_URL}?action=empleados`);
    const data = await res.json();
    if (data.success) {
      const sel = document.getElementById('filterEmpleado');
      while (sel.options.length > 1) sel.remove(1);
      data.empleados.forEach(emp => {
        empColor(emp); // pre-asignar color
        const o = document.createElement('option');
        o.value = emp; o.textContent = emp;
        sel.appendChild(o);
      });
    }
  } catch { /* no crítico */ }
}

// ── Tabs ───────────────────────────────────────────────────────────────────

function switchTab(tab) {
  currentTab = tab;
  ['jornada','marcaciones','proyectos'].forEach(t => {
    document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1))
      .classList.toggle('tab-active', t === tab);
    document.getElementById('view' + t.charAt(0).toUpperCase() + t.slice(1))
      .classList.toggle('hidden', t !== tab);
  });
  if (tab === 'jornada')       renderJornada(allJornadas);
  else if (tab === 'marcaciones') renderMarcaciones(allData);
  else                            renderProyectos(allHorasProyecto);
}

// ── Quick Chips ────────────────────────────────────────────────────────────

function toggleChip(tipo) {
  activeChip = activeChip === tipo ? null : tipo;
  ['sinSalida','sinEntrada','presentes'].forEach(t => {
    const id = 'chip' + t.charAt(0).toUpperCase() + t.slice(1);
    document.getElementById(id)?.classList.toggle('active-chip', activeChip === t);
  });
  renderJornada(allJornadas);
}

// ── Carga ──────────────────────────────────────────────────────────────────

async function loadData() {
  setLoading(true);
  const from     = document.getElementById('filterFrom').value;
  const to       = document.getElementById('filterTo').value;
  const empleado = document.getElementById('filterEmpleado').value;

  try {
    const base = new URLSearchParams({ pass: adminPass, from, to, empleado });
    const [rj, rm, rhp] = await Promise.all([
      fetch(`${CONFIG.SCRIPT_URL}?action=jornada&${base}`),
      fetch(`${CONFIG.SCRIPT_URL}?action=marcaciones&${base}`),
      fetch(`${CONFIG.SCRIPT_URL}?action=horasProyecto&${base}`)
    ]);
    const [dj, dm, dhp] = await Promise.all([rj.json(), rm.json(), rhp.json()]);
    if (!dj.success) {
      if (dj.error === 'No autorizado') { logout(); return; }
      showToast('Error del servidor: ' + dj.error, 'error'); return;
    }

    allJornadas      = dj.data  || [];
    allData          = dm.data  || [];
    allHorasProyecto = dhp.data || [];

    // Merge horas cargadas
    const hpMap = {};
    allHorasProyecto.forEach(hp => {
      const k = hp['Empleado'] + '|' + hp['Fecha'];
      hpMap[k] = (hpMap[k] || 0) + parseFloat(hp['Horas'] || 0);
    });
    allJornadas.forEach(j => {
      j['Cargadas'] = rnd1(hpMap[j.Empleado + '|' + j.Fecha] || 0);
    });

    updateStats(allJornadas);
    updateKPIBar(allJornadas);
    if (currentTab === 'jornada')          renderJornada(allJornadas);
    else if (currentTab === 'marcaciones') renderMarcaciones(allData);
    else                                   renderProyectos(allHorasProyecto);
  } catch(e) {
    showToast('Error al conectar con el servidor', 'error');
  } finally { setLoading(false); }
}

function clearFilters() {
  document.getElementById('filterFrom').value     = daysAgoISO(30);
  document.getElementById('filterTo').value       = todayISO();
  document.getElementById('filterEmpleado').value = 'todos';
  document.getElementById('filterTipo').value     = 'todos';
  activeChip = null;
  ['chipSinSalida','chipSinEntrada','chipPresentes'].forEach(id =>
    document.getElementById(id)?.classList.remove('active-chip'));
  loadData();
}

// ── Stats Cards ────────────────────────────────────────────────────────────

function updateStats(jornadas) {
  const totalMin  = jornadas.reduce((s,j) => s + (Number(j['Total Min'])||0), 0);
  const sinSalida = jornadas.filter(j => j.Estado === 'Sin Salida').length;
  const h = Math.floor(totalMin/60), m = totalMin%60;
  document.getElementById('statTotal').textContent    = jornadas.length;
  document.getElementById('statHoras').textContent    = totalMin > 0 ? `${h}h ${m}m` : '—';
  document.getElementById('statAusentes').textContent = sinSalida;
}

function updateKPIBar(jornadas) {
  const presentes  = jornadas.filter(j => j.Estado === 'Presente').length;
  const sinSalida  = jornadas.filter(j => j.Estado === 'Sin Salida').length;
  const sinEntrada = jornadas.filter(j => j.Estado === 'Sin Entrada').length;
  const total      = jornadas.length;
  const pct        = total > 0 ? Math.round((presentes + sinSalida) / total * 100) : 0;
  let totalMin = 0, hsNorm = 0, hs50 = 0, hs100 = 0;
  jornadas.forEach(j => {
    totalMin += Number(j['Total Min'])    || 0;
    hsNorm   += Number(j['HS Normales']) || 0;
    hs50     += Number(j['HS 50'])       || 0;
    hs100    += Number(j['HS 100'])      || 0;
  });
  document.getElementById('kpiPresentes').textContent  = presentes;
  document.getElementById('kpiAusentes').textContent   = sinEntrada;
  document.getElementById('kpiSinSalida').textContent  = sinSalida;
  document.getElementById('kpiFeriados').textContent   = sinEntrada;
  document.getElementById('kpiAsistencia').textContent = pct + '%';
  document.getElementById('kpiHsTotales').textContent  = rnd1(totalMin / 60);
  document.getElementById('kpiHsNorm').textContent     = rnd1(hsNorm);
  document.getElementById('kpiHs50').textContent       = rnd1(hs50);
  document.getElementById('kpiHs100').textContent      = rnd1(hs100);
}

// ── Render Jornada ─────────────────────────────────────────────────────────

function renderJornada(jornadas) {
  const tbody   = document.getElementById('jornadaBody');
  const countEl = document.getElementById('tableCount');
  const tipoFil = document.getElementById('filterTipo').value;

  let filtered = jornadas;
  if (tipoFil === 'Entrada') filtered = jornadas.filter(j => j.Ingreso && !j.Salida);
  else if (tipoFil === 'Salida') filtered = jornadas.filter(j => j.Salida);
  if (activeChip === 'sinSalida')  filtered = filtered.filter(j => j.Estado === 'Sin Salida');
  if (activeChip === 'sinEntrada') filtered = filtered.filter(j => j.Estado === 'Sin Entrada');
  if (activeChip === 'presentes')  filtered = filtered.filter(j => j.Estado === 'Presente');

  countEl.textContent = `${filtered.length} jornada${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="no-data"><div class="no-data-icon">📭</div>
      <p>No hay jornadas para los filtros seleccionados</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(j => {
    const min    = Number(j['Total Min']) || 0;
    const sinSal = j.Estado === 'Sin Salida';
    const sinEnt = j.Estado === 'Sin Entrada';
    const rowCls = sinSal ? 'row-warning' : sinEnt ? 'row-absent' : '';

    let totalBadge;
    if (sinEnt)      totalBadge = '<span class="horas-badge sin-salida">❌ Sin entrada</span>';
    else if (sinSal) totalBadge = '<span class="horas-badge sin-salida">⚠️ Sin salida</span>';
    else if (min >= 540) totalBadge = `<span class="horas-badge overtime">🟢 ${j['Total Horas']}</span>`;
    else if (min >= 360) totalBadge = `<span class="horas-badge normal">🔵 ${j['Total Horas']}</span>`;
    else totalBadge = `<span class="horas-badge short">🔴 ${j['Total Horas']}</span>`;

    let estadoBadge;
    if (sinEnt)      estadoBadge = '<span class="estado-badge estado-sin-entrada">❌ Sin entrada</span>';
    else if (sinSal) estadoBadge = '<span class="estado-badge estado-sin-salida">⚠️ Sin salida</span>';
    else             estadoBadge = '<span class="estado-badge estado-presente">✅ Presente</span>';

    const carg = j['Cargadas'] || 0;
    let cargHtml;
    if (carg > 0) {
      const totalH = Number(j['Total Min'] || 0) / 60;
      const ok = Math.abs(rnd1(totalH - carg)) <= 0.5;
      cargHtml = `<span class="hs-cell" style="background:${ok?'#EFF6FF':'#FFFBEB'};color:${ok?'#1565C0':'#D97706'}">${carg}h</span>`;
    } else {
      cargHtml = `<span class="hs-cell hs-empty">—</span>`;
    }

    const hsN    = j['HS Normales'] || 0;
    const hs50v  = j['HS 50']       || 0;
    const hs100v = j['HS 100']      || 0;
    const hsNormHtml = hsN    > 0 ? `<span class="hs-cell hs-norm">${hsN}</span>`   : `<span class="hs-cell hs-empty">—</span>`;
    const hs50Html   = hs50v  > 0 ? `<span class="hs-cell hs-50">${hs50v}</span>`   : `<span class="hs-cell hs-empty">—</span>`;
    const hs100Html  = hs100v > 0 ? `<span class="hs-cell hs-100">${hs100v}</span>` : `<span class="hs-cell hs-empty">—</span>`;

    const empName = escHtml(j.Empleado);
    const salidaCell = sinSal
      ? `<button class="btn-admin success-btn"
           onclick="requirePass('salida','${empName.replace(/'/g,"\\'")}','${escHtml(j.Fecha)}')">
           ➕ Agregar salida</button>`
      : `<span class="${sinEnt ? '' : 'time-out'}">${j.Salida ? j.Salida.substring(0,5) : '—'}</span>`;

    return `<tr class="${rowCls}">
      <td>
        <div class="emp-cell">
          ${avatarHtml(j.Empleado)}
          <div><div class="emp-name">${empName}</div></div>
        </div>
      </td>
      <td><span class="fecha-chip">${escHtml(j.Fecha)}</span></td>
      <td>${estadoBadge}</td>
      <td><span class="${sinEnt ? '' : 'time-in'}">${j.Ingreso ? j.Ingreso.substring(0,5) : '—'}</span></td>
      <td>${salidaCell}</td>
      <td>${totalBadge}</td>
      <td>${cargHtml}</td>
      <td>${hsNormHtml}</td>
      <td>${hs50Html}</td>
      <td>${hs100Html}</td>
    </tr>`;
  }).join('');
}

// ── Render Marcaciones ─────────────────────────────────────────────────────

function renderMarcaciones(rows) {
  const tbody   = document.getElementById('marcBody');
  const tipoFil = document.getElementById('filterTipo').value;
  const filtered = tipoFil === 'todos' ? rows : rows.filter(r => r['Tipo'] === tipoFil);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="no-data"><div class="no-data-icon">📭</div><p>Sin resultados</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(row => {
    const lat = row['Latitud'], lng = row['Longitud'];
    const gps = (lat && lng && lat !== '-')
      ? `<a class="map-link" href="https://maps.google.com/?q=${lat},${lng}" target="_blank">📍 Ver</a>`
      : `<span style="color:var(--gray-300)">—</span>`;
    const cls  = row['Tipo'] === 'Entrada' ? 'badge-entrada' : 'badge-salida';
    const icon = row['Tipo'] === 'Entrada' ? '🟢' : '🔴';
    const id   = escHtml(row['ID']);
    const tipo = escHtml(row['Tipo']);
    const fech = escHtml(row['Fecha']);
    const hora = escHtml(row['Hora']);
    return `<tr>
      <td><code style="font-size:.72rem;color:var(--gray-400)">${id}</code></td>
      <td>
        <div class="emp-cell">
          ${avatarHtml(row['Empleado'], 28)}
          <strong>${escHtml(row['Empleado'])}</strong>
        </div>
      </td>
      <td><span class="badge ${cls}">${icon} ${tipo}</span></td>
      <td>${fech}</td>
      <td>${hora}</td>
      <td>${gps}</td>
      <td style="white-space:nowrap;text-align:center">
        <button class="btn-admin"
          onclick="requirePass('edit','${id}','${tipo}','${fech}','${hora}')">✏️ Editar</button>
        <button class="btn-admin danger"
          onclick="requirePass('delete','${id}')" style="margin-left:.3rem">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

// ── Render Proyectos ───────────────────────────────────────────────────────

let _chartEmpleado = null;
let _chartOT       = null;
let _chartTarea    = null;

function destroyCharts() {
  [['chartEmpleado', '_chartEmpleado'], ['chartOT', '_chartOT'], ['chartTarea', '_chartTarea']].forEach(([id]) => {
    const el = document.getElementById(id);
    if (el && typeof Chart !== 'undefined') {
      const existing = Chart.getChart(el);
      if (existing) existing.destroy();
    }
  });
  _chartEmpleado = null; _chartOT = null; _chartTarea = null;
}

function onFilterOT() {
  renderProyectos(allHorasProyecto);
}

function renderProyectos(rows) {
  const tbody   = document.getElementById('proyBody');
  const countEl = document.getElementById('tableCountProy');

  // Poblar filtro OT
  const filterOTEl = document.getElementById('filterOT');
  if (filterOTEl) {
    const otSet = new Set(rows.map(r => r['OT']));
    const selectedOT = filterOTEl.value;
    filterOTEl.innerHTML = '<option value="todos">Todas las OTs</option>' +
      [...otSet].map(ot => {
        const nombre = rows.find(r => r['OT'] === ot)?.['Nombre OT'] || ot;
        return `<option value="${escHtml(ot)}" ${selectedOT===ot?'selected':''}>OT ${escHtml(ot)} — ${escHtml(nombre)}</option>`;
      }).join('');
  }

  // Aplicar filtro OT
  const otFil = filterOTEl?.value || 'todos';
  const filtered = otFil === 'todos' ? rows : rows.filter(r => r['OT'] === otFil);

  countEl.textContent = `${filtered.length} registro${filtered.length !== 1 ? 's' : ''}`;

  // ── KPI cards ──
  const totalHS = rnd1(filtered.reduce((s,r) => s + parseFloat(r['Horas']||0), 0));
  const empSet2 = new Set(filtered.map(r => r['Empleado']));
  const otSet2  = new Set(filtered.map(r => r['OT']));
  const avgEmp  = empSet2.size > 0 ? rnd1(totalHS / empSet2.size) : 0;
  const kpisEl  = document.getElementById('proyKpis');
  if (kpisEl) kpisEl.innerHTML = [
    { val: totalHS,      lbl: 'HS totales imputadas' },
    { val: empSet2.size, lbl: 'Empleados activos' },
    { val: otSet2.size,  lbl: 'OTs trabajadas' },
    { val: avgEmp,       lbl: 'HS prom. por empleado' },
  ].map(k => `<div class="proy-kpi"><div class="proy-kpi-val">${k.val}</div><div class="proy-kpi-lbl">${k.lbl}</div></div>`).join('');

  // ── Charts ──
  destroyCharts();
  const chartColors = ['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444','#06B6D4','#84CC16','#F97316','#EC4899'];

  // Chart 1: Bar horas por empleado
  const empMap = {};
  filtered.forEach(r => { empMap[r['Empleado']] = rnd1((empMap[r['Empleado']]||0) + parseFloat(r['Horas']||0)); });
  const empLabels = Object.keys(empMap).sort((a,b) => empMap[b]-empMap[a]);
  const ctxEmp = document.getElementById('chartEmpleado')?.getContext('2d');
  if (ctxEmp && empLabels.length > 0) {
    _chartEmpleado = new Chart(ctxEmp, {
      type: 'bar',
      data: {
        labels: empLabels.map(e => e.split(' ')[0]),
        datasets: [{ label:'Horas', data: empLabels.map(e=>empMap[e]),
          backgroundColor: empLabels.map(e => empColor(e)+'BB'),
          borderColor: empLabels.map(e => empColor(e)),
          borderWidth: 2, borderRadius: 6 }]
      },
      options: {
        responsive:true, maintainAspectRatio:false, indexAxis:'y',
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>` ${c.raw} h`}} },
        scales:{
          x:{ grid:{color:'#f1f5f9'}, ticks:{font:{size:10}, callback:v=>v+'h'} },
          y:{ grid:{display:false}, ticks:{font:{size:10}} }
        }
      }
    });
  }

  // Chart 2: Donut por OT
  const otMap = {};
  filtered.forEach(r => { const k=`OT ${r['OT']}`; otMap[k]=rnd1((otMap[k]||0)+parseFloat(r['Horas']||0)); });
  const otLabels = Object.keys(otMap);
  const ctxOT = document.getElementById('chartOT')?.getContext('2d');
  if (ctxOT && otLabels.length > 0) {
    _chartOT = new Chart(ctxOT, {
      type:'doughnut',
      data:{ labels:otLabels, datasets:[{ data:otLabels.map(k=>otMap[k]),
        backgroundColor:chartColors.slice(0,otLabels.length),
        borderWidth:3, borderColor:'white', hoverOffset:8 }] },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{
          legend:{position:'bottom', labels:{font:{size:10},padding:10,boxWidth:11,boxHeight:11}},
          tooltip:{callbacks:{label:c=>` ${c.label}: ${c.raw} h`}}
        },
        cutout:'60%'
      }
    });
  }

  // Chart 3: Bar horas por tarea/ítem
  const tareaMap = {};
  filtered.forEach(r => {
    const k = r['Item'] || 'General';
    tareaMap[k] = rnd1((tareaMap[k]||0) + parseFloat(r['Horas']||0));
  });
  const tareaLabels = Object.keys(tareaMap).sort((a,b) => tareaMap[b]-tareaMap[a]).slice(0,8);
  const ctxTarea = document.getElementById('chartTarea')?.getContext('2d');
  if (ctxTarea && tareaLabels.length > 0) {
    _chartTarea = new Chart(ctxTarea, {
      type:'bar',
      data:{
        labels: tareaLabels.map(t => t.length > 12 ? t.substring(0,10)+'…' : t),
        datasets:[{ label:'Horas', data:tareaLabels.map(t=>tareaMap[t]),
          backgroundColor: chartColors.map(c=>c+'99'),
          borderColor: chartColors, borderWidth:2, borderRadius:5 }]
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:false}, tooltip:{callbacks:{
          label:c=>` ${c.raw} h`,
          title:items=>tareaLabels[items[0].dataIndex]
        }}},
        scales:{
          x:{grid:{display:false}, ticks:{font:{size:9}}},
          y:{grid:{color:'#f1f5f9'}, ticks:{font:{size:9}, callback:v=>v+'h'}}
        }
      }
    });
  }

  // ── Tabla detalle ──
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="no-data">
      <div class="no-data-icon">📊</div>
      <p>No hay horas cargadas en proyectos para este período</p>
      <p style="font-size:.8rem;color:var(--gray-400);margin-top:.5rem">
        Usá <a href="carga-horas.html" style="color:var(--primary)">Carga de Horas</a> para registrar
      </p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => {
    const horas = parseFloat(r['Horas'] || 0);
    return `<tr>
      <td>
        <div class="emp-cell">
          ${avatarHtml(r['Empleado'], 28)}
          <strong>${escHtml(r['Empleado'])}</strong>
        </div>
      </td>
      <td><span class="fecha-chip">${escHtml(r['Fecha'])}</span></td>
      <td><span style="font-weight:700;color:var(--primary);font-size:.85rem">OT ${escHtml(r['OT'])}</span></td>
      <td style="color:var(--gray-600)">${escHtml(r['Nombre OT'])}</td>
      <td><span style="font-size:.8rem;color:var(--gray-500)">${escHtml(r['Item'])}</span></td>
      <td><span class="hs-cell hs-norm">${horas.toFixed(1)} h</span></td>
    </tr>`;
  }).join('');
}

// ── Password guard ─────────────────────────────────────────────────────────

let _passAction = null;

function requirePass(action, ...args) {
  _passAction = { action, args };
  const subtitles = {
    salida:  'Agregar salida de empleado',
    edit:    'Editar marcación existente',
    delete:  'Eliminar marcación permanentemente'
  };
  document.getElementById('passModalSubtitle').textContent = subtitles[action] || 'Acción de administrador';
  document.getElementById('passModalInput').value  = '';
  document.getElementById('passModalError').style.display = 'none';
  document.getElementById('passModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('passModalInput').focus(), 100);
}

function cancelPassModal() {
  document.getElementById('passModal').classList.add('hidden');
  _passAction = null;
}

function confirmPassModal() {
  const val = document.getElementById('passModalInput').value;
  const errEl = document.getElementById('passModalError');
  if (val !== adminPass) {
    errEl.style.display = 'block';
    document.getElementById('passModalInput').value = '';
    document.getElementById('passModalInput').focus();
    return;
  }
  errEl.style.display = 'none';
  document.getElementById('passModal').classList.add('hidden');

  if (!_passAction) return;
  const { action, args } = _passAction;
  _passAction = null;

  if (action === 'salida')  abrirModalSalida(...args);
  else if (action === 'edit')   abrirModalEditar(...args);
  else if (action === 'delete') confirmarBorrar(args[0]);
}

// ── Modal edición ──────────────────────────────────────────────────────────

let _modalMode = null;
let _modalData = {};

function abrirModalSalida(empleado, fecha) {
  _modalMode = 'addSalida';
  _modalData = { empleado, fecha };
  document.getElementById('modalTitle').textContent    = '➕ Registrar salida';
  document.getElementById('modalInfo').innerHTML       = `<strong>${escHtml(empleado)}</strong><br>${escHtml(fecha)}`;
  document.getElementById('modalTipoGroup').style.display  = 'none';
  document.getElementById('modalFechaGroup').style.display = 'none';
  document.getElementById('modalHoraLabel').textContent    = 'Hora de salida';
  const n = new Date();
  document.getElementById('modalHora').value = String(n.getHours()).padStart(2,'0') + ':' + String(n.getMinutes()).padStart(2,'0');
  document.getElementById('editModal').classList.remove('hidden');
}

function abrirModalEditar(id, tipo, fecha, hora) {
  _modalMode = 'editMarc';
  _modalData = { id };
  document.getElementById('modalTitle').textContent    = '✏️ Editar marcación';
  document.getElementById('modalInfo').innerHTML       = `ID: <strong>${escHtml(id)}</strong>`;
  document.getElementById('modalTipoGroup').style.display  = '';
  document.getElementById('modalFechaGroup').style.display = '';
  document.getElementById('modalHoraLabel').textContent    = 'Hora';
  document.getElementById('modalTipo').value  = tipo;
  document.getElementById('modalFecha').value = fecha;
  document.getElementById('modalHora').value  = hora ? hora.substring(0,5) : '';
  document.getElementById('editModal').classList.remove('hidden');
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('editModal')) return;
  document.getElementById('editModal').classList.add('hidden');
}

async function guardarModal() {
  const btn = document.getElementById('modalSaveBtn');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    if (_modalMode === 'addSalida') {
      const hora = document.getElementById('modalHora').value + ':00';
      const p    = new URLSearchParams({ pass: adminPass,
        empleado: _modalData.empleado, tipo: 'Salida',
        fecha: _modalData.fecha, hora });
      const res  = await fetch(`${CONFIG.SCRIPT_URL}?action=marcarAdmin&${p}`);
      const data = await res.json();
      if (data.success) {
        showToast('✅ Salida registrada correctamente', 'success');
        document.getElementById('editModal').classList.add('hidden');
        await loadData();
      } else { showToast(data.error || 'Error', 'error'); }
    } else if (_modalMode === 'editMarc') {
      const hora  = document.getElementById('modalHora').value + ':00';
      const fecha = document.getElementById('modalFecha').value;
      const tipo  = document.getElementById('modalTipo').value;
      const p     = new URLSearchParams({ pass: adminPass, id: _modalData.id, tipo, fecha, hora });
      const res   = await fetch(`${CONFIG.SCRIPT_URL}?action=editarMarcacion&${p}`);
      const data  = await res.json();
      if (data.success) {
        showToast('✅ Marcación actualizada', 'success');
        document.getElementById('editModal').classList.add('hidden');
        await loadData();
      } else { showToast(data.error || 'Error', 'error'); }
    }
  } catch { showToast('Error de conexión', 'error'); }
  finally  { btn.disabled = false; btn.textContent = 'Guardar cambios'; }
}

async function confirmarBorrar(id) {
  if (!confirm(`¿Eliminar la marcación ${id}?\nEsta acción no se puede deshacer.`)) return;
  try {
    const p    = new URLSearchParams({ pass: adminPass, id });
    const res  = await fetch(`${CONFIG.SCRIPT_URL}?action=borrarMarcacion&${p}`);
    const data = await res.json();
    if (data.success) { showToast('🗑️ Registro eliminado', 'success'); await loadData(); }
    else               showToast(data.error || 'Error', 'error');
  } catch { showToast('Error de conexión', 'error'); }
}

// ── Exportar ───────────────────────────────────────────────────────────────

function exportCSV() {
  if (currentTab === 'jornada') {
    if (!allJornadas.length) { showToast('No hay datos', ''); return; }
    const h = ['Empleado','Fecha','Estado','Ingreso','Salida','Total Horas','Cargadas','HS Normales','HS 50','HS 100'];
    descargar(h, allJornadas, `jornada_${todayISO()}.csv`);
  } else if (currentTab === 'proyectos') {
    if (!allHorasProyecto.length) { showToast('No hay datos', ''); return; }
    const h = ['Empleado','Fecha','OT','Nombre OT','Item','Horas'];
    descargar(h, allHorasProyecto, `proyectos_${todayISO()}.csv`);
  } else {
    if (!allData.length) { showToast('No hay datos', ''); return; }
    const h = ['ID','Empleado','Tipo','Fecha','Hora','Latitud','Longitud'];
    descargar(h, allData, `marcaciones_${todayISO()}.csv`);
  }
}

function descargar(headers, rows, nombre) {
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => `"${(r[h]||'').toString().replace(/"/g,'""')}"`).join(','))
  ].join('\n');
  const blob = new Blob(['﻿'+csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  URL.revokeObjectURL(url);
  showToast('Archivo descargado — abrilo con Excel', 'success');
}

// ── Datos de prueba ────────────────────────────────────────────────────────

async function cargarEjemplos() {
  const btn = document.getElementById('btnEjemplos');
  if (!confirm('¿Cargar datos de prueba?\nSe agregarán ~165 marcaciones de 7 empleados en los últimos 15 días hábiles.')) return;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner spinner-dark"></span> Cargando...';
  try {
    const res  = await fetch(`${CONFIG.SCRIPT_URL}?action=ejemplos&pass=${encodeURIComponent(adminPass)}`);
    const data = await res.json();
    if (data.success) {
      showToast(`✅ ${data.inserted} registros cargados`, 'success');
      await loadEmpleados();
      await loadData();
    } else { showToast(data.error || 'Error', 'error'); }
  } catch { showToast('Error de conexión', 'error'); }
  finally  { btn.disabled = false; btn.innerHTML = '🧪 Datos de prueba'; }
}

// ── Utils ──────────────────────────────────────────────────────────────────

function setLoading(on) {
  if (!on) return;
  const spin = `<div style="margin:0 auto 1rem;width:40px;height:40px;border:3px solid var(--gray-200);border-top-color:var(--primary);border-radius:50%;animation:spin .8s linear infinite"></div>`;
  document.getElementById('jornadaBody').innerHTML  = `<tr><td colspan="10"><div class="no-data">${spin}<p>Cargando...</p></div></td></tr>`;
  document.getElementById('marcBody').innerHTML     = `<tr><td colspan="7"><div class="no-data">${spin}<p>Cargando...</p></div></td></tr>`;
  document.getElementById('proyBody').innerHTML     = `<tr><td colspan="6"><div class="no-data">${spin}<p>Cargando...</p></div></td></tr>`;
}

function rnd1(n)       { return Math.round(n * 10) / 10; }
function todayISO()    { return new Date().toISOString().split('T')[0]; }
function daysAgoISO(n) { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().split('T')[0]; }
function escHtml(s)    { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function showToast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3500);
}
