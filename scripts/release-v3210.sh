#!/bin/bash
# KINOSTRA v3.21.0 — buat release + upload 3 aset (token dari remote git, tak dicetak)
set -e
cd /home/z/my-project
export GH_TOKEN=$(git remote get-url origin | sed -n 's|https://\([^@]*\)@.*|\1|p')
: "${GH_TOKEN:?token tidak ditemukan di remote}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.21.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.21.0 — FORMULA VIDSplit: teknik playback aplikasi kembar yang terbukti lancar 4 jam diadopsi utuh",
  "body": "## 🎬 v3.21.0 \u2014 FORMULA VIDSplit\n\nLaporan dari v3.20: *\"masih error \u2014 setiap video dengan durasi 3 atau 4 jam lebih dimasukan, aplikasi langsung ngerestar sendiri saat videonya di play\"*. Dan kabar baik yang menolong: **aplikasi kembar VidSplit v3.9.2 terbukti memutar video 4 jam LANCAR di mesin yang sama**. Berarti bedanya ada di KODE \u2014 dan kini formula stabil VidSplit diadopsi utuh ke KINOSTRA.\n\n### 🔬 Hasil bedah VidSplit v3.9.2 (referensi yang benar)\n- Elemen `<video>` asli **SELALU yang menjadi tampilan** di semua mode \u2014 tidak pernah disembunyikan lalu digambar ulang\n- Overlay judul/Part = lapisan DOM/kanvas transparan terpisah\n- Latar blur = **kanvas MINI 90\u00d7160** (blur 4 px, 10 fps) yang dibesarkan lewat CSS \u2014 murah di GPU lemah\n- **NOL drawImage(video) ke kanvas besar saat memutar**\n\n### 🕳️ Akar sisa hang di KINOSTRA v3.20\nv3.20 sudah menyalakan jalur native \u2014 tetapi hanya untuk rasio **16:9**. Rasio **9:16** (yang dipakai konten potongan) masih jatuh ke jalur kanvas penuh: `drawImage(video)` 24\u00d7/dtk + latar blur 1080\u00d71920 \u2014 persis titik yang membekukan GPU lemah. Selain itu antrean thumbnail kotak video masih jalan selagi video diputar (dekode film ke-2/3/4/5 berdesakan dengan pemutaran \u2014 persis alur \"impor 5 video lalu langsung play\").\n\n### ✅ Yang dipakai v3.21 (formula VidSplit utuh)\n1. **Jalur native di SEMUA rasio** \u2014 16:9 maupun 9:16; video asli tampil, overlay transparan di atasnya, nol drawImage(video) saat memutar\n2. **Latar blur 9:16 saat memutar = kanvas mini 90\u00d7160, 10 fps, blur 4 px** dibesarkan CSS (dulu kanvas penuh 1080\u00d71920)\n3. **Antrean thumbnail DITAHAN selagi video diputar** \u2014 lanjut otomatis saat pause/berhenti\n4. **MODE PUTARAN HEMAT kini hanya memperlambat overlay ke 5 fps** \u2014 jalur native tetap aktif, karena justru itulah jalur yang terbukti aman\n5. Efek khusus (zoom, ken burns, filter warna, frame bertema, zoom pembicara, transisi) tetap lewat jalur kanvas penuh \u2014 kualitas ekspor tak tersentuh\n\n## 🔬 Kualitas\n- Uji baru **33/33 lulus**: putar film 4 jam di 16:9 **dan** 9:16+blur \u2192 nol beku main-thread >2,5 dtk (terukur maks 37 ms), latar mini \u00b110 fps, antrean thumbnail tertahan saat memutar & lanjut saat pause; regresi pelindung v3.19 lulus (pulih #1, MODE AMAN #2); mode aman \u00d72 hang \u2192 mode hemat dengan native tetap + overlay 5 fps\n- Regresi v3.17.2 **38/43** (5 sisa = asersi versi, wajar)\n\n## 📦 Instalasi\n- **Setup**: `KINOSTRA-Setup-3.21.0.exe` (pasang di atas versi lama; setelan & preset tersimpan)\n- **Portable**: ekstrak `KINOSTRA-Portable-3.21.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline \u00b7 Windows 10/11 x64 \u00b7 Electron 33 \u00b7 FORMULA VIDSplit (NATIVE SEMUA RASIO) \u00b7 LATAR BLUR MINI 10 FPS \u00b7 THUMBNAIL ANTI-BERDESakan \u00b7 PELINDUNG PUTAR \u00b7 MODE PUTARAN HEMAT \u00b7 LOG CRASH PERMANEN \u00b7 17 MODUL \u00b7 PRESET \u00b7 POTONG LANGSUNG \u00b7 MESIN COVER NOVACUT \u00b7 RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.21.0.exe" "KINOSTRA-Setup-3.21.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.21.0-win64.zip" "KINOSTRA-Portable-3.21.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.21.0"
