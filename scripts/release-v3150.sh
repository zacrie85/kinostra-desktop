#!/bin/bash
# KINOSTRA v3.15.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.15.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.15.0 — BATCH ANTI-GAGAL",
  "body": "## 🎬 v3.15.0 — BATCH ANTI-GAGAL (video ke-2 dst di Kotak Video kini tahan banting)\n\nPerbaikan bug laporan kawan: impor banyak video sekaligus → ekspor semua — video pertama lancar, **video kedua dst berhenti setengah jalan dengan tulisan GAGAL (import/muat/durasi)**, lalu video berikutnya gagal serupa.\n\n### Perbaikan 4 lapis\n1. **Metadata video dimuat ulang otomatis 3×** — balasan metadata decoder/kfile kadang terpotong (durasi NaN/0/salah), dulu langsung dianggap gagal (\"durasi tidak terbaca — format tak didukung engine\" → tampil GAGAL di kotak). Kini dibaca ulang hingga 3× dengan timeout naik (4/7/11 dtk) sebelum menyerah. **Muat metadata kini juga ANTI-MACET** (timeout pasti menyelesaikan — dulu bisa menunggu selamanya) dan **durasi Infinity ditolak**\n2. **Percobaan ulang otomatis dengan SETELAN AMAN** — render yang gagal di tengah jalan (encoder GPU kewalahan, dekoder menumpuk antar film) diulang **1×** dengan **paralel 1 · encoder software · tanpa kilat · render penuh**; **part yang sudah jadi TIDAK diulang** (LANJUTKAN EKSPOR melewatinya) — berlaku di **BATCH EKSPOR** maupun **EKSPOR & SPLIT MP4** tunggal; setelan asli dikembalikan persis setelahnya\n3. **Thumbnail kotak tidak lagi saingan ekspor** — dulu dekode/seek film ke-3/4/5 untuk thumbnail kotak tetap jalan BERSAMAAN dengan render film aktif → RAM, dekoder & CPU berebut. Kini antrean thumbnail DITUNDA selama proses dan dilanjutkan otomatis setelahnya\n4. **Bersih-bersih total antar film + jeda napas** — buffer audio, promise decode, probe kilat & cache RMS dilepas eksplisit sebelum film berikutnya dimuat (jeda 120 ms) → film ke-2 dst selalu mulai dari kondisi bersih\n\n### Fitur TERAPKAN KE SEMUA VIDEO (modul 02)\n- Kini menampilkan **N PART/video** bila **JUMLAH PART OTOMATIS** aktif (dulu selalu detik) — tiap video tetap dibagi merata dari durasinya sendiri: \"10 PART\" → film 20 mnt = 10 × 2 mnt, film 1 mnt = 10 × 6 dtk\n\n## 🔬 Kualitas\n- Uji otomatis baru **24/24 lulus**: file rusak ditolak bersih tanpa macet + toast memandu; batch ketahanan (film rusak di posisi 2 → ditandai GAGAL dgn pesan jelas, film lain tetap SELESAI, 12 part tersimpan); **sabotase render di tengah jalan → ulang otomatis setelan aman (terukur: paralel 1 · cpu · tanpa kilat) → kedua film SELESAI, setelan asli kembali**; TERAPKAN KE SEMUA VIDEO (N PART/video + reset); thumbnail tunda saat busy & lanjut otomatis; versi 3.15.0\n- Regresi: v3.14 21/22 (1 = asersi versi lama, wajar) — nol regresi fungsional; repro batch 5 film 720p (musik + cover otomatis) 25/25 part SELESAI\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.15.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.15.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · BATCH ANTI-GAGAL · UKURAN TULISAN PART DI VIDEO 50–250% · UKURAN TULISAN PART COVER · AUTO-FIT JUDUL COVER · COVER BERSIH · MESIN COVER NOVACUT · 100 TEMPLATE · 28 TRANSISI COVER→VIDEO · 8 ANIMASI TEKS · KEN BURNS · POTONG LANGSUNG TANPA RE-ENCODE · RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.15.0.exe" "KINOSTRA-Setup-3.15.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.15.0-win64.zip" "KINOSTRA-Portable-3.15.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.15.0"
