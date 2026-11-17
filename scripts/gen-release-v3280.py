#!/usr/bin/env python3
# generator release-v3280.sh — JSON via json.dumps + nama aset/tag diganti dulu
import json

body = (
 "## ✨ v3.28.0 — 15 FRAME JUDUL & 15 FRAME PART FUTURISTIK TRANSPARAN\n\n"
 "Dua upgrade di modul **03 JUDUL & PART OTOMATIS** sesuai permintaan kawan:\n\n"
 "### 1. Frame judul kini 15 gaya (+5 ELEGAN TRANSPARAN)\n"
 "- **KACA HALUS** — panel kaca bening sangat tipis + garis putih lembut\n"
 "- **KRISTAL BENING** — kurungan sudut putih tipis panjang + kilau atas\n"
 "- **GARIS BENING** — hairline membulat + berlian kecil di kiri-kanan\n"
 "- **MEWAH BENING** — kaca transparan + hairline emas di dalam\n"
 "- **ETERE** — gradasi putih pudar kiri-kanan, ringan seperti kabut\n\n"
 "### 2. FITUR BARU: FRAME PART DI VIDEO — 15 gaya futuristik transparan\n"
 "Tulisan PART/EPISODE/EPS/BAGIAN/# kini bisa diberi bingkai (chips baru di modul 03):\n"
 "**HUD SUDUT · GARIS HUD · KAPSUL BENING · KURUNG TEKNO · CHIP DATA · SEGI ENAM · PITA TEKNO · GARIS GANDA HUD · TITIK ORBIT · FASE SUDUT · PANEL SISTEM · SINAR SAMPING · JARING TITIK · GARIS MURNI · BERKAS CAHAYA**\n\n"
 "Berlaku di **bumper intro & label pojok**, ikut skala ukuran part & warna part (v3.27), ikut tersimpan di **preset**, dan **pratinjau = hasil ekspor persis** (satu mesin gambar). Semua frame deterministik tanpa animasi — aman untuk ekspor.\n\n"
 "## 🔬 Kualitas\n"
 "- **Uji baru 11/11**: chips 16+16, pixel-DIFF semua 15 frame judul & 15 frame part di bumper intro, label pojok (kapsul & hud), preset menyimpan & memulihkan frame part + judul, overlay native gambar ulang, ekspor nyata 1 part dengan frame HUD + merah + 60%\n"
 "- Regresi: uji ukuran/warna part v3.27 **12/12** · v3.14 **22/22** · modul 16 **14/14** · frame **6/6** · overlay **6/6** · ekspor anti-beku **7/7**\n\n"
 "## 📦 Instalasi\n"
 "- **Setup**: jalankan `KINOSTRA-Setup-3.28.0.exe`\n"
 "- **Portable**: ekstrak `KINOSTRA-Portable-3.28.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n"
 "---\n"
 "100% offline · Windows 10/11 x64 · Electron 33 · IMPOR & PUTAR FILM 3-4 JAM TANPA RESTART · GAMBAR SELALU BERGERAK (JALUR VIDSPLIT + 3 DETEKTOR BEKU) · EKSPOR ANTI-BEKU 4 LAPIS · POTONG LANGSUNG · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K"
)

payload = {
    "tag_name": "v3.28.0",
    "target_commitish": "main",
    "name": "KINOSTRA v3.28.0 — 15 frame judul (elegan transparan) + 15 frame PART futuristik transparan",
    "body": body,
    "draft": False,
    "prerelease": False,
}

tpl = open('/home/z/my-project/scripts/release-v3270.sh').read()
head = tpl[:tpl.index("BODY=$(cat <<'JSON'")].replace('3.27.0', '3.28.0')
tail = tpl[tpl.index("\nJSON\n)\n"):].replace('3.27.0', '3.28.0')

new = head + "BODY=$(cat <<'JSON'\n" + json.dumps(payload, ensure_ascii=False, indent=2) + tail
new = new.replace('release-v3270.sh — buat release', 'release-v3280.sh — buat release')
open('/home/z/my-project/scripts/release-v3280.sh', 'w').write(new)
j = new[new.index('{\n  "tag_name"'):new.index('\nJSON\n')]
json.loads(j)
assert 'Setup-3.28.0.exe' in new and 'Portable-3.28.0-win64.zip' in new and '3.27.0' not in head and '3.27.0' not in tail
print('release-v3280.sh dibuat — JSON valid, nama aset 3.28.0 ✓')
