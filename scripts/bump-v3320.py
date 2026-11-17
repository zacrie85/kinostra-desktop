#!/usr/bin/env python3
# bump v3.31.0 → v3.32.0 (6 file) + baris README 76 + PANDUAN bagian baru
import json, re

CHG = ("v3.32.0: GERBANG SUARA + AUDIO FILM UTUH BERSEGMENT — laporan user v3.31 dgn "
 "screenshot 'Audio film terlalu besar untuk decode penuh' membuka akar sebenarnya "
 "kenapa EKSPOR FILM UTUH selalu tanpa suara: jalur demux v3.30 mencoba membuat SATU "
 "AudioBuffer sepanjang rentang ekspor — film 3,5 jam (71 part × 183 dtk) = ±4,9 GB → "
 "alokasi gagal di mesin RAM 4-8 GB → pelindung RAM jalur 2 juga menolak → ekspor jalan "
 "TANPA track audio (ekspor sebagian part selalu lolos uji, ekspor penuh tidak pernah "
 "dites). Kini: buffer penuh hanya utk rentang ≤ ±43 menit (1 GB); di atas itu mode "
 "SEGMENT — renderMix mengambil audio per segmen 180 dtk dari antrian decode berurutan "
 "(satu decoder pada satu waktu, bebas rebutan v3.17), cache LRU 8 segmen (±550 MB) → "
 "suara asli ikut di SEMUA part berapa pun panjang filmnya. GERBANG SUARA: pemindai "
 "senyap kini menyala SEJAK IMPOR utk film panjang (dari jendela analisis, koreksi "
 "otomatis bila ada suara di jendela berikutnya); sebelum ekspor muncul konfirmasi "
 "'AUDIO ASLI VIDEO SENYAP' dgn tombol MUSIK OTOMATIS sekali klik (skor prosedural "
 "dibatasi 300 dtk agar tak menabrak RAM di film panjang — renderMix me-loop-nya) / "
 "tetap ekspor / batal; POTONG LANGSUNG diberi peringatan senyap tanpa opsi musik; "
 "puncak campuran diukur per blok tiap part (GERBANG SUARA FINAL) → part hening "
 "ditandai; modal hasil kini menampilkan STATUS SUARA (BERNADA asli/musik atau ⚠ "
 "HENING + solusi) per part + versi KINOSTRA. Uji BARU v332 (film utuh 66 mnt senyap: "
 "deteksi sejak impor, gerbang muncul, MUSIK OTOMATIS → hasil bernada > −55 dB; film "
 "utuh 66 mnt bernada rentang akhir 3.600 dtk: suara ASLI ikut via SEGMENT, tanpa "
 "gerbang; rentang kecil tetap jalur monolitik v3.30) + regresi lama. Bump 6 file")

d = json.loads(open('package.json').read())
d['version'] = '3.32.0'
assert 'v3.31.0:' in d['description']
d['description'] = d['description'].replace('\u00b7 v3.31.0:', '\u00b7 ' + CHG + '\u00b7 v3.31.0:', 1)
open('package.json', 'w').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

for f in ['build/installer.nsi', 'build/afterpack.js']:
    s = open(f).read()
    open(f, 'w').write(s.replace('3.31.0', '3.32.0'))

s = open('README.md').read()
s = s.replace('badge/version-3.31.0-amber', 'badge/version-3.32.0-amber', 1)
row76 = ('| 76 | **GERBANG SUARA + AUDIO FILM UTUH** \u2b50v3.32.0 | ekspor film utuh 3-4 jam '
 'kini selalu bersuara (audio bersegmen, RAM terkendali) \u00b7 konfirmasi pra-ekspor dgn '
 'MUSIK OTOMATIS sekali klik \u00b7 status suara di modal hasil |\n')
m = re.search(r'^\| 75 \|.+\|\n', s, re.M)
assert m, 'baris 75 tak ketemu'
s = s[:m.end()] + row76 + s[m.end():]
open('README.md', 'w').write(s)

s = open('KINOSTRA-PANDUAN.md').read()
s = s.replace('# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.31.0', '# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.32.0', 1)
sec = ('''## Yang Baru di v3.32.0 — GERBANG SUARA & AUDIO FILM UTUH (akar "film utuh tanpa suara")

Tangkapan layar kawan di v3.31 memperlihatkan keterangan: **"Audio film terlalu besar untuk decode penuh — ekspor lanjut tanpa suara asli"**. Itulah akar sebenarnya kenapa **ekspor film utuh** selalu tanpa suara: untuk film 3-4 jam, aplikasi mencoba menyiapkan SELURUH audio film sebagai satu buffer memori (film 3,5 jam = ±4,9 GB) — alokasi itu gagal di kebanyakan mesin, lalu ekspor berjalan **tanpa track audio**. Ekspor sebagian part tidak pernah kena karena rentangnya kecil; ekspor penuh (mis. 71 part) selalu kena. Video pendek/normal tidak pernah kena karena decode-nya kecil — persis laporan "video lain bisa, khusus video ini tidak".

**Kini audio ekspor BERSEGMENT — RAM selalu terkendali berapa pun panjang film:**
- Audio disiapkan per segmen 180 detik sesuai kebutuhan tiap part (cache ±8 segmen, ±550 MB) — suara asli ikut di SEMUA part, dari awal sampai akhir film.
- Rentang ekspor kecil tetap memakai jalur buffer penuh v3.30 yang terbukti.

**GERBANG SUARA — kawan tidak akan lagi mendapat file senyap tanpa penjelasan:**
- Deteksi sumber hening kini menyala **sejak impor** juga untuk film panjang (dulu baru saat ekspor), dengan koreksi otomatis bila ternyata ada suara di bagian lain film.
- Sebelum ekspor, bila sumber senyap & tanpa musik: muncul konfirmasi **"AUDIO ASLI VIDEO SENYAP"** dengan tombol **🎵 PAKAI MUSIK OTOMATIS & EKSPOR** — sekali klik, skor musik disusun otomatis (dibatasi 300 detik, diputar berulang, aman di RAM) dan seluruh hasil ekspor/split bernada. Bisa juga memilih "TETAP EKSPOR (HENING)" atau "BATAL".
- POTONG LANGSUNG ikut diberi peringatan (audio asli disalin apa adanya — sumber senyap → hasil senyap).
- Setiap part dievaluasi puncak audionya saat dirender: part hening ditandai, dan **modal hasil kini menampilkan STATUS SUARA** (SUARA: BERNADA (audio asli) / BERNADA (musik) / ⚠ HENING + cara memperbaiki) beserta versi KINOSTRA di setiap laporan.

''')
s = s.replace('## Yang Baru di v3.31.0', sec + '## Yang Baru di v3.31.0', 1)
open('KINOSTRA-PANDUAN.md', 'w').write(s)

s = open('renderer/index.html').read()
assert s.count('3.31.0') == 2, s.count('3.31.0')
open('renderer/index.html', 'w').write(s.replace('3.31.0', '3.32.0'))

print('bump v3.32.0 selesai — 6 file')
