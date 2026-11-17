#!/bin/bash
# KINOSTRA v3.33.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.33.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.33.0 — MENU FRAME DILEBARKAN (semua 15 frame futuristik terlihat & terbaca)",
  "body": "## 🖼️ v3.33.0 — MENU FRAME DILEBARKAN\n\nKeluhan kawan: **\"di menu frame futuristik cuma 9 yang tampil, padahal ada 15\"**. Perbaikan v3.30 dulu baru separuh jalan: tombolnya memang melipat ke baris kedua, tetapi setiap tombol masih memakai kotak kecil 34 piksel (ukuran swatch warna) — jadi hanya ±9 yang muat per baris dan nama-nama panjang seperti **KAPSUL BENING**, **GARIS GANDA HUD**, **PANEL SISTEM** tetap terpotong tak terbaca.\n\n### Kini tuntas sampai akar\n- **Chip menu FRAME melar mengikuti nama lengkapnya** (lebar otomatis 55–118px, papan warna panel, hover & aktif amber) — semua **16 pilihan FRAME PART** (TANPA + 15 gaya futuristik) dan **16 pilihan FRAME JUDUL** (TANPA + 15 gaya) tampil **utuh, terbaca semua**, melipat rapi di dalam panel — nol teks terpotong.\n- **Label menu dibetulkan**: \"FRAME JUDUL DI VIDEO\" tadinya tertulis \"10 GAYA\" (usang sejak v3.28) — kini \"15 GAYA\" sesuai katalog.\n- **Yang tidak berubah sama sekali**: klik gaya → langsung aktif + toast; pratinjau = ekspor persis; chip swatch warna (filter, warna neon, warna track) tetap kotak 34px; mesin render/ekspor tak tersentuh.\n\n## 🔬 Kualitas\n- **Uji baru 9/9** mengukur layout DOM nyata di aplikasi Electron: 16 chip nama katalog lengkap tanpa satu pun terpotong (scrollWidth==clientWidth semua), 5 baris semua di dalam panel 424px, klik SEGI ENAM → state.partFrame + toast benar, frame judul 16 chip sama, swatch warna tetap 34px, label versi v3.33.0\n- Regresi: v3.31, v3.30, v3.29, modul 16, ekspor anti-beku, v3.28, v3.27, v3.14, frame, overlay — seluruh suite lama dijalankan ulang.\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.33.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.33.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · EKSPOR & SPLIT = PROSES v3.16.0 · SUARA DIJAMIN IKUT (SEMUA FORMAT, TERMASUK FILM UTUH 3-4 JAM) · GERBANG SUARA + MUSIK OTOMATIS · PEMINDAI AUDIO SENYAP · IMPOR & PUTAR FILM 3-4 JAM TANPA RESTART · POTONG LANGSUNG · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.33.0.exe" "KINOSTRA-Setup-3.33.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.33.0-win64.zip" "KINOSTRA-Portable-3.33.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.33.0"
