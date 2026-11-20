#!/usr/bin/env python3
# Lembar kontak 5 pratinjau frame v3.35 (verifikasi visual + lampiran user)
from PIL import Image, ImageDraw, ImageFont
import os

SRC = '/home/z/my-project/download/frame-v335'
items = [('pratinjau-komik.png', '1. KOMIK MERAH-BIRU'),
         ('pratinjau-glossy.png', '2. GLOSSY GAMING'),
         ('pratinjau-sport.png', '3. SPORT LINGKAR'),
         ('pratinjau-pitaemas.png', '4. PITA EMAS'),
         ('pratinjau-neonlayar.png', '5. NEON CYAN-PINK')]
W = 760
hdr = 46
ims = []
for f, _ in items:
    im = Image.open(os.path.join(SRC, f)).convert('RGB')
    h = round(im.height * W / im.width)
    ims.append(im.resize((W, h), Image.LANCZOS))
H = hdr * len(items) + sum(im.height for im in ims) + 8 * (len(items) + 1)
sheet = Image.new('RGB', (W + 16, H), (14, 15, 22))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/chinese/NotoSansSC-Bold.ttf', 26)
except Exception:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 24)
y = 8
for (f, label), im in zip(items, ims):
    d.text((14, y + 8), label, fill=(247, 166, 0), font=font)
    y += hdr
    sheet.paste(im, (8, y))
    y += im.height + 8
out = os.path.join(SRC, 'semua-frame-v335.png')
sheet.save(out)
print('sheet:', out, sheet.size, os.path.getsize(out), 'bytes')
