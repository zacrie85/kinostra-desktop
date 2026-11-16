#!/bin/bash
# KINOSTRA v3.22.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.22.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.22.0 — ANALISIS AUDIO TERTIB (akar 'ngestar saat impor film panjang' ditemukan)",
  "body": "## 🔊 v3.22.0 — ANALISIS AUDIO TERTIB\n\nTebakan kawan di laporan terakhir **tepat**: *\"atau sepertinya aplikasi ini error saat menganalisis suaranya\"*. Toast \"Video panjang — audio dianalisis hemat memori bertahap\" di gambar referensi adalah penanda persis — aplikasi mati saat sedang menganalisis suara, bukan saat pemutaran.\n\n### Akar sejati (ditemukan lewat reproduksi pertama di sandbox)\n- Video uji dibuat **realistis seperti file unduhan**: 3,6 jam, moov di akhir file, audio stereo, tabel sampel padat (127.880 entri stsc) — video uji lama hanya 1-3 entri, makanya bug ini tak pernah tampak selama 4 versi\n- CPU diperlambat 6× (simulasi laptop lemah) → kode lama: renderer membeku **>40 detik** lalu crash — persis pola log crash v3.18-v3.21 (HANG 10-15 dtk setelah impor → RENDER MATI)\n- Isolasi bertahap menemukan **satu loop**: `Array.shift()` yang mahalnya O(n) dipanggil sampai 127.880 kali = O(nSc²) ≈ **8-16 miliar operasi geser** → thread utama **membeku sinkron 10-60 detik persis setelah impor** → detak jantung hilang → pelindung mematikan aplikasi yang sebenarnya sedang bekerja\n\n### Perbaikan (enam titik)\n1. **Penunjuk indeks O(1)** menggantikan `shift()` + stsc dibaca blok bulk (dulu 127.880 fetch per-entri) → tabel kini **<0,5 detik** untuk film berapa pun (ikut mempercepat probe ekspor MODE KILAT untuk file nyata)\n2. **Pelindung bertanya dulu** — sebelum mematikan, probe respons ke renderer (4 dtk): masih menjawab = kerja berat latar → **tidak dipaksa mati**; tak menjawab = beku sejati → pemulihan paksa seperti sebelumnya (proteksi v3.18-v3.21 utuh)\n3. **Analisis audio mulai tertib** — menunggu 10 detik tenang beruntun (tidak memutar/ekspor/thumbnail/sibuk) sebelum jendela pertama\n4. **Pacing** — jeda 6 ms tiap 64 paket + napas 120 ms antar jendela\n5. **Thumbnail ikut melapor** — rantai thumbnail menunda analisis\n6. **Video utama preload=metadata** — Chromium berhenti mem-buffer film 4 jam di belakang; frame pertama pratinjau via seek terkendali\n\n## 🔬 Kualitas\n- Repro video uji 3,6 jam + throttle 6×: **sebelum** = tak merespons >40 dtk + SIGSEGV; **sesudah** = jeda event loop maksimum **207 ms**, tabel 127.880 entri selesai <1 dtk, analisis mengalir tertib, **NOL crash**\n- Alur user impor film 3,6 jam → **putar segera**: jalur native aktif, playhead maju, jeda 1 ms — lulus\n- Regresi v3.21 dijalankan ulang: **32/33 lulus** (sisa = asersi versi, wajar) — **semua uji pelindung hang lulus dengan probe baru** (siklus #1 pulih biasa, kejadian ke-2 → MODE AMAN otomatis; beku sejati tetap tertangani)\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.22.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.22.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · IMPOR & PUTAR FILM 3-4 JAM TANPA RESTART · PELINDUNG TIDAK SALAH MATI · NATIVE SEMUA RASIO · POTONG LANGSUNG · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.22.0.exe" "KINOSTRA-Setup-3.22.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.22.0-win64.zip" "KINOSTRA-Portable-3.22.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.22.0"
