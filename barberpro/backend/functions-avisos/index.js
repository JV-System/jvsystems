/**
 * Avisos de BarberPro en el celular del equipo (Web Push estándar: Android y iPhone con la app instalada).
 *
 * Como las otras funciones de BarberPro, viven en el proyecto Firebase de Harmonia (plan Blaze) pero leen y escriben los datos del proyecto
 * "barberpro-a6405". Para eso la cuenta de servicio de las funciones de Harmonia necesita el rol "Cloud Datastore User" en barberpro-a6405.
 *
 * - avisarReserva: la app del cliente la llama apenas reserva, cancela o cambia de día un turno ({id, kind}). La función NO confía en lo que
 *   dice el cliente: lee la reserva en Firestore, comprueba que de verdad pasó (y que no se avisó antes) y recién ahí manda la notificación al
 *   dueño y al barbero del turno. Cada aviso queda marcado en la reserva (pushReservaAt / pushCancelAt / pushMoveAt) para no repetirse.
 * - barridoAvisos: red de seguridad cada 10 minutos para las reservas nuevas cuyo aviso instantáneo no llegó (cliente sin señal, etc.).
 *
 * Las suscripciones de cada celular están en la colección pushSubs (las guarda la app del equipo). La clave privada de Web Push es el secreto
 * VAPID_PRIVATE; la pública está en config.js (pushPublicKey) y acá abajo. Si se cambian, hay que cambiar las dos a la vez.
 */
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const webpush = require("web-push");

const VAPID_PRIVATE = defineSecret("VAPID_PRIVATE");
const VAPID_PUBLIC = "BAJbyFqw0Hzsf8cPwK_-N7jDCDcwXl5LT_OqLuTP76ldeKhkSbYCK339CD7GFrihrLcyUHHBU-W0QmsTTAezSHk";
const VAPID_CONTACTO = "mailto:jvillanueva@jvsystems.com.ar";

initializeApp({ projectId: "barberpro-a6405" });
const db = getFirestore();

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const KINDS = {
  reserva: { flag: "pushReservaAt" },
  cancelacion: { flag: "pushCancelAt" },
  cambio_dia: { flag: "pushMoveAt" }
};

function diaCorto(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}/${m}`;
}

function armarAviso(kind, b) {
  const quien = (b.nickname || `${b.name || ""} ${b.lastname || ""}`).trim() || "Un cliente";
  const con = b.barberName ? ` · ${b.barberName}` : "";
  if (kind === "reserva") {
    return {
      title: `Turno nuevo${con}`,
      body: `${quien} · ${diaCorto(b.date)} ${b.time} hs${b.walkIn ? " (orden de llegada)" : ""}`
    };
  }
  if (kind === "cancelacion") {
    return { title: `Turno cancelado${con}`, body: `${quien} canceló el de ${diaCorto(b.date)} ${b.time} hs` };
  }
  const antes = b.originalDate ? ` Antes: ${diaCorto(b.originalDate)} ${b.originalTime || ""} hs.` : "";
  return { title: `Cambio de día${con}`, body: `${quien} ahora viene el ${diaCorto(b.date)} a las ${b.time} hs.${antes}` };
}

// ¿Pasó de verdad lo que dice el cliente? (la reserva se lee de Firestore, no se cree del pedido)
function validaPara(kind, b) {
  if (kind === "reserva") return b.status === "confirmed" && Date.now() - Number(b.createdAt || 0) < 6 * 3600 * 1000;
  if (kind === "cancelacion") return b.status === "cancelled";
  if (kind === "cambio_dia") return Number(b.rescheduled || 0) === 1 && b.status === "confirmed";
  return false;
}

// marca el aviso como enviado (con transacción) y devuelve la reserva, o null si no corresponde o ya se avisó
async function reservarAviso(id, kind) {
  const ref = db.doc(`bookings/${id}`);
  return db.runTransaction(async tx => {
    const s = await tx.get(ref);
    if (!s.exists) return null;
    const b = s.data();
    const flag = KINDS[kind].flag;
    if (b[flag] || !validaPara(kind, b)) return null;
    tx.update(ref, { [flag]: Date.now() });
    return b;
  });
}

async function destinatarios(b) {
  const snap = await db.collection("pushSubs").get();
  const barbero = b.barberId || "";
  return snap.docs
    .map(d => ({ ref: d.ref, ...d.data() }))
    .filter(s => s.role === "owner" || (s.role === "staff" && s.barberId === barbero));
}

async function enviar(b, kind, id) {
  webpush.setVapidDetails(VAPID_CONTACTO, VAPID_PUBLIC, VAPID_PRIVATE.value());
  const aviso = armarAviso(kind, b);
  const payload = JSON.stringify({ ...aviso, tag: `${kind}-${id}`, url: "admin.html" });
  const subs = await destinatarios(b);
  let enviados = 0;
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 12 * 3600, urgency: "high" });
      enviados++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await s.ref.delete().catch(() => {});   // el celular ya no está suscripto
      else console.error("push", s.role, e.statusCode || e.message);
    }
  }));
  return enviados;
}

async function procesar(id, kind) {
  const b = await reservarAviso(id, kind);
  if (!b) return { ok: true, sent: 0 };
  let sent = 0;
  try { sent = await enviar(b, kind, id); }
  catch (e) { await db.doc(`bookings/${id}`).update({ [KINDS[kind].flag]: null }).catch(() => {}); throw e; }   // que se pueda reintentar
  return { ok: true, sent };
}

exports.avisarReserva = onRequest({ region: "us-central1", cors: true, invoker: "public", secrets: [VAPID_PRIVATE], maxInstances: 5 }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ ok: false }); return; }
  let datos = req.body;
  if (typeof datos === "string") { try { datos = JSON.parse(datos); } catch (e) { datos = null; } }
  const id = datos && typeof datos.id === "string" ? datos.id : "";
  const kind = datos && typeof datos.kind === "string" ? datos.kind : "";
  if (!/^[a-z0-9]{6,40}$/i.test(id) || !KINDS[kind]) { res.status(400).json({ ok: false }); return; }
  try { res.json(await procesar(id, kind)); }
  catch (e) { console.error("avisarReserva", e); res.status(500).json({ ok: false }); }
});

exports.barridoAvisos = onSchedule({ schedule: "every 10 minutes", timeZone: "America/Argentina/Buenos_Aires", secrets: [VAPID_PRIVATE], region: "us-central1" }, async () => {
  const desde = Date.now() - 3 * 3600 * 1000;
  const snap = await db.collection("bookings").where("createdAt", ">=", desde).get();
  for (const d of snap.docs) {
    const b = d.data();
    if (b.status === "confirmed" && !b.pushReservaAt) {
      try { await procesar(d.id, "reserva"); } catch (e) { console.error("barrido", d.id, e); }
    }
  }
});
