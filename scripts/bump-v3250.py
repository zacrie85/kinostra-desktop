#!/usr/bin/env python3
# bump v3.24.0 → v3.25.0 (6 file) + baris fitur README + bagian PANDUAN
import json, re

CHG = ("v3.25.0: JALUR VIDSPLIT \u2014 AKAR GAMBAR BEKU DIBEDAH SEBENARNYA \u2014 selama ini kanvas overlay DI ATAS elemen video digambar ulang 15x/dtk WALAU isinya tidak berubah \u2192 setiap gambar ulang meng-invalidate region di atas video \u2192 lapisan video tak pernah naik ke hardware overlay kompositor Windows \u2192 gambar beku di GPU/driver tertentu (VidSplit bergerak di mesin yang sama karena video-nya berdiri sendiri tanpa lapisan di atasnya). "
 "FIX: saat memutar native, overlay digambar HANYA saat isinya berubah (ganti part, ganti subtitel, pengeditan setelan, resize) \u2014 uji: 3 gambar dalam 9 dtk putar (dulu \u00b1135); animasi masuk part/judul dirender ke keadaan akhir di pratinjau native (ekspor tetap beranimasi penuh); grain/frame-neon-berputar/judul-neon \u2192 jalur kanvas (memang butuh kanvas per frame). "
 "PLUS PENGAWAS LAYAR sejati: capturePage dari main process meng-hash piksel jendela yang BENAR-BENAR tersaji (region pita tengah, tiap 5 dtk) \u2014 detektor yang tak bisa dibohongi decoder/drawImage \u2014 bergabung dgn detektor pompa & piksel dlm satu tangga: kocok halus + latar blur dibekukan \u2192 visibilitas \u2192 jalur kanvas (diingat per mesin). "
 "Uji: overlay-statik 6/6, nol false-fire pengawas layar di video bergerak, frame-test 6/6, sandera pompa 6/6, piksel 8/8, regresi v3.21 32/33 (versi-only). ")

d = json.loads(open('package.json').read())
d['version'] = '3.25.0'
desc = d['description']
assert '\u00b7 v3.24.0:' in desc
d['description'] = desc.replace('\u00b7 v3.24.0:', '\u00b7 ' + CHG + '\u00b7 v3.24.0:', 1)
open('package.json', 'w').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

for f in ['build/installer.nsi', 'build/afterpack.js']:
    s = open(f).read()
    open(f, 'w').write(s.replace('3.24.0', '3.25.0'))

s = open('README.md').read()
s = s.replace('badge/version-3.24.0-amber', 'badge/version-3.25.0-amber', 1)
row68 = ('| 68 | **JALUR VIDSPLIT** \u2b50v3.25.0 | '
 'Akar beku dibedah sebenarnya: kanvas overlay di atas video digambar ulang 15x/dtk walau statik \u2192 lapisan video tak pernah naik ke hardware overlay Windows \u2192 beku. Kini overlay native digambar HANYA saat isi berubah (uji: 3 gambar/9 dtk, dulu \u00b1135) \u2014 video berdiri sendiri persis VidSplit. Plus PENGAWAS LAYAR capturePage (hash piksel jendela sejati) + tangga penyembuhan bersama |\n')
m = re.search(r'^\| 67 \|.+\|\n', s, re.M)
assert m, 'baris 67 tak ketemu'
s = s[:m.end()] + row68 + s[m.end():]
open('README.md', 'w').write(s)

s = open('KINOSTRA-PANDUAN.md').read()
s = s.replace('# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.24.0', '# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.25.0', 1)
sec = ('''## Yang Baru di v3.25.0 — JALUR VIDSPLIT: AKAR GAMBAR BEKU DIBEDAH SEBENARNYA

Permintaanmu kemarin — *"lihat VidSplit sebagai referensi"* — adalah petunjuk yang tepat sasaran, kawan. VidSplit bergerak di mesin yang sama karena video-nya **berdiri sendiri**: tidak ada apa pun di atasnya. KINOSTRA selama ini menaruh **kanvas overlay di atas elemen video** dan menggambar ulangnya **15× per detik walau isinya tidak berubah** (label part & judul memang statis sepanjang part). Setiap gambar ulang meng-invalidate region di atas video di kompositor Windows — akibatnya lapisan video **tidak pernah naik ke hardware overlay**, dan di GPU/driver sepertimu gambar video berhenti tersaji: waktu jalan, decoder "bekerja", gambar beku. Persis rekamanmu.

v3.25 membedah dan membuang akar itu: **saat memutar native, overlay kini digambar HANYA saat isinya benar-benar berubah** — ganti part, ganti subtitel, pengeditan setelan, perubahan ukuran. Hasil uji: **3 gambar dalam 9 detik putar** (dulu ±135). Video berdiri sendiri persis VidSplit. Animasi masuk part/judul dirender langsung ke keadaan akhir di pratinjau native (ekspor tetap beranimasi penuh), dan efek yang memang butuh kanvas per frame (grain, frame neon berputar, judul neon berkedip) otomatis pindah ke jalur kanvas.

Plus: **PENGAWAS LAYAR sejati** — main process kini meng-capture piksel jendela yang benar-benar tersaji (`capturePage`, pita tengah area putar, tiap 5 detik) dan meng-hash-nya. Detektor ini **tidak bisa dibohongi** decoder maupun `drawImage` — kalau piksel jendela diam padahal waktu berjalan, itu beku sesungguhnya, apa pun mekanismenya. Ketiga detektor (pompa, piksel, layar) kini berbagi satu tangga: **kocok halus + latar blur dibekukan** → **visibilitas dinyalakan ulang** → **jalur kanvas** (diingat per mesin).

Diuji: overlay-statik **6/6**, pengawas layar **nol false-fire** di video bergerak (12 dtk putar penuh), frame-test **6/6**, sandera pompa **6/6**, piksel **8/8**, regresi v3.21 **32/33** (sisa = asersi versi).

''')
s = s.replace('## Yang Baru di v3.24.0', sec + '## Yang Baru di v3.24.0', 1)
open('KINOSTRA-PANDUAN.md', 'w').write(s)

s = open('renderer/index.html').read()
assert s.count('3.24.0') == 2, s.count('3.24.0')
open('renderer/index.html', 'w').write(s.replace('3.24.0', '3.25.0'))

print('bump v3.25.0 selesai — 6 file')
