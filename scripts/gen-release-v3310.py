#!/usr/bin/env python3
# generator release-v3310.sh — JSON via json.dumps + nama aset/tag diganti dulu
import json

body = (
 "## 🔍 v3.31.0 — PEMINDAI AUDIO SENYAP (deteksi sumber tanpa suara)\n\n"
 "Bedah file nyata dari kawan di v3.30 membuktikan sesuatu yang penting: **file sumbernya sendiri hening total** — puncak volume **−91 dB** sepanjang video. Track AAC-nya ADA, tetapi isinya kosong. Ini umum terjadi pada film split-an hasil unduhan: pengunggah sering menghapus atau mengganti audio untuk menghindari deteksi hak cipta. Aplikasi menyalin audio asli dengan setia — yang aslinya memang tidak berisi suara — sehingga hasil ekspor pun hening.\n\n"
 "### Kini KINOSTRA memeriksa audio sumber sejak impor\n"
 "- Puncak sampel audio diukur sekali per video — saat **impor** (file kecil) dan saat **ekspor** (buffer siap, termasuk jalur demux/decode penuh v3.30).\n"
 "- Jika sumber ternyata hening total (puncak di bawah −60 dBFS), muncul **peringatan jelas**: \"AUDIO ASLI VIDEO SENYAP — file sumber TIDAK berisi suara (bukan gangguan aplikasi)\". Modul 11 juga diberi tanda ⚠.\n"
 "- Peringatan langsung memberi solusi: isi suara lewat **BACKSOUND MP3 SENDIRI** (modul 11 MUSIK & NARASI AI) — hasil ekspor akan bernada dengan musik pilihan kawan.\n"
 "- Bila MUSIK/BACKSOUND sudah terpasang, pesan menyesuaikan: hasil ekspor akan berisi MUSIK/BACKSOUND.\n\n"
 "## 🔬 Kualitas\n"
 "- **Uji baru 12/12**: deteksi senyap di impor (toast + tanda ⚠ di modul 11) · ekspor sumber senyap = salinan setia (≤ −80 dB) · **dengan MUSIK terpasang hasil ekspor BERNADA (> −55 dB)** · sumber bernada (−16 dB) tidak salah alarm\n"
 "- Regresi: v3.30 (WebM + panel 424px) **9/9** · v3.29 (MP4) **7/7** · modul 16 **14/14** · ekspor anti-beku **7/7** · v3.28 **11/11** · v3.27 **12/12** · v3.14 **22/22** · frame **6/6** · overlay **6/6**\n\n"
 "## 💡 Catatan untuk kasus \"hasil split tidak ada suaranya\"\n"
 "Putar dulu file sumbernya di pemutar mana pun: bila sumber juga tidak bersuara, suara aslinya memang tidak ada di file — aktifkan BACKSOUND. Bila sumber bersuara, v3.30/v3.31 menjamin audio ikut untuk semua format (MP4/MKV/WebM/FLV/MP3).\n\n"
 "## 📦 Instalasi\n"
 "- **Setup**: jalankan `KINOSTRA-Setup-3.31.0.exe`\n"
 "- **Portable**: ekstrak `KINOSTRA-Portable-3.31.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n"
 "---\n"
 "100% offline · Windows 10/11 x64 · Electron 33 · EKSPOR & SPLIT = PROSES v3.16.0 · SUARA DIJAMIN IKUT (SEMUA FORMAT) · PEMINDAI AUDIO SENYAP · IMPOR & PUTAR FILM 3-4 JAM TANPA RESTART · POTONG LANGSUNG · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K"
)

payload = {
    "tag_name": "v3.31.0",
    "target_commitish": "main",
    "name": "KINOSTRA v3.31.0 — PEMINDAI AUDIO SENYAP (deteksi sumber tanpa suara + solusi backsound)",
    "body": body,
    "draft": False,
    "prerelease": False,
}

tpl = open('/home/z/my-project/scripts/release-v3290.sh').read()
head = tpl[:tpl.index("BODY=$(cat <<'JSON'")].replace('3.29.0', '3.31.0')
tail = tpl[tpl.index("\nJSON\n)\n"):].replace('3.29.0', '3.31.0')

new = head + "BODY=$(cat <<'JSON'\n" + json.dumps(payload, ensure_ascii=False, indent=2) + tail
new = new.replace('release-v3290.sh — buat release', 'release-v3310.sh — buat release')
open('/home/z/my-project/scripts/release-v3310.sh', 'w').write(new)
j = new[new.index('{\n  "tag_name"'):new.index('\nJSON\n')]
json.loads(j)
assert 'Setup-3.31.0.exe' in new and 'Portable-3.31.0-win64.zip' in new and '3.30.0' not in head and '3.30.0' not in tail
print('release-v3310.sh dibuat — JSON valid, nama aset 3.31.0 ✓')
