#!/usr/bin/env python3
# bump v3.17.2 → v3.18.0 (6 file) + baris fitur README + bagian PANDUAN
import json, re

CHG = ("v3.18.0: WATCHDOG HANG DETAK JANTUNG + ANALISIS 2,5\u00d7 LEBIH CEPAT \u2014 "
 "(1) hang beku (jendela macet tapi proses tak mati \u2014 tak tertangani pemulihan lama karena event 'unresponsive' tak selalu menyala; terbukti di uji: hang 15 dtk pulih tanpa event) kini terdeteksi lewat DETAK JANTUNG: preload mengirim detak tiap 3 dtk, hilang >12 dtk = hang \u2192 renderer dipulihkan PAKSA (crash terkendali) \u2192 jendela dimuat ulang otomatis lewat jalur SHIELD; handler 'unresponsive' juga kini memulihkan paksa bila masih macet 1,5 dtk; "
 "(2) JEJAK DIAGNOSTIK permanen di log crash: impor (nama \u00b7 durasi), jalur audio (decode penuh / mode JENDELA hemat RAM), putar (maks 1\u00d7/30 dtk), ekspor & batch \u2014 konteks persis tersimpan bila bermasalah; "
 "(3) JENDELA ADAPTIF: film >60 mnt dianalisis per jendela 120 dtk (bukan 45) \u2192 film 188 mnt = 94 jendela bukan 250, analisis \u00b12,5\u00d7 lebih cepat, RAM puncak tetap 1 jendela (\u00b146 MB), film \u226460 mnt persis v3.17.1. "
 "Uji baru 15/15 (hang 30 dtk \u2192 pulih otomatis + HANG/RENDER MATI/pemulihan tercatat; jejak impor/putar/audio di log; pulih-lalu-impor-lagi sukses; film 120 mnt: tanpa decode utuh, peaks tumbuh 0\u2192934/1400 <20 dtk, RMS terukur). ")

# 1. package.json
d = json.loads(open('package.json').read())
d['version'] = '3.18.0'
desc = d['description']
assert 'v3.17.2:' in desc
d['description'] = desc.replace('KINOSTRA \u2014 Suite Video Otonom \u00b7 Desktop 100% Offline \u00b7 v3.17.2:', 'KINOSTRA \u2014 Suite Video Otonom \u00b7 Desktop 100% Offline \u00b7 ' + CHG + '\u00b7 v3.17.2:', 1)
open('package.json', 'w').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

# 2-3. nsi + afterpack: ganti buta
for f in ['build/installer.nsi', 'build/afterpack.js']:
    s = open(f).read()
    open(f, 'w').write(s.replace('3.17.2', '3.18.0'))

# 4. README: badge + baris fitur baru (tabel menaik ke bawah: sisip SETELAH baris 60)
s = open('README.md').read()
s = s.replace('badge/version-3.17.2-amber', 'badge/version-3.18.0-amber', 1)
row61 = ('| 61 | **WATCHDOG HANG DETAK JANTUNG + ANALISIS 2,5\u00d7 LEBIH CEPAT** \u2b50v3.18.0 | '
 'Hang beku (jendela macet tapi proses tak mati \u2014 dulu TAK tertangani pemulihan otomatis karena event "unresponsive" Chromium tak selalu menyala) kini terdeteksi lewat **detak jantung**: preload mengirim detak tiap 3 dtk; hilang >12 dtk = hang \u2192 renderer dipulihkan paksa \u2192 jendela dimuat ulang otomatis (jalur SHIELD) & tercatat di log; **jejak diagnostik permanen**: impor (nama \u00b7 durasi), jalur audio (penuh/JENDELA hemat RAM), putar, ekspor & batch tercatat di log crash \u2014 konteks persis tersedia saat melapor; **jendela adaptif**: film >60 mnt dianalisis per jendela 120 dtk \u2192 film 188 mnt = 94 jendela (bukan 250), analisis \u00b12,5\u00d7 lebih cepat, RAM puncak tetap 1 jendela |\n')
m = re.search(r'^\| 60 \|.+\|\n', s, re.M)
assert m, 'baris 60 tak ketemu'
s = s[:m.end()] + row61 + s[m.end():]
open('README.md', 'w').write(s)

# 5. PANDUAN: judul + bagian Yang Baru v3.18.0 (di atas bagian v3.17.2)
s = open('KINOSTRA-PANDUAN.md').read()
s = s.replace('# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.17.2', '# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.18.0', 1)
sec = ('''## Yang Baru di v3.18.0 — WATCHDOG HANG DETAK JANTUNG + ANALISIS 2,5× LEBIH CEPAT

Ada satu jenis masalah yang belum tertangani pemulihan otomatis lama: **hang beku** — jendela membeku total tapi prosesnya tidak mati, sehingga pemulihan berbasis "proses mati" (SHIELD) tidak pernah terpanggil. Pemicunya: event `unresponsive` bawaan Chromium terbukti tidak selalu menyala (diuji: renderer digantung 15 detik, pulih tanpa satu pun event). v3.18 memasang **detak jantung**: preload mengirim detak ke main process setiap 3 detik selama main thread renderer bebas. Kalau detak hilang lebih dari 12 detik, aplikasi menyimpulkan hang, memulihkan renderer secara paksa, dan jendela dimuat ulang otomatis lewat jalur SHIELD yang sama — semua tercatat di log.

Dua penyempurnaan menyertai. **Jejak diagnostik**: setiap impor (nama + durasi), keputusan jalur audio (decode penuh atau mode JENDELA hemat RAM), mulai memutar (maksimal sekali per 30 detik), ekspor tunggal dan batch kini masuk log crash permanen — saat melapor, konteks persisnya sudah tertulis. **Jendela adaptif**: film lebih dari 60 menit kini dianalisis per jendela 120 detik alih-alih 45 detik — film 188 menit butuh 94 jendela, bukan 250, sehingga masa tunggu analisis setelah impor terasa ±2,5× lebih singkat; RAM puncak tetap sebesar satu jendela (±46 MB), dan film ≤60 menit berjalan persis seperti v3.17.1.

''')
s = s.replace('## Yang Baru di v3.17.2', sec + '## Yang Baru di v3.17.2', 1)
open('KINOSTRA-PANDUAN.md', 'w').write(s)

# 6. index.html: boot + header
s = open('renderer/index.html').read()
assert s.count('3.17.2') == 2
open('renderer/index.html', 'w').write(s.replace('3.17.2', '3.18.0'))

print('bump v3.18.0 selesai')
for f in ['package.json', 'build/installer.nsi', 'build/afterpack.js', 'README.md', 'KINOSTRA-PANDUAN.md', 'renderer/index.html']:
    print(f, open(f).read().count('3.18.0'), 'titik baru;', open(f).read().count('3.17.2'), 'sisa 3.17.2')
