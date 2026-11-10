#!/bin/bash
# KINOSTRA v3.11.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.11.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.11.0 — MESIN COVER NOVACUT (100 TEMPLATE + 28 TRANSISI)",
  "body": "## 🎬 v3.11.0 — Mesin Cover Baru: PORT PENUH DARI NOVACUT STUDIO\n\nSesuai permintaan kawan: fitur cover KINOSTRA **diganti total** dengan sistem cover milik **NOVACUT Studio** — cara pembuatan cover, efek cover, transisi cover, transisi cover → video, animasi masuk judul & tulisan PART/EPISODE/BAGIAN. Semua dikerjakan 100% offline.\n\n### 1) PEMBUATAN COVER — 100 TEMPLATE\n- **10 LAYOUT × 10 PALET = 100 template**: IMPACT TENGAH, LOWER THIRD, BANNER ATAS, GRADIEN SISI, KOTAK JUDUL, NEON GLOW, BAR SINEMA, STICKER BADGE, OUTLINE RAKSASA, PITA DIAGONAL × Cyber Neon, Sunset Fire, Gold Luxury, Ice Cool, Toxic Green, Royal Purple, Blood Red, Monochrome, Candy Pop, Ocean Deep\n- Latar: **ADEGAN VIDEO** (sumber OTOMATIS TIAP PART / 1 SAMPUL SEMUA PART tetap jalan) atau gambar MANUAL, atau **HITAM** polos + vignette\n- **Bingkai cover**: TANPA / KLASIK (emas ganda + sudut) / MODERN (garis bersih) / FUTURISTIK (HUD menyala) — transparan 75%\n- Pratinjau template **langsung di panel** + tombol **MAINKAN PRATINJAU** (cover → transisi → video, berulang)\n\n### 2) EFEK COVER\n- Latar cover bergerak **KEN BURNS**: ZOOM IN / ZOOM OUT / PAN X / PAN Y / DIAM — persis efek klip cover NOVACUT\n\n### 3) TRANSISI COVER → VIDEO — 28 GAYA\n- **Trailer Hollywood (8)**: Flash Snap, Whip Pan, Zoom Punch, Zoom Blast, RGB Glitch, Impact Shake, Cinematic Bars, Film Burn\n- **Iklan Produk (11)**: Slide Kiri/Kanan/Atas/Bawah, Push Parallax, Diagonal Wipe, Iris Circle, Window Blinds, Split Reveal, Bounce Pop, Flare Sweep\n- **Sinematik (4)**: Cross Dissolve, Dip ke Hitam, Dip ke Putih, Blur Dissolve\n- **Trend Viral (5)**: Spin Swap, Pixelate, TV Static, Chromatic Slide, Mosaic Reveal\n- Slider **durasi transisi 0.2–1.5 dtk**; TANPA = potong langsung; berlaku di EKSPORT & SPLIT, BATCH & GABUNG (cover sekali di pembuka)\n\n### 4) ANIMASI MASUK TEKS — 8 GAYA (COVER + VIDEO)\n- **FADE, RISE UP, TYPEWRITER (+kursor), TITLE SLAM (menghantam), NEON FLICKER, TRACKING, GLITCH (RGB), WIPE**\n- Di **cover**: judul & tulisan part masuk dengan animasi pilihan (default TITLE SLAM seperti NOVACUT)\n- Di **video** (modul 02): **ANIMASI MASUK JUDUL** & **ANIMASI MASUK PART** — judul & label PART/EPISODE/BAGIAN masuk dengan animasi di awal tiap part\n- Setelah masa masuk, tampilan = persis perilaku lama (nol jejak)\n\n## 🔬 Kualitas\n- Uji otomatis baru **34/34 lulus**: 10 layout × 10 palet tergambar benar, **28 transisi** diuji piksel (ujung p=0/p=1 persis cover/video, frame tengah unik semua), animasi teks masuk-berhenti-bersih, ekspor nyata 3 part (cover + badge + kilat FLASH + isi merah/hijau/biru + judul terbakar), gerbang POTONG LANGSUNG tetap aman\n- Uji mesin potong langsung Node **12/12 lulus**\n- Regresi v3.0–v3.10 dijalankan ulang\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.11.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.11.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · MESIN COVER NOVACUT · 100 TEMPLATE · 28 TRANSISI COVER→VIDEO · 8 ANIMASI TEKS · KEN BURNS · 10 FRAME JUDUL DI VIDEO · POTONG LANGSUNG TANPA RE-ENCODE · POSISI JUDUL SAMPAI BAWAH · PART SAMPAI ATAS · RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.11.0.exe" "KINOSTRA-Setup-3.11.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.11.0-win64.zip" "KINOSTRA-Portable-3.11.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.11.0"
