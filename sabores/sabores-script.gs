/**
 * SABORES DE MISIONES — Google Apps Script Backend
 * JV Systems · Soluciones Digitales
 *
 * Guarda toda la base de datos como JSON en una hoja "SaboresDB".
 * Cell A1 = db principal (pedidos, clientes, etc.)
 * Cell A2 = usuarios del sistema
 *
 * INSTRUCCIONES DE DESPLIEGUE:
 * 1. Crear una hoja de cálculo nueva en Google Sheets
 * 2. Ir a Extensiones → Apps Script → pegar este código
 * 3. Guardar y desplegar: Implementar → Nueva implementación
 *    - Tipo: Aplicación web
 *    - Ejecutar como: Yo (tu cuenta)
 *    - Quién tiene acceso: Cualquier usuario
 * 4. Copiar la URL de implementación
 * 5. Pegarla en el index.html (constante SABORES_SCRIPT_URL)
 */

const SHEET_NAME = 'SaboresDB';
const ROW_DB     = 1;   // fila 1 → base de datos principal
const ROW_USR    = 2;   // fila 2 → usuarios del sistema

// ── Router GET ────────────────────────────────────────────────────────────────

function doGet(e) {
  const action = (e.parameter.action || '').trim();
  try {
    switch (action) {
      case 'ping':        return jsonOut({ ok: true, ts: new Date().toISOString() });
      case 'getDB':       return jsonOut(getData(ROW_DB));
      case 'getUsuarios': return jsonOut(getData(ROW_USR));
      default:            return jsonOut({ success: false, error: 'Acción no reconocida: ' + action });
    }
  } catch (err) {
    return jsonOut({ success: false, error: err.toString() });
  }
}

// ── Router POST ───────────────────────────────────────────────────────────────
// El frontend envía mode:'no-cors' + Content-Type:text/plain.
// La acción llega como ?action= en la URL (e.parameter).
// El JSON de datos llega en e.postData.contents.

function doPost(e) {
  try {
    const action = (e.parameter.action || '').trim();
    const data   = e.postData ? e.postData.contents : '';
    switch (action) {
      case 'saveDB':       return jsonOut(setData(ROW_DB, data));
      case 'saveUsuarios': return jsonOut(setData(ROW_USR, data));
      default:             return jsonOut({ success: false, error: 'Acción no reconocida: ' + action });
    }
  } catch (err) {
    return jsonOut({ success: false, error: err.toString() });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function getData(row) {
  const val = getSheet().getRange(row, 1).getValue();
  return { success: true, data: val ? val.toString() : '' };
}

function setData(row, value) {
  getSheet().getRange(row, 1).setValue(value || '');
  return { success: true };
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
