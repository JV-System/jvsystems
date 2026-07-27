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
        "/ProvinciaAPI",
        "/PaisAPI",
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

      // Buscar comprobantes de hoy y borrar el de Nibbler
      const u2 = new URL(XUBIO_API_BASE + "/comprobanteVentaBean");
      const r2 = await doRequest({ hostname: u2.hostname, path: u2.pathname, method: "GET", headers: { "Authorization": "Bearer " + token } });
      const hoy = new Date().toISOString().split("T")[0];
      const deHoy = Array.isArray(r2.body) ? r2.body.filter(c => c.fecha === hoy) : [];
      // GET comprobante específico de RAMI
      const uRami = new URL(XUBIO_API_BASE + "/comprobanteVentaBean/75339578");
      const rRami = await doRequest({ hostname: uRami.hostname, path: uRami.pathname, method: "GET", headers: { "Authorization": "Bearer " + token } });
      res.json({ ok: true, rami: rRami.body });
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
              producto:    { ID: 1001130, id: 1001130 },
            };
          });
      } else {
        const mkItem = function(desc, precio) {
          return { descripcion: desc, cantidad: 1, precio: precio, producto: { ID: 1001130, id: 1001130 } };
        };
        if (datos.manoDeObra > 0) items.push(mkItem(datos.obsManoDeObra || "Mano de obra", datos.manoDeObra));
        if (datos.repuestos > 0)  items.push(mkItem(datos.obsRepuestos   || "Repuestos",   datos.repuestos));
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
          const norm = function(s) {
            return (s || "").toLowerCase().replace(/[.\s]/g, "");
          };
          const normBuscar = norm(nombreCliente);
          const encontrado = rClientes.body.find(function(c) {
            const normC = norm(c.nombre);
            return normC === normBuscar || normC.startsWith(normBuscar);
          });
          if (encontrado) {
            const cid = encontrado.cliente_id || encontrado.ID || encontrado.id;
            clienteObj = { ID: cid, id: cid };
            console.log("Cliente encontrado ID:", cid, "nombre:", encontrado.nombre);
          } else {
            console.log("Cliente no encontrado:", nombreCliente);
            if (!datos.condicionIVA) {
              // Sin condición IVA → pedir al frontend que muestre el popup
              res.json({ clienteNoEncontrado: true, nombre: nombreCliente });
              return;
            }
            // Con condición IVA (viene del popup) → crear cliente en Xubio
            const ivaMap = {
              "RI": { ID: 1, id: 1, nombre: "Responsable Inscripto", codigo: "RI" },
              "CF": { ID: 2, id: 2, nombre: "Consumidor Final",      codigo: "CF" },
              "M":  { ID: 3, id: 3, nombre: "Monotributista",        codigo: "M"  },
              "E":  { ID: 5, id: 5, nombre: "Exento",                codigo: "E"  },
            };
            const ivaIdMap = { "RI": 1, "M": 6, "CF": 5, "E": 4 };
            const ivaId = ivaIdMap[datos.condicionIVA] || 5;
            const nuevoCliente = { nombre: nombreCliente, condicionIVA: ivaId };
            if (datos.cuit) nuevoCliente.cuit = String(datos.cuit).replace(/[-\s]/g, "");
            const bodyCliente = JSON.stringify(nuevoCliente);
            const urlCliente = new URL(XUBIO_API_BASE + "/clienteBean");
            const reqOpts = (method) => ({
              hostname: urlCliente.hostname, path: urlCliente.pathname, method,
              headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token,
                "Content-Length": Buffer.byteLength(bodyCliente, "utf8"),
              },
            });
            console.log("Payload crear cliente:", bodyCliente);
            let rCrear = await doRequest(reqOpts("POST"), bodyCliente);
            console.log("Crear cliente POST status:", rCrear.status, "body:", JSON.stringify(rCrear.body).substring(0, 300));
            if (rCrear.status !== 200 && rCrear.status !== 201) {
              rCrear = await doRequest(reqOpts("PUT"), bodyCliente);
              console.log("Crear cliente PUT status:", rCrear.status, "body:", JSON.stringify(rCrear.body).substring(0, 300));
            }
            if (rCrear.status !== 200 && rCrear.status !== 201) {
              res.status(500).json({ ok: false, error: "Error al crear cliente en Xubio (status " + rCrear.status + "): " + JSON.stringify(rCrear.body).substring(0, 300) });
              return;
            }
            // Intentar ID de la respuesta directa
            let newId = rCrear.body && (rCrear.body.cliente_id || rCrear.body.ID || rCrear.body.id);
            // Si no vino en respuesta, buscar de nuevo en Xubio
            if (!newId) {
              const rBuscar2 = await doRequest({
                hostname: urlClientes.hostname, path: urlClientes.pathname, method: "GET",
                headers: { "Authorization": "Bearer " + token },
              });
              if (Array.isArray(rBuscar2.body)) {
                const creado = rBuscar2.body.find(function(c) {
                  const nc = norm(c.nombre);
                  return nc === normBuscar || nc.startsWith(normBuscar) || normBuscar.startsWith(nc);
                });
                if (creado) newId = creado.cliente_id || creado.ID || creado.id;
                console.log("Rebúsqueda post-creación:", creado ? creado.nombre + " ID:" + newId : "no encontrado");
              }
            }
            if (newId) {
              clienteObj = { ID: newId, id: newId };
              console.log("Cliente creado, usando ID:", newId);
            } else {
              console.log("No se pudo obtener ID tras crear cliente");
              res.status(500).json({ ok: false, error: "Cliente creado en Xubio pero no se pudo obtener su ID. Esperá unos segundos y reintentá — ya debería aparecer en la lista." });
              return;
            }
          }
        }
      } catch(e) {
        console.log("Error buscando cliente:", e.message);
      }

      const xubioBody = {
        cliente:          clienteObj,
        tipo:             tipo,
        fecha:            datos.fecha || new Date().toISOString().split("T")[0],
        fechaVto:         datos.vencimiento || datos.fecha || "",
        condicionDePago:  condicion,
        descripcion:      "",
        puntoVenta:       { ID: 106928, id: 106928, nombre: "INGENIERIA BRANCA SRL", codigo: "INGENIERIA_BRANCA_SRL" },
        moneda:           { ID: -2, id: -2, nombre: "Pesos Argentinos", codigo: "PESOS_ARGENTINOS" },
        transaccionProductoItems: items,
        transaccionCobranzaItems: [],
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
