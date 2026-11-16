#!/usr/bin/env python3
# bump v3.19.0 → v3.20.0 (6 file) + baris fitur README + bagian PANDUAN
import json, re

CHG = ("v3.20.0: PEMUTARAN RINGAN \u2014 akar 'hang saat diputar' film panjang (laporan user: video 4 jam, 5 video diimpor, "
 "play \u2192 hang \u2192 merestar; mode aman v3.19 pun belum menuntas) DITEMUKAN & DIMATIKAN: dulu video hanya terlihat lewat "
 "drawImage(video) ke kanvas SETIAP frame saat memutar (elemen video display:none) + latar blur 9:16 dirender ulang tiap 1,6 dtk + "
 "HUD menyapu seluruh baris part (film 4 jam = 480 part) tiap 80 ms \u2014 di GPU/driver lemah drawImage(video) menunggu sinkronisasi "
 "GPU yang sedang sibuk dekode \u2192 thread utama membeku \u2192 pelindung mengulang loop (MODE AMAN tak menolong karena komposit mati "
 "TIDAK mematikan raster kanvas). Kini saat memutar: JALUR NATIVE \u2014 elemen video asli ditampilkan di belakang kanvas overlay "
 "transparan (nol drawImage/video per frame; frame menuju kompositor langsung), gambar pratinjau dithrottle 15/24 fps, blur 9:16 "
 "tiap 8 dtk, sorot part O(1), thumbnail batch preload=metadata. Upaya terakhir: hang saat putar ke-2 DI MODE AMAN \u2192 "
 "MODE PUTARAN HEMAT permanen (pratinjau disederhanakan; pemutaran tak disentuh). Uji baru 32/32 (impor 5 video termasuk 4 jam; "
 "putar 47 dtk: nol beku >2,5 dtk \u2014 maks 26 ms, overlay 15 fps, heap 52 MB; jalur native aktif & turun saat pause; regresi "
 "pelindung v3.19: pulih #1 + MODE AMAN #2; mode aman \u00d72 hang \u2192 putaran hemat nyala permanen); regresi v3172 38/43 (versi-only). ")

# 1. package.json
d = json.loads(open('package.json').read())
d['version'] = '3.20.0'
desc = d['description']
assert 'v3.19.0:' in desc
d['description'] = desc.replace('KINOSTRA \u2014 Suite Video Otonom \u00b7 Desktop 100% Offline \u00b7 v3.19.0:', 'KINOSTRA \u2014 Suite Video Otonom \u00b7 Desktop 100% Offline \u00b7 ' + CHG + '\u00b7 v3.19.0:', 1)
open('package.json', 'w').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

# 2-3. nsi + afterpack: ganti buta
for f in ['build/installer.nsi', 'build/afterpack.js']:
    s = open(f).read()
    open(f, 'w').write(s.replace('3.19.0', '3.20.0'))

# 4. README: badge + baris fitur baru (sisip SETELAH baris 62)
s = open('README.md').read()
s = s.replace('badge/version-3.19.0-amber', 'badge/version-3.20.0-amber', 1)
row63 = ('| 63 | **PEMUTARAN RINGAN** \u2b50v3.20.0 | '
 'Akar "hang saat diputar" film panjang (video 4 jam, 5 video) ditemukan: video hanya terlihat lewat `drawImage(video)` ke kanvas **setiap frame** saat memutar \u2014 di GPU lemah, panggilan itu menunggu sinkronisasi GPU yang sedang sibuk dekode \u2192 thread utama beku \u2192 pelindung mengulang loop. Kini saat memutar video tampil **native** (elemen video asli di belakang kanvas overlay transparan \u2014 nol drawImage per frame), pratinjau dithrottle 15/24 fps, blur 9:16 per 8 dtk, sorot part O(1); **hang ke-2 di mode aman \u2192 MODE PUTARAN HEMAT permanen** |\n')
m = re.search(r'^\| 62 \|.+\|\n', s, re.M)
assert m, 'baris 62 tak ketemu'
s = s[:m.end()] + row63 + s[m.end():]
open('README.md', 'w').write(s)

# 5. PANDUAN: judul + bagian Yang Baru v3.20.0 (di atas bagian v3.19.0)
s = open('KINOSTRA-PANDUAN.md').read()
s = s.replace('# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.19.0', '# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.20.0', 1)
sec = ('''## Yang Baru di v3.20.0 — PEMUTARAN RINGAN

Laporan dari v3.19: *"masih tidak bisa — saat videonya di play aplikasi hang dan kemudian merestar; videonya durasi 4 jam; aku memasukan sebanyak 5 video"*. Kali ini akarnya benar-benar ditemukan, bukan sekadar dipulihkan.

Selama ini **video tidak pernah tampil lewat elemen videonya sendiri** — elemen itu disembunyikan total, dan satu-satunya cara video terlihat adalah `drawImage(video)` ke kanvas pratinjau 1600×900 **setiap frame** (60× per detik) selagi diputar. Di GPU/driver yang lemah, panggilan itu harus menunggu sinkronisasi dengan GPU yang justru sedang sibuk men-decode film 4 jam → thread utama membeku → pelindung mematikan & memuat ulang jendela (terlihat "ngestart sendiri"). MODE AMAN v3.19 mematikan komposit GPU, tetapi raster kanvas tetap lewat jalur yang sama — makanya loop masih bisa berulang.

v3.20 memindahkan pemutaran ke **jalur native**: saat video diputar, elemen videonya sendiri ditampilkan di belakang kanvas, dan kanvas hanya menggambar teks/hiasan transparan. Frame video menuju layar lewat jalur kompositor bawaan browser — **tanpa satu pun drawImage per frame**. Gambar pratinjau saat memutar dibatasi 15 fps (jalur kanvas 24 fps), latar blur 9:16 di-refresh tiap 8 detik (dari 1,6), sorotan part di timeline kini O(1) (film 4 jam = 480 part tidak lagi disapu tiap 80 ms), dan thumbnail kotak video tidak lagi mem-buffer film penuh. Efek khusus (zoom, ken burns, filter warna, frame bertema, zoom pembicara, transisi) otomatis kembali ke jalur kanvas — kualitas ekspor tidak berubah sama sekali. Bila mesin tertentu tetap kewalahan sampai ke mode aman (hang saat putar ke-2), aplikasi menyalakan **MODE PUTARAN HEMAT permanen**: pratinjau disederhanakan, pemutaran audio/video tidak disentuh.

''')
s = s.replace('## Yang Baru di v3.19.0', sec + '## Yang Baru di v3.19.0', 1)
open('KINOSTRA-PANDUAN.md', 'w').write(s)

# 6. index.html: boot + header
s = open('renderer/index.html').read()
assert s.count('3.19.0') == 2, s.count('3.19.0')
open('renderer/index.html', 'w').write(s.replace('3.19.0', '3.20.0'))

print('bump v3.20.0 selesai')
for f in ['package.json', 'build/installer.nsi', 'build/afterpack.js', 'README.md', 'KINOSTRA-PANDUAN.md', 'renderer/index.html']:
    c = open(f).read()
    print(f, c.count('3.20.0'), 'titik baru;', c.count('3.19.0'), 'sisa 3.19.0')
