#!/bin/bash
# KINOSTRA v3.26.1 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.26.1",
  "target_commitish": "main",
  "name": "KINOSTRA v3.26.1 — Obat ekspor beku: 'render berhenti merespon 45 detik' dituntaskan",
  "body": "## 🛠️ v3.26.1 — OBAT \"GAGAL: RENDER BERHENTI MERESPON 45 DETIK\" SAAT EKSPOR & SPLIT\n\nLaporan kawan — ekspor & split berhenti dengan pesan *\"GAGAL: render berhenti merespon 45 detik\"* — sudah dibedah sampai akar dan dituntaskan 4 lapis:\n\n### Yang dibenahi\n1. **Penjaga antrean 20 detik di dua loop yang dulu telanjang**: loop **frame COVER** (dirender PALING AWAL — itulah kenapa error muncul *begitu* ekspor mulai) dan loop **MODE KILAT**. Bila encoder GPU wedged, dulu loop berputar tanpa akhir → semua slot diam → watchdog 45 detik → GAGAL. Kini macet terdeteksi cepat → **otomatis diulang dengan encoder software** (elemen video & encoder segar)\n2. **Watchdog global kini mencatat kegagalan hardware** — ekspor/part berikutnya otomatis software, tak menabrak dinding yang sama\n3. **Akar racun v3.26.0 diambil**: cache shader/kode GPU tidak lagi dihapus di tengah sesi (risiko menyendatkan encoder/decoder GPU) — kini **dijadwalkan** dan dihapus saat aplikasi dibuka ulang, sebelum proses GPU naik. Tetap jadi obat shader korap, kini aman\n4. **Pemulihan lama tetap lapis terakhir** (v3.15): retry sekali dengan setelan aman, part yang sudah tersimpan tidak diulang\n\n## 🔬 Kualitas\n- **Uji ekspor nyata baru 7/7**: film 2 jam → 2 part 30 detik + cover 3 detik per part (durasi keluaran 33,02 dtk terverifikasi ffprobe) · MODE KILAT · paralel 2× · marker cache dijadwalkan & benar-benar dihapus saat buka ulang (jejak log main)\n- Uji modul 16 **14/14** · frame-test **6/6** · overlay-statik **6/6**\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.26.1.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.26.1-win64.zip`, jalankan `KINOSTRA.exe`\n- **Untuk mesin yang barusan GAGAL**: pasang versi ini, buka aplikasi, jalankan **OPTIMASI PERFORMA — SATU KLIK** (modul 16) sekali, lalu tutup & buka ulang aplikasi — cache GPU yang terjadwalkan terbersihkan saat mulai dan ekspor dicoba lagi. Bila masih beku juga (kasus langka, driver bermasalah), aplikasi kini otomatis jatuh ke encoder software tanpa menunggu 45 detik\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · IMPOR & PUTAR FILM 3-4 JAM TANPA RESTART · GAMBAR SELALU BERGERAK (JALUR VIDSPLIT + 3 DETEKTOR BEKU) · EKSPOR ANTI-BEKU 4 LAPIS · POTONG LANGSUNG · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.26.1.exe" "KINOSTRA-Setup-3.26.1.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.26.1-win64.zip" "KINOSTRA-Portable-3.26.1-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.26.1"
