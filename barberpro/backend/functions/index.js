/**
 * Mails automáticos de BarberPro.
 *
 * Estas funciones viven en el proyecto Firebase de Harmonia (plan Blaze) pero los datos están en OTRO proyecto,
 * "barberpro-a6405" (Firestore). Para leerlos y escribirlos, la cuenta de servicio de las funciones de Harmonia
 * tiene el rol "Cloud Datastore User" en barberpro-a6405 (se da una sola vez desde la consola de IAM).
 *
 * - enviarComprobante:   el cliente llama a esto justo después de reservar, con el id de su reserva. La función lee la
 *                        reserva, arma el comprobante con la ubicación y se lo manda al mail que figura EN la reserva
 *                        (nunca a un mail que llegue en el pedido). Una sola vez por reserva.
 * - enviarRecordatorios: todos los días a las 10:00 (hora de Argentina) manda un recordatorio a quienes tienen turno mañana.
 *
 * El mail sale por SMTP (Gmail con contraseña de aplicación por ahora). Se configura con el parámetro SMTP_USER y el
 * secreto SMTP_PASS; para cambiar de proveedor solo hay que tocar crearTransporte().
 */
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret, defineString } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const nodemailer = require("nodemailer");

const SMTP_USER = defineString("SMTP_USER");
const SMTP_PASS = defineSecret("SMTP_PASS");

initializeApp({ projectId: "barberpro-a6405" });
const db = getFirestore();

const ORIGENES = ["https://jvsystems.com.ar", "https://www.jvsystems.com.ar", "http://localhost:8744"];
const TZ = "America/Argentina/Buenos_Aires";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const PAGO = { local: "en el local", transfer: "transferencia", mp: "Mercado Pago" };

function crearTransporte() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value().trim() }
  });
}

function fechaLarga(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dia = DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dia} ${d} de ${MESES[m - 1]}`;
}
function plata(n) { return "$" + Math.round(n).toLocaleString("es-AR"); }
function esc(s) {
  const mapa = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(s || "").replace(/[&<>"']/g, c => mapa[c]);
}
function hoyAR(offsetDias = 0) {
  const t = new Date(Date.now() + offsetDias * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(t);   // YYYY-MM-DD
}

async function leerConfig() {
  const s = await db.doc("config/main").get();
  return s.exists ? s.data() : {};
}
function linkMapa(cfg) {
  if (cfg.mapsLink) return cfg.mapsLink;
  const q = [cfg.businessName, cfg.address].filter(Boolean).join(" ");
  return q ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q) : "";
}

function armarMail(b, cfg, tipo) {
  const negocio = cfg.businessName || "Tu barbería";
  const total = b.price + (b.debtCharged || 0);
  const mapa = linkMapa(cfg);
  const codigo = String(b.id).slice(-6).toUpperCase();
  const recordatorio = tipo === "recordatorio";
  const titulo = recordatorio ? "Recordatorio: mañana tenés turno" : "Tu turno está reservado";
  const filas = [
    ["Cliente", `${b.name} ${b.lastname}`],
    ["Fecha", fechaLarga(b.date)],
    ["Hora", `${b.time} hs`],
    cfg.address ? ["Lugar", cfg.address] : null,
    ["Corte", plata(b.price)],
    b.debtCharged > 0 ? ["Saldo anterior", plata(b.debtCharged)] : null,
    ["Total", plata(total)],
    ["Pago", PAGO[b.payMethod] || b.payMethod]
  ].filter(Boolean);

  const lineas = [`${titulo} - ${negocio}`];
  if (!recordatorio) lineas.push(`N° ${codigo}`);
  lineas.push("");
  filas.forEach(([k, v]) => lineas.push(`${k}: ${v}`));
  lineas.push("");
  if (mapa) lineas.push(`Cómo llegar: ${mapa}`);
  lineas.push("Si cancelás el mismo día del turno se cobra el 50% de seña.");

  const celdas = filas.map(([k, v]) =>
    `<tr><td style="padding:7px 0;color:#5c6b7a;border-bottom:1px solid #e6ebf0">${esc(k)}</td>` +
    `<td style="padding:7px 0;text-align:right;font-weight:600;border-bottom:1px solid #e6ebf0">${esc(v)}</td></tr>`).join("");
  const boton = mapa
    ? `<p style="margin:20px 0"><a href="${esc(mapa)}" style="background:#29b6f6;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;display:inline-block">Cómo llegar</a></p>`
    : "";
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#16202b">` +
    `<h2 style="margin:0 0 4px">${esc(titulo)}</h2>` +
    `<div style="color:#5c6b7a;margin-bottom:16px">${esc(negocio)}${recordatorio ? "" : " · N° " + codigo}</div>` +
    `<table style="width:100%;border-collapse:collapse">${celdas}</table>${boton}` +
    `<p style="color:#5c6b7a;font-size:13px">Si cancelás el mismo día del turno se cobra el 50% de seña.</p></div>`;

  return { subject: `${titulo} - ${negocio}`, text: lineas.join("\n"), html };
}

async function mandar(transporte, b, cfg, tipo) {
  const m = armarMail(b, cfg, tipo);
  await transporte.sendMail({
    from: `"${(cfg.businessName || "BarberPro").replace(/"/g, "")}" <${SMTP_USER.value()}>`,
    to: b.email, subject: m.subject, text: m.text, html: m.html
  });
}

// marca la reserva (con transacción) para que el mismo aviso no salga dos veces; devuelve la reserva o null si ya salió
async function reservar(ref, campo) {
  return db.runTransaction(async tx => {
    const s = await tx.get(ref);
    if (!s.exists) return null;
    const b = s.data();
    if (b[campo]) return null;
    tx.update(ref, { [campo]: Date.now() });
    return b;
  });
}

exports.enviarComprobante = onRequest({ secrets: [SMTP_PASS], cors: ORIGENES, region: "us-central1", maxInstances: 5 }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  const id = String((req.body && req.body.id) || "");
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(id)) return res.status(400).json({ error: "Reserva inválida" });

  const ref = db.doc("bookings/" + id);
  try {
    const previa = await ref.get();
    // solo reservas recién hechas y confirmadas: así esto no sirve para mandar mails a cualquiera después
    if (!previa.exists || previa.data().status !== "confirmed" || Date.now() - previa.data().createdAt > 15 * 60 * 1000) {
      return res.status(404).json({ error: "No encontramos esa reserva" });
    }
    const b = await reservar(ref, "receiptSentAt");
    if (!b) return res.json({ ok: true, yaEnviado: true });
    try {
      await mandar(crearTransporte(), b, await leerConfig(), "comprobante");
    } catch (e) {
      await ref.update({ receiptSentAt: null });          // que se pueda reintentar
      throw e;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("enviarComprobante", e);
    res.status(500).json({ error: "No se pudo enviar el mail" });
  }
});

exports.enviarRecordatorios = onSchedule({ schedule: "0 10 * * *", timeZone: TZ, secrets: [SMTP_PASS], region: "us-central1" }, async () => {
  const manana = hoyAR(1);
  const snap = await db.collection("bookings").where("date", "==", manana).where("status", "==", "confirmed").get();
  if (snap.empty) return;
  const cfg = await leerConfig(), transporte = crearTransporte();
  for (const doc of snap.docs) {
    try {
      const b = await reservar(doc.ref, "reminderSentAt");
      if (!b) continue;
      try { await mandar(transporte, b, cfg, "recordatorio"); }
      catch (e) { await doc.ref.update({ reminderSentAt: null }); throw e; }
    } catch (e) { console.error("recordatorio", doc.id, e); }
  }
});
