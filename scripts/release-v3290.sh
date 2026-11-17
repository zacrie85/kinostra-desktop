#!/bin/bash
# KINOSTRA v3.29.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.29.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.29.0 — EKSPOR & SPLIT = proses v3.16.0 (FIX encoding audio, PARALEL aman)",
  "body": "## ✨ v3.29.0 — EKSPOR & SPLIT KEMBALI KE PROSES v3.16.0 (FIX \"encoding audio\")\n\nSesuai permintaan kawan, proses **EXPORT & SPLIT** ditransplantasi dari **KINOSTRA v3.16.0** — versi yang hasil ekspor & split-nya terbukti bagus. Ini memperbaiki kasus:\n\n> MERENDER 71 PART · PARALEL 5× … (ULANGI-SW) … **Gagal ekspor: encoding audio**\n\n### Akar masalah\nSejak v3.17.1 audio film panjang di-decode **per jendela SAAT render**; dengan **PARALEL 5×** para pekerja berebut satu decoder audio (tunggu maks 5 detik lalu men-decode bersamaan) → proses decode menggantung → dijaga jam 5 menit → *\"encoding audio macet\"* → part diulang (ULANGI-SW) → ekspor gagal.\n\n### Transplantasi (semantik v3.16, dengan perbaikan RAM)\n1. **Audio disiapkan SEKALI sebelum render dimulai** — satu AudioBuffer penuh dari awal sampai batas rentang ekspor; semua pekerja hanya MEMBACA buffer yang sama — **PARALEL berapa pun tidak lagi berebut decoder**.\n2. **Impor tidak berubah** — buffer dibangun bertahap per jendela (tanpa ArrayBuffer ±2 GB dan tanpa decode utuh saat impor) → **bebas layar hitam/crash v3.16 di film 3-4 jam**; garis gelombang & zoom pembicara tetap jalan seperti sebelumnya.\n3. **POTONG LANGSUNG tak tersentuh** (sampel audio disalin langsung) dan **GABUNG VIDEO** juga menyiapkan buffer per film.\n\n## 🔬 Kualitas\n- **Uji baru 7/7**: impor media panjang tanpa buffer (impor tak tersentuh) · ekspor PARALEL 5× dengan part bersamaan — selesai **TANPA \"audio macet\"** · buffer tersisa siap pakai (≥500 dtk) · UI \"menyiapkan audio penuh\" · hasil: stream AAC & volume terukur (mean > −55 dB) di semua part\n- Regresi: modul 16 **14/14** · ekspor anti-beku **7/7** · v3.27 **12/12** · v3.14 **22/22** · v3.28 (15+15 frame) **11/11** · frame **6/6** · overlay **6/6**\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.29.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.29.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · IMPOR & PUTAR FILM 3-4 JAM TANPA RESTART · GAMBAR SELALU BERGERAK (JALUR VIDSPLIT + 3 DETEKTOR BEKU) · EKSPOR ANTI-BEKU 4 LAPIS · POTONG LANGSUNG · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K",
  "draft": false,
  "prerelease": false
}
JSON
)

echo "== Buat release =="
RID=$(curl -s -X POST -H "$AUTH" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/$REPO/releases -d "$BODY" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id') or ('ERR: '+str(d.get('errors') or d.get('message'))))")
echo "Release ID: $RID"
if [ -z "$RID" ] || [ "${RID:0:4}" = "ERR:" ]; then exit 1; fi

upload () {
  local f="$1" n="$2" ct="$3"
  echo "== Upload $n =="
  for i in 1 2 3; do
    R=$(curl -s -o /tmp/up.json -w "%{http_code}" -X POST \
      -H "$AUTH" -H "Content-Type: $ct" \
      --data-binary @"$f" \
      "https://uploads.github.com/repos/$REPO/releases/$RID/assets?name=$n")
    if [ "$R" = "201" ]; then echo "   OK ($R) $(python3 -c "import json;d=json.load(open('/tmp/up.json'));print(round(d['size']/1048576,1),'MB')")"; return 0; fi
    echo "   percobaan $i gagal (HTTP $R): $(head -c 200 /tmp/up.json)"; sleep 3
  done
  return 1
}

upload "dist_out/KINOSTRA-Setup-3.29.0.exe" "KINOSTRA-Setup-3.29.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.29.0-win64.zip" "KINOSTRA-Portable-3.29.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.29.0"
