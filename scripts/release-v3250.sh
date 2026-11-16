#!/bin/bash
# KINOSTRA v3.25.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.25.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.25.0 — JALUR VIDSPLIT (akar gambar beku dibedah sebenarnya)",
  "body": "## 🎬 v3.25.0 — JALUR VIDSPLIT: AKAR GAMBAR BEKU DIBEDAH SEBENARNYA\n\nPermintaan kawan — *\"lihat VidSplit sebagai referensi\"* — petunjuk yang tepat sasaran. VidSplit bergerak di mesin yang sama karena video-nya **berdiri sendiri**: tidak ada apa pun di atasnya. KINOSTRA selama ini menaruh **kanvas overlay di atas elemen video** dan menggambar ulangnya **15× per detik walau isinya tidak berubah** (label part & judul memang statis sepanjang part). Setiap gambar ulang meng-invalidate region di atas video di kompositor Windows — akibatnya lapisan video **tidak pernah naik ke hardware overlay**, dan di GPU/driver tertentu gambar video berhenti tersaji: waktu jalan, decoder \"bekerja\", gambar beku. Persis rekaman yang kawan kirim.\n\n### Perbaikan\n1. **Overlay digambar HANYA saat isinya berubah** (ganti part, ganti subtitel, pengeditan setelan, resize) — uji: **3 gambar dalam 9 detik putar** (dulu ±135). Video berdiri sendiri persis VidSplit\n2. Animasi masuk part/judul dirender langsung ke keadaan akhir di pratinjau native — **ekspor tetap beranimasi penuh**; grain, frame neon berputar & judul neon otomatis pindah ke jalur kanvas (memang butuh kanvas per frame)\n3. **PENGAWAS LAYAR sejati**: main process meng-capture piksel jendela yang benar-benar tersaji (`capturePage`, pita tengah area putar, tiap 5 dtk) dan meng-hash-nya — **tak bisa dibohongi decoder maupun drawImage**. Ketiga detektor (pompa, piksel, layar) berbagi satu tangga: kocok halus + latar blur dibekukan → visibilitas → jalur kanvas (diingat per mesin)\n\n## 🔬 Kualitas\n- Overlay-statik **6/6** · pengawas layar **nol false-fire** di video bergerak · frame-test **6/6** · sandera pompa **6/6** · piksel **8/8** · regresi v3.21 **32/33** (sisa = asersi versi)\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.25.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.25.0-win64.zip`, jalankan `KINOSTRA.exe`\n- Penting: hapus dulu flag jalur kanvas lama dengan membuka KINOSTRA sekali — atau biarkan: pengawas layar kini mendeteksi & menyembuhkan apa pun yang masih beku\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · IMPOR & PUTAR FILM 3-4 JAM TANPA RESTART · GAMBAR SELALU BERGERAK (JALUR VIDSPLIT + 3 DETEKTOR BEKU) · NATIVE SEMUA RASIO · POTONG LANGSUNG · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.25.0.exe" "KINOSTRA-Setup-3.25.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.25.0-win64.zip" "KINOSTRA-Portable-3.25.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.25.0"
