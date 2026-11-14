/* DEMO de BarberPro con el diseño original de MONTAL (Reyna Montiel): negro con brillo violeta, botones naranja a rojo y franja de poste de barbero.
   Modo local: no usa Firebase; lo que carga cada visitante queda solo en su navegador. Los horarios, el precio y el alias son de ejemplo. */
window.BARBERPRO_CONFIG = {
  storageNs:       "_montal",           // prefijo de lo que se guarda en el navegador (no se mezcla con otras demos)
  businessName:    "MONTAL",
  tagline:         "Barbería · Reyna Montiel",
  address:         "Pasaje Misiones 280",
  mapsLink:        "",
  ownerEmail:      "",
  logo:            "logo.png",
  team: [
    {id: "reyna", name: "Reyna", role: "owner"}          // un solo barbero: la dueña (no se muestra selector de barbero al reservar)
  ],
  heroImage:       "",
  mapboxToken:     "",
  whatsappDisplay: "",                  // sin número: la demo no manda mensajes a nadie
  price:           16000,               // precio del corte de la demo
  payAlias:        "montal.demo",
  payHolder:       "MONTAL (ejemplo)",
  payMpLink:       "",
  cobrarEnApp:     true,
  presentacion:    true,                // al abrir el panel: bienvenida animada y recorrido por las pestañas
  navInferior:     true,                // en el celular, la navegación del panel va abajo (pulgar)
  clientPage:      "app.html",
  demoData:        true,
  hours: {
    mon: [["09:00", "13:00"], ["16:00", "20:00"]],
    tue: [["09:00", "13:00"], ["16:00", "20:00"]],
    wed: [["09:00", "13:00"], ["16:00", "20:00"]],
    thu: [["09:00", "13:00"], ["16:00", "20:00"]],
    fri: [["09:00", "13:00"], ["16:00", "20:00"]],
    sat: [["09:00", "13:00"]],
    sun: []
  }
};
