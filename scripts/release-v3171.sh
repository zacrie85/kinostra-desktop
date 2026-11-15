#!/bin/bash
# KINOSTRA v3.17.1 — buat release + upload 3 aset (token diambil dari remote git, tak dicetak)
set -e
cd /home/z/my-project
export GH_TOKEN=$(git remote get-url origin | sed -n 's|https://\([^@]*\)@.*|\1|p')
: "${GH_TOKEN:?token tidak ditemukan di remote}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.17.1",
  "target_commitish": "main",
  "name": "KINOSTRA v3.17.1 — AUDIO FILM PANJANG ANTI-CRASH (Perbaikan Akar Layar Hitam)",
  "body": "## 🎞️ v3.17.1 — AUDIO FILM PANJANG ANTI-CRASH\n\nPerbaikan akar untuk keluhan: *\"setiap masuk ke menu JUDUL & PART OTOMATIS aplikasi selalu blank lalu restart\"* (v3.17) dan *\"jalan beberapa menit lalu layar hitam\"* (v3.16) — sementara di PC/laptop lain berjalan lancar.\n\n**Tetap TIDAK ADA batas pemakaian.** Akar masalahnya ditemukan lewat reproduksi terpandu di mesin uji: saat film panjang diimpor, aplikasi mendekode **SELURUH trek audionya sekaligus** — AudioBuffer float ±21 MB per menit film (**film 2 jam ≈ 2,5 GB; film 188 menit ≈ 4 GB**) di dalam satu proses tampilan. Saat alokasi sebesar itu gagal (RAM/commit habis — tergantung isi PC), proses render mati (exitCode 133): **v3.16 → layar hitam permanen; v3.17 → blank + pulih otomatis, lalu bisa terulang**. Di PC dengan RAM lebih lega decode sempat berhasil — karena itu gejalanya \"hanya di PC tertentu\". Bukti uji: alur terberat (impor film 120 menit → putar → semua modul dibuka → scroll panel & timeline cepat 60 detik) selalu crash dengan decode lama, dan **NOL crash** begitu decode utuh dilewati.\n\n### 1️⃣ Film panjang tidak pernah di-decode utuh lagi\n- **Film ≤±15 menit** — perilaku lama, audio penuh berkualitas penuh (tanpa perubahan)\n- **Film >±15 menit (MP4/AAC)** — audio dianalisis **bertahap per jendela 45 detik** lewat demux MP4 (parser box yang sama dengan MODE KILAT) + **WebCodecs AudioDecoder** — RAM puncak selalu sekecil satu jendela (±10–20 MB)\n- Hasil tetap lengkap: **peaks** (gelombang & sinkron musik/backsound), **RMS** (normalizer AUDIO SEHAT), **envelope 0,5 dtk** (ZOOM PEMBICARA)\n\n### 2️⃣ Ekspor tetap bersuara asli\n- **RENDER PENUH** mengambil audio asli **per part** lewat jendela yang sama (part 30–60 dtk = ±5–10 MB)\n- **POTONG LANGSUNG tidak tersentuh** — audio asli disalin langsung dari file\n- Media non-MP4/AAC yang panjang: diekspor tanpa suara asli (musik/backsound tetap ikut) + pemberitahuan\n\n### 3️⃣ Analisis yang sopan & tahan gangguan\n- Analisis otomatis **menunggu** saat video diputar atau sedang diekspor — lanjut sendiri saat idle (film 2 jam selesai ±1–2 menit saat menata setelan)\n- Pembaca berkas 4 MB **diserialkan** (anti-race data paket); **decoder baru per jendela** (AudioDecoder.reset() tak andal untuk AAC)\n- Satu jendela gagal ≠ seluruh analisis batal — dilewati, lanjut; berhenti hanya bila 3 gagal beruntun\n\n## 🔬 Kualitas\n- Uji otomatis baru **34/34 lulus** — termasuk fase baru AUDIO FILM PANJANG: film 120 menit termuat **tanpa crash** & audioBuffer tetap null, analisis peaks/RMS/envelope terisi, **RENDER PENUH bersuara asli di detik 30 & 3600**, video pendek tetap di-decode penuh; plus seluruh uji SHIELD v3.17 (pemulihan crash nyata, guard exit-kotor, storm preset 6×)\n- Catatan: **SUBTITEL AI** untuk film >±15 menit dinonaktifkan demi kestabilan (butuh decode penuh) — gunakan video pendek untuk subtitel\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.17.1.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.17.1-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · AUDIO FILM PANJANG ANTI-CRASH · PEMULIHAN OTOMATIS · MODE AMAN · 17 MODUL TERATUR · PENGATURAN TERSIMPAN (PRESET) · POTONG LANGSUNG · MESIN COVER NOVACUT · RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.17.1.exe" "KINOSTRA-Setup-3.17.1.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.17.1-win64.zip" "KINOSTRA-Portable-3.17.1-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.17.1"
