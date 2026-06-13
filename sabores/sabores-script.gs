/**
 * SABORES DE MISIONES — Google Apps Script Backend v3
 * JV Systems · Soluciones Digitales
 *
 * Estructura de hojas:
 *   "Usuarios"  → A1 = array JSON de usuarios del sistema
 *   "Pedidos"   → A1 = array JSON de pedidos
 *   "DB"        → A1 = resto de la base (clientes, compras, despachos, gastos, config)
 *
 * INSTRUCCIONES:
 * 1. Abrí tu hoja de cálculo de Google Sheets
 * 2. Extensiones → Apps Script → reemplazá todo con este código
 * 3. Guardar → Implementar → Nueva implementación
 *    - Tipo: Aplicación web
 *    - Ejecutar como: Yo
 *    - Acceso: Cualquier usuario
 * 4. Copiá la URL y pegala en index.html (SABORES_SCRIPT_URL)
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function hoja(nombre) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(nombre) || ss.insertSheet(nombre);
}

function leer(nombre) {
  const val = hoja(nombre).getRange(1, 1).getValue();
  return { success: true, data: val ? val.toString() : '' };
}

function guardar(nombre, valor) {
  hoja(nombre).getRange(1, 1).setValue(valor || '');
  SpreadsheetApp.flush();
  return { success: true };
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── GET ───────────────────────────────────────────────────────────────────────

function doGet(e) {
  const action = (e.parameter.action || '').trim();
  try {
    switch (action) {
      case 'ping':        return jsonOut({ ok: true, ts: new Date().toISOString() });
      case 'getUsuarios': return jsonOut(leer('Usuarios'));
      case 'getPedidos':  return jsonOut(leer('Pedidos'));
      case 'getDB':       return jsonOut(leer('DB'));
      default:            return jsonOut({ success: false, error: 'Acción desconocida: ' + action });
    }
  } catch (err) {
    return jsonOut({ success: false, error: err.toString() });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    const action = (e.parameter.action || '').trim();
    const data   = e.postData ? e.postData.contents : '';
    switch (action) {
      case 'saveUsuarios': return jsonOut(guardar('Usuarios', data));
      case 'savePedidos':  return jsonOut(guardar('Pedidos',  data));
      case 'saveDB':       return jsonOut(guardar('DB',       data));
      default:             return jsonOut({ success: false, error: 'Acción desconocida: ' + action });
    }
  } catch (err) {
    return jsonOut({ success: false, error: err.toString() });
  }
}
