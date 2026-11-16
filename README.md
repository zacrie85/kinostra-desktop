<div align="center">

# 🎬 KINOSTRA — Suite Video Otonom

**Aplikasi desktop Windows 100% offline untuk produksi video otomatis.**
Auto-split video → Subtitle AI Whisper → Object Tracking → Musik Prosedural → Efek Visual → Export MP4.

![Version](https://img.shields.io/badge/version-3.25.0-amber) ![Platform](https://img.shields.io/badge/platform-Windows%2010%2F%2011%20x64-blue) ![Offline](https://img.shields.io/badge/offline-100%25-success) ![Engine](https://img.shields.io/badge/engine-Electron%2033-9feaf9)

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
| 22 | **8 Frame Video Baru** ⭐v2.12 | Dari 9 gambar referensi pengguna: **BIOSKOP** (tirai merah + lampu emas berkelip + film & popcorn), **MERAH PUTIH** (bingkai emas + awan + pita bendera), **KAYU & BUNGA** (papan kayu + bunga matahari), **GELOMBANG WARNA** (gelombang merah-kuning-pink), **PUTIH ELEGAN** (ornamen jingga), **AWAN BIRU** (awan berlapis + matahari), **PANEL BIRU** (panel putih bulat), **GRADIEN TIPIS** (garis minimalis) — semua animasi halus & terbakar saat ekspor, judul di pita atas / deskripsi di banner bawah / PART di pojok |
| 23 | **Ken Burns Otomatis** ⭐v2.12 | Zoom in/out perlahan atau geser sinematik per part — video statis jadi hidup, kekuatan bisa diatur |
| 24 | **Transisi Antar Bagian** ⭐v2.12 | FADE hitam atau SLIDE menyamping di awal & akhir tiap part — hasil split diputar berurutan terasa seperti satu film |
| 25 | **Kontrol Kecepatan** ⭐v2.12 | 0.5× pelan sampai 2× cepat — video + audio ikut, durasi part menyesuaikan otomatis |
| 26 | **Potong & Hapus Bagian** ⭐v2.12 | Buang bagian tak diinginkan dari hasil ekspor (salah ambil, iklan, jeda) — zona merah di timeline, pratinjau lompat otomatis, nomor part tetap menyambung |
| 27 | **Impor SRT** ⭐v2.12 | Muat subtitel dari file `.srt` — tanpa perlu menulis ulang lewat AI |
| 28 | **Preset Ekspor** ⭐v2.12 | Satu klik: YOUTUBE 16:9 1080p · TIKTOK 9:16 · REELS 9:16 · SHORTS 9:16 60fps |
| 29 | **Probe Encoder** ⭐v2.12 | Encoder GPU diuji nyata dulu (encode+flush mini) sebelum dipakai — yang bermasalah otomatis diganti software, folder output dibuat otomatis → ekspor makin awet |
| 21 | **Batch Anti-Batal** ⭐v2.10 | **Satu video bermasalah tidak lagi membatalkan seluruh batch ekspor** — ditandai GAGAL + penyebabnya, antrean lanjut otomatis. Skor musik kini dirender ulang benar untuk tiap video di batch (dulu memicu berhenti "dibatalkan"), musik otomatis berulang bila part lebih panjang dari skor, dan pesan kegagalan tampil apa adanya — bukan lagi "Ekspor dibatalkan" |
| 22 | **Ekspor Anti-Beku** ⭐v2.11 | **Video hasil ekspor/split tidak lagi beku-bekerak** (jalan sebentar, beku beberapa detik, jalan lagi, begitu seterusnya). Lompatan frame akibat decoder kewalahan kini dideteksi otomatis dan **diisi ulang lewat seek presisi frame-per-frame**, kecepatan capture menyesuaikan beban, dan verifikasi output diperketat — gerakan selalu mulus & sinkron dengan audio, di ekspor tunggal, split, maupun batch |
| 30 | **Auto-Subtitel Saat Ekspor** ⭐v2.13 | **Semua video langsung dibuatkan subtitel AI otomatis saat EKSPOR / SPLIT / BATCH** — tidak perlu menekan BUAT SUBTITEL dulu. Berlaku untuk semua video yang diimpor (termasuk batch 100 video); subtitel buatan sendiri atau hasil Impor SRT tetap dihormati; gagal transkrip tidak menggagalkan ekspor; bisa dimatikan |
| 31 | **Vocalis Turbo — Transkrip 2-4× Lebih Cepat** ⭐v2.13 | Audio dipecah jadi potongan lalu ditranskrip **paralel oleh 2-4 proses mesin sekaligus** di CPU multi-core, **bagian tanpa suara dilewati**, batas potongan dicari di titik tersepi (kata tidak terpotong), progres gabungan per bagian, + mesin baru **CEPAT (base, ±60 MB)** yang seimbang untuk lagu |
| 32 | **Deteksi GPU + Akselerasi Ekspor** ⭐v2.14 | Aplikasi **mendeksi otomatis GPU yang terpasang** (NVIDIA/AMD/Intel) dan menguji kecepatan encoder GPU vs CPU — hasilnya tampil di modul EKSPOR. Pilihan **OTOMATIS / GPU / CPU**: mode GPU memakai encoder hardware (NVENC/QuickSync/AMF) yang bisa **5-10× lebih cepat**; paralel otomatis naik sampai **6×** saat GPU aktif; capture rate naik 3× karena encoding bukan lagi hambatan |
| 33 | **Ekspor Batch Anti-Pelan** ⭐v2.15 | **Film ke-3 ke atas di batch tidak lagi merambat** (film 60 mnt tak lagi 4 jam). Empat akar masalah dibereskan: data video kini dialirkan potongan 512 KB (dulu buffer sebesar sisa film dibaca sinkron di setiap seek), part besar ditulis langsung ke disk selagi dirender, audio di-encode per blok 60 dtk, dan bocor sesi encoder GPU ditutup — encoder hardware yang berulang kali macet otomatis diganti CPU untuk sisa batch. RAM antar film dibersihkan + paralel ramah GPU terintegrasi (Intel Iris/UHD maks 4×) |
| 34 | **12 Frame Khusus Tema** ⭐v2.16 | Menu FRAME VIDEO kini berisi papan judul tema terpasang di atas frame: **6 HOROR ALAMGAIB** (Hutan Mistis, Kuburan, Rumah Berhantu, Darah Kutukan, Jejak Hantu, Lilin Malam — bertema horor misteri & hantu, papan gothic font Cinzel + tengkorak + glow merah) dan **6 DANGDUT IDOLADESA** (Panggung, Gendang, Gliter Emas, Neon Disko, Obor Desa, Kipas Gliter — bertema musik dangdut koplo, pita merah-emas font Anton + catatan musik). Semua beranimasi (kabut, kelelawar, lampu sorot, bola disko, gliter) & terbakar ke video saat ekspor; judul videomu otomatis tampil di bawah papan tema |

| 35 | **6 Frame ALAM GAIB** ⭐v3.0 | Horor Indonesia paling menyeramkan, papan judul **ALAM GAIB** (batu hijau-racun + akar menjuntai, font Cinzel glow hijau): **POCONG KEBUN** (pocong melompat + kunang-kunang), **TUYUL BERINGIN** (tuyul di dahan + koin emas berjatuhan), **KUNTILANAK** (sosok putih rambut panjang + bulan merah + melati berjatuhan), **API SANGGAH** (altar batu + api menyala + bara), **KABUT MAKAM** (nisan + kabut 3 lapis + will-o'-wisp), **RITUAL TENGAH MALAM** (lingkar lilin ungu + glyph berputar) |
| 36 | **Filter Warna Sinematik** ⭐v3.0 | 10 preset satu klik terbakar ke video & sampul: **HOROR MISTIS** (dingin kehijauan), **DANGDUT EMAS** (hangat keemasan), SINEMA TEAL-ORANGE, NOIR, VINTAGE 80-an, VIVID, DINGIN BIRU, PUCAT MIMPI, SERAM MERAH |
| 37 | **Split Adegan Otomatis** ⭐v3.0 | Deteksi pergantian adegan 100% offline (analisis piksel + histogram, ambang adaptif median+MAD) → part terpecah **tepat di adegan**, bukan per durasi. Titik bisa dihapus per baris, kompatibel dengan POTONG BAGIAN |
| 38 | **Gabung Video → 1 File** ⭐v3.0 | Kebalikan split: semua video di Kotak Video (urutan atas→bawah) digabung jadi **SATU MP4 utuh** — timestamp video & audio menyambung mulus, judul per film & subtitel tetap ikut, file besar mengalir langsung ke disk (RAM datar) |
| 39 | **Sampul Auto (Thumbnail)** ⭐v3.0 | Studio thumbnail: frame bebas + judul besar bergaya HOROR/DANGDUT/SINEMA/NEON/POLOS + filter warna → **PNG siap upload** (1280×720 / 720×1280), nomor urut otomatis |
| 40 | **Kompres Pintar** ⭐v3.0 | Target ukuran per part (mis. 500 MB): bitrate video dihitung otomatis dari durasi — pas untuk batas WhatsApp/kuota upload |
| 41 | **Audio Sehat** ⭐v3.0 | Normalizer loudness satu klik (RMS → target −16 dBFS, rentang 0.5–4×) + kompresor lembut + redam desis/dengung — volume seragam antar video batch |
| 42 | **Batch Pro: Lanjut & Shutdown** ⭐v3.0 | Ekspor terputus **tidak diulang dari nol** — part yang filenya sudah ada otomatis dilewati; **matikan PC otomatis** setelah batch (hitung mundur 30 dtk bisa dibatalkan); **laporan rekap KINOSTRA-LAPORAN.txt** otomatis di folder output |
| 43 | **Narasi AI (TTS Offline)** ⭐v3.0 | Suara AI bahasa Indonesia 100% offline (VITS MMS ±37 MB, unduh sekali): teks → suara → pasang di playhead → ter-mix ke hasil ekspor/split/batch |
| 44 | **Optimasi Kecepatan 100%** ⭐v3.9 | **BARU v3.9: MODE KILAT — ekspor memotong LANGSUNG dari wadah MP4 + dekode hardware, tanpa memutar video → jauh lebih cepat, hasil minimal 720p** (uji: ±4,7×; dengan GPU lebih besar lagi). v3.0: audio di-encode bersamaan dengan video (±30-45% lebih cepat per part), buffer audio dipakai ulang (GC −40%) |
| 45 | **Zoom Pembicara Otomatis (AI)** ⭐v3.1 | Seperti aplikasi AI potong podcast: kamera **otomatis meng-zoom orang yang sedang bicara** dan pindah halus saat gantian — deteksi orang (YOLOS ONNX offline, ±10 MB unduh sekali) + **gerakan mulut** + **kapan ada suara**. Rasio **9:16** = hasil vertikal siap Reels/TikTok/Shorts. Kecepatan pindah fokus bisa diatur (cepat/normal/lambat), saat senyap tetap di pembicara atau tampilkan semua. **Berlaku global semua video** — Batch Ekspor & Gabung Video otomatis menganalisis tiap video |
| 46 | **Cover Video Pembuka + Mode Otomatis** ⭐v3.9 | **Satu cover tampil di awal SETIAP file** hasil ekspor & split (1/2/3/5 detik). **v3.8: 1 SAMPUL SEMUA PART** — cukup pindai SEKALI per film (sekitar menit 5–7), sampul yang sama dipakai semua part-nya (film 60 mnt → 10 part = 1 cover); nomor part tetap otomatis (posisinya bisa digeser sampai paling atas). **v3.9: BINGKAI JUDUL 10 gaya** (KOTAK, GANDA, PITA, SUDUT EMAS, NEON, FILM STRIP, GARIS EMAS, KACA, GRADIEN, GARIS PUTUS) + **posisi judul bisa digeser** sampai paling bawah. v3.7: OTOMATIS TIAP PART (cover tiap part beda dari adegannya) + bingkai **KLASIK/GARIS/SINEMA** + judul otomatis. MANUAL (impor/Studio) tetap ada |
| 47 | **10 Frame Fituristik Judul di Video** ⭐v3.10 | **KOREKSI dari v3.9** — bingkai hias kini di sekeliling **JUDUL YANG TERBAKAR DI DALAM VIDEO** (bingkai judul sampul 08B tetap ada): GARIS KEMBAR · KOTAK TEGAS · BINGKAI GANDA · SUDUT KAMERA · PITA JUDUL · PITA SINEMA · NEON MENYALA · EMAS KLASIK · PANEL MODERN · GRADASI PANAS. Pratinjau = hasil ekspor persis. **Posisi judul kini menjangkau PALING BAWAH layar** & **posisi nomor PART menjangkau PALING ATAS layar** + gaya PART **TANPA LABEL** |
| 48 | **POTONG LANGSUNG (Ekspor & Split Tanpa Render)** ⭐v3.10 | Mode proses baru: MP4 dipecah **tanpa re-encode sama sekali** — byte video asli disalin utuh, batas part menyesuaikan keyframe. **Kualitas & resolusi 100% asli**, kecepatan ±10-60× render (sebatas disk), hasil tetap fastStart. Ada efek aktif? Otomatis jatuh ke RENDER PENUH (bisa MODE KILAT) dengan pesan jelas. Berlaku untuk EKSPOR & SPLIT, rentang waktu, potongan & BATCH EKSPOR |
| 49 | **MESIN COVER NOVACUT — 100 Template** ⭐v3.11 | Fitur cover **diganti total** dengan sistem NOVACUT Studio: **10 LAYOUT × 10 PALET** (Impact, Lower Third, Banner, Gradien Sisi, Kotak, Neon Glow, Bar Sinema, Sticker, Outline, Pita Diagonal × Cyber, Sunset, Gold, Ice, Toxic, Royal, Blood, Mono, Candy, Ocean), latar **ADEGAN/HITAM**, bingkai cover **KLASIK/MODERN/FUTURISTIK**, efek **KEN BURNS** (zoom/pan) |
| 50 | **28 Transisi Cover → Video + 8 Animasi Teks** ⭐v3.11 | Transisi NOVACUT penuh: FLASH SNAP, WHIP PAN, ZOOM PUNCH/BLAST, RGB GLITCH, IMPACT SHAKE, CINEMATIC BARS, FILM BURN, SLIDE, PUSH PARALLAX, DIAGONAL WIPE, IRIS, BLINDS, SPLIT, BOUNCE, FLARE SWEEP, CROSS DISSOLVE, DIP HITAM/PUTIH, BLUR DISSOLVE, SPIN SWAP, PIXELATE, TV STATIC, CHROMATIC SLIDE, MOSAIC + **animasi masuk** judul & PART (FADE, RISE UP, TYPEWRITER, TITLE SLAM, NEON FLICKER, TRACKING, GLITCH, WIPE) di cover DAN di video |
| 51 | **AUTO-FIT JUDUL COVER + COVER BERSIH** ⭐v3.12 | **Judul video yang panjang kini MASUK SEMUA di cover**: font otomatis mengecil bertahap (semua 10 layout) sampai seluruh kata judul tercakup — tidak ada lagi kata terpotong; judul pendek tetap sebesar semula. **Tangkapan adegan utk latar cover kini BERSIH**: frame video diambil **tanpa teks overlay video** (judul, label PART/EPISODE, deskripsi, subtitel, watermark, frame neon) — satu-satunya tulisan di cover = judul + part dari PENGATURAN COVER, persis referensi cover pendek |
| 52 | **SLIDER UKURAN TULISAN PART COVER** ⭐v3.13 | Tulisan **PART / EPISODE / EPS / BAGIAN / #** di cover kini **bisa dikecilkan & dibesarkan** sesuai selera: slider **50% – 250%** (normal 100%) di modul 08B. Kotak badge / strip aksen otomatis menyesuaikan agar teks tetap muat (layout Kotak, Sticker, Outline adaptif), berlaku di **ke-10 layout & 10 palet**, pratinjau berubah langsung, hasil ekspor = pratinjau persis |
| 53 | **UKURAN TULISAN PART DI VIDEO** ⭐v3.14 | Tulisan **PART / EPISODE / EPS / BAGIAN / #** yang terbakar **DI DALAM VIDEO** (bumper intro & label pojok, modul 02) kini **bisa dikecilkan & dibesarkan**: slider **50% – 250%** (normal 100%). Garis hias, sub-informasi (SEGMEN x/y · detik, /total) & ke-8 animasi masuk ikut proporsional — pratinjau langsung, ikut terbakar saat ekspor |
| 54 | **BATCH ANTI-GAGAL** ⭐v3.15 | Impor banyak video + ekspor semua sekaligus kini **tahan banting**: (1) metadata video yang lambat terbaca **dimuat ulang otomatis sampai 3×** — tidak ada lagi “GAGAL IMPORT VIDEO” di video ke-2 dst; (2) render yang gagal di tengah jalan **diulang otomatis 1× dengan setelan aman** (paralel 1 · encoder software · tanpa kilat) **tanpa mengulang part yang sudah jadi**; (3) **thumbnail kotak tidak lagi bersaing dengan ekspor** (dulu dekode film ke-3/4/5 utk thumbnail jalan paralel dgn render → RAM & dekoder kewalahan); (4) bersih-bersih memori total antar film + jeda napas; (5) muat metadata kini **anti-macet** (timeout pasti menyelesaikan) & durasi Infinity ditolak; (6) **TERAPKAN KE SEMUA VIDEO** kini menampilkan **N PART/video** bila JUMLAH PART OTOMATIS aktif |
| 55 | **TAMPILAN RAPI — 17 MODUL TERATUR** ⭐v3.16 | Seluruh submenu **dirombak total**: 17 modul berurutan sesuai alur kerja (Media → Preset → Sumber → Teks → Efek → Gerak → Tracking → Musik → Tipografi → Cover → Ekspor → Gabung → Perawatan), **ikon seragam** di tiap judul modul, badge “BARU · vX” & keterangan bertele-tele dihapus; modul yang **tumpang tindih digabung**: BATCH PROSES → KOTAK VIDEO (tambah video & impor massal cukup satu tempat), SAMPUL AUTO → COVER NOVACUT (Studio Sampul satu pintu), tombol MULAI BATCH duplikat dihapus (cukup BATCH EKSPOR) |
| 56 | **PENGATURAN TERSIMPAN (PRESET)** ⭐v3.16 | Menu baru modul 01: **simpan seluruh setelan** (rasio, judul, split, prefix, ukuran/posisi/animasi teks, efek, watermark, neon, ken burns, transisi, musik, backsound, zoom pembicara, subtitel, cover NOVACUT, ekspor/kompres/GPU/kilat/paralel) sebagai **preset bernama** — mulai pekerjaan baru → klik **PAKAI** → semua setelan langsung terpasang persis. Daftar preset tampil rapi dgn tanggal & jumlah setelan; bisa hapus per preset. Tersimpan di aplikasi (localStorage) — **100% offline** |
| 57 | **PERAWATAN & PERFORMA (OPTIMASI + BERSIHKAN CACHE)** ⭐v3.16 | Menu baru modul 16: **OPTIMASI PERFORMA satu klik** — membersihkan memori & cache mesin (lapisan pratinjau, neon, adaptasi encoder, probe kilat), **menguji ulang encoder GPU vs CPU**, melanjutkan thumbnail tertunda, lalu menampilkan **saran setelan tercepat** (mis. akselerasi OTOMATIS saat GPU terdeteksi, aktifkan MODE KILAT, paralel OTOMATIS) yang bisa diterapkan satu klik; **BERSIHKAN CACHE** — menghapus **thumbnail kotak, file sementara transkripsi (whisper tmp), cache tampilan/HTTP aplikasi** + kotak info RAM/CPU/ukuran model AI. Pekerjaan, setelan & model AI TIDAK dihapus — aplikasi kembali fresh & optimal |
| 58 | **PELINDUNG LAYAR HITAM** ⭐v3.17 | Perbaikan besar untuk keluhan "aplikasi jalan beberapa menit lalu layar blank hitam": **proses render/GPU yang crash kini dipulihkan OTOMATIS** — jendela dimuat ulang sendiri dalam ±1 detik + toast pemberitahuan (dulu layar tinggal hitam selamanya); **cache grafis korup dibersihkan otomatis saat aplikasi dimulai** bila sesi sebelumnya mati tak wajar (penyebab layar hitam "menetap"); **watchdog memori JS** membersihkan cache pratinjau sendiri bila memori >2 GB; **MODE AMAN otomatis** (komposit software) bila crash berulang 4× dalam 15 menit; status pelindung tampil di modul 16 PERAWATAN. Tidak ada batas pemakaian — aplikasi tidak dihitung berapa kali dipakai |
| 59 | **AUDIO FILM PANJANG ANTI-CRASH** ⭐v3.17.1 | Perbaikan akar untuk keluhan "masuk menu JUDUL & PART OTOMATIS aplikasi blank lalu restart" (dan layar hitam lama di v3.16): **akar masalah = decode audio penuh film panjang** — AudioBuffer ±21 MB/menit, film 2 jam ≈ 2,5 GB di satu proses render → proses mati (exitCode 133). Kini film >±15 menit **tidak di-decode utuh**: audio dianalisis bertahap lewat **demux MP4 + WebCodecs AudioDecoder per jendela 45 detik** (RAM selalu kecil) — peaks gelombang, RMS AUDIO SEHAT & zoom pembicara tetap jalan; **ekspor RENDER PENUH tetap bersuara asli** per part lewat jendela yang sama; **POTONG LANGSUNG tak berubah**; analisis otomatis menunggu saat video diputar/diekspor (sopan, tak rebutan) |
| 60 | **LOG CRASH PERMANEN + MODE AMAN MANUAL** ⭐v3.17.2 | Jawaban atas "kenapa masih merestar sendiri terus?": **setiap pemulihan otomatis kini TERCATAT PERMANEN ke berkas log** di folder data aplikasi (waktu, alasan crash, kode keluar — dulu hanya di memori & hilang saat aplikasi nyala ulang, jadi penyebabnya tak bisa ditelusuri dari laporan); modul 16 PERAWATAN mendapat **SALIN LOG CRASH** (satu klik → tempel ke pesan laporan), **BUKA FOLDER LOG** & **MODE AMAN SEKARANG** (matikan komposit GPU segera tanpa menunggu 4 crash otomatis) + baris **RIWAYAT KEJADIAN** tersimpan tampil di kotak info; pengaman tambahan: backsound/musik **>160 MB tidak di-decode utuh** (kelas crash yang sama dengan film panjang) |
| 61 | **WATCHDOG HANG DETAK JANTUNG + ANALISIS 2,5× LEBIH CEPAT** ⭐v3.18.0 | Hang beku (jendela macet tapi proses tak mati — dulu TAK tertangani pemulihan otomatis karena event "unresponsive" Chromium tak selalu menyala) kini terdeteksi lewat **detak jantung**: preload mengirim detak tiap 3 dtk; hilang >12 dtk = hang → renderer dipulihkan paksa → jendela dimuat ulang otomatis (jalur SHIELD) & tercatat di log; **jejak diagnostik permanen**: impor (nama · durasi), jalur audio (penuh/JENDELA hemat RAM), putar, ekspor & batch tercatat di log crash — konteks persis tersedia saat melapor; **jendela adaptif**: film >60 mnt dianalisis per jendela 120 dtk → film 188 mnt = 94 jendela (bukan 250), analisis ±2,5× lebih cepat, RAM puncak tetap 1 jendela |
| 62 | **PELINDUNG PUTAR** ⭐v3.19.0 | Jawaban atas "begitu video di import dan di play aplikasi langsung hang, blank dan ngerestar sendiri": pemulihan otomatis v3.18 bekerja, tetapi bila penyebabnya GPU lemah yang beku persis saat MEMUTAR, pemulihan biasa mengulang loop yang sama. Kini status memutar dilaporkan ke pelindung; crash/hang saat memutar dicatat terpisah di log; **kejadian ke-2 dalam 15 menit → MODE AMAN otomatis** (komposit GPU dimatikan, kecepatan render hardware tetap) — restart terlihat paling banyak 1 kali, lalu pemutaran stabil |
| 63 | **PEMUTARAN RINGAN** ⭐v3.20.0 | Akar "hang saat diputar" film panjang (video 4 jam, 5 video) ditemukan: video hanya terlihat lewat `drawImage(video)` ke kanvas **setiap frame** saat memutar — di GPU lemah, panggilan itu menunggu sinkronisasi GPU yang sedang sibuk dekode → thread utama beku → pelindung mengulang loop. Kini saat memutar video tampil **native** (elemen video asli di belakang kanvas overlay transparan — nol drawImage per frame), pratinjau dithrottle 15/24 fps, blur 9:16 per 8 dtk, sorot part O(1); **hang ke-2 di mode aman → MODE PUTARAN HEMAT permanen** |
| 64 | **FORMULA VIDSplit** ⭐v3.21.0 | Laporan "video 3-4 jam masih ngerestar saat di play" dijawab dgn referensi nyata: VidSplit v3.9.2 (aplikasi kembar) terbukti lancar di mesin yang sama. Formula stabilnya diadopsi utuh: **jalur native di SEMUA rasio** (16:9 & 9:16), latar blur 9:16 saat memutar = kanvas mini 90×160 (10 fps) dibesarkan CSS — bukan kanvas penuh 1080×1920, dan **antrean thumbnail kotak video ditahan selagi video diputar** (dulu berdesakan dgn pemutaran). Mode putaran hemat kini hanya memperlambat overlay — jalur native tetap |
| 65 | **ANALISIS AUDIO TERTIB** ⭐v3.22.0 | Tebakan user tepat: aplikasi "ngestar sendiri" saat MENGANALISIS SUARA film panjang — akar sejatinya `Array.shift()` O(n) pada tabel sampel dgn stsc 127.880 entri (file unduhan nyata) = O(nSc²) ≈ 8-16 miliar operasi = thread utama beku 10-60 dtk persis setelah impor → pelindung mematikan aplikasi yang sedang bekerja. Kini: penunjuk indeks O(1) + stsc bulk, watchdog **mengecek respons renderer dulu** (masih menjawab = tidak dipaksa mati), analisis **menunggu 10 dtk tenang** sebelum mulai, pacing 6 ms tiap 64 paket, thumbnail ikut menunda analisis, video utama preload=metadata. Reproduksi sandbox dgn video uji realistis 3,6 jam: sebelum = tak merespons >40 dtk + SIGSEGV; sesudah = jeda maks 58 ms, nol crash |
| 66 | **GAMBAR BERGERAK LAGI** ⭐v3.23.0 | Bug sisa v3.22: waktu berjalan tapi gambar beku (pompa frame kompositor macet di sebagian mesin Windows). Kini: elemen media kembali persis formula VidSplit/v3.21 (preload default) + **PENGAWAS GERAK GAMBAR** penyembuh otomatis — frame diam & waktu maju = pompa macet → kocok halus (seek +0,05 dtk) → visibilitas dinyalakan ulang → jatuh ke jalur kanvas overlay; semua tercatat di log. Diuji dgn sandera counter: 6/6 lulus, nol false-positive |
| 67 | **DETEKTOR PIKSEL** ⭐v3.24.0 | Mekanisme beku kedua dari rekaman layar kawan: decoder maju tapi gambar tak pernah tersaji (penyajian mati di lapisan video Windows; detektor frame v3.23 buta kareno fr selalu maju). Kini pengawas menyampel video ke kanvas 48x27 tiap 2 dtk — piksel diam + fr maju = penyajian mati → tangga: kocok halus → visibilitas → jalur kanvas overlay; pilihan diingat per mesin; log memuat identitas GPU. Diuji dgn video adegan-diam nyata: 8/8 lulus, nol false-positive |
| 68 | **JALUR VIDSPLIT** ⭐v3.25.0 | Akar beku dibedah sebenarnya: kanvas overlay di atas video digambar ulang 15x/dtk walau statik → lapisan video tak pernah naik ke hardware overlay Windows → beku. Kini overlay native digambar HANYA saat isi berubah (uji: 3 gambar/9 dtk, dulu ±135) — video berdiri sendiri persis VidSplit. Plus PENGAWAS LAYAR capturePage (hash piksel jendela sejati) + tangga penyembuhan bersama |
⭐ = fitur baru/upgrade terbaru

## 🔒 100% Offline

- Semua pemrosesan (video, audio, AI) berjalan **lokal di komputer kamu**.
- Model VOCALIS (31–547 MB) hanya diunduh **sekali** saat pemakaian pertama (unduhan bisa lanjut bila terputus), setelah itu **permanen offline** (`%APPDATA%/KINOSTRA/whisper`).
- Tidak ada data yang dikirim ke server manapun.

## 📥 Install

Pilih salah satu:

| Paket | Ukuran | Cocok untuk |
|-------|--------|-------------|
| `KINOSTRA-Setup-3.15.0.exe` | ±91 MB | Install permanen (Start Menu + shortcut desktop + uninstaller) |
| `KINOSTRA-Portable-3.15.0-win64.zip` | ±126 MB | Jalan tanpa install, bisa dibawa di flashdisk |

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
