/* DEMO de Turnos para Kinesiología y Fisiatría: el mismo sistema de reservas, con el vocabulario y los servicios de un consultorio.
   Modo local: no usa Firebase; lo que carga cada visitante queda solo en su navegador. Los datos (centro, equipo, precios) son de ejemplo. */
window.BARBERPRO_CONFIG = {
  storageNs:       "_kine",             // prefijo de lo que se guarda en el navegador (no se mezcla con otras demos)
  businessName:    "Julián Ledesma Kinesiología",
  tagline:         "Kinesiología y rehabilitación",
  address:         "Bv. Oroño 1450, Rosario, Santa Fe",
  mapsLink:        "",
  ownerEmail:      "",
  logo:            "logo.png",
  // palabras del rubro (lo que no se cambia queda como en una barbería). fem:"1" = "sesión" es femenino (la sesión, esta sesión).
  vocab: {
    client: "paciente", clients: "pacientes",
    staff: "profesional", staffs: "profesionales",
    pro: "profesional", pros: "profesionales", Pro: "Profesional",
    unit: "sesión", units: "sesiones", Unit: "Sesión", fem: "1",
    baseName: "Sesión de kinesiología",
    masVienen: "Los que más vienen", volver: "atenderte",
    owner: "Kinesiólogo", biz: "consultorio", bizDe: "del consultorio", bizDefault: "Tu Consultorio",
    quienQ: "¿Con quién querés atenderte?", quien: "con quién querés atenderte", quienInf: "con quién atenderse",
    svcEj: "rehabilitación, RPG, drenaje", svcEj2: "rehabilitación, RPG o drenaje", svcPh: "Ej: Drenaje linfático", bizThe: "el consultorio",
    phBiz: "Ej: Julián Ledesma Kinesiología", phTag: "Ej: Kinesiología y rehabilitación", phAlias: "Ej: julian.kinesio"
  },
  team: [
    {id: "julian", name: "Julián Ledesma", role: "owner", title: "Kinesiólogo"}      // atiende una sola persona: no se muestra selector de profesional al reservar
  ],
  heroImage:       "",
  mapboxToken:     "",
  mapCenter:       [-60.6393, -32.9468],
  whatsappDisplay: "",                  // sin número: la demo no manda mensajes a nadie
  payAlias:        "julian.kinesio.demo",
  payHolder:       "Julián Ledesma (ejemplo)",
  payMpLink:       "",
  cobrarEnApp:     true,
  clientPage:      "app.html",
  price:           25000,               // valor de la sesión de kinesiología (el abono del sistema equivale a 2 sesiones)
  services: [                           // otros servicios con su precio (el paciente elige uno al reservar)
    {name: "Evaluación inicial", price: 35000},
    {name: "Rehabilitación post-quirúrgica", price: 30000},
    {name: "RPG (reeducación postural)", price: 28000},
    {name: "Drenaje linfático", price: 30000}
  ],
  presentacion:    true,                // al abrir el panel: bienvenida animada y recorrido por las pestañas
  navInferior:     true,                // en el celular, la navegación del panel va abajo (pulgar)
  precioOferta:    true,                // el recorrido incluye la tarjeta "Cuánto cuesta" (abono = 2 sesiones)
  demoData:        true,
  hours: {
    mon: [["08:00", "13:00"], ["15:00", "20:00"]],
    tue: [["08:00", "13:00"], ["15:00", "20:00"]],
    wed: [["08:00", "13:00"], ["15:00", "20:00"]],
    thu: [["08:00", "13:00"], ["15:00", "20:00"]],
    fri: [["08:00", "13:00"], ["15:00", "19:00"]],
    sat: [["09:00", "13:00"]],
    sun: []
  }
};
