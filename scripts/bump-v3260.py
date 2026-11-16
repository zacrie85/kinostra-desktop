#!/usr/bin/env python3
# bump v3.25.0 → v3.26.0 (6 file) + baris fitur README + bagian PANDUAN
import json, re

CHG = ("v3.26.0: AUDIT & UPGRADE MODUL 16 PERAWATAN & PERFORMA \u2014 kedua tombol dasarnya bekerja, "
 "tapi audit menemukan 4 celah + 1 bug lama, semuanya dibenahi: (1) OPTIMASI & BERSIHKAN CACHE kini MELEPAS "
 "flag kanvas darurat (kinostra.canvasPlay) \u2014 mesin yang dulu dipaksa jalur kanvas era v3.24 mencoba jalur "
 "native lagi; akar beku sudah tuntas di v3.25 dan pengawas pompa/piksel/layar tetap menjaga; "
 "(2) BERSIHKAN CACHE kini menghapus cache shader/kode GPU (GPUCache, ShaderCache, Dawn*, Code Cache \u2014 bisa "
 "ratusan MB) \u2014 sekaligus obat manual efek tampilan korup; file yang dikunci sistem dilewati aman; "
 "(3) hasil pembersihan kini menampilkan TOTAL DISK dibebaskan (estimasi MB); "
 "(4) kotak info modul 16 kini menampilkan JALUR PUTAR (native/kanvas) + nama GPU + encoder hardware + ukuran "
 "cache shader, dan membenahi bug lama: label 'cache tampilan/HTTP dibersihkan' tidak pernah tampil sejak "
 "v3.16 karena renderer mengecek teks yang tidak pernah dikirim main ('cache tampilan/HTTP' vs 'http'). "
 "Uji: maintenance-test baru 14/14 (modal, flag dilepas, disk dibebaskan, info jalur, putar tetap sehat "
 "setelah bersih), frame 6/6, overlay 6/6. ")

d = json.loads(open('package.json').read())
d['version'] = '3.26.0'
desc = d['description']
assert '\u00b7 v3.25.0:' in desc
d['description'] = desc.replace('\u00b7 v3.25.0:', '\u00b7 ' + CHG + '\u00b7 v3.25.0:', 1)
open('package.json', 'w').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

for f in ['build/installer.nsi', 'build/afterpack.js']:
    s = open(f).read()
    open(f, 'w').write(s.replace('3.25.0', '3.26.0'))

s = open('README.md').read()
s = s.replace('badge/version-3.25.0-amber', 'badge/version-3.26.0-amber', 1)
row69 = ('| 69 | **MODUL 16 UPGRADE** \u2b50v3.26.0 | '
 'Audit PERAWATAN & PERFORMA: OPTIMASI & BERSIHKAN CACHE kini melepas flag kanvas darurat (native dicoba lagi), '
 'menghapus cache shader/kode GPU (bisa ratusan MB), menampilkan total disk dibebaskan, kotak info memuat JALUR PUTAR + GPU, '
 'dan benahi bug label "cache tampilan" yang tak pernah tampil sejak v3.16 |\n')
m = re.search(r'^\| 68 \|.+\|\n', s, re.M)
assert m, 'baris 68 tak ketemu'
s = s[:m.end()] + row69 + s[m.end():]
open('README.md', 'w').write(s)

s = open('KINOSTRA-PANDUAN.md').read()
s = s.replace('# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.25.0', '# KINOSTRA \u2014 Suite Video Otonom \u00b7 DESKTOP v3.26.0', 1)
sec = ('''## Yang Baru di v3.26.0 — AUDIT & UPGRADE MODUL 16: PERAWATAN & PERFORMA

Pertanyaanmu — *"apakah OPTIMASI PERFORMA satu-klik dan BERSIHKAN CACHE sudah berfungsi baik, ataukah butuh upgrade?"* — jawabannya: **duanya sudah bekerja, tapi layak diupgrade, dan kini sudah diupgrade.** Audit menemukan empat celah dan satu bug lama; semuanya dibenahi:

1. **OPTIMASI & BERSIHKAN CACHE kini melepas FLAG KANVAS DARURAT.** Mesin yang pernah dipaksa masuk jalur kanvas oleh pengawas era v3.24 ("penyajian mati") terjebak di jalur itu selamanya — padahal akar beku sudah dibedah tuntas di v3.25. Kini setelah optimasi/bersih, aplikasi mencoba jalur native lagi; bila pun masih beku, tiga pengawas (pompa, piksel, layar) + tangga penyembuhan tetap menjaga.
2. **BERSIHKAN CACHE kini menghapus CACHE SHADER/KODE GPU** (GPUCache, ShaderCache, Dawn*, Code Cache — bisa ratusan MB). Dulu folder ini hanya dibersihkan otomatis saat aplikasi mati tak wajar; kini bisa dipanggil manual — sekaligus jadi obat kalau efek tampilan terlihat korup/rusak. Berkas yang sedang dikunci sistem dilewati dengan aman.
3. **Hasil pembersihan menampilkan TOTAL DISK dibebaskan** (estimasi MB) — dulu hanya daftar aksi tanpa angka.
4. **Kotak info kini menampilkan JALUR PUTAR** (native ala VidSplit / kanvas darurat) **+ nama GPU + status encoder hardware + ukuran cache shader** — jadi status sehat mesinmu terlihat sekali pandang.

Plus benahi bug lama yang baru ketahuan saat audit: label *"cache tampilan/HTTP dibersihkan"* **tidak pernah muncul sejak v3.16** karena renderer mengecek teks `'cache tampilan/HTTP'` padahal main process mengirim `'http'`.

Diuji: uji baru khusus modul 16 **14/14** (modal hasil, flag kanvas benar-benar dilepas, disk dibebaskan tampil, info jalur/GPU, dan putar tetap sehat di jalur native setelah pembersihan), frame-test **6/6**, overlay-statik **6/6**.

''')
s = s.replace('## Yang Baru di v3.25.0', sec + '## Yang Baru di v3.25.0', 1)
open('KINOSTRA-PANDUAN.md', 'w').write(s)

s = open('renderer/index.html').read()
assert s.count('3.25.0') == 2, s.count('3.25.0')
open('renderer/index.html', 'w').write(s.replace('3.25.0', '3.26.0'))

print('bump v3.26.0 selesai — 6 file')
