#!/bin/bash
# KINOSTRA v3.4.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.4.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.4.0 — RESOLUSI OUTPUT 720p / 1080p / 2K / 4K",
  "body": "## 🖥️ Fitur Baru: RESOLUSI OUTPUT (modul 09 — EKSPORT & KOMPRESI)\nTentukan sendiri resolusi hasil eksport:\n- **720p HD** (1280×720) · **1080p FULL HD** (1920×1080) · **2K QHD** (2560×1440) · **4K ULTRA HD** (3840×2160)\n- Berlaku untuk **semua video**: hasil **EKSPORT & SPLIT MP4**, **BATCH EKSPOR — SEMUA VIDEO DI KOTAK**, dan **GABUNG VIDEO** semuanya dikunci ke resolusi pilihanmu — setelan tetap aktif untuk video berikutnya\n- Rasio vertikal 9:16 otomatis dibalik sesuai konvensi TikTok/Shorts (4K vertikal = 2160×3840)\n- **Bitrate menyesuaikan otomatis** mengikuti resolusi (4K = ±4× 1080p) agar tetap tajam; KOMPRES PINTAR target MB tetap diutamakan bila diisi\n- Mode **AUTO** = perilaku lama (mengikuti SKALA 100/75/50%); chip resolusi ↔ skala saling mengunci dua arah\n- Judul, subtitel, frame, watermark & zoom pembicara ikut membesar proporsional di 2K/4K\n- Codec H.264 otomatis level **5.1/5.2** untuk 2K/4K (termasuk 4K 60fps) sesuai standar\n\n## 🔬 Kualitas\n- Uji otomatis baru **34/34 lulus**: dimensi 4 chip (16:9 & 9:16), eksklusivitas dua arah, bitrate monoton + clamp 48 Mbps, daftar codec per level, **ekspor nyata 720p (2 part), 2K, dan 4K terverifikasi ffprobe 1280×720 / 2560×1440 / 3840×2160**, **BATCH EKSPOR 2 video @720p** via tombol asli (semua part 1280×720)\n- Regresi penuh: suite v3.0 **39/39**, suite v3.2 **21/21 fungsi**, suite v3.3 **14/14**\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.4.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.4.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · RESOLUSI 720p-4K · BACKSOUND MP3 · JUMLAH PART OTOMATIS · ZOOM PEMBICARA AI · ALAM GAIB · GABUNG VIDEO · TTS NARASI",
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

upload "dist_out/KINOSTRA-Setup-3.4.0.exe" "KINOSTRA-Setup-3.4.0.exe" "application/octet-stream"
upload "dist_out/KINOSTRA-Portable-3.4.0-win64.zip" "KINOSTRA-Portable-3.4.0-win64.zip" "application/zip"
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown"

echo "== Verifikasi aset =="
curl -s -H "$AUTH" https://api.github.com/repos/$REPO/releases/$RID/assets \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"
echo "URL: https://github.com/$REPO/releases/tag/v3.4.0"
