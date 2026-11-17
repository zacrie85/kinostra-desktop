#!/usr/bin/env python3
# bump v3.27.0 → v3.28.0 (6 file) + baris README 72 + PANDUAN modul 03 + bagian baru
import json, re

CHG = ("v3.28.0: 15 FRAME JUDUL (5 BARU ELEGAN TRANSPARAN \u2014 KACA HALUS, KRISTAL BENING, "
 "GARIS BENING, MEWAH BENING, ETERE) & 15 FRAME FUTURISTIK ELEGAN TRANSPARAN BARU utk "
 "PART/EPISODE/BAGIAN DI VIDEO (katalog PARTFRAMES: HUD SUDUT, GARIS HUD, KAPSUL BENING, "
 "KURUNG TEKNO, CHIP DATA, SEGI ENAM, PITA TEKNO, GARIS GANDA HUD, TITIK ORBIT, FASE SUDUT, "
 "PANEL SISTEM, SINAR SAMPING, JARING TITIK, GARIS MURNI, BERKAS CAHAYA) \u2014 fitur baru modul 03: "
 "chips FRAME PART DI VIDEO, ikut skala ukuran part, berlaku bumper intro & label pojok, "
 "ikut preset & overlay native, pratinjau = ekspor persis; semua frame deterministik tanpa "
 "animasi (aman ekspor). Uji BARU 11/11 (16+16 chips, pixel-DIFF semua 15 frame judul & 15 "
 "frame part di intro, pojok kapsul+hud, preset roundtrip frame part+judul, native sig, ekspor "
 "nyata 1 part frame HUD + merah + 60%); regresi: v327 12/12, v314 22/22, modul16 14/14, frame "
 "6/6, overlay 6/6, ekspor 7/7, v316 22/24 (flake seksi E lama \u2014 terdokumentasi). Bump 6 file")

d = json.loads(open('package.json').read())
d['version'] = '3.28.0'
assert 'v3.27.0:' in d['description']
d['description'] = d['description'].replace('\u00b7 v3.27.0:', '\u00b7 ' + CHG + '\u00b7 v3.27.0:', 1)
open('package.json', 'w').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

for f in ['build/installer.nsi', 'build/afterpack.js']:
    s = open(f).read()
    open(f, 'w').write(s.replace('3.27.0', '3.28.0'))

s = open('README.md').read()
s = s.replace('badge/version-3.27.0-amber', 'badge/version-3.28.0-amber', 1)
row72 = ('| 72 | **15 FRAME JUDUL & 15 FRAME PART** \u2b50v3.28.0 | '
 'Modul 03: frame judul kini 15 gaya (+5 elegan transparan) & FITUR BARU 15 frame futuristik '
 'transparan untuk tulisan PART/EPISODE di video (intro & pojok); ikut preset, pratinjau = ekspor persis |\n')
m = re.search(r'^\| 71 \|.+\|\n', s, re.M)
assert m, 'baris 71 tak ketemu'
s = s[:m.end()] + row72 + s[m.end():]
open('README.md', 'w').write(s)

s = open('KINOSTRA-PANDUAN.md').read()
s = s.replace('# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.27.0', '# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.28.0', 1)
o1 = 'posisi teks bebas, 10 FRAME JUDUL,'
n1 = 'posisi teks bebas, 15 FRAME JUDUL (v3.28; dulu 10) + FRAME PART 15 gaya futuristik transparan (v3.28),'
assert o1 in s
s = s.replace(o1, n1, 1)
sec = ('''## Yang Baru di v3.28.0 — 15 FRAME JUDUL + 15 FRAME PART FUTURISTIK TRANSPARAN

Dua upgrade di modul **03 JUDUL & PART OTOMATIS** sesuai permintaan kawan:

1. **Frame judul kini 15 gaya.** Ditambah 5 frame elegan transparan: **KACA HALUS** (panel kaca bening sangat tipis), **KRISTAL BENING** (kurungan sudut putih tipis panjang), **GARIS BENING** (hairline membulat + berlian kecil), **MEWAH BENING** (kaca + hairline emas di dalam), dan **ETERE** (gradasi putih pudar kiri-kanan). Semuanya tipis, bening, dan tidak menutupi video.
2. **Fitur baru: FRAME PART DI VIDEO — 15 gaya futuristik transparan.** Tulisan PART/EPISODE/EPS/BAGIAN/# kini bisa diberi bingkai: HUD SUDUT, GARIS HUD, KAPSUL BENING, KURUNG TEKNO, CHIP DATA, SEGI ENAM, PITA TEKNO, GARIS GANDA HUD, TITIK ORBIT, FASE SUDUT, PANEL SISTEM, SINAR SAMPING, JARING TITIK, GARIS MURNI, BERKAS CAHAYA. Berlaku di bumper intro & label pojok, ikut skala ukuran part, dan digambar mesin yang sama dengan ekspor.

Semua frame deterministik (tanpa animasi) sehingga aman untuk ekspor, ikut tersimpan di preset, dan pratinjau = hasil ekspor persis. Diuji 11/11 (pixel-diff semua gaya di kedua mode, preset, ekspor nyata) + seluruh regresi lama.

''')
s = s.replace('## Yang Baru di v3.27.0', sec + '## Yang Baru di v3.27.0', 1)
open('KINOSTRA-PANDUAN.md', 'w').write(s)

s = open('renderer/index.html').read()
assert s.count('3.27.0') == 2, s.count('3.27.0')
open('renderer/index.html', 'w').write(s.replace('3.27.0', '3.28.0'))

print('bump v3.28.0 selesai \u2014 6 file')
