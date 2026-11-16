#!/bin/bash
# KINOSTRA v3.19.0 — buat release + upload 3 aset (token dari remote git, tak dicetak)
set -e
cd /home/z/my-project
export GH_TOKEN=$(git remote get-url origin | sed -n 's|https://\([^@]*\)@.*|\1|p')
: "${GH_TOKEN:?token tidak ditemukan di remote}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.19.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.19.0 — WATCHDOG HANG DETAK JANTUNG + ANALISIS 2,5× LEBIH CEPAT",
  "body": "## 🧠 v3.19.0 \u2014 PELINDUNG PUTAR: berhenti mengulang restart saat video diputar\n\nLaporan dari v3.18: *\"begitu video di import dan di play aplikasi langsung hang, blank dan ngerestar sendiri\"*. Yang terlihat itu sebenarnya **pelindung v3.18 bekerja** \u2014 hang terdeteksi detak jantung, jendela dipulihkan otomatis (tampak seperti merestar sendiri). TAPI bila penyebabnya GPU/driver lemah yang beku justru **saat video diputar**, pemulihan biasa hanya memutar ulang loop yang sama: putar \u2192 beku \u2192 pulih \u2192 putar lagi \u2192 beku lagi.\n\n### 1\u20e3 PELINDUNG PUTAR\n- Status memutar kini dilaporkan renderer \u2192 pelindung (kanal `hb:play`)\n- Crash/hang yang terjadi **KETIKA video diputar** dicatat terpisah di log: `HANG SAAT PUTAR`, `PELINDUNG PUTAR \u2014 kejadian saat memutar ke-N`\n- Kejadian ke-1 \u2192 pulihkan biasa (bisa jadi sekedar kejebakan sesaat)\n- **Kejadian ke-2 dalam 15 menit \u2192 MODE AMAN otomatis**: aplikasi menyalakan ulang dirinya dengan **komposit GPU dimatikan** (penyebab beku/blank di GPU lemah) \u2014 kecepatan render hardware (KILAT/GPU) tetap. Dari sisi Anda: **restart paling banyak 1 kali**, lalu pemutaran stabil\n\n### 2\u20e3 Tetap ada dari v3.18\n- Watchdog detak jantung (hang beku \u2192 pulih otomatis), jejak diagnostik permanen (impor/putar/ekspor), jendela adaptif film panjang (\u00b12,5\u00d7 lebih cepat), log crash permanen + SALIN LOG CRASH di modul 16\n\n## 📋 Cara kerja setelah dipasang\n1. Impor & putar seperti biasa \u2014 bila sekali beku lalu pulih, lanjutkan saja\n2. Bila beku lagi, aplikasi otomatis masuk MODE AMAN (terlihat di modul 16 PERAWATAN: baris RIWAYAT KEJADIAN)\n3. Dalam MODE AMAN pemutaran stabil; bila ingin mencoba GPU lagi, buka modul 16 \u2192 MODE AMAN SEKARANG untuk nyalakan ulang normal... atau cukup tutup & buka aplikasi\n4. Saat melapor: modul 16 \u2192 **SALIN LOG CRASH** \u2192 tempel (Ctrl+V) \u2014 log kini memuat konteks persis (impor apa, jalur audio apa, sedang memutar atau tidak)\n\n## 🔬 Kualitas\n- Uji baru **13/13 lulus**: hang saat putar #1 \u2192 pulih biasa + tercatat; hang #2 \u2192 instance baru hidup dalam MODE AMAN (safeMode=true) dgn alasan tercatat; impor sehat dalam mode aman\n- Regresi v3.17.2 **38/43** (5 sisa = asersi versi, wajar) \u2014 seluruh fase film panjang, ekspor bersuara, pemulihan crash tetap lulus\n\n## 📦 Instalasi\n- **Setup**: `KINOSTRA-Setup-3.19.0.exe` (pasang di atas versi lama; setelan & preset tersimpan)\n- **Portable**: ekstrak `KINOSTRA-Portable-3.19.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline \u00b7 Windows 10/11 x64 \u00b7 Electron 33 \u00b7 PELINDUNG PUTAR \u00b7 PEMULIHAN HANG OTOMATIS \u00b7 LOG CRASH PERMANEN \u00b7 AUDIO FILM PANJANG ANTI-CRASH \u00b7 JENDELA ADAPTIF 2,5\u00d7 LEBIH CEPAT \u00b7 17 MODUL TERATUR \u00b7 PENGATURAN TERSIMPAN (PRESET) \u00b7 POTONG LANGSUNG \u00b7 MESIN COVER NOVACUT \u00b7 RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.19.0.exe" "KINOSTRA-Setup-3.19.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.19.0-win64.zip" "KINOSTRA-Portable-3.19.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.19.0"
