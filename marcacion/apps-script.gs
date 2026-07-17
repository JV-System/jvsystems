/**
 * SISTEMA DE HORAS — Google Apps Script Backend
 * JV Systems · Soluciones Digitales
 * v7 — login único con roles (Empleado/Admin) + Horas Diarias (carga simple sin OT)
 *      + Ausentismo (licencias/vacaciones con aprobación)
 *      + Reconocimiento facial opcional (verificación extra, no bloqueante)
 *
 * Cómo adaptar este backend a un cliente nuevo:
 *   1. Copiá este archivo al editor de Apps Script de una copia nueva del Google Sheet.
 *   2. Cambiá ADMIN_PASSWORD (clave maestra, solo para setup/recuperación).
 *   3. En la hoja "Empleados" cargá: Nombre | Clave | Rol ('Admin' o 'Empleado').
 *      Si una fila no tiene Rol, se asume 'Empleado' — no hace falta migrar nada a mano.
 *   4. Desplegá como Web App y pegá la URL en CONFIG.SCRIPT_URL del index.html.
 */

const ADMIN_PASSWORD   = 'admin2024'; // ← clave maestra de recuperación, CAMBIÁ ESTO
const JORNADA_NORMAL_H = 9;
const JORNADA_50_H     = 2;

// ─── Router ──────────────────────────────────────────────────────────────────

function doPost(e) {
  return doGet(e);
}

function doGet(e) {
  const action = (e.parameter.action || '').trim();
  try {
    switch (action) {
      case 'version':          return jsonResponse({ version: 7, ok: true });
      case 'empleados':        return jsonResponse(getEmpleados());
      case 'getEmpleadosFull': return jsonResponse(getEmpleadosFull(e.parameter));
      case 'crearEmpleado':    return jsonResponse(crearEmpleado(e.parameter));
      case 'editarEmpleado':   return jsonResponse(editarEmpleado(e.parameter));
      case 'eliminarEmpleado': return jsonResponse(eliminarEmpleado(e.parameter));
      case 'login':            return jsonResponse(login(e.parameter));
      case 'tipoSugerido':     return jsonResponse(getTipoSugerido(e.parameter));
      case 'marcar':           return jsonResponse(marcar(e.parameter));
      case 'marcaciones':      return jsonResponse(getMarcaciones(e.parameter));
      case 'jornada':          return jsonResponse(getJornada(e.parameter));
      case 'ejemplos':         return jsonResponse(insertarEjemplos(e.parameter));
      case 'proyectos':        return jsonResponse(getProyectos());
      case 'items':            return jsonResponse(getItems(e.parameter));
      case 'cargarHoras':      return jsonResponse(cargarHoras(e.parameter));
      case 'horasProyecto':    return jsonResponse(getHorasProyecto(e.parameter));
      case 'cargarHorasDiarias': return jsonResponse(cargarHorasDiarias(e.parameter));
      case 'horasDiarias':     return jsonResponse(getHorasDiarias(e.parameter));
      case 'marcarAdmin':      return jsonResponse(marcarAdmin(e.parameter));
      case 'editarMarcacion':  return jsonResponse(editarMarcacion(e.parameter));
      case 'borrarMarcacion':  return jsonResponse(borrarMarcacion(e.parameter));
      case 'solicitarAusencia': return jsonResponse(solicitarAusencia(e.parameter));
      case 'misAusencias':     return jsonResponse(misAusencias(e.parameter));
      case 'getAusencias':     return jsonResponse(getAusencias(e.parameter));
      case 'resolverAusencia': return jsonResponse(resolverAusencia(e.parameter));
      case 'getRostro':        return jsonResponse(getRostro(e.parameter));
      case 'guardarRostro':    return jsonResponse(guardarRostro(e.parameter));
      case 'borrarRostro':     return jsonResponse(borrarRostro(e.parameter));
      default:                 return jsonResponse({ success: false, error: 'Acción no reconocida' });
    }
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// ─── Login unificado (empleado o admin, misma pantalla) ──────────────────────

function login(params) {
  const emp   = decodeURIComponent(params.empleado || '').trim();
  const clave = (params.pass || '').trim();
  if (!emp) return { success: false, error: 'Falta seleccionar empleado' };

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Empleados');
  if (!sheet) return { success: false, error: 'Sin datos de empleados' };

  const rows = sheet.getDataRange().getValues().slice(1);
  for (const row of rows) {
    const nombre = row[0] ? row[0].toString().trim() : '';
    if (nombre !== emp) continue;
    const stored = row[1] ? row[1].toString().trim() : '';
    const rol    = row[2] ? row[2].toString().trim() : 'Empleado';
    if (stored && stored !== clave) return { success: false, error: 'Clave incorrecta' };
    return { success: true, rol: rol || 'Empleado', nombre };
  }
  return { success: false, error: 'Empleado no encontrado' };
}

/** Autoriza acciones de administración. Acepta la clave maestra o un empleado con Rol=Admin. */
function isAdmin(params) {
  if (params.pass && params.pass === ADMIN_PASSWORD) return true;
  if (!params.empleado || !params.pass) return false;

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Empleados');
  if (!sheet) return false;

  const emp  = decodeURIComponent(params.empleado).trim();
  const rows = sheet.getDataRange().getValues().slice(1);
  for (const row of rows) {
    const nombre = row[0] ? row[0].toString().trim() : '';
    if (nombre !== emp) continue;
    const stored = row[1] ? row[1].toString().trim() : '';
    const rol    = row[2] ? row[2].toString().trim() : 'Empleado';
    return stored === params.pass.toString().trim() && rol === 'Admin';
  }
  return false;
}

// ─── Tipo de marcación sugerido ───────────────────────────────────────────────

function getTipoSugerido(params) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Marcaciones');
  if (!sheet || sheet.getLastRow() < 2) return { success: true, tipo: 'Entrada', ultimaEntrada: null };

  const tz   = Session.getScriptTimeZone();
  const hoy  = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy');
  const emp  = decodeURIComponent(params.empleado || '').trim();

  const raw  = sheet.getDataRange().getDisplayValues();
  const hdrs = raw[0];
  const ci   = hdrs.indexOf('Empleado');
  const ct   = hdrs.indexOf('Tipo');
  const cf   = hdrs.indexOf('Fecha');
  const ch   = hdrs.indexOf('Hora');

  let lastTipo    = null;
  let ultimaEntrada = null; // Hora de la última Entrada de hoy (para calcular horas trabajadas)

  // Recorrer de abajo hacia arriba
  for (let i = raw.length - 1; i >= 1; i--) {
    const r = raw[i];
    if (r[ci] !== emp || r[cf] !== hoy) continue;
    if (!lastTipo) lastTipo = r[ct]; // el más reciente
    if (r[ct] === 'Entrada' && !ultimaEntrada) ultimaEntrada = r[ch]; // última Entrada
    if (lastTipo && ultimaEntrada) break;
  }

  const tipo = lastTipo === 'Entrada' ? 'Salida' : 'Entrada';
  return { success: true, tipo, lastTipo, ultimaEntrada };
}

// ─── Empleados ────────────────────────────────────────────────────────────────

function getEmpleados() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Empleados');
  if (!sheet) {
    sheet = ss.insertSheet('Empleados');
    sheet.appendRow(['Nombre','Clave','Rol']);
    sheet.getRange(1,1,1,3).setFontWeight('bold').setBackground('#0D1B2E').setFontColor('white');
    sheet.appendRow(['Juan Pérez','','Empleado']);
    sheet.appendRow(['María García','','Empleado']);
    sheet.appendRow(['Carlos López','','Admin']);
  }
  const empleados = sheet.getDataRange().getValues().slice(1).map(r => r[0]).filter(Boolean);
  return { success: true, empleados };
}

// ─── Gestión de empleados (alta / edición / baja desde el panel admin) ────────

function getEmpleadosFull(params) {
  if (!isAdmin(params)) return { success: false, error: 'No autorizado' };

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Empleados');
  if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

  const raw  = sheet.getDataRange().getValues();
  const hdrs = raw[0];
  const ci = hdrs.indexOf('Nombre'), cr = hdrs.indexOf('Rol'), cf = hdrs.indexOf('Foto');

  const rostroSheet = ss.getSheetByName('Rostros');
  const conRostro = new Set();
  if (rostroSheet && rostroSheet.getLastRow() > 1) {
    rostroSheet.getDataRange().getValues().slice(1).forEach(r => { if (r[0]) conRostro.add(r[0].toString().trim()); });
  }

  const data = raw.slice(1).filter(r => r[ci]).map(r => {
    const nombre = r[ci].toString().trim();
    return {
      Nombre: nombre,
      Rol: (r[cr] || 'Empleado').toString().trim() || 'Empleado',
      Foto: cf !== -1 ? (r[cf] || '') : '',
      TieneRostro: conRostro.has(nombre)
    };
  });
  data.sort((a,b) => a.Nombre.localeCompare(b.Nombre));
  return { success: true, data };
}

function crearEmpleado(params) {
  if (!isAdmin(params)) return { success: false, error: 'No autorizado' };
  const nombre = decodeURIComponent(params.nombre || '').trim();
  const clave  = decodeURIComponent(params.clave || '').trim();
  const rol    = decodeURIComponent(params.rol || 'Empleado').trim() || 'Empleado';
  if (!nombre) return { success: false, error: 'Falta el nombre' };

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Empleados');
  if (!sheet) return { success: false, error: 'Hoja no encontrada' };

  const existentes = sheet.getDataRange().getValues().slice(1).map(r => (r[0]||'').toString().trim().toLowerCase());
  if (existentes.includes(nombre.toLowerCase())) return { success: false, error: 'Ya existe un empleado con ese nombre' };

  sheet.appendRow([nombre, clave, rol]);
  if (params.foto) {
    const col = ensureColumn(sheet, 'Foto');
    sheet.getRange(sheet.getLastRow(), col).setValue(decodeURIComponent(params.foto));
  }
  return { success: true };
}

function editarEmpleado(params) {
  if (!isAdmin(params)) return { success: false, error: 'No autorizado' };
  const nombre = decodeURIComponent(params.nombre || '').trim();
  if (!nombre) return { success: false, error: 'Falta el nombre' };

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Empleados');
  if (!sheet) return { success: false, error: 'Hoja no encontrada' };

  const data = sheet.getDataRange().getValues();
  const hdrs = data[0];
  const colMap = {}; hdrs.forEach((h,i) => { colMap[h] = i; });

  for (let i = 1; i < data.length; i++) {
    if ((data[i][0]||'').toString().trim() !== nombre) continue;
    if (params.clave !== undefined) sheet.getRange(i+1, colMap['Clave']+1).setValue(decodeURIComponent(params.clave));
    if (params.rol)                sheet.getRange(i+1, colMap['Rol']+1).setValue(decodeURIComponent(params.rol));
    if (params.foto) {
      const col = ensureColumn(sheet, 'Foto');
      sheet.getRange(i+1, col).setValue(decodeURIComponent(params.foto));
    }
    return { success: true };
  }
  return { success: false, error: 'Empleado no encontrado' };
}

function eliminarEmpleado(params) {
  if (!isAdmin(params)) return { success: false, error: 'No autorizado' };
  const nombre = decodeURIComponent(params.nombre || '').trim();
  if (!nombre) return { success: false, error: 'Falta el nombre' };

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Empleados');
  if (!sheet) return { success: false, error: 'Hoja no encontrada' };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0]||'').toString().trim() === nombre) { sheet.deleteRow(i+1); return { success: true }; }
  }
  return { success: false, error: 'Empleado no encontrado' };
}

// ─── Registrar marcación ──────────────────────────────────────────────────────

function marcar(params) {
  if (!params.empleado || !params.tipo) return { success: false, error: 'Datos incompletos' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Marcaciones');
  if (!sheet) {
    sheet = ss.insertSheet('Marcaciones');
    const h = ['ID','Empleado','Tipo','Fecha','Hora','Latitud','Longitud','Timestamp'];
    sheet.appendRow(h);
    sheet.getRange(1,1,1,h.length).setFontWeight('bold').setBackground('#0D1B2E').setFontColor('white');
    sheet.setFrozenRows(1);
    // Columnas Fecha y Hora como texto plano para evitar auto-conversión
    sheet.getRange('D:D').setNumberFormat('@');
    sheet.getRange('E:E').setNumberFormat('@');
  }

  const now   = new Date();
  const tz    = Session.getScriptTimeZone();
  const fecha = Utilities.formatDate(now, tz, 'dd/MM/yyyy');
  const hora  = Utilities.formatDate(now, tz, 'HH:mm:ss');
  const id    = Utilities.getUuid().substring(0,8).toUpperCase();

  sheet.appendRow([id, decodeURIComponent(params.empleado), params.tipo,
                   fecha, hora, params.lat||'', params.lng||'', now.toISOString()]);
  if (params.verificado) {
    const col = ensureColumn(sheet, 'Verificado');
    sheet.getRange(sheet.getLastRow(), col).setValue(decodeURIComponent(params.verificado));
  }
  if (params.dispositivo) {
    const col = ensureColumn(sheet, 'Dispositivo');
    sheet.getRange(sheet.getLastRow(), col).setValue(decodeURIComponent(params.dispositivo));
  }
  return { success: true, id, fecha, hora };
}

// ─── Marcaciones raw ──────────────────────────────────────────────────────────

function getMarcaciones(params) {
  if (!isAdmin(params)) return { success: false, error: 'No autorizado' };

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Marcaciones');
  if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

  // getDisplayValues devuelve el texto formateado (nunca objetos Date)
  const raw  = sheet.getDataRange().getDisplayValues();
  const hdrs = raw[0];
  let rows = raw.slice(1).map(row => {
    const o = {};
    hdrs.forEach((h,i) => { o[h] = row[i] || ''; });
    return o;
  }).filter(r => r['Empleado']);

  rows = filtrarRango(rows, params);
  // Ordenar por fecha+hora descendente (no usamos Timestamp que puede estar mal formateado)
  rows.sort((a,b) => {
    const fa = fechaNum(a['Fecha']), fb = fechaNum(b['Fecha']);
    if (fa !== fb) return fb - fa;
    return timeToMin(b['Hora']) - timeToMin(a['Hora']);
  });
  return { success: true, data: rows };
}

// ─── Jornada Laboral ──────────────────────────────────────────────────────────

function getJornada(params) {
  if (!isAdmin(params)) return { success: false, error: 'No autorizado' };

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Marcaciones');
  if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

  const raw  = sheet.getDataRange().getDisplayValues();
  const hdrs = raw[0];
  let rows = raw.slice(1).map(row => {
    const o = {};
    hdrs.forEach((h,i) => { o[h] = row[i] || ''; });
    return o;
  }).filter(r => r['Empleado']);

  if (params.empleado && params.empleado !== 'todos')
    rows = rows.filter(r => r['Empleado'] === decodeURIComponent(params.empleado));
  rows = filtrarRango(rows, params);

  // Agrupar por empleado + fecha
  const mapa = {};
  rows.forEach(r => {
    const k = r['Empleado'] + '|' + r['Fecha'];
    if (!mapa[k]) mapa[k] = { empleado: r['Empleado'], fecha: r['Fecha'], entradas: [], salidas: [] };
    if (r['Tipo'] === 'Entrada') mapa[k].entradas.push(r['Hora']);
    else                          mapa[k].salidas.push(r['Hora']);
  });

  const baseNormalMin = JORNADA_NORMAL_H * 60;
  const base50Min     = JORNADA_50_H * 60;

  const jornadas = Object.values(mapa).map(j => {
    // Usar timeToMin para ordenar correctamente (evita problema con "6:00" vs "06:00")
    const ingreso = j.entradas.length
      ? j.entradas.reduce((a,b) => timeToMin(a) <= timeToMin(b) ? a : b)
      : '';
    const salida = j.salidas.length
      ? j.salidas.reduce((a,b) => timeToMin(a) >= timeToMin(b) ? a : b)
      : '';

    let totalHoras = '', totalMin = 0;
    if (ingreso && salida) {
      const inMin  = timeToMin(ingreso);
      const outMin = timeToMin(salida);
      totalMin = outMin - inMin;
      if (totalMin > 0) totalHoras = pad(Math.floor(totalMin/60)) + ':' + pad(totalMin%60);
    }

    const hsNorm = totalMin > 0 ? rnd(Math.min(totalMin, baseNormalMin) / 60) : 0;
    const hs50   = totalMin > 0 ? rnd(Math.min(Math.max(totalMin - baseNormalMin, 0), base50Min) / 60) : 0;
    const hs100  = totalMin > 0 ? rnd(Math.max(totalMin - baseNormalMin - base50Min, 0) / 60) : 0;

    const estado = !ingreso ? 'Sin Entrada' : !salida ? 'Sin Salida' : 'Presente';
    const fechaTs = fechaNum(j.fecha); // YYYYMMDD para ordenar

    return {
      Empleado:      j.empleado,
      Fecha:         j.fecha,
      Estado:        estado,
      Ingreso:       ingreso,
      Salida:        salida,
      'Total Horas': totalHoras,
      'Total Min':   totalMin,
      'HS Normales': hsNorm,
      'HS 50':       hs50,
      'HS 100':      hs100,
      _fechaTs:      fechaTs
    };
  });

  jornadas.sort((a,b) => b._fechaTs !== a._fechaTs
    ? b._fechaTs - a._fechaTs
    : a.Empleado.localeCompare(b.Empleado));

  return { success: true, data: jornadas };
}

// ─── Datos de prueba ──────────────────────────────────────────────────────────

function insertarEjemplos(params) {
  if (!isAdmin(params)) return { success: false, error: 'No autorizado' };

  const tz = Session.getScriptTimeZone();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let empSheet = ss.getSheetByName('Empleados');
  if (!empSheet) {
    empSheet = ss.insertSheet('Empleados');
    empSheet.appendRow(['Nombre','Clave','Rol']);
    empSheet.getRange(1,1,1,3).setFontWeight('bold').setBackground('#0D1B2E').setFontColor('white');
  }
  const empleados = [
    'Aguiar Nicolas','Bonafini Cesar','Delgado Santiago',
    'Frattoni Elias','Galotto Agustin','Juarez Nahuel','Vázquez Franco'
  ];
  const existentes = empSheet.getDataRange().getValues().slice(1).map(r => r[0]);
  // Clave de prueba: 123 para todos, rol Empleado
  empleados.forEach(e => { if (!existentes.includes(e)) empSheet.appendRow([e, '123', 'Empleado']); });

  let sheet = ss.getSheetByName('Marcaciones');
  if (!sheet) {
    sheet = ss.insertSheet('Marcaciones');
    const h = ['ID','Empleado','Tipo','Fecha','Hora','Latitud','Longitud','Timestamp'];
    sheet.appendRow(h);
    sheet.getRange(1,1,1,h.length).setFontWeight('bold').setBackground('#0D1B2E').setFontColor('white');
    sheet.setFrozenRows(1);
  }
  // Forzar texto plano en Fecha y Hora para evitar auto-conversión
  sheet.getRange('D:D').setNumberFormat('@');
  sheet.getRange('E:E').setNumberFormat('@');

  const diasHabiles = [];
  let dia = new Date(); dia.setDate(dia.getDate() - 1);
  while (diasHabiles.length < 15) {
    if (dia.getDay() !== 0 && dia.getDay() !== 6) diasHabiles.push(new Date(dia));
    dia.setDate(dia.getDate() - 1);
  }

  const lat = '-31.4135', lng = '-64.1811';
  const rows = [];
  diasHabiles.forEach((fecha, di) => {
    const fechaStr = Utilities.formatDate(fecha, tz, 'dd/MM/yyyy');
    empleados.forEach((emp, ei) => {
      const entMin = 360 + (ei*3 + di*2) % 30;
      const entH = Math.floor(entMin/60), entM = entMin%60, entS = (ei*7+di*13)%60;
      const horaEnt = pad(entH)+':'+pad(entM)+':'+pad(entS);
      const tsEnt = new Date(fecha); tsEnt.setHours(entH,entM,entS);
      rows.push([Utilities.getUuid().substring(0,8).toUpperCase(), emp, 'Entrada',
                 fechaStr, horaEnt, lat, lng, tsEnt.toISOString()]);
      if ((ei+di) % 20 !== 0) {
        const salBase = 950 + (ei*13+di*9) % 160;
        const salH = Math.floor(salBase/60), salM = salBase%60, salS = (ei*11+di*7)%60;
        const horaSal = pad(salH)+':'+pad(salM)+':'+pad(salS);
        const tsSal = new Date(fecha); tsSal.setHours(salH,salM,salS);
        rows.push([Utilities.getUuid().substring(0,8).toUpperCase(), emp, 'Salida',
                   fechaStr, horaSal, lat, lng, tsSal.toISOString()]);
      }
    });
  });
  if (rows.length > 0)
    sheet.getRange(sheet.getLastRow()+1, 1, rows.length, 8).setValues(rows);

  // OTs
  let otSheet = ss.getSheetByName('OTs');
  if (!otSheet) {
    otSheet = ss.insertSheet('OTs');
    const h = ['Número OT','Nombre','Área','Estado'];
    otSheet.appendRow(h);
    otSheet.getRange(1,1,1,h.length).setFontWeight('bold').setBackground('#0D1B2E').setFontColor('white');
    otSheet.setFrozenRows(1);
  }
  const otsEjemplo = [
    ['1631','Automatic Storing System','Ing. Mecánica','Abierto'],
    ['1644','Ampliación Planta Afg','Instalaciones','Abierto'],
    ['1800','Mantenimiento General','Operaciones','Abierto'],
    ['1705','Sistema Eléctrico Sur','Ing. Eléc. y Software','Abierto'],
  ];
  const existOts = otSheet.getDataRange().getValues().slice(1).map(r => r[0].toString());
  otsEjemplo.forEach(ot => { if (!existOts.includes(ot[0])) otSheet.appendRow(ot); });

  // Items OT
  let itemSheet = ss.getSheetByName('Items OT');
  if (!itemSheet) {
    itemSheet = ss.insertSheet('Items OT');
    const h = ['OT','Código','Descripción'];
    itemSheet.appendRow(h);
    itemSheet.getRange(1,1,1,h.length).setFontWeight('bold').setBackground('#0D1B2E').setFontColor('white');
    itemSheet.setFrozenRows(1);
  }
  const itemsEjemplo = [
    ['1631','10.1.4','MEC. FRESADO'],   ['1631','10.1.5','MEC. MECANIZADO'],
    ['1631','10.1.6','MEC. TORNEADO'], ['1631','10.1.8','MEC. ROSCADO'],
    ['1644','10.2.1','INSTALACIÓN ELÉCTRICA'], ['1644','10.2.2','MONTAJE MECÁNICO'],
    ['1644','10.2.3','PRUEBAS Y AJUSTES'], ['1800','10.3.1','MANTENIMIENTO PREVENTIVO'],
    ['1800','10.3.2','REPARACIÓN CORRECTIVA'], ['1705','10.4.1','TABLERO ELÉCTRICO'],
    ['1705','10.4.2','CABLEADO Y TENDIDO'],
  ];
  const existItems = itemSheet.getDataRange().getValues().slice(1).map(r => r[0]+'_'+r[1]);
  itemsEjemplo.forEach(it => { if (!existItems.includes(it[0]+'_'+it[1])) itemSheet.appendRow(it); });

  // Horas Proyecto
  let hpSheet = ss.getSheetByName('Horas Proyecto');
  if (!hpSheet) {
    hpSheet = ss.insertSheet('Horas Proyecto');
    const h = ['ID','Empleado','OT','Nombre OT','Item','Fecha','Horas','Timestamp'];
    hpSheet.appendRow(h);
    hpSheet.getRange(1,1,1,h.length).setFontWeight('bold').setBackground('#0D1B2E').setFontColor('white');
    hpSheet.setFrozenRows(1);
    hpSheet.getRange('F:F').setNumberFormat('@');
  }
  const otData = [
    { ot:'1631', nombre:'Automatic Storing System', items:['10.1.4','10.1.5','10.1.6','10.1.8'] },
    { ot:'1644', nombre:'Ampliación Planta Afg',    items:['10.2.1','10.2.2','10.2.3'] },
    { ot:'1800', nombre:'Mantenimiento General',     items:['10.3.1','10.3.2'] },
    { ot:'1705', nombre:'Sistema Eléctrico Sur',    items:['10.4.1','10.4.2'] },
  ];
  const hpRows = [];
  diasHabiles.forEach((fecha, di) => {
    const fechaStr = Utilities.formatDate(fecha, tz, 'dd/MM/yyyy');
    empleados.forEach((emp, ei) => {
      const numOTs  = (ei + di) % 3 === 0 ? 2 : 1;
      const otIdx   = (ei * 2 + di) % otData.length;
      let remaining = 8 + (ei % 2);
      for (let k = 0; k < numOTs && remaining > 0; k++) {
        const curOt = otData[(otIdx + k) % otData.length];
        const item  = curOt.items[(ei + di + k) % curOt.items.length];
        const horas = k === numOTs - 1 ? remaining : Math.max(1, Math.floor(remaining / 2));
        remaining  -= horas;
        const tsHp  = new Date(fecha); tsHp.setHours(17, 30 + (ei % 10), 0);
        hpRows.push([Utilities.getUuid().substring(0,8).toUpperCase(),
                     emp, curOt.ot, curOt.nombre, item, fechaStr, horas, tsHp.toISOString()]);
      }
    });
  });
  if (hpRows.length > 0)
    hpSheet.getRange(hpSheet.getLastRow()+1, 1, hpRows.length, 8).setValues(hpRows);

  return { success: true, inserted: rows.length, horasProyecto: hpRows.length,
           dias: diasHabiles.length, empleados: empleados.length };
}

// ─── Proyectos / OTs ──────────────────────────────────────────────────────────

function getProyectos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('OTs');
  if (!sheet) {
    sheet = ss.insertSheet('OTs');
    const h = ['Número OT','Nombre','Área','Estado'];
    sheet.appendRow(h);
    sheet.getRange(1,1,1,h.length).setFontWeight('bold').setBackground('#0D1B2E').setFontColor('white');
    sheet.setFrozenRows(1);
  }
  const raw  = sheet.getDataRange().getValues();
  const hdrs = raw[0];
  const proyectos = raw.slice(1).filter(r => r[0]).map(r => {
    const o = {}; hdrs.forEach((h,i) => { o[h] = r[i] ? r[i].toString() : ''; }); return o;
  });
  return { success: true, proyectos };
}

// ─── Ítems por OT ─────────────────────────────────────────────────────────────

function getItems(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Items OT');
  if (!sheet) {
    sheet = ss.insertSheet('Items OT');
    const h = ['OT','Código','Descripción'];
    sheet.appendRow(h);
    sheet.getRange(1,1,1,h.length).setFontWeight('bold').setBackground('#0D1B2E').setFontColor('white');
    sheet.setFrozenRows(1);
  }
  const raw  = sheet.getDataRange().getValues();
  const hdrs = raw[0];
  let items  = raw.slice(1).filter(r => r[0]).map(r => {
    const o = {}; hdrs.forEach((h,i) => { o[h] = r[i] ? r[i].toString() : ''; }); return o;
  });
  if (params.ot) items = items.filter(it => it['OT'] === decodeURIComponent(params.ot));
  return { success: true, items };
}

// ─── Cargar horas en proyecto (con OT) ────────────────────────────────────────

function cargarHoras(params) {
  if (!params.empleado || !params.ot || !params.horas)
    return { success: false, error: 'Datos incompletos' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Horas Proyecto');
  if (!sheet) {
    sheet = ss.insertSheet('Horas Proyecto');
    const h = ['ID','Empleado','OT','Nombre OT','Item','Fecha','Horas','Timestamp'];
    sheet.appendRow(h);
    sheet.getRange(1,1,1,h.length).setFontWeight('bold').setBackground('#0D1B2E').setFontColor('white');
    sheet.setFrozenRows(1);
    sheet.getRange('F:F').setNumberFormat('@');
  }
  const now   = new Date();
  const tz    = Session.getScriptTimeZone();
  const fecha = params.fecha || Utilities.formatDate(now, tz, 'dd/MM/yyyy');
  const id    = Utilities.getUuid().substring(0,8).toUpperCase();
  sheet.appendRow([id, decodeURIComponent(params.empleado), params.ot,
                   decodeURIComponent(params.nombreOt || ''),
                   decodeURIComponent(params.item || 'General'),
                   fecha, parseFloat(params.horas), now.toISOString()]);
  return { success: true, id };
}

// ─── Obtener horas en proyectos ───────────────────────────────────────────────

function getHorasProyecto(params) {
  if (!isAdmin(params)) return { success: false, error: 'No autorizado' };

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Horas Proyecto');
  if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

  const raw  = sheet.getDataRange().getDisplayValues();
  const hdrs = raw[0];
  let rows = raw.slice(1).filter(r => r[1]).map(r => {
    const o = {}; hdrs.forEach((h,i) => { o[h] = r[i] || ''; }); return o;
  });

  rows = filtrarRango(rows, params);
  if (params.empleado && params.empleado !== 'todos')
    rows = rows.filter(r => r['Empleado'] === decodeURIComponent(params.empleado));
  rows.sort((a,b) => {
    const fa = fechaNum(a['Fecha']), fb = fechaNum(b['Fecha']);
    return fb - fa;
  });
  return { success: true, data: rows };
}

// ─── Cargar horas diarias (sin OT — flujo simple genérico) ───────────────────

function cargarHorasDiarias(params) {
  if (!params.empleado || !params.fecha || !params.horas)
    return { success: false, error: 'Datos incompletos' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Horas Diarias');
  if (!sheet) {
    sheet = ss.insertSheet('Horas Diarias');
    const h = ['ID','Empleado','Fecha','Horas','Nota','Timestamp'];
    sheet.appendRow(h);
    sheet.getRange(1,1,1,h.length).setFontWeight('bold').setBackground('#0D1B2E').setFontColor('white');
    sheet.setFrozenRows(1);
    sheet.getRange('C:C').setNumberFormat('@');
  }
  const id = Utilities.getUuid().substring(0,8).toUpperCase();
  sheet.appendRow([id, decodeURIComponent(params.empleado), decodeURIComponent(params.fecha),
                   parseFloat(params.horas), decodeURIComponent(params.nota || ''),
                   new Date().toISOString()]);
  return { success: true, id };
}

function getHorasDiarias(params) {
  if (!isAdmin(params)) return { success: false, error: 'No autorizado' };

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Horas Diarias');
  if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

  const raw  = sheet.getDataRange().getDisplayValues();
  const hdrs = raw[0];
  let rows = raw.slice(1).filter(r => r[1]).map(row => {
    const o = {}; hdrs.forEach((h,i) => { o[h] = row[i] || ''; }); return o;
  });

  rows = filtrarRango(rows, params);
  if (params.empleado && params.empleado !== 'todos')
    rows = rows.filter(r => r['Empleado'] === decodeURIComponent(params.empleado));
  rows.sort((a,b) => fechaNum(b['Fecha']) - fechaNum(a['Fecha']));
  return { success: true, data: rows };
}

// ─── Ausentismo (licencias / vacaciones) ──────────────────────────────────────

function solicitarAusencia(params) {
  if (!params.empleado || !params.tipo || !params.fechaDesde || !params.fechaHasta)
    return { success: false, error: 'Datos incompletos' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Ausencias');
  if (!sheet) {
    sheet = ss.insertSheet('Ausencias');
    const h = ['ID','Empleado','Tipo','FechaDesde','FechaHasta','Motivo','Estado','Timestamp'];
    sheet.appendRow(h);
    sheet.getRange(1,1,1,h.length).setFontWeight('bold').setBackground('#0D1B2E').setFontColor('white');
    sheet.setFrozenRows(1);
    sheet.getRange('D:E').setNumberFormat('@');
  }
  const id = Utilities.getUuid().substring(0,8).toUpperCase();
  sheet.appendRow([id, decodeURIComponent(params.empleado), decodeURIComponent(params.tipo),
                   decodeURIComponent(params.fechaDesde), decodeURIComponent(params.fechaHasta),
                   decodeURIComponent(params.motivo || ''), 'Pendiente', new Date().toISOString()]);
  return { success: true, id };
}

function misAusencias(params) {
  if (!params.empleado) return { success: false, error: 'Falta empleado' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Ausencias');
  if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

  const raw  = sheet.getDataRange().getDisplayValues();
  const hdrs = raw[0];
  const emp  = decodeURIComponent(params.empleado).trim();
  let rows = raw.slice(1).filter(r => r[1] === emp).map(row => {
    const o = {}; hdrs.forEach((h,i) => { o[h] = row[i] || ''; }); return o;
  });
  rows.sort((a,b) => fechaNum(b['FechaDesde']) - fechaNum(a['FechaDesde']));
  return { success: true, data: rows };
}

function getAusencias(params) {
  if (!isAdmin(params)) return { success: false, error: 'No autorizado' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Ausencias');
  if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

  const raw  = sheet.getDataRange().getDisplayValues();
  const hdrs = raw[0];
  let rows = raw.slice(1).filter(r => r[1]).map(row => {
    const o = {}; hdrs.forEach((h,i) => { o[h] = row[i] || ''; }); return o;
  });
  if (params.empleado && params.empleado !== 'todos')
    rows = rows.filter(r => r['Empleado'] === decodeURIComponent(params.empleado));
  if (params.estado && params.estado !== 'todos')
    rows = rows.filter(r => r['Estado'] === decodeURIComponent(params.estado));
  rows.sort((a,b) => fechaNum(b['FechaDesde']) - fechaNum(a['FechaDesde']));
  return { success: true, data: rows };
}

function resolverAusencia(params) {
  if (!isAdmin(params)) return { success: false, error: 'No autorizado' };
  if (!params.id || !params.estado) return { success: false, error: 'Datos incompletos' };
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Ausencias');
  if (!sheet) return { success: false, error: 'Hoja no encontrada' };
  const data   = sheet.getDataRange().getValues();
  const hdrs   = data[0];
  const colMap = {};
  hdrs.forEach((h,i) => { colMap[h] = i; });
  const id = decodeURIComponent(params.id).trim();
  for (let i = 1; i < data.length; i++) {
    if (data[i][colMap['ID']].toString().trim() === id) {
      sheet.getRange(i+1, colMap['Estado']+1).setValue(decodeURIComponent(params.estado));
      return { success: true };
    }
  }
  return { success: false, error: 'Registro no encontrado' };
}

// ─── Admin: registrar marcación manual ───────────────────────────────────────

function marcarAdmin(params) {
  if (!isAdmin(params)) return { success: false, error: 'No autorizado' };
  if (!params.empleado || !params.tipo || !params.fecha || !params.hora)
    return { success: false, error: 'Datos incompletos' };
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Marcaciones');
  if (!sheet) return { success: false, error: 'Hoja no encontrada' };
  const id = Utilities.getUuid().substring(0,8).toUpperCase();
  sheet.appendRow([id, decodeURIComponent(params.empleado), decodeURIComponent(params.tipo),
                   decodeURIComponent(params.fecha), decodeURIComponent(params.hora),
                   params.lat||'', params.lng||'', new Date().toISOString()]);
  if (params.verificado) {
    const col = ensureColumn(sheet, 'Verificado');
    sheet.getRange(sheet.getLastRow(), col).setValue(decodeURIComponent(params.verificado));
  }
  if (params.dispositivo) {
    const col = ensureColumn(sheet, 'Dispositivo');
    sheet.getRange(sheet.getLastRow(), col).setValue(decodeURIComponent(params.dispositivo));
  }
  return { success: true, id };
}

// ─── Reconocimiento facial (verificación extra, no bloqueante) ────────────────

function getRostro(params) {
  if (!params.empleado) return { success: false, error: 'Falta empleado' };
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Rostros');
  if (!sheet || sheet.getLastRow() < 2) return { success: true, descriptor: null };

  const emp  = decodeURIComponent(params.empleado).trim();
  const rows = sheet.getDataRange().getValues().slice(1);
  for (const row of rows) {
    if ((row[0] || '').toString().trim() === emp) {
      try { return { success: true, descriptor: JSON.parse(row[1]) }; }
      catch (e) { return { success: true, descriptor: null }; }
    }
  }
  return { success: true, descriptor: null };
}

function guardarRostro(params) {
  if (!params.empleado || !params.descriptor) return { success: false, error: 'Datos incompletos' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Rostros');
  if (!sheet) {
    sheet = ss.insertSheet('Rostros');
    const h = ['Empleado','Descriptor','Timestamp'];
    sheet.appendRow(h);
    sheet.getRange(1,1,1,h.length).setFontWeight('bold').setBackground('#0D1B2E').setFontColor('white');
    sheet.setFrozenRows(1);
  }
  const emp  = decodeURIComponent(params.empleado).trim();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().trim() === emp) return { success: true, alreadyExists: true }; // no pisa una referencia ya cargada
  }
  sheet.appendRow([emp, decodeURIComponent(params.descriptor), new Date().toISOString()]);
  return { success: true };
}

function borrarRostro(params) {
  if (!isAdmin(params)) return { success: false, error: 'No autorizado' };
  if (!params.empleado) return { success: false, error: 'Falta empleado' };
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Rostros');
  if (!sheet || sheet.getLastRow() < 2) return { success: true };
  const emp  = decodeURIComponent(params.empleado).trim();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().trim() === emp) { sheet.deleteRow(i + 1); return { success: true }; }
  }
  return { success: true };
}

// ─── Admin: editar marcación ──────────────────────────────────────────────────

function editarMarcacion(params) {
  if (!isAdmin(params)) return { success: false, error: 'No autorizado' };
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Marcaciones');
  if (!sheet) return { success: false, error: 'Hoja no encontrada' };
  const data   = sheet.getDataRange().getValues();
  const hdrs   = data[0];
  const colMap = {};
  hdrs.forEach((h,i) => { colMap[h] = i; });
  const id = decodeURIComponent(params.id || '').trim();
  for (let i = 1; i < data.length; i++) {
    if (data[i][colMap['ID']].toString().trim() === id) {
      if (params.fecha) sheet.getRange(i+1, colMap['Fecha']+1).setValue(decodeURIComponent(params.fecha));
      if (params.hora)  sheet.getRange(i+1, colMap['Hora']+1).setValue(decodeURIComponent(params.hora));
      if (params.tipo)  sheet.getRange(i+1, colMap['Tipo']+1).setValue(decodeURIComponent(params.tipo));
      return { success: true };
    }
  }
  return { success: false, error: 'Registro no encontrado' };
}

// ─── Admin: eliminar marcación ────────────────────────────────────────────────

function borrarMarcacion(params) {
  if (!isAdmin(params)) return { success: false, error: 'No autorizado' };
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Marcaciones');
  if (!sheet) return { success: false, error: 'Hoja no encontrada' };
  const data  = sheet.getDataRange().getValues();
  const idCol = data[0].indexOf('ID');
  const id    = decodeURIComponent(params.id || '').trim();
  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol].toString().trim() === id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, error: 'Registro no encontrado' };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convierte "dd/MM/yyyy" o "yyyy-MM-dd" en número YYYYMMDD para comparar */
function fechaNum(str) {
  if (!str) return 0;
  const p = str.split('/');
  if (p.length === 3) return Number(p[2])*10000 + Number(p[1])*100 + Number(p[0]);
  const q = str.split('-');
  if (q.length === 3) return Number(q[0])*10000 + Number(q[1])*100 + Number(q[2]);
  return 0;
}

/** Convierte "H:mm:ss" o "HH:mm:ss" en minutos */
function timeToMin(t) {
  if (!t) return 0;
  const p = (t || '').split(':').map(Number);
  return (p[0]||0)*60 + (p[1]||0);
}

function filtrarRango(rows, params) {
  if (params.from) {
    const fNum = fechaNum(params.from);
    rows = rows.filter(r => fechaNum(r['Fecha']) >= fNum);
  }
  if (params.to) {
    const tNum = fechaNum(params.to);
    rows = rows.filter(r => fechaNum(r['Fecha']) <= tNum);
  }
  return rows;
}

/** Agrega una columna al final de la hoja solo si todavía no existe (no reordena ni pisa las existentes). */
function ensureColumn(sheet, headerName) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const idx = headers.indexOf(headerName);
  if (idx !== -1) return idx + 1;
  const newCol = lastCol + 1;
  sheet.getRange(1, newCol).setValue(headerName).setFontWeight('bold').setBackground('#0D1B2E').setFontColor('white');
  return newCol;
}

function pad(n) { return String(n).padStart(2,'0'); }
function rnd(n) { return Math.round(n * 10) / 10; }

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
