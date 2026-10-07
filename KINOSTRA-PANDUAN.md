# KINOSTRA — Suite Video Otonom · DESKTOP v2.9.0

Aplikasi desktop **100% offline** untuk Windows 10/11 (64-bit).
Porting setia dari KINOSTRA v1.0 (web) + 15 upgrade.

## Cara Install

### Pilihan A — Installer (disarankan)
1. Jalankan `KINOSTRA-Setup-2.9.0.exe`
2. Pilih folder instalasi → Next → Install
3. Selesai — shortcut muncul di Desktop & Start Menu
4. Untuk menghapus: **Apps & Features → KINOSTRA → Uninstall**

### Pilihan B — Portable (tanpa install)
1. Ekstrak `KINOSTRA-Portable-2.9.0-win64.zip` ke folder mana pun
2. Jalankan `KINOSTRA.exe` di dalamnya
3. Jika Windows SmartScreen muncul (aplikasi belum ditandatangani):
   klik **More info → Run anyway**

## Fitur (11 Modul)

| No | Modul | Fungsi |
|----|-------|--------|
| 00 | **Kotak Video · Urutan** ⭐v2.2 | **SATU kotak untuk semua video** — dari IMPOR MEDIA, drag-drop, maupun TAMBAH FILE batch. Berurutan dari atas ke bawah. Thumbnail otomatis, tombol naik/turun urutan, hapus & pratinjau |
| 01 | Sumber & Rasio | Impor MP4/MKV/TS/WEBM/MP3, output 16:9 atau 9:16. **v2.6: geser KIRI/KANAN/ATAS/BAWAH selalu berfungsi** (termasuk zoom 1× — memindahkan posisi video di dalam frame 9:16), Zoom Fokus 1–4×, latar BLUR SINEMATIK tampil otomatis (tidak hitam lagi) |
| 02 | Judul & Part Otomatis | Split video per 20–60 dtk, nomor part otomatis 01→N. Judul otomatis dari nama file (Bebas Neue 40, bisa diganti). **v2.6: posisi PART bisa digeser kiri/kanan & atas/bawah, posisi JUDUL bisa digeser atas/bawah** — judul juga muncul **instan** saat file diimpor (tidak menunggu lagi) |
| 03 | Deskripsi Video | Teks deskripsi di bawah judul / strip bawah |
| 04 | Subtitel AI | **BARU v2.4: MESIN VOCALIS v4 NATIVE (whisper.cpp) — fokus Bahasa Jawa & Bahasa Indonesia** — proses native stabil (tidak gagal lagi), unduhan model resume otomatis, teks dibuat dalam bahasa yang diucapkan/dinyanyikan (Jawa tetap Jawa), Mode Lagu/Vokal, filter halusinasi, ekspor SRT. **v2.5: posisi subtitel bisa digeser atas/bawah + ukuran** |
| 05 | Tracking Objek | **v2.6 TRACKER PINTAR**: prediksi arah gerak + pencarian multi-skala + pencarian ulang otomatis pakai kemiripan template asli — objek yang berpindah posisi tetap dikejar. Kotak target ikut zoom/pan |
| 06 | Skor Musik AI | Komposisi prosedural EPIC/NEON DRIVE/LO-FI/TENSION |
| 07 | Tipografi Sinematik | 10 font Hollywood (Cinzel, Bebas Neue, Anton, dst) |
| 08 | Efek Visual & Watermark | Brightness/kontras/saturasi, vignette, film grain, watermark teks/logo. **BARU v2.8: FRAME NEON BERPUTAR** — garis neon keliling pinggir video, berputar otomatis (9:16 & 16:9) |
| 09 | Ekspor & Kompresi | MP4 H.264 + AAC. **v2.2 TURBO STREAM** — frame diambil sambil video diputar cepat (tanpa seek per frame) + encoder GPU + render paralel. **BARU v2.8: BATCH EKSPOR — semua video di kotak diekspor berurutan dari menu ekspor** |
| 10 | Batch Proses | **BARU v2.3: impor massal sampai 100 video sekaligus** — semua masuk Kotak Video lalu diproses **berurutan otomatis** satu per satu |

## Yang Baru di v2.9

### WAKTU MULAI & BERHENTI EKSPOR (modul 02)
- Ekspor & split **hanya bagian video yang kamu mau**: contoh video 5 menit,
  atur mulai **2:00** berhenti **4:00** → hanya menit 2–4 yang dipecah jadi
  part & disimpan. Sisanya tidak ikut diekspor.
- Isi waktu bisa **detik** (90) atau **m:ss / h:mm:ss** (1:30 · 1:02:03), atau
  tekan **PAKAI PLAYHEAD** untuk mengambil posisi putar saat itu.
- Zona yang tidak diekspor tampil **bergaris redup** di TIMELINE SPLIT dengan
  tulisan MULAI/BERHENTI — jelas mana yang ikut, mana yang tidak.
- Ringkasan ekspor & jumlah part otomatis menyesuaikan rentang.

### PENERAPAN MASSAL — TERAPKAN KE SEMUA VIDEO DI KOTAK
- Tombol **TERAPKAN KE SEMUA VIDEO**: menyimpan **waktu mulai** (posisi video
  yang sedang dibuka) + **durasi split per part** (setelan di atasnya).
- Setiap video berikutnya di Kotak Video (BATCH PROSES maupun BATCH EKSPOR)
  otomatis **mulai dari waktu tersebut** — dan **tetap diekspor sampai
  habis** (waktu berhenti hanya berlaku untuk video yang sedang dibuka).
- Video yang lebih pendek dari waktu mulai → diekspor penuh dari 0:00.
- Tekan **MATIKAN** untuk kembali: semua video diekspor penuh 0:00–habis.

## Yang Baru di v2.8.1

### TIMELINE SPLIT ANTI-OVERFLOW — video panjang tidak lagi merusak tampilan
- **Bug lama**: video berdurasi lebih dari ±60 menit membuat timeline split
  melar sangat panjang → **semua menu di panel kanan hilang** dari layar.
- **Sekarang**: timeline selalu **pas selebar layar** — panel menu kanan tidak
  akan pernah terdorong keluar lagi.
- Video sangat panjang → timeline **bisa discrol ke samping** (muncul
  scrollbar horizontal), setiap part tetap terbaca jelas.
- Video pendek → tampilan proporsional penuh **seperti sebelumnya**.
- **Playhead otomatis mengikuti**: saat video diputar, timeline menggulir
  sendiri mengikuti posisi playhead; saat pause bebas menelusuri manual.
- Klik/drag pada timeline tetap akurat meski sedang discrol.

## Yang Baru di v2.8

### 1. FRAME NEON BERPUTAR (9:16 & 16:9) — sesuai gambar referensi
- **Garis neon bercahaya mengelilingi pinggir video** dalam bingkai membulat
  (rounded corners), dan garis itu **terus berputar otomatis** sepanjang video —
  videomu tampil di bagian dalam bingkai.
- Ada **jejak komet**: kepala pendar paling terang + ekor memudar di belakangnya,
  melintas mulus menembus keempat sudut.
- **7 pilihan warna**: CYAN · AMBER · MAGENTA · HIJAU · BIRU · PUTIH ·
  **RAINBOW** (warna pelangi ikut berubah selagi garis berputar).
- **Ketebalan** (2–16) dan **kecepatan putar** (0.2–3×) bisa diatur, plus opsi
  **dua garis berlawanan** sekaligus.
- Berlaku untuk rasio **9:16 DAN 16:9**, tampil di preview dan **terbakar ke
  video saat ekspor** — termasuk saat Batch Ekspor.
- Lokasi: modul **08 — EFEK VISUAL & WATERMARK → FRAME NEON BERPUTAR**.
- Ringan: track statis di-cache dan pendar digambar tanpa efek blur berat,
  kecepatan render ekspor tetap terjaga.

### 2. BATCH EKSPOR di menu EKSPOR & KOMPRESI
- Tombol baru **“BATCH EKSPOR — SEMUA VIDEO DI KOTAK”** di modul 09:
  semua video dalam Kotak Video diekspor **berurutan satu per satu**
  otomatis ke **satu folder pilihan** — tanpa mengulang klik per video.
- Memakai setelan yang aktif saat itu: rasio, split part, judul otomatis,
  deskripsi, efek visual, **frame neon**, musik & kualitas.
- Setelah selesai muncul **ringkasan per video** (OK/GAGAL) + tombol
  **BUKA FOLDER OUTPUT**.
- Berbeda dengan modul 10 (Batch Proses) yang melanjutkan video yang belum
  selesai — tombol di modul 09 memproses ulang **semua** video di kotak.

## Yang Baru di v2.7

### 1. FIX: video hasil ekspor suaranya jalan tapi GAMBAR BEKU
- **Penyebab ditemukan:** encoder GPU Windows (Media Foundation) dengan
  mode `latency` lama bisa mengeluarkan frame dengan **urutan waktu
  bolak-balik** (B-frame). Muxer MP4 menolaknya diam-diam di dalam
  callback — pengecualian tertelan tanpa pesan — sehingga file MP4
  selesai “sukses” tetapi hanya berisi beberapa frame pertama:
  **gambar beku + suara normal + tidak ada error**.
- **Perisai 4 lapis (semua otomatis):**
  1. Semua encoder kini memakai mode `realtime` — tanpa pengacakan
     urutan frame di sumbernya.
  2. Timestamp yang turun terdeteksi saat merender → part langsung
     dianggap gagal → **diulang otomatis dengan encoder software**.
  3. Error encoder kini diteruskan ke alur ekspor (dulu hanya masuk log).
  4. Setelah render, **jumlah frame diverifikasi** (≥ 90% dari yang
     dirender) sebelum file dianggap sah.
- Ekspor yang dulu “berhasil tapi bekunya” sekarang **selalu menghasilkan
  video bergerak** — bila encoder GPU bermasalah, part itu di-render ulang
  senyap dengan encoder software.

### 2. FIX: pop-up “EKSPOR SELESAI” tidak bisa ditutup
- **Penyebab ditemukan:** modal hasil dilayar tanpa opsi `cancel`, jadi
  tombol TUTUP disembunyikan — tidak ada satu pun cara menutup pop-up,
  aplikasi terasa macet selamanya.
- **Perbaikan — kini ada 4 jalan keluar:**
  1. Tombol **TUTUP** di pop-up hasil kembali tampil.
  2. Tombol **×** di kanan atas judul modal (selalu ada di semua modal).
  3. Tombol **Esc** di keyboard.
  4. Klik area gelap di luar kotak (hanya untuk pop-up info — proses
     render sengaja tidak bisa terbatalkan lewat klik luar).

## Yang Baru di v2.6

### 1. Geser 9:16 selalu berfungsi + latar BLUR SINEMATIK tidak hitam lagi
- **Penyebab ditemukan:** dulu geser hanya aktif saat zoom > 1, sementara
  video landscape butuh zoom ≥ 3.16× supaya ada ruang geser vertikal —
  slider mentok di 3× → GESER ATAS/BAWAH tidak pernah berfungsi.
  Selain itu, begitu zoom disentuh sedikit saja, latar blur dinonaktifkan
  → yang tampil cuma background hitam.
- **Perbaikan:** geser sekarang **dua mode otomatis** — di zoom 1× geser
  **memindahkan posisi video** di dalam frame 9:16 (naik/turun/kiri/kanan,
  praktis untuk mengatur ruang judul & subtitel); di zoom tinggi geser
  **memilih bagian video yang diambil** (crop). Zoom Fokus naik sampai
  **4×** (video landscape menutup penuh frame mulai ±3.2×).
- Latar **BLUR SINEMATIK** kini tampil **selalu** selama video belum
  menutup frame, dan di preview mengikuti isi video (refresh ±1.6 dtk).
- Drag langsung di preview kini "gambar mengikuti jari".

### 2. Tracking objek PINTAR — objek yang berpindah posisi tetap dikejar
- **Penyebab ditemukan:** template kecil berisi banyak latar belakang,
  template adaptif melebur (drift), tidak ada prediksi gerak, dan begitu
  target hilang tidak pernah dicari ulang.
- **Perbaikan (semua lokal, 100% offline):**
  - **Prediksi arah & kecepatan gerak** — jendela pencarian selalu di
    depan objek.
  - **Pencarian multi-skala** (0.82× / 1× / 1.22×) — objek mendekat /
    menjauh tetap terkunci.
  - **NCC berbobot pusat** — latar belakang tidak lagi mendominasi skor.
  - **Re-identifikasi otomatis**: saat skor rendah, seluruh frame
    dipindai memakai **template asli** target (mesin kemiripan visual
    lokal — semacam "AI pengenal kemiripan objek" yang ringan) → objek
    yang lompat posisi langsung ditemukan lagi dan tracking menyambung.

### 3. Posisi PART & JUDUL bisa digeser bebas
- Modul 02 ada **3 slider baru**: POSISI PART (kiri/kanan & atas/bawah —
  berlaku untuk bumper intro maupun label pojok) dan POSISI JUDUL
  (atas/bawah). Ada tombol RESET POSISI TEKS.
- Default = posisi lama, jadi tampilan lama tidak berubah.

### 4. Judul dari nama file muncul INSTAN
- **Penyebab ditemukan:** judul baru dipasang setelah seluruh file video
  disalin ke memori + track audio didekode penuh — untuk video besar bisa
  menunggu beberapa detik.
- **Perbaikan:** judul dipasang **paling awal** (sebelum metadata), dan
  impor kini **streaming** lewat protokol `kfile://` (Range request) —
  file tidak disalin utuh ke memori lagi. Video 2 GB pun tampil & berjudul
  hampir seketika; mode batch juga jauh lebih hemat RAM & cepat mulai.

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
- `Esc` — Tutup / batalkan dialog (modal)
- Drag di preview (mode 9:16) — geser posisi fokus

## Catatan Teknis
- Rendering lokal penuh (WebCodecs GPU/CPU) — tanpa upload ke internet
- Output MP4 H.264 + AAC/Opus, faststart (siap streaming)
- Data model AI: `%APPDATA%\KINOSTRA\whisper` (bisa dibuka dari panel Subtitel)
- Mesin subtitel: whisper.cpp v1.9.4 (MIT) — binari dibundel di `bin/whisper`
- Versi: 2.9.0 · Engine: Electron 33 (Chromium 130)
