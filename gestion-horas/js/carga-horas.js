/* =============================================
   CARGA DE HORAS — JV Systems
   Órdenes de Trabajo por empleado
   ============================================= */

let proyectos  = [];
let lineas     = [];
let linCounter = 0;

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('fechaInput').value = todayISO();

  // Pre-seleccionar empleado desde URL ?emp=...
  const urlEmp = new URLSearchParams(window.location.search).get('emp');

  Promise.all([loadEmpleados(urlEmp), loadProyectos()]);
});

// ── Empleados ──────────────────────────────────────────────────────────────

async function loadEmpleados(preselect) {
  const sel = document.getElementById('empleadoSelect');
  try {
    const res  = await fetch(`${CONFIG.SCRIPT_URL}?action=empleados`);
    const data = await res.json();
    if (data.success && data.empleados.length) {
      sel.innerHTML = '<option value="">— Seleccioná tu nombre —</option>';
      data.empleados.forEach(e => {
        const o = document.createElement('option');
        o.value = e; o.textContent = e;
        if (preselect && e === decodeURIComponent(preselect)) o.selected = true;
        sel.appendChild(o);
      });
      sel.disabled = false;
    }
  } catch {
    sel.innerHTML = '<option value="">Error de conexión</option>';
    showToast('No se pudieron cargar los empleados', 'error');
  }
  checkReady();
}

// ── Proyectos / OTs ────────────────────────────────────────────────────────

async function loadProyectos() {
  try {
    const res  = await fetch(`${CONFIG.SCRIPT_URL}?action=proyectos`);
    const data = await res.json();
    if (data.success) proyectos = data.proyectos;
  } catch {
    showToast('Error al cargar proyectos', 'error');
  }
  // Primera línea
  document.getElementById('lineasContainer').innerHTML = '';
  agregarLinea();
}

// ── Líneas OT ──────────────────────────────────────────────────────────────

function agregarLinea() {
  linCounter++;
  const id = `lin${linCounter}`;
  lineas.push({ id, ot: '', nombreOt: '', item: '', horas: 8 });

  const opts = proyectos.map(p =>
    `<option value="${esc(p['Número OT'])}" data-nombre="${esc(p['Nombre'])}">
       ${esc(p['Número OT'])} — ${esc(p['Nombre'])}
     </option>`
  ).join('');

  const div = document.createElement('div');
  div.className = 'linea-ot';
  div.id = id;
  div.innerHTML = `
    <div class="linea-header">
      <span class="linea-num">Línea ${linCounter}</span>
      <button class="btn-remove" id="${id}_rem" onclick="removerLinea('${id}')">✕ Quitar</button>
    </div>
    <div class="form-group">
      <label class="form-label">OT / Proyecto</label>
      <div class="select-wrapper">
        <select class="form-select" id="${id}_ot" onchange="onOTChange('${id}')">
          <option value="">— Seleccioná una OT —</option>
          ${opts}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Ítem / Tarea</label>
      <div class="select-wrapper">
        <select class="form-select" id="${id}_item" disabled onchange="onItemChange('${id}')">
          <option value="">Primero seleccioná una OT</option>
        </select>
      </div>
    </div>
    <div class="form-group" style="margin-bottom:0">
      <label class="form-label">Horas trabajadas en esta OT</label>
      <div class="horas-row">
        <button class="btn-step" onclick="stepHoras('${id}',-0.5)">−</button>
        <input type="number" class="form-input" id="${id}_hs"
               value="8" min="0.5" max="24" step="0.5"
               oninput="onHorasInput('${id}')">
        <button class="btn-step" onclick="stepHoras('${id}',0.5)">+</button>
        <span class="horas-unit">horas</span>
      </div>
    </div>`;

  document.getElementById('lineasContainer').appendChild(div);
  updateRemoveButtons();
  actualizarTotal();
  checkReady();
}

function removerLinea(id) {
  lineas = lineas.filter(l => l.id !== id);
  document.getElementById(id)?.remove();
  updateRemoveButtons();
  actualizarTotal();
  checkReady();
}

function updateRemoveButtons() {
  document.querySelectorAll('[id$="_rem"]').forEach(btn => {
    btn.style.display = lineas.length > 1 ? '' : 'none';
  });
}

// ── Eventos OT / Item ──────────────────────────────────────────────────────

async function onOTChange(id) {
  const otSel   = document.getElementById(`${id}_ot`);
  const itemSel = document.getElementById(`${id}_item`);
  const lin     = lineas.find(l => l.id === id);
  const ot      = otSel.value;

  if (!ot) {
    itemSel.innerHTML = '<option value="">Primero seleccioná una OT</option>';
    itemSel.disabled  = true;
    if (lin) { lin.ot = ''; lin.nombreOt = ''; lin.item = ''; }
    checkReady(); return;
  }

  const selOpt = otSel.options[otSel.selectedIndex];
  if (lin) { lin.ot = ot; lin.nombreOt = selOpt.dataset.nombre || ''; lin.item = ''; }

  itemSel.innerHTML = '<option value="">Cargando ítems...</option>';
  itemSel.disabled  = true;

  try {
    const res  = await fetch(`${CONFIG.SCRIPT_URL}?action=items&ot=${encodeURIComponent(ot)}`);
    const data = await res.json();
    if (data.success && data.items.length > 0) {
      itemSel.innerHTML = '<option value="">— Seleccioná un ítem —</option>' +
        data.items.map(it =>
          `<option value="${esc(it['Código'])}">${esc(it['Código'])} — ${esc(it['Descripción'])}</option>`
        ).join('');
      itemSel.disabled = false;
    } else {
      // Sin ítems definidos: "General"
      itemSel.innerHTML = '<option value="General">General</option>';
      itemSel.disabled  = false;
      if (lin) lin.item = 'General';
    }
  } catch {
    itemSel.innerHTML = '<option value="General">General</option>';
    itemSel.disabled  = false;
    if (lin) lin.item = 'General';
  }
  checkReady();
}

function onItemChange(id) {
  const lin = lineas.find(l => l.id === id);
  if (lin) lin.item = document.getElementById(`${id}_item`).value;
  checkReady();
}

function stepHoras(id, delta) {
  const inp = document.getElementById(`${id}_hs`);
  const v   = Math.round((parseFloat(inp.value || 0) + delta) * 2) / 2;
  inp.value = Math.max(0.5, Math.min(24, v));
  onHorasInput(id);
}

function onHorasInput(id) {
  const lin = lineas.find(l => l.id === id);
  if (lin) lin.horas = parseFloat(document.getElementById(`${id}_hs`).value) || 0;
  actualizarTotal();
  checkReady();
}

function actualizarTotal() {
  const t = lineas.reduce((s, l) => s + (l.horas || 0), 0);
  document.getElementById('totalCargadas').textContent = t.toFixed(1) + ' h';
}

// ── Validación ─────────────────────────────────────────────────────────────

function checkReady() {
  const emp   = document.getElementById('empleadoSelect').value;
  const fecha = document.getElementById('fechaInput').value;
  const ok    = !!(emp && fecha && lineas.length > 0 &&
                   lineas.every(l => l.ot && l.horas > 0));
  document.getElementById('submitBtn').disabled = !ok;

  const hint = document.getElementById('submitHint');
  if (!emp)                                 hint.textContent = 'Seleccioná tu nombre';
  else if (!fecha)                          hint.textContent = 'Indicá la fecha de trabajo';
  else if (!lineas.length)                  hint.textContent = 'Agregá al menos una OT';
  else if (lineas.some(l => !l.ot))        hint.textContent = 'Seleccioná la OT en cada línea';
  else if (lineas.some(l => l.horas <= 0)) hint.textContent = 'Las horas deben ser mayores a 0';
  else                                      hint.textContent = 'Todo listo — podés enviar la carga';
}

// ── Submit ─────────────────────────────────────────────────────────────────

async function submitCarga() {
  const emp   = document.getElementById('empleadoSelect').value;
  const fecha = document.getElementById('fechaInput').value;
  if (!emp || !fecha || !lineas.length) return;

  // yyyy-mm-dd → dd/MM/yyyy
  const [y, m, d] = fecha.split('-');
  const fechaFmt  = `${d}/${m}/${y}`;

  document.getElementById('loadingOverlay').classList.remove('hidden');
  document.getElementById('submitBtn').disabled = true;

  let allOk = true;
  for (const lin of lineas) {
    if (!lin.ot || lin.horas <= 0) continue;
    try {
      const p = new URLSearchParams({
        empleado: emp,
        ot:       lin.ot,
        nombreOt: lin.nombreOt,
        item:     lin.item || 'General',
        horas:    lin.horas,
        fecha:    fechaFmt
      });
      const res  = await fetch(`${CONFIG.SCRIPT_URL}?action=cargarHoras&${p}`);
      const data = await res.json();
      if (!data.success) { allOk = false; console.error(data.error); }
    } catch (err) { allOk = false; console.error(err); }
  }

  document.getElementById('loadingOverlay').classList.add('hidden');

  if (allOk) showSuccess(emp, fechaFmt);
  else {
    document.getElementById('submitBtn').disabled = false;
    showToast('Error al guardar — verificá tu conexión', 'error');
  }
}

// ── Éxito ──────────────────────────────────────────────────────────────────

function showSuccess(emp, fecha) {
  const total   = lineas.reduce((s, l) => s + l.horas, 0);
  const linHtml = lineas.map(l => `
    <div class="success-detail-row">
      <span class="label">OT ${esc(l.ot)} — ${esc(l.nombreOt)}</span>
      <span class="value text-success">${l.horas.toFixed(1)} h</span>
    </div>
    ${l.item && l.item !== 'General' ? `
    <div class="success-detail-row" style="padding-left:.75rem;border-left:2px solid var(--gray-200)">
      <span class="label" style="color:var(--gray-400)">Ítem</span>
      <span class="value" style="color:var(--gray-500);font-size:.82rem">${esc(l.item)}</span>
    </div>` : ''}`).join('');

  document.getElementById('successDetails').innerHTML = `
    <div class="success-detail-row">
      <span class="label">Empleado</span>
      <span class="value">${esc(emp)}</span>
    </div>
    <div class="success-detail-row">
      <span class="label">Fecha</span>
      <span class="value">${fecha}</span>
    </div>
    ${linHtml}
    <div class="success-detail-row"
         style="border-top:2px solid var(--gray-200);margin-top:.5rem;padding-top:.75rem">
      <span class="label"><strong>Total imputado</strong></span>
      <span class="value" style="color:var(--primary);font-size:1rem">
        <strong>${total.toFixed(1)} h</strong>
      </span>
    </div>`;

  document.getElementById('formScreen').classList.add('hidden');
  document.getElementById('successScreen').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetCarga() {
  lineas = []; linCounter = 0;
  document.getElementById('lineasContainer').innerHTML = '';
  document.getElementById('fechaInput').value = todayISO();
  document.getElementById('formScreen').classList.remove('hidden');
  document.getElementById('successScreen').classList.add('hidden');
  agregarLinea();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Utils ──────────────────────────────────────────────────────────────────

function todayISO() { return new Date().toISOString().split('T')[0]; }
function esc(s) {
  return (s || '').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3500);
}
