#!/usr/bin/env python3
# bump v3.26.0 → v3.26.1 (6 file) + baris fitur README + bagian PANDUAN
import json, re

CHG = ("v3.26.1: OBAT 'GAGAL: render berhenti merespon 45 detik' saat ekspor & split \u2014 "
 "(1) dua loop encoder yang tidak terlindungi watchdog kini diberi PENJAGA ANTREAN 20 dtk: loop frame COVER "
 "(dirender paling awal; dulu bila encoder GPU wedged, loop berputar tanpa akhir \u2192 semua slot diam \u2192 watchdog "
 "global 45 dtk \u2192 GAGAL) dan loop MODE KILAT; macet kini gagal cepat dan mesin retry v2.5 otomatis mencoba 1\u00d7 "
 "dgn encoder software (elemen video & encoder dibuat segar); "
 "(2) watchdog global kini mencatat kegagalan HW saat menyala \u2192 ekspor/part berikutnya otomatis software (anti-pelan); "
 "(3) AKAR RACUN v3.26.0 diambil: cache shader/kode GPU TIDAK lagi dihapus di tengah sesi (menghapus cache saat "
 "proses GPU hidup berisiko membuat encoder/decoder GPU tersendat) \u2014 kini diJADWALKAN lewat marker "
 "pending-gpu-cache-clean.json dan dihapus saat aplikasi dibuka ulang SEBELUM proses GPU naik (aman + tetap obat "
 "shader korap); "
 "(4) pemulihan doExport v3.15 (retry setelan aman paralel 1\u00d7/software) tetap jadi lapis terakhir. "
 "Uji: ekspor nyata BARU 7/7 (2 part 30 dtk + cover 3 dtk per part = 33,02 dtk terverifikasi ffprobe, mode kilat, "
 "paralel 2, marker dijadwalkan + dihapus saat buka ulang dengan log main), maintenance 14/14, frame 6/6, overlay 6/6. ")

d = json.loads(open('package.json').read())
d['version'] = '3.26.1'
desc = d['description']
assert '\u00b7 v3.26.0:' in desc
d['description'] = desc.replace('\u00b7 v3.26.0:', '\u00b7 ' + CHG + '\u00b7 v3.26.0:', 1)
open('package.json', 'w').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

for f in ['build/installer.nsi', 'build/afterpack.js']:
    s = open(f).read()
    open(f, 'w').write(s.replace('3.26.0', '3.26.1'))

s = open('README.md').read()
s = s.replace('badge/version-3.26.0-amber', 'badge/version-3.26.1-amber', 1)
row70 = ('| 70 | **OBAT EKSPOR BEKU** \u2b50v3.26.1 | '
 '"GAGAL: render berhenti merespon 45 detik" dituntaskan: penjaga antrean 20 dtk di loop cover & kilat '
 '(gagal cepat \u2192 retry software otomatis), watchdog mencatat kegagalan HW, cache shader GPU kini dijadwalkan '
 'dihapus saat dibuka ulang (bukan di tengah sesi) |\n')
m = re.search(r'^\| 69 \|.+\|\n', s, re.M)
assert m, 'baris 69 tak ketemu'
s = s[:m.end()] + row70 + s[m.end():]
open('README.md', 'w').write(s)

s = open('KINOSTRA-PANDUAN.md').read()
s = s.replace('# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.26.0', '# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.26.1', 1)
sec = ('''## Yang Baru di v3.26.1 — OBAT "GAGAL: RENDER BERHENTI MERESPON 45 DETIK" SAAT EKSPOR

Laporan kawan — ekspor & split berhenti dengan pesan *"GAGAL: render berhenti merespons 45 detik"* — sudah dibedah sampai akarnya dan dituntaskan empat lapis:

1. **Dua loop encoder yang tak terlindungi kini dijaga.** Ketika encoder GPU "wedged" (antrean encode tak mengalir), dua loop dulu berputar tanpa akhir: loop **frame COVER** (yang dirender PALING AWAL — itulah kenapa error muncul *begitu* ekspor mulai) dan loop **MODE KILAT**. Semua slot diam → watchdog global menembak setelah 45 detik → GAGAL. Kini keduanya punya penjaga antrean 20 detik: macet terdeteksi cepat, dilempar sebagai kegagalan encoder, dan mesin coba-ulang otomatis (v2.5) segera mengulang part itu dengan **encoder software** — elemen video & encoder dibuat segar.
2. **Watchdog global kini mencatat kegagalan hardware** saat menyala — ekspor dan part berikutnya otomatis memakai software, tidak menabrak dinding yang sama dua kali.
3. **Akar racun dari v3.26.0 diambil.** BERSIHKAN CACHE/OPTIMASI dulu menghapus cache shader/kode GPU *di tengah sesi* — menghapus cache saat proses GPU masih hidup berisiko membuat encoder/decoder GPU tersendat. Kini pembersihan **dijadwalkan**: ditandai lewat berkas `pending-gpu-cache-clean.json`, dan cache dihapus saat aplikasi dibuka ulang **sebelum proses GPU naik** — aman dan tetap jadi obat shader korap.
4. **Pemulihan lama tetap lapis terakhir** (v3.15): bila render tetap gagal, satu kali dicoba ulang dengan setelan aman (paralel 1×, encoder software) tanpa mengulang part yang sudah tersimpan.

Diuji: **uji ekspor nyata baru 7/7** (film 2 jam, 2 part 30 detik + cover 3 detik di tiap part — durasi keluaran 33,02 dtk terverifikasi ffprobe; MODE KILAT; paralel 2×; marker dijadwalkan dan benar-benar dihapus saat aplikasi dibuka ulang dengan jejak log main), uji modul 16 **14/14**, frame-test **6/6**, overlay-statik **6/6**.

''')
s = s.replace('## Yang Baru di v3.26.0', sec + '## Yang Baru di v3.26.0', 1)
open('KINOSTRA-PANDUAN.md', 'w').write(s)

s = open('renderer/index.html').read()
assert s.count('3.26.0') == 2, s.count('3.26.0')
open('renderer/index.html', 'w').write(s.replace('3.26.0', '3.26.1'))

print('bump v3.26.1 selesai \u2014 6 file')
