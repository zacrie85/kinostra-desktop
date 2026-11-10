#!/bin/bash
# KINOSTRA v3.16.0 — buat release + upload 3 aset (token via env GH_TOKEN)
set -e
: "${GH_TOKEN:?Set env GH_TOKEN dulu}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

BODY=$(cat <<'JSON'
{
  "tag_name": "v3.16.0",
  "target_commitish": "main",
  "name": "KINOSTRA v3.16.0 — TAMPILAN RAPI + PERAWATAN + PENGATURAN TERSIMPAN",
  "body": "## 🎬 v3.16.0 — UPGRADE BESAR: TAMPILAN RAPI · PERAWATAN & PERFORMA · PENGATURAN TERSIMPAN\n\nTiga permintaan sekaligus dari kawan: (1) rombak total susunan & tampilan ikon sub-menu, (2) tombol OPTIMASI + BERSIHKAN CACHE, (3) menu SIMPAN PENGATURAN.\n\n### 1️⃣ Tampilan submenu dirombak total — 17 modul teratur & sederhana\n- **17 modul berurutan sesuai alur kerja**: Media (00) → Preset (01) → Sumber (02) → Teks (03–06) → Zoom Pembicara (07) → Efek (08–10) → Musik (11) → Tipografi (12) → Cover (13) → Ekspor (14) → Gabung (15) → Perawatan (16)\n- **Ikon seragam** di tiap judul modul (kotak amber) — sekali lihat langsung tahu isinya\n- **Badge \"BARU · vX\" & keterangan bertele-tele dihapus** — panel bersih, panduan lengkap tetap ada di KINOSTRA-PANDUAN.md\n- **Modul yang tumpang tindih digabung**: BATCH PROSES (modul 10 lama) → masuk **KOTAK VIDEO** (tambah video & impor massal cukup satu tempat); SAMPUL AUTO → masuk **COVER NOVACUT** (Studio Sampul satu pintu); tombol MULAI BATCH duplikat dihapus — cukup **BATCH EKSPOR**; modul baru **GERAK & TRANSISI** dipisah dari Efek Visual supaya tidak sesak\n\n### 2️⃣ PENGATURAN TERSIMPAN — preset setelan (modul 01)\n- **SIMPAN**: beri nama → **seluruh setelan tersimpan** sebagai preset (rasio, judul, split & jumlah part, prefix, ukuran/posisi/animasi teks, filter warna, frame video, neon, watermark, ken burns, transisi, kecepatan, musik/backsound/audio sehat, TTS, zoom pembicara, subtitel, cover NOVACUT penuh, ekspor: kualitas/resolusi/fps/GPU/kilat/paralel/kompres pintar)\n- **PAKAI**: mulai pekerjaan baru → klik PAKAI → semua setelan terpasang persis seperti yang disimpan\n- **HAPUS** per preset · daftar rapi dgn tanggal & jumlah setelan · tersimpan di dalam aplikasi — **100% offline**\n\n### 3️⃣ PERAWATAN & PERFORMA (modul 16)\n- **OPTIMASI PERFORMA — satu klik**: membersihkan memori & cache mesin (cache lapisan pratinjau & neon, adaptasi encoder, probe kilat, cache RMS), **menguji ulang encoder GPU vs CPU**, melanjutkan thumbnail tertunda, lalu menampilkan laporan + **saran setelan tercepat** untuk mesinmu (Akselerasi OTOMATIS saat GPU terdeteksi · aktifkan MODE KILAT · render paralel OTOMATIS) — bisa diterapkan satu klik dari laporannya\n- **BERSIHKAN CACHE**: menghapus **thumbnail kotak, file sementara transkripsi (whisper tmp), cache tampilan/HTTP aplikasi** — thumbnail dibuat ulang otomatis saat dibutuhkan\n- **Kotak info**: RAM terpasang, core CPU, ukuran cache sementara & model AI lokal — **pekerjaan, setelan, preset & model AI TIDAK dihapus**\n\n## 🔬 Kualitas\n- Uji otomatis baru **24/24 lulus**: 17 modul + ikon + tanpa badge lama; preset SIMPAN→kacaukan→PAKAI pulih persis (103 setelan)→HAPUS; OPTIMASI (cache bersih terukur, 2 saran muncul & diterapkan); BERSIHKAN CACHE (thumbnail dibuang, IPC ukur valid); **ekspor nyata 2 part** lewat mesin render + wiring tombol utuh\n- Regresi: v3.15 **23/24**, v3.14 **21/22**, fastcut **12/12** — sisa = asersi versi lama (wajar)\n\n## 📦 Instalasi\n- **Setup**: jalankan `KINOSTRA-Setup-3.16.0.exe`\n- **Portable**: ekstrak `KINOSTRA-Portable-3.16.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n---\n100% offline · Windows 10/11 x64 · Electron 33 · 17 MODUL TERATUR · PENGATURAN TERSIMPAN (PRESET) · OPTIMASI PERFORMA · BERSIHKAN CACHE · BATCH ANTI-GAGAL · UKURAN TULISAN PART DI VIDEO 50–250% · MESIN COVER NOVACUT · 100 TEMPLATE · 28 TRANSISI · 8 ANIMASI TEKS · KEN BURNS · POTONG LANGSUNG · RESOLUSI 720p-4K",
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

upload "dist_out/KINOSTRA-Setup-3.16.0.exe" "KINOSTRA-Setup-3.16.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.16.0-win64.zip" "KINOSTRA-Portable-3.16.0-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v3.16.0"
