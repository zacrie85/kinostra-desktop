#!/usr/bin/env python3
# bump v3.21.0 → v3.22.0 (6 file) + baris fitur README + bagian PANDUAN
import json, re

CHG = ("v3.22.0: ANALISIS AUDIO TERTIB \u2014 jawaban laporan 'masih belum bisa, ada keterangan seperti di gambar referensi sebelum aplikasinya ngerestar sendiri' "
 "+ tebakan user yang TEPAT: error saat MENGANALISIS SUARA. Log crash v3.18-v3.21 menunjukkan pola seragam: impor film >1,9 jam \u2192 baris "
 "'audio: mode JENDELA (hemat RAM)' \u2192 10-15 dtk kemudian 'HANG \u2014 detak jantung renderer hilang >12 dtk' \u2192 'RENDER MATI' exit 2. "
 "AKAR: analisis audio bertahap mulai PERSIS saat impor \u2014 dan di dalamnya, loop penyusunan offset tabel sampel memakai runs.shift() "
 "(Array.shift = O(n) per panggilan): file unduhan nyata punya stsc 127.880 entri (video uji lama hanya 1-3 entri sehingga bug tak pernah "
 "ketahuan di uji sandbox) \u2192 O(nSc\u00b2) \u2248 8-16 miliar operasi geser = thread utama MEMBEKU SINKRON 10-60 dtk PERSIS SETELAH impor \u2192 "
 "detak jantung hilang \u2192 pelindung mematikan aplikasi yang sedang bekerja. Reproduksi pertama di sandbox dgn video uji realistis "
 "(3,6 jam, moov di akhir, stereo) + CPU throttle 6\u00d7: sebelum = renderer tak merespons >40 dtk + SIGSEGV; sesudah fix = jeda maks 58 ms. "
 "Kini: (1) offset via PENUNJUK INDEKS O(1) + stsc dibaca BULK (dulu 127.880 fetch per-entri) \u2192 tabel <0,5 dtk utk film berapa pun "
 "(ikut memperbaiki probe MODE KILAT ekspor utk file nyata); (2) WATCHDOG PROBE RESPONS \u2014 sebelum mematikan, main bertanya ke renderer "
 "dgn executeJavaScript (4 dtk); terjawab = kerja berat latar, TIDAK dipaksa mati (log 'renderer merespons'); tak terjawab = beku sejati "
 "\u2192 crash paksa seperti dulu (proteksi v3.18-v3.21 utuh); (3) analisis audio MULAI TERTIB: menunggu 10 dtk tenang beruntun (tidak "
 "memutar/ekspor/thumbnail/sibuk) sebelum jendela pertama; (4) PACING: tiap 64 paket jeda 6 ms + napas antar jendela 120 ms; "
 "(5) thumbnail melaporkan _thumbBusy \u2014 analisis menunggu rantai thumbnail selesai; (6) video utama preload='metadata' + seek "
 "terkendali utk frame pertama (dulu 'auto' = Chromium mem-buffer film 4 jam tanpa henti di belakang). ")

# 1. package.json
d = json.loads(open('package.json').read())
d['version'] = '3.22.0'
desc = d['description']
assert 'v3.21.0:' in desc
d['description'] = desc.replace('KINOSTRA \u2014 Suite Video Otonom \u00b7 Desktop 100% Offline \u00b7 v3.21.0:', 'KINOSTRA \u2014 Suite Video Otonom \u00b7 Desktop 100% Offline \u00b7 ' + CHG + '\u00b7 v3.21.0:', 1)
open('package.json', 'w').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

# 2-3. nsi + afterpack: ganti buta
for f in ['build/installer.nsi', 'build/afterpack.js']:
    s = open(f).read()
    open(f, 'w').write(s.replace('3.21.0', '3.22.0'))

# 4. README: badge + baris fitur baru (sisip SETELAH baris 64)
s = open('README.md').read()
s = s.replace('badge/version-3.21.0-amber', 'badge/version-3.22.0-amber', 1)
row65 = ('| 65 | **ANALISIS AUDIO TERTIB** \u2b50v3.22.0 | '
 'Tebakan user tepat: aplikasi "ngestar sendiri" saat MENGANALISIS SUARA film panjang \u2014 akar sejatinya `Array.shift()` O(n) pada tabel sampel dgn stsc 127.880 entri (file unduhan nyata) = O(nSc\u00b2) \u2248 8-16 miliar operasi = thread utama beku 10-60 dtk persis setelah impor \u2192 pelindung mematikan aplikasi yang sedang bekerja. Kini: penunjuk indeks O(1) + stsc bulk, watchdog **mengecek respons renderer dulu** (masih menjawab = tidak dipaksa mati), analisis **menunggu 10 dtk tenang** sebelum mulai, pacing 6 ms tiap 64 paket, thumbnail ikut menunda analisis, video utama preload=metadata. Reproduksi sandbox dgn video uji realistis 3,6 jam: sebelum = tak merespons >40 dtk + SIGSEGV; sesudah = jeda maks 58 ms, nol crash |\n')
m = re.search(r'^\| 64 \|.+\|\n', s, re.M)
assert m, 'baris 64 tak ketemu'
s = s[:m.end()] + row65 + s[m.end():]
open('README.md', 'w').write(s)

# 5. PANDUAN: judul + bagian Yang Baru v3.22.0 (di atas bagian v3.21.0)
s = open('KINOSTRA-PANDUAN.md').read()
s = s.replace('# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.21.0', '# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.22.0', 1)
sec = ('''## Yang Baru di v3.22.0 — ANALISIS AUDIO TERTIB

Laporan kawan: *"masih belum bisa — ada keterangan seperti di gambar referensi sebelum aplikasinya ngerestar sendiri"*, lalu tebakan penting: *"atau sepertinya aplikasi ini error saat menganalisis suaranya"*. **Tebakan itu tepat.** Log crash menunjukkan pola yang sama di v3.18-v3.21: impor film >1,9 jam → baris `audio: mode JENDELA (hemat RAM)` → 10-15 detik kemudian `HANG — detak jantung renderer hilang >12 dtk` → `RENDER MATI`. Toast "Video panjang — audio dianalisis hemat memori bertahap" di gambar referensi adalah penanda persis: aplikasi mati **saat sedang menganalisis suara**, bukan saat pemutaran.

Akar sejatinya ditemukan lewat reproduksi pertama di sandbox: video uji dibuat **realistis seperti file unduhan** (3,6 jam, moov di akhir file, audio stereo, tabel sampel padat) dan CPU diperlambat 6× (simulasi laptop lemah) — dan kode lama langsung membeku >40 detik lalu crash. Isolasi bertahap menyempitkan ke **satu loop di mesin pembaca tabel MP4**: `Array.shift()` yang mahalnya O(n) per panggilan, dipanggil sampai 127.880 kali untuk file nyata (interleaving rapat) = O(nSc²) ≈ 8-16 **miliar** operasi geser. Thread utama membeku **sinkron** 10-60 detik persis setelah impor; detak jantung hilang; pelindung v3.18 mengira renderer beku dan **mematikan aplikasi yang sebenarnya sedang bekerja**. Video uji lama hanya punya 1-3 entri stsc — makanya bug ini tak pernah tampak di uji sandbox selama 4 versi.

v3.22 membenahi enam titik: **(1) offset tabel via penunjuk indeks O(1)** dan stsc dibaca blok bulk (dulu 127.880 fetch per-entri) — tabel kini selesai <0,5 detik untuk film berapa pun; ikut mempercepat probe ekspor MODE KILAT untuk file nyata. **(2) Pelindung kini bertanya dulu** — sebelum mematikan, proses utama mengirim probe langsung ke renderer (batas 4 detik); masih menjawab = kerja berat latar, dibiarkan bekerja (tercatat "renderer merespons"); tidak menjawab = beku sejati → pemulihan paksa seperti sebelumnya. **(3) Analisis audio mulai tertib** — menunggu 10 detik tenang beruntun (tidak memutar, tidak ekspor, tidak thumbnail, tidak sibuk) sebelum jendela pertama. **(4) Pacing** — tiap 64 paket diberi jeda 6 ms dan napas 120 ms antar jendela. **(5) Thumbnail ikut melapor** — rantai thumbnail menunda analisis hingga selesai. **(6) Video utama preload=metadata** — Chromium berhenti mem-buffer film 4 jam di belakang; frame pertama pratinjau diambil lewat seek kecil terkendali.

Hasil terukur (video uji 3,6 jam + throttle 6×): sebelum = renderer tak merespons >40 dtk + SIGSEGV; sesudah = jeda event loop maksimum **58 ms**, tabel 127.880 entri selesai <1 dtk, analisis mengalir tertib, **nol crash**. Film 3,6 jam kini bisa diimpor, diputar segera, dan dianalisis di belakang tanpa satu pun restart.

''')
s = s.replace('## Yang Baru di v3.21.0', sec + '## Yang Baru di v3.21.0', 1)
open('KINOSTRA-PANDUAN.md', 'w').write(s)

# 6. index.html: boot + header
s = open('renderer/index.html').read()
assert s.count('3.21.0') == 2, s.count('3.21.0')
open('renderer/index.html', 'w').write(s.replace('3.21.0', '3.22.0'))

print('bump v3.22.0 selesai — 6 file')
