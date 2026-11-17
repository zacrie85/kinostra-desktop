#!/usr/bin/env python3
# generator release-v3270.sh — JSON via json.dumps + nama aset/tag di head/tail diganti dulu
import json

body = (
 "## 🎨 v3.27.0 — MODUL 03: TULISAN PART BISA 10% & WARNANYA BEBAS\n\n"
 "Permintaan kawan di modul **03 JUDUL & PART OTOMATIS** dua-duanya sudah jadi:\n\n"
 "### Yang baru\n"
 "1. **Ukuran tulisan part sampai 10%** — slider UKURAN TULISAN PART DI VIDEO kini **10%–250%** (dulu terhenti di 50%). Bumper intro & label pojok mengecil proporsional: garis hias, sub-info & animasi masuk ikut terskala — tetap rapi walau teksnya sangat kecil\n"
 "2. **Warna tulisan part bebas dipilih** — pemilih warna baru + tombol **OTOMATIS** (putih gading seperti sebelumnya). Berlaku untuk tulisan PART/EPISODE/EPS/BAGIAN di bumper intro & label pojok; garis hias & sub-info tetap gaya bawaan supaya identitas visual aman\n\n"
 "Keduanya ikut tersimpan di **preset**, memicu gambar-ulang overlay native saat berubah, dan **pratinjau = hasil ekspor persis** (satu mesin gambar).\n\n"
 "## 🔬 Kualitas\n"
 "- **Uji baru 12/12**: slider min 10%, warna merah + label + OTOMATIS, pixel-diff ukuran & warna di kedua mode (teks 10% menyusut wajar >30×, garis hias tetap amber), preset menyimpan & memulihkan, ekspor nyata 1 part dengan 10% + merah tanpa kendala\n"
 "- Regresi: uji ukuran-part v3.14 **22/22** · modul 16 **14/14** · frame **6/6** · overlay-statik **6/6** · ekspor anti-beku v3.26.1 **7/7**\n\n"
 "## 📦 Instalasi\n"
 "- **Setup**: jalankan `KINOSTRA-Setup-3.27.0.exe`\n"
 "- **Portable**: ekstrak `KINOSTRA-Portable-3.27.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n"
 "---\n"
 "100% offline · Windows 10/11 x64 · Electron 33 · IMPOR & PUTAR FILM 3-4 JAM TANPA RESTART · GAMBAR SELALU BERGERAK (JALUR VIDSPLIT + 3 DETEKTOR BEKU) · EKSPOR ANTI-BEKU 4 LAPIS · POTONG LANGSUNG · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K"
)

payload = {
    "tag_name": "v3.27.0",
    "target_commitish": "main",
    "name": "KINOSTRA v3.27.0 — Modul 03: ukuran tulisan part sampai 10% + warna bebas",
    "body": body,
    "draft": False,
    "prerelease": False,
}

tpl = open('/home/z/my-project/scripts/release-v3261.sh').read()
head = tpl[:tpl.index("BODY=$(cat <<'JSON'")].replace('3.26.1', '3.27.0')
tail = tpl[tpl.index("\nJSON\n)\n"):].replace('3.26.1', '3.27.0')

new = head + "BODY=$(cat <<'JSON'\n" + json.dumps(payload, ensure_ascii=False, indent=2) + tail
new = new.replace('release-v3261.sh — buat release', 'release-v3270.sh — buat release')
open('/home/z/my-project/scripts/release-v3270.sh', 'w').write(new)
j = new[new.index('{\n  "tag_name"'):new.index('\nJSON\n')]
json.loads(j)
assert 'Setup-3.27.0.exe' in new and 'Portable-3.27.0-win64.zip' in new and '3.26.1' not in head and '3.26.1' not in tail
print('release-v3270.sh dibuat — JSON valid, nama aset 3.27.0 ✓')
