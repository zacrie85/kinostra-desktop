#!/bin/bash
# KINOSTRA v3.26.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.26.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.26.0 — Modul 16 diupgrade: OPTIMASI & BERSIHKAN CACHE lebih cerdas",
  "body": "## 🛠️ v3.26.0 — AUDIT & UPGRADE MODUL 16: PERAWATAN & PERFORMA\n\nPertanyaan kawan — *\"apakah OPTIMASI PERFORMA satu-klik dan BERSIHKAN CACHE sudah berfungsi baik, ataukah butuh upgrade?\"* — jawabannya: **duanya sudah bekerja, tapi layak diupgrade — dan kini sudah diupgrade.**\n\n### Yang dibenahi\n1. **Flag kanvas darurat ikut dilepas** — OPTIMASI & BERSIHKAN CACHE kini menghapus flag `kinostra.canvasPlay`: mesin yang dulu dipaksa jalur kanvas oleh pengawas era v3.24 mencoba **jalur native** lagi (akar beku sudah tuntas di v3.25; tiga pengawas — pompa, piksel, layar — tetap menjaga)\n2. **BERSIHKAN CACHE kini menghapus cache shader/kode GPU** (GPUCache, ShaderCache, Dawn*, Code Cache — bisa ratusan MB). Dulu hanya dibersihkan otomatis saat mati tak wajar; kini on-demand — sekaligus **obat manual kalau efek tampilan terlihat korup**. Berkas yang dikunci sistem dilewati aman\n3. **Total disk dibebaskan kini tampil** (estimasi MB) di hasil pembersihan\n4. **Kotak info kini menampilkan JALUR PUTAR** (native ala VidSplit / kanvas darurat) **+ nama GPU + status encoder hardware + ukuran cache shader**\n5. **Benahi bug lama**: label *\"cache tampilan/HTTP dibersihkan\"* tidak pernah muncul sejak v3.16 (renderer mengecek teks yang tak pernah dikirim main)\n\n## 🔬 Kualitas\n- Uji khusus modul 16 **14/14** (modal hasil, flag kanvas benar-benar dilepas, disk dibebaskan, info jalur/GPU, putar tetap sehat di native setelah pembersihan) · frame-test **6/6** · overlay-statik **6/6**\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.26.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.26.0-win64.zip`, jalankan `KINOSTRA.exe`\n- Saran: setelah pasang, jalankan sekali **OPTIMASI PERFORMA — SATU KLIK** di modul 16 — apapun sisa flag lama dari era v3.24 langsung dilepas dan kotak info menunjukkan jalur putar + GPU-mu\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · IMPOR & PUTAR FILM 3-4 JAM TANPA RESTART · GAMBAR SELALU BERGERAK (JALUR VIDSPLIT + 3 DETEKTOR BEKU) · MODUL 16 PERAWATAN DENGAN TANGGA PENYEMBUHAN · POTONG LANGSUNG · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.26.0.exe" "KINOSTRA-Setup-3.26.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.26.0-win64.zip" "KINOSTRA-Portable-3.26.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.26.0"
