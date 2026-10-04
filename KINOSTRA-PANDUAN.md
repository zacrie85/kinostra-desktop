# KINOSTRA — Suite Video Otonom · DESKTOP v2.2

Aplikasi desktop **100% offline** untuk Windows 10/11 (64-bit).
Porting setia dari KINOSTRA v1.0 (web) + 10 upgrade.

## Cara Install

### Pilihan A — Installer (disarankan)
1. Jalankan `KINOSTRA-Setup-2.2.0.exe`
2. Pilih folder instalasi → Next → Install
3. Selesai — shortcut muncul di Desktop & Start Menu
4. Untuk menghapus: **Apps & Features → KINOSTRA → Uninstall**

### Pilihan B — Portable (tanpa install)
1. Ekstrak `KINOSTRA-Portable-2.2.0-win64.zip` ke folder mana pun
2. Jalankan `KINOSTRA.exe` di dalamnya
3. Jika Windows SmartScreen muncul (aplikasi belum ditandatangani):
   klik **More info → Run anyway**

## Fitur (11 Modul)

| No | Modul | Fungsi |
|----|-------|--------|
| 00 | **Kotak Video · Urutan** ⭐v2.2 | **SATU kotak untuk semua video** — dari IMPOR MEDIA, drag-drop, maupun TAMBAH FILE batch. Berurutan dari atas ke bawah. Thumbnail otomatis, tombol naik/turun urutan, hapus & pratinjau |
| 01 | Sumber & Rasio | Impor MP4/MKV/TS/WEBM/MP3, output 16:9 atau 9:16. Zoom Fokus 1–3× + geser kiri/kanan/atas/bawah (slider atau drag langsung di preview) |
| 02 | Judul & Part Otomatis | Split video per 20–60 dtk, nomor part otomatis 01→N. **BARU v2.2: judul panjang bersambung ke baris berikutnya** |
| 03 | Deskripsi Video | Teks deskripsi di bawah judul / strip bawah |
| 04 | Subtitel AI | **BARU v2.2: MESIN VOICEMATCH v2** — teks mengikuti bahasa yang diucapkan di video (deteksi otomatis), lompat bagian hening (lebih cepat), filter halusinasi + translate ID/EN + geser waktu + ekspor SRT |
| 05 | Tracking Objek | Grafis label ala MotoGP (NCC + template adaptif) — kotak target ikut zoom/pan |
| 06 | Skor Musik AI | Komposisi prosedural EPIC/NEON DRIVE/LO-FI/TENSION |
| 07 | Tipografi Sinematik | 10 font Hollywood (Cinzel, Bebas Neue, Anton, dst) |
| 08 | Efek Visual & Watermark | Brightness/kontras/saturasi, vignette, film grain, watermark teks/logo |
| 09 | Ekspor & Kompresi | MP4 H.264 + AAC. **v2.2 TURBO STREAM** — frame diambil sambil video diputar cepat (tanpa seek per frame) + encoder GPU + render paralel |
| 10 | Batch Proses | Semua video diproses **berurutan dari atas ke bawah Kotak Video** memakai setelan saat ini |

## Yang Baru di v2.2

### 1. Kotak Video Terpadu (tidak ada lagi video "hilang")
- Semua video yang diimpor (tombol IMPOR MEDIA / drag-drop) **dan** yang
  ditambahkan lewat TAMBAH FILE di Batch Proses sekarang masuk ke **satu
  kotak yang sama** — panel paling atas (modul 00)
- Urutan **atas ke bawah** = urutan proses batch
- Tiap baris punya: nomor urut, thumbnail, nama, sumber (IMPOR/DRAG/BATCH),
  status (MENUNGGU · DIPROSES · SELESAI · GAGAL)
- Tombol: **▶ tonton** di preview · **↑ ↓ atur urutan** · **× hapus**
- Tombol KOSONGKAN membersihkan seluruh kotak

### 2. Ekspor TURBO STREAM — jauh lebih cepat lagi
- **Frame diambil sambil video diputar cepat** (kecepatan adaptif 2–4×) —
  tidak ada lagi seek per frame yang lambat
- Latar blur 9:16, vignette & film grain **di-cache** — tidak dihitung ulang
  tiap frame (hemat 50–150 ms per frame)
- Backpressure otomatis: encoder tertinggal → video pause sejenak, lanjut
  sendiri — tidak ada frame buangan
- Tetap: semua part dirender **paralel** + encoder **hardware GPU**
- Indikator kecepatan **realtime** tampil saat render (mis. `3.2× realtime`)

### 3. VOICEMATCH AI v2 — subtitel mengikuti bahasa video
- **Deteksi bahasa kanonik**: mesin membaca langsung token bahasa Whisper
  dari suara video (metode sama dengan peneliti Whisper), lalu bahasa itu
  **dipaksa konsisten** untuk seluruh video — teks tidak lagi pindah bahasa
- **Lompat hening**: bagian tanpa ucapan/musik dilewati → proses jauh lebih
  cepat & tidak ada baris halusinasi di bagian hening
- **Filter halusinasi**: baris isian atau berulang ("A.K.A.K.A…") dibuang
- Bahasa terdeteksi tampil di panel (mis. `AUTO · INDONESIA`)
- Kalau deteksi keliru, tinggal pilih bahasa manual di dropdown
- Model tetap diunduh sekali → offline permanen

### 4. Judul panjang bersambung ke bawah
- Judul yang panjang otomatis dipecah jadi **2–4 baris** (font menyesuaikan)
- Tidak lagi terpotong kiri/kanan — tetap di tengah & rapi
- Deskripsi otomatis turun mengikuti jumlah baris judul

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
- Versi: 2.2.0 · Engine: Electron 33 (Chromium 130)
