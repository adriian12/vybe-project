"""Genera todos los iconos y pantallas de arranque de Vybe.

Uso: python scripts/generate-icons.py

Parte del logotipo del proyecto de Stitch («Vybes Nightlife App», pantalla
«Vybes Logo»), que es este SVG de 100 x 100:

    <rect width="100" height="100" rx="24" fill="#1C1C1C"/>
    <path d="M28 28 L50 72 L72 28 L60 28 L50 52 L40 28 Z" fill="#F8D000"/>
    <circle cx="50" cy="22" r="4" fill="#F8D000"/>

Es el mismo que dibuja `src/components/brand/vybe-logo.tsx` y el que se sirve
como `public/favicon.svg`. Se pinta con Pillow a ocho veces el tamaño final y se
reduce, así que no hace falta Cairo ni Inkscape. Si cambia el logotipo, cambia
las tres cosas y vuelve a ejecutar esto.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
INK = (0x1C, 0x1C, 0x1C, 255)
CANVAS = (0x11, 0x11, 0x14, 255)
YELLOW = (0xF8, 0xD0, 0x00, 255)
SS = 8  # sobremuestreo

V = [(28, 28), (50, 72), (72, 28), (60, 28), (50, 52), (40, 28)]
DOT = (50, 22, 4)


def draw_mark(draw, x, y, side):
    """La V y el punto, con el cuadrado de 100 unidades en (x, y) de lado `side`."""
    k = side / 100
    draw.polygon([(x + px * k, y + py * k) for px, py in V], fill=YELLOW)
    cx, cy, r = DOT
    draw.ellipse([x + (cx - r) * k, y + (cy - r) * k, x + (cx + r) * k, y + (cy + r) * k], fill=YELLOW)


def render(size, shape='rounded', background=None, scale=1.0, transparent=True):
    """
    shape:  'rounded' cuadrado con esquinas de 24/100 (el icono tal cual)
            'square'  a sangre, sin esquinas (tiendas, iOS, maskable)
            'circle'  redondo (ic_launcher_round)
            'none'    sólo la V (primer plano adaptativo de Android)
    scale:  qué parte del lienzo ocupa el cuadrado de 100 unidades.
    """
    w, h = size if isinstance(size, tuple) else (size, size)
    big = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0) if transparent else (background or INK))
    d = ImageDraw.Draw(big)
    if background and transparent:
        d.rectangle([0, 0, w * SS, h * SS], fill=background)

    side = min(w, h) * SS * scale
    x = (w * SS - side) / 2
    y = (h * SS - side) / 2
    if shape == 'rounded':
        d.rounded_rectangle([x, y, x + side, y + side], radius=side * 0.24, fill=INK)
    elif shape == 'square':
        d.rectangle([x, y, x + side, y + side], fill=INK)
    elif shape == 'circle':
        d.ellipse([x, y, x + side, y + side], fill=INK)
    draw_mark(d, x, y, side)
    return big.resize((w, h), Image.LANCZOS)


def save(img, rel, opaque=False):
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    if opaque:
        img = img.convert('RGB')
    img.save(path)
    print(f'{rel} {img.size[0]}x{img.size[1]}')


# --- Web / PWA ---------------------------------------------------------------
save(render(192), 'public/icons/icon-192.png')
save(render(512), 'public/icons/icon-512.png')
# Maskable: el sistema recorta hasta el 80 % central, así que va a sangre.
save(render(512, 'square', scale=1.0), 'public/icons/icon-maskable-512.png', opaque=True)
save(render(180, 'square'), 'public/icons/apple-touch-icon.png', opaque=True)
fav = render(256)
fav.save(ROOT / 'public/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (256, 256)])
print('public/favicon.ico 16-256')

# --- Android -----------------------------------------------------------------
RES = 'android/app/src/main/res'
for dpi, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    save(render(px, 'rounded', scale=0.92), f'{RES}/mipmap-{dpi}/ic_launcher.png')
    save(render(px, 'circle', scale=0.92), f'{RES}/mipmap-{dpi}/ic_launcher_round.png')
    # Primer plano adaptativo: lienzo de 108 dp del que se ven los 72 centrales.
    fg = px * 108 // 48
    save(render(fg, 'none', scale=72 / 108), f'{RES}/mipmap-{dpi}/ic_launcher_foreground.png')


def splash(size):
    w, h = size
    img = Image.new('RGBA', (w * SS // 4, h * SS // 4), CANVAS)
    d = ImageDraw.Draw(img)
    side = min(w, h) * SS // 4 * 0.28
    x = (img.width - side) / 2
    y = (img.height - side) / 2
    d.rounded_rectangle([x, y, x + side, y + side], radius=side * 0.24, fill=INK)
    draw_mark(d, x, y, side)
    return img.resize((w, h), Image.LANCZOS)


for png in sorted((ROOT / RES).glob('drawable*/splash.png')):
    with Image.open(png) as old:
        size = old.size
    save(splash(size), png.relative_to(ROOT).as_posix(), opaque=True)

# --- iOS ---------------------------------------------------------------------
IOS = 'ios/App/App/Assets.xcassets'
save(render(1024, 'square'), f'{IOS}/AppIcon.appiconset/AppIcon-512@2x.png', opaque=True)
for png in sorted((ROOT / IOS / 'Splash.imageset').glob('*.png')):
    with Image.open(png) as old:
        size = old.size
    save(splash(size), png.relative_to(ROOT).as_posix(), opaque=True)
