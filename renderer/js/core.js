/* ================================================================
   KINOSTRA DESKTOP — core.js
   Helper global, state utama, modal/toast, simpan ke disk
   ================================================================ */
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmtT = t => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = t % 60; return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`; };
const fmtMB = b => (b / 1048576).toFixed(1) + ' MB';
const slug = s => (s || 'VIDEO').trim().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').toUpperCase() || 'VIDEO';
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const QUAL = {
  max: { br: 12e6, label: 'MAKSIMAL 12 Mbps' },
  balanced: { br: 6e6, label: 'SEIMBANG 6 Mbps' },
  compressed: { br: 2.5e6, label: 'HEMAT 2.5 Mbps' },
  ultra: { br: 1e6, label: 'ULTRA HEMAT 1 Mbps' }
};
/* v3.4: KATALOG RESOLUSI OUTPUT — pilihan tetap 720p / 1080p / 2K / 4K.
   Dipakai bila state.resOut diisi (chip RESOLUSI OUTPUT modul 09).
   Rasio 9:16 otomatis membalik W↔H (1080p vertikal = 1080×1920 dst).
   Bitrate mengikuti luas piksel (lihat exportBitrate di exporter.js). */
const RESOUTS = {
  '720': { W: 1280, H: 720, n: '720p HD', d: '1280×720' },
  '1080': { W: 1920, H: 1080, n: '1080p FULL HD', d: '1920×1080' },
  '1440': { W: 2560, H: 1440, n: '2K QHD', d: '2560×1440' },
  '2160': { W: 3840, H: 2160, n: '4K ULTRA HD', d: '3840×2160' }
};
/* v2.12: katalog gaya frame (tampil sebagai chip di modul 08) */
const FRAMESTYLES = [
  { k: 'off', n: 'TANPA FRAME', d: 'Video polos tanpa hiasan' },
  { k: 'neon', n: 'NEON BERPUTAR', d: 'Garis neon keliling · berputar otomatis (v2.8)' },
  { k: 'bioskop', n: 'BIOSKOP', d: 'Tirai merah · lampu bioskop berkelip · film & popcorn' },
  { k: 'merahputih', n: 'MERAH PUTIH', d: 'Bingkai emas · awan putih · pita bendera' },
  { k: 'kayu', n: 'KAYU & BUNGA', d: 'Papan kayu · daun hijau · bunga matahari' },
  { k: 'gelombang', n: 'GELOMBANG WARNA', d: 'Gelombang merah-kuning-pink yang mengalir' },
  { k: 'elegan', n: 'PUTIH ELEGAN', d: 'Latar gading · ornamen jingga melengkung' },
  { k: 'awan', n: 'AWAN BIRU', d: 'Awan biru berlapis · matahari · gaya LIVE REPORT' },
  { k: 'panel', n: 'PANEL BIRU', d: 'Panel putih bulat di atas biru cerah' },
  { k: 'gradien', n: 'GRADIEN TIPIS', d: 'Garis gradien minimalis hijau-pink-oranye' },
  /* v2.16: 12 FRAME KHUSUS — papan judul bertuliskan tema TETAP di atas:
     6 frame HOROR (tulisan "HOROR ALAMGAIB") + 6 frame KOPLO
     (tulisan "DANGDUT IDOLADESA"). g = grup chip di menu. */
  { k: 'hororhutan', n: 'HOROR · HUTAN MISTIS', d: 'Hutan gelap berkabut · roh hijau melayang · HOROR ALAMGAIB', g: 'HOROR ALAMGAIB' },
  { k: 'hororkuburan', n: 'HOROR · KUBURAN', d: 'Bulan purnama · nisan & pohon mati · kelelawar · HOROR ALAMGAIB', g: 'HOROR ALAMGAIB' },
  { k: 'hororrumah', n: 'HOROR · RUMAH BERHANTU', d: 'Rumah tua angker · jendela berkedip · pagar patah · HOROR ALAMGAIB', g: 'HOROR ALAMGAIB' },
  { k: 'horordarah', n: 'HOROR · DARAH KUTUKAN', d: 'Tetesan darah menetes · tengkorak · merah gelap · HOROR ALAMGAIB', g: 'HOROR ALAMGAIB' },
  { k: 'hororhantu', n: 'HOROR · JEJAK HANTU', d: 'Hantu putih melayang · uap ectoplasm biru · HOROR ALAMGAIB', g: 'HOROR ALAMGAIB' },
  { k: 'hororlilin', n: 'HOROR · LILIN MALAM', d: 'Lilin berkedip · tengkorak · lingkar ritual · HOROR ALAMGAIB', g: 'HOROR ALAMGAIB' },
  { k: 'koplopanggung', n: 'KOPLO · PANGGUNG', d: 'Tirai panggung emas · lampu sorot berputar · speaker · DANGDUT IDOLADESA', g: 'DANGDUT IDOLADESA' },
  { k: 'koplogendang', n: 'KOPLO · GENDANG', d: 'Kendang & gong emas · terompet · denyut koplo · DANGDUT IDOLADESA', g: 'DANGDUT IDOLADESA' },
  { k: 'koplogliter', n: 'KOPLO · GLITER EMAS', d: 'Emas berkilau berjatuhan · catatan musik · DANGDUT IDOLADESA', g: 'DANGDUT IDOLADESA' },
  { k: 'koploneon', n: 'KOPLO · NEON DISKO', d: 'Neon pink-biru · bola disko berputar · DANGDUT IDOLADESA', g: 'DANGDUT IDOLADESA' },
  { k: 'koploobor', n: 'KOPLO · OBOR DESA', d: 'Obor kampung menyala · umbul bendera · kembang merah · DANGDUT IDOLADESA', g: 'DANGDUT IDOLADESA' },
  { k: 'koplokipas', n: 'KOPLO · KIPAS GLITER', d: 'Kipas penari mengembang · sequin berkilau · DANGDUT IDOLADESA', g: 'DANGDUT IDOLADESA' },
  /* v3.0: 6 FRAME ALAM GAIB — horor Indonesia paling menyeramkan,
     papan judul bertuliskan "ALAM GAIB" tetap di bagian atas frame */
  { k: 'gaibpocong', n: 'GAIB · POCONG KEBUN', d: 'Pocong melompat · kuburan gelap · kabut dingin · ALAM GAIB', g: 'ALAM GAIB' },
  { k: 'gaibtuyul', n: 'GAIB · TUYUL BERINGIN', d: 'Beringin tua · tuyul di dahan · koin jatuhan · ALAM GAIB', g: 'ALAM GAIB' },
  { k: 'gaibkunti', n: 'GAIB · KUNTILANAK', d: 'Sosok putih berambut panjang · melati berjatuhan · ALAM GAIB', g: 'ALAM GAIB' },
  { k: 'gaibsanggah', n: 'GAIB · API SANGGAH', d: 'Api ritual menyala · perapian batu · asap misterius · ALAM GAIB', g: 'ALAM GAIB' },
  { k: 'gaibmakam', n: 'GAIB · KABUT MAKAM', d: 'Kabut pekat · nisan tua · cahaya samar merambat · ALAM GAIB', g: 'ALAM GAIB' },
  { k: 'gaibritual', n: 'GAIB · RITUAL TENGAH MALAM', d: 'Lingkar lilin ungu · mantera berputar · jam 12 malam · ALAM GAIB', g: 'ALAM GAIB' }
];

/* v3.0: KATALOG FILTER WARNA — satu klik mengganti nuansa seluruh video.
   css  = string canvas ctx.filter (dipakai saat menggambar video),
   tint = lapisan warna tipis di atas video (opsional) + mode campur.
   Semua diterapkan DI pipeline canvas → preview & ekspor identik. */
const COLORFILTERS = [
  { k: 'off', n: 'NORMAL', d: 'Warna asli videomu', css: '', tint: null },
  { k: 'horor', n: 'HOROR MISTIS', d: 'Dingin kehijauan · seram', css: 'saturate(.72) contrast(1.13) brightness(.93) hue-rotate(-12deg)', tint: 'rgba(90,255,170,.07)', op: 'overlay' },
  { k: 'dangdut', n: 'DANGDUT EMAS', d: 'Hangat keemasan pesta', css: 'saturate(1.32) contrast(1.06) brightness(1.04) sepia(.16)', tint: 'rgba(255,190,60,.06)', op: 'soft-light' },
  { k: 'teal', n: 'SINEMA TEAL-ORANGE', d: 'Warna film Hollywood', css: 'contrast(1.14) saturate(1.16)', tint: 'rgba(0,140,255,.08)', op: 'soft-light' },
  { k: 'noir', n: 'NOIR HITAM-PUTIH', d: 'Monokrim klasik tegas', css: 'grayscale(1) contrast(1.24) brightness(1.02)', tint: null },
  { k: 'vintage', n: 'VINTAGE 80-an', d: 'Pudar hangat nostalgia', css: 'sepia(.42) contrast(.94) brightness(1.05) saturate(.85)', tint: 'rgba(255,170,90,.05)', op: 'soft-light' },
  { k: 'vivid', n: 'VIVID TAJAM', d: 'Warna pekat berani', css: 'saturate(1.45) contrast(1.1)', tint: null },
  { k: 'dingin', n: 'DINGIN BIRU', d: 'Nuansa malam sejuk', css: 'hue-rotate(14deg) saturate(.92) brightness(.98)', tint: 'rgba(60,120,255,.07)', op: 'overlay' },
  { k: 'pucat', n: 'PUCAT MIMPI', d: 'Lembut terang fantasi', css: 'saturate(.6) brightness(1.12) contrast(.92)', tint: 'rgba(255,220,240,.06)', op: 'soft-light' },
  { k: 'seram', n: 'SERAM MERAH', d: 'Darah & bayangan gelap', css: 'saturate(.82) contrast(1.28) brightness(.9)', tint: 'rgba(255,20,40,.08)', op: 'overlay' }
];
const FONTS = [
  { n: 'Cinzel', d: 'TRAJAN · GLADIATOR / TROY' },
  { n: 'Bebas Neue', d: 'KONDENSI POSTER · HOLLYWOOD' },
  { n: 'Anton', d: 'ULTRA BOLD · POSTER AKSI' },
  { n: 'Oswald', d: 'KONDENSI NETRAL · TRAILER' },
  { n: 'Montserrat', d: 'GOTHAM-LIKE · THE DARK KNIGHT' },
  { n: 'Jost', d: 'FUTURA · 2001: A SPACE ODYSSEY' },
  { n: 'Playfair Display', d: 'DIDOT SERIF · DRAMA PERIODE' },
  { n: 'Orbitron', d: 'SCI-FI GEOMETRIS · DUNE UI' },
  { n: 'Michroma', d: 'EUROSTILE/BANK GOTHIC · ALIEN' },
  { n: 'Cormorant Garamond', d: 'GARAMOND ELEGAN · ARTHA DRAMA' }
];
const TRACKCOLORS = ['#F7A600', '#3EE6C1', '#FF4FA3', '#9BE15D'];
/* v2.8: palet frame neon — key 'rainbow' = warna mengikuti putaran */
const NEONCOLORS = [
  ['CYAN', '#2EE6FF'], ['AMBER', '#F7A600'], ['MAGENTA', '#FF4FA3'],
  ['HIJAU', '#9BE15D'], ['BIRU', '#4D7CFF'], ['PUTIH', '#F5F3ED'],
  ['RAINBOW', 'rainbow']
];

const state = {
  file: null, duration: 0, isAudio: false, audioBuffer: null, peaks: null,
  title: '', titleOn: true, autoTitle: true, desc: '', descOn: true, descPos: 'under',
  titleSize: 40,                           /* v2.3: ukuran font judul default 40 */
  ratio: '16:9', bgMode: 'blur',
  /* UPGRADE v2.1: zoom & geser fokus (mode 9:16) */
  frame: { zoom: 1, panX: 0, panY: 0 },
  splitSec: 30, splitCustom: false, partPrefix: 'PART', partShow: 'intro',
  /* v3.2: JUMLAH PART OTOMATIS — isi N → durasi per part = durasi video / N
     (0 = mati; dihitung ulang otomatis tiap video baru dimuat) */
  splitParts: 0,
  /* v2.6: posisi teks bisa digeser (−1..1, 0 = posisi default) */
  titlePosY: 0, partPosX: 0, partPosY: 0,
  font: 'Bebas Neue', titleScale: 1, subScale: 1, upper: true,
  subs: [], subsOn: true, subTarget: 'src',
  /* v2.5: posisi vertikal subtitel (0.45=tengah … 0.97=bawah; default 0.90) */
  subPosY: 0.9,
  trackMode: false,
  track: { active: false, points: [], tpl: null, tpl0: null, tw: 30, th: 30, stats: null, label: 'TARGET 01', color: '#F7A600', vx: 0, vy: 0, scale: 1, lost: 0 },
  music: { buffer: null, mood: 'epic', intensity: 0.6, gain: 0.6, seed: (Math.random() * 1e9) | 0 },
  /* v3.3: BACKSOUND MP3 SENDIRI — file audio pilihan user (loop di belakang
     suara asli, volume manual). on = dipakai saat ekspor & pratinjau. */
  bsound: { on: true, buffer: null, gain: 0.35, name: '' },
  audioGain: 0.9, quality: 'balanced', scale: 1, fps: 30,
  /* UPGRADE v2.1: jumlah render paralel (0 = otomatis) */
  parallel: 0,
  /* v2.14: AKSELERASI EKSPOR — auto (uji kecepatan GPU vs CPU, pilih
     terkencang) | gpu (paksa encoder hardware) | cpu (paksa software) */
  acc: 'auto',
  /* v3.6: COVER VIDEO PEMBUKA — gambar pembuka yang tampil beberapa detik
     (default 2) di awal SETIAP file hasil EKSPORT & SPLIT MP4, BATCH EKSPOR
     & GABUNG VIDEO. Sumber: impor manual (pickCover) atau dibuat langsung
     lewat STUDIO SAMPUL. img = HTMLImageElement dari dataUrl. Setelan
     GLOBAL semua video — dipakai ulang tiap video berikutnya. */
  cover: { on: false, dataUrl: null, name: '', img: null, dur: 2 },
  /* v3.4: RESOLUSI OUTPUT TETAP — '720' | '1080' | '1440' | '2160' (kunci
     RESOUTS) | '' = AUTO (mengikuti SKALA RESOLUSI 100/75/50%, perilaku lama).
     Setelan GLOBAL: berlaku untuk EKSPORT & SPLIT MP4, BATCH EKSPOR (semua
     video di kotak) & GABUNG VIDEO — dipakai ulang tiap video berikutnya. */
  resOut: '',
  /* UPGRADE: efek visual & watermark */
  vfx: { bright: 1, contrast: 1, saturate: 1, vignette: false, grain: false },
  wm: { mode: 'off', text: '@KINOSTRA', img: null, imgName: '', pos: 'br', opacity: 0.6, scale: 1 },
  /* v2.8: FRAME NEON BERPUTAR — garis neon mengelilingi pinggir video,
     terus berputar otomatis, berlaku untuk rasio 9:16 & 16:9 */
  neon: { on: false, color: '#2EE6FF', width: 7, speed: 1, dual: true },
  /* v2.9: WAKTU MULAI & BERHENTI EKSPOR (detik; 0 = awal / sampai habis) */
  rangeStart: 0, rangeEnd: 0,
  /* v2.9: preset TERAPKAN KE SEMUA VIDEO — detik mulai utk semua video
     di kotak (null = mati). Durasi split mengikuti state.splitSec global */
  applyAllStart: null,
  /* v2.12: GAYA FRAME VIDEO — 'off' | 'neon' (garis berputar, state.neon)
     | bioskop | merahputih | kayu | gelombang | elegan | awan | panel | gradien */
  frameStyle: 'off',
  /* v2.12: KEN BURNS — perbesar perlahan / geser otomatis per part
     mode: off | in | out | panx | pany · strength 0.05..0.6 */
  kb: { mode: 'off', strength: 0.3 },
  /* v2.12: TRANSISI ANTAR BAGIAN — fade | slide | off · durasi detik */
  trans: { mode: 'off', dur: 0.8 },
  /* v2.12: KECEPATAN VIDEO global semua part (0.5 = pelan, 2 = cepat) */
  speed: 1,
  /* v2.12: HAPUS BAGIAN — daftar rentang yang dibuang saat ekspor [{s,e}] */
  cuts: [],
  /* v3.0: FILTER WARNA — kunci COLORFILTERS (default 'off') */
  colorFilter: 'off',
  /* v3.0: SPLIT MODE — 'dur' (per durasi) | 'scene' (per adegan terdeteksi) */
  splitMode: 'dur',
  sceneCuts: [],            /* daftar titik pergantian adegan (detik) */
  /* v3.0: KOMPRES PINTAR — target ukuran per part (MB; 0 = mati) */
  targetMB: 0,
  /* v3.0: AUDIO SEHAT — normalizer loudness + filter desis/brum */
  audioFix: { on: false, hiss: false },
  audioRms: 0,              /* RMS audio aktif (cache; 0 = belum diukur) */
  /* v3.0: TTS NARASI — suara AI offline (buffer null = belum tersusun) */
  tts: { buffer: null, at: 0, gain: 0.9, text: '', ready: false },
  /* v3.0: EKSPOR — lanjutkan batch/part (lewati part yang sudah ada) */
  resumeExport: true,
  /* v3.0: BATCH PRO — matikan PC otomatis setelah batch selesai */
  autoShutdown: false,
  /* v3.0: GABUNG VIDEO — internum (matikan label PART saat merge) */
  _noPart: false,
  /* v3.1: ZOOM PEMBICARA — kamera otomatis mengikuti orang yang bicara.
     on/speed/silence/auto = SETELAN GLOBAL (berlaku semua video);
     ready/timeline/tracks/epoch = hasil analisis PER VIDEO. */
  spk: {
    on: false,             /* fitur aktif */
    ready: false,          /* analisis selesai utk video aktif */
    scanning: false,       /* analisis sedang berjalan */
    speed: 'normal',       /* cepat | normal | lambat — delay pindah fokus */
    trans: 'geser',        /* v3.5: cara perpindahan fokus — geser | fade | langsung */
    silence: 'hold',       /* hold = tetap di pembicara terakhir | wide = tampilkan semua */
    auto: true,            /* analisis otomatis saat ekspor bila belum dianalisis */
    nSpeak: 0,             /* jumlah pembicara terdeteksi */
    timeline: [],          /* [{t0,t1,idx}] idx = indeks pembicara, -1 = tampil semua */
    tracks: [],            /* [{id,label,samples:[{t,x,y,w,h,m}]}] kotak ternormalisasi */
    epoch: -1              /* mediaEpoch saat analisis */
  },
  /* UPGRADE: batch */
  batch: [],
  busy: false, abort: false, scanAbort: false,
  /* v2.10: kegagalan internal ekspor (bukan batal pengguna) — dipisah agar
     batch bisa lanjut ke video berikutnya saat satu video gagal */
  exportFatal: null
};

const videoEl = $('#vid'), cv = $('#cv'), ctx = cv.getContext('2d');
const stage = $('#stage'), stageWrap = $('#stagewrap');

/* ---------- TOAST & MODAL ---------- */
function toast(msg, type = 'info') {
  const d = document.createElement('div'); d.className = 'toast ' + type; d.textContent = msg;
  $('#toasts').appendChild(d); setTimeout(() => { d.style.opacity = '0'; d.style.transition = '.4s'; setTimeout(() => d.remove(), 400); }, 4200);
}
const M = { el: $('#modal'), t: $('#mTitle'), b: $('#mBody'), bar: $('#mBar'), f: $('#mFill'), s: $('#mSub'), c: $('#mCancel'), x: $('#mClose'), onCancel: null };
function showModal({ title, sub = '', cancel = false, onCancel = null, body = null }) {
  M.t.textContent = title; M.s.textContent = sub; M.onCancel = onCancel;
  M.c.style.display = cancel ? '' : 'none';
  M.c.textContent = 'BATAL';
  if (body != null) { M.b.hidden = false; M.b.innerHTML = body; M.bar.style.display = 'none'; }
  else { M.b.hidden = true; M.bar.style.display = ''; }
  M.f.style.width = '0%'; M.el.classList.remove('hidden');
}
function setProg(p) { M.f.style.width = (clamp(p, 0, 1) * 100).toFixed(1) + '%'; }
function setSub(s) { M.s.textContent = s; }
function hideModal() { M.el.classList.add('hidden'); M.onCancel = null; }
M.c.onclick = () => { if (M.onCancel) M.onCancel(); else hideModal(); };
/* v2.7: MODAL SELALU BISA DITUTUP — dulu pop-up hasil ekspor tanpa tombol
   close membuat aplikasi tidak bisa dipakai. Sekarang 3 jalan keluar:
   1) tombol × di header (selalu tampil) — saat proses berjalan berfungsi
      seperti BATAL, saat pop-up info langsung menutup
   2) tombol ESC di keyboard
   3) klik area gelap di luar kotak (hanya utk pop-up info, bukan proses —
      agar render yang berjalan lama tidak terbatalkan tak sengaja) */
M.x.onclick = () => { if (M.onCancel) M.onCancel(); hideModal(); };
window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !M.el.classList.contains('hidden')) {
    if (M.onCancel) M.onCancel(); else hideModal();
  }
});
M.el.addEventListener('pointerdown', e => { if (e.target === M.el && !M.onCancel) hideModal(); });

/* ---------- WEB AUDIO CONTEXT ---------- */
let _actx = null;
const getActx = () => _actx || (_actx = new (window.AudioContext || window.webkitAudioContext)());

/* ---------- PENYIMPANAN DESKTOP (streaming ke disk) ---------- */
async function saveBlobToDir(blob, dir, fileName) {
  const { id, path: finalPath } = await window.kinostra.beginWrite(dir, fileName);
  try {
    const CHUNK = 8 * 1024 * 1024; // 8 MB
    const arr = new Uint8Array(await blob.arrayBuffer());
    for (let off = 0; off < arr.length; off += CHUNK) {
      await window.kinostra.writeChunk(id, arr.subarray(off, Math.min(off + CHUNK, arr.length)));
    }
    const res = await window.kinostra.endWrite(id);
    return res; // { path, size }
  } catch (e) {
    try { await window.kinostra.abortWrite(id); } catch (_) { }
    throw e;
  }
}

/* v2.1: tulis ArrayBuffer LANGSUNG (tanpa Blob — hindari spill blob storage,
   lebih cepat & hemat memori untuk file MP4 hasil muxer)
   v2.5: dukung onProgress(written, total) — dipakai watchdog ekspor agar
   penulisan disk yang lambat (USB/HDD) tidak dianggap macet */
async function saveBufferToDir(buffer, dir, fileName, onProgress) {
  const { id, path: finalPath } = await window.kinostra.beginWrite(dir, fileName);
  try {
    const CHUNK = 8 * 1024 * 1024; // 8 MB
    const arr = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    for (let off = 0; off < arr.length; off += CHUNK) {
      await window.kinostra.writeChunk(id, arr.subarray(off, Math.min(off + CHUNK, arr.length)));
      onProgress && onProgress(Math.min(arr.length, off + CHUNK), arr.length);
    }
    const res = await window.kinostra.endWrite(id);
    return res; // { path, size }
  } catch (e) {
    try { await window.kinostra.abortWrite(id); } catch (_) { }
    throw e;
  }
}

/* ---------- SIMPAN TEKS (SRT) — dialog simpan via fallback anchor ----------
   SRT kecil: tulis via stream ke folder output terakhir, atau unduh biasa */
let _lastOutDir = null;
async function saveTextFile(text, defaultName) {
  const dir = _lastOutDir || await window.kinostra.pickOutputDir();
  if (!dir) return null;
  _lastOutDir = dir;
  return await saveBlobToDir(new Blob([text], { type: 'text/plain;charset=utf-8' }), dir, defaultName);
}

/* ---------- BOOT ---------- */
window.addEventListener('load', () => {
  if (window.lucide) lucide.createIcons();
  setTimeout(() => { $('#boot').classList.add('off'); setTimeout(() => { const b = $('#boot'); if (b) b.remove(); }, 900); }, 1000);
});
