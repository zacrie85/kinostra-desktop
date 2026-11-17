#!/usr/bin/env python3
# bump v3.29.0 → v3.30.0 (6 file) + baris README 74 + PANDUAN bagian baru
import json, re

CHG = ("v3.30.0: FIX SUARA HILANG DI HASIL EKSPOR/SPLIT (video wadah bukan MP4/AAC "
 "\u2014 WebM/MKV/FLV/MP3: probeAudio tak mengenal wadah \u2192 _audioDemux tak pernah ada "
 "\u2192 wantAudio salah \u2192 aCodec tak dipilih \u2192 hasil TANPA stream audio; laporan user "
 "v3.29 'video berhasil diexport dan split akan tetapi tidak ada suaranya') \u2014 kini "
 "wantAudio menganggap semua video berpotensi bersuara + ensureExportAudio JALUR 2 = "
 "decodeAudioData PENUH semua format (semantik v3.16, pelindung RAM \u22643,2 GB) bila demux "
 "gagal + pelindung buffer kosong (got < 0,5 dtk \u2192 jatuh ke jalur 2, tidak pernah "
 "mengirim buffer penuh NOL) + UI: PANEL KANAN 384\u2192424px & .chips flex-wrap \u2014 16 tombol "
 "FRAME PART (TANPA + 15 gaya futuristik) tampil SEMUA dlm 2 baris, dulu cuma \u00b19 "
 "terlihat terpotong tepi panel (permintaan user dgn gambar referensi). Uji BARU 9/9 "
 "(WebM 17 mnt Opus: impor tanpa buffer/demux; ekspor PARALEL 5\u00d7 2 part \u2192 stream "
 "AAC & mean_volume > -55 dB; buffer = durasi PENUH 1020 dtk = bukti jalur "
 "decodeAudioData; chips 16 tampil \u22652 baris semua di dalam panel 424px) + regresi "
 "v329 7/7, modul16 14/14, ekspor 7/7, v328 11/11, v327 12/12, v314 22/22, frame 6/6, "
 "overlay 6/6 (v316 22/24 flake lama). Bump 6 file")

d = json.loads(open('package.json').read())
d['version'] = '3.30.0'
assert 'v3.29.0:' in d['description']
d['description'] = d['description'].replace('\u00b7 v3.29.0:', '\u00b7 ' + CHG + '\u00b7 v3.29.0:', 1)
open('package.json', 'w').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

for f in ['build/installer.nsi', 'build/afterpack.js']:
    s = open(f).read()
    open(f, 'w').write(s.replace('3.29.0', '3.30.0'))

s = open('README.md').read()
s = s.replace('badge/version-3.29.0-amber', 'badge/version-3.30.0-amber', 1)
row74 = ('| 74 | **SUARA DIJAMIN IKUT + PANEL LEBAR** \u2b50v3.30.0 | '
 'FIX suara hilang utk WebM/MKV/FLV/MP3 (decode penuh semua-format semantik v3.16 sbg '
 'jalur cadangan) \u00b7 panel kanan 424px + chips melipat \u2014 16 frame PART tampil semua |\n')
m = re.search(r'^\| 73 \|.+\|\n', s, re.M)
assert m, 'baris 73 tak ketemu'
s = s[:m.end()] + row74 + s[m.end():]
open('README.md', 'w').write(s)

s = open('KINOSTRA-PANDUAN.md').read()
s = s.replace('# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.29.0', '# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.30.0', 1)
sec = ('''## Yang Baru di v3.30.0 — SUARA DIJAMIN IKUT + PANEL LEBAR (semua frame tampil)

Dua upgrade atas laporan kawan di v3.29: "video berhasil di export dan split akan tetapi tidak ada suaranya" dan "frame part yang tampil di menu hanya 9, padahal ada 15".

**1. Suara dijamin ikut — semua format video.** Akar masalah: bila sumber video berwadah **bukan MP4/AAC** (mis. WebM, MKV, FLV, atau MP3), pelacak audio internal tidak mengenal wadahnya → jalur audio dianggap tidak ada → hasil ekspor/split jalan **tanpa stream audio sama sekali**. Sekarang:
- Setiap video selalu dianggap berpotensi bersuara — encoder audio selalu disiapkan.
- Bila jalur demux AAC (hemat RAM) gagal, KINOSTRA otomatis jatuh ke **decode audio penuh ala v3.16** yang mengenal SEMUA format — persis proses yang dulu selalu bersuara.
- Pelindung baru: bila hasil decode ternyata kosong (track rusak), buffer kosong tidak pernah dikirim — otomatis dicoba lewat jalur lain, bukan diekspor senyap.

**2. Panel kanan lebih lebar + frame tampil semua.** Lebar panel setelan dinaikkan 384→**424px** dan baris pilihan frame kini **melipat ke baris berikutnya** — seluruh **16 tombol FRAME PART (TANPA + 15 gaya futuristik transparan)** terlihat dalam 2 baris, tidak ada lagi yang tersembunyi di tepi panel. Berlaku juga untuk pilihan frame judul, layout cover, palet & transisi.

Diuji 9/9 (WebM 17 menit: impor tanpa buffer, ekspor PARALEL 5× dengan audio terukur tidak senyap, chips tampil semua) + seluruh regresi lama hijau.

''')
s = s.replace('## Yang Baru di v3.29.0', sec + '## Yang Baru di v3.29.0', 1)
open('KINOSTRA-PANDUAN.md', 'w').write(s)

s = open('renderer/index.html').read()
assert s.count('3.29.0') == 2, s.count('3.29.0')
open('renderer/index.html', 'w').write(s.replace('3.29.0', '3.30.0'))

print('bump v3.30.0 selesai \u2014 6 file')
