/**
 * Recordatorios automáticos de BarberPro por mail.
 *
 * Estas funciones viven en el proyecto Firebase de Harmonia (plan Blaze, codebase "barberpro", no tocan las de Harmonia) pero los datos están en
 * OTRO proyecto, "barberpro-a6405" (Firestore). Para leerlos y escribirlos, la cuenta de servicio de las funciones de Harmonia tiene el rol
 * "Cloud Datastore User" en barberpro-a6405 (se da una sola vez desde la consola de IAM).
 *
 * - enviarRecordatorios: todos los días a las 10:00 (hora de Argentina) manda un mail de recordatorio a quienes tienen turno confirmado
 *   mañana. Saltea a los que ya fueron avisados (a mano desde el panel o por este mismo proceso) y a los que no tienen mail. Cada envío
 *   queda marcado en la reserva (reminded) y anotado en el registro de movimientos. El dueño lo enciende o apaga desde el panel
 *   (config/main.autoReminders; si no está, se considera encendido).
 *
 * El mail sale por SMTP (Gmail con contraseña de aplicación). Se configura con el parámetro SMTP_USER y el secreto SMTP_PASS; para cambiar de
 * proveedor solo hay que tocar crearTransporte().
 */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret, defineString } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const nodemailer = require("nodemailer");

const SMTP_USER = defineString("SMTP_USER");
const SMTP_PASS = defineSecret("SMTP_PASS");

initializeApp({ projectId: "barberpro-a6405" });
const db = getFirestore();

const SITIO = "https://jvsystems.com.ar/barberpro/";
const TZ = "America/Argentina/Buenos_Aires";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

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
function esc(s) {
  const mapa = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(s || "").replace(/[&<>"']/g, c => mapa[c]);
}
function fechaAR(offsetDias = 0) {
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

function armarMail(b, cfg) {
  const negocio = cfg.businessName || "Tu barbería";
  const mapa = linkMapa(cfg);
  const equipo = Array.isArray(cfg.team) && cfg.team.filter(m => m.active !== false).length > 1;
  const nombre = b.nickname || b.name;
  const filas = [
    ["Fecha", fechaLarga(b.date)],
    ["Hora", `${b.time} hs`],
    equipo && b.barberName ? ["Con", b.barberName] : null,
    cfg.address ? ["Lugar", cfg.address] : null
  ].filter(Boolean);
  const conSena = Number(cfg.depositPercent === undefined ? 50 : cfg.depositPercent) > 0;
  const politica = conSena
    ? "Si necesitás cambiar el día, podés hacerlo desde la app hasta 24 horas antes (un cambio por turno). Si cancelás el mismo día del turno, la seña queda en el local."
    : "Si no podés venir, avisanos con tiempo: cancelar el mismo día del turno tiene un cargo del 50%.";

  const lineas = [`Hola ${nombre}! Te recordamos que mañana tenés turno en ${negocio}.`, ""];
  filas.forEach(([k, v]) => lineas.push(`${k}: ${v}`));
  lineas.push("");
  if (mapa) lineas.push(`Cómo llegar: ${mapa}`);
  lineas.push(`Ver o cambiar tu turno: ${SITIO}`, "", politica, "¡Te esperamos!");

  const celdas = filas.map(([k, v]) =>
    `<tr><td style="padding:8px 0;color:#5c6b7a;border-bottom:1px solid #e6ebf0">${esc(k)}</td>` +
    `<td style="padding:8px 0;text-align:right;font-weight:600;border-bottom:1px solid #e6ebf0">${esc(v)}</td></tr>`).join("");
  const botones = (mapa ? `<a href="${esc(mapa)}" style="background:#29b6f6;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;display:inline-block;margin:0 8px 8px 0">Cómo llegar</a>` : "") +
    `<a href="${esc(SITIO)}" style="background:#eef2f6;color:#16202b;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;display:inline-block;margin:0 0 8px 0">Ver mi turno</a>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#16202b">` +
    `<h2 style="margin:0 0 4px">Mañana tenés turno</h2>` +
    `<div style="color:#5c6b7a;margin-bottom:16px">Hola ${esc(nombre)}, te lo recordamos desde ${esc(negocio)}.</div>` +
    `<table style="width:100%;border-collapse:collapse">${celdas}</table><p style="margin:20px 0 6px">${botones}</p>` +
    `<p style="color:#5c6b7a;font-size:13px">${esc(politica)}</p></div>`;

  return { subject: `Recordatorio: mañana tenés turno en ${negocio}`, text: lineas.join("\n"), html };
}

// marca la reserva (con transacción) para que el mismo aviso no salga dos veces; devuelve la reserva o null si ya estaba avisada
async function reservar(ref) {
  return db.runTransaction(async tx => {
    const s = await tx.get(ref);
    if (!s.exists) return null;
    const b = s.data();
    if (b.reminded || b.reminderSentAt || b.status !== "confirmed") return null;
    tx.update(ref, { reminderSentAt: Date.now() });
    return b;
  });
}

exports.enviarRecordatorios = onSchedule({ schedule: "0 10 * * *", timeZone: TZ, secrets: [SMTP_PASS], region: "us-central1" }, async () => {
  const cfg = await leerConfig();
  if (cfg.autoReminders === false) { console.log("Recordatorios automáticos apagados desde el panel."); return; }
  const manana = fechaAR(1);
  const snap = await db.collection("bookings").where("date", "==", manana).where("status", "==", "confirmed").get();
  if (snap.empty) return;
  const transporte = crearTransporte();
  const duenio = (Array.isArray(cfg.team) ? cfg.team.find(m => m.role === "owner") : null) || { id: "dueno" };
  let enviados = 0;
  for (const doc of snap.docs) {
    const previa = doc.data();
    if (!previa.email || previa.reminded || previa.reminderSentAt) continue;
    try {
      const b = await reservar(doc.ref);
      if (!b) continue;
      try {
        const m = armarMail(b, cfg);
        await transporte.sendMail({
          from: `"${(cfg.businessName || "BarberPro").replace(/"/g, "")}" <${SMTP_USER.value()}>`,
          to: b.email, subject: m.subject, text: m.text, html: m.html
        });
      } catch (e) { await doc.ref.update({ reminderSentAt: null }); throw e; }     // que se pueda reintentar
      await doc.ref.update({ reminded: true });
      await db.collection("movements").add({
        bid: b.id, barbers: [b.barberId || duenio.id], clientName: `${b.name} ${b.lastname}`.trim().slice(0, 120), date: b.date, time: b.time,
        type: "recordatorio", text: "Recordatorio enviado por mail (automático)", at: Date.now(), byRole: "system", byName: "Automático"
      });
      enviados++;
    } catch (e) { console.error("recordatorio", doc.id, e); }
  }
  console.log(`Recordatorios enviados para ${manana}: ${enviados}`);
});
