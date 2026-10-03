BarberPro Turnos — sistema de reservas para barberías (JV Systems). Genérico: cada barbería carga su nombre, dirección, WhatsApp y medios de cobro desde el panel de administración.

- `index.html` — app del cliente: registrarse (nombre, apellido, apodo opcional, teléfono), elegir fecha y horario, y pagar (en el local / transferencia / Mercado Pago).
- `admin.html` — panel del dueño (PIN inicial 1234): agenda día / Gantt semanal / mes, horarios, cierres, datos del negocio y cobros, precio y saldos por cancelación.
- `core.js`, `app.css` — lógica y estilos compartidos.

Prototipo estático (localStorage), sin backend: las dos páginas comparten datos solo dentro del mismo navegador. Para que el cliente y el dueño estén en celulares distintos hace falta backend (fase 2).
