# KINOSTRA — Suite Video Otonom · DESKTOP v2.1

Aplikasi desktop **100% offline** untuk Windows 10/11 (64-bit).
Porting setia dari KINOSTRA v1.0 (web) + 6 upgrade.

## Cara Install

### Pilihan A — Installer (disarankan)
1. Jalankan `KINOSTRA-Setup-2.1.0.exe`
2. Pilih folder instalasi → Next → Install
3. Selesai — shortcut muncul di Desktop & Start Menu
4. Untuk menghapus: **Apps & Features → KINOSTRA → Uninstall**

### Pilihan B — Portable (tanpa install)
1. Ekstrak `KINOSTRA-Portable-2.1.0-win64.zip` ke folder mana pun
2. Jalankan `KINOSTRA.exe` di dalamnya
3. Jika Windows SmartScreen muncul (aplikasi belum ditandatangani):
   klik **More info → Run anyway**

## Fitur (10 Modul)

| No | Modul | Fungsi |
|----|-------|--------|
| 01 | Sumber & Rasio | Impor MP4/MKV/TS/WEBM/MP3, output 16:9 atau 9:16. **BARU v2.1: Zoom Fokus 1–3× + geser kiri/kanan/atas/bawah** (slider atau drag langsung di preview) |
| 02 | Judul & Part Otomatis | Split video per 20–60 dtk, nomor part otomatis 01→N |
| 03 | Deskripsi Video | Teks deskripsi di bawah judul / strip bawah |
| 04 | Subtitel AI | Whisper lokal 12 bahasa + translate ID/EN + geser waktu + ekspor SRT |
| 05 | Tracking Objek | Grafis label ala MotoGP (NCC + template adaptif) — kotak target ikut zoom/pan |
| 06 | Skor Musik AI | Komposisi prosedural EPIC/NEON DRIVE/LO-FI/TENSION |
| 07 | Tipografi Sinematik | 10 font Hollywood (Cinzel, Bebas Neue, Anton, dst) |
| 08 | Efek Visual & Watermark | Brightness/kontras/saturasi, vignette, film grain, watermark teks/logo |
| 09 | Ekspor & Kompresi | MP4 H.264 + AAC. **BARU v2.1: RENDER PARALEL** — semua part dirender bersamaan + encoder GPU |
| 10 | Batch Proses | **BARU v2.1: KOTAK VIDEO bergambar** — thumbnail otomatis, klik untuk menonton di preview, video aktif saat batch tampil di layar |

## Yang Baru di v2.1

### 1. Zoom Fokus & Geser (mode 9:16)
- Pilih rasio **9:16** → muncul slider **ZOOM FOKUS** (1.00×–3.00×)
- Semakin besar zoom, gambar semakin besar/fokus mengisi frame
- **GESER KIRI/KANAN** & **ATAS/BAWAH** untuk memilih bagian video yang diambil
- Bisa juga **drag langsung** gambar di preview (seperti menggeser foto)
- Tombol **RESET POSISI** mengembalikan ke awal
- Zoom & geser ikut terpakai saat ekspor + kotak tracking ikut mengikuti

### 2. Ekspor Jauh Lebih Cepat
- Semua part dirender **paralel sekaligus** (otomatis 1–3× sesuai CPU; bisa diatur 1×–4× di modul 09)
- Encoder **hardware GPU** dipakai bila tersedia (fallback otomatis ke CPU)
- Seek frame berantai (decode frame berikutnya berjalan selama encode frame saat ini)
- Hasil ditulis langsung ke disk per part — hemat RAM

### 3. Batch Proses dengan Kotak Video
- Setiap video dalam antrian punya **kotak thumbnail** otomatis
- **Klik kotak** → video dimuat ke preview utama untuk ditonton
- Saat batch berjalan, video yang sedang diproses **otomatis tampil di layar**
- Status tiap kotak: MENUNGGU · DIPROSES · SELESAI · GAGAL

## Subtitel AI — Cara Kerja Offline

- Klik **GENERATE SUBTITEL** pertama kali → model Whisper (±40 MB) diunduh
  **sekali saja** ke folder data aplikasi (`%APPDATA%\KINOSTRA\models`)
- Setelah itu aplikasi **100% offline selamanya** — bisa diputus internetnya
- Model TINY (cepat) atau BASE (akurat) — keduanya diunduh terpisah sesuai pilihan
- Terjemahan ID/EN memakai model tambahan (opus-mt) yang juga diunduh sekali

## Pintasan Keyboard
- `Spasi` — Play / Pause
- `Ctrl+O` — Impor media
- Drag di preview (mode 9:16) — geser posisi fokus

## Catatan Teknis
- Rendering lokal penuh (WebCodecs GPU/CPU) — tanpa upload ke internet
- Output MP4 H.264 + AAC/Opus, faststart (siap streaming)
- Data model AI: `%APPDATA%\KINOSTRA\models` (bisa dibuka dari panel Subtitel)
- Versi: 2.1.0 · Engine: Electron 33 (Chromium 130)
