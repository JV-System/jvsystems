/* Datos de ESTA barbería. Cada cliente al que le vendas BarberPro tiene su propia copia de la carpeta
   con su propio config.js. Lo que completes acá se ve en todos los celulares; lo que el dueño guarde
   desde el panel (Negocio / Horarios / Cobros) en su navegador tiene prioridad en ese navegador.
   Dejá un texto vacío ("") para usar el valor genérico. */
window.BARBERPRO_CONFIG = {
  businessName:    "Parisi Barbers Rosario",
  tagline:         "Barbería en Rosario",
  address:         "Mitre 576, S2000 Rosario, Santa Fe",
  mapsLink:        "",   // opcional: link exacto de Google Maps; si está vacío se arma con nombre + dirección

  // Datos en la nube (Firebase de ESTA barbería). Con esto las reservas se guardan en Firestore y el panel del dueño entra con mail
  // y contraseña. Si se borra este bloque, la app vuelve al modo local de demo (datos en el navegador, PIN).
  // La apiKey de Firebase es pública por diseño; lo que protege los datos son las reglas de backend/firestore.rules.
  firebase: {
      "apiKey": "AIzaSyCVEKObhJYYCNv-fq7n3maWerNT1U7Gnt8",
      "authDomain": "barberpro-a6405.firebaseapp.com",
      "projectId": "barberpro-a6405",
      "storageBucket": "barberpro-a6405.firebasestorage.app",
      "messagingSenderId": "585767235541",
      "appId": "1:585767235541:web:64763b1ab811a771fbd75c"
  },

  // Mail del usuario dueño en Firebase (Authentication). Con esto, en el panel alcanza con escribir un usuario corto (ej. "admin") en lugar
  // del mail. Vacío = el panel pide el mail completo.
  ownerEmail:      "jv2066037@gmail.com",

  // Equipo: el dueño (administrador) y los empleados. El cliente elige con quién cortarse al reservar. whatsapp = número con código de país
  // (ej. "5493415551234"); si está, el aviso del turno le llega a ese barbero. Los empleados entran al panel con su propio usuario
  // (se crean desde el panel del dueño, en Equipo) y ven solo sus turnos.
  team: [
    {id: "martin",  name: "Martín",  role: "owner"},
    {id: "lucas",   name: "Lucas",   role: "employee"},
    {id: "nicolas", name: "Nicolás", role: "employee"}
  ],

  // Foto propia del local para el fondo del encabezado (ej. "hero.jpg", en esta misma carpeta). Si está, se usa en lugar del
  // mapa: no depende de ningún servicio externo, es gratis para siempre y no necesita token. Horizontal, ~1200 px de ancho, JPG.
  heroImage:       "",

  // Fondo satelital del encabezado (Mapbox), se usa solo si heroImage está vacío. El token es PÚBLICO (empieza con pk.) y está pensado para ir en la página;
  // conviene restringirlo a este dominio en mapbox.com > Access tokens > URL restrictions.
  mapboxToken:     "",   // token público de Mapbox (pk...). Vacío = sin mapa de fondo. GitHub bloquea subirlo al repo (lo toma por secreto).
  // Coordenadas del local [longitud, latitud]. Se sacan de Google Maps (clic derecho sobre el pin > copiar coordenadas;
  // ojo, Google las muestra como "latitud, longitud") o del código plus del local. Mapbox no encuentra bien muchas calles
  // argentinas por dirección, por eso se indican a mano. Parisi Barbers = código plus 3946+H9 Rosario.
  mapCenter:       [-60.639063, -32.943562],
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
