#!/bin/bash
# KINOSTRA v3.14.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.14.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.14.0 — UKURAN TULISAN PART DI VIDEO",
  "body": "## 🎬 v3.14.0 — UKURAN TULISAN PART DI VIDEO KINI BISA DIATUR\n\nUpgrade persis permintaan kawan — kali ini yang **DI DALAM VIDEO** (bukan cover):\n\n### SLIDER UKURAN TULISAN PART DI VIDEO (modul 02)\n- Tulisan **PART / EPISODE / EPS / BAGIAN / #** yang terbakar **DI DALAM VIDEO** kini **bisa dikecilkan & dibesarkan** sesuai selera — geser slider **UKURAN TULISAN PART DI VIDEO** di menu **02 JUDUL & PART OTOMATIS**: **50% sampai 250%** (normal = 100%)\n- Berlaku di **kedua gaya tampil**: **BUMPER INTRO** (tulisan besar di tengah layar di awal tiap part — font, garis amber atas-bawah & sub-informasi SEGMEN ikut proporsional) dan **SELALU TAMPIL** (label pojok — strip amber & angka /total ikut proporsional)\n- Semua **prefix** (PART/EPISODE/EPS/BAGIAN/#) sama-sama terskala, kedua mode split ikut (PER DURASI & PER ADEGAN)\n- **8 animasi masuk part tetap akurat** (FADE, RISE UP, TYPEWRITER, TITLE SLAM, NEON FLICKER, TRACKING, GLITCH, WIPE) — ukuran font & spasi huruf terskala ikut diteruskan ke mesin animasi\n- **Pratinjau berubah langsung** saat slider digeser; hasil ekspor = pratinjau persis (satu mesin gambar compose)\n- Slider 100% = tampilan **piksel identik** dengan v3.13 (diuji nol-regresi)\n\n## 🔬 Kualitas\n- Uji otomatis baru **22/22 lulus**: smoke slider (50–250% default 100%), pratinjau piksel langsung dari mesin compose (tinggi tinta monoton **34 < 67 < 135 px**, maxH 100% = rumus lama v3.13 ±25%, ratio 2.01, area tinta monoton, kembali ke 100% = piksel kembali persis), jalur UI slider→state→label→toast, **ekspor nyata 6 part via jalur UI: tinggi 200% = 107px ≈ 1.98× (100% = 54px), lebar 418px ≈ 1.99× (210px)**, JUDUL di video sama persis (tak tersentuh), intro part 3 juga 200%, **pojok SELALU TAMPIL 200% terukur 169px ≈ teoretis 168px**, gerbang POTONG LANGSUNG tetap\n- Regresi: v3.13 20/21 (1 = asersi versi, wajar) · v3.12 22/23 (1 = asersi versi, wajar) · v3.11 33/34 (1 = label versi, wajar) · fastcut node 12/12\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.14.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.14.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · UKURAN TULISAN PART DI VIDEO 50–250% · UKURAN TULISAN PART COVER · AUTO-FIT JUDUL COVER · COVER BERSIH · MESIN COVER NOVACUT · 100 TEMPLATE · 28 TRANSISI COVER→VIDEO · 8 ANIMASI TEKS · KEN BURNS · POTONG LANGSUNG TANPA RE-ENCODE · RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.14.0.exe" "KINOSTRA-Setup-3.14.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.14.0-win64.zip" "KINOSTRA-Portable-3.14.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.14.0"
