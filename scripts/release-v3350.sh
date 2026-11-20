#!/bin/bash
# KINOSTRA v3.35.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.35.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.35.0 — 5 FRAME REFERENSI KAWAN (komik · glossy · sport · pita emas · neon — bagian dalam kosong untuk tulisan)",
  "body": "## 🖼️ v3.35.0 — 5 FRAME REFERENSI KAWAN (bagian dalam kosong/transparan untuk tulisan)\n\nPermintaan kawan terpenuhi: **frame seperti 5 gambar referensi untuk episode/part dan judul video — bagian dalamnya kosong/transparan sebagai tempat tulisan**. Kelima gaya dari gambar referensi kini ada di KINOSTRA, dan karena digambar oleh mesin yang sama dengan pratinjau, **bingkainya otomatis menyesuaikan ukuran teks** (beda dengan frame PNG/JPG manual yang ukurannya tetap).\n\n### Lima gaya baru (modul 03 — FRAME JUDUL DI VIDEO & FRAME PART DI VIDEO, kini 20 gaya + PNG/JPG SENDIRI per menu)\n1. **KOMIK MERAH-BIRU** — strip merah di kiri-atas + bingkai banner biru-ungu dengan outline hitam tebal ala komik + bintang kilau (gaya lower-third video komik)\n2. **GLOSSY GAMING** — banner gelap glossy dengan plat merah menyala di tepi, bibir atas merah, kilau putih, dan lencana lingkaran di kiri (gaya esports)\n3. **SPORT LINGKAR** — banner runcing biru dengan 3 garis kecepatan dan lencana lingkaran biru (gaya balapan/olahraga)\n4. **PITA EMAS** — pita emas melengkung dengan outline ganda dan ekor lipatan emas di kedua sisi (klasik megah)\n5. **NEON CYAN-PINK** — bingkai membulat menyala cyan dengan pendar pink di tepi bawah (interior transparan penuh)\n\n### Cara pakai\n- Buka modul **03 JUDUL & PART OTOMATIS** → pilih gaya di **FRAME JUDUL DI VIDEO** (utk judul) dan **FRAME PART DI VIDEO** (utk PART/EPISODE) — bisa dicampur (mis. judul PITA EMAS + part KOMIK MERAH-BIRU).\n- **Dalamnya tetap kosong**: bingkai hanya menggambar hiasan tepi — tulisan judul/PART tampil DI DALAMNYA persis seperti diminta; lencana lingkaran dipasang di tepi kiri dengan jangkauan terbatas sehingga **tidak pernah menimpa huruf pertama**.\n- Bingkai **otomatis mengikuti ukuran teks** (judul berapa kata pun, tulisan PART 10%–250% pun ikut), berlaku di **bumper intro & label pojok**, ikut animasi masuk, dan **pratinjau = hasil ekspor persis**.\n- Semua gaya lama (10 futuristik + 5 elegan transparan + PNG/JPG SENDIRI dari v3.34) **tidak berubah**.\n\n## 🔬 Kualitas\n- **Uji baru 22/22** di aplikasi nyata (Electron via CDP): katalog 22+22 chip · klik chip → state+toast · pixel-diff kelima frame di jalur JUDUL/INTRO/POJOK · **interior kosong terukur** (pusat & zona teks tanpa isi) · warna khas per gaya terukur · klamp layar (bintang/ekor/garis kecepatan tak keluar layar) · gerbang POTONG LANGSUNG · tanda overlay native · preset roundtrip · **ekspor nyata 1 part MP4** (judul KOMIK + part PITA EMAS) tanpa fatal · swatch warna tetap 34px\n- Regresi **12 suite SEMUA HIJAU**: v334 15/15 · v333 9/9 · v331 12/12 · v330 9/9 · v329 7/7 · modul16 14/14 · ekspor 7/7 · v328 11/11 · v327 12/12 · v314 22/22 · frame 6/6 · overlay 6/6 (suite lama dipatch sadar-v3.35: jumlah chip 22 & katalog 20 kunci)\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.35.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.35.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · EKSPOR & SPLIT = PROSES v3.16.0 · SUARA DIJAMIN IKUT (SEMUA FORMAT, TERMASUK FILM UTUH 3-4 JAM) · GERBANG SUARA + MUSIK OTOMATIS · 5 FRAME REFERENSI KAWAN (DALAM KOSONG UTK TULISAN) · FRAME MANUAL PNG/JPG SENDIRI (GESER & TARIK) · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.35.0.exe" "KINOSTRA-Setup-3.35.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.35.0-win64.zip" "KINOSTRA-Portable-3.35.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.35.0"
