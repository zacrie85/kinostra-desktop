#!/bin/bash
# KINOSTRA v3.7.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.7.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.7.0 — COVER OTOMATIS DARI ADEGAN VIDEO (modul 08B)",
  "body": "## 🎬 Upgrade Cover: OTOMATIS DARI VIDEO (modul 08B)\nTidak perlu lagi membuat cover satu per satu — **tiap part menyusun sampulnya sendiri** dari adegan di dalam video. 50 part pun beres tanpa kerja manual:\n- **SUMBER COVER → OTOMATIS DARI VIDEO → AKTIF** — selesai, tanpa butuh gambar apa pun\n- **Pemindaian adegan per part** — tiap part memeriksa beberapa titik di rentang waktunya sendiri dan memilih frame **terbaik** (paling jernih, berwarna, eksposur seimbang; frame fade hitam dihindari) → **cover tiap part berbeda-beda**\n- **Bingkai menarik pilihan**: **KLASIK** (bingkai ganda emas + aksen sudut) · **GARIS** (halus minimalis) · **SINEMA** (bar letterbox + garis emas gaya poster bioskop) · **TANPA**\n- **Judul otomatis dari nama file** atau ketik sendiri — huruf besar krem + garis hitam + glow merah, serasi Studio Sampul\n- **Tulisan part di bawah judul** tetap jalan (PART/EPISODE/EPS/BAGIAN/#) — `PART 1`, `PART 2`, …\n- **PRATINJAU CONTOH COVER OTOMATIS** — lihat dulu hasilnya sebelum mengekspor\n- Berlaku untuk **EKSPORT & SPLIT MP4**, **BATCH EKSPOR** & **GABUNG VIDEO** (pembuka gabungan bersampul otomatis, tetap polos tanpa nomor)\n- Mode **MANUAL** (impor gambar / Studio Sampul) tetap utuh; tetap **satu pass encoding** tanpa re-encode\n\n## 🔬 Kualitas\n- Uji otomatis baru **43/43 lulus** — termasuk ekspor nyata split video 3 adegan warna: **part 1 terbukti bercover merah, part 2 hijau, part 3 biru** (adegan masing-masing), bingkai amber + judul + label PART 1/2/3 tercetak di ketiganya, cover antar part >25% piksel berbeda\n- Regresi v3.0–v3.6.1 bersih — perilaku cover manual, durasi, audio bungkam, split & gabung tak berubah\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.7.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.7.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · COVER OTOMATIS · TULISAN PART DI SAMPUL · ZOOM PEMBICARA FADE/CUT · RESOLUSI 720p-4K · BACKSOUND MP3 · GABUNG VIDEO · TTS NARASI",
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

upload "dist_out/KINOSTRA-Setup-3.7.0.exe" "KINOSTRA-Setup-3.7.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.7.0-win64.zip" "KINOSTRA-Portable-3.7.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.7.0"
