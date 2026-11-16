#!/usr/bin/env python3
# bump v3.18.0 → v3.19.0 (6 file) + baris fitur README + bagian PANDUAN
import json, re

CHG = ("v3.19.0: PELINDUNG PUTAR \u2014 jawaban laporan 'begitu video di import dan di play aplikasi langsung hang, blank dan ngerestar sendiri': "
 "pemulihan otomatis v3.18 BEKERJA (hang \u2192 dipulihkan \u2192 terlihat 'ngestart sendiri'), tetapi bila penyebabnya GPU/driver lemah yang beku persis SAAT MEMUTAR, pemulihan biasa hanya mengulang loop yang sama. "
 "Kini status memutar dilaporkan ke pelindung (renderer \u2192 main via hb:play); crash/hang yang terjadi ketika video diputar dicatat terpisah di log ('HANG SAAT PUTAR' / 'PELINDUNG PUTAR \u2014 kejadian saat memutar ke-N'); "
 "kejadian ke-2 dalam 15 menit \u2192 aplikasi menyalakan ulang DIRINYA dalam MODE AMAN (komposit GPU dimatikan \u2014 penyebab beku/blank di GPU lemah; kecepatan render hardware tetap): pengguna melihat restart paling banyak 1 kali lalu pemutaran stabil, bukan mengulang terus. "
 "Uji baru 13/13 (siklus hang-saat-putar #1 \u2192 pulih biasa; siklus #2 \u2192 instance baru hidup dalam MODE AMAN dgn shieldStatus.safeMode=true; impor sehat dalam mode aman). ")

# 1. package.json
d = json.loads(open('package.json').read())
d['version'] = '3.19.0'
desc = d['description']
assert 'v3.18.0:' in desc
d['description'] = desc.replace('KINOSTRA \u2014 Suite Video Otonom \u00b7 Desktop 100% Offline \u00b7 v3.18.0:', 'KINOSTRA \u2014 Suite Video Otonom \u00b7 Desktop 100% Offline \u00b7 ' + CHG + '\u00b7 v3.18.0:', 1)
open('package.json', 'w').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

# 2-3. nsi + afterpack: ganti buta
for f in ['build/installer.nsi', 'build/afterpack.js']:
    s = open(f).read()
    open(f, 'w').write(s.replace('3.18.0', '3.19.0'))

# 4. README: badge + baris fitur baru (sisip SETELAH baris 61)
s = open('README.md').read()
s = s.replace('badge/version-3.18.0-amber', 'badge/version-3.19.0-amber', 1)
row62 = ('| 62 | **PELINDUNG PUTAR** \u2b50v3.19.0 | '
 'Jawaban atas "begitu video di import dan di play aplikasi langsung hang, blank dan ngerestar sendiri": pemulihan otomatis v3.18 bekerja, tetapi bila penyebabnya GPU lemah yang beku persis saat MEMUTAR, pemulihan biasa mengulang loop yang sama. Kini status memutar dilaporkan ke pelindung; crash/hang saat memutar dicatat terpisah di log; **kejadian ke-2 dalam 15 menit \u2192 MODE AMAN otomatis** (komposit GPU dimatikan, kecepatan render hardware tetap) \u2014 restart terlihat paling banyak 1 kali, lalu pemutaran stabil |\n')
m = re.search(r'^\| 61 \|.+\|\n', s, re.M)
assert m, 'baris 61 tak ketemu'
s = s[:m.end()] + row62 + s[m.end():]
open('README.md', 'w').write(s)

# 5. PANDUAN: judul + bagian Yang Baru v3.19.0 (di atas bagian v3.18.0)
s = open('KINOSTRA-PANDUAN.md').read()
s = s.replace('# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.18.0', '# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.19.0', 1)
sec = ('''## Yang Baru di v3.19.0 — PELINDUNG PUTAR

Laporan dari v3.18: "begitu video di import dan di play aplikasi langsung hang, blank dan ngerestar sendiri". Yang terlihat itu sebenarnya pelindung bekerja — hang terdeteksi, jendela dipulihkan (tampak seperti aplikasi merestar sendiri). Tapi kalau penyebabnya GPU atau driver yang lemah dan beku justru ketika video diputar, pemulihan biasa hanya memutar kembali loop yang sama: putar → beku → pulih → putar lagi → beku lagi.

v3.19 memutus lingkaran itu. Status memutar kini dilaporkan dari renderer ke pelindung (kanal `hb:play`). Crash atau hang yang terjadi **ketika video sedang diputar** dicatat terpisah di log (`HANG SAAT PUTAR`, `PELINDUNG PUTAR — kejadian saat memutar ke-N`). Kejadian pertama tetap dipulihkan biasa; **kejadian kedua dalam 15 menit** membuat aplikasi menyalakan ulang dirinya dalam **MODE AMAN** — komposit GPU dimatikan (penyebab beku/blank di GPU lemah) sementara kecepatan render hardware tetap. Dari sisi pengguna: restart terlihat **paling banyak satu kali**, lalu pemutaran berjalan stabil. Status MODE AMAN tetap terlihat di modul 16 PERAWATAN, dan tombol MODE AMAN SEKARANG kini memakai mekanisme yang sama.

''')
s = s.replace('## Yang Baru di v3.18.0', sec + '## Yang Baru di v3.18.0', 1)
open('KINOSTRA-PANDUAN.md', 'w').write(s)

# 6. index.html: boot + header
s = open('renderer/index.html').read()
assert s.count('3.18.0') == 2
open('renderer/index.html', 'w').write(s.replace('3.18.0', '3.19.0'))

print('bump v3.19.0 selesai')
for f in ['package.json', 'build/installer.nsi', 'build/afterpack.js', 'README.md', 'KINOSTRA-PANDUAN.md', 'renderer/index.html']:
    c = open(f).read()
    print(f, c.count('3.19.0'), 'titik baru;', c.count('3.18.0'), 'sisa 3.18.0')
