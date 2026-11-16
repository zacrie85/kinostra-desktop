---
Task: v2.16.1 GARIS KLASIK — kembali ke basis v2.16.0 (keputusan user) + log crash ringan

Work Log:
- Laporan user: "begitu aplikasi dimasukan video aplikasinya jadi hang total... coba kembali ke KINOSTRA-Portable-2.16.0 dan mulai ulang penaikan dari sana". Keputusan: garis v3.x diparkir (rilis tetap ada), penaikan dimulai ulang dari v2.16.0 (commit 2e244cb).
- Worktree /home/z/my-project/classic216 @ 2e244cb + branch classic-v2; node_modules disymlink (dependensi package.json 2.16 vs 3.17 identik — hanya versi/deskripsi beda; electron ^33.2.0 vs 33.4.11 satu keluarga).
- SATU-satunya tambahan v2.16.1: log crash ringan main process — userData/kinostra-crash.log via crashLog() (mulai, RENDER MATI alasan+kode keluar, GPU MATI, HANG/unresponsive, keluar normal; pangkas ±400 baris) TANPA mengubah perilaku/tampilan; IPC sys:crashlog + sys:openCrashLog; preload crashLog/openCrashLog. Petunjuk kirim log utk user: %APPDATA%\KINOSTRA\kinostra-crash.log (2.16 belum punya modul PERAWATAN).
- UJI scripts/classic-v2161-test.mjs — skenario persis user: impor → PUTAR → pengaturan (judul/ukuran/potong/frame/warna) → putar+geser → ganti video: 11/11 LULUS, nol exception, log bersih (2 kegagalan awal = artefak uji: video 3 dtk selesai sebelum tunggu; cek log ikut membaca catatan lama v3.17.2 di userData bersama — diperbaiki filter versi).
- Bump 2.16.1: package.json (versi+deskripsi), installer.nsi 5 titik, index.html boot+header, README badge, PANDUAN judul.
- Build: electron-builder --win --dir (worktree) + afterpack otomatis → makensis manual → Setup 95,7 MB; zip Portable 136,9 MB.
- Rilis: release ID 446475845 target classic-v2 — 3 aset (Setup 95,709,063 B; Portable 136,872,812 B; PANDUAN 30,736 B) — https://github.com/zacrie85/kinostra-desktop/releases/tag/v2.16.1
- Rencana penaikan: fitur v3.x ditambah kembali SATU per rilis (v2.17+), tiap rilis wajib lulus uji skenario impor→putar→pengaturan; log crash menunjuk fitur penyebab hang bila terulang.
---
Task: v2.16.2 — PERBAIKAN AKAR HANG TOTAL (bukti video user + repro laboratorium)

Work Log:
- User kirim video "error kinostra.mp4" (30 dtk): dianalisis frame-demi-frame (lembar kontak 2×15 + crop resolusi penuh): v2.16.1 di header; film 188:35.5 (71 part, split 161 dtk); video diputar; klik tombol kuning (TERAPKAN KE SEMUA VIDEO) dtk 24 → aplikasi LENYAP dtk 25 (layar gelap sampai rekaman habis).
- Kode 2.16 dibongkar: decodeFileAudio = decodeAudioData penuh TANPA penjaga (arrayBuffer berkas utuh + AudioBuffer ±21 MB/mnt → film 188 mnt ≈ 4 GB); tombol TERAPKAN terbukti Innocent (hanya simpan preset) — bomnya decode latar yang jalan sejak impor.
- REPRO (sandbox 3 GB, film uji 120 mnt): v2.16.1 → RENDER MATI kode 133 hanya 8 dtk setelah impor (tercatat di kinostra-crash.log) + CDP hang (swap-storm) = "hang total" persis user. AKAR TERBUKTI.
- FIX v2.16.2 (port mesin terbukti v3.17.1 ke klasik): (1) demux.js 628 baris disalin dari garis v3 (kilatReaderFor cocok dgn shape vf klasik); (2) decodeFileAudio: est >350 MB → JANGAN decode utuh; analisis bertahap analyzeAudioViaDemux (jendela 45 dtk, sopan: tunda saat putar/ekspor) → peaks tumbuh; (3) renderMix: audioBuffer null + _audioDemux → decodeAudioWindow(start-0,5 dtk) selaras via kWin.t → ekspor BERSUARA (teruji rms 0,0796 vs jalur pendek 0,0794); _audioExporting di finally; (4) subs.js: film panjang → pesan jelas; (5) SHIELD RINGAN main.js: render-gone → reload otomatis ≤3× (teruji chrome://crash → pulih + tercatat), berulang → relaunch --kinostra-aman (disable-gpu-compositing sebelum ready).
- Uji 25 hijau: repro survive 6/6 (impor 120 mnt → putar → TERAPKAN → amati 40 dtk → hidup, peaks tumbuh, log bersih) · SHIELD 5/5 · suara ekspor 3/3 (podcast.mp4 ternyata hening −91 dB → ganti v32-60s −21 dB) · skenario user 11/11. Catatan uji: log crash dipakai bersama antar versi/sesi → filter uji dibuat per-sesi (snapshot jumlah baris).
- Insiden build: core dump 712 MB (sisa proses crash saat uji) ikut ter-commit → push ditolak GitHub → dibuang dari commit (amend), 'core' di-gitignore, berkas dihapus.
- Build: Setup 95.698.429 B + Portable 136.884.940 B + PANDUAN 30.736 B — release ID 446496081 (aset byte-sama dgn lokal) — https://github.com/zacrie85/kinostra-desktop/releases/tag/v2.16.2
- Lanjutan: user diminta kirim kinostra-crash.log bila masih ada kejadian; penaikan fitur satu per rilis berlanjut (v2.17+).
