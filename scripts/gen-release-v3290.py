#!/usr/bin/env python3
# generator release-v3290.sh — JSON via json.dumps + nama aset/tag diganti dulu
import json

body = (
 "## ✨ v3.29.0 — EKSPOR & SPLIT KEMBALI KE PROSES v3.16.0 (FIX \"encoding audio\")\n\n"
 "Sesuai permintaan kawan, proses **EXPORT & SPLIT** ditransplantasi dari **KINOSTRA v3.16.0** — versi yang hasil ekspor & split-nya terbukti bagus. Ini memperbaiki kasus:\n\n"
 "> MERENDER 71 PART · PARALEL 5× … (ULANGI-SW) … **Gagal ekspor: encoding audio**\n\n"
 "### Akar masalah\n"
 "Sejak v3.17.1 audio film panjang di-decode **per jendela SAAT render**; dengan **PARALEL 5×** para pekerja berebut satu decoder audio (tunggu maks 5 detik lalu men-decode bersamaan) → proses decode menggantung → dijaga jam 5 menit → *\"encoding audio macet\"* → part diulang (ULANGI-SW) → ekspor gagal.\n\n"
 "### Transplantasi (semantik v3.16, dengan perbaikan RAM)\n"
 "1. **Audio disiapkan SEKALI sebelum render dimulai** — satu AudioBuffer penuh dari awal sampai batas rentang ekspor; semua pekerja hanya MEMBACA buffer yang sama — **PARALEL berapa pun tidak lagi berebut decoder**.\n"
 "2. **Impor tidak berubah** — buffer dibangun bertahap per jendela (tanpa ArrayBuffer ±2 GB dan tanpa decode utuh saat impor) → **bebas layar hitam/crash v3.16 di film 3-4 jam**; garis gelombang & zoom pembicara tetap jalan seperti sebelumnya.\n"
 "3. **POTONG LANGSUNG tak tersentuh** (sampel audio disalin langsung) dan **GABUNG VIDEO** juga menyiapkan buffer per film.\n\n"
 "## 🔬 Kualitas\n"
 "- **Uji baru 7/7**: impor media panjang tanpa buffer (impor tak tersentuh) · ekspor PARALEL 5× dengan part bersamaan — selesai **TANPA \"audio macet\"** · buffer tersisa siap pakai (≥500 dtk) · UI \"menyiapkan audio penuh\" · hasil: stream AAC & volume terukur (mean > −55 dB) di semua part\n"
 "- Regresi: modul 16 **14/14** · ekspor anti-beku **7/7** · v3.27 **12/12** · v3.14 **22/22** · v3.28 (15+15 frame) **11/11** · frame **6/6** · overlay **6/6**\n\n"
 "## 📦 Instalasi\n"
 "- **Setup**: jalankan `KINOSTRA-Setup-3.29.0.exe`\n"
 "- **Portable**: ekstrak `KINOSTRA-Portable-3.29.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n"
 "---\n"
 "100% offline · Windows 10/11 x64 · Electron 33 · IMPOR & PUTAR FILM 3-4 JAM TANPA RESTART · GAMBAR SELALU BERGERAK (JALUR VIDSPLIT + 3 DETEKTOR BEKU) · EKSPOR ANTI-BEKU 4 LAPIS · POTONG LANGSUNG · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K"
)

payload = {
    "tag_name": "v3.29.0",
    "target_commitish": "main",
    "name": "KINOSTRA v3.29.0 — EKSPOR & SPLIT = proses v3.16.0 (FIX encoding audio, PARALEL aman)",
    "body": body,
    "draft": False,
    "prerelease": False,
}

tpl = open('/home/z/my-project/scripts/release-v3280.sh').read()
head = tpl[:tpl.index("BODY=$(cat <<'JSON'")].replace('3.28.0', '3.29.0')
tail = tpl[tpl.index("\nJSON\n)\n"):].replace('3.28.0', '3.29.0')

new = head + "BODY=$(cat <<'JSON'\n" + json.dumps(payload, ensure_ascii=False, indent=2) + tail
new = new.replace('release-v3280.sh — buat release', 'release-v3290.sh — buat release')
open('/home/z/my-project/scripts/release-v3290.sh', 'w').write(new)
j = new[new.index('{\n  "tag_name"'):new.index('\nJSON\n')]
json.loads(j)
assert 'Setup-3.29.0.exe' in new and 'Portable-3.29.0-win64.zip' in new and '3.28.0' not in head and '3.28.0' not in tail
print('release-v3290.sh dibuat — JSON valid, nama aset 3.29.0 ✓')
