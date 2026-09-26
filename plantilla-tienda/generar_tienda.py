#!/usr/bin/env python3
"""
Generador de tiendas-catálogo a partir del modelo de Harmonia.

Toma harmonia/index.html y produce <carpeta>/index.html cambiando SOLO la marca:
nombre, textos de portada, paleta de colores, logo/íconos y el path de datos.
El resto (catálogo, carrito, admin, stock, variantes, envíos, usuarios, QR
estático, WhatsApp) queda idéntico.

Qué NO se copia a propósito:
  - Mercado Pago (el backend de Harmonia cobra en la cuenta de ella): queda
    apagado e inaccesible; también se ocultan las pestañas Pedidos/Análisis,
    que solo tienen datos de pagos por Mercado Pago.
  - Usuarios de Harmonia (Angie/Eve/Mary): el clon arranca con un solo "admin".
  - Datos: cada cliente usa su propio path en Firebase (RUTA).

Uso (desde la raíz de jvsystems):
    1. Copiá el logo/íconos a la carpeta del cliente (ver LOGO_* abajo).
    2. Editá el diccionario CLIENTE.
    3. python plantilla-tienda/generar_tienda.py

Después: habilitar el path en las reglas de Firebase (sabores-misiones) desde la
consola, igual que se hizo con "harmonia".
"""
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "harmonia" / "index.html"

# ---------------------------------------------------------------- cliente ---
CLIENTE = {
    "carpeta": "rose",                 # jvsystems.com.ar/<carpeta>/  y  path de Firebase
    "nombre": "Rose",
    "frase": "Tu esencia",             # eyebrow de la portada / og
    "titulo_portada": "Bienvenida a Rose",
    "rasgos": ["🌸 <b>Catálogo&nbsp;online</b>", "💬 <b>Pedís por WhatsApp</b>", "🚚 <b>Coordinamos envío</b>"],
    "categorias": ["Productos", "Otros"],
    "placeholder_nombre": "Nombre del producto",
    "placeholder_desc": "Detalles del producto…",
    "clave_admin_inicial": "rose2026",  # el admin la cambia desde Ajustes
    # Siempre el MISMO logo completo en todos lados, en tres formatos del mismo dibujo:
    "logo": "rose-logo.png",           # logo completo, PNG transparente (header y pantalla de carga)
    "icono": "rose-icon.png",          # el mismo logo centrado en un cuadrado transparente (favicon)
    "og": "rose-og.png",               # el mismo logo cuadrado sobre blanco (compartir link / iOS)
    # Logo animado (opcional): 2 PNG transparentes del MISMO tamaño y encuadre. "marca" queda
    # fija; "animado" (ej. el colibrí) flota y aletea. Sin esta clave se usa el logo estático.
    "logo_capas": {"marca": "rose-logo-marca.png", "animado": "rose-logo-colibri.png"},
    "animado_origen": "62% 44%",       # punto sobre el que pivota el movimiento (cuerpo del colibrí)
    "logo_header_alto": 62,            # alto del logo en el encabezado (px, incluye el aire transparente)
    "carga_ancho": "min(330px,82vw)",  # ancho del logo en la pantalla de carga
    # Paleta: color viejo (Harmonia) -> color nuevo
    "colores": {
        "#F7F2E7": "#FBF3F5",  # crema (fondo)
        "#EFE7D6": "#F6E4EA",  # crema-osc
        "#4B5A3E": "#C94B7B",  # principal (botones)
        "#37432E": "#A23561",  # principal oscuro
        "#8A9A78": "#E48AAB",  # principal claro (íconos, bordes)
        "#E7EBDF": "#FBE6EE",  # principal pálido
        "#B9AA97": "#CDB6BF",  # taupe
        "#E7DDCB": "#EFDDE3",  # taupe claro
        "#332E22": "#2A2126",  # tinta (texto)
        "#8A8067": "#85717A",  # tinta suave
        "#E6DCC8": "#EFD9E1",  # línea
    },
    "rgb_crema": ("247,242,231", "251,243,245"),   # rgba(...) del header/velos
    "rgb_tinta": ("51,46,34", "42,33,38"),         # rgba(...) de sombras/overlays
    # Fondo animado: reemplaza la foto del dormitorio de Harmonia por manchas suaves
    "fondo_css": (
        "radial-gradient(circle at 18% 22%, #F9C9D9 0, transparent 46%),"
        "radial-gradient(circle at 82% 68%, #F5B5CB 0, transparent 52%),"
        "radial-gradient(circle at 62% 8%, #FBE0EA 0, transparent 42%),#FBF3F5"
    ),
}
# ---------------------------------------------------------------------------


def sub(texto, patron, repl, minimo=1, regex=False, flags=0):
    """Reemplazo con control: falla si no encuentra lo esperado."""
    if regex:
        nuevo, n = re.subn(patron, repl, texto, flags=flags)
    else:
        n = texto.count(patron)
        nuevo = texto.replace(patron, repl)
    if n < minimo:
        sys.exit(f"ERROR: no encontré {patron!r} (esperaba >= {minimo}, hallé {n}). "
                 "¿Cambió la estructura de harmonia/index.html?")
    return nuevo


def generar(c):
    s = ORIGEN.read_text(encoding="utf-8")
    n, slug = c["nombre"], c["carpeta"]
    url = f"https://jvsystems.com.ar/{slug}/"

    # --- meta / título ---------------------------------------------------
    s = sub(s, r'<meta name="description" content="[^"]*">',
            f'<meta name="description" content="{n} · {c["frase"]}. Mirá el catálogo y hacé tu pedido por WhatsApp.">',
            regex=True)
    s = sub(s, '<meta property="og:description" content="Catálogo de ropa blanca premium · Pedidos por WhatsApp">',
            f'<meta property="og:description" content="Catálogo online · Pedidos por WhatsApp">')
    s = sub(s, "Harmonia · Ropa blanca delicada", f'{n} · {c["frase"]}', minimo=3)
    s = sub(s, "https://jvsystems.com.ar/harmonia/harmonia-icon.png", url + c["og"], minimo=2)
    s = sub(s, "https://jvsystems.com.ar/harmonia/", url)

    # --- imágenes ---------------------------------------------------------
    capas = c.get("logo_capas")  # {"marca": png, "animado": png} -> el logo con un elemento animado
    # pantalla de carga: logo completo
    if capas:
        s = sub(s, '<img src="harmonia-icon.png" alt="" class="carga-logo">',
                f'<span class="logo-anim"><img src="{capas["marca"]}" alt="{n}" class="carga-logo">'
                f'<img src="{capas["animado"]}" alt="" class="logo-animado"></span>')
    else:
        s = sub(s, '<img src="harmonia-icon.png" alt="" class="carga-logo">',
                f'<img src="{c["logo"]}" alt="{n}" class="carga-logo">')
    # header: el MISMO logo completo (ya trae el nombre, por eso se saca el texto)
    if capas:
        alto = c["logo_header_alto"]
        s = sub(s, '<img src="harmonia-icon.png" alt="Harmonia" width="42" height="41" style="width:42px;height:auto">',
                f'<span class="logo-anim" style="height:{alto}px;margin:-4px -6px">'
                f'<img src="{capas["marca"]}" alt="{n}" style="height:100%;width:auto">'
                f'<img src="{capas["animado"]}" alt="" class="logo-animado"></span>')
    else:
        s = sub(s, '<img src="harmonia-icon.png" alt="Harmonia" width="42" height="41" style="width:42px;height:auto">',
                f'<img src="{c["logo"]}" alt="{n}" style="height:{c["logo_header_alto"]}px;width:auto">')
    s = sub(s, '<span class="marca-nombre">Harmonia</span>', "")
    s = sub(s, '<link rel="icon" href="harmonia-icon.png" type="image/png">',
            f'<link rel="icon" href="{c["icono"]}" type="image/png">')
    # iOS rellena de negro lo transparente: para el ícono de pantalla de inicio va el fondo blanco
    s = sub(s, '<link rel="apple-touch-icon" href="harmonia-icon.png">',
            f'<link rel="apple-touch-icon" href="{c["og"]}">')
    s = sub(s, ".carga-logo-wrap{position:relative;width:104px;overflow:hidden;border-radius:14px;",
            f'.carga-logo-wrap{{position:relative;width:{c["carga_ancho"]};overflow:hidden;border-radius:0;')
    # el brillo de la pantalla de carga se pinta solo sobre el logo (máscara), no sobre todo
    # el rectángulo: si no, se ve un cuadrado claro detrás del logo transparente
    forma = capas["marca"] if capas else c["logo"]   # el brillo solo sobre la parte fija del logo
    s = sub(s, ".carga-brillo{position:absolute;inset:0;",
            f".carga-brillo{{position:absolute;inset:0;-webkit-mask:url('{forma}') center/100% 100% no-repeat;"
            f"mask:url('{forma}') center/100% 100% no-repeat;")
    # el logo ya trae el nombre: se saca el texto y la frase de Harmonia de la pantalla de carga
    s = sub(s, '<span class="carga-nombre">Harmonia</span>', "")
    s = sub(s, r'<p class="carga-frase">.*?</p>', "", regex=True, flags=re.S)

    # --- textos de marca --------------------------------------------------
    s = sub(s, "Catálogo de Ropa Blanca · Harmonia", f"Catálogo · {n}")
    s = sub(s, "Catálogo — Harmonia", f"Catálogo — {n}")
    s = sub(s, "Hola Harmonia", f"Hola {n}", minimo=4)
    s = sub(s, '<span class="hero-eyebrow">Ropa blanca delicada</span>', f'<span class="hero-eyebrow">{c["frase"]}</span>')
    s = sub(s, "<h1>Textiles suaves para tu hogar</h1>", f'<h1>{c["titulo_portada"]}</h1>')
    rasgos = "\n      ".join(f'<span class="rasgo">{r}</span>' for r in c["rasgos"])
    s = sub(s, r'<div class="rasgos">.*?</div>', f'<div class="rasgos">\n      {rasgos}\n    </div>',
            regex=True, flags=re.S)
    s = sub(s, "Sábana lisa king 400 hilos", c["placeholder_nombre"])
    s = sub(s, "Medidas, material, colores disponibles…", c["placeholder_desc"], minimo=1)
    s = sub(s, "Harmonia · catálogo + pedidos por WhatsApp", f"{n} · catálogo + pedidos por WhatsApp")
    s = sub(s, "harmonia/?admin", f"{slug}/?admin")
    cats = ", ".join(f'"{x}"' for x in c["categorias"])
    s = sub(s, r'const CATEGORIAS_SUGERIDAS = \[[^\]]*\];', f"const CATEGORIAS_SUGERIDAS = [{cats}];", regex=True)

    # --- datos / almacenamiento ------------------------------------------
    s = sub(s, 'const RUTA = "harmonia";', f'const RUTA = "{slug}";')
    s = sub(s, "harmonia_carrito", f"{slug}_carrito", minimo=2)
    s = sub(s, "harmonia_usuario", f"{slug}_usuario", minimo=2)
    s = sub(s, r'const USUARIOS_INICIALES = \{[^}]*\};',
            f'const USUARIOS_INICIALES = {{ admin: "{c["clave_admin_inicial"]}" }};', regex=True)

    # --- Mercado Pago: apagado del todo ----------------------------------
    s = sub(s, r'const MP_BACKEND = "[^"]*";',
            'const MP_BACKEND = ""; // este cliente NO usa Mercado Pago (el backend es de Harmonia)', regex=True)
    s = sub(s, '$("#btnPagarMP").hidden = !config.mpHabilitado;', '$("#btnPagarMP").hidden = true;')
    s = sub(s, '$("#btnPagarMP").onclick = async () => {',
            '$("#btnPagarMP").onclick = async () => {\n  if (!MP_BACKEND) return;')
    s = sub(s, '<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>\n', "")
    # el interruptor de Ajustes y las pestañas que dependen de pagos MP no se muestran
    s = sub(s, '<div class="campo campo-variantes">\n          <label class="check-oferta" style="text-transform:none;font-weight:600;letter-spacing:0">\n            <input type="checkbox" id="mpHabilitadoConfig">',
            '<div class="campo campo-variantes" hidden style="display:none">\n          <label class="check-oferta" style="text-transform:none;font-weight:600;letter-spacing:0">\n            <input type="checkbox" id="mpHabilitadoConfig">')
    # pie de página siempre abajo, aunque el catálogo tenga pocos productos (la página
    # se estira a todo el alto de la pantalla y el contenido ocupa el espacio que sobra)
    if capas:
        # el nombre queda fijo y solo la capa animada (PNG transparente, mismo recuadro) se mueve
        o = c.get("animado_origen", "62% 44%")
        s = sub(s, ".modal-cab{",
                '/* logo animado: capa fija + capa que se mueve, ambas PNG transparentes apiladas */\n'
                '.logo-anim{position:relative;display:inline-block;line-height:0}\n'
                '.logo-anim>img{display:block}\n'
                '.logo-animado{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;'
                f'transform-origin:{o};'
                'animation:logoEntrada 1.4s cubic-bezier(.2,.8,.3,1) both,'
                'logoFlota 5s ease-in-out 1.4s infinite,logoAletea .55s ease-in-out infinite}\n'
                '@keyframes logoEntrada{from{translate:18% -10%;opacity:0}to{translate:0 0;opacity:1}}\n'
                '@keyframes logoFlota{0%,100%{transform:translate(0,0) rotate(0)}'
                '22%{transform:translate(1.4%,-3%) rotate(1.6deg)}'
                '48%{transform:translate(2.2%,-.8%) rotate(-1.2deg)}'
                '74%{transform:translate(.6%,-3.4%) rotate(1deg)}}\n'
                '@keyframes logoAletea{0%,100%{scale:1 1}50%{scale:1.012 .982}}\n'
                '@media (prefers-reduced-motion:reduce){.logo-animado{animation:none}}\n'
                ".modal-cab{")
    s = sub(s, ".modal-cab{",
            '/* pie siempre abajo */\n'
            'body{display:flex;flex-direction:column;min-height:100vh;min-height:100dvh}\n'
            '.wrap.catalogo-layout{flex:1 0 auto;width:100%;align-content:start}\n'
            ".modal-cab{")
    s = sub(s, ".modal-cab{",
            '/* sin Mercado Pago: se ocultan las pestañas que solo tienen datos de esos pagos */\n'
            '.tab-admin[data-tab="pedidos"],.tab-admin[data-tab="analisis"],#tabPedidos,#tabAnalisis{display:none!important}\n'
            ".modal-cab{")

    # --- colores ----------------------------------------------------------
    for viejo, nuevo in c["colores"].items():
        s = re.sub(re.escape(viejo), nuevo, s, flags=re.I)
    s = s.replace(f'rgba({c["rgb_crema"][0]}', f'rgba({c["rgb_crema"][1]}')
    s = s.replace(f'rgba({c["rgb_tinta"][0]}', f'rgba({c["rgb_tinta"][1]}')
    s = sub(s, "url('fondo-bg.jpg') center 55% / cover no-repeat", c["fondo_css"], minimo=3)

    destino = RAIZ / slug
    destino.mkdir(exist_ok=True)
    (destino / "index.html").write_text(s, encoding="utf-8", newline="\n")
    return destino / "index.html"


if __name__ == "__main__":
    archivos = [CLIENTE["icono"], CLIENTE["logo"], CLIENTE["og"], *CLIENTE.get("logo_capas", {}).values()]
    faltan = [a for a in archivos if not (RAIZ / CLIENTE["carpeta"] / a).exists()]
    if faltan:
        sys.exit(f"Faltan archivos en {CLIENTE['carpeta']}/: {', '.join(faltan)}")
    print("OK ->", generar(CLIENTE))
