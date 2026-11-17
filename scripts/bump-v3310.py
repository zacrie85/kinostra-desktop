#!/usr/bin/env python3
# bump v3.30.0 → v3.31.0 (6 file) + baris README 75 + PANDUAN bagian baru
import json, re

CHG = ("v3.31.0: PEMINDAI AUDIO SENYAP — bedah file nyata user v3.30 membuktikan SUMBER "
 "video-nya hening total (max_volume −91 dB: track AAC ADA tetapi isinya kosong, umum "
 "pada film split-an hasil unduhan) → ekspor menyalin audio asli dengan setia → hasil "
 "'tidak ada suaranya' padahal aplikasi bekerja benar. Kini: puncak sampel audio diukur "
 "SEKALI per video (cache per mediaEpoch) saat impor (decode penuh) & saat ekspor "
 "(buffer siap, jalur demux/decode penuh v3.30) → puncak < −60 dBFS dianggap SENYAP → "
 "toast peringatan + tanda ⚠ di modul 11 (bsoundStat) + log noteCrash; pesan "
 "menyesuaikan bila MUSIK/BACKSOUND sudah siap mengisi suara. Uji BARU 12/12 (sumber "
 "senyap 3 mnt: deteksi di impor, toast + ⚠, ekspor = salinan setia ≤ −80 dB; dengan "
 "MUSIK terpasang: pesan berubah & hasil BERNADA > −55 dB; sumber bernada −16 dB: "
 "tidak salah alarm) + regresi v330 9/9, v329 7/7, modul16 14/14, ekspor 7/7, v328 "
 "11/11, v327 12/12, v314 22/22, frame 6/6, overlay 6/6 (v316 22/24 flake lama). Bump 6 file")

d = json.loads(open('package.json').read())
d['version'] = '3.31.0'
assert 'v3.30.0:' in d['description']
d['description'] = d['description'].replace('\u00b7 v3.30.0:', '\u00b7 ' + CHG + '\u00b7 v3.30.0:', 1)
open('package.json', 'w').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

for f in ['build/installer.nsi', 'build/afterpack.js']:
    s = open(f).read()
    open(f, 'w').write(s.replace('3.30.0', '3.31.0'))

s = open('README.md').read()
s = s.replace('badge/version-3.30.0-amber', 'badge/version-3.31.0-amber', 1)
row75 = ('| 75 | **PEMINDAI AUDIO SENYAP** \u2b50v3.31.0 | deteksi sumber hening total '
 '(\u221291 dB, umum pada film hasil unduhan) SAAT IMPOR \u00b7 peringatan + saran '
 'BACKSOUND sebelum ekspor |\n')
m = re.search(r'^\| 74 \|.+\|\n', s, re.M)
assert m, 'baris 74 tak ketemu'
s = s[:m.end()] + row75 + s[m.end():]
open('README.md', 'w').write(s)

s = open('KINOSTRA-PANDUAN.md').read()
s = s.replace('# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.30.0', '# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.31.0', 1)
sec = ('''## Yang Baru di v3.31.0 — PEMINDAI AUDIO SENYAP (deteksi sumber tanpa suara)

Bedah file nyata dari kawan di v3.30 membuktikan sesuatu yang penting: **file sumbernya sendiri hening total** — puncak volume −91 dB sepanjang video. Track AAC-nya ADA, tetapi isinya kosong. Ini umum terjadi pada film split-an hasil unduhan: pengunggah sering menghapus atau mengganti audio untuk menghindari deteksi hak cipta. Aplikasi menyalin audio asli dengan setia — yang aslinya memang tidak berisi suara — sehingga hasil ekspor pun hening.

**Kini KINOSTRA memeriksa audio sumber sejak impor:**
- Puncak sampel audio diukur sekali per video — saat impor (file kecil) dan saat ekspor (buffer siap).
- Jika sumber ternyata hening total (puncak di bawah −60 dBFS), muncul **peringatan jelas**: "AUDIO ASLI VIDEO SENYAP — file sumber TIDAK berisi suara (bukan gangguan aplikasi)". Modul 11 juga diberi tanda ⚠.
- Peringatan langsung memberi solusi: isi suara lewat **BACKSOUND MP3 SENDIRI** (modul 11 MUSIK & NARASI AI) — hasil ekspor akan bernada dengan musik pilihan kawan.
- Bila MUSIK/BACKSOUND sudah terpasang, pesan menyesuaikan: hasil ekspor akan berisi MUSIK/BACKSOUND.

Diuji 12/12 (deteksi di impor, salinan setia sumber senyap, hasil bernada lewat musik, tanpa alarm palsu pada sumber bernada) + seluruh regresi lama hijau.

''')
s = s.replace('## Yang Baru di v3.30.0', sec + '## Yang Baru di v3.30.0', 1)
open('KINOSTRA-PANDUAN.md', 'w').write(s)

s = open('renderer/index.html').read()
assert s.count('3.30.0') == 2, s.count('3.30.0')
open('renderer/index.html', 'w').write(s.replace('3.30.0', '3.31.0'))

print('bump v3.31.0 selesai \u2014 6 file')
