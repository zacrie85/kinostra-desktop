#!/bin/bash
# KINOSTRA v3.12.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.12.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.12.0 — AUTO-FIT JUDUL COVER + COVER BERSIH",
  "body": "## 🎬 v3.12.0 — JUDUL COVER MASUK SEMUA + COVER BERSIH\n\nDua upgrade persis permintaan kawan:\n\n### 1) AUTO-FIT JUDUL COVER — judul panjang MASUK SEMUA\n- Dulu: judul video panjang **terpotong** karena font cover sangat besar. Kini **font otomatis mengecil bertahap di SEMUA 10 LAYOUT** sampai **seluruh kata judul tercakup** — tulisan di cover sama persis dengan judul videonya\n- Layout **BANNER** otomatis memakai 2–3 baris rapat bila satu baris tidak muat\n- Judul pendek **tidak berubah sedikit pun** — ukuran besar persis v3.11 (diuji piksel identik)\n\n### 2) COVER BERSIH — tangkapan adegan tanpa teks video\n- Frame video yang diambil otomatis untuk latar cover (ADEGAN) kini diambil **TANPA teks overlay video**: judul di layar, label PART/EPISODE, deskripsi, subtitel, watermark, frame neon — TIDAK ikut tertangkap lagi\n- Satu-satunya tulisan di cover = **judul + part/episode sesuai PENGATURAN COVER** (template NOVACUT) — cover bersih seperti referensi\n- Pratinjau modul 08B & tombol MAINKAN PRATINJAU memakai mesin bersih yang sama → **pratinjau = hasil ekspor persis**\n- Teks overlay di VIDEO tetap tampil normal di bagian konten — hanya tangkapan cover yang dibersihkan\n\n## 🔬 Kualitas\n- Uji otomatis baru **23/23 lulus**: auto-fit 10 layout (12 kata masuk semua, judul pendek piksel-identik v3.11), cover bersih (nol piksel teks video di tangkapan + ekspor nyata 3 part: nol judul/EPISODE ikut, judul panjang utuh 3 baris, badge PART tetap, transisi FLASH tetap, judul video tetap terbakar di konten)\n- Regresi: v3.11 33/34 (1 = label versi, wajar) · v3.10 29/30 (1 = asersi versi, wajar)\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.12.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.12.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · AUTO-FIT JUDUL COVER · COVER BERSIH · MESIN COVER NOVACUT · 100 TEMPLATE · 28 TRANSISI COVER→VIDEO · 8 ANIMASI TEKS · KEN BURNS · POTONG LANGSUNG TANPA RE-ENCODE · RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.12.0.exe" "KINOSTRA-Setup-3.12.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.12.0-win64.zip" "KINOSTRA-Portable-3.12.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.12.0"
