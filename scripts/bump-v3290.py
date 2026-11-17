#!/usr/bin/env python3
# bump v3.28.0 → v3.29.0 (6 file) + baris README 73 + PANDUAN bagian baru
import json, re

CHG = ("v3.29.0: TRANSPLANTASI PROSES EXPORT & SPLIT DARI v3.16.0 (permintaan user \u2014 versi "
 "yang hasil ekspor & split-nya terbukti bagus) \u2014 FIX 'Gagal ekspor: encoding audio' + ULANGI-SW "
 "saat MERENDER 71 PART \u00b7 PARALEL 5\u00d7: akar bug = sejak v3.17.1 tiap blok audio men-decode per "
 "jendela lewat decodeAudioWindow; dgn PARALEL 5\u00d7 para worker berebut decoder single-flight "
 "(_audioWinBusy, tunggu max 5 dtk lalu decode bersamaan) \u2192 janji decode menggantung \u2192 watchdog "
 "5 menit 'encoding audio macet'. Kini semantik v3.16 dipulihkan di sisi ekspor: renderMix hanya "
 "MEMBACA state.audioBuffer penuh (blok v3.16.0 verbatim) + ensureExportAudio: buffer "
 "[0..rentang ekspor+300 dtk] dibangun SEKALI berurutan SEBELUM worker pertama jalan (bertahap "
 "per jendela via demux AAC \u2014 TANPA ArrayBuffer \u00b12 GB & tanpa decode utuh saat impor, jadi "
 "bebas layar hitam v3.16 di film 3-4 jam; impor & analisis peaks/zoom pembicara tak tersentuh; "
 "POTONG LANGSUNG tidak lewat jalur ini) + GABUNG VIDEO menyiapkan buffer per film. Uji BARU 7/7 "
 "(impor panjang tanpa buffer, ekspor PARALEL 5\u00d7 > jumlah part tanpa 'audio macet', buffer "
 "tersisa \u2265500 dtk, UI 'menyiapkan audio penuh', 2 part \u2192 stream AAC & mean_volume > -55 dB); "
 "regresi: modul16 14/14, ekspor anti-beku 7/7, v327 12/12, v314 22/22, v328 11/11, frame 6/6, "
 "overlay 6/6, v316 22/24 (flake seksi E lama \u2014 terdokumentasi). Bump 6 file")

d = json.loads(open('package.json').read())
d['version'] = '3.29.0'
assert 'v3.28.0:' in d['description']
d['description'] = d['description'].replace('\u00b7 v3.28.0:', '\u00b7 ' + CHG + '\u00b7 v3.28.0:', 1)
open('package.json', 'w').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

for f in ['build/installer.nsi', 'build/afterpack.js']:
    s = open(f).read()
    open(f, 'w').write(s.replace('3.28.0', '3.29.0'))

s = open('README.md').read()
s = s.replace('badge/version-3.28.0-amber', 'badge/version-3.29.0-amber', 1)
row73 = ('| 73 | **EKSPOR & SPLIT = PROSES v3.16.0** \u2b50v3.29.0 | '
 'FIX "Gagal ekspor: encoding audio" / ULANGI-SW saat PARALEL: audio penuh disiapkan SEKALI '
 'sebelum render (semantik v3.16, tanpa decode utuh saat impor) \u2014 PARALEL berapa pun aman |\n')
m = re.search(r'^\| 72 \|.+\|\n', s, re.M)
assert m, 'baris 72 tak ketemu'
s = s[:m.end()] + row73 + s[m.end():]
open('README.md', 'w').write(s)

s = open('KINOSTRA-PANDUAN.md').read()
s = s.replace('# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.28.0', '# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.29.0', 1)
sec = ('''## Yang Baru di v3.29.0 — EKSPOR & SPLIT KEMBALI KE PROSES v3.16.0 (FIX "encoding audio")

Sesuai permintaan kawan, proses **EXPORT & SPLIT** ditransplantasi dari **KINOSTRA v3.16.0** — versi yang hasil ekspor & split-nya terbukti bagus. Ini memperbaiki kasus "MERENDER 71 PART · PARALEL 5× … (ULANGI-SW) … Gagal ekspor: encoding audio".

Akar masalahnya: sejak v3.17.1 audio film panjang di-decode per jendela SAAT render; dengan PARALEL 5× para pekerja berebut satu decoder audio (tunggu maks 5 detik lalu men-decode bersamaan) → proses decode menggantung → dijaga jam 5 menit → "encoding audio macet" → part diulang (ULANGI-SW) → ekspor gagal.

Sekarang (semantik v3.16, dengan perbaikan RAM):
1. **Audio disiapkan SEKALI sebelum render dimulai** — satu AudioBuffer penuh dari awal sampai batas rentang ekspor; semua pekerja hanya MEMBACA buffer yang sama, PARALEL berapa pun tidak lagi berebut decoder.
2. **Impor tidak berubah** — buffer dibangun bertahap per jendela (tanpa ArrayBuffer ±2 GB dan tanpa decode utuh saat impor), jadi bebas layar hitam/crash v3.16 di film 3-4 jam; garis gelombang & zoom pembicara tetap jalan seperti sebelumnya.
3. **POTONG LANGSUNG tak tersentuh** (sampel audio disalin langsung) dan **GABUNG VIDEO** juga menyiapkan buffer per film.

Diuji 7/7 (ekspor PARALEL 5× dengan part bersamaan — tanpa "audio macet", audio hasil TIDAK senyap) + seluruh regresi lama hijau.

''')
s = s.replace('## Yang Baru di v3.28.0', sec + '## Yang Baru di v3.28.0', 1)
open('KINOSTRA-PANDUAN.md', 'w').write(s)

s = open('renderer/index.html').read()
assert s.count('3.28.0') == 2, s.count('3.28.0')
open('renderer/index.html', 'w').write(s.replace('3.28.0', '3.29.0'))

print('bump v3.29.0 selesai \u2014 6 file')
