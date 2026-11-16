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
