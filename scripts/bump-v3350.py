#!/usr/bin/env python3
# KINOSTRA v3.35.0 — bump versi: package.json (versi + deskripsi) & build/installer.nsi
import json, re, pathlib

ROOT = pathlib.Path('/home/z/my-project')
SEG = ("v3.35.0: 5 FRAME REFERENSI KAWAN — permintaan user dgn 5 gambar referensi: frame utk tulisan "
       "JUDUL & EPISODE/PART di video yang bagian dalamnya KOSONG/TRANSPARAN (tempat tulisan), gaya "
       "banner lower-third. Kini katalog TITLEFRAMES & PARTFRAMES bertambah 5 kunci per menu (22 chip): "
       "KOMIK MERAH-BIRU (strip merah di atas + bingkai biru-ungu outline tebal komik + bintang kilau), "
       "GLOSSY GAMING (plat merah offset + banner gelap glossy gradasi + bibir atas merah + lencana "
       "lingkaran), SPORT LINGKAR (banner runcing biru + 3 garis kecepatan + lencana lingkaran biru), "
       "PITA EMAS (badan pita melengkung outline emas ganda + ekor lipatan dua sisi), NEON CYAN-PINK "
       "(bingkai neon cyan berpendar + pendar pink di tepi bawah). Semua digambar PROSEDURAL di "
       "drawRefFrame (compose.js baru) via cabang baru drawTitleFrame & drawPartFrame → bingkai otomatis "
       "MENYESUAIKAN ukuran teks (beda dgn PNG/JPG manual yang ukurannya tetap), bagian tengah TIDAK "
       "PERNAH diisi (teks judul/part tampil di dalam bingkai), lencana lingkaran menggantung di tepi "
       "kiri box dengan jangkauan ke dalam dibatasi b.safe (jarak teks dari tepi: judul 0,55 fs · part "
       "0,16 fs) → tak pernah menimpa huruf pertama; bintang/garis kecepatan/ekor pita diklampas dalam "
       "layar; berlaku bumper intro & label pojok, ikut skala ukuran part & animasi masuk, "
       "deterministik tanpa animasi (aman ekspor per frame), pratinjau = ekspor persis, ikut gerbang "
       "POTONG LANGSUNG (FRAME JUDUL). Uji BARU v335 22/22 di aplikasi nyata via CDP: katalog 22+22 "
       "chip (5 baru per menu) · klik chip → state + toast · pixel-diff semua 5 frame di jalur JUDUL & "
       "PART intro & PART pojok (piksel khas terukur, hilang saat TANPA) · interior kosong terukur "
       "(pusat box transparan sebelum teks) · label menu 20 GAYA + PNG/JPG SENDIRI · ekspor nyata 1 "
       "part MP4 dengan komik (judul) + pita emas (part) tanpa fatal · swatch warna tetap 34px. "
       "Regresi 11 suite (v331→v334). Bump 6 file")

# ---- package.json ----
pj = ROOT / 'package.json'
d = json.loads(pj.read_text())
assert d['version'] == '3.34.0', f"versi tidak terduga: {d['version']}"
d['version'] = '3.35.0'
old_desc = d['description']
assert old_desc.startswith('KINOSTRA — Suite Video Otonom · Desktop 100% Offline · v3.34.0:')
d['description'] = old_desc.replace(
    'KINOSTRA — Suite Video Otonom · Desktop 100% Offline · v3.34.0:',
    'KINOSTRA — Suite Video Otonom · Desktop 100% Offline · ' + SEG + ' · v3.34.0:', 1)
pj.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
print('package.json →', d['version'], '| desc len:', len(d['description']))

# ---- build/installer.nsi ----
nsi = ROOT / 'build/installer.nsi'
t = nsi.read_text()
for a, b in [('3.34.0.0', '3.35.0.0'), ('3.34.0', '3.35.0')]:
    t = t.replace(a, b)
nsi.write_text(t)
print('installer.nsi →', re.findall(r'APPVERSION "[^"]+"|OutFile "[^"]+"', t))
