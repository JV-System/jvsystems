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
    "rubro": "Belleza, cosmética y cuidado personal",  # va en la portada y al compartir el link
    "titulo_portada": "Belleza, cosmética y cuidado personal",
    "rasgos": ["💄 <b>Belleza&nbsp;y&nbsp;cuidado</b>", "💬 <b>Pedís por WhatsApp</b>", "🚚 <b>Coordinamos envío</b>"],
    "categorias": ["Maquillaje", "Cuidado de la piel", "Cuidado del cabello", "Perfumería", "Cuidado personal", "Otros"],
    "placeholder_nombre": "Ej: Crema hidratante 200 ml",
    "placeholder_desc": "Presentación, aroma, tamaño, modo de uso…",
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
    # Paleta CLARA (pastel): color viejo (Harmonia) -> color nuevo
    "colores": {
        "#F7F2E7": "#FFF7F9",  # crema (fondo)
        "#EFE7D6": "#FCE9EF",  # crema-osc
        "#4B5A3E": "#EFA3BA",  # principal (botones): rosa pastel
        "#37432E": "#B0426A",  # principal oscuro (textos de acento, precios)
        "#8A9A78": "#F3B7CA",  # principal claro (íconos, bordes)
        "#E7EBDF": "#FDECF2",  # principal pálido
        "#B9AA97": "#D9BFC9",  # taupe
        "#E7DDCB": "#F4E2E8",  # taupe claro
        "#332E22": "#3B2630",  # tinta (texto)
        "#8A8067": "#8C7480",  # tinta suave
        "#E6DCC8": "#F3DCE4",  # línea
    },
    "rgb_crema": ("247,242,231", "255,247,249"),   # rgba(...) del header/velos
    "rgb_tinta": ("51,46,34", "59,38,48"),         # rgba(...) de sombras/overlays
    "texto_sobre_principal": "#3B1F2B",  # texto de los botones principales (el pastel pide texto oscuro)
    "boton_hover": "#E58BA8",
    # Fondo animado: reemplaza la foto del dormitorio de Harmonia por manchas suaves
    "fondo_css": (
        "radial-gradient(circle at 18% 22%, #FADCE6 0, transparent 46%),"
        "radial-gradient(circle at 82% 68%, #F8CFDD 0, transparent 52%),"
        "radial-gradient(circle at 62% 8%, #FFEAF0 0, transparent 42%),#FFF7F9"
    ),
    # Modo de color: "claro" = siempre cremita (recomendado con logo de trazo negro) o "oscuro-propio".
    "modo_color": "claro",
    # Tema OSCURO propio (solo se usa con modo_color = "oscuro-propio"). Si el celular está en modo oscuro se ve este diseño en vez de
    # que el navegador "invierta" la página por su cuenta (queda ilegible). Sin esta clave la
    # página sigue siendo solo clara.
    "tema_oscuro": {
        "vars": ("--crema:#1F1519; --crema-osc:#2A1D23; --papel:#2A1E24;"
                 "--oliva:#EFA3BA; --oliva-osc:#F6BFD0; --oliva-cl:#C97C97; --oliva-pale:#3A2630;"
                 "--taupe:#8F7280; --taupe-cl:#4A3540; --tinta:#F8EBF0; --tinta-suave:#C9AEB9;"
                 "--linea:#4A3540; --wasap:#25D366; --wasap-osc:#1DA851; --rojo:#D9604F; --rojo-pale:#4A2C2C;"),
        "fondo": ("radial-gradient(circle at 18% 22%, #4A2A38 0, transparent 46%),"
                  "radial-gradient(circle at 82% 68%, #3B2230 0, transparent 52%),"
                  "radial-gradient(circle at 62% 8%, #55303F 0, transparent 42%),#1F1519"),
        "velo": "31,21,25",              # rgb del velo/encabezado en oscuro
        # el logo lleva trazo negro: la barra superior y la pantalla de carga se quedan en el color
        # claro de la marca (sin placas ni cuadrados) y el resto de la página pasa a oscuro
        "claro": "255,247,249",
        "carga_clara": "#FFF7F9",
        "theme_color": "#1F1519",
    },
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
            f'<meta name="description" content="{n} · {c["frase"]}. {c.get("rubro", "Catálogo online")}. Mirá el catálogo y hacé tu pedido por WhatsApp.">',
            regex=True)
    s = sub(s, '<meta property="og:description" content="Catálogo de ropa blanca premium · Pedidos por WhatsApp">',
            f'<meta property="og:description" content="{c.get("rubro", "Catálogo online")} · Pedidos por WhatsApp">')
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

    # --- carga más rápida y que no se cuelgue ------------------------------
    # Antes la pantalla de carga esperaba hasta 6 s si la base no respondía o rechazaba la
    # lectura (nunca llegaba el primer dato). Ahora: mínimo 2,5 s (a pedido), tope 4,5 s, y si la base
    # devuelve error se sigue de inmediato.
    s = sub(s, "intentarOcultarCarga(); }, 1150);", "intentarOcultarCarga(); }, 2500);")
    s = sub(s, "}, 6000); // por si falla la conexión", "}, 4500); // por si falla la conexión")
    s = sub(s, "      cargaDatosListos = true;\n      intentarOcultarCarga();\n    });\n\n    db.ref(`${RUTA}/config`)",
            "      cargaDatosListos = true;\n      intentarOcultarCarga();\n    }, err => {\n"
            "      console.error(\"No se pudieron leer los productos\", err);\n"
            "      cargaDatosListos = true;\n      intentarOcultarCarga();\n"
            "      mostrarToast(\"No se pudo cargar el catálogo. Probá de nuevo en un momento.\");\n"
            "    });\n\n    db.ref(`${RUTA}/config`)")
    s = sub(s, "let cargaMinCumplida = false, cargaDatosListos = false;",
            "let cargaMinCumplida = false, cargaDatosListos = false;\nlet usuariosError = false; // la base rechazó/falló la lectura de usuarios")
    s = sub(s, "      usuarios = snap.val() || {};\n      if (!Object.keys(usuarios).length){",
            "      usuariosError = false;\n      usuarios = snap.val() || {};\n      if (!Object.keys(usuarios).length){")
    s = sub(s, "      if ($(\"#modalAdmin\").classList.contains(\"abierto\")) renderListaUsuarios();\n    });\n\n    db.ref(`${RUTA}/historial`)",
            "      if ($(\"#modalAdmin\").classList.contains(\"abierto\")) renderListaUsuarios();\n"
            "    }, err => { console.error(\"No se pudieron leer los usuarios\", err); usuariosError = true; });\n\n"
            "    db.ref(`${RUTA}/historial`)")
    # login: decir qué pasa en vez de un genérico "clave incorrecta"
    s = sub(s, "  } else {\n    $(\"#errorLogin\").hidden = false;\n  }\n}\n$(\"#btnIngresarAdmin\").onclick = intentarLogin;",
            "  } else {\n"
            "    $(\"#errorLogin\").textContent = usuariosError\n"
            "      ? \"No se pudo conectar con la base de datos, por eso no se pueden validar los usuarios. Avisale a quien administra el sistema.\"\n"
            "      : !Object.keys(usuarios).length ? \"Todavía se están cargando los usuarios, probá de nuevo en un momento.\"\n"
            "      : \"Usuario o clave incorrectos.\";\n"
            "    $(\"#errorLogin\").hidden = false;\n  }\n}\n$(\"#btnIngresarAdmin\").onclick = intentarLogin;")

    # --- ojito para ver la contraseña -------------------------------------
    ojo = ('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
           'stroke-linecap="round" stroke-linejoin="round">')
    s = sub(s, '<div class="campo"><label>Clave</label><input type="password" id="claveAdmin" placeholder="Clave" autocomplete="current-password"></div>',
            '<div class="campo"><label>Clave</label><div class="campo-clave">'
            '<input type="password" id="claveAdmin" placeholder="Clave" autocomplete="current-password">'
            '<button type="button" class="ver-clave" id="verClave" aria-label="Mostrar contraseña" title="Mostrar contraseña"></button>'
            '</div></div>')
    s = sub(s, ".modal-cab{",
            '/* campo de clave con ojito */\n'
            '.campo input[type=password]{font:inherit;font-size:14px;padding:10px 44px 10px 12px;border-radius:10px;'
            'border:1px solid var(--linea);background:var(--crema);color:var(--tinta);width:100%;box-sizing:border-box}\n'
            '.campo-clave{position:relative}\n'
            '.ver-clave{position:absolute;right:4px;top:50%;transform:translateY(-50%);background:none;border:0;'
            'padding:8px;cursor:pointer;color:var(--tinta-suave);display:flex;align-items:center;border-radius:8px}\n'
            '.ver-clave:hover{color:var(--oliva-osc)}\n'
            ".modal-cab{")
    s = sub(s, '$("#claveAdmin").addEventListener("keydown", e => { if (e.key === "Enter") intentarLogin(); });',
            '$("#claveAdmin").addEventListener("keydown", e => { if (e.key === "Enter") intentarLogin(); });\n'
            f'const ICONO_OJO = \'{ojo}<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>\';\n'
            f'const ICONO_OJO_TACHADO = \'{ojo}<path d="M2 12s3.6-7 10-7c2 0 3.8.6 5.3 1.5M22 12s-3.6 7-10 7c-2 0-3.8-.6-5.3-1.5"/>'
            '<path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/></svg>\';\n'
            'function verClave(ver){\n'
            '  $("#claveAdmin").type = ver ? "text" : "password";\n'
            '  $("#verClave").innerHTML = ver ? ICONO_OJO_TACHADO : ICONO_OJO;\n'
            '  $("#verClave").setAttribute("aria-label", ver ? "Ocultar contraseña" : "Mostrar contraseña");\n'
            '  $("#verClave").title = ver ? "Ocultar contraseña" : "Mostrar contraseña";\n'
            '}\n'
            '$("#verClave").onclick = () => { verClave($("#claveAdmin").type === "password"); $("#claveAdmin").focus(); };\n'
            'verClave(false);')
    s = sub(s, '  $("#claveAdmin").value = "";', '  $("#claveAdmin").value = "";\n  verClave(false);')

    # --- tema oscuro propio (antes de tocar colores, opera sobre el texto original) ---
    # modo de color: "claro" (siempre cremita, aunque el celu esté en modo oscuro) o "oscuro-propio"
    td = c.get("tema_oscuro") if c.get("modo_color") == "oscuro-propio" else None
    if c.get("modo_color", "claro") == "claro":
        # Se le declara al navegador que la página "maneja" el modo oscuro (así no la invierte por su
        # cuenta, cosa que dejaba ilegible el logo negro) pero con la MISMA paleta clara y controles
        # de formulario claros. Con "only light" a secas, Samsung Internet la oscurecía igual.
        s = sub(s, '<meta name="color-scheme" content="only light">', '<meta name="color-scheme" content="light dark">')
        s = sub(s, "  color-scheme:only light;\n  --crema", "  color-scheme:light dark;\n  --crema")
        s = sub(s, "    color-scheme:only light;", "    color-scheme:light;")
    if td:
        s = sub(s, '<meta name="color-scheme" content="only light">', '<meta name="color-scheme" content="light dark">')
        # Harmonia repite la paleta clara bajo "dark" para que el navegador no oscurezca solo;
        # acá en cambio se declara un tema oscuro de verdad (y así tampoco lo invierte por su cuenta)
        s = sub(s, r'@media \(prefers-color-scheme:dark\)\{\s*:root\{.*?\}\s*\}',
                lambda m: ("@media (prefers-color-scheme:dark){\n  :root{\n    color-scheme:dark;\n    "
                           + td["vars"] + "\n  }\n}"),
                regex=True, flags=re.S)
        s = sub(s, "color-scheme:only light;", "color-scheme:light dark;")
        s = sub(s, '<meta name="theme-color" content="#4B5A3E" media="(prefers-color-scheme: dark)">',
                f'<meta name="theme-color" content="{td["theme_color"]}" media="(prefers-color-scheme: dark)">')

    # --- colores ----------------------------------------------------------
    for viejo, nuevo in c["colores"].items():
        s = re.sub(re.escape(viejo), nuevo, s, flags=re.I)
    s = s.replace(f'rgba({c["rgb_crema"][0]}', f'rgba({c["rgb_crema"][1]}')
    s = s.replace(f'rgba({c["rgb_tinta"][0]}', f'rgba({c["rgb_tinta"][1]}')
    s = sub(s, "url('fondo-bg.jpg') center 55% / cover no-repeat", c["fondo_css"], minimo=3)

    # --- botones principales legibles + reglas del tema oscuro (al final de la hoja de estilos) ---
    txt, hov = c["texto_sobre_principal"], c["boton_hover"]
    extra = ("/* botones principales: color de la marca con texto que se lea */\n"
             f".btn-carrito,.btn-agregar,.btn-full,.tipo-oferta-btn.activo,.btn-agregar-grande{{color:{txt}}}\n"
             f".btn-carrito:hover,.btn-agregar:hover,.btn-full:hover,.btn-agregar-grande:hover{{background:{hov};color:{txt}}}\n")
    if td:
        v = td["velo"]
        extra += ("@media (prefers-color-scheme:dark){\n"
                  f"  header.principal{{background:rgba({td['claro']},.96);border-bottom-color:#F3DCE4}}\n"
                  f"  .fondo-tinte{{background:linear-gradient(175deg,rgba({v},.5) 0%,rgba({v},.3) 45%,rgba({v},.6) 100%)}}\n"
                  f"  .fondo-foto,.admin-fondo-foto{{background:{td['fondo']}}}\n"
                  f"  .modal.modal-full .caja-modal.ancha{{background:rgba({v},.78)}}\n"
                  f"  .pantalla-carga,.carga-fondo-tinte{{background:{td['carga_clara']}}}\n"
                  f"  .toast{{color:{txt}}}\n"
                  "}\n")
    s = sub(s, "</style>", extra + "</style>")

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
