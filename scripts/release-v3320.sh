#!/bin/bash
# KINOSTRA v3.32.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.32.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.32.0 — GERBANG SUARA & AUDIO FILM UTUH (akar 'film utuh tanpa suara' + MUSIK OTOMATIS sekali klik)",
  "body": "## 🔊 v3.32.0 — GERBANG SUARA & AUDIO FILM UTUH\n\nTangkapan layar kawan memperlihatkan keterangan: **\"Audio film terlalu besar untuk decode penuh — ekspor lanjut tanpa suara asli\"**. Itulah akar sebenarnya kenapa **ekspor FILM UTUH** selalu tanpa suara: untuk film 3-4 jam, aplikasi mencoba menyiapkan SELURUH audio film sebagai satu buffer memori (film 3,5 jam = ±4,9 GB) — alokasi itu gagal di kebanyakan mesin, lalu ekspor berjalan **tanpa track audio**. Ekspor sebagian part tidak pernah kena (rentang kecil), ekspor penuh (mis. 71 part × 183 dtk) selalu kena. Video pendek/normal tidak pernah kena — persis laporan \"video lain bisa, khusus video ini tidak\".\n\n### Kini audio ekspor BERSEGMENT — RAM selalu terkendali berapa pun panjang film\n- Audio disiapkan **per segmen 180 detik** sesuai kebutuhan tiap part (cache ±8 segmen, ±550 MB) — suara asli ikut di SEMUA part, dari awal sampai akhir film 3-4 jam.\n- Antrian decode berurutan (satu decoder pada satu waktu) — bebas rebutan decoder era v3.17.\n- Rentang ekspor kecil tetap memakai jalur buffer penuh v3.30 yang terbukti.\n\n### GERBANG SUARA — tidak ada lagi file senyap tanpa penjelasan\n- Deteksi sumber hening kini menyala **sejak impor** juga untuk film panjang (dulu baru saat ekspor), dengan koreksi otomatis bila ternyata ada suara di bagian lain film.\n- Sebelum ekspor, bila sumber senyap & tanpa musik: konfirmasi **\"AUDIO ASLI VIDEO SENYAP\"** dengan tombol **🎵 PAKAI MUSIK OTOMATIS & EKSPOR** — sekali klik, skor musik disusun otomatis (dibatasi 300 detik & diputar berulang — aman di RAM) dan seluruh hasil ekspor/split bernada. Alternatif: \"TETAP EKSPOR (HENING)\" atau \"BATAL\".\n- POTONG LANGSUNG ikut diberi peringatan (audio asli disalin apa adanya — sumber senyap → hasil senyap).\n- Setiap part dievaluasi puncak audionya saat dirender; **modal hasil kini menampilkan STATUS SUARA** (SUARA: BERNADA (audio asli) / BERNADA (musik) / ⚠ HENING + cara memperbaiki) dan **versi KINOSTRA** di setiap laporan.\n\n## 🔬 Kualitas\n- **Uji baru 16/16** (film utuh 66 mnt): deteksi senyap sejak impor (−91 dB) · gerbang pra-ekspor muncul · MUSIK OTOMATIS → hasil **−1,1 dB (bernada)** · suara ASLI ikut di rentang akhir 3.600 dtk via SEGMENT (−37,1 dB) · tanpa alarm palsu pada sumber bernada · rentang kecil tetap jalur monolitik v3.30\n- Regresi: v3.31, v3.30, v3.29, modul 16, ekspor anti-beku, v3.28, v3.27, v3.14, frame, overlay — seluruh suite lama dijalankan ulang.\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.32.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.32.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · EKSPOR & SPLIT = PROSES v3.16.0 · SUARA DIJAMIN IKUT (SEMUA FORMAT, TERMASUK FILM UTUH 3-4 JAM) · GERBANG SUARA + MUSIK OTOMATIS · PEMINDAI AUDIO SENYAP · IMPOR & PUTAR FILM 3-4 JAM TANPA RESTART · POTONG LANGSUNG · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.32.0.exe" "KINOSTRA-Setup-3.32.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.32.0-win64.zip" "KINOSTRA-Portable-3.32.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.32.0"
