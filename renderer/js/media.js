/* ================================================================
   KINOSTRA DESKTOP — media.js
   Impor media (dialog / drag-drop), probe metadata, decode audio,
   dimensi output & segmen split, seek presisi
   ================================================================ */
'use strict';

/* ---------- IMPOR (v2.3: massal sampai 100 video + proses berurutan otomatis) ---------- */
$('#btnImport').onclick = async () => {
  const paths = await window.kinostra.openMedia();
  if (!paths || !paths.length) return;
  const n = addBatchPaths(paths, 'impor');
  if (!maybeAutoBatch(n)) loadFromPath(paths[0]);
};
$('#fileInput').onchange = e => { if (e.target.files[0]) loadFileBlob(e.target.files[0]); e.target.value = ''; };

['dragover', 'dragenter'].forEach(ev => window.addEventListener(ev, e => { e.preventDefault(); document.body.classList.add('dropping'); }));
['dragleave', 'drop'].forEach(ev => window.addEventListener(ev, e => { e.preventDefault(); if (ev === 'drop' || e.target === document.body) document.body.classList.remove('dropping'); }));
window.addEventListener('drop', e => {
  e.preventDefault(); document.body.classList.remove('dropping');
  const files = [...e.dataTransfer.files].filter(f => /video|audio/.test(f.type) || /\.(mp4|mkv|ts|webm|mp3|m4a|aac|wav|ogg|flac|mov)$/i.test(f.name));
  if (!files.length) return;
  /* v2.2: semua file yang di-drop juga masuk KOTAK VIDEO */
  const ps = files.map(f => f.path).filter(Boolean);
  if (ps.length) {
    const n = addBatchPaths(ps, 'drop');
    if (!maybeAutoBatch(n)) loadFromPath(ps[0]);
  } else {
    loadFileBlob(files[0]);   /* file tanpa path (jarang di desktop) */
  }
});

/* ---------- MEMUAT DARI PATH (desktop dialog) ----------
   v2.6: STREAMING via protokol kfile:// (Range request) — file TIDAK
   dibaca utuh ke memori lagi. Video 2 GB pun tampil & berjudul
   hampir instan; dulu harus menunggu seluruh file disalin via IPC. */
async function loadFromPath(p, force = false) {
  try {
    const name = p.split(/[\\/]/).pop();
    let size = 0;
    try { const st = await window.kinostra.stat(p); if (st && st.ok) size = st.size; } catch (e) { }
    const vf = { name, path: p, size, virtual: true, kurl: kfileURL(p) };
    await loadFileBlob(vf, force);
  } catch (e) {
    toast('Gagal membuka file: ' + e.message, 'err');
  }
}

/* v2.6: judul bersih dari nama file (dipakai loadFileBlob & modul 02) */
function fileBaseTitle(name) {
  return (name || 'VIDEO').replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\b\p{Ll}/gu, c => c.toUpperCase());
}

/* ---------- MEMUAT FILE (Blob / deskriptor virtual + nama) ----------
   v2.6:
   - JUDUL dari nama file dipasang PALING AWAL (sebelum metadata &
     decode audio) → muncul instan, tidak menunggu decode lagi.
   - file virtual (kfile://) diputar streaming dari disk.
   - decode audio video TIDAK menahan loading (jalan di belakang). */
async function loadFileBlob(file, force = false) {
  if (state.busy && !force) { toast('Tunggu proses lain selesai', 'warn'); return; }
  file.name = file.name || 'media.mp4';
  const isVirtual = !!file.virtual;
  stopMusicPreview();
  state.mediaEpoch = (state.mediaEpoch || 0) + 1;   /* v2.2: invalidasi cache lapisan komposisi */
  // reset
  /* v2.12: potongan bersifat per-video — bersihkan saat ganti media */
  Object.assign(state, { subs: [], peaks: null, cuts: [], rangeStart: 0, rangeEnd: 0, sceneCuts: [] });
  /* v3.1: hasil analisis ZOOM PEMBICARA juga per-video — setelan global
     (on/speed/silence/auto) tetap terbawa ke video berikutnya */
  state.spk.ready = false; state.spk.scanning = false; state.spk.timeline = [];
  state.spk.tracks = []; state.spk.nSpeak = 0; state.spk.epoch = -1;
  state.track = { active: false, points: [], tpl: null, tpl0: null, tw: 30, th: 30, stats: null, label: state.track.label, color: state.track.color, vx: 0, vy: 0, scale: 1, lost: 0 };
  $('#trackStat').textContent = '0 titik terlacak';
  state.file = file;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  state.isAudio = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(ext);
  /* v2.6: JUDUL LANGSUNG — instan dari nama file */
  if (state.autoTitle) {
    state.title = fileBaseTitle(file.name);
    $('#inTitle').value = state.title;
    updateAll();
  }
  $('#fName').textContent = file.name;
  $('#fSize').textContent = file.size ? fmtMB(file.size) : '—';
  $('#fFmt').textContent = ext.toUpperCase();
  $('#hudName').textContent = file.name.slice(0, 42).toUpperCase();
  $('#emptyMsg').style.display = 'none';
  const url = isVirtual ? file.kurl : URL.createObjectURL(file);
  /* v3.17: lepaskan blob URL film sebelumnya — dulu setiap impor file
     (dialog) meninggalkan satu object URL menggantung selamanya;
     kecil, tetapi menumpuk sepanjang sesi panjang. */
  try { if (window._kinoMediaURL && window._kinoMediaURL !== url) URL.revokeObjectURL(window._kinoMediaURL); } catch (e) { }
  window._kinoMediaURL = isVirtual ? null : url;
  videoEl.srcObject = null; videoEl.src = url;
  /* v3.1: ANTIANTRIAN META — bila metadata terbaca tapi DURASI TIDAK MASUK
     AKAL (mis. 0.1 dtk utk file ratusan KB — balasan decoder/kfile kadang
     terpotong di headless/disk lambat), muat ULANG sekali. Dulu durasi
     sampah mengalir ke segments() → ekspor "berhasil" berisi 4 frame.
     v3.15 FIX "GAGAL IMPORT VIDEO DI VIDEO KE-2 DST (BATCH)":
     - dulu bila metadata tak pernah datang & readyState < 1, promise ini
       TIDAK PERNAH selesai (timeout hanya men-resolve bila readyState>=1)
       → batch macet tanpa pesan. Kini timeout WAJIB menyelesaikan promise
       (resolve bila ada metadata, REJECT bila tidak).
     - dulu durasi NaN/0 LANGSUNG dianggap gagal ("durasi tidak terbaca —
       format tak didukung engine" → ditandai GAGAL IMPORT di kotak) tanpa
       muat ulang; v3.1 hanya menangani 0<d<0.5 dtk. Kini muat ULANG hingga
       3× (timeout naik 4/7/11 dtk — file besar di disk lambat butuh waktu)
       sebelum menyerah; durasi Infinity juga ditolak.
     - mediaEpoch dinaikkan tiap buka-ulang → semua cache komposisi valid. */
  const awaitMeta = tm => new Promise((res, rej) => {
    const ok = () => { clean(); res(); }, bad = () => { clean(); rej(new Error('meta error')); };
    const clean = () => { videoEl.removeEventListener('loadedmetadata', ok); videoEl.removeEventListener('error', bad); clearTimeout(tmId); };
    const tmId = setTimeout(() => {
      if (videoEl.readyState >= 1) ok();
      else { clean(); rej(new Error('meta lambat')); }
    }, tm);
    videoEl.addEventListener('loadedmetadata', ok); videoEl.addEventListener('error', bad);
  });
  const durMasukAkal = () => {
    const d = videoEl.duration;
    return isFinite(d) && d > 0 && !(d < 0.5 && (file.size || 0) > 200 * 1024);
  };
  try {
    for (let coba = 1; coba <= 3; coba++) {
      try {
        await awaitMeta(coba === 1 ? 4000 : coba === 2 ? 7000 : 11000);
        if (durMasukAkal()) break;
        if (coba < 3) {
          console.warn(`metadata durasi tidak masuk akal (${videoEl.duration}) — buka ulang (${coba}/3)`);
          videoEl.src = url; state.mediaEpoch = (state.mediaEpoch || 0) + 1;
        }
      } catch (e) {
        if (coba < 3) {
          console.warn(`metadata tidak datang (${e.message}) — buka ulang (${coba}/3)`);
          videoEl.src = url; state.mediaEpoch = (state.mediaEpoch || 0) + 1;
        } else throw e;
      }
    }
  } catch (e) {
    /* v2.10: muat gagal → bersihkan state agar pemanggil (terutama BATCH)
       tahu video ini TIDAK termuat. Dulu file & durasi lama tetap terpasang,
       batch lalu "mengekspor" video rusak memakai durasi video sebelumnya. */
    state.file = null; state.duration = 0; state.audioBuffer = null;
    toast(`Video tidak bisa dibaca engine (${file.name}) — coba konversi ke MP4/H.264`, 'err');
    $('#hudName').textContent = 'FORMAT TAK DIDUKUNG'; return;
  }
  /* v3.25: reset penyembuh gambar per video. Jika mesin ini pernah terbukti
     penyajiannya macet (flag tersimpan) DAN native sudah dicoba sekali pada
     sesi ini → langsung jalur kanvas; sesi baru tetap mencoba native sekali
     (driver bisa saja membaik). Seek terkendali 0,04 dtk tetap dipakai utk
     memicu dekode frame pratinjau pertama. */
  state._forceCanvasPlay = (localStorage.getItem('kinostra.canvasPlay') === '1' && window.__nativeTriedOnce) ? true : false;
  _frStreak = 0; _frLast = -1; _pxLast = -1; _layarLast = '';
  try {
    if (!state.isAudio && videoEl.readyState >= 1 && videoEl.paused && isFinite(videoEl.duration) && videoEl.duration > 0) {
      videoEl.currentTime = Math.min(0.04, videoEl.duration * 0.001);
    }
  } catch (e) { }
  if (state.isAudio) {
    state.duration = await new Promise(async res => {
      await decodeFileAudio(); res(state.audioBuffer ? state.audioBuffer.duration : videoEl.duration || 0);
    });
    if (state.audioBuffer) buildPeaks();
  } else {
    state.duration = videoEl.duration || 0;
    /* v2.6: decode audio asli jalan DI BELAKANG — loading tidak menunggu;
       ekspor otomatis menunggu lewat state.audioReady */
    state.audioReady = decodeFileAudio();
  }
  $('#fDur').textContent = fmtT(state.duration);
  $('#fRes').textContent = state.isAudio ? 'AUDIO ONLY' : `${videoEl.videoWidth}×${videoEl.videoHeight}`;
  /* v3.2: bila JUMLAH PART aktif → hitung ulang durasi per part utk video ini */
  applySplitParts();
  syncTInfoSplit();
  /* v2.9: terapkan preset TERAPKAN-KE-SEMUA (bila aktif) ke video yang baru dimuat,
     lalu segarkan input waktu mulai/berhenti di modul 02 */
  applyRangePreset(); syncRangeInputs();
  if (typeof renderCutList === 'function') renderCutList();   /* v2.12: kosongkan daftar potongan */
  renderTimeline(); updateAll();
  try { window.kinostra.noteCrash(`impor: ${(file.name || '').slice(0, 80)} · ${Math.round(state.duration || 0)} dtk`); } catch (e) { }
  toast(`Dimuat: ${file.name}`, 'ok');
}

async function decodeFileAudio() {
  if (!state.file) return;
  try {
    /* v2.15: lepaskan buffer audio film LAMA lebih dulu — decode film 60 mnt
       butuh ArrayBuffer ±2 GB + hasil decode ±1.4 GB; bila buffer lama masih
       dipegang saat decode baru jalan, puncak RAM jadi dua kali lipat dan
       batch film ke-3 ke atas kehabisan memori fisik */
    state.audioBuffer = null; state.peaks = null;
    state._audioDemux = null; state._audioEnv = null; state._audioWin = null;
    state.audioSenyap = false;                     /* v3.31: pemindai audio senyap per video */
    state._audioSeg = null;                        /* v3.32: segmen audio ekspor video LAMA tidak boleh bocor */
    /* v3.17.1 PERBAIKAN LAYAR HITAM/CRASH SETELAH IMPOR — akar masalah:
       decodeAudioData penuh film panjang = AudioBuffer float stereo
       ±21 MB/menit (film 2 jam ≈ 2,5 GB; film 188 mnt ≈ 4 GB) di SATU
       proses render → alokasi gagal → proses render mati (exitCode 133)
       → layar hitam (v3.16) / blank + pulih (v3.17). Terbukti lewat uji
       terpandu: alur terberat yang selalu crash → NOL crash ketika
       decode penuh dilewati. Decode lewat OfflineAudioContext 16 kHz
       JUGA crash (buffer laju penuh tetap terwujud di dalam).
       Solusi: ≤±15 mnt = decode penuh (perilaku lama, berkualitas penuh);
       di atas itu = TIDAK ada decode utuh sama sekali. Sebagai gantinya
       audio dianalisis bertahap lewat demux AAC + AudioDecoder
       (decodeAudioWindow — RAM selalu sekecil jendela) utk peaks, RMS
       & envelope zoom pembicara; ekspor per part memakai jendela yang
       sama sehingga suara asli tetap ikut. POTONG LANGSUNG tak tersentuh
       (audio asli disalin langsung dari file). */
    const dur = state.duration || 0;
    const estDur = dur || (state.file.size || 0) / 16384;   /* audio file: heuristik 128 kbps */
    const estNative = estDur * 48000 * 2 * 4;
    /* v3.18: jejak jalur audio di log — bukti di mesin user jalur
       hemat RAM benar-benar aktif (atau justru masih decode penuh) */
    try { window.kinostra.noteCrash(`audio: ${estNative <= 350 * 1024 * 1024 ? 'decode penuh' : 'mode JENDELA (hemat RAM)'} · ${Math.round(estDur)} dtk`); } catch (e) { }
    if (estNative <= 350 * 1024 * 1024) {
      const ab = state.file.virtual ? await (await fetch(state.file.kurl)).arrayBuffer()
        : await state.file.arrayBuffer();
      state.audioBuffer = await getActx().decodeAudioData(ab);
      buildPeaks();
      /* v3.31: PEMINDAI AUDIO SENYAP — film split-an hasil unduhan sering
         DIHAPUS suaranya (hening total, puncak ≈ −91 dB) sementara wadahnya
         tetap punya track AAC; user baru sadar setelah hasil ekspor dianggap
         "tidak ada suaranya". Ukur puncak sampel sekali di impor & beri tahu
         SEBELUM ekspor (kasus nyata v3.30: sumber PART_01 hening −91 dB). */
      checkSilentAudio('impor');
      return;
    }
    /* media panjang: analisis bertahap di belakang — jangan pernah utuh */
    state.peaks = [];
    toast('Video panjang — audio dianalisis hemat memori bertahap; suara asli tetap ikut saat ekspor & POTONG LANGSUNG.', 'info');
    analyzeAudioViaDemux();   /* async, tidak menunggu loading */
  } catch (e) { state.audioBuffer = null; toast('Track audio tidak terbaca — ekspor mungkin tanpa suara asli', 'warn'); }
}

/* ---------- v3.31→v3.32: PEMINDAI AUDIO SENYAP ----------
   Sumber tanpa suara (hasil unduhan film split-an sering begitu): track
   AAC ADA tetapi isinya hening digital (puncak < −60 dBFS). Ekspor
   menyalin audio asli dengan setia → hasil ikut hening; user mengira
   aplikasinya rusak. Diukur SEKALI per video (cache per mediaEpoch):
   puncak sampel < 0,001 (≈ −60 dBFS) → SENYAP. Pemindaian dijalankan
   saat impor (file kecil: decode penuh; film panjang: jendela demux
   v3.32 — peringatan muncul SEJAK IMPOR, tak menunggu ekspor) & saat
   ekspor (buffer siap / segmen pertama). Pesan menyesuaikan bila
   MUSIK/BACKSOUND sudah siap mengisi suara. */
function audioTertutupMusik() {
  return !!(state.music && state.music.buffer)
    || !!(state.bsound && state.bsound.on && state.bsound.buffer);
}
function measureAudioPeak(b) {
  if (!b || !b.length) return 0;
  const d = b.getChannelData(0), d2 = b.numberOfChannels > 1 ? b.getChannelData(1) : null;
  let p = 0;
  const step = Math.max(1, Math.floor(d.length / 1500000));   /* maks ±1,5 jt sampel */
  for (let i = 0; i < d.length; i += step) {
    const v = Math.abs(d2 ? (d[i] + d2[i]) / 2 : d[i]);
    if (v > p) p = v;
  }
  return p;
}
/* v3.32: inti pemindai — menerima puncak yang sudah diukur (dari buffer
   penuh, segmen pertama ekspor, ATAU jendela analisis film panjang). */
function checkSilentPeak(pk, spanSec, tempat) {
  if (state._senyapEpoch === (state.mediaEpoch || 0)) return !!state.audioSenyap;
  if (!(spanSec >= 1.5) || !(pk >= 0)) return false;
  state._senyapEpoch = state.mediaEpoch || 0;
  state.audioSenyap = pk < 0.001;                /* 0 (bening betul-betul kosong) ikut senyap */
  if (state.audioSenyap) warnAudioSenyap(pk > 0 ? Math.round(20 * Math.log10(pk)) : -91, tempat);
  return state.audioSenyap;
}
function warnAudioSenyap(dB, tempat) {
  try { window.kinostra.noteCrash(`audio: SUMBER SENYAP (puncak ${dB} dB) terdeteksi saat ${tempat}`); } catch (e) { }
  try {
    const bs = document.querySelector('#bsoundStat');
    if (bs) bs.textContent = `⚠ AUDIO ASLI VIDEO SENYAP (hening ${dB} dB) — sumber tak berisi suara. Isi suara hasil ekspor lewat BACKSOUND MP3 di bawah.`;
  } catch (e) { }
  if (audioTertutupMusik()) toast(`AUDIO ASLI VIDEO SENYAP (hening ${dB} dB) — suara asli sumber kosong; hasil ekspor akan berisi MUSIK/BACKSOUND saja.`, 'warn');
  else toast(`AUDIO ASLI VIDEO SENYAP (hening ${dB} dB) — file sumber TIDAK berisi suara (bukan gangguan aplikasi). Hasil ekspor/split akan hening juga; isi suara lewat modul 11 MUSIK & NARASI AI → BACKSOUND MP3 SENDIRI.`, 'warn');
}
function checkSilentAudio(tempat, pkKnown) {
  if (pkKnown !== undefined) return checkSilentPeak(pkKnown, state.audioBuffer ? state.audioBuffer.duration : (state._audioSeg ? state._audioSeg.segSec : 180), tempat);
  const b = state.audioBuffer;
  if (!b || (b.duration || 0) < 1.5) return false;
  return checkSilentPeak(measureAudioPeak(b), b.duration, tempat);
}

/* ---------- v3.32: AUDIO EKSPOR BERSEGMENT (AKAR "FILM UTUH TANPA SUARA") ----------
   v3.30 membangun SATU AudioBuffer untuk seluruh rentang ekspor. Ekspor
   FILM UTUH (mis. 71 part × 183 dtk = 3,5 jam) butuh buffer ±4,9 GB →
   alokasi `new AudioBuffer` gagal di mesin RAM 4-8 GB → jalur 1 gagal →
   pelindung RAM jalur 2 (≤3,2 GB) juga menolak → ekspor jalan TANPA track
   audio sama sekali. Inilah penyebab laporan "hasil export & split tidak
   ada suaranya" pada ekspor film utuh. Kini: bila buffer penuh > 1 GB,
   audio disiapkan BERSEGMENT — renderMix meminta segmen 180 dtk sesuai
   kebutuhan tiap part dari antrian decode BERURUTAN (satu decoder pada
   satu waktu → bebas rebutan pelan v3.17), cache LRU ±8 segmen (±550 MB)
   → RAM selalu terkendali berapa pun panjang filmnya. */
function audioSegStoreInit(pr) {
  state._audioSeg = {
    probe: pr, cache: { probe: pr }, on: true,
    sr: (pr.info && pr.info.sampleRate) || 48000,
    chs: (pr.info && pr.info.channels) || 2,
    segSec: 180, cap: 8, nDec: 0,
    map: new Map(), pend: new Map(), q: Promise.resolve()
  };
}
function audioSegsFor(start, durMedia) {
  const st = state._audioSeg;
  if (!st || !st.on) return Promise.resolve([]);
  const i0 = Math.max(0, Math.floor(start / st.segSec));
  const i1 = Math.floor((start + Math.max(0.01, durMedia)) / st.segSec);
  const want = [];
  for (let i = i0; i <= i1; i++) want.push(i);
  const pend = want.map(i => {
    if (st.map.has(i)) return Promise.resolve(st.map.get(i));
    if (st.pend.has(i)) return st.pend.get(i);
    const p = st.q.then(() => decodeAudioWindow(st.cache, i * st.segSec, st.segSec))
      .then(wb => {
        const buf = (wb && wb.duration > 0.01) ? wb : null;
        if (buf) {
          st.map.set(i, buf);
          while (st.map.size > st.cap) {   /* LRU: buang segmen tertua */
            const first = st.map.keys().next().value;
            if (first === i) break;
            st.map.delete(first);
          }
        }
        st.pend.delete(i); st.nDec++;
        return buf;
      });
    st.pend.set(i, p);
    st.q = p.catch(() => null);   /* antrean lanjut walau satu segmen gagal */
    return p;
  });
  return Promise.all(pend).then(list =>
    want.map((i, k) => list[k] ? { t0: i * st.segSec, buf: list[k] } : null).filter(Boolean));
}

/* v3.17.1: analisis audio panjang TANPA decode utuh — jendela 45 dtk
   berurutan via demux AAC + AudioDecoder; menghasilkan peaks (garis
   gelombang), RMS global (normalizer AUDIO SEHAT) & envelope 0,5 dtk
   (zoom pembicara). RAM puncak = 1 jendela (±15-20 MB). */
async function analyzeAudioViaDemux() {
  const epoch = state.mediaEpoch || 0;
  try {
    const pr = await probeAudio(state.file);
    if (!pr || !state.duration) { state._audioDemux = null; return; }
    state._audioDemux = { probe: pr };   /* utk ekspor (renderMix) */
    const cache = { probe: pr };         /* cache TERPISAH utk analisis —
        jangan berebut decoder dgn ekspor yang jalan bersamaan */
    /* v3.22: MULAI TERTIB — analisis = pekerjaan latar PALING sopan.
       Persis setelah impor thread utama sibuk: metadata, gambar pertama,
       thumbnail kotak video (makeThumb memakai elemen video sendiri, tak
       terlihat oleh cek videoEl.paused di bawah). Dulu analisis langsung
       membanjiri renderer dgn ribuan demux/dekode per jendela DI ATAS
       semuanya → di mesin lemah detak jantung preload tertahan >12 dtk →
       pelindung mematikan aplikasi ("ngestart sendiri" persis setelah
       impor film 3-4 jam; log user v3.18-v3.21). Kini jendela pertama
       menunggu 10 dtk TENANG BERUNTUN (tidak memutar/ekspor/thumbnail/
       sibuk); pacing per paket (demux.js) memberi jeda teratur sesudahnya.
       Ekspor tetap kebagian _audioDemux sesuai jadwalnya sendiri. */
    {
      let tenang = 0;
      while (state.file && (state.mediaEpoch || 0) === epoch && tenang < 100) {
        const sibuk = state.busy || state._audioExporting || state._audioWinBusy || state._thumbBusy
          || (typeof videoEl !== 'undefined' && videoEl && !videoEl.paused && videoEl.readyState >= 2);
        if (sibuk) { tenang = 0; await new Promise(r => setTimeout(r, 400)); }
        else { tenang++; await new Promise(r => setTimeout(r, 100)); }
      }
      if (!state.file || (state.mediaEpoch || 0) !== epoch) return;
    }
    const dur = state.duration;
    const N = 1400, peaks = new Float32Array(N);
    const envStep = 0.5, envN = Math.max(1, Math.ceil(dur / envStep));
    const env = new Float32Array(envN);
    let sumSq = 0, nSum = 0;
    /* v3.18: JENDELA ADAPTIF — film >60 mnt pakai jendela 120 dtk
       (film 188 mnt = 94 jendela, bukan 250) → analisis ±2,5× lebih
       cepat; RAM puncak tetap 1 jendela (±46 MB). Film ≤60 mnt:
       45 dtk persis v3.17.1. */
    const WIN = dur > 3600 ? 120 : 45;
    let nWin = 0, missBeruntun = 0, puncakAnalisis = 0, _senyapDikirim = false;
    for (let t = 0; t < dur && state.file && (state.mediaEpoch || 0) === epoch; t += WIN) {
      /* v3.17.1: ekspor sedang jalan ATAU video sedang DIPUTAR → tunda
         analisis. Analisis adalah pekerjaan latar yang sopan — jangan pernah
         bersaing dengan decode video/encode ekspor (terbukti: analisis
         bersamaan dengan pemutaran di mesin lemah memicu crash proses
         render; terpisah keduanya 100% aman). Melanjut otomatis saat
         pause/idle — film 2 jam selesai dianalisis ±1-2 menit browsing. */
      /* v3.22: jeda juga saat thumbnail berantai aktif & aplikasi sibuk —
         dulu hanya cek ekspor + pemutaran; thumbnail kotak video jalan
         bersamaan tanpa terlihat (elemen videonya sendiri) */
      while ((state._audioExporting || state._thumbBusy || state.busy) && state.file && (state.mediaEpoch || 0) === epoch) await new Promise(r => setTimeout(r, 250));
      while (!videoEl.paused && state.file && (state.mediaEpoch || 0) === epoch) await new Promise(r => setTimeout(r, 500));
      const d = Math.min(WIN, dur - t);
      let buf = null;
      state._audioWinBusy = true;   /* ekspor menunggu flag ini sebelum decode */
      try { buf = await decodeAudioWindow(state._audioDemux, t, d); } catch (e) { console.warn('analisis: jendela gagal —', e && e.message); }
      state._audioWinBusy = false;
      nWin++;
      if (!buf) {
        /* satu jendela gagal ≠ seluruh analisis batal — lewati; berhenti
           hanya bila 3 kegagalan beruntun (file memang tak terbaca) */
        missBeruntun++;
        console.info('analisis: jendela', nWin, 't=' + Math.round(t), 'KOSONG');
        if (missBeruntun >= 3) break;
        continue;
      }
      missBeruntun = 0;
      const dch = buf.getChannelData(0), L = dch.length;
      const t0 = t, t1 = t + d;
      const i0 = Math.floor(t0 / dur * N), i1 = Math.min(N, Math.max(i0 + 1, Math.ceil(t1 / dur * N)));
      const bs = Math.max(1, Math.floor(L / Math.max(1, i1 - i0)));
      for (let k = i0; k < i1; k++) {
        let m = 0; const o = (k - i0) * bs;
        for (let j = o; j < Math.min(L, o + bs); j += 16) { const v = Math.abs(dch[j] || 0); if (v > m) m = v; }
        peaks[k] = m;
      }
      /* v3.32: pantau puncak antar jendela — deteksi dini sumber senyap */
      for (let k = i0; k < i1; k++) if (peaks[k] > puncakAnalisis) puncakAnalisis = peaks[k];
      let s2 = 0, c = 0;
      for (let j = 0; j < L; j += 24) { const v = dch[j] || 0; s2 += v * v; c++; }
      const rmsWin = Math.sqrt(s2 / Math.max(1, c));
      sumSq += s2; nSum += c;
      const e0 = Math.floor(t0 / envStep), e1 = Math.min(envN, Math.max(e0 + 1, Math.ceil(t1 / envStep)));
      const w = Math.max(1, Math.floor(L / Math.max(1, e1 - e0)));
      for (let k = e0; k < e1; k++) {
        let s3 = 0, c3 = 0; const o = (k - e0) * w;
        for (let j = o; j < Math.min(L, o + w); j += 24) { const v = dch[j] || 0; s3 += v * v; c3++; }
        env[k] = Math.sqrt(s3 / Math.max(1, c3));
      }
      state.peaks = peaks; state.audioRms = Math.sqrt(sumSq / Math.max(1, nSum));
      state._rmsEpoch = epoch; state._audioEnv = env;
      /* v3.32: DETEKSI DINI SUMBER SENYAP utk film panjang — setelah ±45 dtk
         audio terdecode tanpa satu pun sampel bernada, beri tahu SEJAK IMPOR.
         Dulu peringatan baru muncul saat ekspor; film utuh 3,5 jam bahkan tak
         pernah sampai ke pemindai lama (buffer audio ±4,9 GB gagal dibuat —
         akar "ekspor film utuh tanpa suara"). Koreksi otomatis bila jendela
         berikutnya menemukan suara (film senyap hanya di awal). */
      if (!_senyapDikirim && puncakAnalisis < 0.001 && t1 >= 45) {
        _senyapDikirim = true;
        checkSilentPeak(puncakAnalisis, t1, 'impor (film panjang)');
      } else if (_senyapDikirim && state.audioSenyap && puncakAnalisis >= 0.001) {
        state.audioSenyap = false; state._senyapEpoch = undefined; _senyapDikirim = false;
        try {
          const bs = document.querySelector('#bsoundStat');
          if (bs && bs.textContent.includes('SENYAP')) bs.textContent = 'Belum ada backsound — video pakai suara asli saja';
        } catch (e) { }
        toast('Audio asli terdeteksi BERNADA di bagian lain film — peringatan senyap dibatalkan.', 'ok');
      }
      await new Promise(r => setTimeout(r, 120));   /* v3.22: napas jendela 120 ms (dulu 0) */
    }
    if ((state.mediaEpoch || 0) === epoch && state.file) {
      state.peaks = peaks; state._audioEnv = env;
      state.audioRms = Math.sqrt(sumSq / Math.max(1, nSum)); state._rmsEpoch = epoch;
      console.info('audio panjang: analisis bertahap selesai —', Math.round(dur), 'dtk');
    }
  } catch (e) {
    console.warn('analisis audio bertahap gagal —', e && e.message);
  }
}

function buildPeaks() {
  const b = state.audioBuffer; if (!b) { state.peaks = []; return; }
  const d = b.getChannelData(0), N = 1400, arr = new Float32Array(N), bs = Math.max(1, Math.floor(d.length / N));
  for (let i = 0; i < N; i++) { let m = 0; const o = i * bs; for (let j = 0; j < bs; j += 16) { const v = Math.abs(d[o + j] || 0); if (v > m) m = v; } arr[i] = m; }
  state.peaks = arr;
}

/* ---------- DIMENSI & SEGMENTASI ---------- */
function previewDims() { return state.ratio === '16:9' ? { W: 1600, H: 900 } : { W: 506, H: 900 }; }
function outDims(sc = 1) {
  /* v3.4: RESOLUSI TETAP — bila user memilih 720p/1080p/2K/4K di modul 09,
     hasil ekspor DIKUNCI ke ukuran itu (skala 100/75/50% diabaikan).
     Rasio 9:16 membalik W↔H: 4K vertikal = 2160×3840 (sisi pendek mengikuti
     angka pilihan — konvensi TikTok/Shorts). AUTO = perilaku lama. */
  const R = state.resOut && typeof RESOUTS !== 'undefined' ? RESOUTS[state.resOut] : null;
  if (R) return state.ratio === '16:9' ? { W: R.W, H: R.H } : { W: R.H, H: R.W };
  let W, H; if (state.ratio === '16:9') { W = 1920; H = 1080; } else { W = 1080; H = 1920; }
  W = Math.round(W * sc / 2) * 2; H = Math.round(H * sc / 2) * 2; return { W, H };
}
/* ---------- v2.9: WAKTU MULAI & BERHENTI EKSPOR ----------
   rangeInfo() = rentang efektif video aktif: {start, end, len}.
   Segmen, timeline, ringkasan & seluruh mesin ekspor memakai ini —
   part hanya dibuat DI DALAM rentang, sisanya tidak diekspor. */
function parseTimeArg(str) {
  /* terima "90", "90.5", "1:30", "1:02:03" → detik (NaN bila tidak valid) */
  const s = String(str == null ? '' : str).trim(); if (!s) return NaN;
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const p = s.split(':').map(x => parseFloat(x.trim()));
  if (!p.length || p.length > 3 || p.some(isNaN) || p.some(v => v < 0)) return NaN;
  return p.reverse().reduce((a, v, i) => a + v * Math.pow(60, i), 0);
}
function rangeInfo() {
  const dur = state.duration || 0;
  let s = clamp(state.rangeStart || 0, 0, Math.max(0, dur - 0.1));
  let e = state.rangeEnd > 0 ? Math.min(state.rangeEnd, dur) : dur;
  if (e - s < 0.1) { s = 0; e = dur; }   /* rentang tidak valid → penuh */
  return { start: s, end: e, len: Math.max(0.1, e - s) };
}

/* ---------- v2.12: HAPUS BAGIAN (POTONG) ----------
   state.cuts = daftar rentang yang DIBUANG dari hasil ekspor/split:
   [{s, e}, …]. Interval efektif = rentang ekspor DIKURANGI semua potongan.
   Part hanya dibuat di dalam interval efektif — penomoran part lanjut
   menyambung melewati tiap potongan. */
function effIntervals() {
  const r = rangeInfo();
  const cuts = (state.cuts || [])
    .map(c => ({ s: clamp(Math.min(c.s, c.e), r.start, r.end), e: clamp(Math.max(c.s, c.e), r.start, r.end) }))
    .filter(c => c.e - c.s > 0.08)
    .sort((a, b) => a.s - b.s);
  const out = []; let cur = r.start;
  for (const c of cuts) {
    if (c.s > cur + 0.05) out.push({ a: cur, b: Math.min(c.s, r.end) });
    cur = Math.max(cur, c.e);
  }
  if (cur < r.end - 0.05) out.push({ a: cur, b: r.end });
  return out.filter(iv => iv.b - iv.a >= 0.1);
}
/* total durasi yang dibuang (utk statistik & ringkasan) */
function cutsLen() {
  const r = rangeInfo();
  return (state.cuts || []).reduce((a, c) => a + Math.max(0, Math.min(c.e, r.end) - Math.max(c.s, r.start)), 0);
}
/* total durasi yang BENAR-BENAR diekspor (rentang − potongan) */
function expLen() { return Math.max(0.1, rangeInfo().len - cutsLen()); }

/* ---------- v3.2: JUMLAH PART OTOMATIS ----------
   Isi angka N (mis. 10) → durasi per part = durasi video / N (pembagian
   merata). Dihitung ulang otomatis setiap video dimuat, jadi setelan
   "10 part" tetap berlaku untuk video berikutnya tanpa dihitung manual.
   splitSec hasilnya boleh pecahan — mesin split (segBoundsList) memakai
   float langsung, jadi 10 part selalu eksak. */
function applySplitParts(fromInput) {
  const dur = state.duration || 0;
  let n = state.splitParts > 0 ? Math.round(state.splitParts) : 0;
  if (n > 0 && dur > 0) {
    if (n > dur) n = Math.max(1, Math.floor(dur));   /* jaga minimal ±1 dtk/part */
    state.splitSec = dur / n;
    const fx = +state.splitSec.toFixed(2);
    try {
      const inp = $('#inSplit'); if (inp) inp.value = fx;
      const st = $('#splitPartsStat');
      if (st) st.innerHTML = `<b>${n} PART</b> × ${fx} dtk/part — dihitung otomatis dari durasi ${fmtT(dur)}`;
    } catch (e) { }
    if (fromInput && typeof toast === 'function') toast(`Split otomatis: ${n} part × ${fx} dtk`, 'ok');
  }
  state.splitParts = n;
  return state.splitSec;
}
/* reset tampilan stat JUMLAH PART ke teks default */
function resetSplitPartsUI() {
  try { const st = $('#splitPartsStat'); if (st) st.textContent = 'Isi angka → durasi per part dihitung otomatis dari durasi video'; } catch (e) { }
}
/* teks HUD atas: tunjukkan mode jumlah part saat aktif */
function syncTInfoSplit() {
  try {
    $('#tInfo').textContent = state.splitParts > 0
      ? `SPLIT OTOMATIS ${state.splitParts} PART × ${+(state.splitSec.toFixed(2))} DTK`
      : `SPLIT ${state.splitSec} DTK/PART`;
  } catch (e) { }
}

/* ---------- v3.0: BATAS PART — MODE DURASI / MODE ADEGAN ----------
   Mode 'scene' memecah di titik pergantian adegan (state.sceneCuts, hasil
   DETEKSI ADEGAN). Mode 'dur' perilakunya 100% sama dengan dulu.
   Daftar batas di-cache (kunci = semua sumber perubahan) supaya pemanggilan
   per-frame (drawComposition/HUD) tetap murah. */
let _segKey = null, _segList = null;
function segBoundsList() {
  const sc = state.sceneCuts || [];
  let scSum = 0; for (let i = 0; i < sc.length; i++) scSum += sc[i];
  /* v3.1 FIX: DURASI MASUK KUNCI CACHE — dulu metadata yang tadinya salah
     (lalu diperbaiki muat-ulang) meninggalkan daftar part [0..0.1] yang
     ter-cache selamanya → ekspor "berhasil" berisi 4 frame */
  const key = `${state.mediaEpoch || 0}|${(state.duration || 0).toFixed(3)}|${state.splitMode}|${state.splitSec}|${rangeInfo().start.toFixed(3)}|${(state.rangeEnd || 0).toFixed(3)}|${(state.cuts || []).length}|${sc.length}|${scSum.toFixed(3)}`;
  if (_segKey === key && _segList) return _segList;
  const ivs = effIntervals(), out = [];
  if (state.splitMode === 'scene' && sc.length) {
    for (const iv of ivs) {
      const pts = [iv.a];
      sc.slice().sort((a, b) => a - b).forEach(p => { if (p > iv.a + 1.2 && p < iv.b - 1.2) pts.push(p); });
      pts.push(iv.b);
      for (let i = 0; i < pts.length - 1; i++) {
        const s = pts[i], e = pts[i + 1];
        if (e - s < 1.5 && out.length && out[out.length - 1].start >= iv.a) { out[out.length - 1].end = e; continue; }
        out.push({ i: 0, start: s, end: e });
      }
    }
  } else {
    for (const iv of ivs) {
      let t = iv.a;
      while (t < iv.b - 1e-6) { const end = Math.min(iv.b, t + state.splitSec); out.push({ i: 0, start: t, end }); t = end; }
    }
  }
  out.forEach((o, i) => { o.i = i; });
  if (!out.length) { const r = rangeInfo(); out.push({ i: 0, start: r.start, end: Math.max(r.end, r.start + 0.1) }); }
  _segKey = key; _segList = out;
  return out;
}

function segmentsCount() {
  if (!state.duration) return 1;
  return Math.max(1, segBoundsList().length);
}
function segments() {
  if (!state.duration) return [{ i: 0, start: 0, end: 0.1 }];
  return segBoundsList().map(o => ({ i: o.i, start: o.start, end: o.end }));
}
/* v2.12 → v3.0: batas part yang memuat waktu t (mendukung mode adegan) */
function currentSegBounds(t) {
  const list = segBoundsList();
  for (const b of list) if (t >= b.start - 1e-6 && t <= b.end + 1e-6) return b;
  return null;
}
/* indeks part saat ini (0-based) — sadar interval & potongan */
function currentSegIndex(t) {
  const b = currentSegBounds(t);
  return b ? b.i : 0;
}
/* v2.9: preset massal — dipanggil tiap video dimuat (impor, klik kotak, batch).
   Waktu mulai video = preset applyAllStart (dipotong bila melebihi durasi);
   berhenti selalu sampai video habis. Bila preset mati → penuh 0–akhir. */
function applyRangePreset() {
  const dur = state.duration || 0;
  state.rangeStart = (state.applyAllStart != null && dur > 0 && state.applyAllStart < dur)
    ? state.applyAllStart : 0;
  state.rangeEnd = 0;   /* 0 = sampai habis */
}
function containRect(vw, vh, W, H) { const s = Math.min(W / vw, H / vh); const w = vw * s, h = vh * s; return { x: (W - w) / 2, y: (H - h) / 2, w, h }; }
function coverRect(vw, vh, W, H) { const s = Math.max(W / vw, H / vh); const w = vw * s, h = vh * s; return { x: (W - w) / 2, y: (H - h) / 2, w, h }; }

/* ---------- v3.0: RMS AUDIO AKTIF (utk normalizer AUDIO SEHAT) ----------
   Diukur sekali per video (sampel tiap 24 data → cepat) lalu di-cache. */
function measureAudioRms() {
  const b = state.audioBuffer;
  if (!b) return 0;
  if (state.audioRms > 0 && state._rmsEpoch === (state.mediaEpoch || 0)) return state.audioRms;
  const d = b.getChannelData(0), d2 = b.numberOfChannels > 1 ? b.getChannelData(1) : null;
  let s = 0, n = 0;
  for (let i = 0; i < d.length; i += 24) { const v = d2 ? (d[i] + d2[i]) / 2 : d[i]; s += v * v; n++; }
  state.audioRms = Math.sqrt(s / Math.max(1, n));
  state._rmsEpoch = state.mediaEpoch || 0;
  return state.audioRms;
}

/* ---------- v3.23→v3.25: PENGAWAS GERAK GAMBAR + PENGAWAS LAYAR ----------
   Laporan user: waktu berjalan tapi GAMBAR BEKU. TIGA detektor, satu tangga:
   (a) POMPA MACET — totalVideoFrames diam padahal currentTime maju (v3.23);
   (b) PENYAJIAN MATI — decoder maju (fr naik) tapi piksel video (sampel
       drawImage kanvas 48x27) tak pernah berubah (v3.24);
   (c) LAYAR BENAR-BENAR BEKU — capturePage dari main process membaca piksel
       JENDELA yang tersaji; diam padahal waktu maju (v3.25). (a)&(b) bisa
       lolos kareno decoder & drawImage mengambil frame baru dari decoder
       padahal kompositor tak pernah menyajikannya ke layar — (c) detektor
       sejati, jalan di jalur native MAUPUN kanvas.
   Plus akar yang dibedah di v3.25: overlay kanvas di atas video yang
   digambar ulang terus-menerus (15x/dtk walau statik) meng-invalidate
   region di atas video → lapisan video tak pernah naik ke hardware overlay
   kompositor Windows → beku di GPU/driver tertentu. ui.js kini menggambar
   overlay native HANYA saat isinya berubah (JALUR VIDSPLIT).
   TANGGA PENYEMBUHAN (streak gabungan, dipicu detektor mana pun):
   1) kocok halus (seek +0,05 dtk) + latar blur dibekukan (berhenti
      diperbarui — satu invalidasi kanvas lagi-lagi di atas/bawah video)
   2) nyalakan ulang visibilitas elemen (lapisan kompositor dipasang ulang)
   3) jatuh ke jalur kanvas overlay (_forceCanvasPlay dibaca canNativePlay)
      — DIINGAT per mesin (localStorage 'kinostra.canvasPlay'): impor
      berikutnya pada sesi sama langsung kanvas; sesi baru mencoba native
      sekali (driver bisa saja membaik). Semua tercatat ke log. */
let _frLast = -1, _frLastT = 0, _frStreak = 0, _pxLast = -1;
let _pxCv = null, _pxCtx = null;
let _layarLast = '', _layarLastT = 0;
function terapkanTangga(why, pos) {
  _frStreak++;
  if (_frStreak === 1) {
    try { videoEl.currentTime = videoEl.currentTime + 0.05; } catch (e) { }
    window.__kinoBlurFreeze = true;
    if (window.kinostra && kinostra.noteCrash) kinostra.noteCrash('v3.25 GAMBAR BEKU t=' + pos + ' — ' + why + ' — kocok halus + latar blur dibekukan');
    if (typeof toast === 'function') toast('Gambar tidak bergerak — dikocok halus…', 'warn');
  } else if (_frStreak === 2) {
    videoEl.style.display = 'none'; void videoEl.offsetWidth; videoEl.style.display = '';
    if (window.kinostra && kinostra.noteCrash) kinostra.noteCrash('v3.25 GAMBAR BEKU t=' + pos + ' — ' + why + ' — visibilitas elemen dinyalakan ulang');
  } else if (_frStreak === 3) {
    state._forceCanvasPlay = true;
    window.__nativeTriedOnce = true;
    try { localStorage.setItem('kinostra.canvasPlay', '1'); } catch (e) { }
    if (window.kinostra && kinostra.noteCrash) kinostra.noteCrash('v3.25 GAMBAR BEKU t=' + pos + ' — ' + why + ' — jatuh ke jalur kanvas overlay (diingat utk impor berikutnya)');
    if (typeof toast === 'function') toast('Penyajian gambar macet — beralih ke jalur kanvas', 'warn');
  }
}
function cekGambarBergerak() {
  try {
    if (!state.file || state.isAudio || state.busy) return;
    if (videoEl.paused || videoEl.readyState < 2 || videoEl.seeking) { _frStreak = 0; _frLast = -1; _pxLast = -1; return; }
    const q = videoEl.getVideoPlaybackQuality ? videoEl.getVideoPlaybackQuality() : null;
    const fr = q ? q.totalVideoFrames : (videoEl.webkitDecodedFrameCount || 0);
    const t = videoEl.currentTime;
    const tMaju = t > _frLastT + 1.2;
    const frStuck = fr === _frLast, frMaju = fr > _frLast;
    let pxStuck = false;
    if (frMaju && tMaju) {   /* decoder klaim maju — cek piksel yang benar2 tersaji */
      try {
        if (!_pxCv) { _pxCv = document.createElement('canvas'); _pxCv.width = 48; _pxCv.height = 27; _pxCtx = _pxCv.getContext('2d', { willReadFrequently: true }); }
        _pxCtx.drawImage(videoEl, 0, 0, 48, 27);
        const d = _pxCtx.getImageData(0, 0, 48, 27).data;
        let h = 0; for (let i = 0; i < d.length; i += 40) h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) | 0;
        pxStuck = (h === _pxLast); _pxLast = h;
      } catch (e) { _pxLast = -1; }
    } else _pxLast = -1;
    if ((frStuck || pxStuck) && tMaju) {
      terapkanTangga(frStuck ? 'frame diam (pompa macet)' : 'piksel diam (decoder maju tapi penyajian mati)',
        (typeof fmtT === 'function' ? fmtT(t) : Math.round(t) + ' dtk'));
    } else _frStreak = 0;
    _frLast = fr; _frLastT = t;
  } catch (e) { }
}
setInterval(cekGambarBergerak, 2000);
/* PENGAWAS LAYAR (v3.25) — region = pita tengah elemen yang diputar
   (menghindari teks judul di atas & bawah). Hash piksel jendela dibandingkan
   antar-sampel 5 dtk; diam + waktu maju ≥3,5 dtk = beku sesungguhnya. */
async function cekLayarTersaji() {
  try {
    if (!state.file || state.isAudio || state.busy) return;
    if (videoEl.paused || videoEl.readyState < 2 || videoEl.seeking) { _layarLast = ''; return; }
    if (!window.kinostra || typeof kinostra.cekLayar !== 'function') return;
    const t = videoEl.currentTime;
    const el = canNativePlay() ? videoEl : cv;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const rect = { x: Math.round(r.x + r.width * 0.12), y: Math.round(r.y + r.height * 0.32), width: Math.max(8, Math.round(r.width * 0.76)), height: Math.max(8, Math.round(r.height * 0.36)) };
    const h = await kinostra.cekLayar(rect);
    if (!h) return;
    if (h === _layarLast && t > _layarLastT + 3.5) {
      terapkanTangga('LAYAR diam (capturePage: piksel jendela tak pernah berubah)',
        (typeof fmtT === 'function' ? fmtT(t) : Math.round(t) + ' dtk'));
    }
    _layarLast = h; _layarLastT = t;
  } catch (e) { }
}
setInterval(cekLayarTersaji, 5000);

/* ---------- SEEK PRESISI (v2.1: mendukung elemen video worker paralel) ---------- */
function seekTo(t, el) {
  return new Promise(res => {
    const v = el || videoEl; t = clamp(t, 0, Math.max(0, (v.duration || state.duration) - 0.02));
    if (Math.abs(v.currentTime - t) < 0.004 && !v.seeking) { res(); return; }
    let done = false;
    const fin = () => { if (done) return; done = true; v.removeEventListener('seeked', fin); clearTimeout(tm); res(); };
    const tm = setTimeout(fin, 2500);
    v.addEventListener('seeked', fin);
    v.currentTime = t;
  });
}
