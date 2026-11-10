#!/usr/bin/env python3
"""Generate KINOSTRA app icon (256/512 px PNG + multi-size ICO)."""
from PIL import Image, ImageDraw, ImageFont

def make_icon(size=512):
    img = Image.new('RGBA', (size, size), (7, 8, 10, 255))
    d = ImageDraw.Draw(img)
    s = size / 512

    # subtle border
    d.rounded_rectangle([8*s, 8*s, size-8*s, size-8*s], radius=42*s, outline=(28, 33, 40, 255), width=3)

    # amber K block (clip-path style: slanted bottom-right)
    bx, by = 96*s, 128*s
    bw, bh = 64*s, 256*s
    # block with notched bottom-right corner like the brand
    poly = [(bx, by), (bx+bw, by), (bx+bw, by+bh-26*s), (bx+bw-26*s, by+bh), (bx, by+bh)]
    d.polygon(poly, fill=(247, 166, 0, 255))

    # K letterform (two diagonal strokes)
    kx = 196*s
    d.polygon([(kx, by), (kx+58*s, by), (kx+150*s, by+bh/2), (kx+58*s, by+bh), (kx, by+bh), (kx+92*s, by+bh/2)], fill=(247, 166, 0, 255))

    # film-strip accents on right
    for i in range(4):
        yy = 160*s + i*60*s
        d.rectangle([368*s, yy, 412*s, yy+34*s], fill=(247, 166, 0, 255 if i % 2 == 0 else 120))

    return img

img512 = make_icon(512)
img512.save('/home/z/my-project/kinostra-desktop/build/icon.png')
img512.resize((256, 256), Image.LANCZOS).save('/home/z/my-project/kinostra-desktop/build/icon-256.png')

# multi-size ICO
img512.save(
    '/home/z/my-project/kinostra-desktop/build/icon.ico',
    format='ICO',
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
)
print('icon.png, icon-256.png, icon.ico saved')
