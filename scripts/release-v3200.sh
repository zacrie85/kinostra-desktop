#!/bin/bash
# KINOSTRA v3.20.0 — buat release + upload 3 aset (token dari remote git, tak dicetak)
set -e
cd /home/z/my-project
export GH_TOKEN=$(git remote get-url origin | sed -n 's|https://\([^@]*\)@.*|\1|p')
: "${GH_TOKEN:?token tidak ditemukan di remote}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.20.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.20.0 — PEMUTARAN RINGAN: akar 'hang saat diputar' film 4 jam dimatikan",
  "body": "## 🎬 v3.20.0 \u2014 PEMUTARAN RINGAN: akar masalah ditemukan, bukan sekadar dipulihkan\n\nLaporan dari v3.19: *\"masih tidak bisa \u2014 saat videonya di play aplikasi hang dan kemudian merestar; videonya durasi 4 jam; aku memasukan sebanyak 5 video\"*. Kali ini **akarnya benar-benar ditemukan**.\n\n### 🔍 Akar masalah\nSelama ini **video tidak pernah tampil lewat elemen videonya sendiri** \u2014 elemen itu disembunyikan total, dan satu-satunya cara video terlihat adalah `drawImage(video)` ke kanvas pratinjau 1600\u00d7900 **setiap frame** (60\u00d7/dtk) selagi diputar. Di GPU/driver lemah, panggilan itu harus menunggu sinkronisasi dgn GPU yang justru sedang sibuk men-decode film 4 jam \u2192 thread utama membeku \u2192 pelindung mematikan & memuat ulang jendela (terlihat \"ngestart sendiri\"). MODE AMAN v3.19 mematikan komposit GPU, tetapi raster kanvas tetap lewat jalur yang sama \u2014 makanya loop masih bisa berulang.\n\n### ✅ Perbaikan v3.20\n1. **JALUR NATIVE** \u2014 saat video diputar, elemen videonya sendiri ditampilkan di belakang kanvas; kanvas hanya menggambar teks/hiasan transparan. Frame video menuju layar lewat kompositor bawaan browser \u2014 **tanpa satu pun drawImage per frame**\n2. Gambar pratinjau saat memutar dithrottle **15 fps** (jalur kanvas 24 fps) \u2014 teks/hiasan statis, tak ada yang hilang\n3. Latar blur 9:16 saat memutar di-refresh tiap **8 detik** (dulu 1,6 dtk \u2014 blur 1080\u00d71920 tiap 1,6 dtk = ledakan kerja di mesin lemah)\n4. Sorotan part di timeline kini **O(1)** \u2014 film 4 jam = 480 part tidak lagi disapu penuh tiap 80 ms\n5. Thumbnail kotak video tak lagi mem-buffer film penuh (`preload=metadata`)\n6. Efek khusus (zoom, ken burns, filter warna, frame bertema, zoom pembicara, transisi) otomatis kembali ke jalur kanvas \u2014 **kualitas ekspor tidak berubah sama sekali**\n7. Upaya terakhir: hang saat putar ke-2 DI MODE AMAN \u2192 **MODE PUTARAN HEMAT permanen** (pratinjau disederhanakan; pemutaran audio/video tak disentuh). Bisa dimatikan lagi lewat modul 16 \u2192 OPTIMASI\n\n## 📋 Untuk kasus Anda (5 video \u00d7 4 jam)\nImpor 5 video sekaligus aman \u2014 thumbnail berurutan tanpa mem-buffer film, metadata 4 jam terbaca, 480 part tersusun. Saat diputar: pemutaran lewat jalur native \u2014 tanpa beku, tanpa restart.\n\n## 🔬 Kualitas\n- Uji baru **32/32 lulus**: impor 5 video (4 jam + 4 lainnya); putar film 4 jam 47 dtk \u2192 **nol beku main-thread >2,5 dtk (terukur maks 124 ms)**, overlay 15 fps, heap renderer 52 MB, log bersih; jalur native aktif saat putar & turun mulus saat pause; regresi pelindung v3.19 lulus (pulih #1, MODE AMAN #2); mode aman \u00d72 hang \u2192 MODE PUTARAN HEMAT nyala permanen\n- Regresi v3.17.2 **38/43** (5 sisa = asersi versi, wajar)\n\n## 📦 Instalasi\n- **Setup**: `KINOSTRA-Setup-3.20.0.exe` (pasang di atas versi lama; setelan & preset tersimpan)\n- **Portable**: ekstrak `KINOSTRA-Portable-3.20.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline \u00b7 Windows 10/11 x64 \u00b7 Electron 33 \u00b7 PEMUTARAN RINGAN (JALUR NATIVE) \u00b7 PELINDUNG PUTAR \u00b7 MODE PUTARAN HEMAT \u00b7 PEMULIHAN HANG OTOMATIS \u00b7 LOG CRASH PERMANEN \u00b7 AUDIO FILM PANJANG ANTI-CRASH \u00b7 JENDELA ADAPTIF \u00b7 17 MODUL \u00b7 PRESET \u00b7 POTONG LANGSUNG \u00b7 MESIN COVER NOVACUT \u00b7 RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.20.0.exe" "KINOSTRA-Setup-3.20.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.20.0-win64.zip" "KINOSTRA-Portable-3.20.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.20.0"
