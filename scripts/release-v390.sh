#!/bin/bash
# KINOSTRA v3.9.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.9.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.9.0 — 10 FRAME JUDUL DI VIDEO + POTONG LANGSUNG",
  "body": "## 🎬 v3.9.0 — Dua Upgrade Besar (modul 02 & 09)\n\n### 1) 10 FRAME FITURISTIK untuk JUDUL DI DALAM VIDEO\nFrame hias kini untuk **judul yang terbakar di dalam video** — bukan bingkai sampul:\n- **GARIS KEMBAR** · **KOTAK TEGAS** · **BINGKAI GANDA** · **SUDUT KAMERA** · **PITA JUDUL** · **PITA SINEMA** · **NEON MENYALA** · **EMAS KLASIK** · **PANEL MODERN** · **GRADASI PANAS**\n- Pratinjau = hasil ekspor persis (satu mesin gambar)\n- **Posisi JUDUL kini menjangkau PALING BAWAH layar** (dulu berhenti di area atas)\n- **Posisi nomor PART kini menjangkau PALING ATAS layar** (bumper intro & label pojok)\n- Gaya tampil part punya pilihan baru **TANPA LABEL** — video bersih tanpa nomor\n\n### 2) POTONG LANGSUNG — Ekspor & Split TANPA re-encode\n- Modul 09 → **MODE PROSES → POTONG LANGSUNG** → EKSPOR & SPLIT MP4 seperti biasa\n- MP4 dipecah di **titik keyframe** dengan menyalin byte video **utuh tanpa decode/encode**\n- **Kualitas & resolusi 100% asli** (tidak mungkin turun — jauh di atas 720p bila sumbernya HD)\n- **±10-60× lebih cepat dari render** — sebatas kecepatan disk (uji: video 60 dtk → 3 part selesai ±2 detik)\n- Ada judul/subtitel/cover/efek aktif? KINOSTRA **otomatis jatuh ke RENDER PENUH** dengan pesan jelas — hasil tidak pernah jebol\n- Berlaku untuk EKSPOR & SPLIT, rentang waktu, potongan 02B & BATCH EKSPOR; GABUNG tetap render penuh\n\n## 🔬 Kualitas\n- Uji otomatis baru **30/30 lulus** — frame judul terbakar di pita bawah/atas persis, posisi PART paling atas, potong langsung 3 part (resolusi = sumber, durasi pas keyframe, audio menyatu dgn video, decode ffmpeg bersih), fallback otomatis saat judul aktif\n- Uji mesin potong langsung di Node **12/12 lulus** — parser tabel sampel (stts/stsc/stsz/stco/stss/ctts RLE), selisih dts/pts B-frame, salinan byte & header fastStart\n- Regresi v3.0–v3.8 dijalankan ulang\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.9.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.9.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · 10 FRAME JUDUL DI VIDEO · POTONG LANGSUNG TANPA RE-ENCODE · POSISI JUDUL SAMPAI BAWAH · PART SAMPAI ATAS · 1 SAMPUL SEMUA PART · ZOOM PEMBICARA · RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.9.0.exe" "KINOSTRA-Setup-3.9.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.9.0-win64.zip" "KINOSTRA-Portable-3.9.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.9.0"
