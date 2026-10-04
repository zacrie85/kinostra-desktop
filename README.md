<div align="center">

# 🎬 KINOSTRA — Suite Video Otonom

**Aplikasi desktop Windows 100% offline untuk produksi video otomatis.**
Auto-split video → Subtitle AI Whisper → Object Tracking → Musik Prosedural → Efek Visual → Export MP4.

![Version](https://img.shields.io/badge/version-2.2.0-amber) ![Platform](https://img.shields.io/badge/platform-Windows%2010%2F%2011%20x64-blue) ![Offline](https://img.shields.io/badge/offline-100%25-success) ![Engine](https://img.shields.io/badge/engine-Electron%2033-9feaf9)

[⬇️ Download Installer (.exe)](#-install) · [📦 Portable (.zip)](#-install) · [📖 Panduan Lengkap](KINOSTRA-PANDUAN.md)

</div>

---

## ✨ Fitur

| # | Modul | Deskripsi |
|---|-------|-----------|
| 1 | **Media Import** | Drag & drop MP4 / MKV / TS / WEBM / MP3 |
| 2 | **Auto Split** | Pemecahan otomatis klip 20–60 detik berdasarkan adegan |
| 3 | **Subtitle AI** | Transkripsi otomatis lokal dengan **Whisper** (OpenAI) — tanpa internet |
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
| 15 | **Subtitle Translate** | Terjemahan subtitle lokal (opus-mt) + geser waktu ±0.5s + export SRT |

⭐ = fitur baru/upgrade terbaru

## 🔒 100% Offline

- Semua pemrosesan (video, audio, AI) berjalan **lokal di komputer kamu**.
- Whisper model (~40MB) hanya diunduh **sekali** saat pemakaian pertama, setelah itu permanen offline (`%APPDATA%/KINOSTRA/models`).
- Tidak ada data yang dikirim ke server manapun.

## 📥 Install

Pilih salah satu:

| Paket | Ukuran | Cocok untuk |
|-------|--------|-------------|
| `KINOSTRA-Setup-2.2.0.exe` | ±91 MB | Install permanen (Start Menu + shortcut desktop + uninstaller) |
| `KINOSTRA-Portable-2.2.0-win64.zip` | ±123 MB | Jalan tanpa install, bisa dibawa di flashdisk |

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
<sub>KINOSTRA v2.1.0 · Dibangun dengan ⚡ oleh KINOSTRA</sub>
</div>
