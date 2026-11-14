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
  logo:            "",
  heroImage:       "",
  mapboxToken:     "",
  mapCenter:       [-60.6393, -32.9468],
  whatsappDisplay: "",
  payAlias:        "barberia.demo",
  payHolder:       "Barbería Demo",
  payMpLink:       "https://mpago.la/25U3fxd",   // link de cobro de ejemplo: en la versión real va el de cada barbería
  clientPage:      "app.html",     // la app del cliente de la demo (el link para clientes apunta acá)
  price:           18000,               // precio del corte de la demo (el abono del sistema equivale a 2 cortes)
  services: [                           // otros servicios con su precio (el cliente elige uno al reservar)
    {name: "Barba", price: 15000},
    {name: "Corte + diseño", price: 20000},
    {name: "Corte + barba", price: 22000},
    {name: "Corte + barba + diseño", price: 22000}
  ],
  presentacion:    true,                // al abrir el panel: bienvenida animada y recorrido por las pestañas
  navInferior:     true,                // en el celular, la navegación del panel va abajo (pulgar)
  precioOferta:    true,                // el recorrido incluye la tarjeta "Cuánto cuesta" (abono = 2 cortes)
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
