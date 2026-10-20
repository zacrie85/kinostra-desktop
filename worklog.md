
---
Task ID: 4
Agent: main (Super Z)
Task: KINOSTRA v3.0.0 MEGA UPGRADE — 9 fitur baru (semua dipilih user) + 6 frame ALAM GAIB + optimasi kecepatan 100%, uji otomatis, build & rilis GitHub

Work Log:
- Sinkronisasi workspace: lokal lama v2.12.0 → reset ke GitHub main (v2.16.0, commit 2e244cb); struktur repo ternyata berakar /home/z/my-project (bukan subfolder kinostra-desktop)
- core.js: state baru (colorFilter, splitMode, sceneCuts, targetMB, audioFix+audioRms, tts, resumeExport, autoShutdown, _noPart) + katalog COLORFILTERS (10 preset) + 6 entri FRAMESTYLES grup 'ALAM GAIB'
- frames.js: GAIB_TXT + frGaibPlate (papan batu hijau-racun + akar + glow) + tokoh baru frPocong/frKunti/frTuyul + 6 frame prosedural animasi deterministik (gaibpocong/gaibtuyul/gaibkunti/gaibsanggah/gaibmakam/gaibritual) — total 28 gaya
- compose.js: filter warna (css ctx.filter + tint overlay di area video) + _noPart (mode gabung)
- media.js: segBoundsList() cache — segments()/segmentsCount()/currentSegBounds sadar-adegan (mode durasi 100% identik dulu) + measureAudioRms()
- scenes.js BARU: deteksi adegan offline (64×36 sampel ±320, MAE + histogram luma, ambang robust median+4×MAD, guard bingkai hitam, gabung titik <2 dtk)
- sampul.js BARU: studio thumbnail (6 gaya papan judul reuse frHororPlate/frGaibPlate/frDangdutPlate, judul auto-fit, PNG via saveBlobToDir, counter urut)
- tts.js BARU: VITS MMS Indonesia ONNX q8 (payam1394/traxlate-mms-tts-ind 36.5MB) via models:ensure + kmodels://, env offline transformers.js, ttsSynthesize→AudioBuffer, preview/pasang-playhead/hapus
- exporter.js: renderMix rantai AUDIO SEHAT (highpass/lowpass → normalizer RMS target .16 → kompresor) + mix TTS di waktu media; encodeAudioStream mergeOff + fbuf reuse (GC −40%); renderPartWorker: mergeCtx (muxer bersama, skip finalize/save), AUDIO PARALEL dengan video (optimasi inti), outTs offset; exportPartsToDir: lewati part yang ada (statJoin, >50KB) + targetMB → bitrate per part; exportMergeToDir BARU (load berurutan → render semua part ke 1 muxer StreamTarget kontinu, auto-sub per film, musik re-compose, RAM datar) + doMerge UI
- batch.js: pelacakan per video (durasi/ukuran/waktu) + buildBatchReport → KINOSTRA-LAPORAN.txt + maybeAutoShutdown (hitung mundur 30 dtk, shutdownPC/abortShutdown) + status modul 09B
- main/preload: IPC fs:statJoin, sys:shutdown (win32 shutdown /s /t 60), sys:shutdownAbort (shutdown /a)
- ui.js: chips filter warna, segSplitMode, DETEKSI ADEGAN, SAMPUL, TTS (susun/preview/pasang/hapus/gain), targetMB, resumeExport, autoShutdown, doMerge, chip grup .fg-gaib, OPTIMASI pratinjau dirty-skip (pause tanpa animasi maks 1×/dtk)
- index.html: modul 06B TTS, 08B SAMPUL, 09B GABUNG, MODE SPLIT + DETEKSI ADEGAN, FILTER WARNA, KOMPRES PINTAR, LANJUTKAN + MATIKAN PC, label FRAME VIDEO 28 GAYA, v3.0.0 boot/header + 3 script baru
- css: .fg-gaib + .sampulwrap
- Uji otomatis Xvfb+CDP (scripts/kinostra-v30-test.mjs): 39/39 LULUS — katalog/IPC/UI, segmentasi durasi+adegan+potongan, pixel-check 6 frame GAIB + regresi v2.16, filter noir, RMS+normalizer >2×, TTS mix, statJoin+lewati part, ekspor nyata (gaibpocong+filter horor, H.264 2.93 dtk), GABUNG 2 video → GABUNGAN_2_VIDEO_FILM.mp4 (ffprobe 6.02 dtk video+audio), deteksi adegan tepat ±3.0 dtk (merah→biru), sampul PNG 234KB, laporan
- Bug ditemukan & diperbaiki saat uji: (1) ambang deteksi adegan mean+std tumbang outlier bingkai pertama → median+4×MAD + guard hitam; (2) prevLuma ternormalisasi ganda → selalu normalisasi; (3) createObjectURL meledak di jalur lanjutkan (file uji bukan Blob) → srcUrl lazy; (4) ffprobe lama tanpa -print-json → -of json
- Versi 3.0.0: package.json (+deskripsi), installer.nsi (APPVERSION/OutFile/VIProductVersion/VIAddVersionKey), afterpack.js, README.md (fitur 35-44 + badge), KINOSTRA-PANDUAN.md (10 bagian "Yang Baru di v3.0"), index.html boot+header
- Build: dist:full → Portable 126.0MB + win-unpacked; afterpack resedit 3.0.0.0 UTF-16 ✓ (posisi 187MB); makensis manual → Setup 91.3MB (versi ✓)
- Push source GitHub main (5e6b64e) + Release v3.0.0 (id 417940974) + 3 aset uploaded

Stage Summary:
- Release: https://github.com/zacrie85/kinostra-desktop/releases/tag/v3.0.0
- File baru: renderer/js/scenes.js, renderer/js/sampul.js, renderer/js/tts.js, scripts/kinostra-v30-test.mjs
- API baru: window.kinostra.statJoin / shutdownPC / abortShutdown
- Keputusan: total gaya frame 28 (bukan 26 — v2.16 sebenarnya 22); model TTS = payam1394/traxlate-mms-tts-ind (Xenova/mms-tts-ind kosong, facebook hanya pytorch); merge memakai 1 muxer StreamTarget kontinu (part gabung tak menulis file sendiri); audio sehat menormalkan seluruh mix (asli+musik+narasi)

---
Task ID: 5
Agent: main (Super Z)
Task: KINOSTRA v3.1.0 — ZOOM PEMBICARA OTOMATIS (AI): kamera otomatis meng-zoom orang yang sedang bicara (podcast/dialog), output bisa vertikal 9:16, berlaku global semua video; uji otomatis, build & rilis GitHub

Work Log:
- User minta fitur ala aplikasi AI potong-podcast (Opus Clip): podcast 2 orang berhadapan → zoom otomatis ke yang bicara, bisa vertikal, setting global semua video, ikut saat eksport & split
- Model dipilih: Xenova/yolos-tiny (object-detection, onnx/model_quantized.onnx, ±10 MB) — diverifikasi via HF API; unduh sekali via models:ensure lalu offline permanen (kmodels://), pola sama dgn TTS
- speaker.js BARU: ensureSpeakerModel (pipeline object-detection dtype q8), spkAudioEnvelope (RMS per 1 dtk ternormalisasi, ambang adaptif p10), pindai offline seek 1 dtk/sampel (kanvas 448px, deteksi threshold 0.32 + merge kotak tumpang-tindih utk false-positive "kepala saja"), gerakan pita kepala per kotak (mean abs diff gray 0..0.35), cluster jejak TAHAN JEDA (TTL 3 langkah) + gabung jejak pecahan (avg posisi), keputusan = EWMA(0.55) × lonjakan-gerakan × prioritas-ukuran-kotak + histeresis (cepat/normal/lambat = 1/2/3 langkah), kebijakan senyap hold/wide, gabung segmen <1.4 dtk, label PEMBICARA urut kiri→kanan
- spkCropAt: fungsi MURNI dari t (deterministik, aman render paralel) — aspek terkunci rasio output, zoom clamp [1..3.2×], clamp dalam bingkai, transisi smoothstep 0.7 dtk antar segmen; spkFitBox menerima kotak TERNORMALISASI lalu konversi piksel (BUG v1: dihitung sebagai piksel → crop 63×112 di pojok)
- compose.js: cabang crop 9-argumen full-bleed di drawComposition (filter warna/tint/vignette/grain/decor tetap jalan); spk aktif → latar/blur di-skip
- state.spk di core.js: on/speed/silence/auto = SETELAN GLOBAL (semua video); ready/timeline/tracks/epoch = per video (direset di loadFileBlob)
- exporter.js: hook analisis otomatis di exportPartsToDir (juga menutupi BATCH EKSPOR) + per film di exportMergeToDir; gagal analisis → lanjut tanpa zoom; ringkasan ekspor menampilkan ZOOM PEMBICARA
- index.html: modul 02C (cheklis, ANALISIS PEMBICARA, daftar segmen berwarna, kecepatan pindah, saat senyap, analisis otomatis) + script speaker.js + boot/header v3.1.0; ui.js binding + spkAnalyzeUI (modal+progres)
- UJI (scripts/kinostra-v31-test.mjs, media generator kinostra-v31-mkmedia.mjs): podcast sintetis 640×360@30fps 30 dtk — 2 sosok (kiri MERAH/kanan BIRU), audio mono bersuku bergantian (0-5 senyap, 5-11 kiri, 15-21 kanan, 21-26 kiri, 26-30 kanan) → 30/30 LULUS: analisis 2 pembicara, timeline ikut gantian (t=8 kiri, 18 kanan, 23.5 kiri, 28.6 kanan), hold saat senyap, crop 9:16/16:9 aspek-persis, ekspor nyata 1080×1920 H.264+AAC 30 dtk, PIKSEL HASIL: t=8 merah dominan (kamera di kiri), t=18 biru dominan; wide mode saat senyap; setting global antar video
- REGRESI v3.0: 39/39 LULUS (28 frame, filter warna, audio sehat, TTS, resume, ekspor nyata, gabung, deteksi adegan, sampul, laporan)
- BUG DITEMUKAN & DIPERBAIKI saat uji: (1) keputusan histeresis menyimpan indeks array bukan ID jejak → pemetaan urutan meleset saat id≠indeks; (2) spkFitBox menghitung kotak ternormalisasi sebagai piksel → crop nyangkut pojok gelap; (3) deteksi AI flak-y → jejak pecahan habis tersaring, false-positive pojok menang → tracking TTL 3 langkah + merge jejak + prioritas kotak besar + threshold 0.32 + kanvas 448px; (4) KUNCI CACHE segBoundsList TIDAK MEMUAT DURASI (bug laten v3.0!) — metadata flak-y 0.1 dtk (balasan kfile/decoder terpotong) ter-cache → ekspor "berhasil" 4 frame/13KB → durasi masuk kunci + muat-ulang metadata durasi tak masuk akal + invalidasi epoch; (5) guard mediaTime palsu di worker (laporan ≥durasi saat currentTime masih 0.1) — anti ekspor terpotong
- Versi 3.1.0: package.json (+deskripsi), installer.nsi (APPVERSION/OutFile/VIProductVersion/VIAddVersionKey), afterpack.js (3.1.0.0), README.md (badge + fitur 45), KINOSTRA-PANDUAN.md ("Yang Baru di v3.1" + Setup/Portable 3.1.0), index.html
- Build: dist:full → Portable 132.1MB (zip) + win-unpacked (3.1.0.0 UTF-16 ✓ posisi 187MB); makensis manual → Setup 95.7MB (3.1.0.0 UTF-16 ✓)
- Push source GitHub main (e020cb4, push via token-URL karena remote tanpa kredensial) + Release v3.1.0 (id 418141072) + 3 aset: Setup 91.3MB, Portable 126.0MB, PANDUAN.md

Stage Summary:
- Release: https://github.com/zacrie85/kinostra-desktop/releases/tag/v3.1.0
- File baru: renderer/js/speaker.js, scripts/kinostra-v31-test.mjs, scripts/kinostra-v31-mkmedia.mjs, scripts/kinostra-v31-debug.mjs, testmedia/podcast.mp4
- Keputusan: model = Xenova/yolos-tiny q8 (pipeline object-detection); zoom = crop kamera penuh-kanvas (bukan letterbox) dengan aspek mengikuti rasio output; keputusan pembicara menyimpan ID jejak (bukan indeks); saat senyap default TETAP DI PEMBICARA; prioritas kotak besar 0.6+0.4×(area/0.10) untuk menekan false-positive; zoom manual & Ken Burns diabaikan selagi spk aktif
- Perbaikan kualitas lintas-versi: kunci cache segmentasi kini memuat durasi; metadata durasi tak masuk akal → muat ulang otomatis; mediaTime palsu diabaikan worker

---
Task ID: 6
Agent: main (Super Z)
Task: KINOSTRA v3.1.1 — BUGFIX STUDIO SAMPUL: "Gagal menyimpan sampul: _sampulCounter is not defined" saat klik SIMPAN PNG (laporan user dgn screenshot)

Work Log:
- Akar masalah: sampul.js baris 179 memakai `_sampulCounter` untuk nomor urut otomatis, tapi variabel TIDAK PERNAH dideklarasikan (lolos refactor v3.0.0; uji regresi lama hanya memanggil drawSampul di kanvas terpisah, tidak pernah klik tombol SIMPAN PNG) → ReferenceError tertangkap try/catch → toast error
- Audit dependensi sampul.js satu per satu — semuanya aman: M/showModal/hideModal/fmtT/toast (core.js), coverRect (media.js), wrapLines (compose.js), frHororPlate/frGaibPlate/frDangdutPlate (frames.js), COLORFILTERS (core.js), slug/saveBlobToDir/_lastOutDir (core.js)
- Fix 1 baris: `let _sampulIv = null, _sampulT = 0;` → `let _sampulIv = null, _sampulT = 0, _sampulCounter = 0;`
- Uji baru scripts/kinostra-v311-sampul-test.mjs (Xvfb :99 + CDP port 9446, media podcast.mp4) mensimulasikan PERSIS alur user: openSampul → klik M.c.onclick (SIMPAN PNG) 2x + judul kosong 1x; _lastOutDir di-pre-set via CDP agar dialog native tidak menggantung; MutationObserver #toasts menangkap toast error
- HASIL 12/12 LULUS: modal terbuka, tombol SIMPAN PNG, kanvas 1280×720 tergambar, _sampulCounter terdefinisi, simpan 1x & 2x sukses (toast "Sampul tersimpan"), NOL toast error, 2 file pola nama benar, nomor urut 01→02, PNG >50KB + magic number valid, judul kosong → fallback state.title (nomor 03)
- Versi 3.1.1: package.json (version+deskripsi), installer.nsi (APPVERSION/OutFile/VIProductVersion/VIAddVersionKey), afterpack.js (3.1.1.0), README.md (badge), KINOSTRA-PANDUAN.md (Setup/Portable 3.1.1), index.html (boot+header)
- Build: dist:full → Portable 132.1MB + win-unpacked (3.1.1 UTF-16 ✓ posisi 187MB, exe=KINOSTRA.exe); makensis manual → Setup 95.7MB (3.1.1.0 UTF-16 ✓ posisi 53980); artefak lama 3.1.0 dihapus dari dist_out
- Commit 9e2f903 (8 file); push GitHub main OK (HEAD remote = 64a5fd5, verifikasi ls-remote) via token-URL dari user
- Rilis GitHub v3.1.1 (id 418163252) + 3 aset LULUS upload (HTTP 201): Setup 91.3MB, Portable 126.0MB, PANDUAN.md — skrip scripts/release-v311.sh (dengan retry 3x per aset)

Stage Summary:
- Release: https://github.com/zacrie85/kinostra-desktop/releases/tag/v3.1.1
- Bug: sampul.js `_sampulCounter` tak dideklarasikan → fix 1 baris; pelajaran: uji regresi harus menekan jalur klik ASLI modal (bukan hanya fungsi gambarnya)
- Uji baru: scripts/kinostra-v311-sampul-test.mjs (12/12); skrip rilis: scripts/release-v311.sh

