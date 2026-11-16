#!/bin/bash
# KINOSTRA v3.17.2 — buat release + upload 3 aset (token diambil dari remote git, tak dicetak)
set -e
cd /home/z/my-project
export GH_TOKEN=$(git remote get-url origin | sed -n 's|https://\([^@]*\)@.*|\1|p')
: "${GH_TOKEN:?token tidak ditemukan di remote}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.17.2",
  "target_commitish": "main",
  "name": "KINOSTRA v3.17.2 — LOG CRASH PERMANEN + MODE AMAN MANUAL (bukti penyebab restart)",
  "body": "## 🛡️ v3.17.2 — LOG CRASH PERMANEN + MODE AMAN MANUAL\n\nMasih ada laporan *\"kenapa masih merestar sendiri terus?\"* — dan temuan penting dari pengguna: **pengaturan tanpa video = lancar; begitu video masuk + setelan disentuh = restart terulang**. Itu konsisten dengan akar masalah v3.17.1 (kerja berat analisis audio/video saat impor). Masalahnya sekarang: status pelindung hanya tersimpan **di memori** — begitu aplikasi pulih/nyala ulang, catatannya hilang, sehingga penyebab di PC Anda tidak bisa dibuktikan dari laporan. **v3.17.2 membuat setiap kejadian TERCATAT PERMANEN** — bukan dugaan lagi, tapi bukti.\n\n**Tetap TIDAK ADA batas pemakaian** — aplikasi tidak menghitung pemakaian; ini bug tampilan yang terus ditangani, bukan pembatasan.\n\n### 1️⃣ LOG CRASH PERMANEN (ke disk)\n- Setiap kejadian dicatat ke `kinostra-crash.log` di folder data aplikasi: **waktu, versi, alasan crash (mis. OOM/crashed), kode keluar, pembersihan cache saat mulai, mode aman, keluar normal**\n- Dulu hanya di memori → hilang saat nyala ulang; kini log bertahan & dipangkas otomatis (±400 baris) agar tidak membengkak\n- Baris **RIWAYAT KEJADIAN** terakhir tampil di kotak info modul 16 — cukup screenshot untuk melapor\n\n### 2️⃣ Tiga tombol baru di modul 16 PERAWATAN\n- **SALIN LOG CRASH** — satu klik menyalin seluruh log; tempel (Ctrl+V) saat melapor ke pengembang\n- **BUKA FOLDER LOG** — membuka lokasi berkas log\n- **MODE AMAN SEKARANG** — segera nyalakan ulang dengan komposit GPU dimatikan (render hardware tetap cepat) **tanpa menunggu 4 crash otomatis** — hentikan rangkaian crash GPU berulang dalam satu klik\n\n### 3️⃣ Pengaman tambahan\n- Backsound/musik **>±160 MB (±80 menit)** tidak di-decode utuh lagi — kelas crash yang sama dengan film panjang (AudioBuffer bisa >1,5 GB)\n\n## 📋 Jika masih merestar setelah memasang v3.17.2\n1. Buka modul **16 PERAWATAN & PERFORMA** → klik **SALIN LOG CRASH**\n2. Kirim isinya (atau screenshot baris **RIWAYAT KEJADIAN**)\n3. Dari log itu terlihat persis penyebabnya: kehabisan memori (kode 133/OOM) vs GPU/driver (reason crashed) — dan bila GPU yang bermasalah, **MODE AMAN SEKARANG** sekalipun menghentikannya\n\n## 🔬 Kualitas\n- Uji otomatis **43/43 lulus** — 9 uji baru log crash (berkas benar-benar tertulis di disk: baris MULAI, sesi mati tak wajar, RENDER MATI + kode keluar; 3 tombol ada; RIWAYAT KEJADIAN tampil; pengaman backsound terpasang) + seluruh regresi v3.17.1 (film 120 menit tanpa crash & tanpa decode utuh, analisis bertahap peaks/RMS/envelope, RENDER PENUH bersuara di dtk 30 & 3600, pemulihan crash nyata, storm preset 6×)\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.17.2.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.17.2-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · LOG CRASH PERMANEN · MODE AMAN MANUAL · AUDIO FILM PANJANG ANTI-CRASH · PEMULIHAN OTOMATIS · 17 MODUL TERATUR · PENGATURAN TERSIMPAN (PRESET) · POTONG LANGSUNG · MESIN COVER NOVACUT · RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.17.2.exe" "KINOSTRA-Setup-3.17.2.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.17.2-win64.zip" "KINOSTRA-Portable-3.17.2-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.17.2"
