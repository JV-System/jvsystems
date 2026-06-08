// ============================================================
//  BRANCA — Apps Script completo
//  Una sola hoja de cálculo con 5 pestañas:
//  Ordenes | Clientes | Tecnicos | Usuarios | Config
// ============================================================

var SS = SpreadsheetApp.getActiveSpreadsheet();

// ── Helpers de hoja ─────────────────────────────────────────
function getSheet(name) {
  var sh = SS.getSheetByName(name);
  if (!sh) sh = SS.insertSheet(name);
  return sh;
}

// Lee todos los datos de una hoja (cada fila = JSON en columna A)
function readAll(sheetName) {
  var sh = getSheet(sheetName);
  var data = sh.getDataRange().getValues();
  var result = [];
  for (var i = 0; i < data.length; i++) {
    if (data[i][0]) {
      try { result.push(JSON.parse(data[i][0])); } catch(e) {}
    }
  }
  return result;
}

// Guarda un item (busca por id, reemplaza o agrega al final)
function saveItem(sheetName, item) {
  var sh = getSheet(sheetName);
  var data = sh.getDataRange().getValues();
  var json = JSON.stringify(item);
  for (var i = 0; i < data.length; i++) {
    if (data[i][0]) {
      try {
        var row = JSON.parse(data[i][0]);
        if (String(row.id) === String(item.id)) {
          sh.getRange(i + 1, 1).setValue(json);
          return;
        }
      } catch(e) {}
    }
  }
  // No encontrado → agregar nueva fila
  sh.appendRow([json]);
}

// Elimina un item por id
function deleteItem(sheetName, id) {
  var sh = getSheet(sheetName);
  var data = sh.getDataRange().getValues();
  for (var i = data.length - 1; i >= 0; i--) {
    if (data[i][0]) {
      try {
        var row = JSON.parse(data[i][0]);
        if (String(row.id) === String(id)) {
          sh.deleteRow(i + 1);
          return;
        }
      } catch(e) {}
    }
  }
}

// Reemplaza toda la hoja con un array de items
function replaceAll(sheetName, items) {
  var sh = getSheet(sheetName);
  sh.clearContents();
  if (items && items.length) {
    var rows = items.map(function(item) { return [JSON.stringify(item)]; });
    sh.getRange(1, 1, rows.length, 1).setValues(rows);
  }
}

// ── CORS headers ────────────────────────────────────────────
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

    // ÓRDENES
    if (action === 'saveOrden') {
      saveItem('Ordenes', body.data);
      return corsOutput({ ok: true });
    }
    if (action === 'deleteOrden') {
      deleteItem('Ordenes', body.id);
      return corsOutput({ ok: true });
    }

    // CLIENTES
    if (action === 'saveCliente') {
      saveItem('Clientes', body.data);
      return corsOutput({ ok: true });
    }
    if (action === 'deleteCliente') {
      deleteItem('Clientes', body.id);
      return corsOutput({ ok: true });
    }

    // TÉCNICOS
    if (action === 'saveTecnico') {
      saveItem('Tecnicos', body.data);
      return corsOutput({ ok: true });
    }
    if (action === 'deleteTecnico') {
      deleteItem('Tecnicos', body.id);
      return corsOutput({ ok: true });
    }

    // USUARIOS — se guarda la lista completa de una vez
    if (action === 'saveUsuarios') {
      replaceAll('Usuarios', body.data);
      return corsOutput({ ok: true });
    }

    // CONFIG
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
