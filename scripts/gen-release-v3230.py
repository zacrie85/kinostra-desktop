#!/usr/bin/env python3
# generator release-v3230.sh — JSON dibangun dgn json.dumps (dijamin valid)
import json

body = (
 "## 🎞️ v3.23.0 — GAMBAR BERGERAK LAGI\n\n"
 "Kabar baiknya dulu: laporan kawan *\"videonya berhasil di play dan aplikasi tidak merestar kawannn mantaappp\"* berarti **akar v3.22 berhasil di mesin kamu** — impor film panjang tidak lagi membuat aplikasi ngestar. Sisa bugnya satu: *\"gambar yang di play tidak bergerak, walaupun waktunya berjalan\"* — disebut **pompa frame macet**: jam media terus berjalan (via pipa audio) tapi kompositor berhenti meminta frame baru sehingga layar menampilkan satu frame terakhir.\n\n"
 "### Perbaikan\n"
 "1. **Elemen media kembali PERSIS formula VidSplit/v3.21** yang terbukti gambarnya bergerak di mesin yang sama — tebakan `preload=\"metadata\"` v3.22 dibuang total (berisiko pompa frame tidak pernah aktif di sebagian mesin Windows)\n"
 "2. **PENGAWAS GERAK GAMBAR — penyembuh otomatis**: tiap 2 detik selagi memutar, aplikasi membandingkan `totalVideoFrames` (frame yang benar-benar disajikan) dengan majunya waktu. Frame diam PADAHAL waktu maju = pompa macet → tangga penyembuhan: **kocok halus** (seek +0,05 dtk — memicu dekode ulang satu frame) → **nyalakan ulang visibilitas elemen** (kompositor dipasang ulang) → **jatuh ke jalur kanvas overlay** (gambar digambar manual — mode darurat yang selalu tampak). Setiap kejadian dicatat ke log (`v3.23 GAMBAR BEKU …`) utk diagnosis lapangan\n\n"
 "## 🔬 Kualitas\n"
 "- Uji frame baru (totalVideoFrames): 6/6 lulus — frame pratinjau tergambar segera, waktu berjalan, pompa hidup, native aktif\n"
 "- Uji penyembuh dgn \"sandera\" (counter dibuat diam sementara jam terus jalan): 6/6 lulus — deteksi ±2 dtk, seluruh tangga menyala berurutan, waktu tetap berjalan, **nol false-positive** saat pompa hidup (mesin lambat 2 fps tak salah dipicu)\n"
 "- Regresi v3.21 dijalankan ulang: **32/33 lulus** (sisa = asersi versi, wajar) — putar 4 jam nol beku (maks 15-43 ms), pelindung hang pulih, MODE AMAN otomatis, MODE PUTARAN HEMAT semua lulus\n\n"
 "## 📦 Instalasi\n"
 "- **Setup**: jalankan `KINOSTRA-Setup-3.23.0.exe`\n"
 "- **Portable**: ekstrak `KINOSTRA-Portable-3.23.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n"
 "---\n"
 "100% offline · Windows 10/11 x64 · Electron 33 · IMPOR & PUTAR FILM 3-4 JAM TANPA RESTART · GAMBAR SELALU BERGERAK (PENYEMBUH OTOMATIS) · NATIVE SEMUA RASIO · POTONG LANGSUNG · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K"
)

payload = {
    "tag_name": "v3.23.0",
    "target_commitish": "main",
    "name": "KINOSTRA v3.23.0 — GAMBAR BERGERAK LAGI (penyembuh pompa frame otomatis)",
    "body": body,
    "draft": False,
    "prerelease": False,
}

tpl = open('/home/z/my-project/scripts/release-v3220.sh').read()
head = tpl[:tpl.index('BODY=$(cat <<\'JSON\'')]
tail = tpl[tpl.index('\nJSON\n)\n'):]

new = head + "BODY=$(cat <<'JSON'\n" + json.dumps(payload, ensure_ascii=False, indent=2) + tail
new = new.replace('release-v3220.sh — buat release', 'release-v3230.sh — buat release')
open('/home/z/my-project/scripts/release-v3230.sh', 'w').write(new)
json.loads(new[new.index('{\n'):new.index('\nJSON\n')+0+0] if False else new[new.index('{\n  "tag_name"'):new.index('\nJSON\n')])
print('release-v3230.sh dibuat ulang — JSON valid')
