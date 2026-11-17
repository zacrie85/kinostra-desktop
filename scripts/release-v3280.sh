#!/bin/bash
# KINOSTRA v3.28.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.28.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.28.0 — 15 frame judul (elegan transparan) + 15 frame PART futuristik transparan",
  "body": "## ✨ v3.28.0 — 15 FRAME JUDUL & 15 FRAME PART FUTURISTIK TRANSPARAN\n\nDua upgrade di modul **03 JUDUL & PART OTOMATIS** sesuai permintaan kawan:\n\n### 1. Frame judul kini 15 gaya (+5 ELEGAN TRANSPARAN)\n- **KACA HALUS** — panel kaca bening sangat tipis + garis putih lembut\n- **KRISTAL BENING** — kurungan sudut putih tipis panjang + kilau atas\n- **GARIS BENING** — hairline membulat + berlian kecil di kiri-kanan\n- **MEWAH BENING** — kaca transparan + hairline emas di dalam\n- **ETERE** — gradasi putih pudar kiri-kanan, ringan seperti kabut\n\n### 2. FITUR BARU: FRAME PART DI VIDEO — 15 gaya futuristik transparan\nTulisan PART/EPISODE/EPS/BAGIAN/# kini bisa diberi bingkai (chips baru di modul 03):\n**HUD SUDUT · GARIS HUD · KAPSUL BENING · KURUNG TEKNO · CHIP DATA · SEGI ENAM · PITA TEKNO · GARIS GANDA HUD · TITIK ORBIT · FASE SUDUT · PANEL SISTEM · SINAR SAMPING · JARING TITIK · GARIS MURNI · BERKAS CAHAYA**\n\nBerlaku di **bumper intro & label pojok**, ikut skala ukuran part & warna part (v3.27), ikut tersimpan di **preset**, dan **pratinjau = hasil ekspor persis** (satu mesin gambar). Semua frame deterministik tanpa animasi — aman untuk ekspor.\n\n## 🔬 Kualitas\n- **Uji baru 11/11**: chips 16+16, pixel-DIFF semua 15 frame judul & 15 frame part di bumper intro, label pojok (kapsul & hud), preset menyimpan & memulihkan frame part + judul, overlay native gambar ulang, ekspor nyata 1 part dengan frame HUD + merah + 60%\n- Regresi: uji ukuran/warna part v3.27 **12/12** · v3.14 **22/22** · modul 16 **14/14** · frame **6/6** · overlay **6/6** · ekspor anti-beku **7/7**\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.28.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.28.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · IMPOR & PUTAR FILM 3-4 JAM TANPA RESTART · GAMBAR SELALU BERGERAK (JALUR VIDSPLIT + 3 DETEKTOR BEKU) · EKSPOR ANTI-BEKU 4 LAPIS · POTONG LANGSUNG · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.28.0.exe" "KINOSTRA-Setup-3.28.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.28.0-win64.zip" "KINOSTRA-Portable-3.28.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.28.0"
