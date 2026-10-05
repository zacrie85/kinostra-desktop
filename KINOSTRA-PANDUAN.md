# KINOSTRA — Suite Video Otonom · DESKTOP v2.5

Aplikasi desktop **100% offline** untuk Windows 10/11 (64-bit).
Porting setia dari KINOSTRA v1.0 (web) + 13 upgrade.

## Cara Install

### Pilihan A — Installer (disarankan)
1. Jalankan `KINOSTRA-Setup-2.5.0.exe`
2. Pilih folder instalasi → Next → Install
3. Selesai — shortcut muncul di Desktop & Start Menu
4. Untuk menghapus: **Apps & Features → KINOSTRA → Uninstall**

### Pilihan B — Portable (tanpa install)
1. Ekstrak `KINOSTRA-Portable-2.5.0-win64.zip` ke folder mana pun
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
| 04 | Subtitel AI | **BARU v2.4: MESIN VOCALIS v4 NATIVE (whisper.cpp) — fokus Bahasa Jawa & Bahasa Indonesia** — proses native stabil (tidak gagal lagi), unduhan model resume otomatis, teks dibuat dalam bahasa yang diucapkan/dinyanyikan (Jawa tetap Jawa), Mode Lagu/Vokal, filter halusinasi, ekspor SRT. **v2.5: posisi subtitel bisa digeser atas/bawah + ukuran** |
| 05 | Tracking Objek | Grafis label ala MotoGP (NCC + template adaptif) — kotak target ikut zoom/pan |
| 06 | Skor Musik AI | Komposisi prosedural EPIC/NEON DRIVE/LO-FI/TENSION |
| 07 | Tipografi Sinematik | 10 font Hollywood (Cinzel, Bebas Neue, Anton, dst) |
| 08 | Efek Visual & Watermark | Brightness/kontras/saturasi, vignette, film grain, watermark teks/logo |
| 09 | Ekspor & Kompresi | MP4 H.264 + AAC. **v2.2 TURBO STREAM** — frame diambil sambil video diputar cepat (tanpa seek per frame) + encoder GPU + render paralel |
| 10 | Batch Proses | **BARU v2.3: impor massal sampai 100 video sekaligus** — semua masuk Kotak Video lalu diproses **berurutan otomatis** satu per satu |

## Yang Baru di v2.5

### 1. Posisi subtitel bisa digeser — tidak berdempetan lagi dengan tulisan PART
- Modul 04 ada **slider POSISI SUBTITEL**: geser ke kiri = subtitel naik
  (menjauh dari tulisan PART di kiri bawah), geser ke kanan = turun ke bawah.
- Rentang 45% (tengah layar) sampai 97% (paling bawah); posisi default 90%
  sama seperti versi lama, jadi tampilan lama tidak berubah.
- Posisi ini ikut **terbakar (burn-in) ke video saat ekspor** dan langsung
  terlihat di preview saat digeser.

### 2. Ekspor tidak macet lagi di bagian akhir
- **Penyebab ditemukan:** tiga hal bisa membuat ekspor berhenti selamanya
  TANPA pesan error — (a) frame callback video berhenti memicu di frame
  terakhir sehingga part terakhir tidak pernah "selesai", (b) encoder GPU
  (Media Foundation Windows) berhenti mengeluarkan output di tengah jalan,
  (c) flush encoder / tulis file ke disk tidak pernah selesai.
- **Perbaikan:**
  - Watchdog pendeteksi akhir video setiap 250 ms — part selalu selesai
    walau event akhir video tidak datang.
  - Semua tahap rawan (mix audio, encode audio, flush encoder, tulis MP4
    ke disk) kini punya **batas waktu** dengan pesan error yang jelas.
  - **Ulang otomatis 1× dengan encoder software** bila encoder GPU macet —
    statusnya terlihat di layar (`P03 (ULANGI-SW) 45%`).
  - Watchdog global: tidak ada kemajuan 45 detik → dihentikan dengan pesan
    penjelasan, bukan macet diam-diam. Status FLUSH/FINAL/SIMPAN ikut
    ditampilkan saat part menyelesaikan dirinya.

## Yang Baru di v2.4

### 1. VOCALIS v4 NATIVE — mesin subtitel diganti TOTAL, tidak gagal lagi
- **Masalah versi lama (v3) diperbaiki dari akarnya.** Mesin subtitel kini
  memakai **whisper.cpp native** — program terpisah di luar aplikasi, bukan
  lagi AI di dalam browser. Kegagalan pembuatan subtitel (kehabisan memori /
  crash) **tidak terjadi lagi** — mesin native tidak kenal batas memori browser.
- **Unduhan model dengan RESUME.** Model diunduh sekali (31–547 MB, jauh
  lebih kecil dari 724 MB versi lama); bila koneksi terputus, unduhan
  **lanjut dari posisi terakhir** — tidak mulai dari nol lagi.
- **Binari terpasang di dalam aplikasi** — tanpa unduhan komponen tambahan.
- **Fokus Bahasa Jawa & Bahasa Indonesia** — teks tetap ditulis dalam bahasa
  yang diucapkan/dinyanyikan (Jawa tetap Jawa, Indonesia tetap Indonesia),
  tanpa terjemahan. Deteksi ganda + leksikon khas Jawa/Indonesia.
- **Tiga mesin pilihan:**
  - `TURBO` — paling akurat untuk ucapan & lirik lagu (±547 MB, sekali unduh)
  - `SEDANG` — seimbang (±181 MB)
  - `RINGAN` — cepat (±31 MB)
- **Mode Lagu/Vokal** (aktif default) + **filter hallusinasi diperkuat**:
  baris aksara asing dibuang otomatis, anti-pengulangan, ekspor `.SRT` tersedia

### 2. Impor massal — 100 video sekaligus, diproses berurutan (dari v2.3)
- Pilih **sampai 100 video dalam satu dialog** (Ctrl+A untuk memilih semua)
- Semua langsung masuk **Kotak Video** berurutan atas → bawah
- Centang **"Langsung proses berurutan"** → setelah impor, batch mulai sendiri:
  video ke-1 sampai ke-100 diproses **satu per satu** memakai setelan saat ini
  (judul tiap video otomatis dari nama filenya masing-masing)
- Thumbnail kini **streaming** — video sebesar apa pun tidak memenuhi memori

### 3. Judul otomatis dari nama file + font Bebas Neue ukuran 40 (dari v2.3)
- Setiap video yang dimuat **langsung mengisi judul dari nama filenya**
  (contoh: `Panduan_Ekspor_Video.mp4` → judul "Panduan Ekspor Video")
- Font judul default **Bebas Neue** dengan ukuran default **40** —
  font & ukuran bisa diganti di modul 02, sinkron dengan grid modul 07
- Centang **"Judul otomatis dari nama file"** bisa dimatikan bila ingin
  menulis judul manual (judul manual dipertahankan antar video)

## Subtitel AI — Cara Kerja Offline
- Klik **BUAT SUBTITEL DARI VOKAL** pertama kali → model pilihanmu diunduh
  **sekali saja** ke folder data aplikasi (`%APPDATA%\KINOSTRA\whisper`)
- Setelah itu aplikasi **100% offline selamanya** — bisa diputus internetnya
- Mesin mengikuti RAM: RAM ≥ 8 GB default TURBO; RAM lebih kecil otomatis
  disarankan ke SEDANG/RINGAN (aman memori, tetap bisa diganti manual)
- Proses subtitel sekarang **tidak membekukan aplikasi** — preview tetap hidup

## Pintasan Keyboard
- `Spasi` — Play / Pause
- `Ctrl+O` — Impor media
- Drag di preview (mode 9:16) — geser posisi fokus

## Catatan Teknis
- Rendering lokal penuh (WebCodecs GPU/CPU) — tanpa upload ke internet
- Output MP4 H.264 + AAC/Opus, faststart (siap streaming)
- Data model AI: `%APPDATA%\KINOSTRA\whisper` (bisa dibuka dari panel Subtitel)
- Mesin subtitel: whisper.cpp v1.9.4 (MIT) — binari dibundel di `bin/whisper`
- Versi: 2.5.0 · Engine: Electron 33 (Chromium 130)
