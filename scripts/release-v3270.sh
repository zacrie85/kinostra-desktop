#!/bin/bash
# KINOSTRA v3.27.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.27.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.27.0 — Modul 03: ukuran tulisan part sampai 10% + warna bebas",
  "body": "## 🎨 v3.27.0 — MODUL 03: TULISAN PART BISA 10% & WARNANYA BEBAS\n\nPermintaan kawan di modul **03 JUDUL & PART OTOMATIS** dua-duanya sudah jadi:\n\n### Yang baru\n1. **Ukuran tulisan part sampai 10%** — slider UKURAN TULISAN PART DI VIDEO kini **10%–250%** (dulu terhenti di 50%). Bumper intro & label pojok mengecil proporsional: garis hias, sub-info & animasi masuk ikut terskala — tetap rapi walau teksnya sangat kecil\n2. **Warna tulisan part bebas dipilih** — pemilih warna baru + tombol **OTOMATIS** (putih gading seperti sebelumnya). Berlaku untuk tulisan PART/EPISODE/EPS/BAGIAN di bumper intro & label pojok; garis hias & sub-info tetap gaya bawaan supaya identitas visual aman\n\nKeduanya ikut tersimpan di **preset**, memicu gambar-ulang overlay native saat berubah, dan **pratinjau = hasil ekspor persis** (satu mesin gambar).\n\n## 🔬 Kualitas\n- **Uji baru 12/12**: slider min 10%, warna merah + label + OTOMATIS, pixel-diff ukuran & warna di kedua mode (teks 10% menyusut wajar >30×, garis hias tetap amber), preset menyimpan & memulihkan, ekspor nyata 1 part dengan 10% + merah tanpa kendala\n- Regresi: uji ukuran-part v3.14 **22/22** · modul 16 **14/14** · frame **6/6** · overlay-statik **6/6** · ekspor anti-beku v3.26.1 **7/7**\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.27.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.27.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · IMPOR & PUTAR FILM 3-4 JAM TANPA RESTART · GAMBAR SELALU BERGERAK (JALUR VIDSPLIT + 3 DETEKTOR BEKU) · EKSPOR ANTI-BEKU 4 LAPIS · POTONG LANGSUNG · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.27.0.exe" "KINOSTRA-Setup-3.27.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.27.0-win64.zip" "KINOSTRA-Portable-3.27.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.27.0"
