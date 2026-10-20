#!/bin/bash
# KINOSTRA v3.5.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.5.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.5.0 — CARA PERPINDAHAN FOKUS: GESER / FADE / LANGSUNG",
  "body": "## 🎬 Fitur Baru: CARA PERPINDAHAN FOKUS (modul 02C — ZOOM PEMBICARA OTOMATIS)\nPilih sendiri **bagaimana kamera pindah ke pembicara berikutnya**:\n- **GESER HALUS** — perilaku lama: kamera bergerak lembut menyapu ke pembicara baru (±0,7 dtk)\n- **FADE · LEBUR** — bingkai lama **melebur** ke bingkai baru (crossfade ±0,55 dtk) — tanpa gerakan kamera terlihat sama sekali, seperti dissolve di editor\n- **LANGSUNG · CUT** — **potong instan** persis saat gantian pembicara — gaya potongan kamera TV\n- Kecepatan pindah fokus (CEPAT/NORMAL/LAMBAT) tetap berlaku di semua mode — mengatur seberapa cepat gantian diputuskan\n- Berlaku untuk **semua video** & semua jalur: **EKSPORT & SPLIT MP4**, **BATCH EKSPOR — SEMUA VIDEO DI KOTAK**, dan **GABUNG VIDEO** — setelan global tersimpan untuk video berikutnya\n- Transisi deterministik per frame — hasil ekspor paralel/split/batch identik dengan pratinjau\n\n## 🔬 Kualitas\n- Uji otomatis baru **27/27 lulus**: smoke UI 3 chip, API crop per mode (GESER bergerak halus / LANGSUNG lompat instan / FADE dua bingkai statis + alpha naik), **pixel canvas** (video uji kiri-merah-kanan-biru: FADE terbukti campuran, LANGSUNG terbukti langsung biru), **EKSPOR NYATA FADE 2 part** (frame @0.3 dtk = campuran merah+biru di file MP4 final) & **EKSPOR NYATA LANGSUNG** (frame @0.1 dtk langsung biru)\n- Regresi penuh: v3.0 **39/39**, v3.1 **29/30** (1 asersi teks versi), v3.2 **20/21** (1 teks versi), v3.3 **14/14**, v3.4 **34/34**\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.5.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.5.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · ZOOM PEMBICARA FADE/CUT · RESOLUSI 720p-4K · BACKSOUND MP3 · JUMLAH PART OTOMATIS · ALAM GAIB · GABUNG VIDEO · TTS NARASI",
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

upload "dist_out/KINOSTRA-Setup-3.5.0.exe" "KINOSTRA-Setup-3.5.0.exe" "application/octet-stream"
upload "dist_out/KINOSTRA-Portable-3.5.0-win64.zip" "KINOSTRA-Portable-3.5.0-win64.zip" "application/zip"
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown"

echo "== Verifikasi aset =="
curl -s -H "$AUTH" https://api.github.com/repos/$REPO/releases/$RID/assets \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"
echo "URL: https://github.com/$REPO/releases/tag/v3.5.0"
