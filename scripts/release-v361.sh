#!/bin/bash
# KINOSTRA v3.6.1 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.6.1",
  "target_commitish": "main",
  "name": "KINOSTRA v3.6.1 — TULISAN PART DI SAMPUL (modul 08B)",
  "body": "## 🎬 Upgrade Cover: TULISAN PART DI SAMPUL (modul 08B)\nSetiap sampul sekarang mencetak **nomor part otomatis di bawah judul** — persis sampul serial di channel:\n- **EKSPORT & SPLIT MP4** — part 1 tercetak **PART 1**, part 2 **PART 2**, dst. di sampul masing-masing\n- **BATCH EKSPOR — SEMUA VIDEO DI KOTAK** — tiap video & part di kotak dapat nomornya sendiri\n- **GABUNG VIDEO tetap polos** — gabungan bukan part, sampul gabungan tanpa nomor\n\n**Enam pilihan format** (default **PART**):\n- **TANPA** — cover polos tanpa nomor\n- **PART / EPISODE / EPS / BAGIAN / #** — contoh: `PART 1` · `EPISODE 2` · `#3`\n\n**Posisi pas & gaya serasi**: tepat **di bawah judul** (tepi bawah, tengah) — huruf krem + garis hitam + glow merah lembut, renggang sinematik, otomatis mengecil bila label panjang → terbaca di sampul apa pun, cocok dengan papan judul STUDIO SAMPUL.\n\nTetap **satu pass encoding** — tulisan digambar saat frame cover di-encode, tanpa re-encode, kecepatan ekspor tetap.\n\n## 🔬 Kualitas\n- Uji otomatis baru **22/22 lulus**: chip TULISAN PART (6 pilihan, default PART), ganti label EPS/TANPA/#/PART, pixel `drawCoverFrame` (TANPA = polos, PART 1 = krem+garis hitam, \"PART 1\" ≠ \"PART 2\"), **EKSPOR NYATA SPLIT 2 PART** (kedua part 6 dtk, label terbukti di file final, PART_01 ≠ PART_02, konten utuh), mode TANPA ekspor polos, GABUNG tetap polos\n- Regresi suite v3.6 **29/29 lulus** — cover pembuka, durasi, audio bungkam, split & gabung tak berubah\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.6.1.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.6.1-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · TULISAN PART DI SAMPUL · COVER PEMBUKA · ZOOM PEMBICARA FADE/CUT · RESOLUSI 720p-4K · BACKSOUND MP3 · GABUNG VIDEO · TTS NARASI",
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

upload "dist_out/KINOSTRA-Setup-3.6.1.exe" "KINOSTRA-Setup-3.6.1.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.6.1-win64.zip" "KINOSTRA-Portable-3.6.1-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.6.1"
