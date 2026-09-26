/**
 * Backend de pagos de ROSE (Mercado Pago). Vive en el proyecto Firebase
 * "harmonia-ropa-blanca" pero en un codebase propio ("rose"):
 *   - usa SU PROPIO Access Token (secreto MP_ACCESS_TOKEN_ROSE), o sea la cuenta de Mercado
 *     Pago de Rose, nunca la de Harmonia;
 *   - lee/escribe solo el path "rose" de la base compartida (sabores-misiones);
 *   - no comparte código ni funciones con Harmonia ni con branca.
 *
 * - crearPreferenciaRose: recibe el carrito, crea el cobro en Mercado Pago con el monto
 *   exacto y guarda el pedido como "pendiente".
 * - webhookMercadoPagoRose: Mercado Pago avisa cuando cambia un pago. Se vuelve a consultar el
 *   pago a la API de MP (nunca se confía en el aviso) y, si está aprobado, el pedido pasa a
 *   "pagado".
 *
 * Diferencia con el de Harmonia: cada línea se cobra por su SUBTOTAL ya calculado (con
 * promos tipo 3x2 incluidas) y se exige que la suma coincida con el total del carrito.
 */
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const MP_ACCESS_TOKEN_ROSE = defineSecret("MP_ACCESS_TOKEN_ROSE");
// .trim() por si quedó un espacio/salto de línea al pegar el token.
const mpToken = () => MP_ACCESS_TOKEN_ROSE.value().trim();

const RTDB_BASE = "https://sabores-misiones-default-rtdb.firebaseio.com";
const RUTA = "rose";
const SITIO = "https://jvsystems.com.ar/rose/";
const WEBHOOK_URL = "https://us-central1-harmonia-ropa-blanca.cloudfunctions.net/webhookMercadoPagoRose";

const centavos = n => Math.round((+n || 0) * 100);

function conCors(res){
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
}

async function rtdb(method, path, data){
  const r = await fetch(`${RTDB_BASE}/${path}.json`, {
    method,
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data)
  });
  if (!r.ok) throw new Error(`RTDB ${method} falló (${r.status}): ${await r.text()}`);
  return r.json();
}

// Nombre de quien PAGA. Con cuenta de Mercado Pago logueada, MP oculta el nombre real y solo
// da un id: ahí se busca su nickname público. (pago.description es el nombre del VENDEDOR.)
async function extraerNombrePagador(pago){
  const deTarjeta = pago.card?.cardholder?.name;
  if (deTarjeta) return deTarjeta;
  const dePayer = [pago.payer?.first_name, pago.payer?.last_name].filter(Boolean).join(" ");
  if (dePayer) return dePayer;
  if (pago.payer?.id) {
    try {
      const r = await fetch(`https://api.mercadopago.com/users/${pago.payer.id}`, {
        headers: { "Authorization": `Bearer ${mpToken()}` }
      });
      if (r.ok) { const u = await r.json(); if (u.nickname) return u.nickname; }
    } catch (e) { console.error("No se pudo obtener el nickname del comprador:", e); }
  }
  return null;
}

exports.crearPreferenciaRose = onRequest({ secrets: [MP_ACCESS_TOKEN_ROSE], cors: true }, async (req, res) => {
  conCors(res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  try {
    const { items, envio, total, cliente } = req.body || {};
    if (!Array.isArray(items) || !items.length || items.length > 60 || !(total > 0) || total > 10000000) {
      return res.status(400).json({ error: "Carrito inválido" });
    }

    // Cada línea se cobra por su subtotal (ya incluye descuentos y promos NxM).
    const lineas = items.map(it => {
      const cant = Math.max(1, Math.round(+it.cantidad || 1));
      const subtotal = Number.isFinite(+it.subtotal) ? +it.subtotal : (+it.precioUnitario || 0) * cant;
      return { nombre: String(it.nombre || "Producto").slice(0, 200), cant, subC: centavos(subtotal) };
    });
    const envioC = centavos(envio || 0);
    if (lineas.some(l => l.subC <= 0) || envioC < 0) return res.status(400).json({ error: "Carrito inválido" });
    if (lineas.reduce((s, l) => s + l.subC, 0) + envioC !== centavos(total)) {
      return res.status(400).json({ error: "El total no coincide con el detalle" });
    }

    const orderId = `rose_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Se guarda "pendiente" ANTES de ir a Mercado Pago: el detalle completo queda en nuestra base
    // pase lo que pase con el pago. El nombre lo escribe el cliente en el carrito.
    await rtdb("PUT", `${RUTA}/pedidos/${orderId}`, {
      items, envio: envio || 0, total,
      cliente: String(cliente || "").trim().slice(0, 120) || null,
      estado: "pendiente",
      fecha: Date.now()
    });

    const itemsMp = lineas.map(l => ({
      title: (l.cant > 1 ? `${l.nombre} x${l.cant}` : l.nombre).slice(0, 250),
      quantity: 1,
      unit_price: l.subC / 100,
      currency_id: "ARS"
    }));
    if (envioC > 0) itemsMp.push({ title: "Envío", quantity: 1, unit_price: envioC / 100, currency_id: "ARS" });

    const mpResp = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mpToken()}` },
      body: JSON.stringify({
        items: itemsMp,
        external_reference: orderId,
        notification_url: WEBHOOK_URL,
        back_urls: { success: SITIO, failure: SITIO, pending: SITIO },
        auto_return: "approved"
      })
    });
    const mpData = await mpResp.json();
    if (!mpResp.ok) {
      console.error("Error de Mercado Pago:", mpData);
      return res.status(502).json({ error: "No se pudo iniciar el pago con Mercado Pago" });
    }

    await rtdb("PATCH", `${RUTA}/pedidos/${orderId}`, { preferenceId: mpData.id });
    res.json({ orderId, initPoint: mpData.init_point });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error interno creando el pago" });
  }
});

exports.webhookMercadoPagoRose = onRequest({ secrets: [MP_ACCESS_TOKEN_ROSE] }, async (req, res) => {
  try {
    const tipo = req.query.type || req.body?.type;
    const paymentId = req.query["data.id"] || req.body?.data?.id;
    if (tipo !== "payment" || !paymentId) return res.status(200).send("ignorado");

    // Nunca se confía en el aviso: se vuelve a preguntar a Mercado Pago.
    const pagoResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { "Authorization": `Bearer ${mpToken()}` }
    });
    if (!pagoResp.ok) return res.status(200).send("no encontrado");
    const pago = await pagoResp.json();
    const orderId = pago.external_reference;
    // Solo pedidos de esta tienda (por si el aviso llegara con la referencia de otra).
    if (!orderId || !String(orderId).startsWith("rose_")) return res.status(200).send("sin referencia");

    if (pago.status === "approved") {
      const pedido = await rtdb("GET", `${RUTA}/pedidos/${orderId}`);
      if (pedido && pedido.estado !== "pagado") {
        await rtdb("PATCH", `${RUTA}/pedidos/${orderId}`, {
          estado: "pagado",
          pagadoEn: Date.now(),
          mpPaymentId: paymentId,
          pagador: await extraerNombrePagador(pago),
          pagadorEmail: pago.payer?.email || null
        });
      }
    } else if (await rtdb("GET", `${RUTA}/pedidos/${orderId}`)) {
      await rtdb("PATCH", `${RUTA}/pedidos/${orderId}`, { estado: pago.status });
    }

    res.status(200).send("ok");
  } catch (e) {
    console.error(e);
    // 200 igual: si devolvemos error, Mercado Pago reintenta indefinidamente.
    res.status(200).send("error interno registrado");
  }
});
