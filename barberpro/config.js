/* Datos de ESTA barbería. Cada cliente al que le vendas BarberPro tiene su propia copia de la carpeta
   con su propio config.js. Lo que completes acá se ve en todos los celulares; lo que el dueño guarde
   desde el panel (Negocio / Horarios / Cobros) en su navegador tiene prioridad en ese navegador.
   Dejá un texto vacío ("") para usar el valor genérico. */
window.BARBERPRO_CONFIG = {
  businessName:    "Parisi Barbers Rosario",
  tagline:         "Barbería en Rosario",
  address:         "Mitre 576, S2000 Rosario, Santa Fe",
  mapsLink:        "",   // opcional: link exacto de Google Maps; si está vacío se arma con nombre + dirección
  whatsappDisplay: "",   // Ej: "5493413699728" (código de país, sin +)
  payAlias:        "",   // Alias o CBU para transferencias (sirve el alias de Mercado Pago)
  payHolder:        "",  // Titular de la cuenta
  payMpLink:       "",   // Link de pago de Mercado Pago (https://mpago.la/...) por el precio del corte

  demoData: false,       // true = la primera vez carga turnos y saldos de ejemplo (para hacer demos). false = arranca vacío.

  // Horarios estándar (el dueño los puede modificar desde el panel). Hasta 2 tramos por día; [] = cerrado.
  hours: {
    mon: [["09:30", "17:00"]],
    tue: [["09:30", "19:30"]],
    wed: [["09:30", "19:30"]],
    thu: [["09:30", "19:30"]],
    fri: [["09:30", "19:30"]],
    sat: [["10:00", "12:30"]],
    sun: []
  }
};
