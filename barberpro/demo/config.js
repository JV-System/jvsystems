/* Configuración de la DEMO de BarberPro. Modo local: no usa Firebase, los datos quedan solo en el navegador de quien la prueba
   (cada persona tiene su propia copia, no ve ni modifica nada de nadie más). Los turnos de ejemplo se cargan solos y se renuevan cada día. */
window.BARBERPRO_CONFIG = {
  businessName:    "Barbería Demo",
  tagline:         "Probá BarberPro como si fuera tu barbería",
  address:         "Av. Pellegrini 1200, Rosario, Santa Fe",
  mapsLink:        "",
  ownerEmail:      "",
  team: [
    {id: "mateo", name: "Mateo", role: "owner"},
    {id: "lucas", name: "Lucas", role: "employee"},
    {id: "nico",  name: "Nico",  role: "employee"}
  ],
  heroImage:       "../portada.jpg",
  mapboxToken:     "",
  mapCenter:       [-60.6393, -32.9468],
  whatsappDisplay: "",
  payAlias:        "barberia.demo",
  payHolder:       "Barbería Demo",
  payMpLink:       "",
  demoData:        true,
  hours: {
    mon: [["09:30", "19:30"]],
    tue: [["09:30", "19:30"]],
    wed: [["09:30", "19:30"]],
    thu: [["09:30", "19:30"]],
    fri: [["09:30", "19:30"]],
    sat: [["10:00", "14:00"]],
    sun: []
  }
};
