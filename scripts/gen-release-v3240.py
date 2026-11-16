#!/usr/bin/env python3
# generator release-v3240.sh — JSON via json.dumps + nama aset/tag di head/tail
# diganti versi TERLEBIH DAHULU (pelajaran kecelakaan v3.23: head/tail masih 3.22.0)
import json

body = (
 "## 🔍 v3.24.0 — DETEKTOR PIKSEL: MEKANISME BEKU KEDUA TUMBANG\n\n"
 "Rekaman layar yang kawan kirim (*\"gambar tidak bergerak.mp4\"*) adalah bukti detektif sempurna: **v3.23.0 sudah terpasang** (header), waktu berjalan normal (`00:15.4 → 00:22.9`), gambar **identik piksel demi piksel** di semua frame, dan **tanpa toast penyembuh** — artinya pengawas v3.23 tidak pernah menyala: `totalVideoFrames` di mesin kawan **selalu maju** (decoder yakin bekerja) tapi gambar yang tersaji tidak pernah berubah. Ini mekanisme KEDUA: **penyajian mati** di lapisan video kompositor Windows (DirectComposition) — dekode, DOM, dan kanvas overlay tetap sehat (caption tetap tergambar tajam di rekaman). VidSplit bergerak di mesin yang sama karena video-nya berdiri sendiri tanpa lapisan di atasnya.\n\n"
 "### Perbaikan\n"
 "1. **Detektor level piksel**: tiap 2 detik selagi memutar, video disampel ke kanvas 48×27 dan hash pikselnya dibandingkan. Decoder maju tapi piksel diam + waktu berjalan = penyajian mati → tangga penyembuhan: **kocok halus** (seek +0,05 dtk) → **nyalakan ulang visibilitas** → **jatuh ke jalur kanvas overlay** — gambar digambar manual via `drawImage` menjadi SATU lapisan komposit yang kebal bug lapisan video (caption ikut tergambar di kanvas)\n"
 "2. **Penyembuhan diingat per mesin** (`kinostra.canvasPlay`): impor berikutnya pada sesi yang sama langsung jalur kanvas tanpa menunggu beku; sesi baru tetap mencoba native sekali (driver bisa saja membaik)\n"
 "3. **Log kini memuat identitas GPU** saat putaran native dimulai — diagnosis lapangan makin tajam\n\n"
 "## 🔬 Kualitas\n"
 "- Detektor piksel diuji dgn **video adegan-diam nyata** (warna solid: fr maju 52→360, piksel diam — persis kondisi mesin kawan): **8/8 lulus** — deteksi ±2 dtk, tangga utuh 6 dtk, waktu tetap berjalan\n"
 "- Video bergerak normal: **nol false-positive** (frame-test 6/6, native tetap aktif)\n"
 "- Jalur pompa-macet v3.23 tetap utuh (sandera 6/6)\n"
 "- Regresi v3.21: **32/33** (sisa = asersi versi, wajar) — putar 4 jam nol beku, pelindung hang pulih, MODE AMAN otomatis, MODE PUTARAN HEMAT semua lulus\n\n"
 "## 📦 Instalasi\n"
 "- **Setup**: jalankan `KINOSTRA-Setup-3.24.0.exe`\n"
 "- **Portable**: ekstrak `KINOSTRA-Portable-3.24.0-win64.zip`, jalankan `KINOSTRA.exe`\n"
 "- Di mesin yang sudah kena beku: putar sekali → ±6 dtk penyembuhan → impor berikutnya langsung lancar\n\n"
 "---\n"
 "100% offline · Windows 10/11 x64 · Electron 33 · IMPOR & PUTAR FILM 3-4 JAM TANPA RESTART · GAMBAR SELALU BERGERAK (2 MEKANISME BEKU TERDETEKSI & DISEMBUHKAN OTOMATIS) · NATIVE SEMUA RASIO · POTONG LANGSUNG · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K"
)

payload = {
    "tag_name": "v3.24.0",
    "target_commitish": "main",
    "name": "KINOSTRA v3.24.0 — DETEKTOR PIKSEL (penyajian mati disembuhkan otomatis)",
    "body": body,
    "draft": False,
    "prerelease": False,
}

tpl = open('/home/z/my-project/scripts/release-v3220.sh').read()
head = tpl[:tpl.index("BODY=$(cat <<'JSON'")].replace('3.22.0', '3.24.0')
tail = tpl[tpl.index("\nJSON\n)\n"):].replace('3.22.0', '3.24.0')

new = head + "BODY=$(cat <<'JSON'\n" + json.dumps(payload, ensure_ascii=False, indent=2) + tail
new = new.replace('release-v3220.sh — buat release', 'release-v3240.sh — buat release')
open('/home/z/my-project/scripts/release-v3240.sh', 'w').write(new)
j = new[new.index('{\n  "tag_name"'):new.index('\nJSON\n')]
json.loads(j)
assert 'Setup-3.24.0.exe' in new and 'Portable-3.24.0-win64.zip' in new and '3.22.0' not in head and '3.22.0' not in tail
print('release-v3240.sh dibuat — JSON valid, nama aset 3.24.0 ✓')
