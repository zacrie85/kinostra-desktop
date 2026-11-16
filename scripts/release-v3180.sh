#!/bin/bash
# KINOSTRA v3.18.0 — buat release + upload 3 aset (token dari remote git, tak dicetak)
set -e
cd /home/z/my-project
export GH_TOKEN=$(git remote get-url origin | sed -n 's|https://\([^@]*\)@.*|\1|p')
: "${GH_TOKEN:?token tidak ditemukan di remote}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.18.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.18.0 — WATCHDOG HANG DETAK JANTUNG + ANALISIS 2,5× LEBIH CEPAT",
  "body": "## 🫀 v3.18.0 — pemulihan hang beku + analisis film panjang 2,5× lebih cepat\n\n**Upgrade penting bagi pengguna v3.16.0**: akar **layar blank/hitam saat video diimpor & diputar** sudah diperbaiki di v3.17.1 (film panjang tidak lagi di-decode utuh ke RAM) — dan v3.18.0 menambah jaring pengaman terakhir yang belum ada: **hang beku** (jendela macet total tapi proses tidak mati, sehingga pemulihan lama tidak pernah terpanggil). Event `unresponsive` bawaan Chromium terbukti tidak selalu menyala (diuji: renderer digantung 15 detik, pulih tanpa satu pun event).\n\n### 1️⃣ WATCHDOG DETAK JANTUNG\n- Preload mengirim **detak jantung tiap 3 detik** selama main thread renderer sehat\n- Detak hilang **>12 detik = hang** → renderer dipulihkan **paksa** (crash terkendali) → jendela dimuat ulang otomatis lewat jalur SHIELD v3.17\n- Handler `unresponsive` kini juga memulihkan paksa bila masih macet 1,5 detik (dulu hanya mencatat)\n- Berulang tetap dihitung → **MODE AMAN otomatis** bila masalah menetap\n\n### 2️⃣ JEJAK DIAGNOSTIK PERMANEN DI LOG CRASH\nSaat melapor, konteks persis sudah tertulis: **impor** (nama · durasi), **jalur audio** (decode penuh / mode JENDELA hemat RAM — bukti pelindung RAM aktif di PC Anda), **putar** (maks 1×/30 dtk), **ekspor** & **batch**\n\n### 3️⃣ JENDELA ADAPTIF — analisis ±2,5× lebih cepat\n- Film **>60 menit** dianalisis per jendela **120 detik** (bukan 45) → film 188 menit = **94 jendela, bukan 250**\n- Masa tunggu analisis setelah impor terasa jauh lebih singkat; RAM puncak tetap **1 jendela (±46 MB)**\n- Film ≤60 menit: persis v3.17.1 (piksel-perilaku identik)\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.18.0.exe` (pasang di atas versi lama, setelan & preset tersimpan)\n- **Portable**: ekstrak `KINOSTRA-Portable-3.18.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n## 🔬 Kualitas\n- Uji baru **15/15 lulus**: hang 30 dtk → pulih otomatis + baris HANG/RENDER MATI/pemulihan tercatat; jejak impor/putar/audio di log; pulih-lalu-impor-lagi sukses; film 120 menit: tanpa decode utuh, peaks tumbuh 0→934/1400 dalam <20 dtk, RMS terukur\n- Regresi v3.17.2 **39/43** (4 sisa = asersi versi, wajar) — termasuk seluruh fase film panjang: impor tanpa crash, RENDER PENUH bersuara asli di dtk 30 & 3600, pemulihan crash nyata\n\n## 📋 Jika masih bermasalah setelah memasang v3.18.0\nBuka modul **16 PERAWATAN & PERFORMA → SALIN LOG CRASH** → tempel (Ctrl+V) ke pesan laporan — log kini memuat jejak konteks persis apa yang sedang dilakukan aplikasi\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · PEMULIHAN HANG OTOMATIS · LOG CRASH PERMANEN · AUDIO FILM PANJANG ANTI-CRASH · ANALISIS 2,5× LEBIH CEPAT · 17 MODUL TERATUR · PENGATURAN TERSIMPAN (PRESET) · POTONG LANGSUNG · MESIN COVER NOVACUT · RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.18.0.exe" "KINOSTRA-Setup-3.18.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.18.0-win64.zip" "KINOSTRA-Portable-3.18.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.18.0"
