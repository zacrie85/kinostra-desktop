#!/bin/bash
# KINOSTRA v3.8.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.8.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.8.0 — 1 SAMPUL SEMUA PART (modul 08B)",
  "body": "## 🎬 Upgrade Cover: 1 SAMPUL SEMUA PART (modul 08B)\nSesuai permintaan: **cukup SATU cover per film** — tidak perlu memindai tiap part:\n- **SUMBER COVER → 1 SAMPUL SEMUA PART → AKTIF** — selesai\n- **Pindai SEKALI per film** — adegan terbaik dicari di sekitar **menit 5–7** film (aman dari intro/kredit; video pendek otomatis proporsional) → sampul yang sama dipakai **SEMUA part** film itu\n- **Contoh**: film 60 menit → 10 part = cukup 1 cover; film 15 menit → 5 part = cukup 1 cover dari film itu sendiri (BATCH EKSPOR: tiap film memindai window-nya masing-masing)\n- **Nomor part tetap otomatis** — sampulnya sama, tapi **PART 1 / PART 2 / …** tetap tercetak di bawah judul sesuai part tiap file (PART/EPISODE/EPS/BAGIAN/#)\n- **Bingkai menarik tetap lengkap**: KLASIK (emas ganda + aksen sudut) · GARIS · SINEMA (letterbox) · TANPA + judul otomatis dari nama file atau ketikan sendiri\n- **OTOMATIS TIAP PART (v3.7) tetap tersedia** — pilih kalau ingin cover tiap part berbeda-beda; **PRATINJAU** menyesuaikan mode\n- **GABUNG VIDEO** polos tanpa nomor; **MANUAL** (impor/Studio Sampul) tetap utuh; tetap **satu pass encoding** tanpa re-encode\n\n## 🔬 Kualitas\n- Uji otomatis baru **30/30 lulus** — termasuk ekspor nyata: split 3 part mode 1-sampul → **ketiga sampul nyaris identik (<4% piksel beda, hanya digit label)** dan tidak menyentuh adegan di luar window menit 5–7; mode tiap-part sebagai kontras → merah/hijau/biru **>25% beda**\n- Regresi v3.6–v3.7 bersih — perilaku cover manual, tiap-part, durasi, split & gabung tak berubah\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.8.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.8.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · 1 SAMPUL SEMUA PART · COVER OTOMATIS · TULISAN PART DI SAMPUL · ZOOM PEMBICARA FADE/CUT · RESOLUSI 720p-4K · BACKSOUND MP3 · GABUNG VIDEO · TTS NARASI",
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

upload "dist_out/KINOSTRA-Setup-3.8.0.exe" "KINOSTRA-Setup-3.8.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.8.0-win64.zip" "KINOSTRA-Portable-3.8.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.8.0"
