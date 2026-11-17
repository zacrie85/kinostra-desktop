#!/usr/bin/env python3
# generator release-v3261.sh — JSON via json.dumps + nama aset/tag di head/tail
# diganti versi TERLEBIH DAHULU (pelajaran kecelakaan v3.23, dipakai sejak v3.24)
import json

body = (
 "## 🛠️ v3.26.1 — OBAT \"GAGAL: RENDER BERHENTI MERESPON 45 DETIK\" SAAT EKSPOR & SPLIT\n\n"
 "Laporan kawan — ekspor & split berhenti dengan pesan *\"GAGAL: render berhenti merespon 45 detik\"* — sudah dibedah sampai akar dan dituntaskan 4 lapis:\n\n"
 "### Yang dibenahi\n"
 "1. **Penjaga antrean 20 detik di dua loop yang dulu telanjang**: loop **frame COVER** (dirender PALING AWAL — itulah kenapa error muncul *begitu* ekspor mulai) dan loop **MODE KILAT**. Bila encoder GPU wedged, dulu loop berputar tanpa akhir → semua slot diam → watchdog 45 detik → GAGAL. Kini macet terdeteksi cepat → **otomatis diulang dengan encoder software** (elemen video & encoder segar)\n"
 "2. **Watchdog global kini mencatat kegagalan hardware** — ekspor/part berikutnya otomatis software, tak menabrak dinding yang sama\n"
 "3. **Akar racun v3.26.0 diambil**: cache shader/kode GPU tidak lagi dihapus di tengah sesi (risiko menyendatkan encoder/decoder GPU) — kini **dijadwalkan** dan dihapus saat aplikasi dibuka ulang, sebelum proses GPU naik. Tetap jadi obat shader korap, kini aman\n"
 "4. **Pemulihan lama tetap lapis terakhir** (v3.15): retry sekali dengan setelan aman, part yang sudah tersimpan tidak diulang\n\n"
 "## 🔬 Kualitas\n"
 "- **Uji ekspor nyata baru 7/7**: film 2 jam → 2 part 30 detik + cover 3 detik per part (durasi keluaran 33,02 dtk terverifikasi ffprobe) · MODE KILAT · paralel 2× · marker cache dijadwalkan & benar-benar dihapus saat buka ulang (jejak log main)\n"
 "- Uji modul 16 **14/14** · frame-test **6/6** · overlay-statik **6/6**\n\n"
 "## 📦 Instalasi\n"
 "- **Setup**: jalankan `KINOSTRA-Setup-3.26.1.exe`\n"
 "- **Portable**: ekstrak `KINOSTRA-Portable-3.26.1-win64.zip`, jalankan `KINOSTRA.exe`\n"
 "- **Untuk mesin yang barusan GAGAL**: pasang versi ini, buka aplikasi, jalankan **OPTIMASI PERFORMA — SATU KLIK** (modul 16) sekali, lalu tutup & buka ulang aplikasi — cache GPU yang terjadwalkan terbersihkan saat mulai dan ekspor dicoba lagi. Bila masih beku juga (kasus langka, driver bermasalah), aplikasi kini otomatis jatuh ke encoder software tanpa menunggu 45 detik\n\n"
 "---\n"
 "100% offline · Windows 10/11 x64 · Electron 33 · IMPOR & PUTAR FILM 3-4 JAM TANPA RESTART · GAMBAR SELALU BERGERAK (JALUR VIDSPLIT + 3 DETEKTOR BEKU) · EKSPOR ANTI-BEKU 4 LAPIS · POTONG LANGSUNG · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K"
)

payload = {
    "tag_name": "v3.26.1",
    "target_commitish": "main",
    "name": "KINOSTRA v3.26.1 — Obat ekspor beku: 'render berhenti merespon 45 detik' dituntaskan",
    "body": body,
    "draft": False,
    "prerelease": False,
}

tpl = open('/home/z/my-project/scripts/release-v3250.sh').read()
head = tpl[:tpl.index("BODY=$(cat <<'JSON'")].replace('3.25.0', '3.26.1')
tail = tpl[tpl.index("\nJSON\n)\n"):].replace('3.25.0', '3.26.1')

new = head + "BODY=$(cat <<'JSON'\n" + json.dumps(payload, ensure_ascii=False, indent=2) + tail
new = new.replace('release-v3250.sh — buat release', 'release-v3261.sh — buat release')
open('/home/z/my-project/scripts/release-v3261.sh', 'w').write(new)
j = new[new.index('{\n  "tag_name"'):new.index('\nJSON\n')]
json.loads(j)
assert 'Setup-3.26.1.exe' in new and 'Portable-3.26.1-win64.zip' in new and '3.26.0' not in head and '3.26.0' not in tail
print('release-v3261.sh dibuat — JSON valid, nama aset 3.26.1 ✓')
