#!/usr/bin/env python3
# bump v3.20.0 → v3.21.0 (6 file) + baris fitur README + bagian PANDUAN
import json, re

CHG = ("v3.21.0: FORMULA VIDSplit \u2014 jawaban laporan 'masih error: setiap video 3-4 jam+ langsung ngerestar sendiri saat di play' "
 "dengan REFERENSI KERJA YANG BENAR: aplikasi kembar VidSplit v3.9.2 terbukti memutar film 4 jam LANCAR di mesin yang sama. "
 "Bedah VidSplit menemukan formula stabilnya: elemen <video> asli SELALU yang menjadi tampilan (semua mode), overlay = lapisan "
 "DOM/kanvas transparan, latar blur = kanvas MINI 90\u00d7160 blur 4px diperbesar CSS, dan TIDAK ADA drawImage(video) ke kanvas besar "
 "saat memutar. KINOSTRA v3.20 sudah menyalakan jalur native tetapi hanya utk rasio 16:9 \u2014 rasio 9:16 (dipakai konten potongan) "
 "masih jatuh ke kanvas penuh = drawImage(video) 24\u00d7/dtk + blur 1080\u00d71920 = akar sisa hang di mesin user. Kini v3.21: "
 "jalur native berlaku DI SEMUA RASIO (16:9 & 9:16+blur), latar blur saat memutar = kanvas mini 10 fps ala VidSplit, "
 "antrean thumbnail kotak video DITAHAN selagi video diputar (dulu dekode film ke-2/3/4/5 berdesakan dgn pemutaran \u2014 persis "
 "alur 'impor 5 video lalu langsung play'), MODE PUTARAN HEMAT kini hanya memperlambat overlay 5 fps (jalur native tetap). "
 "Uji baru 36/36 (native 16:9 & 9:16+blur dgn latar mini 10 fps; antrean thumbnail tertahan saat memutar & lanjut saat pause; "
 "film 4 jam 47 dtk nol beku; regresi pelindung v3.19; mode aman \u00d72 hang \u2192 putaran hemat dgn native tetap); "
 "regresi v3172 38/43 (versi-only). ")

# 1. package.json
d = json.loads(open('package.json').read())
d['version'] = '3.21.0'
desc = d['description']
assert 'v3.20.0:' in desc
d['description'] = desc.replace('KINOSTRA \u2014 Suite Video Otonom \u00b7 Desktop 100% Offline \u00b7 v3.20.0:', 'KINOSTRA \u2014 Suite Video Otonom \u00b7 Desktop 100% Offline \u00b7 ' + CHG + '\u00b7 v3.20.0:', 1)
open('package.json', 'w').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

# 2-3. nsi + afterpack: ganti buta
for f in ['build/installer.nsi', 'build/afterpack.js']:
    s = open(f).read()
    open(f, 'w').write(s.replace('3.20.0', '3.21.0'))

# 4. README: badge + baris fitur baru (sisip SETELAH baris 63)
s = open('README.md').read()
s = s.replace('badge/version-3.20.0-amber', 'badge/version-3.21.0-amber', 1)
row64 = ('| 64 | **FORMULA VIDSplit** \u2b50v3.21.0 | '
 'Laporan "video 3-4 jam masih ngerestar saat di play" dijawab dgn referensi nyata: VidSplit v3.9.2 (aplikasi kembar) terbukti lancar di mesin yang sama. Formula stabilnya diadopsi utuh: **jalur native di SEMUA rasio** (16:9 & 9:16), latar blur 9:16 saat memutar = kanvas mini 90\u00d7160 (10 fps) dibesarkan CSS \u2014 bukan kanvas penuh 1080\u00d71920, dan **antrean thumbnail kotak video ditahan selagi video diputar** (dulu berdesakan dgn pemutaran). Mode putaran hemat kini hanya memperlambat overlay \u2014 jalur native tetap |\n')
m = re.search(r'^\| 63 \|.+\|\n', s, re.M)
assert m, 'baris 63 tak ketemu'
s = s[:m.end()] + row64 + s[m.end():]
open('README.md', 'w').write(s)

# 5. PANDUAN: judul + bagian Yang Baru v3.21.0 (di atas bagian v3.20.0)
s = open('KINOSTRA-PANDUAN.md').read()
s = s.replace('# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.20.0', '# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.21.0', 1)
sec = ('''## Yang Baru di v3.21.0 — FORMULA VIDSplit

Laporan dari v3.20: *"masih error — setiap video dengan durasi 3 atau 4 jam lebih dimasukan, aplikasi langsung ngerestar sendiri saat videonya di play"*. Kabar baiknya kawan memberi **referensi kerja yang benar**: aplikasi kembar VidSplit v3.9.2 terbukti memutar video 4 jam LANCAR di mesin yang sama.

Kode VidSplit dibedah dan formula stabilnya ditemukan: elemen `<video>` asli **selalu** menjadi tampilan di semua mode; overlay judul/Part adalah lapisan DOM terpisah; latar blur adalah **kanvas mini 90×160** (blur 4 px, 10 fps) yang dibesarkan lewat CSS — dan **tidak ada satu pun drawImage(video) ke kanvas besar saat memutar**. KINOSTRA v3.20 sudah memakai jalur native, tetapi hanya untuk rasio 16:9 — rasio **9:16** (yang dipakai konten potongan) masih jatuh ke jalur kanvas penuh: drawImage(video) 24×/detik + blur 1080×1920. Itulah akar sisa hang di mesin Anda.

v3.21 mengadopsi formula VidSplit utuh: jalur native berlaku di **semua rasio** (16:9 & 9:16+blur), latar blur saat memutar = kanvas mini 10 fps, video tampil contain di tengah latar, overlay transparan di atasnya. Antrean thumbnail kotak video kini **ditahan selagi video diputar** (dulu dekode film ke-2/3/4/5 untuk thumbnail berdesakan dengan pemutaran — persis alur "impor 5 video lalu langsung play"; lanjut otomatis saat pause). MODE PUTARAN HEMAT kini hanya memperlambat overlay ke 5 fps — jalur native tetap aktif, karena justru itulah jalur yang terbukti aman.

''')
s = s.replace('## Yang Baru di v3.20.0', sec + '## Yang Baru di v3.20.0', 1)
open('KINOSTRA-PANDUAN.md', 'w').write(s)

# 6. index.html: boot + header
s = open('renderer/index.html').read()
assert s.count('3.20.0') == 2, s.count('3.20.0')
open('renderer/index.html', 'w').write(s.replace('3.20.0', '3.21.0'))

print('bump v3.21.0 selesai')
for f in ['package.json', 'build/installer.nsi', 'build/afterpack.js', 'README.md', 'KINOSTRA-PANDUAN.md', 'renderer/index.html']:
    c = open(f).read()
    print(f, c.count('3.21.0'), 'titik baru;', c.count('3.20.0'), 'sisa 3.20.0')
