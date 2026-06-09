// ============================================================
//  BRANCA — Apps Script completo
//  Una sola hoja de cálculo con 5 pestañas:
//  Ordenes | Clientes | Tecnicos | Usuarios | Config
//
//  Compatible con el formato viejo (ID en col A, JSON en col B)
//  y con el formato nuevo (JSON completo en col A).
//  Al guardar, migra automáticamente al formato nuevo.
// ============================================================

var SS = SpreadsheetApp.getActiveSpreadsheet();

// ── Helpers de hoja ─────────────────────────────────────────
function getSheet(name) {
  var sh = SS.getSheetByName(name);
  if (!sh) sh = SS.insertSheet(name);
  return sh;
}

// Parsea una fila compatible con formato viejo y nuevo.
// Formato viejo: col A = número/id, col B = JSON
// Formato nuevo: col A = JSON completo
function parseRow(row) {
  try {
    // Formato nuevo: col A es JSON
    var valA = String(row[0] || '').trim();
    if (valA.startsWith('{')) return JSON.parse(valA);
    // Formato viejo: col B es JSON
    var valB = String(row[1] || '').trim();
    if (valB.startsWith('{')) return JSON.parse(valB);
  } catch(e) {}
  return null;
}

// Lee todos los datos válidos de una hoja (ignora filas vacías/corruptas)
function readAll(sheetName) {
  var sh = getSheet(sheetName);
  var lastRow = sh.getLastRow();
  if (lastRow === 0) return [];
  var data = sh.getRange(1, 1, lastRow, Math.max(sh.getLastColumn(), 2)).getValues();
  var seen = {};
  var result = [];
  for (var i = 0; i < data.length; i++) {
    var item = parseRow(data[i]);
    if (!item || !item.id) continue;
    var key = String(item.id);
    // Si hay duplicados, quedarse con el más reciente (mayor updatedAt)
    if (seen[key] !== undefined) {
      var existing = result[seen[key]];
      if ((item.updatedAt || 0) > (existing.updatedAt || 0)) {
        result[seen[key]] = item;
      }
      continue;
    }
    seen[key] = result.length;
    result.push(item);
  }
  return result;
}

// Limpia una hoja y la rescribe en formato nuevo (una columna, JSON)
function migrateSheet(sheetName) {
  var items = readAll(sheetName);
  replaceAll(sheetName, items);
}

// Guarda un item: busca por id, reemplaza o agrega. Siempre formato nuevo.
function saveItem(sheetName, item) {
  var sh = getSheet(sheetName);
  var lastRow = sh.getLastRow();
  if (lastRow > 0) {
    var data = sh.getRange(1, 1, lastRow, Math.max(sh.getLastColumn(), 2)).getValues();
    for (var i = 0; i < data.length; i++) {
      var row = parseRow(data[i]);
      if (row && String(row.id) === String(item.id)) {
        // Limpiar toda la fila y escribir solo en col A
        sh.getRange(i + 1, 1, 1, data[i].length).clearContent();
        sh.getRange(i + 1, 1).setValue(JSON.stringify(item));
        return;
      }
    }
  }
  sh.appendRow([JSON.stringify(item)]);
}

// Elimina un item por id
function deleteItem(sheetName, id) {
  var sh = getSheet(sheetName);
  var lastRow = sh.getLastRow();
  if (lastRow === 0) return;
  var data = sh.getRange(1, 1, lastRow, Math.max(sh.getLastColumn(), 2)).getValues();
  for (var i = data.length - 1; i >= 0; i--) {
    var row = parseRow(data[i]);
    if (row && String(row.id) === String(id)) {
      sh.deleteRow(i + 1);
    }
  }
}

// Reemplaza toda la hoja con un array (formato nuevo limpio)
function replaceAll(sheetName, items) {
  var sh = getSheet(sheetName);
  sh.clearContents();
  if (items && items.length) {
    var rows = items.map(function(item) { return [JSON.stringify(item)]; });
    sh.getRange(1, 1, rows.length, 1).setValues(rows);
  }
}

// ── Respuesta JSON ───────────────────────────────────────────
function corsOutput(data) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ── GET ──────────────────────────────────────────────────────
function doGet(e) {
  var action = e.parameter.action;
  try {
    if (action === 'getOrdenes')   return corsOutput({ ordenes:   readAll('Ordenes') });
    if (action === 'getClientes')  return corsOutput({ clientes:  readAll('Clientes') });
    if (action === 'getTecnicos')  return corsOutput({ tecnicos:  readAll('Tecnicos') });
    if (action === 'getUsuarios')  return corsOutput({ usuarios:  readAll('Usuarios') });
    if (action === 'getConfig') {
      var rows = readAll('Config');
      var cfg  = rows.length ? rows[0] : {};
      return corsOutput({ config: cfg });
    }
    // Migración manual: limpia todas las hojas al formato nuevo
    if (action === 'migrar') {
      migrateSheet('Ordenes');
      migrateSheet('Clientes');
      migrateSheet('Tecnicos');
      return corsOutput({ ok: true, mensaje: 'Migración completada' });
    }
    // Reset total: borra todo y deja solo el admin
    if (action === 'resetTodo') {
      ['Ordenes','Clientes','Tecnicos','Config'].forEach(function(name) {
        var sh = SS.getSheetByName(name);
        if (sh) sh.clearContents();
      });
      replaceAll('Usuarios', [
        { id: 1, username: 'admin', password: 'branca2026', role: 'admin', nombre: 'Administrador', firma: null, foto: null }
      ]);
      return corsOutput({ ok: true, mensaje: 'Reset completado' });
    }
    return corsOutput({ error: 'Acción no reconocida: ' + action });
  } catch(err) {
    return corsOutput({ error: err.message });
  }
}

// ── POST ─────────────────────────────────────────────────────
function doPost(e) {
  try {
    var body   = JSON.parse(e.postData.contents);
    var action = body.action;

    if (action === 'saveOrden')      { saveItem('Ordenes',   body.data); return corsOutput({ ok: true }); }
    if (action === 'deleteOrden')    { deleteItem('Ordenes', body.id);   return corsOutput({ ok: true }); }

    if (action === 'saveCliente')    { saveItem('Clientes',   body.data); return corsOutput({ ok: true }); }
    if (action === 'deleteCliente')  { deleteItem('Clientes', body.id);   return corsOutput({ ok: true }); }

    if (action === 'saveTecnico')    { saveItem('Tecnicos',   body.data); return corsOutput({ ok: true }); }
    if (action === 'deleteTecnico')  { deleteItem('Tecnicos', body.id);   return corsOutput({ ok: true }); }

    // Reset total
    if (action === 'resetTodo') {
      ['Ordenes','Clientes','Tecnicos','Config'].forEach(function(name) {
        var sh = SS.getSheetByName(name);
        if (sh) sh.clearContents();
      });
      replaceAll('Usuarios', [
        { id: 1, username: 'admin', password: 'branca2026', role: 'admin', nombre: 'Administrador', firma: null, foto: null }
      ]);
      return corsOutput({ ok: true, mensaje: 'Reset completado' });
    }

    // Usuarios: se guarda la lista completa de una vez
    if (action === 'saveUsuarios')   { replaceAll('Usuarios', body.data); return corsOutput({ ok: true }); }

    if (action === 'saveConfig') {
      var sh = getSheet('Config');
      sh.clearContents();
      sh.getRange(1, 1).setValue(JSON.stringify(body.data));
      return corsOutput({ ok: true });
    }

    return corsOutput({ error: 'Acción no reconocida: ' + action });
  } catch(err) {
    return corsOutput({ error: err.message });
  }
}
