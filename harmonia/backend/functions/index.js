/**
 * Backend de pagos de Harmonia (proyecto Firebase "harmonia-ropa-blanca").
 * Separado a propósito de branca-ingenieria: no comparte nada con ese proyecto.
 *
 * - crearPreferencia: recibe el carrito, crea un cobro en Mercado Pago y guarda
 *   el pedido como "pendiente" en la base de datos real de Harmonia (sabores-misiones).
 * - webhookMercadoPago: Mercado Pago llama a esto cuando cambia el estado de un pago.
 *   Vuelve a consultar el pago directamente a la API de MP (nunca confía en el aviso
 *   en sí) y, si está aprobado, marca el pedido como "pagado".
 */
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const MP_ACCESS_TOKEN = defineSecret("MP_ACCESS_TOKEN");

const RTDB_BASE = "https://sabores-misiones-default-rtdb.firebaseio.com";
const RUTA = "harmonia";
const SITIO = "https://jvsystems.com.ar/harmonia/";
// Se completa solo con el project id real al desplegar (ver deploy).
const WEBHOOK_URL = "https://us-central1-harmonia-ropa-blanca.cloudfunctions.net/webhookMercadoPago";

function conCors(res){
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
}

async function rtdbSet(path, data){
  const r = await fetch(`${RTDB_BASE}/${path}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error(`RTDB set falló (${r.status}): ${await r.text()}`);
  return r.json();
}
async function rtdbUpdate(path, data){
  const r = await fetch(`${RTDB_BASE}/${path}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error(`RTDB update falló (${r.status}): ${await r.text()}`);
  return r.json();
}
async function rtdbGet(path){
  const r = await fetch(`${RTDB_BASE}/${path}.json`);
  if (!r.ok) throw new Error(`RTDB get falló (${r.status}): ${await r.text()}`);
  return r.json();
}

exports.crearPreferencia = onRequest({ secrets: [MP_ACCESS_TOKEN], cors: true }, async (req, res) => {
  conCors(res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  try {
    const { items, envio, total } = req.body || {};
    if (!Array.isArray(items) || !items.length || !(total > 0)) {
      return res.status(400).json({ error: "Carrito inválido" });
    }

    const orderId = `harmonia_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Guardamos el pedido como "pendiente" ANTES de mandarlo a Mercado Pago,
    // así el detalle completo (nombres, variantes, cantidades) queda en nuestra
    // base pase lo que pase con el pago.
    await rtdbSet(`${RUTA}/pedidos/${orderId}`, {
      items, envio: envio || 0, total,
      estado: "pendiente",
      fecha: Date.now()
    });

    const itemsMp = items.map(it => ({
      title: String(it.nombre || "Producto").slice(0, 250),
      quantity: Math.max(1, Math.round(it.cantidad || 1)),
      unit_price: Math.round((it.precioUnitario || 0) * 100) / 100,
      currency_id: "ARS"
    }));
    if (envio > 0) {
      itemsMp.push({ title: "Envío", quantity: 1, unit_price: Math.round(envio * 100) / 100, currency_id: "ARS" });
    }

    const mpResp = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MP_ACCESS_TOKEN.value()}`
      },
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

    await rtdbUpdate(`${RUTA}/pedidos/${orderId}`, { preferenceId: mpData.id });

    res.json({ orderId, initPoint: mpData.init_point });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error interno creando el pago" });
  }
});

exports.webhookMercadoPago = onRequest({ secrets: [MP_ACCESS_TOKEN] }, async (req, res) => {
  try {
    const tipo = req.query.type || req.body?.type;
    const paymentId = req.query["data.id"] || req.body?.data?.id;
    if (tipo !== "payment" || !paymentId) return res.status(200).send("ignorado");

    // Nunca confiamos en lo que dice el aviso: volvemos a preguntarle a Mercado Pago.
    const pagoResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { "Authorization": `Bearer ${MP_ACCESS_TOKEN.value()}` }
    });
    if (!pagoResp.ok) return res.status(200).send("no encontrado");
    const pago = await pagoResp.json();
    const orderId = pago.external_reference;
    if (!orderId) return res.status(200).send("sin referencia");

    if (pago.status === "approved") {
      const pedido = await rtdbGet(`${RUTA}/pedidos/${orderId}`);
      if (pedido && pedido.estado !== "pagado") {
        await rtdbUpdate(`${RUTA}/pedidos/${orderId}`, {
          estado: "pagado",
          pagadoEn: Date.now(),
          mpPaymentId: paymentId
        });
      }
    } else {
      await rtdbUpdate(`${RUTA}/pedidos/${orderId}`, { estado: pago.status });
    }

    res.status(200).send("ok");
  } catch (e) {
    console.error(e);
    // 200 igual: si devolvemos error, Mercado Pago reintenta indefinidamente.
    res.status(200).send("error interno registrado");
  }
});
