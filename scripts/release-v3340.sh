#!/bin/bash
# KINOSTRA v3.34.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.34.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.34.0 — FRAME MANUAL PNG/JPG SENDIRI (gambar sendiri utk frame judul & part — geser & tarik di pratinjau)",
  "body": "## 🖼️ v3.34.0 — FRAME MANUAL PNG/JPG SENDIRI\n\nPermintaan kawan terpenuhi: **bisa memasukkan gambar sendiri (PNG/JPG) untuk dijadikan frame JUDUL & EPISODE/PART di video** — posisinya diklik-tahan-lalu digeser kemanapun, ukurannya ditarik dari tepi kiri/kanan/atas/bawah untuk mengatur lebar & tinggi, atau diisi lewat angka.\n\n### Cara pakai\n- Di menu **FRAME PART DI VIDEO** & **FRAME JUDUL DI VIDEO** ada gaya baru **PNG/JPG SENDIRI** (kini 17 pilihan per menu). Pilih gaya itu → panel muncul → **PILIH GAMBAR (PNG/JPG)** — PNG transparan paling pas utk bingkai; JPG/WebP/SVG juga bisa.\n- Di PRATINJAU muncul kotak putus-putus amber: **klik-tahan badan kotak → geser ke mana saja**; **tarik pegangan tepi kiri/kanan/atas/bawah → atur lebar & tinggi**; selalu terkampas di dalam layar.\n- Atau isi angka: **POSISI X · POSISI Y · LEBAR · TINGGI (%)** — sinkron dua-arah dgn geser-tarik; tombol **POSISI AWAL** mengembalikan bawaan.\n- Teks tetap DI ATAS gambar (bingkai di belakang tulisan), ikut animasi masuk, dan **pratinjau = hasil ekspor persis** (satu mesin gambar). Ukuran dalam % layar → bebas resolusi output (720p-4K serupa).\n- Ikut preset SIMPAN/PAKAI (posisi + ukuran + gambar); mode PNG dihitung efek di gerbang POTONG LANGSUNG.\n\n## 🔬 Kualitas\n- **Uji baru 15/15** di aplikasi nyata (Electron via CDP): katalog 17+17 chip · muat gambar otomatis aktifkan mode · kotak = posisi persis · gambar terukur tergambar di rect (jalur PART intro & JUDUL) · geser & tarik 4 tepi & kampas layar & input angka & preset roundtrip · **ekspor nyata 1 part MP4** dgn kedua bingkai PNG tanpa fatal · swatch warna tetap 34px\n- Regresi: v3.31, v3.30, v3.29, modul 16, ekspor anti-beku, v3.28, v3.27, v3.14, frame, overlay, v3.33 — dijalankan ulang.\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.34.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.34.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · EKSPOR & SPLIT = PROSES v3.16.0 · SUARA DIJAMIN IKUT (SEMUA FORMAT, TERMASUK FILM UTUH 3-4 JAM) · GERBANG SUARA + MUSIK OTOMATIS · FRAME MANUAL PNG/JPG SENDIRI (GESER & TARIK) · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K"",
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

upload "dist_out/KINOSTRA-Setup-3.34.0.exe" "KINOSTRA-Setup-3.34.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.34.0-win64.zip" "KINOSTRA-Portable-3.34.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.34.0"
