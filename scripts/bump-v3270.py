#!/usr/bin/env python3
# bump v3.26.1 → v3.27.0 (6 file) + baris README + PANDUAN modul 03 + bagian baru
import json, re

CHG = ("v3.27.0: UPGRADE MODUL 03 JUDUL & PART OTOMATIS — (1) UKURAN TULISAN PART kini 10%\u2013250% "
 "(dulu minimal 50%; permintaan kawan: bisa kecil sampai 10%) dan (2) WARNA TULISAN PART bebas dipilih "
 "(pemilih warna baru di modul 03; berlaku utk bumper intro & label pojok DI DALAM VIDEO; garis hias & "
 "sub-info tetap gaya bawaan; tombol OTOMATIS kembali ke putih gading #F2F0EA). Keduanya ikut tersimpan di "
 "preset, terbawa di tanda overlay native (gambar-ulang otomatis saat berubah), dan pratinjau = ekspor persis "
 "(satu mesin gambar). Uji BARU 12/12 (slider min 0.1, warna merah + label + OTOMATIS, pixel-diff intro/pojok "
 "10% vs 100%, garis hias tetap amber, preset roundtrip, overlay sig, ekspor nyata 1 part 10% + merah); "
 "regresi: v314 22/22 (aseri versi dibuat agnostik + kontrak slider kini 0.1), maintenance 14/14, frame 6/6, "
 "overlay 6/6, ekspor v3.26.1 7/7; v316 22/24 (2 gagal = flake muat seksi E lama \u2014 probe terisolasi "
 "lulus, sudah ada sebelum perubahan). Bump 6 file")

d = json.loads(open('package.json').read())
d['version'] = '3.27.0'
assert '\u00b7 v3.26.1:' in d['description']
d['description'] = d['description'].replace('\u00b7 v3.26.1:', '\u00b7 ' + CHG + '\u00b7 v3.26.1:', 1)
open('package.json', 'w').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

for f in ['build/installer.nsi', 'build/afterpack.js']:
    s = open(f).read()
    open(f, 'w').write(s.replace('3.26.1', '3.27.0'))

s = open('README.md').read()
s = s.replace('badge/version-3.26.1-amber', 'badge/version-3.27.0-amber', 1)
row71 = ('| 71 | **UKURAN 10% & WARNA TULISAN PART** \u2b50v3.27.0 | '
 'Modul 03: tulisan PART/EPISODE di video kini bisa kecil sampai 10% (dulu minimal 50%) dan WARNANYA bebas '
 'dipilih (pemilih warna + tombol OTOMATIS); berlaku intro & pojok, ikut preset, pratinjau = ekspor persis |\n')
m = re.search(r'^\| 70 \|.+\|\n', s, re.M)
assert m, 'baris 70 tak ketemu'
s = s[:m.end()] + row71 + s[m.end():]
open('README.md', 'w').write(s)

s = open('KINOSTRA-PANDUAN.md').read()
s = s.replace('# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.26.1', '# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.27.0', 1)
old3 = '**UKURAN TULISAN PART 50%\u2013250% (v3.14)**'
new3 = '**UKURAN TULISAN PART 10%\u2013250% (v3.27; dulu v3.14 50%\u2013250%) + WARNA TULISAN PART bebas (v3.27)**'
assert old3 in s
s = s.replace(old3, new3, 1)
sec = ('''## Yang Baru di v3.27.0 — MODUL 03: TULISAN PART BISA 10% & WARNANYA BEBAS

Permintaan kawan di modul **03 JUDUL & PART OTOMATIS** dua-duanya sudah jadi:

1. **Ukuran tulisan part sampai 10%.** Slider UKURAN TULISAN PART DI VIDEO kini menjangkau **10%–250%** (dulu terhenti di 50%). Tulisan PART/EPISODE/EPS/BAGIAN di dalam video — baik bumper intro maupun label pojok — mengecil proporsional: garis hias, sub-info & animasi masuk ikut terskala, jadi hasilnya tetap rapi walau teksnya sangat kecil.
2. **Warna tulisan part bebas dipilih.** Ada pemilih warna baru (kotak warna + tombol **OTOMATIS**). Berlaku untuk tulisan part di bumper intro dan label pojok; garis hias & sub-info tetap memakai gaya bawaan supaya identitas visual aman. OTOMATIS = putih gading seperti sebelumnya.

Keduanya: ikut tersimpan di **preset** (buka di pekerjaan lain = langsung sama), memicu gambar-ulang overlay native saat berubah, dan pratinjau = hasil ekspor persis karena memakai satu mesin gambar. Diuji 12/12 (pixel-diff ukuran & warna di kedua mode, preset, ekspor nyata 1 part dgn 10% + merah) + seluruh regresi lama.

''')
s = s.replace('## Yang Baru di v3.26.1', sec + '## Yang Baru di v3.26.1', 1)
open('KINOSTRA-PANDUAN.md', 'w').write(s)

s = open('renderer/index.html').read()
assert s.count('3.26.1') == 2, s.count('3.26.1')
open('renderer/index.html', 'w').write(s.replace('3.26.1', '3.27.0'))

print('bump v3.27.0 selesai \u2014 6 file')
