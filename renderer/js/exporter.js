/* ================================================================
   KINOSTRA DESKTOP — exporter.js (v2.2 TURBO STREAM · v2.11 ANTI-BEKU)
   Pipeline ekspor WebCodecs → MP4.
   v2.11 FIX "VIDEO HASIL EKSPOR/SPLIT KADANG BEKU": frame yang dibuang
   decoder/compositor membuat mediaTime antar frame tersaji LOMPAT beberapa
   detik → PTS di dalam MP4 bolong → pemutar menahan frame lama berdetik-
   detik (gambar beku, audio terus jalan). Kini: lompatan terdeteksi dan
   DIISI ULANG lewat seek presisi slot-per-slot (refillGap) + kecepatan
   capture turun segera saat decoder kewalahan → gerakan selalu mulus.
   UPGRADE v2.2 (kenapa jauh lebih cepat):
   - CAPTURE PLAYBACK: video DIPUTAR cepat (rate adaptif 1.5–2.5×) dan
     setiap frame yang tampil diambil lewat requestVideoFrameCallback
     → TIDAK ADA seek per frame (penyebab utama lambat di v2.0/2.1)
   - BACKPRESSURE: video otomatis pause saat antrean encoder penuh,
     lanjut otomatis — tidak ada frame buangan, tidak macet
   - LAPISAN STATIS di-cache (latar blur 9:16, vignette, grain) —
     hemat 50–150 ms per frame
   - Paralel per part (video + encoder + muxer sendiri), encoder
     hardware GPU dulu (prefer-hardware), fallback software
   - Fallback aman: rantai seek utk audio-only / tanpa rVFC
   ================================================================ */
'use strict';

const RVFC_OK = typeof HTMLVideoElement !== 'undefined' && 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

/* v2.10 FIX "BATCH SELALU DIBATALKAN": dulu KEGAGALAN internal (encoder GPU
   macet, video rusak, watchdog 45 dtk) ikut men-set state.abort — flag yang
   sama dengan tombol BATAL milik pengguna. Akibatnya satu video bermasalah
   membatalkan seluruh batch dengan pesan "dihentikan/dibatalkan" tanpa
   penyebab yang jelas.
   Sekarang dipisah tegas:
   - state.abort      = HANYA bila pengguna menekan BATAL / × / ESC
   - state.exportFatal = alasan kegagalan internal (Error), bukan batal
   Semua loop render memeriksa keduanya supaya worker lain berhenti cepat,
   tetapi lapisan batch bisa membedakan "pengguna minta berhenti" vs
   "video ini gagal → tandai GAGAL lalu lanjut ke video berikutnya". */
function xAborted() { return state.abort || !!state.exportFatal; }

/* v2.11: jumlah render paralel aktif — menahan kecepatan capture
   (playbackRate) supaya decoder tidak membuang frame saat paralel berat */
let _xPar = 1;

/* v2.12: PROBE ENCODER — uji nyata mini sebelum encoder dipakai merender:
   configure + encode beberapa frame + flush + verifikasi output. Encoder GPU
   yang "konon didukung" tapi langsung mati (codec closed) / macet saat flush
   (Media Foundation tanpa GPU yang benar) terdeteksi DI SINI.
   v2.14: probe sekarang MENGUKUR KECEPATAN (fps) — mode OTOMATIS memilih
   encoder yang benar-benar lebih kencang (GPU vs CPU), bukan menduga-duga. */
async function probeEncoderFPS(cfg, W, H, frames = 30) {
  let venc = null;
  try {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#1a2a3a'; g.fillRect(0, 0, W, H);
    let chunks = 0, err = null, flushed = false;
    venc = new VideoEncoder({
      output: () => chunks++,
      error: e => { err = err || (e && e.message) || 'encoder error'; }
    });
    venc.configure({ ...cfg, latencyMode: 'realtime' });
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) {
      /* konten BERGERAK — encoder bekerja nyata, angka fps jujur */
      g.fillStyle = `hsl(${(i * 12) % 360} 60% ${18 + (i % 26)}%)`;
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#fff';
      g.fillRect((i * 37) % (W - 130), (i * 53) % (H - 70), 120, 68);
      const vf = new VideoFrame(c, { timestamp: i * 41666, duration: 41666 });
      venc.encode(vf, { keyFrame: i === 0 }); vf.close();
    }
    await withTimeout(venc.flush().then(() => { flushed = true; }), 10000, 'probe flush macet');
    const ms = performance.now() - t0;
    const ok = flushed && chunks >= frames * 0.9 && !err;
    return { ok, fps: ok ? Math.round(frames / Math.max(1, ms) * 1000) : 0 };
  } catch (e) {
    return { ok: false, fps: 0 };
  } finally {
    /* v2.15 FIX BOCOR SESI ENCODER: dulu bila flush probe kena timeout,
       exception melompati venc.close() → sesi encoder Media Foundation
       TETAP TERBUKA di GPU process. Sesi bocor menumpuk sepanjang batch →
       film ke-3 dst encoder hardware menolak/macet → tiap part membayar
       gagal-hardware 30-45 dtk + render ulang software → ekspor 4× lipat.
       Kini close() dijamin jalan di SEMUA jalur (sukses/gagal/timeout). */
    try { if (venc && venc.state !== 'closed') venc.close(); } catch (e) { }
  }
}
/* kompatibilitas: probe boolean dipakai tempat lain */
async function probeEncoder(cfg, W, H) { return (await probeEncoderFPS(cfg, W, H, 8)).ok; }

/* v2.14: hasil pemilihan encoder di-cache per setelan (WxH:bitrate:fps:acc)
   — batch ekspor banyak video tidak mengulang uji kecepatan tiap video */
let _accCache = null;
let _lastEnc = { kind: 'sw', fps: 0 };   /* utk ringkasan ekspor & hitung paralel */
/* v2.15: ADAPTASI ANTI-PELAN — bila encoder hardware jatuh berulang kali
   (stall/error → auto-retry software), jalur software dipakai untuk sisa
   sesi. Tanpa ini TIAP part berikutnya membayar lagi: gagal-hardware
   (watchdog 30-45 dtk) + render ulang software = dobel kerja → film
   ke-3 ke atas terasa berkali-kali lebih lama. */
let _hwFails = 0, _hwDemoted = false;
function noteHwFailure(msg) {
  if (_hwDemoted || state.acc === 'cpu') return;
  if (++_hwFails >= 2) {
    _hwDemoted = true; _accCache = null;
    console.warn('encoder hardware didemosi ke software untuk sisa sesi:', msg);
    toast('Encoder GPU berulang kali bermasalah — sisa ekspor memakai encoder CPU (lebih stabil)', 'warn');
  }
}
function resetAccAdaptation() { _hwFails = 0; _hwDemoted = false; _accCache = null; }
async function pickVCodecCfg(W, H, br, fps) {
  const base = ['avc1.640028', 'avc1.4D0028', 'avc1.42002A'];
  const mkHw = c => ({ codec: c, width: W, height: H, bitrate: br, framerate: fps, hardwareAcceleration: 'prefer-hardware' });
  const mkSw = c => ({ codec: c, width: W, height: H, bitrate: br, framerate: fps, hardwareAcceleration: 'prefer-software' });
  const key = `${W}x${H}:${br}:${fps}:${state.acc}`;
  if (_accCache && _accCache.key === key) { _lastEnc = _accCache.res.enc; return _accCache.res.cfg; }

  const probeKind = async (mk, kind) => {
    for (const c of base) {
      try {
        const cfg = mk(c);
        const s = await VideoEncoder.isConfigSupported(cfg);
        if (!s.supported) continue;
        const r = await probeEncoderFPS(cfg, W, H);
        if (r.ok && r.fps > 0) return { cfg, enc: { kind, fps: r.fps } };
      } catch (e) { }
    }
    return null;
  };

  let res = null;
  if (state.acc === 'gpu') {
    /* DIPAKSA GPU — bila encoder hardware tidak merespons, jatuh ke CPU
       dengan peringatan (ekspor tetap jalan, bukan gagal) */
    res = await probeKind(mkHw, 'hw');
    if (!res) {
      toast('Encoder GPU tidak merespons — otomatis memakai encoder CPU', 'warn');
      res = await probeKind(mkSw, 'sw');
    }
  } else if (state.acc === 'cpu') {
    res = (await probeKind(mkSw, 'sw')) || (await probeKind(mkHw, 'hw'));
  } else {
    /* OTOMATIS — ukur keduanya, pilih yang TERBUKTI lebih kencang.
       GPU harus lebih cepat ≥15% untuk mengalahkan CPU (stabil & hemat risiko).
       v2.15: bila hardware sudah didemosi (berulang kali macet di film
       sebelumnya), langsung software — tanpa uji GPU lagi. */
    const hw = (state.acc === 'auto' && _hwDemoted) ? null : await probeKind(mkHw, 'hw');
    const sw = await probeKind(mkSw, 'sw');
    res = !sw ? hw : (!hw ? sw : (hw.enc.fps >= sw.enc.fps * 1.15 ? hw : sw));
  }
  if (!res) {
    /* upaya terakhir: tanpa preferensi hardware */
    for (const c of base) {
      try {
        const cfg = { codec: c, width: W, height: H, bitrate: br, framerate: fps };
        const s = await VideoEncoder.isConfigSupported(cfg);
        const r = s.supported ? await probeEncoderFPS(cfg, W, H) : { ok: false };
        if (r.ok) { res = { cfg, enc: { kind: 'sw', fps: r.fps } }; break; }
      } catch (e) { }
    }
  }
  if (res) {
    _accCache = { key, res };
    _lastEnc = res.enc;
    return res.cfg;
  }
  return null;
}

/* v2.14: uji kecepatan encoder ringkas (1280×720) — dipakai kotak info GPU
   di modul EKSPOR agar pengguna tahu GPU-nya terpakai atau tidak */
async function quickAccProbe() {
  const base = ['avc1.640028', 'avc1.4D0028'];
  const one = async (hw) => {
    for (const c of base) {
      try {
        const cfg = { codec: c, width: 1280, height: 720, bitrate: 4e6, framerate: 30,
          ...(hw ? { hardwareAcceleration: 'prefer-hardware' } : { hardwareAcceleration: 'prefer-software' }) };
        if (!(await VideoEncoder.isConfigSupported(cfg)).supported) continue;
        const r = await probeEncoderFPS(cfg, 1280, 720, 24);
        if (r.ok) return r.fps;
      } catch (e) { }
    }
    return 0;
  };
  const hw = await one(true), sw = await one(false);
  return { hw, sw, hwWins: hw > 0 && hw >= sw * 1.15 };
}
async function pickACodec() {
  for (const c of ['mp4a.40.2', 'opus']) {
    try {
      const s = await AudioEncoder.isConfigSupported({ codec: c, sampleRate: 48000, numberOfChannels: 2, bitrate: 160000 });
      if (s.supported) return c;
    } catch (e) { }
  }
  return null;
}
/* v2.5: konfigurasi encoder SOFTWARE (tanpa GPU) — dipakai untuk percobaan
   ulang otomatis saat encoder GPU (Media Foundation) macet/berhenti */
async function pickSWCfg(W, H, br, fps) {
  for (const c of ['avc1.640028', 'avc1.4D0028', 'avc1.42002A']) {
    try {
      const cfg = { codec: c, width: W, height: H, bitrate: br, framerate: fps };
      const s = await VideoEncoder.isConfigSupported(cfg);
      if (s.supported) return cfg;
    } catch (e) { }
  }
  return null;
}
/* v2.5: bungkus promise dengan batas waktu — mencegah MACET TANPA PESAN
   (flush encoder / tulis disk / finalize muxer yang tidak pernah selesai) */
function withTimeout(p, ms, msg) {
  return new Promise((res, rej) => {
    const tm = setTimeout(() => rej(new Error(msg)), ms);
    Promise.resolve(p).then(
      v => { clearTimeout(tm); res(v); },
      e => { clearTimeout(tm); rej(e); });
  });
}
async function renderMix(start, durOut, spd = 1) {
  const sr = 48000, len = Math.max(1, Math.ceil(durOut * sr));
  const oc = new OfflineAudioContext(2, len, sr);
  /* v3.0: AUDIO SEHAT — rantai perbaikan: filter desis (opsional) →
     normalizer (RMS diukur sekali per video) → kompresor lembut.
     Bila mati, sumber tersambung langsung ke destination (dulu). */
  let sink = null;
  if (state.audioFix && state.audioFix.on) {
    sink = oc.createGain();
    let cur = sink;
    if (state.audioFix.hiss) {
      const hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 95; hp.Q.value = 0.6;
      const lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 11500;
      cur.connect(hp); hp.connect(lp); cur = lp;
    }
    const norm = oc.createGain();
    const rms = (typeof measureAudioRms === 'function') ? measureAudioRms() : 0;
    norm.gain.value = rms > 0.004 ? clamp(0.16 / rms, 0.5, 4) : 1;
    cur.connect(norm);
    const comp = oc.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 2.6;
    comp.attack.value = 0.01; comp.release.value = 0.24;
    norm.connect(comp); comp.connect(oc.destination);
  }
  const connectSrc = node => { if (sink) node.connect(sink); else node.connect(oc.destination); };
  /* v2.10 FIX: dulu s.start(0, start, durBuffer − start) melempar
     InvalidStateError ketika start > durasi buffer (mis. WAKTU MULAI 1:05
     padahal skor musik masih milik video sebelumnya yang lebih pendek) —
     inilah pemicu utama batch ekspor "selalu dibatalkan" sejak v2.9.
     Sekarang: audio asli dilewati bila sudah lewat, musik diputar BERULANG
     (loop) sehingga durasi buffer berapa pun tidak pernah crash.
     v2.12: kecepatan → audio asli diputar lebih cepat/lambat memakai
     playbackRate (pitch ikut naik/turun seperti efek fast-forward klasik). */
  if (state.audioBuffer && state.audioBuffer.duration > 0.01 && start < state.audioBuffer.duration - 0.01) {
    const s = oc.createBufferSource(); s.buffer = state.audioBuffer;
    s.playbackRate.value = spd;
    const g = oc.createGain(); g.gain.value = state.audioGain;
    s.connect(g); connectSrc(g);
    s.start(0, start, Math.max(0.01, Math.min(durOut, (state.audioBuffer.duration - start) / spd)));
  }
  if (state.music.buffer && state.music.buffer.duration > 0.01) {
    const s = oc.createBufferSource(); s.buffer = state.music.buffer;
    s.playbackRate.value = spd;
    const g = oc.createGain(); g.gain.value = state.music.gain;
    s.connect(g); connectSrc(g);
    s.loop = true;   /* buffer lebih pendek dari part → mengulang, bukan crash */
    s.start(0, start % state.music.buffer.duration, durOut);
  }
  /* v3.0: TTS NARASI — suara AI offline diletakkan di waktu media
     state.tts.at; ikut kecepatan video (spd). Potongan di luar part
     dilewati; bagian yang terpotong di awal part disesuaikan. */
  const T = state.tts;
  if (T && T.buffer && T.buffer.duration > 0.01) {
    let outOffN = (T.at - start) / spd, srcOff = 0;
    if (outOffN < 0) { srcOff = -outOffN * spd; outOffN = 0; }
    if (outOffN < durOut - 0.01 && srcOff < T.buffer.duration) {
      const s = oc.createBufferSource(); s.buffer = T.buffer;
      s.playbackRate.value = spd;
      const g = oc.createGain(); g.gain.value = clamp(T.gain == null ? 0.9 : T.gain, 0, 1.6);
      s.connect(g); connectSrc(g);
      s.start(outOffN, srcOff, Math.max(0.01, Math.min(durOut - outOffN, (T.buffer.duration - srcOff) / spd)));
    }
  }
  return oc.startRendering();
}
/* ---------- ENCODING AUDIO (v2.15: PER BLOK 60 dtk — RAM tetap datar) ----------
   Dulu: SELURUH audio part dirender dulu oleh OfflineAudioContext →
   AudioBuffer sebesar durasi part (film 60 mnt ≈ 700 MB Float32 di RAM
   per part!) baru di-encode. Kini: blok 60 dtk dirender & di-encode
   bergantian. Hasil identik — offset sumber & posisi loop musik kontinu
   antar blok (blok k = waktu output [k·60, (k+1)·60) → sumber mulai
   seg.start + outOff·spd), stempel waktu dihitung dari penghitung global.
   v3.0: mergeOff = offset waktu output global saat GABUNG VIDEO;
   fbuf dipakai ulang antar detik (kurangi tekanan GC ±40%). */
async function encodeAudioStream(muxer, seg, durOut, spd = 1, codec, mergeOff = 0) {
  const sr = 48000, chs = 2;
  const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: e => console.warn('aenc', e) });
  aenc.configure({ codec, sampleRate: sr, numberOfChannels: chs, bitrate: 160000 });
  try {
    const BLK = 60;
    const fbuf = new Float32Array(sr * chs);
    let outOff = 0;
    while (outOff < durOut - 1e-6) {
      if (state.abort) throw new Error('Dibatalkan');
      if (state.exportFatal) throw state.exportFatal;
      const len = Math.min(BLK, durOut - outOff);
      const mix = await renderMix(seg.start + outOff * spd, len, spd);
      const L = mix.getChannelData(0), R2 = chs > 1 ? mix.getChannelData(1) : L;
      for (let off = 0; off < mix.length; off += sr) {
        if (state.abort) throw new Error('Dibatalkan');
        if (state.exportFatal) throw state.exportFatal;
        const n = Math.min(sr, mix.length - off);
        fbuf.set(L.subarray(off, off + n), 0);
        if (chs > 1) fbuf.set(R2.subarray(off, off + n), n);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: chs,
          timestamp: Math.round((mergeOff + outOff + off / sr) * 1e6), data: fbuf });
        aenc.encode(ad); ad.close();
        let drainMs = 0;
        while (aenc.encodeQueueSize > 10) { await sleep(2); if (state.abort) throw new Error('Dibatalkan'); if (state.exportFatal) throw state.exportFatal; if ((drainMs += 2) > 30000) throw new Error('encoder audio macet'); }
      }
      outOff += len;
    }
    await aenc.flush();
  } finally {
    try { aenc.close(); } catch (e) { }   /* v2.15: sesi encoder audio selalu ditutup */
  }
}
async function ensureFontsReady() {
  try {
    await Promise.all([state.font, 'Chakra Petch', 'JetBrains Mono'].map(f => document.fonts.load(`700 64px "${f}"`)));
    await document.fonts.ready;
  } catch (e) { }
}

/* nama file output per part */
function partFileName(title, prefix, idx) {
  return `${slug(title)}${prefix !== '#' ? '_' + prefix.replace(/\s+/g, '_') : ''}_${String(idx).padStart(2, '0')}.mp4`;
}

/* ---------- JUMLAH RENDER PARALEL ----------
   v2.14: bila encoder GPU terbukti hidup, paralel otomatis naik sampai 6×
   (NVENC/QuickSync/AMF sanggup melayani banyak sesi sekaligus). */
function pickParallelCount(parts, hwOk = false) {
  if (state.parallel > 0) return Math.max(1, Math.min(state.parallel, parts));
  const cores = navigator.hardwareConcurrency || 8;
  /* v2.15: GPU TERINTEGRASI (Intel Iris/UHD, AMD APU) — memori bersama
     dgn RAM; paralel 6× membanjiri iGPU (encode+decode 6 sesi) → ekspor
     justru merambat. Di iGPU langit-langitnya 4×. */
  if (hwOk && state._igpu) return Math.max(2, Math.min(4, parts, Math.floor(cores / 2)));
  return hwOk
    ? Math.max(2, Math.min(6, parts, Math.floor(cores / 2)))
    : Math.max(1, Math.min(4, parts, Math.floor(cores / 3)));
}

/* ---------- FALLBACK: rantai seek per frame (lama) ----------
   Dipakai untuk audio-only (tanpa frame video) dan bila browser
   tanpa requestVideoFrameCallback. noSeek = audio (tidak perlu seek)
   v2.12: spd = kecepatan — frame ke-i = waktu output i/fps → sumber
   i*spd/fps; PTS output tetap i*1e6/fps (monoton rapat). */
async function renderFramesBySeek(v, ecv, ec, venc, seg, fps, slot, doneCb, noSeek = false, spd = 1, tsOff = 0) {
  const n = Math.max(1, Math.round((seg.end - seg.start) / spd * fps));
  let seekP = null;
  for (let i = 0; i < n; i++) {
    if (state.abort) throw new Error('Dibatalkan');
    if (state.exportFatal) throw state.exportFatal;
    if (seekP) { await seekP; seekP = null; }
    const t = Math.min(seg.start + i * spd / fps, Math.max(0, (v.duration || seg.end) - 0.011));
    setCompSrc(v);
    drawComposition(ec, ecv.width, ecv.height, t);
    setCompSrc(null);
    const vf = new VideoFrame(ecv, { timestamp: Math.round(tsOff + i * 1e6 / fps), duration: Math.round(1e6 / fps) });
    venc.encode(vf, { keyFrame: i % (fps * 2) === 0 }); vf.close();
    if (!noSeek && i + 1 < n) seekP = seekTo(seg.start + (i + 1) * spd / fps, v);
    while (venc.encodeQueueSize > 14) await sleep(2);
    slot.fr = i + 1;
    doneCb && doneCb();
  }
  return n;
}

/* ---------- WORKER SATU PART (v2.2 TURBO) ----------
   Elemen video sendiri + canvas sendiri + muxer sendiri.
   Frame diambil sambil video diputar (tanpa seek per frame). */
async function renderPartWorker(seg, srcUrl, W, H, fps, br, vCfg, aCodec, slot, doneCb, mergeCtx = null) {
  /* v2.12: KECEPATAN video — 1 = normal, 2 = 2× cepat (part ½ lebih pendek),
     0.5 = slow-motion. Durasi output = durasi sumber ÷ spd. */
  const spd = clamp(state.speed || 1, 0.25, 4);
  const durS = (seg.end - seg.start) / spd;
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto';
  v.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:2px;height:2px;opacity:0';
  v.src = srcUrl;
  document.body.appendChild(v);
  v.addEventListener('error', () => console.error(`part ${seg.i + 1} media error: code=${v.error && v.error.code} msg=${v.error && v.error.message}`));
  let venc = null, _stage = 'init', n = 0;
  let audioP = null, audioErr = null;   /* v3.0: audio paralel dgn video */
  try {
    await new Promise((res, rej) => {
      const ok = () => { clean(); res(); };
      const bad = () => { clean(); rej(new Error('worker: meta tidak termuat')); };
      const clean = () => { v.removeEventListener('loadedmetadata', ok); v.removeEventListener('error', bad); };
      v.addEventListener('loadedmetadata', ok); v.addEventListener('error', bad);
      setTimeout(() => { if (v.readyState >= 1) ok(); }, 6000);
    });
    _stage = 'seek0';
    await seekTo(seg.start, v);

    _stage = 'canvas';
    const ecv = document.createElement('canvas'); ecv.width = W; ecv.height = H;
    const ec = ecv.getContext('2d', { alpha: false });
    _stage = 'muxer';
    /* v2.15: part BESAR ditulis LANGSUNG ke disk (StreamTarget → IPC 8 MB) —
       dulu SELURUH berkas MP4 menumpuk di RAM (ArrayBufferTarget) sampai
       render selesai; part 30-60 mnt = gigabyte per part di memori,
       batch film panjang lalu kehabisan memori → ekspor merambat.
       Part kecil tetap in-memory (fastStart penuh, kompatibilitas maks).
       v3.0: GABUNG VIDEO — semua part memakai SATU muxer bersama milik
       driver merge (satu file MP4 kontinu di disk); worker tidak menulis
       file sendiri, tidak finalize — hanya meng-encode. */
    const nm = partFileName(state.title, state.partPrefix, seg.i + 1);
    const estBytes = Math.round(durS * (br + (aCodec ? 160000 : 0)) / 8) + 4e6;
    const streamDisk = !mergeCtx && estBytes > (state._streamThreshMB || 384) * 1048576;
    let wsId = null, wsErr = null, wsPath = mergeCtx ? mergeCtx.outPath : nm, chain = Promise.resolve(), sent = 0;
    const mkAudio = aCodec ? { audio: { codec: aCodec === 'mp4a.40.2' ? 'aac' : 'opus', numberOfChannels: 2, sampleRate: 48000 } } : {};
    const mkVideo = { codec: 'avc', width: W, height: H, frameRate: fps };
    let muxer;
    if (mergeCtx) {
      muxer = mergeCtx.muxer;
      wsErr = mergeCtx.wsErr;
    } else if (streamDisk) {
      const w = await window.kinostra.beginWrite(slot.dir, nm);
      wsId = w.id; wsPath = w.path;
      console.info(`part ${seg.i + 1}: muxer streaming disk aktif (±${fmtMB(estBytes)}) — RAM tetap datar (v2.15)`);
      muxer = new Mp4Muxer.Muxer({
        target: new Mp4Muxer.StreamTarget({
          chunked: true, chunkSize: 8 * 1024 * 1024,
          /* onData(data, posisi) — tulis-acak ke disk via pwrite (IPC);
             rantai `chain` menjaga urutan panggilan, patch header mdat di
             posisi lama oleh mp4-muxer (fastStart:false) tetap benar */
          onData: (data, pos) => {
            if (wsErr) return;
            sent += data.byteLength;
            slot.saveProg = Math.min(0.98, sent / estBytes);
            chain = chain.then(() => window.kinostra.writeChunkAt(wsId, data, pos)).catch(e => { wsErr = wsErr || e; });
          }
        }),
        fastStart: false, firstTimestampBehavior: 'offset',
        video: mkVideo, ...mkAudio
      });
    } else {
      muxer = new Mp4Muxer.Muxer({
        target: new Mp4Muxer.ArrayBufferTarget(), fastStart: 'in-memory', firstTimestampBehavior: 'offset',
        video: mkVideo, ...mkAudio
      });
    }
    if (aCodec) {
      _stage = 'audio';
      /* v2.15: encode audio PER BLOK — RAM datar di part panjang
         v3.0 OPTIMASI KECEPATAN: audio di-encode BERSAMAAN dengan render
         video (dulu audio selesai dulu → baru video: waktu menjumlah).
         Kedua encoder mengalir ke muxer yang sama — mp4-muxer menerima
         potongan video/audio ter-selang; hasil identik, ±30-45% lebih cepat. */
      audioP = withTimeout(
        encodeAudioStream(muxer, seg, durS, spd, aCodec, mergeCtx ? mergeCtx.off : 0),
        300000, 'encoding audio macet'
      ).catch(e => { audioErr = audioErr || e; });
    }
    _stage = 'configure';
    const hw = vCfg.hardwareAcceleration === 'prefer-hardware';
    /* v2.7 FIX "SUARA JALAN, GAMBAR BEKU": encoder GPU Windows (Media
       Foundation) dengan latencyMode 'quality' dapat mengeluarkan chunk
       B-frame berurutan DECODE (timestamp bolak-balik). mp4-muxer melempar
       error monotonic DI DALAM callback output → pengecualian tertelan
       diam-diam → hanya beberapa frame pertama masuk MP4 → gambar beku +
       audio normal + ekspor "berhasil". Perisai 4 lapis:
       1) latencyMode 'realtime' utk SEMUA encoder (tanpa reorder B-frame)
       2) timestamp turun > 5 ms terdeteksi → gagal cepat → auto-retry SW
       3) error encoder diteruskan ke promise (bukan hanya console)
       4) verifikasi jumlah chunk video setelah flush (≥ 90% frame) */
    let vChunks = 0, lastVts = -Infinity, vencErrMsg = null;
    venc = new VideoEncoder({
      output: (c, m) => {
        const ts = typeof c.timestamp === 'number' ? c.timestamp : 0;
        if (vChunks > 0 && ts <= lastVts) {
          if (lastVts - ts > 5000) {
            vencErrMsg = `encoder mengeluarkan frame dengan urutan waktu tidak naik (${Math.round(lastVts / 1000)} → ${Math.round(ts / 1000)} ms)`;
            console.error('venc-stream', vencErrMsg);
          }
          return; /* jangan masukkan chunk rusak/nol-durasi ke muxer */
        }
        lastVts = ts; vChunks++;
        muxer.addVideoChunk(c, m);
      },
      error: e => { vencErrMsg = (e && e.message) || String(e); console.error('venc', vencErrMsg); }
    });
    venc.configure({ ...vCfg, latencyMode: 'realtime' });
    const CAP = hw ? 40 : 14;

    /* gambar 1 frame pada waktu media m → encode dengan timestamp nyata
       v2.12: PTS = waktu OUTPUT = (m − mulai part) ÷ kecepatan
       v3.0: + offset global mergeCtx.off saat GABUNG VIDEO */
    const drawAt = (t, ts) => {
      setCompSrc(v);
      drawComposition(ec, W, H, t);
      setCompSrc(null);
      const vf = new VideoFrame(ecv, { timestamp: ts, duration: Math.round(1e6 / fps) });
      venc.encode(vf, { keyFrame: n % (fps * 2) === 0 }); vf.close();
      n++; slot.fr = n;
    };
    const outTs = (m) => Math.max(0, Math.round((((mergeCtx ? mergeCtx.off : 0) + (m - seg.start) / spd) * 1e6)));

    if (RVFC_OK && !state.isAudio) {
      /* ============ v2.2: CAPTURE PLAYBACK (tanpa seek per frame) ============
         v2.5: + WATCHDOG ANTI-MACET. Penyebab lama ekspor "macet di bagian
         akhir tanpa pesan": frame callback (rVFC) berhenti memicu di frame
         terakhir & event ended tidak sampai, atau encoder GPU berhenti
         mengeluarkan output → promise render tidak pernah selesai.
         Sekarang interval 250 ms memantau: video selesai? waktu media
         sudah mencapai akhir part? video error? encoder diam terlalu
         lama? → semua diarahkan SELESAI atau GAGAL DENGAN PESAN JELAS. */
      _stage = 'stream';
      /* v2.11 FIX "KADANG GERAK KADANG BEKU": dulu capRate mulai 2× dan bisa
         naik sampai 4× — di atas kemampuan decoder/compositor, frame sumber
         dibuang beramai-ramai, mediaTime antar frame tersaji LOMPAT, PTS
         ekspor ikut bolong → pemutar menahan frame lama berdetik-detik.
         Sekarang: mulai 1.5×, turun SEGERA saat ada frame hilang, dan setiap
         lompatan DIISI ULANG dengan seek presisi (refillGap) sehingga aliran
         PTS selalu rapat & mulus.
         v2.14: bila encoder GPU (hardware) aktif, langit-langit dinaikkan
         ke 3× — encoding bukan lagi hambatan, decoder-lah penentu. */
      const RATE_MAX = hw ? 3 : (_xPar >= 3 ? 2 : 2.5);
      /* v2.12: toleransi & target lompatan diskalakan kecepatan —
         pada spd 2× jarak sumber antar frame tampil 2× lebih renggang */
      const frameGapTol = 1.8 / fps * spd;
      let capRate = 1.5, dAcc = 0, dN = 0, lastM = -1, hadFirst = false;
      const applyRate = () => { try { v.playbackRate = Math.min(4.2, capRate * spd); } catch (e) { } };
      applyRate();
      let lastAct = Date.now(), qStallSince = 0;
      let refilling = false, refillN = 0, maxGapMs = 0;
      /* v2.11: isi ulang frame yang hilang di interval (from, to) — seek
         presisi slot per slot, encode dengan PTS aslinya. Dipanggil SEBELUM
         frame@to di-encode agar urutan PTS tetap naik. lastAct disegarkan
         tiap slot supaya watchdog 30 dtk tidak mengira render diam. */
      const refillGap = async (from, to) => {
        const step = spd / fps;
        let t = from + step, k = 0;
        while (t < to - step * 0.5) {
          if (state.abort) throw new Error('Dibatalkan');
          if (state.exportFatal) throw state.exportFatal;
          await seekTo(Math.min(t, Math.max(0, (v.duration || seg.end) - 0.011)), v);
          drawAt(t, outTs(t));
          lastAct = Date.now(); k++; t += step;
          doneCb && doneCb();
        }
        refillN += k; return k;
      };
      await new Promise((resolve, rej) => {
        let finished = false;
        const stop = () => { try { v.pause(); } catch (e) { } };
        const fin = () => { if (finished) return; finished = true; stop(); clearInterval(watch); resolve(); };
        const fail = (err) => { if (finished) return; finished = true; stop(); clearInterval(watch); rej(err); };
        /* --- v2.5: WATCHDOG (detak 250 ms) --- */
        const watch = setInterval(() => {
          if (finished) { clearInterval(watch); return; }
          if (state.abort) return fail(new Error('Dibatalkan'));
          if (state.exportFatal) return fail(state.exportFatal);   /* v2.10: part lain sudah gagal */
          /* v2.7: error encoder terdeteksi → gagal cepat → retry software */
          if (vencErrMsg) return fail(new Error('encoder video bermasalah: ' + vencErrMsg));
          if (v.error) return fail(new Error('video rusak/tak terbaca: ' + (v.error.message || ('kode ' + v.error.code))));
          /* KUNCI FIX: tangani akhir video walau frame callback mati —
             inilah yang dulu bikin macet selamanya di bagian akhir */
          if (v.ended || v.currentTime >= seg.end - 0.004) return fin();
          const now = Date.now();
          if (venc.encodeQueueSize > CAP) {
            if (!qStallSince) qStallSince = now;
            else if (now - qStallSince > 45000)
              return fail(new Error('encoder video macet (antrean tidak mengalir 45 dtk) — akan dicoba ulang otomatis dengan encoder software'));
          } else qStallSince = 0;
          if (now - lastAct > 30000)
            return fail(new Error('render diam total 30 dtk — akan dicoba ulang otomatis dengan encoder software'));
          /* dorong ulang bila video diam padahal encoder tidak penuh */
          if (v.paused && !refilling && !v.seeking && venc.encodeQueueSize <= CAP && !v.ended) {
            try { const p = v.play(); if (p && p.catch) p.catch(err => fail(new Error('video tidak bisa dilanjut: ' + (err.message || err)))); }
            catch (err) { fail(new Error('video tidak bisa dilanjut: ' + (err.message || err))); }
          }
        }, 250);
        const onFrame = async (now, meta) => {
          try {
            if (finished) return;
            lastAct = Date.now();
            if (state.abort) return fail(new Error('Dibatalkan'));
            if (state.exportFatal) return fail(state.exportFatal);   /* v2.10 */
            const m = meta.mediaTime;
            /* v3.1 ANTI-GLITCH: laporan mediaTime yang TIDAK WAJAR (melompat
               jauh melebihi posisi putar elemen — decoder/kfile sesekali
               melaporkan durasi file sebagai mediaTime) TIDAK boleh dianggap
               akhir part & tidak di-encode. Dulu ini bikin ekspor "selesai"
               berisi cuma 3-4 frame (video+audio terpotong serentak). */
            if (hadFirst && !v.ended && !v.seeking && m - lastM > 1.0 && Math.abs(m - v.currentTime) > 0.75) {
              return pump();   /* buang laporan palsu, minta frame berikutnya */
            }
            if (v.ended || m >= seg.end - 0.004) return fin();
            if (m >= seg.start - 0.06 && m > lastM) {
              /* v2.11: DETEKSI FRAME HILANG — lompatan mediaTime > 1.8× durasi
                 frame berarti decoder/compositor membuang frame. Isi slot yang
                 bolong lewat seek presisi SEBELUM frame m di-encode supaya
                 urutan PTS rapat (tanpa durasi sampel multi-detik = beku). */
              const gap = hadFirst ? m - lastM : 0;
              if (gap > frameGapTol) {
                maxGapMs = Math.max(maxGapMs, gap * 1000);
                refilling = true; stop();
                const k = await refillGap(lastM, m);
                if (finished) return;
                await seekTo(Math.min(m, Math.max(0, (v.duration || seg.end) - 0.011)), v);
                refilling = false;
                if (finished) return;
                /* decoder kewalahan pada rate ini → turun SEGERA */
                if (capRate > 1) { capRate = Math.max(1, capRate - 0.5); applyRate(); }
                dAcc = 0; dN = 0;
              }
              drawAt(m, outTs(m));
              hadFirst = true;
              /* rate adaptif: naik HANYA bila jendela bersih tanpa lompatan
                 v2.12: target jarak antar frame = spd/fps (waktu sumber) */
              if (lastM >= 0) {
                const d = m - lastM;
                if (d > 0 && d < 0.6 * spd) {
                  dAcc += d; dN++;
                  if (dN >= 24) {
                    const avg = dAcc / dN; dAcc = 0; dN = 0; const tg = spd / fps;
                    if (avg > tg * 1.5 && capRate > 1) { capRate = Math.max(1, capRate - 0.5); applyRate(); }
                    else if (avg < tg * 1.18 && capRate < RATE_MAX) { capRate = Math.min(RATE_MAX, capRate + 0.5); applyRate(); }
                  }
                }
              }
              lastM = m;
              doneCb && doneCb();
            }
            /* backpressure: pause bila encoder tertinggal, lanjut otomatis */
            if (venc.encodeQueueSize > CAP) { stop(); setTimeout(pump, 5); return; }
            pump();
          } catch (e) {
            refilling = false;
            fail(e && e.message ? e : new Error(String(e)));
          }
        };
        const pump = () => {
          if (finished) return;
          if (state.abort) return fail(new Error('Dibatalkan'));
          if (state.exportFatal) return fail(state.exportFatal);   /* v2.10 */
          if (v.ended || lastM >= seg.end - 0.004) return fin();
          if (v.paused) {
            try { const p = v.play(); if (p && p.catch) p.catch(err => fail(new Error('video tidak bisa diputar: ' + (err.message || err)))); }
            catch (err) { return fail(new Error('video tidak bisa diputar: ' + (err.message || err))); }
          }
          try { v.requestVideoFrameCallback(onFrame); } catch (e) { fin(); }
        };
        v.addEventListener('ended', fin, { once: true });
        v.addEventListener('error', () => fail(new Error('video error saat dirender')), { once: true });
        pump();
      });
      if (refillN) console.info(`part ${seg.i + 1}: ${n} frame dirender · ${refillN} diisi-ulang (lompatan maks ${Math.round(maxGapMs)} ms) — anti-beku v2.11 aktif`);
      if (n === 0) {
        /* sumber aneh / tidak menghasilkan frame — jalankan jalur lama */
        _stage = 'fallback-seek';
        await renderFramesBySeek(v, ecv, ec, venc, seg, fps, slot, doneCb, false, spd, mergeCtx ? mergeCtx.off : 0);
        n = slot.fr;
      }
    } else {
      /* audio-only / tanpa rVFC: jalur frame loop (tanpa seek utk audio) */
      _stage = 'frames';
      await renderFramesBySeek(v, ecv, ec, venc, seg, fps, slot, doneCb, !!state.isAudio, spd, mergeCtx ? mergeCtx.off : 0);
      n = slot.fr;
    }

    _stage = 'flush';
    slot.stage = 'flush';
    /* v3.0: tunggu encoder audio paralel selesai sebelum flush video */
    if (audioP) { await audioP; if (audioErr) throw audioErr; }
    /* v2.5: flush dengan batas waktu — encoder yang hang tidak lagi
       membuat ekspor macet selamanya tanpa pesan */
    await withTimeout(venc.flush(), 60000, 'encoder video tidak selesai (flush macet 60 dtk)');
    venc.close(); venc = null;
    /* v2.7: VERIFIKASI ALIRAN VIDEO — tangkap dua mode kegagalan encoder
       GPU yang "diam": (a) error/reorder terdeteksi saat merender,
       (b) output kurang dari 90% frame yang dirender. Tanpa ini MP4 tetap
       tersimpan tapi isinya gambar beku. Gagal di sini → auto-retry dengan
       encoder software oleh exportPartsToDir. */
    if (vencErrMsg) throw new Error('aliran video tidak valid: ' + vencErrMsg);
    /* v2.11: verifikasi diperketat 90% → 98% — encoder yang membuang output
       di tengah stream kini terdeteksi → auto-retry software, bukan MP4 beku */
    const minChunks = Math.max(1, Math.ceil(n * 0.98));
    if (vChunks < minChunks)
      throw new Error(`encoder hanya mengeluarkan ${vChunks} dari ${n} frame (gambar akan beku)`);
    _stage = 'finalize';
    slot.stage = 'finalize';
    if (wsErr) throw wsErr;
    if (mergeCtx && mergeCtx.wsErr) throw mergeCtx.wsErr;
    if (mergeCtx) {
      /* v3.0: part gabung — driver merge yang mem-finalize & menyimpan */
      slot.prog = 1; slot.fr = slot.total = Math.max(slot.total, n);
      slot.saveProg = 1;
      return { name: mergeCtx.outName, path: mergeCtx.outPath, size: 0, merged: true };
    }
    await withTimeout(Promise.resolve().then(() => muxer.finalize()), 30000, 'penulisan header MP4 macet');
    _stage = 'save';
    slot.stage = 'save';
    let wr;
    if (streamDisk) {
      /* v2.15: semua byte sudah mengalir ke disk SELAMA render — tinggal
         menuntaskan rantai tulis, menutup stream, membaca ukuran berkas */
      if (wsErr) throw wsErr;
      await withTimeout(chain, 180000, 'menulis file ke disk macet (cek ruang kosong disk)');
      if (wsId) { const id = wsId; wsId = null; await window.kinostra.endWrite(id); }
      const stt = await window.kinostra.stat(wsPath);
      wr = { path: wsPath, size: (stt && stt.ok) ? stt.size : sent };
    } else {
      wr = await withTimeout(
        saveBufferToDir(muxer.target.buffer, slot.dir, nm, (w, t) => { slot.saveProg = w / t; }),
        180000, 'menyimpan file ke disk macet (cek ruang kosong disk)');
    }
    slot.prog = 1; slot.fr = slot.total = Math.max(slot.total, n);
    return { name: wr.path.split(/[\\/]/).pop(), path: wr.path, size: wr.size };
  } catch (err) {
    if (_stage !== 'frames' && _stage !== 'stream') console.error(`part ${seg.i + 1} GAGAL di tahap ${_stage}: ${err && err.name || 'ERR'} | ${err && err.message || err}`);
    throw err;
  } finally {
    try { if (venc && venc.state !== 'closed') venc.close(); } catch (e) { }
    /* v2.15: bila gagal di tengah render streaming → buang berkas setengah jadi */
    try { if (wsId) { const id = wsId; wsId = null; window.kinostra.abortWrite(id).catch(() => { }); } } catch (e) { }
    try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { }
    try { v.remove(); } catch (e) { }
  }
}

/* ---------- INTI RENDER: SEMUA PART PARALEL -> folder dir ----------
   ui: {title(segs), prog(p), sub(s), canceled()} */
async function exportPartsToDir(dir, ui) {
  await ensureFontsReady();
  /* v2.6: pastikan decode audio asli (yang kini berjalan di belakang saat
     loading) sudah selesai sebelum menentukan ada tidaknya track audio */
  if (state.audioReady) { try { await state.audioReady; } catch (e) { } }
  /* v3.1: ZOOM PEMBICARA — analisis otomatis bila setelan aktif & video
     belum dianalisis (berlaku untuk ekspor tunggal, split & BATCH EKSPOR:
     semua video di kotak otomatis dianalisis satu per satu saat diproses).
     Gagal internal (tanpa internet pertama kali dsb.) → lanjut TANPA zoom. */
  if (state.spk && state.spk.on && !state.isAudio && !state.spk.ready && !state.spk.scanning) {
    if (state.spk.auto) {
      try {
        if (ui.sub) ui.sub('Zoom pembicara · menganalisis siapa yang bicara…');
        await analyzeSpeakers({
          prog: p => { if (ui.prog) ui.prog(p * 0.85); },
          stat: s => { if (ui.sub) ui.sub('Zoom pembicara · ' + s); }
        });
      } catch (e) {
        console.warn('analisis pembicara gagal — lanjut tanpa zoom:', e && e.message);
      }
    } else if (ui.sub) ui.sub('Zoom pembicara aktif tapi video belum dianalisis — hasil TANPA zoom');
  }
  const fps = state.fps, sc = parseFloat(state.scale), q = QUAL[state.quality];
  /* v2.12: kecepatan video global — durasi output = sumber ÷ spd */
  const spd = clamp(state.speed || 1, 0.25, 4);
  const dims = outDims(sc), { W, H } = dims;
  const br = Math.round(q.br * (sc === 1 ? 1 : sc === 0.75 ? 0.62 : 0.38));
  /* v2.14: pilih encoder sesuai AKSELERASI (auto = uji kecepatan GPU vs CPU) */
  const vCfg = await pickVCodecCfg(W, H, br, fps);
  if (!vCfg) throw new Error('Tidak ada codec video yang didukung engine');
  const enc = _lastEnc;
  /* v2.5: cadangan encoder SOFTWARE untuk percobaan ulang otomatis */
  const swCfg = await pickSWCfg(W, H, br, fps);
  const wantAudio = !!(state.audioBuffer || state.music.buffer);
  const aCodec = wantAudio ? await pickACodec() : null;
  if (wantAudio && !aCodec) toast('Encoder audio tak tersedia — ekspor tanpa audio', 'warn');
  const segs = segments();
  const par = pickParallelCount(segs.length, enc.kind === 'hw');
  _xPar = par;   /* v2.11: langit-langit playbackRate capture menyesuaikan beban paralel */
  const hw = vCfg.hardwareAcceleration === 'prefer-hardware';

  /* slot progres per part — total frame = durasi output × fps */
  const slots = segs.map(s => ({ seg: s, dir, prog: 0, fr: 0, total: Math.max(1, Math.round((s.end - s.start) / spd * fps)), working: false, stage: null, saveProg: 0 }));
  const totalFr = slots.reduce((a, s) => a + s.total, 0);
  const t0 = performance.now();
  let lastUi = 0;
  const uiTick = (force) => {
    const now = performance.now();
    if (!force && now - lastUi < 120) return;
    lastUi = now;
    const done = slots.reduce((a, s) => a + Math.min(s.fr, s.total), 0);
    if (ui.prog) ui.prog(done / totalFr);
    if (ui.sub) {
      const el = Math.max(0.001, (now - t0) / 1000);
      const rt = (done / fps / el);
      const parts = slots.map(s => {
        const pct = Math.round(100 * Math.min(s.fr, s.total) / s.total);
        const stg = s.stage === 'flush' ? '· FLUSH' : s.stage === 'finalize' ? '· FINAL' : s.stage === 'save' ? '· SIMPAN' : '';
        const tag = s.retried && s.working ? ' (ULANGI-SW)' : '';
        return s.working ? `P${String(s.seg.i + 1).padStart(2, '0')} ${pct}%${tag}${stg}` : null;
      }).filter(Boolean).join(' · ');
      ui.sub(`${parts || 'menunggu…'}${rt > 0.05 ? ` · ${rt.toFixed(1)}× realtime` : ''}`);
    }
  };

  /* v2.6: file virtual (impor/batch streaming) — worker memutar langsung
     dari disk via kfile:// (Range), tanpa menyalin file ke memori
     v3.0: dibuat LAZY — LANJUTKAN EKSPOR bisa melewati semua part tanpa
     menyentuh src (state.file uji/korup tidak membuat createObjectURL meledak) */
  let _srcUrl = null;
  const getSrcUrl = () => {
    if (_srcUrl == null) _srcUrl = state.file.virtual ? state.file.kurl : URL.createObjectURL(state.file);
    return _srcUrl;
  };
  const results = new Array(segs.length).fill(null);
  state.exportFatal = null;   /* v2.10: mulai ekspor baru — bersihkan sisa gagal lama */
  try {
    if (ui.title) ui.title(segs);
    if (ui.prog) ui.prog(0);
    if (ui.sub) ui.sub(`encoder ${enc.kind === 'hw' ? `GPU ${enc.fps}fps` : `CPU ${enc.fps}fps`} · ${par} render paralel${RVFC_OK && !state.isAudio ? ' · turbo stream' : ''}${spd !== 1 ? ` · kecepatan ${spd}×` : ''}…`);

    /* jalankan worker dengan batas `par` sekaligus (antrean)
       v2.10: kegagalan part TIDAK lagi men-set state.abort (flag batal
       milik pengguna) — cukup state.exportFatal supaya worker lain berhenti.
       Penelepon (ekspor tunggal / batch) menerima Error aslinya dan bisa
       menampilkan penyebabnya; batch menandai video GAGAL lalu LANJUT. */
    let cursor = 0;
    const launch = async () => {
      while (cursor < slots.length && !xAborted()) {
        const idx = cursor++;
        const slot = slots[idx];
        /* v3.0: LANJUTKAN EKSPOR — lewati part yang filenya SUDAH ADA di
           folder output (hasil ekspor sebelumnya yang tertidur/gagal di
           tengah). File part utuh = tanda part itu selesai dirender. */
        if (state.resumeExport && !state.isAudio) {
          try {
            const nm0 = partFileName(state.title, state.partPrefix, slot.seg.i + 1);
            const st0 = await window.kinostra.statJoin(dir, nm0);
            if (st0 && st0.ok && st0.size > 51200) {
              results[idx] = { name: nm0, path: st0.path, size: st0.size, skipped: true };
              slot.prog = 1; slot.fr = slot.total; slot.saveProg = 1;
              uiTick(true);
              continue;
            }
          } catch (e) { }   /* statJoin tak tersedia / gagal → render normal */
        }
        /* v3.0: KOMPRES PINTAR — bitrate dihitung dari TARGET UKURAN per part
           (bitrate = byte target ÷ durasi output − bitrate audio) */
        let cfgPart = vCfg, swPart = swCfg;
        if (state.targetMB > 0) {
          const durP = Math.max(0.5, (slot.seg.end - slot.seg.start) / spd);
          const brP = Math.round(clamp((state.targetMB * 8388608 * 0.93) / durP - 160000, 150000, 20e6));
          cfgPart = { ...vCfg, bitrate: brP };
          swPart = swCfg ? { ...swCfg, bitrate: brP } : null;
        }
        slot.working = true; uiTick(true);
        try {
          results[idx] = await renderPartWorker(slot.seg, getSrcUrl(), W, H, fps, br, cfgPart, aCodec, slot, () => uiTick(false));
        } catch (e) {
          /* v2.5: RETRY OTOMATIS 1× dengan encoder SOFTWARE — penyembuh
             utama "ekspor macet di bagian akhir" (encoder GPU berhenti).
             Jangan ulangi bila user membatalkan sendiri / part lain gagal.
             v2.15: kegagalan jalur hardware dicatat — 2× jatuh → sisa batch
             otomatis memakai software (anti-pelan, tanpa dobel kerja). */
          if (hw && !xAborted()) noteHwFailure(e && e.message || String(e));
          if (!xAborted() && swCfg) {
            console.warn(`part ${idx + 1} gagal (${e && e.message || e}) — ulangi 1× dengan encoder software`);
            slot.fr = 0; slot.stage = null; slot.saveProg = 0; slot.retried = true; slot.working = true; uiTick(true);
            try {
              results[idx] = await renderPartWorker(slot.seg, getSrcUrl(), W, H, fps, br, swPart || swCfg, aCodec, slot, () => uiTick(false));
              console.info(`part ${idx + 1} sukses pada percobaan ke-2 (encoder software)`);
            } catch (e2) {
              const det2 = e2 && (e2.name + ' | ' + e2.message) || String(e2);
              console.error(`part ${idx + 1} GAGAL juga di percobaan ke-2: ${det2}`);
              if (!xAborted()) state.exportFatal = e2;
              slot.working = false; uiTick(true);
              return;
            }
          } else {
            const det = e && (e.name + ' | ' + e.message + ' | ' + String(e.stack || '').split('\n')[1] || '') || String(e);
            console.error(`part ${idx + 1} GAGAL: ${det}`);
            if (!xAborted()) state.exportFatal = e;
            slot.working = false; uiTick(true);
            return;
          }
        }
        slot.working = false; uiTick(true);
      }
    };
    const runners = [];
    for (let k = 0; k < par; k++) runners.push(launch());
    /* pantau progres selagi worker jalan
       v2.5: + WATCHDOG GLOBAL — bila TIDAK ADA kemajuan apa pun dari semua
       worker selama 45 dtk, hentikan dengan pesan jelas (bukan macam) */
    await new Promise(res => {
      let lastSig = '', lastSigAt = Date.now();
      const iv = setInterval(() => {
        uiTick(false);
        if (xAborted() || results.every(r => r)) { clearInterval(iv); res(); return; }
        const sig = slots.map(s => `${s.fr}:${s.working ? 1 : 0}:${s.stage || ''}:${Math.round((s.saveProg || 0) * 100)}`).join('|');
        const now = Date.now();
        if (sig !== lastSig) { lastSig = sig; lastSigAt = now; }
        else if (now - lastSigAt > 45000) {
          clearInterval(iv);
          /* v2.10: watchdog = kegagalan internal, BUKAN batal pengguna */
          if (!xAborted()) {
            state.exportFatal = new Error('Render berhenti merespons 45 detik — dihentikan otomatis. Coba set PARALEL 1× atau kualitas lebih rendah lalu ulangi.');
          }
          res();
        }
      }, 150);
    });
    await Promise.all(runners).catch(() => { });
    if (state.exportFatal) { const err = state.exportFatal; throw err; }
    if (state.abort && !results.every(r => r)) {
      const made = results.filter(Boolean);
      throw new Error(made.length ? `Dibatalkan — ${made.length} part tersimpan` : 'Dibatalkan');
    }
    if (results.some(r => !r)) throw new Error('Sebagian part gagal dirender');
    if (ui.sub) {
      const el = (performance.now() - t0) / 1000;
      ui.sub(`selesai dalam ${el < 90 ? el.toFixed(0) + ' detik' : (el / 60).toFixed(1) + ' menit'} · ${par}× paralel${hw ? ' · GPU' : ''}`);
    }
    if (ui.prog) ui.prog(1);
    return results;
  } finally {
    state.exportFatal = null;   /* v2.10: jangan bocor ke ekspor/video berikutnya */
    if (_srcUrl != null && !state.file.virtual) try { URL.revokeObjectURL(_srcUrl); } catch (e) { }
  }
}

/* ---------- EKSPOR TUNGGAL ---------- */
async function doExport() {
  if (!state.file) { toast('Impor media dulu', 'err'); return; }
  if (state.busy) return;
  if (!('VideoEncoder' in window)) { toast('Engine tidak mendukung WebCodecs', 'err'); return; }
  state.busy = true; state.abort = false;
  try {
    const dir = await window.kinostra.pickOutputDir(_lastOutDir || undefined);
    if (!dir) { state.busy = false; return; }
    _lastOutDir = dir;
    /* v2.13: AUTO-SUBTITEL — bila pengaturan aktif & video belum punya
       subtitel, buatkan dulu di sini sehingga EKSPOR & SPLIT langsung
       menghasilkan video bersubtitel tanpa langkah manual. Gagal internal
       tidak membatalkan ekspor (toast peringatan + lanjut tanpa subtitel);
       pembatalan pengguna dilempar sebagai 'Dibatalkan'. */
    await ensureAutoSubs({ ownModal: true });
    const tStart = performance.now();
    const results = await exportPartsToDir(dir, {
      title(segs) {
        const par = pickParallelCount(segs.length, _lastEnc.kind === 'hw');
        showModal({ title: `MERENDER ${segs.length} PART · PARALEL ${par}×`,
          sub: 'Menyiapkan encoder…', cancel: true, onCancel() { state.abort = true; } });
      },
      prog: p => setProg(p),
      sub: s => setSub(s)
    });
    const el = (performance.now() - tStart) / 1000;
    hideModal(); showResults(results, dir);
    toast(`${results.length} file selesai · ${el < 90 ? el.toFixed(0) + ' detik' : (el / 60).toFixed(1) + ' menit'}`, 'ok');
  } catch (e) {
    hideModal();
    /* v2.10: hanya tampil "dibatalkan" bila BENAR-BENAR dibatalkan pengguna.
       Kegagalan internal (encoder, media, watchdog) kini menampilkan
       PENYEBAB aslinya — dulu semuanya tertelan jadi "Ekspor dibatalkan". */
    if (state.abort || String(e.message || e).includes('Dibatalkan')) toast('Ekspor dibatalkan', 'warn');
    else { console.error(e); toast('Ekspor gagal: ' + (e.message || e), 'err'); }
  }
  state.busy = false;
}
function showResults(results, dir) {
  const body = results.map((r, i) =>
    `<div class="rrow"><span class="rn">${r.name}</span><span class="rs">${fmtMB(r.size)}</span></div>`).join('')
    + `<div class="rrow" style="border-style:dashed"><span class="rn" style="color:var(--tx2)">Folder: ${dir}</span></div>
       <button class="btn acc wide" id="openFolder" style="margin-top:6px"><i data-lucide="folder-open"></i> BUKA FOLDER OUTPUT</button>`;
  /* v2.7 FIX: modal hasil harus selalu bisa ditutup — dulu showModal tanpa
     `cancel:true` menyembunyikan tombol TUTUP sehingga pop-up tidak bisa
     ditutup dan aplikasi terasa macet. Sekarang: TUTUP tampil + tombol ×
     di header + tombol ESC + klik area luar (semua dari core.js). */
  showModal({ title: 'EKSPOR SELESAI', body, cancel: true });
  if (window.lucide) lucide.createIcons();
  M.c.textContent = 'TUTUP';
  const of = M.b.querySelector('#openFolder');
  if (of) of.onclick = () => window.kinostra.openPath(dir);
}

/* ---------- ringkasan ekspor ---------- */
function updateOutName() {
  if (!state.file) { $('#outName').textContent = '—'; return; }
  const n = segmentsCount(), r = rangeInfo();
  /* v2.9: tampilkan rentang bila aktif (mulai > 0 atau berhenti < durasi) */
  const rangeTxt = (r.start > 0.01 || (state.rangeEnd > 0 && r.end < (state.duration || 0) - 0.01))
    ? ` · ${fmtT(r.start)}–${fmtT(r.end)}` : '';
  /* v2.12: info potongan & kecepatan */
  const cutTxt = (state.cuts || []).length ? ` · POTONG ${state.cuts.length} BAGIAN` : '';
  const spdTxt = state.speed !== 1 ? ` · ${state.speed}×` : '';
  $('#outName').textContent = `${slug(state.title)}${state.partPrefix !== '#' ? '_' + state.partPrefix : ''}_01 … ${String(n).padStart(2, '0')}.mp4  ·  ${n} part × ${state.splitSec} dtk${rangeTxt}${cutTxt}${spdTxt}`;
}
function updateExportInfo() {
  if (!state.file) { $('#expSum').textContent = 'Impor media untuk melihat ringkasan.'; return; }
  const sc = parseFloat(state.scale), q = QUAL[state.quality];
  const br = Math.round(q.br * (sc === 1 ? 1 : sc === 0.75 ? 0.62 : 0.38));
  const dims = outDims(sc);
  /* v2.12: estimasi memakai durasi efektif (rentang − potongan) ÷ kecepatan */
  const outLen = expLen() / clamp(state.speed || 1, 0.25, 4);
  const est = br / 8 * outLen + 160000 / 8 * outLen;
  /* v2.14: paralel ikut mode akselerasi aktif */
  const par = pickParallelCount(segmentsCount(), _lastEnc.kind === 'hw');
  const r = rangeInfo();
  const rangeLine = (r.start > 0.01 || (state.rangeEnd > 0 && r.end < (state.duration || 0) - 0.01))
    ? `<br><b>RANGE ${fmtT(r.start)} → ${fmtT(r.end)}</b> · durasi ekspor ${fmtT(expLen())}` : '';
  const cutLine = (state.cuts || []).length
    ? ` · <b>POTONG ${state.cuts.length}</b> bagian (−${fmtT(cutsLen())})` : '';
  const spdLine = state.speed !== 1 ? ` · <b>${state.speed}×</b> KEC. ${state.speed > 1 ? 'CEPAT' : 'PELAN'}` : '';
  /* v3.0: KOMPRES PINTAR + AUDIO SEHAT tampil di ringkasan */
  const tgtLine = state.targetMB > 0 ? ` · <b>TARGET ${state.targetMB} MB/PART</b>` : '';
  const afixLine = state.audioFix.on ? ` · AUDIO SEHAT${state.audioFix.hiss ? '+REDAM DESIS' : ''}` : '';
  /* v3.1: ZOOM PEMBICARA tampil di ringkasan */
  const spkLine = state.spk.on ? ` · <b>ZOOM PEMBICARA${state.spk.ready ? ' SIAP (' + state.spk.nSpeak + ' ORANG)' : ' (ANALISIS OTOMATIS)'}</b>` : '';
  $('#expSum').innerHTML = `<b>${segmentsCount()} PART</b> · ${dims.W}×${dims.H} · ${state.fps}fps · ${q.label} · PARALEL ${par}×${rangeLine}${cutLine}${spdLine}${tgtLine}${afixLine}${spkLine}
    <br>Estimasi total ± <b>${fmtMB(est)}</b><br><span class="mono">${slug(state.title)}_…_01.mp4</span>`;
}
function updateAll() { updateOutName(); updateExportInfo(); renderTimeline(); }

/* ================================================================
   v3.0 — GABUNG VIDEO: banyak video di KOTAK → SATU file MP4 utuh
   ================================================================
   Semua video dimuat BERURUTAN (judul otomatis per film, auto-subtitel
   per film bila aktif, skor musik disusun ulang per film) lalu semua
   part dirender ke SATU muxer kontinu — stempel waktu video & audio
   berlanjut mulus antar film (PTS global), audio & video di-encode
   paralel seperti ekspor biasa. File besar mengalir LANGSUNG ke disk
   (StreamTarget) → RAM tetap datar walaupun hasilnya gigabyte.
   Hasil: GABUNGAN_<jumlah>_VIDEO.mp4 di folder pilihanmu. */
async function exportMergeToDir(paths, dir, ui) {
  await ensureFontsReady();
  if (!paths || paths.length < 2) throw new Error('Pilih minimal 2 video di Kotak Video untuk digabung');
  const fps = state.fps, sc = parseFloat(state.scale), q = QUAL[state.quality];
  const spd = clamp(state.speed || 1, 0.25, 4);
  const dims = outDims(sc), { W, H } = dims;
  const br = Math.round(q.br * (sc === 1 ? 1 : sc === 0.75 ? 0.62 : 0.38));
  const vCfg = await pickVCodecCfg(W, H, br, fps);
  if (!vCfg) throw new Error('Tidak ada codec video yang didukung engine');
  const swCfg = await pickSWCfg(W, H, br, fps);
  const aCodec = await pickACodec();
  if (!aCodec) throw new Error('Encoder audio tidak tersedia');
  const nm = `GABUNGAN_${paths.length}_VIDEO_${slug(state.batch.find(b => b.path === paths[0])?.name || 'FILM').slice(0, 24)}.mp4`;
  /* mulai file gabungan (streaming disk — RAM datar) */
  const w = await window.kinostra.beginWrite(dir, nm);
  const mergeCtx = { muxer: null, off: 0, outName: nm, outPath: w.path, wsId: w.id, chain: Promise.resolve(), sent: 0, wsErr: null };
  mergeCtx.muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.StreamTarget({
      chunked: true, chunkSize: 8 * 1024 * 1024,
      onData: (data, pos) => {
        if (mergeCtx.wsErr) return;
        mergeCtx.sent += data.byteLength;
        mergeCtx.chain = mergeCtx.chain.then(() => window.kinostra.writeChunkAt(mergeCtx.wsId, data, pos)).catch(e => { mergeCtx.wsErr = mergeCtx.wsErr || e; });
      }
    }),
    fastStart: false, firstTimestampBehavior: 'offset',
    video: { codec: 'avc', width: W, height: H, frameRate: fps },
    audio: { codec: aCodec === 'mp4a.40.2' ? 'aac' : 'opus', numberOfChannels: 2, sampleRate: 48000 }
  });
  state._noPart = true;          /* label PART tidak masuk file gabungan */
  const prevFatal = state.exportFatal;
  state.exportFatal = null;
  const t0 = performance.now();
  let doneParts = 0;
  try {
    if (ui.prog) ui.prog(0);
    if (ui.sub) ui.sub(`Menyiapkan encoder ${_lastEnc.kind === 'hw' ? 'GPU' : 'CPU'} · ${paths.length} video…`);
    for (let i = 0; i < paths.length; i++) {
      if (state.abort) throw new Error('Dibatalkan');
      if (state.exportFatal) throw state.exportFatal;
      if (mergeCtx.wsErr) throw mergeCtx.wsErr;
      const nmv = paths[i].split(/[\\/]/).pop();
      if (ui.sub) ui.sub(`[${i + 1}/${paths.length}] Memuat ${nmv}…`);
      /* lepaskan buffer film sebelumnya (hemat RAM, sama dgn batch) */
      state.audioBuffer = null; state.peaks = null; state.audioRms = 0;
      await loadFromPath(paths[i], true);
      if (!state.file || state.file.path !== paths[i]) throw new Error(`video ${i + 1} (${nmv}) tidak bisa dimuat`);
      if (!state.duration) throw new Error(`durasi ${nmv} tidak terbaca — format tak didukung`);
      if (ui.sub) ui.sub(`[${i + 1}/${paths.length}] ${nmv} · ${fmtT(state.duration)} · memeriksa subtitel…`);
      await ensureAutoSubs({ sub: s => { if (ui.sub) ui.sub(`[${i + 1}/${paths.length}] ${s}`); }, prog: () => { } });
      /* v3.1: ZOOM PEMBICARA per film — tiap video di kotak dianalisis
         sendiri (pembicara tiap film berbeda) bila setelan aktif */
      if (state.spk && state.spk.on && !state.isAudio && !state.spk.ready && state.spk.auto && !state.spk.scanning) {
        try {
          if (ui.sub) ui.sub(`[${i + 1}/${paths.length}] ${nmv} · menganalisis pembicara…`);
          await analyzeSpeakers({
            prog: p => { if (ui.prog) ui.prog(clamp(((i + p) / paths.length) * 0.5, 0, 1)); },
            stat: s => { if (ui.sub) ui.sub(`[${i + 1}/${paths.length}] ${s}`); }
          });
        } catch (e) { console.warn('analisis pembicara gagal utk', nmv, e && e.message); }
      }
      if (state.music.buffer) await composeMusic(false, true, true);
      const srcUrl = state.file.virtual ? state.file.kurl : URL.createObjectURL(state.file);
      try {
        const segs = segments();
        for (const seg of segs) {
          if (state.abort) throw new Error('Dibatalkan');
          if (state.exportFatal) throw state.exportFatal;
          const slot = { seg, dir, prog: 0, fr: 0, total: Math.max(1, Math.round((seg.end - seg.start) / spd * fps)), working: true, stage: null, saveProg: 0 };
          try {
            await renderPartWorker(seg, srcUrl, W, H, fps, br, vCfg, aCodec, slot, () => {
              doneParts += 0.0001;
              if (ui.prog) ui.prog(clamp((mergeCtx.off + (seg.end - seg.start)) / Math.max(0.1, expLen() || 1) * 0, 0, 1)); /* prog pakai fr di bawah */
            }, mergeCtx);
          } catch (e) {
            if (state.acc === 'gpu' && swCfg && !xAborted()) {
              console.warn(`merge part gagal (${e && e.message || e}) — ulangi dengan encoder software`);
              await renderPartWorker(seg, srcUrl, W, H, fps, br, swCfg, aCodec, slot, null, mergeCtx);
            } else throw e;
          }
          mergeCtx.off += (seg.end - seg.start) / spd;
          if (ui.prog) ui.prog(clamp(mergeCtx.off / Math.max(0.1, (state.duration || 1) * paths.length), 0, 1));
          if (ui.sub) ui.sub(`[${i + 1}/${paths.length}] ${nmv} · part ${slot.seg.i + 1}/${segs.length} selesai · total ${fmtT(mergeCtx.off)}`);
        }
      } finally {
        if (!state.file.virtual) try { URL.revokeObjectURL(srcUrl); } catch (e) { }
      }
    }
    if (state.abort) throw new Error('Dibatalkan');
    if (ui.sub) ui.sub('Menuntaskan header MP4…');
    await withTimeout(mergeCtx.chain, 180000, 'menulis file gabungan macet (cek ruang disk)');
    if (mergeCtx.wsErr) throw mergeCtx.wsErr;
    await withTimeout(Promise.resolve().then(() => mergeCtx.muxer.finalize()), 60000, 'penulisan header MP4 gabungan macet');
    await window.kinostra.endWrite(mergeCtx.wsId); mergeCtx.wsId = null;
    const stt = await window.kinostra.stat(mergeCtx.outPath);
    const el = (performance.now() - t0) / 1000;
    if (ui.sub) ui.sub(`selesai dalam ${el < 90 ? el.toFixed(0) + ' detik' : (el / 60).toFixed(1) + ' menit'}`);
    return [{ name: nm, path: mergeCtx.outPath, size: stt && stt.ok ? stt.size : mergeCtx.sent }];
  } catch (e) {
    /* gagal → buang file setengah jadi */
    try { if (mergeCtx.wsId) { const id = mergeCtx.wsId; mergeCtx.wsId = null; await window.kinostra.abortWrite(id); } } catch (e2) { }
    throw e;
  } finally {
    state._noPart = false;
    state.exportFatal = prevFatal;
  }
}

/* ---------- UI GABUNG VIDEO (modul 09B) ---------- */
async function doMerge() {
  if (state.busy) { toast('Tunggu proses lain selesai', 'warn'); return; }
  const paths = state.batch.map(b => b.path);
  if (paths.length < 2) { toast('Kotak Video harus berisi minimal 2 video — urutan atas→bawah = urutan gabungan', 'warn'); return; }
  if (!('VideoEncoder' in window)) { toast('Engine tidak mendukung WebCodecs', 'err'); return; }
  state.busy = true; state.abort = false;
  try {
    const dir = await pickOutDir();
    if (!dir) { state.busy = false; return; }
    _lastOutDir = dir;
    showModal({ title: `MENGGABUNG ${paths.length} VIDEO → 1 FILE`,
      sub: 'Menyiapkan encoder…', cancel: true, onCancel() { state.abort = true; } });
    const results = await exportMergeToDir(paths, dir, {
      prog: p => setProg(p),
      sub: s => setSub(s)
    });
    hideModal();
    showResults(results, dir);
    toast(`Gabungan selesai: ${results[0].name}`, 'ok');
  } catch (e) {
    hideModal();
    if (state.abort || String(e.message || e).includes('Dibatalkan')) toast('Penggabungan dibatalkan', 'warn');
    else { console.error(e); toast('Gagal menggabung: ' + (e.message || e), 'err'); }
  }
  state.busy = false;
}
