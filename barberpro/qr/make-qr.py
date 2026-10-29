"""Arma el cartel con el código QR para imprimir y poner en el local (A4, 300 dpi) y el QR solo.
Uso (desde la carpeta barberpro):
    python qr/make-qr.py                                  -> cartel general de Parisi
    python qr/make-qr.py "<link>" "<nombre del local>" "<archivo-sin-extension>" "<texto extra opcional>"
Genera <archivo>.png y <archivo>.pdf (cartel) y <archivo>-solo.png (solo el QR) dentro de qr/."""
import os, sys
import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageDraw, ImageFont

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
URL = sys.argv[1] if len(sys.argv) > 1 else "https://jvsystems.com.ar/barberpro/"
NAME = sys.argv[2] if len(sys.argv) > 2 else "Parisi Barbers Rosario"
OUT = sys.argv[3] if len(sys.argv) > 3 else "qr-parisi"
EXTRA = sys.argv[4] if len(sys.argv) > 4 else ""

INK = (11, 17, 24)
BLUE = (30, 136, 229)
GREY = (82, 97, 111)
W, H = 2480, 3508            # A4 a 300 dpi


def font(bold, size):
    for f in (("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
              ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
              ("/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf")):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def centered(d, y, text, f, fill):
    w = d.textlength(text, font=f)
    d.text(((W - w) / 2, y), text, font=f, fill=fill)
    return y + f.size


def stripe(d, y, h):
    step = h * 2
    for x in range(-h * 2, W + h * 2, step):
        d.polygon([(x, y + h), (x + h, y + h), (x + h * 2, y), (x + h, y)], fill=BLUE)


# ---- el QR (corrección de errores alta: se lee aunque se ensucie o se doble el papel) ----
qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=40, border=0)
qr.add_data(URL)
qr.make(fit=True)
qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
solo = Image.new("RGB", (qr_img.size[0] + 160, qr_img.size[1] + 160), "white")
solo.paste(qr_img, (80, 80))
solo.resize((1400, 1400), Image.NEAREST).save("qr/%s-solo.png" % OUT)

# ---- el cartel ----
page = Image.new("RGB", (W, H), "white")
d = ImageDraw.Draw(page)
d.rectangle([0, 0, W, 70], fill=(219, 229, 239))
stripe(d, 0, 35)

y = 230
y = centered(d, y, "Reservá tu turno", font(True, 210), INK) + 40
y = centered(d, y, NAME, font(True, 120), BLUE) + 90

qr_size = 1560
q = solo.resize((qr_size, qr_size), Image.NEAREST)
frame = 36
qx = (W - qr_size) // 2
d.rounded_rectangle([qx - frame, y - frame, qx + qr_size + frame, y + qr_size + frame], radius=60, outline=INK, width=14, fill="white")
page.paste(q, (qx, y))
y += qr_size + frame + 110

y = centered(d, y, "Escaneá el código con la cámara de tu celular", font(True, 95), INK) + 20
y = centered(d, y, "Sin llamadas ni mensajes: pedís tu turno en un minuto", font(False, 75), GREY) + 90

# tres pasos
steps = [("1", "Escaneá el QR"), ("2", "Creá tu usuario"), ("3", "Elegí barbero, día y hora")]
colw = (W - 400) // 3
f_num, f_txt = font(True, 110), font(True, 70)
for i, (n, t) in enumerate(steps):
    cx = 200 + colw * i + colw // 2
    r = 90
    d.ellipse([cx - r, y, cx + r, y + 2 * r], fill=BLUE)
    wn = d.textlength(n, font=f_num)
    d.text((cx - wn / 2, y + r - f_num.size * 0.62), n, font=f_num, fill="white")
    words, lines, cur = t.split(" "), [], ""
    for wd in words:
        trial = (cur + " " + wd).strip()
        if d.textlength(trial, font=f_txt) > colw - 40 and cur:
            lines.append(cur); cur = wd
        else:
            cur = trial
    lines.append(cur)
    ty = y + 2 * r + 40
    for ln in lines:
        wl = d.textlength(ln, font=f_txt)
        d.text((cx - wl / 2, ty), ln, font=f_txt, fill=INK)
        ty += 85
y += 2 * 90 + 40 + 85 * 2 + 70

if EXTRA:
    y = centered(d, y, EXTRA, font(True, 80), BLUE) + 20

# pie: el link en texto por si alguien no puede escanear
centered(d, H - 330, "¿No podés escanear? Escribí en tu navegador:", font(False, 62), GREY)
centered(d, H - 245, URL.replace("https://", "").rstrip("/"), font(True, 85), INK)
d.rectangle([0, H - 70, W, H], fill=(219, 229, 239))
stripe(d, H - 70, 35)

page.save("qr/%s.png" % OUT, dpi=(300, 300))
page.save("qr/%s.pdf" % OUT, "PDF", resolution=300.0)
print("listo: qr/%s.pdf, qr/%s.png y qr/%s-solo.png" % (OUT, OUT, OUT))
