"""Genera los íconos de la app (Android, iPhone y avisos) a partir del logo del local.
Uso (desde la carpeta barberpro):  python icons/make-icons.py [archivo-logo.png] [LETRA]
- Con logo: lo centra sobre fondo oscuro. Sin logo: arma un monograma con la letra (por defecto P) y una franja de barbero."""
import sys, os
from PIL import Image, ImageDraw, ImageFont
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
logo_path = sys.argv[1] if len(sys.argv) > 1 and os.path.exists(sys.argv[1]) else None
letter = (sys.argv[2] if len(sys.argv) > 2 else "P")[:1].upper()
BG = (11, 17, 24, 255)

def monogram(size):
    im = Image.new("RGBA", (size, size), BG)
    d = ImageDraw.Draw(im)
    for f in ("C:/Windows/Fonts/arialbd.ttf", "/Library/Fonts/Arial Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        if os.path.exists(f):
            font = ImageFont.truetype(f, int(size * 0.56)); break
    else:
        font = ImageFont.load_default()
    box = d.textbbox((0, 0), letter, font=font)
    d.text(((size - (box[2] - box[0])) / 2 - box[0], (size - (box[3] - box[1])) / 2 - box[1] - size * 0.03), letter, font=font, fill=(241, 245, 249, 255))
    # franja de barbero abajo
    h = int(size * 0.07); y0 = int(size * 0.80)
    for x in range(-h, size + h, h * 2):
        d.polygon([(x, y0 + h), (x + h, y0 + h), (x + h * 2, y0), (x + h, y0)], fill=(30, 136, 229, 255))
    d.rectangle([0, y0 + h, size, size], fill=BG)
    d.rectangle([0, y0 - 1, size, y0], fill=BG)
    return im

def from_logo(size, ratio):
    logo = Image.open(logo_path).convert("RGBA"); logo = logo.crop(logo.getbbox())
    k = min(size * ratio / logo.size[0], size * ratio / logo.size[1])
    l = logo.resize((max(1, int(logo.size[0] * k)), max(1, int(logo.size[1] * k))), Image.LANCZOS)
    im = Image.new("RGBA", (size, size), BG)
    im.alpha_composite(l, ((size - l.size[0]) // 2, (size - l.size[1]) // 2))
    return im

def make(size, ratio, name):
    im = from_logo(size, ratio) if logo_path else monogram(size)
    im.convert("RGB").save("icons/" + name, optimize=True)

make(512, 0.86, "icon-512.png"); make(192, 0.86, "icon-192.png")
make(512, 0.62, "icon-maskable-512.png"); make(180, 0.86, "apple-touch-icon.png")
print("íconos listos", "(con logo)" if logo_path else "(monograma " + letter + ")")
