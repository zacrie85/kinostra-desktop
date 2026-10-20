#!/bin/bash
# KINOSTRA v3.3.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.3.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.3.0 — BACKSOUND MP3 SENDIRI",
  "body": "## 🎵 Fitur Baru: BACKSOUND MP3 SENDIRI (modul 06)\nPakai **musik pilihanmu sendiri** sebagai backsound video — bukan cuma skor AI:\n- **PILIH FILE MP3** → pilih MP3/WAV/M4A dari disk\n- **VOLUME BACKSOUND 0–150%** — atur besar-kecil suaranya secara manual\n- Diputar **berulang (loop)** otomatis bila lagu lebih pendek dari video; posisi lagu **kontinu antar part** (tidak mulai dari awal di tiap part)\n- Ikut **EKSPOR & SPLIT, GABUNG VIDEO, BATCH EKSPOR** — semua part dapat backsound\n- **Terdengar di pratinjau** saat video diputar\n- Cheklis PAKAI/tdk + tombol hapus; video tanpa suara asli tetap diekspor **dengan audio** bila backsound aktif\n\n## 🔬 Kualitas\n- Uji otomatis baru **14/14 lulus**: decode MP3, kontribusi mix terukur (mati=sunyi, nyal=bunyi), volume 30% ≈ ⅓× volume 100%, LOOP terbukti di t=20 dtk (buffer 8 dtk), cheklis ON/OFF, ekspor nyata 3 part terverifikasi ffprobe tidak sunyi, hapus bersih\n- Regresi penuh: suite v3.0 **39/39**, suite v3.2 **21/21**, suite v3.1 **29/29 fungsi** (1 asersi teks versi lama, bukan regresi)\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.3.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.3.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · BACKSOUND MP3 · JUMLAH PART OTOMATIS · ZOOM PEMBICARA AI · ALAM GAIB · GABUNG VIDEO · TTS NARASI",
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

upload "dist_out/KINOSTRA-Setup-3.3.0.exe" "KINOSTRA-Setup-3.3.0.exe" "application/octet-stream"
upload "dist_out/KINOSTRA-Portable-3.3.0-win64.zip" "KINOSTRA-Portable-3.3.0-win64.zip" "application/zip"
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown"

echo "== Verifikasi aset =="
curl -s -H "$AUTH" https://api.github.com/repos/$REPO/releases/$RID/assets \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"
echo "URL: https://github.com/$REPO/releases/tag/v3.3.0"
