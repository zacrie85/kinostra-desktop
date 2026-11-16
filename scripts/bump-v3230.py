#!/usr/bin/env python3
# bump v3.22.0 → v3.23.0 (6 file) + baris fitur README + bagian PANDUAN
import json, re

CHG = ("v3.23.0: GAMBAR BERGERAK LAGI \u2014 jawaban laporan 'videonya berhasil di play dan aplikasi tidak merestar kawannn mantaappp, akan tetapi gambar yang di play tidak bergerak, hanya itu sedikit bug nya': AKAR v3.22 BERHASIL (impor film panjang tak ngerestar lagi), sisa bug POMPA FRAME: waktu berjalan tapi gambar beku. "
 "Diagnosis: (a) A/B sandbox membuktikan kode v3.21 pun menampilkan pompa \u00b12 fps di Xvfb \u2192 bekunya di mesin user = mekanisme Windows spesifik yang tak direproduksi sandbox; (b) perubahan v3.22 yang menyentuh elemen media = preload='metadata' (tebakan yang sekarang DIBUANG \u2014 bisa membuat pompa frame kompositor tak pernah aktif di sebagian mesin Windows utk elemen yang tadinya tersembunyi lalu ditampilkan). "
 "FIX: (1) elemen media kembali PERSIS formula VidSplit/v3.21 yang terbukti gambarnya bergerak (preload default auto); (2) PENGAWAS GERAK GAMBAR \u2014 penyembuh otomatis: tiap 2 dtk selagi memutar, totalVideoFrames diam PADAHAL currentTime maju = pompa macet \u2192 tangga: kocok halus (seek +0,05 dtk) \u2192 nyalakan ulang visibilitas elemen \u2192 jatuh ke jalur kanvas overlay (canNativePlay membaca _forceCanvasPlay); semua kejadian dicatat ke log utk diagnosis lapangan; diuji dgn sandera counter (6/6 lulus: deteksi \u00b12 dtk, seluruh tangga menyala, waktu tetap jalan, nol false-positive saat pompa hidup). ")

d = json.loads(open('package.json').read())
d['version'] = '3.23.0'
desc = d['description']
assert 'v3.22.0:' in desc
d['description'] = desc.replace('KINOSTRA \u2014 Suite Video Otonom \u00b7 Desktop 100% Offline \u00b7 v3.22.0:', 'KINOSTRA \u2014 Suite Video Otonom \u00b7 Desktop 100% Offline \u00b7 ' + CHG + '\u00b7 v3.22.0:', 1)
open('package.json', 'w').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

for f in ['build/installer.nsi', 'build/afterpack.js']:
    s = open(f).read()
    open(f, 'w').write(s.replace('3.22.0', '3.23.0'))

s = open('README.md').read()
s = s.replace('badge/version-3.22.0-amber', 'badge/version-3.23.0-amber', 1)
row66 = ('| 66 | **GAMBAR BERGERAK LAGI** \u2b50v3.23.0 | '
 'Bug sisa v3.22: waktu berjalan tapi gambar beku (pompa frame kompositor macet di sebagian mesin Windows). Kini: elemen media kembali persis formula VidSplit/v3.21 (preload default) + **PENGAWAS GERAK GAMBAR** penyembuh otomatis \u2014 frame diam & waktu maju = pompa macet \u2192 kocok halus (seek +0,05 dtk) \u2192 visibilitas dinyalakan ulang \u2192 jatuh ke jalur kanvas overlay; semua tercatat di log. Diuji dgn sandera counter: 6/6 lulus, nol false-positive |\n')
m = re.search(r'^\| 65 \|.+\|\n', s, re.M)
assert m, 'baris 65 tak ketemu'
s = s[:m.end()] + row66 + s[m.end():]
open('README.md', 'w').write(s)

s = open('KINOSTRA-PANDUAN.md').read()
s = s.replace('# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.22.0', '# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.23.0', 1)
sec = ('''## Yang Baru di v3.23.0 — GAMBAR BERGERAK LAGI

Kabar baiknya dulu: laporan kamu *"videonya berhasil di play dan aplikasi tidak merestar kawannn mantaappp"* berarti **akar v3.22 berhasil di mesin kamu** — impor film panjang tidak lagi membuat aplikasi ngestar. Sisa bugnya satu: *"gambar yang di play tidak bergerak, walaupun waktunya berjalan"*.

Ini disebut **pompa frame macet**: jam media (waktu) dipegang pipa audio yang terus berjalan, tapi jalur penyajian gambar kompositor Chromium berhenti meminta frame baru — layar menampilkan satu frame terakhir selamanya. A/B di sandbox membuktikan kode v3.21 sebelumnya pun tidak bisa diuji langsung untuk ini (kompositor lingkungan uji selalu ±2 fps), artinya bekunya di mesin kamu mekanisme Windows yang spesifik; dan perubahan v3.22 yang menyentuh elemen media hanya satu: `preload="metadata"` — tebakan penghematan yang sekarang **dibuang total** karena justru berisiko membuat pompa frame tidak pernah aktif untuk elemen yang tadinya tersembunyi lalu ditampilkan.

Dua perbaikan: **(1) elemen media kembali persis formula VidSplit/v3.21** yang terbukti gambarnya bergerak di mesin yang sama. **(2) PENGAWAS GERAK GAMBAR — penyembuh otomatis**: setiap 2 detik selagi memutar, aplikasi membandingkan `totalVideoFrames` (jumlah frame yang benar-benar disajikan) dengan majunya waktu. Frame diam PADAHAL waktu maju = pompa macet, dan tangga penyembuhan menyala: **kocok halus** (seek +0,05 detik — memicu dekode ulang satu frame, obat klasik untuk pompa yang tidur) → **nyalakan ulang visibilitas elemen** (kompositor dipasang ulang) → **jatuh ke jalur kanvas overlay** (gambar digambar manual tiap frame — mode darurat yang selalu tampak). Setiap kejadian dicatat ke log (`v3.23 GAMBAR BEKU …`) supaya kalau masih ada mesin yang bandel, log langsung memberi tahu di tangga mana masalahnya.

Pengawas ini diuji dengan "sandera" (counter frame dibuat diam sementara jam terus jalan): **6/6 lulus** — deteksi ±2 detik, seluruh tangga menyala berurutan, waktu tetap berjalan, dan **nol false-positive** saat pompa hidup normal (mesin lambat yang tetap memompa 2 fps tidak salah dipicu). Hasil akhir: aplikasi tidak ngestar saat impor (v3.22) DAN gambar pasti bergerak saat diputar (v3.23) — kalau pompa macet, aplikasi menyembuhkan dirinya dalam ±6 detik tanpa kamu melakukan apa pun.

''')
s = s.replace('## Yang Baru di v3.22.0', sec + '## Yang Baru di v3.22.0', 1)
open('KINOSTRA-PANDUAN.md', 'w').write(s)

s = open('renderer/index.html').read()
assert s.count('3.22.0') == 2, s.count('3.22.0')
open('renderer/index.html', 'w').write(s.replace('3.22.0', '3.23.0'))

print('bump v3.23.0 selesai — 6 file')
