#!/usr/bin/env python3
# generator release-v3300.sh — JSON via json.dumps + nama aset/tag diganti dulu
import json

body = (
 "## ✨ v3.30.0 — SUARA DIJAMIN IKUT + PANEL LEBAR (semua frame tampil)\n\n"
 "Dua upgrade atas laporan kawan di v3.29: *\"video berhasil di export dan split akan tetapi tidak ada suaranya\"* dan *\"frame part yang tampil di menu hanya 9, padahal ada 15\"*.\n\n"
 "### 1 · Suara dijamin ikut — semua format video\n"
 "Akar masalah: bila sumber video berwadah **bukan MP4/AAC** (mis. WebM, MKV, FLV, atau MP3), pelacak audio internal tidak mengenal wadahnya → jalur audio dianggap tidak ada → hasil ekspor/split jalan **tanpa stream audio sama sekali**. Sekarang:\n"
 "- Setiap video selalu dianggap berpotensi bersuara — encoder audio selalu disiapkan.\n"
 "- Bila jalur demux AAC (hemat RAM) gagal, KINOSTRA otomatis jatuh ke **decode audio penuh ala v3.16** yang mengenal **SEMUA format** — persis proses yang dulu selalu bersuara.\n"
 "- Pelindung baru: bila hasil decode ternyata kosong (track rusak), buffer kosong tidak pernah dikirim — otomatis dicoba lewat jalur lain, bukan diekspor senyap.\n\n"
 "### 2 · Panel kanan lebih lebar + frame tampil semua\n"
 "Lebar panel setelan dinaikkan 384 → **424px** dan baris pilihan frame kini **melipat ke baris berikutnya** — seluruh **16 tombol FRAME PART (TANPA + 15 gaya futuristik transparan)** terlihat dalam 2 baris, tidak ada lagi yang tersembunyi di tepi panel. Berlaku juga untuk pilihan frame judul, layout cover, palet & transisi.\n\n"
 "## 🔬 Kualitas\n"
 "- **Uji baru 9/9**: WebM 17 menit (Opus) — impor tanpa buffer & tanpa demux (prekondisi kasus user) · ekspor PARALEL 5× 2 part selesai · **stream AAC di semua part & volume terukur (mean > −55 dB, TIDAK senyap)** · buffer = durasi PENUH video (bukti jalur decode penuh aktif) · chips 16 tombol tampil semua dalam panel 424px\n"
 "- Regresi: v3.29 (MP4) **7/7** · modul 16 **14/14** · ekspor anti-beku **7/7** · v3.28 (15+15 frame) **11/11** · v3.27 **12/12** · v3.14 **22/22** · frame **6/6** · overlay **6/6**\n\n"
 "## 📦 Instalasi\n"
 "- **Setup**: jalankan `KINOSTRA-Setup-3.30.0.exe`\n"
 "- **Portable**: ekstrak `KINOSTRA-Portable-3.30.0-win64.zip`, jalankan `KINOSTRA.exe`\n\n"
 "---\n"
 "100% offline · Windows 10/11 x64 · Electron 33 · EKSPOR & SPLIT = PROSES v3.16.0 · SUARA DIJAMIN IKUT (SEMUA FORMAT) · IMPOR & PUTAR FILM 3-4 JAM TANPA RESTART · POTONG LANGSUNG · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K"
)

payload = {
    "tag_name": "v3.30.0",
    "target_commitish": "main",
    "name": "KINOSTRA v3.30.0 — SUARA DIJAMIN IKUT (semua format) + PANEL LEBAR (16 frame tampil semua)",
    "body": body,
    "draft": False,
    "prerelease": False,
}

tpl = open('/home/z/my-project/scripts/release-v3290.sh').read()
head = tpl[:tpl.index("BODY=$(cat <<'JSON'")].replace('3.29.0', '3.30.0')
tail = tpl[tpl.index("\nJSON\n)\n"):].replace('3.29.0', '3.30.0')

new = head + "BODY=$(cat <<'JSON'\n" + json.dumps(payload, ensure_ascii=False, indent=2) + tail
new = new.replace('release-v3290.sh — buat release', 'release-v3300.sh — buat release')
open('/home/z/my-project/scripts/release-v3300.sh', 'w').write(new)
j = new[new.index('{\n  "tag_name"'):new.index('\nJSON\n')]
json.loads(j)
assert 'Setup-3.30.0.exe' in new and 'Portable-3.30.0-win64.zip' in new and '3.29.0' not in head and '3.29.0' not in tail
print('release-v3300.sh dibuat — JSON valid, nama aset 3.30.0 ✓')
