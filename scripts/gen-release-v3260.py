#!/usr/bin/env python3
# generator release-v3260.sh — JSON via json.dumps + nama aset/tag di head/tail
# diganti versi TERLEBIH DAHULU (pelajaran kecelakaan v3.23, dipakai sejak v3.24)
import json

body = (
 "## 🛠️ v3.26.0 — AUDIT & UPGRADE MODUL 16: PERAWATAN & PERFORMA\n\n"
 "Pertanyaan kawan — *\"apakah OPTIMASI PERFORMA satu-klik dan BERSIHKAN CACHE sudah berfungsi baik, ataukah butuh upgrade?\"* — jawabannya: **duanya sudah bekerja, tapi layak diupgrade — dan kini sudah diupgrade.**\n\n"
 "### Yang dibenahi\n"
 "1. **Flag kanvas darurat ikut dilepas** — OPTIMASI & BERSIHKAN CACHE kini menghapus flag `kinostra.canvasPlay`: mesin yang dulu dipaksa jalur kanvas oleh pengawas era v3.24 mencoba **jalur native** lagi (akar beku sudah tuntas di v3.25; tiga pengawas — pompa, piksel, layar — tetap menjaga)\n"
 "2. **BERSIHKAN CACHE kini menghapus cache shader/kode GPU** (GPUCache, ShaderCache, Dawn*, Code Cache — bisa ratusan MB). Dulu hanya dibersihkan otomatis saat mati tak wajar; kini on-demand — sekaligus **obat manual kalau efek tampilan terlihat korup**. Berkas yang dikunci sistem dilewati aman\n"
 "3. **Total disk dibebaskan kini tampil** (estimasi MB) di hasil pembersihan\n"
 "4. **Kotak info kini menampilkan JALUR PUTAR** (native ala VidSplit / kanvas darurat) **+ nama GPU + status encoder hardware + ukuran cache shader**\n"
 "5. **Benahi bug lama**: label *\"cache tampilan/HTTP dibersihkan\"* tidak pernah muncul sejak v3.16 (renderer mengecek teks yang tak pernah dikirim main)\n\n"
 "## 🔬 Kualitas\n"
 "- Uji khusus modul 16 **14/14** (modal hasil, flag kanvas benar-benar dilepas, disk dibebaskan, info jalur/GPU, putar tetap sehat di native setelah pembersihan) · frame-test **6/6** · overlay-statik **6/6**\n\n"
 "## 📦 Instalasi\n"
 "- **Setup**: jalankan `KINOSTRA-Setup-3.26.0.exe`\n"
 "- **Portable**: ekstrak `KINOSTRA-Portable-3.26.0-win64.zip`, jalankan `KINOSTRA.exe`\n"
 "- Saran: setelah pasang, jalankan sekali **OPTIMASI PERFORMA — SATU KLIK** di modul 16 — apapun sisa flag lama dari era v3.24 langsung dilepas dan kotak info menunjukkan jalur putar + GPU-mu\n\n"
 "---\n"
 "100% offline · Windows 10/11 x64 · Electron 33 · IMPOR & PUTAR FILM 3-4 JAM TANPA RESTART · GAMBAR SELALU BERGERAK (JALUR VIDSPLIT + 3 DETEKTOR BEKU) · MODUL 16 PERAWATAN DENGAN TANGGA PENYEMBUHAN · POTONG LANGSUNG · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K"
)

payload = {
    "tag_name": "v3.26.0",
    "target_commitish": "main",
    "name": "KINOSTRA v3.26.0 — Modul 16 diupgrade: OPTIMASI & BERSIHKAN CACHE lebih cerdas",
    "body": body,
    "draft": False,
    "prerelease": False,
}

tpl = open('/home/z/my-project/scripts/release-v3250.sh').read()
head = tpl[:tpl.index("BODY=$(cat <<'JSON'")].replace('3.25.0', '3.26.0')
tail = tpl[tpl.index("\nJSON\n)\n"):].replace('3.25.0', '3.26.0')

new = head + "BODY=$(cat <<'JSON'\n" + json.dumps(payload, ensure_ascii=False, indent=2) + tail
new = new.replace('release-v3250.sh — buat release', 'release-v3260.sh — buat release')
open('/home/z/my-project/scripts/release-v3260.sh', 'w').write(new)
j = new[new.index('{\n  "tag_name"'):new.index('\nJSON\n')]
json.loads(j)
assert 'Setup-3.26.0.exe' in new and 'Portable-3.26.0-win64.zip' in new and '3.25.0' not in head and '3.25.0' not in tail
print('release-v3260.sh dibuat — JSON valid, nama aset 3.26.0 ✓')
