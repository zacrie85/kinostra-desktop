#!/usr/bin/env python3
# bump v3.23.0 → v3.24.0 (6 file) + baris fitur README + bagian PANDUAN
import json, re

CHG = ("v3.24.0: DETEKTOR PIKSEL \u2014 GAMBAR BEKU MECANISME KEDUA TUMBANG \u2014 rekaman layar user membuktikan v3.23.0 terpasang, waktu berjalan, gambar beku total, TANPA toast penyembuh = pengawas v3.23 tak pernah menyala \u2192 di mesin user totalVideoFrames SELALU MAJU (decoder mengira bekerja) tapi piksel yang tersaji tak pernah berubah = PENYAJIAN MATI di lapisan video kompositor Windows (DirectComposition) \u2014 beda mekanisme dari pompa macet v3.23. "
 "FIX: detektor level piksel (video disampel ke kanvas 48x27 tiap 2 dtk; hash diam + fr maju + waktu maju = penyajian mati) bergabung dgn detektor pompa dalam satu tangga penyembuhan: kocok halus \u2192 visibilitas \u2192 jalur kanvas overlay; pilihan DIINGAT per mesin (localStorage 'kinostra.canvasPlay' \u2014 impor berikutnya pada sesi sama langsung kanvas; sesi baru mencoba native sekali); log kini memuat identitas GPU saat native aktif. "
 "Uji: detektor piksel dgn video adegan-diam nyata (fr 52\u2192360, piksel diam) 8/8 LULUS \u2014 deteksi \u00b22 dtk, tangga utuh 6 dtk, nol false-positive di video bergerak (frame-test 6/6) dan jalur pompa tetap utuh (sandera 6/6). ")

d = json.loads(open('package.json').read())
d['version'] = '3.24.0'
desc = d['description']
assert '\u00b7 v3.23.0:' in desc
d['description'] = desc.replace('\u00b7 v3.23.0:', '\u00b7 ' + CHG + '\u00b7 v3.23.0:', 1)
open('package.json', 'w').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

for f in ['build/installer.nsi', 'build/afterpack.js']:
    s = open(f).read()
    open(f, 'w').write(s.replace('3.23.0', '3.24.0'))

s = open('README.md').read()
s = s.replace('badge/version-3.23.0-amber', 'badge/version-3.24.0-amber', 1)
row67 = ('| 67 | **DETEKTOR PIKSEL** \u2b50v3.24.0 | '
 'Mekanisme beku kedua dari rekaman layar kawan: decoder maju tapi gambar tak pernah tersaji (penyajian mati di lapisan video Windows; detektor frame v3.23 buta kareno fr selalu maju). Kini pengawas menyampel video ke kanvas 48x27 tiap 2 dtk \u2014 piksel diam + fr maju = penyajian mati \u2192 tangga: kocok halus \u2192 visibilitas \u2192 jalur kanvas overlay; pilihan diingat per mesin; log memuat identitas GPU. Diuji dgn video adegan-diam nyata: 8/8 lulus, nol false-positive |\n')
m = re.search(r'^\| 66 \|.+\|\n', s, re.M)
assert m, 'baris 66 tak ketemu'
s = s[:m.end()] + row67 + s[m.end():]
open('README.md', 'w').write(s)

s = open('KINOSTRA-PANDUAN.md').read()
s = s.replace('# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.23.0', '# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.24.0', 1)
sec = ('''## Yang Baru di v3.24.0 — DETEKTOR PIKSEL: MEKANISME BEKU KEDUA TUMBANG

Rekaman layar yang kamu kirim (*"gambar tidak bergerak.mp4"*) adalah bukti detektif yang sempurna, kawan. Dari 4 frame rekaman 9 detik bisa dibaca: header menunjukkan **v3.23.0 sudah terpasang dengan benar**; waktu berjalan normal (`00:15.4 → 00:22.9`); gambar **identik piksel demi piksel** di semua frame; dan yang paling penting — **tidak ada toast penyembuh sama sekali**. Artinya pengawas v3.23 tidak pernah menyala di mesinmu: `totalVideoFrames` di mesinmu **selalu maju** (decoder yakin dia bekerja) padahal gambar yang tersaji tidak pernah berubah. Ini mekanisme KEDUA: **penyajian mati** — lapisan video kompositor Windows (DirectComposition) berhenti memperbarui gambar, sementara dekode, DOM, dan kanvas overlay tetap sehat (caption-mu tetap tergambar tajam di rekaman). VidSplit bergerak di mesin yang sama karena video-nya berdiri sendiri tanpa lapisan di atasnya.

v3.24 menambahkan **detektor level piksel**: setiap 2 detik selagi memutar, video disampel ke kanvas kecil 48×27 dan hash pikselnya dibandingkan. Kalau decoder maju (fr naik) tapi piksel diam dan waktu tetap berjalan — persis kondisi mesinmu — tangga penyembuhan menyala: **kocok halus** → **nyalakan ulang visibilitas** → **jatuh ke jalur kanvas overlay**, tempat gambar digambar manual dengan `drawImage` menjadi SATU lapisan komposit yang kebal bug lapisan video (caption ikut tergambar di kanvas). Pilihan penyembuhan **diingat per mesin**: impor berikutnya pada sesi yang sama langsung jalur kanvas tanpa menunggu beku; sesi baru tetap mencoba native sekali (driver bisa saja membaik). Log kini juga mencatat identitas GPU saat putaran native dimulai.

Diuji dengan **video adegan-diam nyata** (warna solid — decoder maju fr 52→360 sementara piksel tak pernah berubah): **8/8 lulus** — deteksi ±2 detik, tangga utuh dalam 6 detik, waktu tetap berjalan, nol false-positive di video bergerak normal (frame-test 6/6) dan jalur pompa-macet lama tetap utuh (sandera 6/6). Hasil akhir di mesinmu: putar film → bila penyajian beku, dalam ±6 detik aplikasi pindah sendiri ke jalur kanvas dan gambar bergerak; impor berikutnya tak pernah beku lagi.

''')
s = s.replace('## Yang Baru di v3.23.0', sec + '## Yang Baru di v3.23.0', 1)
open('KINOSTRA-PANDUAN.md', 'w').write(s)

s = open('renderer/index.html').read()
assert s.count('3.23.0') == 2, s.count('3.23.0')
open('renderer/index.html', 'w').write(s.replace('3.23.0', '3.24.0'))

print('bump v3.24.0 selesai — 6 file')
