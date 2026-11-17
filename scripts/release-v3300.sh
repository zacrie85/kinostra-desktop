#!/bin/bash
# KINOSTRA v3.30.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.30.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.30.0 — SUARA DIJAMIN IKUT (semua format) + PANEL LEBAR (16 frame tampil semua)",
  "body": "## ✨ v3.30.0 — SUARA DIJAMIN IKUT + PANEL LEBAR (semua frame tampil)\n\nDua upgrade atas laporan kawan di v3.29: *\"video berhasil di export dan split akan tetapi tidak ada suaranya\"* dan *\"frame part yang tampil di menu hanya 9, padahal ada 15\"*.\n\n### 1 · Suara dijamin ikut — semua format video\nAkar masalah: bila sumber video berwadah **bukan MP4/AAC** (mis. WebM, MKV, FLV, atau MP3), pelacak audio internal tidak mengenal wadahnya → jalur audio dianggap tidak ada → hasil ekspor/split jalan **tanpa stream audio sama sekali**. Sekarang:\n- Setiap video selalu dianggap berpotensi bersuara — encoder audio selalu disiapkan.\n- Bila jalur demux AAC (hemat RAM) gagal, KINOSTRA otomatis jatuh ke **decode audio penuh ala v3.16** yang mengenal **SEMUA format** — persis proses yang dulu selalu bersuara.\n- Pelindung baru: bila hasil decode ternyata kosong (track rusak), buffer kosong tidak pernah dikirim — otomatis dicoba lewat jalur lain, bukan diekspor senyap.\n\n### 2 · Panel kanan lebih lebar + frame tampil semua\nLebar panel setelan dinaikkan 384 → **424px** dan baris pilihan frame kini **melipat ke baris berikutnya** — seluruh **16 tombol FRAME PART (TANPA + 15 gaya futuristik transparan)** terlihat dalam 2 baris, tidak ada lagi yang tersembunyi di tepi panel. Berlaku juga untuk pilihan frame judul, layout cover, palet & transisi.\n\n## 🔬 Kualitas\n- **Uji baru 9/9**: WebM 17 menit (Opus) — impor tanpa buffer & tanpa demux (prekondisi kasus user) · ekspor PARALEL 5× 2 part selesai · **stream AAC di semua part & volume terukur (mean > −55 dB, TIDAK senyap)** · buffer = durasi PENUH video (bukti jalur decode penuh aktif) · chips 16 tombol tampil semua dalam panel 424px\n- Regresi: v3.29 (MP4) **7/7** · modul 16 **14/14** · ekspor anti-beku **7/7** · v3.28 (15+15 frame) **11/11** · v3.27 **12/12** · v3.14 **22/22** · frame **6/6** · overlay **6/6**\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.30.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.30.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · EKSPOR & SPLIT = PROSES v3.16.0 · SUARA DIJAMIN IKUT (SEMUA FORMAT) · IMPOR & PUTAR FILM 3-4 JAM TANPA RESTART · POTONG LANGSUNG · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.30.0.exe" "KINOSTRA-Setup-3.30.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.30.0-win64.zip" "KINOSTRA-Portable-3.30.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.30.0"
