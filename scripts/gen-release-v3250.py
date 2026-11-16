#!/usr/bin/env python3
# generator release-v3250.sh — JSON via json.dumps + nama aset/tag di head/tail
# diganti versi TERLEBIH DAHULU (pelajaran kecelakaan v3.23, dipakai sejak v3.24)
import json

body = (
 "## 🎬 v3.25.0 — JALUR VIDSPLIT: AKAR GAMBAR BEKU DIBEDAH SEBENARNYA\n\n"
 "Permintaan kawan — *\"lihat VidSplit sebagai referensi\"* — petunjuk yang tepat sasaran. VidSplit bergerak di mesin yang sama karena video-nya **berdiri sendiri**: tidak ada apa pun di atasnya. KINOSTRA selama ini menaruh **kanvas overlay di atas elemen video** dan menggambar ulangnya **15× per detik walau isinya tidak berubah** (label part & judul memang statis sepanjang part). Setiap gambar ulang meng-invalidate region di atas video di kompositor Windows — akibatnya lapisan video **tidak pernah naik ke hardware overlay**, dan di GPU/driver tertentu gambar video berhenti tersaji: waktu jalan, decoder \"bekerja\", gambar beku. Persis rekaman yang kawan kirim.\n\n"
 "### Perbaikan\n"
 "1. **Overlay digambar HANYA saat isinya berubah** (ganti part, ganti subtitel, pengeditan setelan, resize) — uji: **3 gambar dalam 9 detik putar** (dulu ±135). Video berdiri sendiri persis VidSplit\n"
 "2. Animasi masuk part/judul dirender langsung ke keadaan akhir di pratinjau native — **ekspor tetap beranimasi penuh**; grain, frame neon berputar & judul neon otomatis pindah ke jalur kanvas (memang butuh kanvas per frame)\n"
 "3. **PENGAWAS LAYAR sejati**: main process meng-capture piksel jendela yang benar-benar tersaji (`capturePage`, pita tengah area putar, tiap 5 dtk) dan meng-hash-nya — **tak bisa dibohongi decoder maupun drawImage**. Ketiga detektor (pompa, piksel, layar) berbagi satu tangga: kocok halus + latar blur dibekukan → visibilitas → jalur kanvas (diingat per mesin)\n\n"
 "## 🔬 Kualitas\n"
 "- Overlay-statik **6/6** · pengawas layar **nol false-fire** di video bergerak · frame-test **6/6** · sandera pompa **6/6** · piksel **8/8** · regresi v3.21 **32/33** (sisa = asersi versi)\n\n"
 "## 📦 Instalasi\n"
 "- **Setup**: jalankan `KINOSTRA-Setup-3.25.0.exe`\n"
 "- **Portable**: ekstrak `KINOSTRA-Portable-3.25.0-win64.zip`, jalankan `KINOSTRA.exe`\n"
 "- Penting: hapus dulu flag jalur kanvas lama dengan membuka KINOSTRA sekali — atau biarkan: pengawas layar kini mendeteksi & menyembuhkan apa pun yang masih beku\n\n"
 "---\n"
 "100% offline · Windows 10/11 x64 · Electron 33 · IMPOR & PUTAR FILM 3-4 JAM TANPA RESTART · GAMBAR SELALU BERGERAK (JALUR VIDSPLIT + 3 DETEKTOR BEKU) · NATIVE SEMUA RASIO · POTONG LANGSUNG · NOVACUT COVER · ZOOM PEMBICARA · RESOLUSI 720p-4K"
)

payload = {
    "tag_name": "v3.25.0",
    "target_commitish": "main",
    "name": "KINOSTRA v3.25.0 — JALUR VIDSPLIT (akar gambar beku dibedah sebenarnya)",
    "body": body,
    "draft": False,
    "prerelease": False,
}

tpl = open('/home/z/my-project/scripts/release-v3220.sh').read()
head = tpl[:tpl.index("BODY=$(cat <<'JSON'")].replace('3.22.0', '3.25.0')
tail = tpl[tpl.index("\nJSON\n)\n"):].replace('3.22.0', '3.25.0')

new = head + "BODY=$(cat <<'JSON'\n" + json.dumps(payload, ensure_ascii=False, indent=2) + tail
new = new.replace('release-v3220.sh — buat release', 'release-v3250.sh — buat release')
open('/home/z/my-project/scripts/release-v3250.sh', 'w').write(new)
j = new[new.index('{\n  "tag_name"'):new.index('\nJSON\n')]
json.loads(j)
assert 'Setup-3.25.0.exe' in new and 'Portable-3.25.0-win64.zip' in new and '3.22.0' not in head and '3.22.0' not in tail
print('release-v3250.sh dibuat — JSON valid, nama aset 3.25.0 ✓')
