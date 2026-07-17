const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const https = require("https");
const querystring = require("querystring");

setGlobalOptions({ maxInstances: 10, region: "us-central1" });

// Credenciales Xubio — se configuran con: firebase functions:secrets:set XUBIO_CLIENT_ID
const XUBIO_CLIENT_ID = process.env.XUBIO_CLIENT_ID || "";
const XUBIO_SECRET_ID = process.env.XUBIO_SECRET_ID || "";
const XUBIO_TOKEN_URL = "https://xubio.com/API/1.1/TokenEndpoint";
const XUBIO_API_BASE  = "https://xubio.com/API/1.1";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Helper: hacer request HTTPS
function doRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// Helper: obtener token de Xubio
async function getXubioToken() {
  const basicAuth = Buffer.from(XUBIO_CLIENT_ID + ":" + XUBIO_SECRET_ID).toString("base64");
  const body = "grant_type=client_credentials";
  const url = new URL(XUBIO_TOKEN_URL);
  const result = await doRequest({
    hostname: url.hostname,
    path: url.pathname,
    method: "POST",
    headers: {
      "Authorization": "Basic " + basicAuth,
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
    },
  }, body);

  if (!result.body || !result.body.access_token) {
    throw new Error("Token inválido: " + JSON.stringify(result.body));
  }
  return result.body.access_token;
}

// ══════════════════════════════════════════════
// FUNCIÓN 0: Consultar catálogos de Xubio
// ══════════════════════════════════════════════
exports.xubioInfo = onRequest(
  { secrets: ["XUBIO_CLIENT_ID", "XUBIO_SECRET_ID"] },
  async (req, res) => {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.set(k, v));
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    try {
      const token = await getXubioToken();
      const endpoints = [
        "/CondicionDePagoAPI",
        "/MonedaAPI",
        "/TipoComprobanteAPI",
        "/clienteBean",
      ];
      const results = {};
      for (const ep of endpoints) {
        const url = new URL(XUBIO_API_BASE + ep);
        const r = await doRequest({
          hostname: url.hostname,
          path: url.pathname + (url.search||""),
          method: "GET",
          headers: { "Authorization": "Bearer " + token },
        });
        results[ep] = { status: r.status, body: r.body };
      }
      res.json({ ok: true, results });
    } catch(e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);

// ══════════════════════════════════════════════
// FUNCIÓN 1: Test de conexión — obtener token
// ══════════════════════════════════════════════
exports.xubioToken = onRequest(
  { secrets: ["XUBIO_CLIENT_ID", "XUBIO_SECRET_ID"] },
  async (req, res) => {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.set(k, v));
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    try {
      const token = await getXubioToken();
      res.json({ ok: true, token: token.substring(0, 20) + "..." }); // no exponer token completo
    } catch(e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);

// ══════════════════════════════════════════════
// FUNCIÓN TEST: payload mínimo para diagnóstico
// ══════════════════════════════════════════════
exports.xubioTest = onRequest(
  { secrets: ["XUBIO_CLIENT_ID", "XUBIO_SECRET_ID"] },
  async (req, res) => {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.set(k, v));
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    try {
      const token = await getXubioToken();

      // GET comprobante específico con todos los detalles (incluye items)
      const u2 = new URL(XUBIO_API_BASE + "/comprobanteVentaBean/74613668"); // transaccionid del primer comprobante
      const r2 = await doRequest({ hostname: u2.hostname, path: u2.pathname, method: "GET", headers: { "Authorization": "Bearer " + token } });
      res.json({ ok: true, comprobante_detalle: r2.body });
    } catch(e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);

// ══════════════════════════════════════════════
// FUNCIÓN 2: Crear comprobante en Xubio
// ══════════════════════════════════════════════
exports.xubioCrearComprobante = onRequest(
  { secrets: ["XUBIO_CLIENT_ID", "XUBIO_SECRET_ID"] },
  async (req, res) => {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.set(k, v));
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ ok: false, error: "Method not allowed" }); return; }

    try {
      const token = await getXubioToken();
      const datos = req.body;

      // tipo: 1=Factura, 2=Nota Débito, 3=Nota Crédito, 4=Recibo
      const tipoMap = { "Factura A": 1, "Factura B": 1, "Factura C": 1, "Nota de Débito": 2, "Nota de Crédito": 3, "Recibo": 4 };
      const tipo = tipoMap[datos.tipoComprobante] || 1;

      // condicionDePago: 1=Cuenta Corriente, 2=Contado
      const condMap = { "Contado": 2, "30 días": 1, "60 días": 1, "Cuenta corriente": 1 };
      const condicion = condMap[datos.condicionPago] !== undefined ? condMap[datos.condicionPago] : 2;

      // Items → transaccionProductoItems
      let items = [];
      if (Array.isArray(datos.items) && datos.items.length) {
        items = datos.items
          .filter(function(it) { return (it.PrecioUnitario || 0) > 0; })
          .map(function(it) {
            const precio = it.PrecioUnitario || 0;
            const cant   = it.Cantidad || 1;
            const pct    = it.PorcentajeIVA || 21;
            return {
              descripcion: it.Descripcion || "",
              cantidad:    cant,
              precio:      precio,
              iva:         Math.round(precio * cant * pct / 100),
              producto:    { ID: 1001130, id: 1001130 },
            };
          });
      } else {
        const mkItem = function(desc, precio) {
          return { descripcion: desc, cantidad: 1, precio: precio, iva: Math.round(precio * 0.21), producto: { ID: 1001130, id: 1001130 } };
        };
        if (datos.manoDeObra > 0) items.push(mkItem("Mano de obra" + (datos.obsManoDeObra ? " — " + datos.obsManoDeObra : ""), datos.manoDeObra));
        if (datos.repuestos > 0)  items.push(mkItem("Repuestos"    + (datos.obsRepuestos   ? " — " + datos.obsRepuestos   : ""), datos.repuestos));
        if (datos.gastosVarios > 0) items.push(mkItem("Gastos varios", datos.gastosVarios));
      }

      const nombreCliente = datos.empresa || "";

      // Buscar cliente en Xubio por nombre (GET /clienteBean)
      let clienteObj = { nombre: nombreCliente };
      try {
        const urlClientes = new URL(XUBIO_API_BASE + "/clienteBean");
        const rClientes = await doRequest({
          hostname: urlClientes.hostname, path: urlClientes.pathname, method: "GET",
          headers: { "Authorization": "Bearer " + token },
        });
        if (Array.isArray(rClientes.body)) {
          // Normalizar: minúsculas sin espacios ni puntos
          const norm = function(s) {
            return (s || "").toLowerCase().replace(/[.\s]/g, "");
          };
          const normBuscar = norm(nombreCliente);
          const encontrado = rClientes.body.find(function(c) {
            const normC = norm(c.nombre);
            // Match exacto, o el nombre en Xubio empieza con el nombre buscado (ej. "Nibbler" → "NIBBLER S R L")
            return normC === normBuscar || normC.startsWith(normBuscar);
          });
          if (encontrado) {
            const cid = encontrado.cliente_id || encontrado.ID || encontrado.id;
            clienteObj = { ID: cid, id: cid };
            console.log("Cliente encontrado ID:", cid, "nombre:", encontrado.nombre);
          } else {
            console.log("Cliente no encontrado con nombre:", nombreCliente);
          }
        }
      } catch(e) {
        console.log("Error buscando cliente:", e.message);
      }

      const xubioBody = {
        cliente:          clienteObj,
        tipo:             { ID: tipo, id: tipo },
        fecha:            datos.fecha || new Date().toISOString().split("T")[0],
        fechaVto:         datos.vencimiento || datos.fecha || "",
        condicionDePago:  { ID: condicion, id: condicion },
        descripcion:      datos.numeroComprobante || "",
        puntoVenta:       { ID: 106928, id: 106928, nombre: "INGENIERIA BRANCA SRL", codigo: "INGENIERIA_BRANCA_SRL" },
        moneda:           { ID: -2, id: -2, nombre: "Pesos Argentinos", codigo: "PESOS_ARGENTINOS" },
        transaccionProductoItems: items,
      };
      console.log("Xubio payload:", JSON.stringify(xubioBody));
      const payload = JSON.stringify(xubioBody);

      const url = new URL(XUBIO_API_BASE + "/facturar");
      const result = await doRequest({
        hostname: url.hostname,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token,
          "Content-Length": Buffer.byteLength(payload, "utf8"),
        },
      }, payload);

      console.log("Xubio response status:", result.status);
      const bodyStr = JSON.stringify(result.body);
      console.log("Xubio response body:", bodyStr.substring(0, 2000));
      // Extraer message si existe
      if (result.body && result.body.message) console.log("Xubio error message:", result.body.message);
      if (result.status === 200 || result.status === 201) {
        res.json({ ok: true, data: result.body });
      } else {
        res.status(result.status).json({ ok: false, error: result.body, debug: { payload: xubioBody } });
      }
    } catch(e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);
