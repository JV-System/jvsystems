BarberPro Turnos — sistema de reservas para barberías (JV Systems). Genérico: cada barbería carga su nombre, dirección, WhatsApp y medios de cobro desde el panel de administración.

- `index.html` — app del cliente: registrarse (nombre, apellido, apodo opcional, teléfono, mail), elegir fecha y horario, y pagar (en el local / transferencia / Mercado Pago). Al reservar puede guardar el turno en su calendario (aviso 1 día antes y 2 horas antes).
- `admin.html` — panel del dueño (PIN inicial 1234): agenda día / Gantt semanal / mes, lista de recordatorios de mañana (un toque abre WhatsApp o mail con el mensaje listo), horarios, cierres, datos del negocio y cobros, precio y saldos por cancelación.
- `config.js` — datos de ESTA barbería (nombre, dirección, horarios estándar, WhatsApp, alias, link de Mercado Pago). La dirección arma el mapa y el "Cómo llegar" que ve el cliente al reservar. Se ven en todos los celulares. Cada cliente al que se le vende tiene su copia con su config.js.
- `core.js`, `app.css` — lógica y estilos compartidos.

Prototipo estático (localStorage), sin backend: las dos páginas comparten datos solo dentro del mismo navegador. Para que el cliente y el dueño estén en celulares distintos hace falta backend (fase 2).
