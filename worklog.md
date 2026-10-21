
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


---
Task ID: 7
Agent: main (Super Z)
Task: KINOSTRA v3.2.0 — JUMLAH PART OTOMATIS: user isi angka N → durasi per part dihitung & dipotong merata otomatis (kebalikan mode "durasi per part"); uji otomatis, build & rilis GitHub

Work Log:
- Permintaan user: "aku tinggal memasukan angka saja ingin menjadikan video tersebut menjadi berapa part" (contoh: video 60 mnt → 10 part, waktu diatur otomatis aplikasi)
- core.js: state.splitParts = 0 (0 = mati; N aktif) di samping splitSec
- media.js: applySplitParts() — splitSec = durasi ÷ N (float eksak, mesin split while-loop menerima pecahan); clamp N > durasi → floor(durasi) part (min ±1 dtk/part); dipanggil ulang SETIAP video dimuat (hook jalur metadata, sebelum tInfo) sehingga setelan "10 part" otomatis menyesuaikan video berikutnya; resetSplitPartsUI() + syncTInfoSplit() (HUD: "SPLIT OTOMATIS 10 PART × 6 DTK")
- ui.js: #inSplitParts.oninput → set splitParts + auto-pindah chip ke ATUR SENDIRI + isi kolom durasi dgn hasil hitungan + toast; edit durasi manual ATAU klik chip preset 20–60 dtk → splitParts=0 (eksklusif dua arah); kosong → mati
- index.html: modul 02 — input JUMLAH PART OTOMATIS (BARU · v3.2) + substat + note; boot/header v3.2.0
- segBoundsList TIDAK diubah (cache key sudah memuat splitSec yang berubah) — mode PER ADEGAN tak tersentuh
- Media uji: testmedia/v32-60s.mp4 (testsrc2 60 dtk + sine AAC)
- UJI (scripts/kinostra-v32-test.mjs, CDP 9448): 21/21 LULUS — smoke UI, 60s→10 part × 6.0 dtk eksak (indeks urut, batas 0/6/12/…/54), HUD+stat+chip+kolom, ganti 4 part × 15 dtk, clamp N=1000→60 part × 1 dtk, edit durasi manual → mati otomatis, chip preset → mati, setelan ikut video baru (60s: 5×12; 30s: 5×6), EKSPOR NYATA 10 MP4 (ffprobe semua ±6 dtk, PART_01…PART_10), regresi mode durasi + adegan (potong di 3 dtk)
- Regresi: suite v3.0 39/39; suite v3.1 29/30 (satu-satunya "gagal" = asersi versi "3.1.0 tampil" yang memang sudah jadi 3.2.0 — bukan regresi fungsi)
- Versi 3.2.0: package.json (+deskripsi JUMLAH PART), installer.nsi, afterpack.js (3.2.0.0), README badge, KINOSTRA-PANDUAN.md (tabel modul 02 + bagian "Yang Baru di v3.2"), index.html
- Build: dist:full → Portable 132.1MB + win-unpacked (3.2.0 UTF-16 ✓ posisi 187MB); makensis manual → Setup 95.7MB (3.2.0.0 UTF-16 ✓ posisi 53980)
- INSIDEN PUSH: GitHub Push Protection MENOLAK push — scripts/release-v311.sh (Task 6) menyimpan token hardcode dan terbawa commit sinkronisasi 4c6f001 → token di-scrub jadi env GH_TOKEN, 2 commit lokal ditulis-ulang (reset --soft 59da70f → 1 commit bersih 40ffd02) → push LULUS. PELAJARAN: JANGAN PERNAH hardcode token di file repo; skrip rilis selanjutnya wajib baca env GH_TOKEN
- Rilis GitHub v3.2.0 (id 418447532) + 3 aset HTTP 201: Setup 91.3MB, Portable 126.0MB, PANDUAN.md — skrip scripts/release-v320.sh (env GH_TOKEN)

Stage Summary:
- Release: https://github.com/zacrie85/kinostra-desktop/releases/tag/v3.2.0
- Fungsi baru: state.splitParts, applySplitParts(), resetSplitPartsUI(), syncTInfoSplit() (media.js); binding #inSplitParts (ui.js); #inSplitParts/#splitPartsStat (index.html)
- Uji baru: scripts/kinostra-v32-test.mjs (21/21) + testmedia/v32-60s.mp4
- Keputusan: splitParts eksklusif dgn chip preset & durasi manual (saling mematikan); nilai pecahan diperbolehkan (splitSec float) agar N part selalu eksak; PER ADEGAN tidak digabung dgn JUMLAH PART (beda filosofi: adegan = titik alami, jumlah = pembagian merata)

---
Task ID: 8
Agent: main (Super Z)
Task: KINOSTRA v3.3.0 — BACKSOUND MP3 SENDIRI: user impor MP3 manual sebagai musik latar + volume manual, ikut eksport & split; uji otomatis, build & rilis GitHub

Work Log:
- Permintaan user: "menambah suara backsound pada video yang akan di eksport dan split..memasukan mp3 secara manual...bisa di atur besar kecil volume suaranya secara manual"
- core.js: state.bsound = { on: true, buffer: null, gain: 0.35, name: '' }
- music.js (blok baru setelah composeMusic): ensureBsGain/stopBsoundPreview/startBsoundSync (pratinjau sinkron video, loop, offset playhead) + setBsoundBuffer (pasang buffer + refresh UI) + loadBsoundFile(File — jalur UI, dialog native via <input type=file> hidden) + loadBsoundFromPath(path — jalur uji/batch via fetch kfile://)
- exporter.js renderMix: sumber ke-4 BACKSOUND (setelah skor musik, sebelum TTS) — loop=true, offset = start % dur buffer (posisi lagu KONTINU antar part/blok, sama dgn perilaku musik prosedural), gain clamp 0..1.6, ikut spd; wantAudio kini ikut menghitung backsound (video tanpa suara asli tetap diekspor DENGAN audio)
- encodeAudioStream TIDAK diubah — jalur unik (part + merge + batch) otomatis membawa backsound
- index.html modul 06: tombol PILIH FILE MP3 + hapus, input file hidden, substat status, cheklis PAKAI BACKSOUND, slider VOLUME BACKSOUND 0–150% + note tips (kecilkan MIX AUDIO ASLI utk backsound dominan)
- ui.js: binding 4 kontrol + hook play/pause/seeked → startBsoundSync/stopBsoundPreview
- Media uji: testmedia/bs-sine.mp3 (sine 1200Hz 8 dtk — podcast.mp4 sunyi di 0–5 dtk → jendela ukur bersih)
- UJI (scripts/kinostra-v33-test.mjs, CDP 9450): 14/14 LULUS — smoke UI, decode MP3 ±8 dtk + stat SIAP, renderMix terukur: off=sunyi (<0.005), on=bunyi (>0.05), gain 30% ≈ ⅓× (rasio 0.2–0.5), LOOP t=20 dtk (buffer 8 dtk) tetap bunyi, cheklis ON/OFF mengontrol mix, pratinjau guarded saat pause, EKSPOR NYATA 3 part + ffprobe volumedetect mean > −40 dB (backsound terdengar), hapus bersih
- Regresi: v30 39/39 (run pertama gagal di GABUNG = tabrakan nama file sisa run sebelumnya "(1)" + kontensi 2 suite beruntun → OUTDIR dibersihkan → lulus; kode merge tidak tersentuh v3.3), v32 21/21, v31 29/30 (1 asersi teks "3.1.0", bukan regresi)
- Versi 3.3.0: package.json (+deskripsi), installer.nsi, afterpack.js (3.3.0.0), README badge, PANDUAN (tabel modul 06 + bagian "Yang Baru di v3.3"), index.html boot/header
- Build: dist:full → Portable 132.1MB + win-unpacked (3.3.0 UTF-16 ✓ posisi 187MB); makensis manual → Setup 95.8MB (3.3.0.0 UTF-16 ✓ posisi 53980)
- Commit d787fdd + push main OK; Release v3.3.0 (id 418483119) + 3 aset HTTP 201 (Setup 91.3MB, Portable 126.0MB, PANDUAN.md) — skrip scripts/release-v330.sh (env GH_TOKEN, tanpa hardcode)

Stage Summary:
- Release: https://github.com/zacrie85/kinostra-desktop/releases/tag/v3.3.0
- Fungsi baru: state.bsound; loadBsoundFile/loadBsoundFromPath/setBsoundBuffer/startBsoundSync/stopBsoundPreview (music.js); blok BS di renderMix + wantAudio (exporter.js); UI modul 06
- Uji baru: scripts/kinostra-v33-test.mjs (14/14) + testmedia/bs-sine.mp3
- Keputusan: backsound GLOBAL (setelan tetap untuk semua video batch, sama seperti splitSec); loop kontinu antar part (bukan restart per part); pratinjau WebAudio realtime; catatan: jalur GABUNG rentan flake bila OUTDIR berisi file nama sama dari run lain (guard timeout write) — di luar sentuhan v3.3, dicatat utk investigasi kelak

---
Task ID: 9
Agent: main (Super Z)
Task: KINOSTRA v3.4.0 — RESOLUSI OUTPUT 720p/1080p/2K/4K UHD: chip pilihan resolusi di modul 09 EKSPORT & KOMPRESI, berlaku semua video (EKSPORT & SPLIT MP4 + BATCH EKSPOR + GABUNG); uji otomatis, build; push & rilis MENUNGGU GH_TOKEN dari user

Work Log:
- Permintaan user: "tambahkan pilihan untuk mengatur resolusi video ... 720p, 1080p, 2k dan 4K (Ultra HD - 3840 x 2160) ... bisa di terapkan untuk semua video ... EKSPORT & SPLIT MP4 maupun BATCH EKSPORT - SEMUA VIDEO DI KOTAK"
- Audit pipeline dulu: outDims() (media.js) = satu-satunya sumber W×H (dipakai exportPartsToDir, exportMergeToDir, updateExportInfo) → override terpusat otomatis mencakup batch & gabung; semua overlay (judul/subtitel/frame/watermark/spk-zoom) menggambar relatif (u=H/1080 + fraksi W×H) → aman 4K; cache lapisan statis (bgLayerKey/vignette) berkunci WxH → aman ganti resolusi
- core.js: katalog RESOUTS {'720':1280×720,'1080':1920×1080,'1440':2560×1440,'2160':3840×2160} + state.resOut ('' = AUTO ikuti skala, perilaku lama utuh)
- media.js outDims(): resOut terisi → kunci W×H tetap; rasio 9:16 membalik W↔H (4K vertikal = 2160×3840, konvensi TikTok/Shorts)
- exporter.js: h264CodecsFor(W,H,fps) — ≤1080p daftar lama persis v2.x (nol regresi); >1080p wajib level 5.1 (avc1.640033/4D0033/420033), 4K@>30fps level 5.2 (640034) agar isConfigSupported & encoder hardware menerima frame; exportBitrate() — resolusi tetap → bitrate = q.br × luas/(1920×1080), clamp 0.6–48 Mbps; AUTO → pengali skala lama (1/0.62/0.38); dipakai di exportPartsToDir + exportMergeToDir + updateExportInfo; pesan error codec kini menyebut resolusi + saran turunkan
- index.html modul 09: chip RESOLUSI OUTPUT (AUTO/720p HD/1080p FHD/2K QHD/4K UHD) + note; label SKALA jadi "(mode AUTO)"; ringkasan ekspor menampilkan "RESOLUSI 4K ULTRA HD" dst
- ui.js: bindSeg segRes; eksklusif dua arah dgn segScale (klik skala saat resolusi tetap → balik AUTO + toast, pola v3.2) + class res-dim (opacity .4, kinestra.css); preset YOUTUBE/TIKTOK/REELS/SHORTS ikut reset ke AUTO
- UJI scripts/kinostra-v34-test.mjs (CDP 9452): 34/34 LULUS — smoke 5 chip + AUTO default, dimensi 4 chip + 9:16 terbalik, eksklusivitas dua arah + preset, bitrate monoton 720<1080<2K<4K + 4K maks clamp 48Mbps + AUTO=6Mbps persis lama, codec level (1080p daftar lama; 2K/4K L5.1; 4K@60 L5.2), EKSPOR NYATA 720p 2 part + 2K 1 part + 4K 2 part (ffprobe 1280×720/2560×1440/3840×2160, encoder software env ini mendukung 4K), BATCH EKSPOR tombol asli runBatch(true) 2 video @720p → 4 part semua 1280×720
- (Bug skrip uji, bukan aplikasi: 1 asersi awal memanggil outDims() tanpa arg skala → 1920×1080; diperbaiki outDims(parseFloat(state.scale)) → 34/34)
- Regresi: v30 39/39; v32 20/21 (satu gagal = asersi teks "3.2.0" yang memang sudah naik — bukan regresi fungsi); v33 14/14
- Versi 3.4.0: package.json (version+deskripsi), installer.nsi (APPVERSION/OutFile/VIProductVersion/VIAddVersionKey), afterpack.js (3.4.0.0), README badge, PANDUAN (tabel modul 09 + bagian "Yang Baru di v3.4" 8 butir + Setup/Portable 3.4.0), index.html boot+header
- Build: dist:full → Portable 3.4.0 + win-unpacked (3.4.0 UTF-16 ✓ posisi 187MB); makensis manual → Setup 91.3MB (3.4.0.0 UTF-16 ✓ posisi 53980)
- Commit bfeb775 (14 file). PUSH & RELEASE BELUM DILAKUKAN: GH_TOKEN dari sesi sebelumnya hilang saat konteks di-reset (memang tidak boleh disimpan di repo/file) — skrip scripts/release-v340.sh SUDAH SIAP (env GH_TOKEN, retry 3×/aset); begitu user memberi token: export GH_TOKEN=… → git push https://x-access-token:$GH_TOKEN@github.com/zacrie85/kinostra-desktop main → bash scripts/release-v340.sh

Stage Summary:
- Fungsi baru: state.resOut + RESOUTS (core.js); outDims() override (media.js); h264CodecsFor/exportBitrate (exporter.js); chip segRes + res-dim + eksklusivitas (ui.js/index.html/kinestra.css)
- Uji baru: scripts/kinostra-v34-test.mjs (34/34) + testmedia/v34-8s.mp4, v34-6s.mp4
- Keputusan: AUTO=''(bukan nilai khusus) agar seluruh kode lama tak tersentuh saat chip tak dipakai; bitrate dari luas piksel bukan tabel manual (2K=1.78×, 4K=4×); level H.264 naik otomatis >1080p sesuai spek (4.0 maks 1080p); KOMPRES PINTAR tetap menimpa bitrate per part; skala & resolusi tetap eksklusif dua arah
- PENDING: push + GitHub Release v3.4.0 (3 aset) menunggu GH_TOKEN baru dari user

---
Task ID: 9 (lanjutan — selesai)
Agent: main (Super Z)
Task: Penyelesaian push + GitHub Release v3.4.0 (lanjutan Task 9 yang PENDING menunggu GH_TOKEN)

Work Log:
- User memberi GH_TOKEN baru via chat → dipakai HANYA via env export (tidak pernah ditulis ke file repo — pelajaran Push Protection Task 7)
- Validasi token: GET /user → zacrie85; GET /repos/zacrie85/kinostra-desktop → push:true
- Push main: b7b2735..609e2e4 LULUS (membawa bfeb775 v3.4.0 + 609e2e4 worklog); audit git diff pra-push: hanya perubahan mode file (0 insert/delete), tidak ada token bocor
- dist_out ternyata sudah terbersihkan setelah reset konteks → REBUILD penuh: npm run dist:full → Portable 132.1MB + win-unpacked (error NSIS "VIProductVersion already defined" yang dikenal = abaikan); verifikasi UTF-16 '3.4.0' di KINOSTRA.exe posisi 187765056 (±187MB, cocok catatan Task 9)
- makensis manual (build/, nsis-3.0.4.1) → Setup 91.3MB; verifikasi UTF-16 '3.4.0.0' posisi 53980 (cocok catatan Task 9)
- bash scripts/release-v340.sh (env GH_TOKEN): Release ID 418932936; 3 aset HTTP 201 — Setup 91.3MB, Portable 126.0MB, PANDUAN.md; verifikasi API: draft=false, prerelease=false, state=uploaded semua
- Commit artefak TIDAK mengubah kode aplikasi (rebuild murni binary sama versi; tak ada commit baru diperlukan)

Stage Summary:
- Release: https://github.com/zacrie85/kinostra-desktop/releases/tag/v3.4.0 (RESOLUSI OUTPUT 720p/1080p/2K/4K)
- Status Task 9: SELESAI PENUH (kode+uji+build+push+rilis)
- Aset rilis konsisten dgn build sebelum-reset (ukuran UTF-16 offset identik) — tidak ada regresi build
- Catatan operasional: token diterima via chat hanya hidup selama sesi shell; bila konteks reset lagi sebelum rilis, build dist_out ikut hilang → urutan aman = push dulu, baru build, lalu rilis segera

---
Task ID: 10
Agent: main (Super Z)
Task: KINOSTRA v3.5.0 — CARA PERPINDAHAN FOKUS ZOOM PEMBICARA: chip GESER HALUS / FADE·LEBUR / LANGSUNG·CUT di modul 02C; uji otomatis, build & rilis GitHub

Work Log:
- Permintaan user: perpindahan fokus zoom pembicara kini bisa pakai "fade atau langsung pindah ke orang yang berbicara tanpa terlihat pergeseran kamera atau zoom nya"
- Audit dulu: spkCropAt() (speaker.js) = fungsi murni dari t — dipakai compose.js satu-satunya; exporter (part/merge/batch) memanggil drawComposition → cukup ubah speaker.js + compose.js, semua jalur ekspor otomatis dapat mode baru; deterministik per-t terjaga
- speaker.js: SPK_FADE=0.55 (durasi crossfade); spkFinishRect() (refactor finalisasi rect); spkCropAt() baca state.spk.trans — 'geser' (smoothstep SPK_EASE lama persis), 'langsung' (tanpa interpolasi = potong instan), 'fade' (return {...rectB, fadeFrom:rectA@seg.t0, fadeK smoothstep}) — semua tetap fungsi murni t
- compose.js: blok fade — drawImage(fadeFrom) penuh + drawImage(main) dengan globalAlpha=fadeK → crossfade eksak; guard spk && (bug awal: akses spk.fadeFrom saat spk null membuat 4 suite regresi FATAL — ditemukan oleh regresi, diperbaiki)
- core.js: state.spk.trans = 'geser' (setelan global semua video); ui.js bindSeg segSpkTrans + toast; index.html modul 02C: chip CARA PERPINDAHAN FOKUS (GESER HALUS/FADE·LEBUR/LANGSUNG·CUT) + note diperbarui (kecepatan tetap atur keputusan gantian di semua mode)
- Media uji: testmedia/v35-2tone.mp4 (8 dtk 640×360, KIRI MERAH / KANAN BIRU 0x2222FF + sine) — membuktikan mode via warna pixel
- UJI scripts/kinostra-v35-test.mjs (CDP 9454): 27/27 LULUS — smoke 3 chip + default geser; klik → state berganti; mock timeline 2 pembicara (tukar t=4): GESER mid-crop di antara 2 target, LANGSUNG lompat instan 4.01→statis, FADE fadeFrom/fadeK 0→1 lalu hilang + kedua rect statis (tanpa gerak kamera) + dari kiri ke kanan; pixel drawComposition (overlay mati, 9:16): merah→campuran→biru; EKSPOR NYATA FADE 2 part (split di t=4): PART_01 merah, PART_02 @0.12 merah dominan, @0.3 CAMPURAN (bukti dissolve di MP4 final), @0.8 biru; EKSPOR NYATA LANGSUNG: @0.1 biru seketika
- Bug skrip uji (bukan aplikasi): fc() selalu baca PART_02 (PART_01 tak teruji) → fc(file,ts); section D reset rasio 16:9 menyebabkan ekspor E/F 16:9 (gradient kiri-merah palsu) → 9:16 dipasang ulang di E
- Regresi: v30 39/39; v31 29/30 (1 asersi teks "3.1.0"); v32 20/21 (1 teks "3.2.0"); v33 14/14; v34 34/34 — nol regresi fungsi
- Versi 3.5.0: package.json (version+deskripsi), installer.nsi, afterpack.js (3.5.0.0), README badge, PANDUAN (bagian "Yang Baru di v3.5" + Setup/Portable 3.5.0), index.html boot/header
- Build: dist:full → Portable 132.1MB (3.5.0 UTF-16 ✓ pos 187MB); makensis manual → Setup 91.3MB (3.5.0.0 UTF-16 ✓ pos 53980)
- Commit 91f60cc + push main OK; Release v3.5.0 (id 418990891) + 3 aset HTTP 201 (Setup 91.3MB, Portable 126.0MB, PANDUAN.md) — skrip scripts/release-v350.sh (env GH_TOKEN)

Stage Summary:
- Release: https://github.com/zacrie85/kinostra-desktop/releases/tag/v3.5.0
- Fungsi baru: state.spk.trans; SPK_FADE + spkFinishRect + mode di spkCropAt (speaker.js); blok blend FADE di compose.js; chip segSpkTrans (index.html/ui.js)
- Uji baru: scripts/kinostra-v35-test.mjs (27/27) + testmedia/v35-2tone.mp4
- Keputusan: FADE = crossfade DUA BINGKAI STATIS (bukan interpolasi posisi) — persis permintaan "tanpa terlihat pergeseran kamera"; LANGSUNG = skip interpolasi; kecepatan pindah fokus TIDAK didim (masih relevan: mengatur histeresis keputusan gantian di semua mode); fadeFrom dievaluasi di seg.t0 (statis) sedangkan main rect tetap hidup mengikuti kotak pembicara
- PELAJARAN regresi: guard null (spk && spk.fadeFrom) — kode baru di jalur bersama wajib aman saat fitur MATI; regresi suite v30-v34 menangkapnya sebelum rilis

---
Task ID: 11
Agent: main (Super Z)
Task: KINOSTRA v3.6.0 — COVER VIDEO PEMBUKA (modul 08B): cover tampil 2 dtk di awal SETIAP file hasil EKSPORT & SPLIT, BATCH & GABUNG; impor manual atau dibuat langsung di STUDIO SAMPUL; uji otomatis, build & (pending) rilis GitHub

Work Log:
- Permintaan user: "memasukan cover untuk semua hasil eksport & split … cover nya akan muncul 2 detik di setiap awal video … bisa di import secara manual bisa juga di buat langsung oleh aplikasi"
- Audit dulu: pipeline ekspor = WebCodecs murni (bukan ffmpeg) → cover diimplement DI DALAM pipeline: encodeAudioStream() + preSil (audio bungkam, ts kontinu), renderPartWorker() encode frame cover lebih dulu (PTS 0) lalu outTs konten digeser +coverD — SATU PASS, tanpa concat/re-encode; semua jalur (ekspor/split/batch/gabung) otomatis dapat fitur
- core.js: state.cover = { on, dataUrl, name, img, dur:2 } (setelan GLOBAL semua video)
- main.js+preload.js: IPC dialog:openCover / pickCover (dialog pilih PNG/JPG/WebP)
- index.html: modul 08B COVER VIDEO PEMBUKA (antara 08 & 09): segCover MATI/AKTIF, tombol IMPOR COVER… & BUAT DI STUDIO SAMPUL, coverStat, segCoverDur 1/2/3/5 DETIK (default 2), note (mengisi penuh layar, crop pas, tampil diam-diam)
- ui.js: bindSeg segCover (AKTIF ditolak bila belum ada cover → toast peringatan, pola v3.2), segCoverDur, setCoverFromDataUrl() (dipakai impor manual & Studio Sampul; auto-AKTIF + syncCoverUI), mimeCover utk jpg/webp/svg
- sampul.js: openSampul(asCover) — mode cover menampilkan tombol "PAKAI SEBAGAI COVER VIDEO" di atas kanvas → toDataURL → setCoverFromDataUrl('STUDIO SAMPUL') → modal tutup; judul modal berubah
- exporter.js: coverActive()/coverDurFor()/drawCoverFrame() (coverRect = crop pas, latar hitam); renderPartWorker: coverD (GABUNG hanya bagian pertama — mergeCtx.off<0.001), encode nC frame cover (keyframe pertama, backpressure CAP), outTs += coverD, audio preSil; nMain counter baru agar fallback-seek tak tertipu frame cover (renderFramesBySeek menimpa slot.fr → nCov dijaga); exportPartsToDir/exportMergeToDir: total slot += frame cover; merge driver: mergeCtx.off += coverD setelah bagian pertama; updateExportInfo: "COVER N DTK DI AWAL"
- UJI scripts/kinostra-v36-test.mjs (CDP 9456): 29/29 LULUS — smoke modul 08B (2+4 chip, default MATI 2 dtk), setCoverFromDataUrl auto-AKTIF + status, toggle MATI/AKTIF, chip durasi 3→2, pixel drawCoverFrame = hijau 0x00B140, STUDIO SAMPUL mode cover (tombol memasang kanvas + modal tutup), EKSPOR NYATA 1 part (dur 8→10 dtk persis, frame @0.1/@1.9 hijau penuh, @2.5/@7.5 konten kiri-merah-kanan-biru, audio 2 dtk bungkam −91 dB lalu sine −22 dB), EKSPOR NYATA SPLIT 2 part (keduanya 6 dtk, keduanya dibuka cover), GABUNG 2 video (8 dtk, cover sekali di awal, tidak diulang antar film)
- Bug skrip uji (bukan aplikasi): asersi dim mengira output 640×360 — ternyata outDims 16:9 skala 100% = 1920×1080 (perilaku lama); frameAvg diganti frameAt per-wilayah (kiri/mid/kanan) + frameDims dari ffprobe
- Regresi: v30 39/39; v31 29/30 (1 asersi teks "3.1.0"); v32 20/21 (1 teks "3.2.0"); v33 14/14; v34 34/34; v35 27/27 — NOL regresi fungsi
- Versi 3.6.0: package.json (version+deskripsi), installer.nsi (APPVERSION/OutFile/VIProductVersion/2×VIAddVersionKey), afterpack.js (3.6.0.0), README badge, PANDUAN (baris modul 08B + bagian "Yang Baru di v3.6" 6 butir + Setup/Portable 3.6.0), index.html boot+header
- Commit 6362190 (amend: buang artefak tool-results/ dari repo — gitignore baru; 12 file kode + 3 file baru) — BELUM DI-PUSH
- Build: dist:full → Portable 132.1MB (3.6.0 UTF-16 ✓ pos 187765056) + win-unpacked; makensis manual → Setup 95.8MB (3.6.0.0 UTF-16 ✓ pos 53980)
- GH_TOKEN sesi sebelumnya sudah INVALID (curl /user = "Bad credentials") → push & rilis PENDING token baru dari user; scripts/release-v360.sh SUDAH SIAP (env GH_TOKEN, retry 3×/aset, body release lengkap)

Stage Summary:
- Fungsi baru: state.cover + modul 08B; IPC pickCover; setCoverFromDataUrl/syncCoverUI (ui.js); openSampul(asCover) (sampul.js); coverActive/coverDurFor/drawCoverFrame + preSil + outTs cover + nMain (exporter.js)
- Uji baru: scripts/kinostra-v36-test.mjs (29/29) — tanpa media baru (pakai v35-2tone.mp4 + kanvas hijau 0x00B140 in-page)
- Keputusan desain: cover DI DALAM pipeline WebCodecs (bukan ffmpeg concat) = nol re-encode, PTS konsisten, LANJUTKAN EKSPOR/KOMPRES PINTAR/RESOLUSI tetap serasi; GABUNG dapat cover SEKALI di pembuka gabungan (bukan tiap film); audio bungkam selama cover; isAudio dikecualikan
- PENDING: push main (commit 6362190 + worklog ini) + GitHub Release v3.6.0 (3 aset) menunggu GH_TOKEN baru — begitu user memberi token: export GH_TOKEN=… → git push https://x-access-token:$GH_TOKEN@github.com/zacrie85/kinostra-desktop main → bash scripts/release-v360.sh
- PELAJARAN operasional: setsid+nohup background runner tetap bisa mati saat panggilan tool dibatalkan (context canceled) — suite regresi panjang lebih aman foreground satu-per-satu (maks 585 dtk/suite); token GitHub hanya hidup selama dibagikan — selalu validasi dulu (GET /user) sebelum push/rilis
