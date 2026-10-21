#!/bin/bash
# KINOSTRA v3.6.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.6.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.6.0 — COVER VIDEO PEMBUKA (modul 08B)",
  "body": "## 🎬 Fitur Baru: COVER VIDEO PEMBUKA (modul 08B)\nPasang **satu gambar cover** yang tampil **2 detik di awal SETIAP file** hasil ekspor:\n- **EKSPORT & SPLIT MP4** — setiap part dibuka cover\n- **BATCH EKSPOR — SEMUA VIDEO DI KOTAK** — semua video semua part dibuka cover\n- **GABUNG VIDEO** — cover sekali di pembuka gabungan (tidak diulang antar film)\n\n**Dua sumber cover:**\n- **IMPOR COVER…** — pilih gambar sendiri (PNG/JPG/WebP), mengisi penuh layar (crop otomatis pas)\n- **BUAT DI STUDIO SAMPUL** — cover dibuat langsung oleh aplikasi: ambil frame video + papan judul bergaya (HOROR ALAMGAIB · ALAM GAIB · DANGDUT IDOLADESA · SINEMA · NEON · POLOS) lalu tekan **PAKAI SEBAGAI COVER VIDEO**\n\n**DURASI COVER**: pilih 1 / 2 / 3 / 5 detik (default 2 detik). Cover tampil **diam-diam** (audio bungkam) lalu video & suara asli berjalan normal — satu pass encoding, tanpa re-encode, kecepatan ekspor tetap.\n\n## 🔬 Kualitas\n- Uji otomatis baru **29/29 lulus**: smoke UI modul 08B, pasang cover (auto-aktif + status), pixel `drawCoverFrame` (hijau 0x00B140 terbukti), Studio Sampul mode cover (tombol PAKAI SEBAGAI COVER memasang kanvas), **EKSPOR NYATA 1 part** (durasi 8→10 dtk, frame @0.1–1.9 cover, @2.5 konten, audio 2 dtk bungkam −91 dB lalu sine −22 dB), **EKSPOR NYATA SPLIT 2 part** (kedua part 6 dtk, keduanya dibuka cover), **GABUNG 2 video** (8 dtk, cover cuma sekali di awal)\n- Regresi penuh: v3.0–v3.5 tanpa regresi fungsi\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.6.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.6.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · COVER PEMBUKA · ZOOM PEMBICARA FADE/CUT · RESOLUSI 720p-4K · BACKSOUND MP3 · GABUNG VIDEO · TTS NARASI",
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

upload "dist_out/KINOSTRA-Setup-3.6.0.exe" "KINOSTRA-Setup-3.6.0.exe" "application/octet-stream"
upload "dist_out/KINOSTRA-Portable-3.6.0-win64.zip" "KINOSTRA-Portable-3.6.0-win64.zip" "application/zip"
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown"

echo "== Verifikasi aset =="
curl -s -H "$AUTH" https://api.github.com/repos/$REPO/releases/$RID/assets \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"
echo "URL: https://github.com/$REPO/releases/tag/v3.6.0"
