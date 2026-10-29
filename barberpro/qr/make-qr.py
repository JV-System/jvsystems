"""Arma el cartel con el código QR para imprimir y poner en el local (A4, 300 dpi) y el QR solo.
Uso (desde la carpeta barberpro):
    python qr/make-qr.py                                  -> carteles generales de Parisi (oscuro y claro)
    python qr/make-qr.py "<link>" "<nombre del local>" "<archivo-sin-extension>" "<ciudad>"
Genera, dentro de qr/:  <archivo>.pdf/.png (cartel oscuro), <archivo>-claro.pdf/.png (cartel claro, gasta menos tinta) y <archivo>-solo.png (solo el QR)."""
import os, sys
import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageDraw, ImageFont, ImageFilter

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
URL = sys.argv[1] if len(sys.argv) > 1 else "https://jvsystems.com.ar/barberpro/"
NAME = sys.argv[2] if len(sys.argv) > 2 else "Parisi Barbers"
OUT = sys.argv[3] if len(sys.argv) > 3 else "qr-parisi"
CITY = sys.argv[4] if len(sys.argv) > 4 else "Rosario"

W, H = 2480, 3508            # A4 a 300 dpi
BLUE = (41, 151, 240)
BLUE_D = (30, 136, 229)
RED = (214, 52, 62)
NAVY = (11, 17, 24)
WHITE = (255, 255, 255)
SOFT = (170, 188, 206)


def font(kind, size):
    paths = {"impact": ["C:/Windows/Fonts/impact.ttf"], "bold": ["C:/Windows/Fonts/arialbd.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
             "reg": ["C:/Windows/Fonts/arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]}
    for p in paths[kind] + paths["bold"]:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def tracked_width(d, text, f, track):
    return sum(d.textlength(c, font=f) for c in text) + track * (len(text) - 1)


def tracked(d, cx, y, text, f, fill, track=0):
    x = cx - tracked_width(d, text, f, track) / 2
    for c in text:
        d.text((x, y), c, font=f, fill=fill)
        x += d.textlength(c, font=f) + track


def barber_pole(w, h):
    """Poste de barbero (cilindro con franjas en diagonal y brillo), devuelto como imagen RGBA."""
    S = 3
    ww, hh = w * S, h * S
    layer = Image.new("RGBA", (ww, hh), WHITE + (255,))
    d = ImageDraw.Draw(layer)
    sw = int(ww * 0.62)                       # ancho de cada franja (medido en horizontal)
    colors = [RED, WHITE, BLUE_D, WHITE]
    i = -6
    while i * sw < hh + ww * 3:
        c = colors[i % 4]
        x0 = i * sw
        d.polygon([(x0 - ww * 2.2, hh), (x0 - ww * 2.2 + sw, hh), (x0 + sw, 0), (x0, 0)], fill=c)
        i += 1
    # volumen: sombra en los bordes y luz a la izquierda
    shade = Image.new("RGBA", (ww, hh), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    for x in range(ww):
        t = x / (ww - 1)
        a = int(110 * (abs(t - 0.38) ** 1.6) * 2.3)
        sd.line([(x, 0), (x, hh)], fill=(0, 0, 20, min(150, a)))
    hl = Image.new("RGBA", (ww, hh), (0, 0, 0, 0))
    ImageDraw.Draw(hl).rounded_rectangle([int(ww * 0.16), 0, int(ww * 0.30), hh], radius=int(ww * 0.07), fill=(255, 255, 255, 70))
    layer = Image.alpha_composite(layer, shade)
    layer = Image.alpha_composite(layer, hl)
    mask = Image.new("L", (ww, hh), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, ww - 1, hh - 1], radius=ww // 2, fill=255)
    layer.putalpha(mask)
    return layer.resize((w, h), Image.LANCZOS)


def with_caps(pole):
    """Agrega las tapas plateadas de arriba y abajo."""
    w, h = pole.size
    cap_h, cap_w = int(w * 0.34), int(w * 1.22)
    out = Image.new("RGBA", (cap_w, h + cap_h * 2 - 24), (0, 0, 0, 0))
    d = ImageDraw.Draw(out)
    for y in (0, out.size[1] - cap_h):
        d.rounded_rectangle([0, y, cap_w - 1, y + cap_h], radius=cap_h // 2, fill=(196, 206, 218, 255))
        d.rounded_rectangle([int(cap_w * 0.08), y + 6, int(cap_w * 0.40), y + cap_h // 2], radius=cap_h // 4, fill=(244, 247, 250, 255))
    out.alpha_composite(pole, ((cap_w - w) // 2, cap_h - 12))
    return out


# ---- el QR (corrección de errores alta: se lee aunque se ensucie o se doble el papel) ----
qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=40, border=0)
qr.add_data(URL)
qr.make(fit=True)
qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
solo = Image.new("RGB", (qr_img.size[0] + 160, qr_img.size[1] + 160), "white")
solo.paste(qr_img, (80, 80))
solo.resize((1400, 1400), Image.NEAREST).save("qr/%s-solo.png" % OUT)


def cartel_oscuro():
    page = Image.new("RGBA", (W, H), NAVY + (255,))
    # resplandor suave detrás del QR
    glow = Image.radial_gradient("L").resize((W, H)).point(lambda v: 255 - v)
    page = Image.composite(Image.new("RGBA", (W, H), (22, 44, 70, 255)), page, glow.point(lambda v: int(v * 0.55)))
    d = ImageDraw.Draw(page)
    cx = W // 2

    # marco fino
    d.rounded_rectangle([60, 60, W - 60, H - 60], radius=40, outline=(44, 62, 84), width=5)

    # nombre del local
    tracked(d, cx, 170, NAME.upper(), font("impact", 250), WHITE, track=22)
    # ciudad entre dos líneas
    f_city = font("bold", 70)
    cw = tracked_width(d, CITY.upper(), f_city, 36)
    ly = 505
    d.line([(cx - cw / 2 - 560, ly), (cx - cw / 2 - 60, ly)], fill=BLUE, width=8)
    d.line([(cx + cw / 2 + 60, ly), (cx + cw / 2 + 560, ly)], fill=BLUE, width=8)
    tracked(d, cx, ly - 44, CITY.upper(), f_city, BLUE, track=36)

    # título
    f_t = font("impact", 300)
    a, b = "Reservá tu ", "turno"
    wa, wb = d.textlength(a, font=f_t), d.textlength(b, font=f_t)
    x0 = cx - (wa + wb) / 2
    d.text((x0, 640), a, font=f_t, fill=WHITE)
    d.text((x0 + wa, 640), b, font=f_t, fill=BLUE)

    # QR en tarjeta blanca con sombra y esquinas azules
    qr_size, pad = 1320, 70
    card = qr_size + pad * 2
    cx0, cy0 = (W - card) // 2, 1090
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([cx0 + 6, cy0 + 40, cx0 + card + 6, cy0 + card + 40], radius=70, fill=(0, 0, 0, 170))
    page = Image.alpha_composite(page, shadow.filter(ImageFilter.GaussianBlur(40)))
    d = ImageDraw.Draw(page)
    d.rounded_rectangle([cx0, cy0, cx0 + card, cy0 + card], radius=70, fill=WHITE)
    page.paste(solo.resize((qr_size, qr_size), Image.NEAREST), (cx0 + pad, cy0 + pad))
    o, ln, wd = 60, 190, 16
    for (px, py, sx, sy) in ((cx0 - o, cy0 - o, 1, 1), (cx0 + card + o, cy0 - o, -1, 1), (cx0 - o, cy0 + card + o, 1, -1), (cx0 + card + o, cy0 + card + o, -1, -1)):
        d.line([(px, py), (px + sx * ln, py)], fill=BLUE, width=wd)
        d.line([(px, py), (px, py + sy * ln)], fill=BLUE, width=wd)

    # postes de barbero a los costados
    pole = with_caps(barber_pole(120, card - 330))
    for px in (cx0 // 2, W - cx0 // 2):
        page.alpha_composite(pole, (px - pole.size[0] // 2, cy0 + (card - pole.size[1]) // 2))
    d = ImageDraw.Draw(page)

    # instrucciones
    y = cy0 + card + 130
    tracked(d, cx, y, "Escaneá con la cámara de tu celular", font("bold", 96), WHITE, track=0)
    tracked(d, cx, y + 130, "Sin llamadas ni mensajes: pedís tu turno en un minuto", font("reg", 66), SOFT, track=0)

    steps = ["Escaneá el QR", "Creá tu usuario", "Elegí día y hora"]
    f_s, f_n = font("bold", 66), font("impact", 80)
    y2 = y + 290
    colw = (W - 300) // 3
    for i, t in enumerate(steps):
        sx = 150 + colw * i
        r = 70
        d.ellipse([sx + 30, y2, sx + 30 + 2 * r, y2 + 2 * r], fill=BLUE_D)
        wn = d.textlength(str(i + 1), font=f_n)
        d.text((sx + 30 + r - wn / 2, y2 + r - 52), str(i + 1), font=f_n, fill=WHITE)
        d.text((sx + 30 + 2 * r + 30, y2 + r - 34), t, font=f_s, fill=WHITE)

    # link en texto
    f_u = font("bold", 84)
    txt = URL.replace("https://", "").rstrip("/")
    uw = d.textlength(txt, font=f_u)
    d.rounded_rectangle([cx - uw / 2 - 90, H - 330, cx + uw / 2 + 90, H - 190], radius=70, outline=BLUE, width=7)
    d.text((cx - uw / 2, H - 305), txt, font=f_u, fill=WHITE)
    return page.convert("RGB")


def cartel_claro():
    page = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(page)
    cx = W // 2
    INK = NAVY
    d.rectangle([0, 0, W, 70], fill=(219, 229, 239))
    for x in range(-70, W + 70, 70):
        d.polygon([(x, 35), (x + 35, 35), (x + 70, 0), (x + 35, 0)], fill=BLUE_D)
    tracked(d, cx, 200, NAME.upper(), font("impact", 230), INK, track=20)
    tracked(d, cx, 470, CITY.upper(), font("bold", 70), BLUE_D, track=36)
    f_t = font("impact", 270)
    a, b = "Reservá tu ", "turno"
    wa, wb = d.textlength(a, font=f_t), d.textlength(b, font=f_t)
    x0 = cx - (wa + wb) / 2
    d.text((x0, 600), a, font=f_t, fill=INK)
    d.text((x0 + wa, 600), b, font=f_t, fill=BLUE_D)
    qr_size, fr = 1440, 36
    qx, qy = (W - qr_size) // 2, 1000
    d.rounded_rectangle([qx - fr, qy - fr, qx + qr_size + fr, qy + qr_size + fr], radius=60, outline=INK, width=14, fill="white")
    page.paste(solo.resize((qr_size, qr_size), Image.NEAREST), (qx, qy))
    y = qy + qr_size + 140
    tracked(d, cx, y, "Escaneá con la cámara de tu celular", font("bold", 92), INK)
    tracked(d, cx, y + 125, "Sin llamadas ni mensajes: pedís tu turno en un minuto", font("reg", 66), (82, 97, 111))
    steps = ["Escaneá el QR", "Creá tu usuario", "Elegí día y hora"]
    f_s, f_n = font("bold", 66), font("impact", 80)
    y2 = y + 290
    colw = (W - 300) // 3
    for i, t in enumerate(steps):
        sx = 150 + colw * i
        r = 70
        d.ellipse([sx + 30, y2, sx + 30 + 2 * r, y2 + 2 * r], fill=BLUE_D)
        wn = d.textlength(str(i + 1), font=f_n)
        d.text((sx + 30 + r - wn / 2, y2 + r - 52), str(i + 1), font=f_n, fill="white")
        d.text((sx + 30 + 2 * r + 30, y2 + r - 34), t, font=f_s, fill=INK)
    f_u = font("bold", 84)
    txt = URL.replace("https://", "").rstrip("/")
    tracked(d, cx, H - 270, txt, f_u, INK)
    d.rectangle([0, H - 70, W, H], fill=(219, 229, 239))
    for x in range(-70, W + 70, 70):
        d.polygon([(x, H - 35), (x + 35, H - 35), (x + 70, H - 70), (x + 35, H - 70)], fill=BLUE_D)
    return page


for suffix, make in (("", cartel_oscuro), ("-claro", cartel_claro)):
    img = make()
    img.save("qr/%s%s.png" % (OUT, suffix), dpi=(300, 300))
    img.save("qr/%s%s.pdf" % (OUT, suffix), "PDF", resolution=300.0)
print("listo: qr/%s.pdf (oscuro), qr/%s-claro.pdf y qr/%s-solo.png" % (OUT, OUT, OUT))
