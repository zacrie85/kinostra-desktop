# KINOSTRA — Suite Video Otonom · DESKTOP v2.3

Aplikasi desktop **100% offline** untuk Windows 10/11 (64-bit).
Porting setia dari KINOSTRA v1.0 (web) + 13 upgrade.

## Cara Install

### Pilihan A — Installer (disarankan)
1. Jalankan `KINOSTRA-Setup-2.3.0.exe`
2. Pilih folder instalasi → Next → Install
3. Selesai — shortcut muncul di Desktop & Start Menu
4. Untuk menghapus: **Apps & Features → KINOSTRA → Uninstall**

### Pilihan B — Portable (tanpa install)
1. Ekstrak `KINOSTRA-Portable-2.3.0-win64.zip` ke folder mana pun
2. Jalankan `KINOSTRA.exe` di dalamnya
3. Jika Windows SmartScreen muncul (aplikasi belum ditandatangani):
   klik **More info → Run anyway**

## Fitur (11 Modul)

| No | Modul | Fungsi |
|----|-------|--------|
| 00 | **Kotak Video · Urutan** ⭐v2.2 | **SATU kotak untuk semua video** — dari IMPOR MEDIA, drag-drop, maupun TAMBAH FILE batch. Berurutan dari atas ke bawah. Thumbnail otomatis, tombol naik/turun urutan, hapus & pratinjau |
| 01 | Sumber & Rasio | Impor MP4/MKV/TS/WEBM/MP3, output 16:9 atau 9:16. Zoom Fokus 1–3× + geser kiri/kanan/atas/bawah (slider atau drag langsung di preview) |
| 02 | Judul & Part Otomatis | Split video per 20–60 dtk, nomor part otomatis 01→N. **BARU v2.3: judul terisi otomatis dari nama file tiap video, font Bebas Neue ukuran 40 (bisa diganti)** |
| 03 | Deskripsi Video | Teks deskripsi di bawah judul / strip bawah |
| 04 | Subtitel AI | **BARU v2.3: MESIN VOCALIS v3 — fokus Bahasa Jawa & Bahasa Indonesia** — teks dibuat dalam bahasa yang diucapkan/dinyanyikan (Jawa tetap Jawa), Mode Lagu/Vokal untuk video bernyanyi, lompat hening, filter halusinasi, ekspor SRT |
| 05 | Tracking Objek | Grafis label ala MotoGP (NCC + template adaptif) — kotak target ikut zoom/pan |
| 06 | Skor Musik AI | Komposisi prosedural EPIC/NEON DRIVE/LO-FI/TENSION |
| 07 | Tipografi Sinematik | 10 font Hollywood (Cinzel, Bebas Neue, Anton, dst) |
| 08 | Efek Visual & Watermark | Brightness/kontras/saturasi, vignette, film grain, watermark teks/logo |
| 09 | Ekspor & Kompresi | MP4 H.264 + AAC. **v2.2 TURBO STREAM** — frame diambil sambil video diputar cepat (tanpa seek per frame) + encoder GPU + render paralel |
| 10 | Batch Proses | **BARU v2.3: impor massal sampai 100 video sekaligus** — semua masuk Kotak Video lalu diproses **berurutan otomatis** satu per satu |

## Yang Baru di v2.3

### 1. VOCALIS v3 — mesin subtitel AI baru, fokus Bahasa Jawa & Indonesia
- **Mesin lama diganti total.** VOCALIS v3 hanya menangani **Bahasa Jawa**
  dan **Bahasa Indonesia** — teks dibuat **dalam bahasa yang diucapkan atau
  dinyanyikan** di video: Jawa tetap Jawa, Indonesia tetap Indonesia.
  Tidak ada terjemahan yang mengubah isi ucapan.
- **Tiga mesin pilihan:**
  - `TURBO` — paling akurat untuk ucapan & lirik lagu (±724 MB, sekali unduh)
  - `SEDANG` — seimbang (±254 MB)
  - `RINGAN` — cepat (±80 MB)
- **Mode Lagu/Vokal** (aktif default): pendeteksi suara disetel lebih peka agar
  bagian yang **dinyanyikan** (sering lebih pelan dari musik) ikut ditranskrip
- **Deteksi bahasa ganda**: cuplikan vokal dianalisis dengan kedua bahasa lalu
  dipilih lewat skor kata-kata khas Jawa/Indonesia — bisa juga dipaksa manual
- Anti-halusinasi & anti-pengulangan tetap aktif; ekspor `.SRT` tersedia

### 2. Impor massal — 100 video sekaligus, diproses berurutan
- Pilih **sampai 100 video dalam satu dialog** (Ctrl+A untuk memilih semua)
- Semua langsung masuk **Kotak Video** berurutan atas → bawah
- Centang **"Langsung proses berurutan"** → setelah impor, batch mulai sendiri:
  video ke-1 sampai ke-100 diproses **satu per satu** memakai setelan saat ini
  (judul tiap video otomatis dari nama filenya masing-masing)
- Thumbnail kini **streaming** — video sebesar apa pun tidak memenuhi memori

### 3. Judul otomatis dari nama file + font Bebas Neue ukuran 40
- Setiap video yang dimuat **langsung mengisi judul dari nama filenya**
  (contoh: `Panduan_Ekspor_Video.mp4` → judul "Panduan Ekspor Video")
- Font judul default **Bebas Neue** dengan ukuran default **40** —
  font & ukuran bisa diganti di modul 02, sinkron dengan grid modul 07
- Centang **"Judul otomatis dari nama file"** bisa dimatikan bila ingin
  menulis judul manual (judul manual dipertahankan antar video)

### 4. Perbaikan mesin & kecepatan
- Library AI diperbarui (transformers.js v3 + onnxruntime baru) — pondasi
  model TURBO untuk Bahasa Jawa
- Saat AI/batch bekerja, preview di-throttle agar CPU penuh untuk proses

## Subtitel AI — Cara Kerja Offline
- Klik **BUAT SUBTITEL DARI VOKAL** pertama kali → model pilihanmu diunduh
  **sekali saja** ke folder data aplikasi (`%APPDATA%\KINOSTRA\models`)
- Setelah itu aplikasi **100% offline selamanya** — bisa diputus internetnya
- Mesin mengikuti RAM: RAM ≥ 8 GB default TURBO; RAM lebih kecil otomatis
  disarankan ke SEDANG/RINGAN (aman memori, tetap bisa diganti manual)

## Pintasan Keyboard
- `Spasi` — Play / Pause
- `Ctrl+O` — Impor media
- Drag di preview (mode 9:16) — geser posisi fokus

## Catatan Teknis
- Rendering lokal penuh (WebCodecs GPU/CPU) — tanpa upload ke internet
- Output MP4 H.264 + AAC/Opus, faststart (siap streaming)
- Data model AI: `%APPDATA%\KINOSTRA\models` (bisa dibuka dari panel Subtitel)
- Versi: 2.3.0 · Engine: Electron 33 (Chromium 130)
