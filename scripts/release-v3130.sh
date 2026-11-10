#!/bin/bash
# KINOSTRA v3.13.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.13.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.13.0 — SLIDER UKURAN TULISAN PART COVER",
  "body": "## 🎬 v3.13.0 — UKURAN TULISAN PART COVER KINI BISA DIATUR\n\nUpgrade persis permintaan kawan:\n\n### SLIDER UKURAN TULISAN PART (modul 08B)\n- Tulisan **PART / EPISODE / EPS / BAGIAN / #** di cover kini **bisa dikecilkan & dibesarkan** sesuai selera — geser slider **UKURAN TULISAN PART**: **50% sampai 250%** (normal = 100%)\n- Berlaku di **ke-10 layout & ke-10 palet** (100 template NOVACUT) — badge, strip, dan kotak latar tulisan part **otomatis ikut menyesuaikan** ukurannya agar teks tetap muat di dalamnya (layout Kotak, Sticker & Outline adaptif dgn lebar teks)\n- **Pratinjau cover berubah langsung** saat slider digeser; hasil ekspor = pratinjau persis (satu mesin gambar NOVACUT)\n- Slider 100% = tampilan **piksel identik** dengan v3.12 (diuji nol-regresi)\n\n## 🔬 Kualitas\n- Uji otomatis baru **21/21 lulus**: smoke slider (50–250%), nol-regresi piksel ps=1 di 6 layout geometri, area tinta monoton 60%<100%<200% di 10 layout, lebar badge skala linear (0.6×/1.98×), layer judul tak tersentuh, jalur UI slider→state→pratinjau→status, **ekspor nyata 3 part dgn slider 200%: badge PART terukur 142px = teoretis 142px**, judul tetap utuh (auto-fit), cover tetap bersih (nol teks video), transisi FLASH tetap, gerbang POTONG LANGSUNG tetap\n- Regresi: v3.12 22/23 (1 = asersi versi, wajar) · v3.11 33/34 (1 = label versi, wajar) · v3.10 29/30 (1 = asersi versi, wajar)\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.13.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.13.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · UKURAN TULISAN PART 50–250% · AUTO-FIT JUDUL COVER · COVER BERSIH · MESIN COVER NOVACUT · 100 TEMPLATE · 28 TRANSISI COVER→VIDEO · 8 ANIMASI TEKS · KEN BURNS · POTONG LANGSUNG TANPA RE-ENCODE · RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.13.0.exe" "KINOSTRA-Setup-3.13.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.13.0-win64.zip" "KINOSTRA-Portable-3.13.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.13.0"
