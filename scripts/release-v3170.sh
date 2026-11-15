#!/bin/bash
# KINOSTRA v3.17.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.17.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.17.0 — PELINDUNG LAYAR HITAM (Pemulihan Otomatis)",
  "body": "## 🛡️ v3.17.0 — PELINDUNG LAYAR HITAM\n\nPerbaikan akar untuk keluhan: *\"aplikasi dipakai beberapa menit lalu layarnya blank hitam, terutama setelah memasukkan video & memakai preset tersimpan — apakah aplikasi dibatasi jumlah pemakaiannya?\"*\n\n**TIDAK ADA batas pemakaian.** KINOSTRA tidak pernah menghitung berapa kali dipakai. Layar hitam adalah galat teknis: **crash proses grafis (GPU) Chromium** saat beban berat (decode/encode hardware + komposit pratinjau) — dan sampai v3.16 aplikasi **tidak punya penanganan crash sama sekali**, sehingga jendela tinggal hitam selamanya. Tombol OPTIMASI/BERSIHKAN CACHE belum menolong karena cache GPU yang korup memang tidak boleh dihapus saat aplikasi masih hidup. Kini ditangani berlapis:\n\n### 1️⃣ Pemulihan otomatis saat proses render/GPU crash\n- Proses render/GPU mati → **jendela dimuat ulang OTOMATIS** (±1 detik) + toast *\"Aplikasi dipulihkan otomatis… setelan, preset & pekerjaan di kotak tetap aman\"*\n- **Preset tersimpan selamat** — disimpan di localStorage aplikasi, tidak hilang saat crash\n- Crash berulang **4× dalam 15 menit** → aplikasi menyalakan ulang dirinya dalam **MODE AMAN** (komposit software) — layar hitam berulang berhenti, kecepatan render hardware tetap dipertahankan\n\n### 2️⃣ Cache grafis korup dibersihkan otomatis saat mulai\n- Penyebab klasik layar hitam **yang tetap hitam meski aplikasi dibuka ulang** = cache GPU Chromium korup (GPUCache, ShaderCache, DawnCache…)\n- Bila sesi sebelumnya mati tak wajar (crash/listrik — dideteksi otomatis), seluruh cache grafis **dibersihkan otomatis sebelum jendela dibuat** → layar hitam \"menetap\" hilang; keluar normal tidak memicu pembersihan (start tetap cepat)\n\n### 3️⃣ Watchdog memori otomatis\n- Tiap 20 detik memori JS dipantau; lewat **2 GB** → cache lapisan pratinjau dibersihkan **sendiri** (dibangun ulang di frame berikutnya) + pemberitahuan — dulu bisa membengkak sampai proses mati tanpa peringatan\n- **Status pelindung** (lama nyala, jumlah pemulihan GPU/render, MODE AMAN, kejadian terakhir, memori JS hidup) tampil di **modul 16 PERAWATAN & PERFORMA**\n\n### 🔧 Perbaikan kecil lain\n- Blob URL media lama kini dilepas saat memuat film baru (impor dialog) — mencegah menumpuk sepanjang sesi panjang\n- OPTIMASI & BERSIHKAN CACHE tetap berfungsi persis seperti v3.16\n\n## 🔬 Kualitas\n- Uji otomatis baru **27/27 lulus** — termasuk **pemulihan crash NYATA** (renderer dipaksa crash → pulih sendiri, toast muncul, preset selamat, impor + PAKAI preset jalan lagi), simulasi sesi mati tak wajar (cache grafis palsu dibersihkan saat mulai), **storm gejala user**: impor 3 video + PAKAI preset 6× beruntun → nol exception\n- Regresi: v3.16 **23/24**, v3.15 **23/24** — sisa = asersi versi lama (wajar)\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.17.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.17.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · PELINDUNG LAYAR HITAM · PEMULIHAN OTOMATIS · WATCHDOG MEMORI · MODE AMAN · 17 MODUL TERATUR · PENGATURAN TERSIMPAN (PRESET) · OPTIMASI PERFORMA · BERSIHKAN CACHE · BATCH ANTI-GAGAL · UKURAN TULISAN PART 50–250% · MESIN COVER NOVACUT · 100 TEMPLATE · 28 TRANSISI · 8 ANIMASI TEKS · POTONG LANGSUNG · RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.17.0.exe" "KINOSTRA-Setup-3.17.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.17.0-win64.zip" "KINOSTRA-Portable-3.17.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.17.0"
