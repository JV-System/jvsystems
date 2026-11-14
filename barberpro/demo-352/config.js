/* DEMO de BarberPro con la marca de Barbería 352 (logo, colores y datos tomados de su perfil público de Instagram).
   Modo local: no usa Firebase; lo que carga cada visitante queda solo en su navegador. Es un ejemplo de cómo se vería su app de turnos. */
window.BARBERPRO_CONFIG = {
  storageNs:       "_352",              // prefijo de lo que se guarda en el navegador (no se mezcla con otras demos)
  businessName:    "Barbería 352",
  tagline:         "Salón masculino · Adultos y niños",
  address:         "Sarmiento 346, General Lagos",
  mapsLink:        "",
  ownerEmail:      "",
  logo:            "logo.png",
  team: [
    {id: "barbero1", name: "Barbero 1", role: "owner"},
    {id: "barbero2", name: "Barbero 2", role: "employee"}
  ],
  heroImage:       "",
  mapboxToken:     "",
  whatsappDisplay: "",                  // sin número: la demo no manda mensajes a nadie
  payAlias:        "barberia.352.demo",
  payHolder:       "Barbería 352 (ejemplo)",
  payMpLink:       "",
  cobrarEnApp:     true,
  clientPage:      "app.html",
  demoData:        true,
  hours: {
    mon: [["17:00", "20:30"]],
    tue: [["17:00", "20:30"]],
    wed: [["17:00", "20:30"]],
    thu: [["17:00", "20:30"]],
    fri: [["17:00", "20:30"]],
    sat: [["10:00", "20:00"]],
    sun: []
  }
};
