<div align="center">

# 🎬 KINOSTRA — Suite Video Otonom

**Aplikasi desktop Windows 100% offline untuk produksi video otomatis.**
Auto-split video → Subtitle AI Whisper → Object Tracking → Musik Prosedural → Efek Visual → Export MP4.

![Version](https://img.shields.io/badge/version-2.11.0-amber) ![Platform](https://img.shields.io/badge/platform-Windows%2010%2F%2011%20x64-blue) ![Offline](https://img.shields.io/badge/offline-100%25-success) ![Engine](https://img.shields.io/badge/engine-Electron%2033-9feaf9)

[⬇️ Download Installer (.exe)](#-install) · [📦 Portable (.zip)](#-install) · [📖 Panduan Lengkap](KINOSTRA-PANDUAN.md)

</div>

---

## ✨ Fitur

| # | Modul | Deskripsi |
|---|-------|-----------|
| 1 | **Media Import** | Drag & drop MP4 / MKV / TS / WEBM / MP3 |
| 2 | **Auto Split** | Pemecahan otomatis klip 20–60 detik berdasarkan adegan |
| 3 | **Subtitle AI — VOCALIS v4** ⭐v2.4 | Mesin **whisper.cpp native** fokus **Bahasa Jawa & Indonesia** — teks sesuai yang diucapkan/dinyanyikan, mode lagu/vokal, unduhan model resume, tanpa internet |
| 4 | **Object Tracking** | Pelacakan objek gaya MotoGP — algoritma NCC + adaptive template |
| 5 | **Musik Prosedural** | Soundtrack otomatis 4 mood: EPIC · NEON · LO-FI · TENSION |
| 6 | **10 Font Sinematik** | Koleksi font title & subtitle siap pakai |
| 7 | **Export Pipeline** | Render H.264 MP4 via WebCodecs + mp4-muxer |
| 8 | **Efek Visual & Watermark** | Brightness / contrast / saturation / vignette / film grain + watermark teks & logo |
| 9 | **Zoom Fokus & Geser** ⭐v2.1 | Mode 9:16: zoom 1–3× + geser kiri/kanan/atas/bawah (slider & drag) untuk memilih bagian gambar |
| 10 | **Kotak Video Terpadu** ⭐v2.2 | SATU kotak berurutan (atas→bawah) untuk semua video — impor, drag-drop & batch dalam satu daftar dengan thumbnail, tombol urutkan & pratinjau |
| 11 | **Render Paralel Turbo Stream** ⭐v2.2 | Frame diambil sambil video diputar cepat (tanpa seek per frame) + lapisan statis di-cache + encoder hardware GPU — hingga **10× lebih cepat** |
| 12 | **VOICEMATCH AI v2** ⭐v2.2 | Subtitel mengikuti bahasa yang diucapkan (deteksi token bahasa kanonik), lompat bagian hening (proses lebih cepat), filter halusinasi |
| 13 | **Judul Multi-Baris** ⭐v2.2 | Judul panjang otomatis bersambung ke baris berikutnya — tidak terpotong kiri/kanan |
| 14 | **Batch Proses** ⭐v2.1 | Antrean render otomatis berurutan dari atas ke bawah Kotak Video |
| 15 | **Posisi Subtitel** ⭐v2.5 | Geser posisi subtitel ke atas/bawah lewat slider — tidak lagi berdempetan dengan tulisan PART |
| 16 | **Ekspor Anti-Macet** ⭐v2.5 | Watchdog 3 lapis + timeout flush/simpan + **ulang otomatis dengan encoder software** saat encoder GPU berhenti — ekspor tidak lagi macet di bagian akhir |
| 17 | **Frame Neon Berputar** ⭐v2.8 | Garis neon bercahaya keliling pinggir video dengan **efek komet berputar otomatis** (9:16 & 16:9) — 7 warna (termasuk RAINBOW), ketebalan & kecepatan bisa diatur, terbakar saat ekspor |
| 18 | **Batch Ekspor** ⭐v2.8 | Tombol di menu EKSPOR & KOMPRESI: **semua video di Kotak Video diekspor berurutan** ke satu folder — ringkasan per video + buka folder output |
| 19 | **Timeline Anti-Overflow** ⭐v2.8.1 | Video panjang (>60 menit) tidak lagi menghilangkan menu kanan: timeline split **pas di layar** & **bisa discrol ke samping** untuk video sangat panjang, playhead otomatis mengikuti |
| 20 | **Waktu Mulai & Berhenti Ekspor** ⭐v2.9 | Ekspor & split hanya bagian yang diinginkan — mis. video 5 menit diambil menit 2–4 saja. Input `m:ss`, tombol PAKAI PLAYHEAD, zona non-ekspor tampil bergaris di timeline. **Tombol TERAPKAN KE SEMUA VIDEO**: waktu mulai + durasi split diterapkan ke semua video di Kotak Video (masing-masing tetap sampai habis) |
| 21 | **Batch Anti-Batal** ⭐v2.10 | **Satu video bermasalah tidak lagi membatalkan seluruh batch ekspor** — ditandai GAGAL + penyebabnya, antrean lanjut otomatis. Skor musik kini dirender ulang benar untuk tiap video di batch (dulu memicu berhenti "dibatalkan"), musik otomatis berulang bila part lebih panjang dari skor, dan pesan kegagalan tampil apa adanya — bukan lagi "Ekspor dibatalkan" |
| 22 | **Ekspor Anti-Beku** ⭐v2.11 | **Video hasil ekspor/split tidak lagi beku-bekerak** (jalan sebentar, beku beberapa detik, jalan lagi, begitu seterusnya). Lompatan frame akibat decoder kewalahan kini dideteksi otomatis dan **diisi ulang lewat seek presisi frame-per-frame**, kecepatan capture menyesuaikan beban, dan verifikasi output diperketat — gerakan selalu mulus & sinkron dengan audio, di ekspor tunggal, split, maupun batch |

⭐ = fitur baru/upgrade terbaru

## 🔒 100% Offline

- Semua pemrosesan (video, audio, AI) berjalan **lokal di komputer kamu**.
- Model VOCALIS (31–547 MB) hanya diunduh **sekali** saat pemakaian pertama (unduhan bisa lanjut bila terputus), setelah itu **permanen offline** (`%APPDATA%/KINOSTRA/whisper`).
- Tidak ada data yang dikirim ke server manapun.

## 📥 Install

Pilih salah satu:

| Paket | Ukuran | Cocok untuk |
|-------|--------|-------------|
| `KINOSTRA-Setup-2.11.0.exe` | ±91 MB | Install permanen (Start Menu + shortcut desktop + uninstaller) |
| `KINOSTRA-Portable-2.11.0-win64.zip` | ±123 MB | Jalan tanpa install, bisa dibawa di flashdisk |

Ambil di tab **[Releases](../../releases)** → unduh → jalankan.

> ⚠️ Windows SmartScreen mungkin muncul karena aplikasi tidak ditandatangani kode (code signing).
> Klik **More info → Run anyway**. Ini normal untuk aplikasi open source tanpa sertifikat berbayar.

## 🚀 Build dari Source

```bash
git clone https://github.com/zacrie85/kinostra-desktop.git
cd kinostra-desktop
npm install
npm start        # jalankan mode development
npm run dist:full  # build installer NSIS + portable zip
```

**Kebutuhan build:** Node.js ≥ 18, Windows 10/11 x64 (build untuk macOS/Linux perlu penyesuaian kecil di `main/main.js`).

## 🗂 Struktur Proyek

```
kinostra-desktop/
├── main/              # Electron main process (protocol, downloader, IPC)
│   ├── main.js
│   └── preload.js
├── renderer/          # UI aplikasi (port dari versi web KINOSTRA)
│   ├── index.html
│   ├── css/
│   ├── js/            # 10 modul fitur
│   ├── fonts/         # 55 font woff2 (offline)
│   └── vendor/        # transformers.js, mp4-muxer, ort-wasm (offline)
├── build/             # Konfigurasi build (icon, installer.nsi, afterpack)
└── package.json
```

## 🛠 Teknologi

- **Electron 33** + vanilla JS (tanpa framework berat)
- **Transformers.js** (Xenova) — Whisper & opus-mt 100% lokal via ONNX Runtime Web
- **WebCodecs** + **mp4-muxer** — encoding H.264 native browser engine
- **NSIS** — installer Windows berbahasa Indonesia

## 📄 Lisensi

MIT — bebas dipakai, dimodifikasi, dan didistribusikan.

---

<div align="center">
<sub>KINOSTRA v2.5.0 · Dibangun dengan ⚡ oleh KINOSTRA</sub>
</div>
