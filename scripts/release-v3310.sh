#!/bin/bash
# KINOSTRA v3.31.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.31.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.31.0 — PEMINDAI AUDIO SENYAP (deteksi sumber tanpa suara + solusi backsound)",
  "body": "## 🔍 v3.31.0 — PEMINDAI AUDIO SENYAP (deteksi sumber tanpa suara)\n\nBedah file nyata dari kawan di v3.30 membuktikan sesuatu yang penting: **file sumbernya sendiri hening total** — puncak volume **−91 dB** sepanjang video. Track AAC-nya ADA, tetapi isinya kosong. Ini umum terjadi pada film split-an hasil unduhan: pengunggah sering menghapus atau mengganti audio untuk menghindari deteksi hak cipta. Aplikasi menyalin audio asli dengan setia — yang aslinya memang tidak berisi suara — sehingga hasil ekspor pun hening.\n\n### Kini KINOSTRA memeriksa audio sumber sejak impor\n- Puncak sampel audio diukur sekali per video — saat **impor** (file kecil) dan saat **ekspor** (buffer siap, termasuk jalur demux/decode penuh v3.30).\n- Jika sumber ternyata hening total (puncak di bawah −60 dBFS), muncul **peringatan jelas**: \"AUDIO ASLI VIDEO SENYAP — file sumber TIDAK berisi suara (bukan gangguan aplikasi)\". Modul 11 juga diberi tanda ⚠.\n- Peringatan langsung memberi solusi: isi suara lewat **BACKSOUND MP3 SENDIRI** (modul 11 MUSIK & NARASI AI) — hasil ekspor akan bernada dengan musik pilihan kawan.\n- Bila MUSIK/BACKSOUND sudah terpasang, pesan menyesuaikan: hasil ekspor akan berisi MUSIK/BACKSOUND.\n\n## 🔬 Kualitas\n- **Uji baru 12/12**: deteksi senyap di impor (toast + tanda ⚠ di modul 11) · ekspor sumber senyap = salinan setia (≤ −80 dB) · **dengan MUSIK terpasang hasil ekspor BERNADA (> −55 dB)** · sumber bernada (−16 dB) tidak salah alarm\n- Regresi: v3.30 (WebM + panel 424px) **9/9** · v3.29 (MP4) **7/7** · modul 16 **14/14** · ekspor anti-beku **7/7** · v3.28 **11/11** · v3.27 **12/12** · v3.14 **22/22** · frame **6/6** · overlay **6/6**\n\n## 💡 Catatan untuk kasus \"hasil split tidak ada suaranya\"\nPutar dulu file sumbernya di pemutar mana pun: bila sumber juga tidak bersuara, suara aslinya memang tidak ada di file — aktifkan BACKSOUND. Bila sumber bersuara, v3.30/v3.31 menjamin audio ikut untuk semua format (MP4/MKV/WebM/FLV/MP3).\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.31.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.31.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · EKSPOR & SPLIT = PROSES v3.16.0 · SUARA DIJAMIN IKUT (SEMUA FORMAT) · PEMINDAI AUDIO SENYAP · IMPOR & PUTAR FILM 3-4 JAM TANPA RESTART · POTONG LANGSUNG · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.31.0.exe" "KINOSTRA-Setup-3.31.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.31.0-win64.zip" "KINOSTRA-Portable-3.31.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.31.0"
