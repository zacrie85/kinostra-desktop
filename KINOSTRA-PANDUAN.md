# KINOSTRA — Suite Video Otonom · DESKTOP v2.0

Aplikasi desktop **100% offline** untuk Windows 10/11 (64-bit).
Porting setia dari KINOSTRA v1.0 (web) + 3 upgrade baru.

## Cara Install

### Pilihan A — Installer (disarankan)
1. Jalankan `KINOSTRA-Setup-2.0.0.exe`
2. Pilih folder instalasi → Next → Install
3. Selesai — shortcut muncul di Desktop & Start Menu
4. Untuk menghapus: **Apps & Features → KINOSTRA → Uninstall**

### Pilihan B — Portable (tanpa install)
1. Ekstrak `KINOSTRA-Portable-2.0.0-win64.zip` ke folder mana pun
2. Jalankan `KINOSTRA.exe` di dalamnya
3. Jika Windows SmartScreen muncul (aplikasi belum ditandatangani):
   klik **More info → Run anyway**

## Fitur (10 Modul)

| No | Modul | Fungsi |
|----|-------|--------|
| 01 | Sumber & Rasio | Impor MP4/MKV/TS/WEBM/MP3, output 16:9 atau 9:16 |
| 02 | Judul & Part Otomatis | Split video per 20–60 dtk, nomor part otomatis 01→N |
| 03 | Deskripsi Video | Teks deskripsi di bawah judul / strip bawah |
| 04 | Subtitel AI | Whisper lokal 12 bahasa + translate ID/EN + geser waktu + ekspor SRT |
| 05 | Tracking Objek | Grafis label ala MotoGP (NCC + template adaptif) |
| 06 | Skor Musik AI | Komposisi prosedural EPIC/NEON DRIVE/LO-FI/TENSION |
| 07 | Tipografi Sinematik | 10 font Hollywood (Cinzel, Bebas Neue, Anton, dst) |
| 08 | Efek Visual & Watermark | **BARU** — brightness/kontras/saturasi, vignette, film grain, watermark teks/logo |
| 09 | Ekspor & Kompresi | Render MP4 H.264 + AAC, 4 tingkat kualitas, simpan ke folder pilihan |
| 10 | Batch Proses | **BARU** — antre banyak video, diproses berurutan otomatis |

## Subtitel AI — Cara Kerja Offline

- Klik **GENERATE SUBTITEL** pertama kali → model Whisper (±40 MB) diunduh
  **sekali saja** ke folder data aplikasi (`%APPDATA%\KINOSTRA\models`)
- Setelah itu aplikasi **100% offline selamanya** — bisa diputus internetnya
- Model TINY (cepat) atau BASE (akurat) — keduanya diunduh terpisah sesuai pilihan
- Terjemahan ID/EN memakai model tambahan (opus-mt) yang juga diunduh sekali

## Pintasan Keyboard
- `Spasi` — Play / Pause
- `Ctrl+O` — Impor media

## Catatan Teknis
- Rendering lokal penuh (WebCodecs GPU/CPU) — tanpa upload ke internet
- Output MP4 H.264 + AAC/Opus, faststart (siap streaming)
- Data model AI: `%APPDATA%\KINOSTRA\models` (bisa dibuka dari panel Subtitel)
- Versi: 2.0.0 · Engine: Electron 33 (Chromium 130)
