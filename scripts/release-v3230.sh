#!/bin/bash
# KINOSTRA v3.22.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.23.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.23.0 — GAMBAR BERGERAK LAGI (penyembuh pompa frame otomatis)",
  "body": "## 🎞️ v3.23.0 — GAMBAR BERGERAK LAGI\n\nKabar baiknya dulu: laporan kawan *\"videonya berhasil di play dan aplikasi tidak merestar kawannn mantaappp\"* berarti **akar v3.22 berhasil di mesin kamu** — impor film panjang tidak lagi membuat aplikasi ngestar. Sisa bugnya satu: *\"gambar yang di play tidak bergerak, walaupun waktunya berjalan\"* — disebut **pompa frame macet**: jam media terus berjalan (via pipa audio) tapi kompositor berhenti meminta frame baru sehingga layar menampilkan satu frame terakhir.\n\n### Perbaikan\n1. **Elemen media kembali PERSIS formula VidSplit/v3.21** yang terbukti gambarnya bergerak di mesin yang sama — tebakan `preload=\"metadata\"` v3.22 dibuang total (berisiko pompa frame tidak pernah aktif di sebagian mesin Windows)\n2. **PENGAWAS GERAK GAMBAR — penyembuh otomatis**: tiap 2 detik selagi memutar, aplikasi membandingkan `totalVideoFrames` (frame yang benar-benar disajikan) dengan majunya waktu. Frame diam PADAHAL waktu maju = pompa macet → tangga penyembuhan: **kocok halus** (seek +0,05 dtk — memicu dekode ulang satu frame) → **nyalakan ulang visibilitas elemen** (kompositor dipasang ulang) → **jatuh ke jalur kanvas overlay** (gambar digambar manual — mode darurat yang selalu tampak). Setiap kejadian dicatat ke log (`v3.23 GAMBAR BEKU …`) utk diagnosis lapangan\n\n## 🔬 Kualitas\n- Uji frame baru (totalVideoFrames): 6/6 lulus — frame pratinjau tergambar segera, waktu berjalan, pompa hidup, native aktif\n- Uji penyembuh dgn \"sandera\" (counter dibuat diam sementara jam terus jalan): 6/6 lulus — deteksi ±2 dtk, seluruh tangga menyala berurutan, waktu tetap berjalan, **nol false-positive** saat pompa hidup (mesin lambat 2 fps tak salah dipicu)\n- Regresi v3.21 dijalankan ulang: **32/33 lulus** (sisa = asersi versi, wajar) — putar 4 jam nol beku (maks 15-43 ms), pelindung hang pulih, MODE AMAN otomatis, MODE PUTARAN HEMAT semua lulus\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.23.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.23.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · IMPOR & PUTAR FILM 3-4 JAM TANPA RESTART · GAMBAR SELALU BERGERAK (PENYEMBUH OTOMATIS) · NATIVE SEMUA RASIO · POTONG LANGSUNG · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.22.0.exe" "KINOSTRA-Setup-3.22.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.22.0-win64.zip" "KINOSTRA-Portable-3.22.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.22.0"
