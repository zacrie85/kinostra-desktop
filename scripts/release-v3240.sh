#!/bin/bash
# KINOSTRA v3.24.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.24.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.24.0 — DETEKTOR PIKSEL (penyajian mati disembuhkan otomatis)",
  "body": "## 🔍 v3.24.0 — DETEKTOR PIKSEL: MEKANISME BEKU KEDUA TUMBANG\n\nRekaman layar yang kawan kirim (*\"gambar tidak bergerak.mp4\"*) adalah bukti detektif sempurna: **v3.23.0 sudah terpasang** (header), waktu berjalan normal (`00:15.4 → 00:22.9`), gambar **identik piksel demi piksel** di semua frame, dan **tanpa toast penyembuh** — artinya pengawas v3.23 tidak pernah menyala: `totalVideoFrames` di mesin kawan **selalu maju** (decoder yakin bekerja) tapi gambar yang tersaji tidak pernah berubah. Ini mekanisme KEDUA: **penyajian mati** di lapisan video kompositor Windows (DirectComposition) — dekode, DOM, dan kanvas overlay tetap sehat (caption tetap tergambar tajam di rekaman). VidSplit bergerak di mesin yang sama karena video-nya berdiri sendiri tanpa lapisan di atasnya.\n\n### Perbaikan\n1. **Detektor level piksel**: tiap 2 detik selagi memutar, video disampel ke kanvas 48×27 dan hash pikselnya dibandingkan. Decoder maju tapi piksel diam + waktu berjalan = penyajian mati → tangga penyembuhan: **kocok halus** (seek +0,05 dtk) → **nyalakan ulang visibilitas** → **jatuh ke jalur kanvas overlay** — gambar digambar manual via `drawImage` menjadi SATU lapisan komposit yang kebal bug lapisan video (caption ikut tergambar di kanvas)\n2. **Penyembuhan diingat per mesin** (`kinostra.canvasPlay`): impor berikutnya pada sesi yang sama langsung jalur kanvas tanpa menunggu beku; sesi baru tetap mencoba native sekali (driver bisa saja membaik)\n3. **Log kini memuat identitas GPU** saat putaran native dimulai — diagnosis lapangan makin tajam\n\n## 🔬 Kualitas\n- Detektor piksel diuji dgn **video adegan-diam nyata** (warna solid: fr maju 52→360, piksel diam — persis kondisi mesin kawan): **8/8 lulus** — deteksi ±2 dtk, tangga utuh 6 dtk, waktu tetap berjalan\n- Video bergerak normal: **nol false-positive** (frame-test 6/6, native tetap aktif)\n- Jalur pompa-macet v3.23 tetap utuh (sandera 6/6)\n- Regresi v3.21: **32/33** (sisa = asersi versi, wajar) — putar 4 jam nol beku, pelindung hang pulih, MODE AMAN otomatis, MODE PUTARAN HEMAT semua lulus\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.24.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.24.0-win64.zip`, jalankan `KINOSTRA.exe`\n- Di mesin yang sudah kena beku: putar sekali → ±6 dtk penyembuhan → impor berikutnya langsung lancar\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · IMPOR & PUTAR FILM 3-4 JAM TANPA RESTART · GAMBAR SELALU BERGERAK (2 MEKANISME BEKU TERDETEKSI & DISEMBUHKAN OTOMATIS) · NATIVE SEMUA RASIO · POTONG LANGSUNG · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.24.0.exe" "KINOSTRA-Setup-3.24.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.24.0-win64.zip" "KINOSTRA-Portable-3.24.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.24.0"
