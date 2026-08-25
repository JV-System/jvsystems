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
      const uC = new URL(XUBIO_API_BASE + "/clienteBean");
      const r = await doRequest({ hostname: uC.hostname, path: uC.pathname, method: "GET", headers: { "Authorization": "Bearer " + token } });
      const lista = Array.isArray(r.body) ? r.body.slice(0, 5).map(c => ({ id: c.cliente_id, nombre: c.nombre })) : r.body;
      res.json({ ok: true, status: r.status, primeros5: lista });
    } catch(e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);

// ══════════════════════════════════════════════
// FUNCIÓN: numero de comprobante consultado a Xubio en vivo
// ══════════════════════════════════════════════
// El "N° Comprobante" que se sugiere en la app es solo una referencia
// interna (Xubio asigna su propio numero real al crear la factura, este
// campo no se le manda). Calcularlo con datos locales (facturacion.nroFactura
// guardada en cada orden) se desincroniza facil -- por eso se le pregunta
// a Xubio directamente cual es el ultimo numero real de ese talonario.
exports.xubioUltimoNumero = onRequest(
  { secrets: ["XUBIO_CLIENT_ID", "XUBIO_SECRET_ID"] },
  async (req, res) => {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.set(k, v));
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    try {
      const prefijo = (req.query.prefijo || "A-00001-");
      const token = await getXubioToken();
      const u = new URL(XUBIO_API_BASE + "/comprobanteVentaBean");
      const r = await doRequest({ hostname: u.hostname, path: u.pathname, method: "GET", headers: { "Authorization": "Bearer " + token } });
      const lista = Array.isArray(r.body) ? r.body : [];
      const nums = lista
        .map(c => c.numeroDocumento || "")
        .filter(n => n.startsWith(prefijo))
        .map(n => parseInt(n.slice(prefijo.length), 10))
        .filter(n => !isNaN(n));
      const max = nums.length ? Math.max(...nums) : null;
      const proximo = prefijo + String((max || 0) + 1).padStart(8, "0");
      res.json({ ok: true, ultimo: max ? prefijo + String(max).padStart(8, "0") : null, proximo });
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

      // Siempre Cuenta Corriente en Xubio — Xubio exige cobros para Contado (API change)
      const condicion = 1;

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
              res.json({ clienteNoEncontrado: true, nombre: nombreCliente });
              return;
            }
            // Intentar crear cliente en Xubio.
            // El campo real no es "condicionIVA" (no existe en el esquema de Xubio) sino
            // "categoriaFiscal", un objeto {ID,id,codigo,nombre} — confirmado inspeccionando
            // un cliente real existente. Xubio tira 500 generico si faltan objetos que
            // procesa sin chequeo de null (pais, identificacionTributaria, cuentas), asi
            // que se completan con los mismos valores que trae cualquier cliente real.
            const catFiscalMap = {
              "RI": { ID: 1, id: 1, codigo: "RI", nombre: "Responsable Inscripto" },
              "M":  { ID: 6, id: 6, codigo: "M",  nombre: "Monotributista" },
              "CF": { ID: 5, id: 5, codigo: "CF", nombre: "Consumidor Final" },
              "E":  { ID: 4, id: 4, codigo: "E",  nombre: "Exento" },
            };
            const categoriaFiscal = catFiscalMap[datos.condicionIVA] || catFiscalMap["CF"];
            // Xubio espera el CUIT CON guiones (formato XX-XXXXXXXX-X, igual que en los
            // clientes existentes) — mandarlo sin guiones es lo que rompia la creacion.
            const cuitDigitos = datos.cuit ? String(datos.cuit).replace(/[^0-9]/g, "") : "";
            const cuitLimpio = cuitDigitos.length === 11
              ? cuitDigitos.slice(0,2) + "-" + cuitDigitos.slice(2,10) + "-" + cuitDigitos.slice(10)
              : (datos.cuit || "");
            const nuevoCliente = {
              nombre: nombreCliente,
              razonSocial: nombreCliente,
              categoriaFiscal: categoriaFiscal,
              identificacionTributaria: { ID: 9, id: 9, codigo: "CUIT", nombre: "CUIT" },
              pais: { ID: 1, id: 1, codigo: "ARGENTINA", nombre: "Argentina" },
              cuentaVenta_id: { ID: -3, id: -3, codigo: "DEUDORES_POR_VENTA", nombre: "Deudores por Venta" },
              cuentaCompra_id: { ID: -7, id: -7, codigo: "PROVEEDORES", nombre: "Proveedores" },
              esProveedor: 0,
              esclienteextranjero: 0,
              responsabilidadOrganizacionItem: [],
              direccion: "", telefono: "", descripcion: "", usrCode: "",
            };
            if (cuitLimpio) { nuevoCliente.cuit = cuitLimpio; nuevoCliente.CUIT = cuitLimpio; }
            if (datos.email) nuevoCliente.email = datos.email;
            if (datos.telefono) nuevoCliente.telefono = datos.telefono;
            if (datos.ubicacion) nuevoCliente.direccion = datos.ubicacion;
            const bodyCliente = JSON.stringify(nuevoCliente);
            const urlCliente = new URL(XUBIO_API_BASE + "/clienteBean");
            const hdrCliente = { "Content-Type": "application/json", "Authorization": "Bearer " + token, "Content-Length": Buffer.byteLength(bodyCliente, "utf8") };
            console.log("Payload crear cliente:", bodyCliente);
            let rCrear = await doRequest({ hostname: urlCliente.hostname, path: urlCliente.pathname, method: "POST", headers: hdrCliente }, bodyCliente);
            if (rCrear.status !== 200 && rCrear.status !== 201) {
              rCrear = await doRequest({ hostname: urlCliente.hostname, path: urlCliente.pathname, method: "PUT", headers: hdrCliente }, bodyCliente);
            }
            console.log("Crear cliente status:", rCrear.status, "body:", JSON.stringify(rCrear.body));
            if ((rCrear.status !== 200 && rCrear.status !== 201) && cuitLimpio) {
              // Confirmado (25/08): mandar CUIT hace que Xubio devuelva 500 al crear
              // un cliente nuevo, de forma reproducible, sin importar el formato del
              // valor -- probablemente su validacion contra AFIP fallando de su lado.
              // Reintentar sin CUIT para no dejar a nadie trabado; se puede completar
              // el CUIT despues a mano en Xubio si hace falta.
              console.log("Creacion con CUIT fallo, reintentando sin CUIT...");
              const clienteSinCuit = Object.assign({}, nuevoCliente);
              delete clienteSinCuit.cuit;
              delete clienteSinCuit.CUIT;
              const bodySinCuit = JSON.stringify(clienteSinCuit);
              const hdrSinCuit = { "Content-Type": "application/json", "Authorization": "Bearer " + token, "Content-Length": Buffer.byteLength(bodySinCuit, "utf8") };
              rCrear = await doRequest({ hostname: urlCliente.hostname, path: urlCliente.pathname, method: "POST", headers: hdrSinCuit }, bodySinCuit);
              console.log("Reintento sin CUIT status:", rCrear.status, "body:", JSON.stringify(rCrear.body));
            }
            if (rCrear.status !== 200 && rCrear.status !== 201) {
              res.status(500).json({
                ok: false,
                clienteNoCreado: true,
                nombre: nombreCliente,
                error: "El cliente '" + nombreCliente + "' no existe en Xubio y no se pudo crear por API. Crealo manualmente en Xubio (Contactos → Nuevo cliente) y volvé a intentar.",
                debug: { payloadEnviado: nuevoCliente, xubioStatus: rCrear.status, xubioResponse: rCrear.body }
              });
              return;
            }
            let newId = rCrear.body && (rCrear.body.cliente_id || rCrear.body.ID || rCrear.body.id);
            if (!newId) {
              const rB2 = await doRequest({ hostname: urlClientes.hostname, path: urlClientes.pathname, method: "GET", headers: { "Authorization": "Bearer " + token } });
              if (Array.isArray(rB2.body)) {
                const creado = rB2.body.find(function(c) { const nc = norm(c.nombre); return nc === normBuscar || nc.startsWith(normBuscar) || normBuscar.startsWith(nc); });
                if (creado) newId = creado.cliente_id || creado.ID || creado.id;
              }
            }
            if (newId) {
              clienteObj = { ID: newId, id: newId };
              console.log("Cliente creado, ID:", newId);
            } else {
              res.status(500).json({
                ok: false,
                error: "El cliente '" + nombreCliente + "' no existe en Xubio y no se pudo crear por API. Crealo manualmente en Xubio (Contactos → Nuevo cliente) y volvé a intentar.",
                debug: { payloadEnviado: nuevoCliente, xubioStatus: rCrear.status, xubioResponse: rCrear.body, nota: "La creacion parece haber devuelto " + rCrear.status + " pero sin ID reconocible ni match posterior por nombre." }
              });
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
