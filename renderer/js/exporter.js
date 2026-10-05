/* ================================================================
   KINOSTRA DESKTOP — exporter.js (v2.2 TURBO STREAM)
   Pipeline ekspor WebCodecs → MP4.
   UPGRADE v2.2 (kenapa jauh lebih cepat):
   - CAPTURE PLAYBACK: video DIPUTAR cepat (rate adaptif 2–4×) dan
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

async function pickVCodecCfg(W, H, br, fps) {
  const base = ['avc1.640028', 'avc1.4D0028', 'avc1.42002A'];
  /* 1) coba hardware GPU dulu — jauh lebih cepat di Windows (Media Foundation) */
  for (const c of base) {
    try {
      const cfg = { codec: c, width: W, height: H, bitrate: br, framerate: fps, hardwareAcceleration: 'prefer-hardware' };
      const s = await VideoEncoder.isConfigSupported(cfg);
      if (s.supported) return cfg;
    } catch (e) { }
  }
  /* 2) fallback software */
  for (const c of base) {
    try {
      const cfg = { codec: c, width: W, height: H, bitrate: br, framerate: fps };
      const s = await VideoEncoder.isConfigSupported(cfg);
      if (s.supported) return cfg;
    } catch (e) { }
  }
  return null;
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
async function renderMix(start, dur) {
  const sr = 48000, len = Math.max(1, Math.ceil(dur * sr));
  const oc = new OfflineAudioContext(2, len, sr);
  if (state.audioBuffer) {
    const s = oc.createBufferSource(); s.buffer = state.audioBuffer;
    const g = oc.createGain(); g.gain.value = state.audioGain;
    s.connect(g); g.connect(oc.destination); s.start(0, start, Math.min(dur, state.audioBuffer.duration - start));
  }
  if (state.music.buffer) {
    const s = oc.createBufferSource(); s.buffer = state.music.buffer;
    const g = oc.createGain(); g.gain.value = state.music.gain;
    s.connect(g); g.connect(oc.destination); s.start(0, start, Math.min(dur, state.music.buffer.duration - start));
  }
  return oc.startRendering();
}
async function encodeAudioTo(muxer, abuf, codec) {
  const sr = abuf.sampleRate, chs = Math.min(2, abuf.numberOfChannels);
  const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: e => console.warn('aenc', e) });
  aenc.configure({ codec, sampleRate: sr, numberOfChannels: chs, bitrate: 160000 });
  const L = abuf.getChannelData(0), R2 = chs > 1 ? abuf.getChannelData(1) : L, BLK = sr;
  for (let off = 0; off < abuf.length; off += BLK) {
    if (state.abort) throw new Error('Dibatalkan');
    const n = Math.min(BLK, abuf.length - off);
    const data = new Float32Array(n * chs);
    data.set(L.subarray(off, off + n), 0);
    if (chs > 1) data.set(R2.subarray(off, off + n), n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: chs,
      timestamp: Math.round(off / sr * 1e6), data });
    aenc.encode(ad); ad.close();
    let drainMs = 0;
    while (aenc.encodeQueueSize > 10) { await sleep(2); if (state.abort) throw new Error('Dibatalkan'); if ((drainMs += 2) > 30000) throw new Error('encoder audio macet'); }
  }
  await aenc.flush(); aenc.close();
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

/* ---------- JUMLAH RENDER PARALEL ---------- */
function pickParallelCount(parts) {
  if (state.parallel > 0) return Math.max(1, Math.min(state.parallel, parts));
  const cores = navigator.hardwareConcurrency || 8;
  return Math.max(1, Math.min(4, parts, Math.max(1, Math.floor(cores / 3))));
}

/* ---------- FALLBACK: rantai seek per frame (lama) ----------
   Dipakai untuk audio-only (tanpa frame video) dan bila browser
   tanpa requestVideoFrameCallback. noSeek = audio (tidak perlu seek) */
async function renderFramesBySeek(v, ecv, ec, venc, seg, fps, slot, doneCb, noSeek = false) {
  const n = Math.max(1, Math.round((seg.end - seg.start) * fps));
  let seekP = null;
  for (let i = 0; i < n; i++) {
    if (state.abort) throw new Error('Dibatalkan');
    if (seekP) { await seekP; seekP = null; }
    const t = Math.min(seg.start + i / fps, Math.max(0, (v.duration || seg.end) - 0.011));
    setCompSrc(v);
    drawComposition(ec, ecv.width, ecv.height, t);
    setCompSrc(null);
    const vf = new VideoFrame(ecv, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
    venc.encode(vf, { keyFrame: i % (fps * 2) === 0 }); vf.close();
    if (!noSeek && i + 1 < n) seekP = seekTo(seg.start + (i + 1) / fps, v);
    while (venc.encodeQueueSize > 14) await sleep(2);
    slot.fr = i + 1;
    doneCb && doneCb();
  }
  return n;
}

/* ---------- WORKER SATU PART (v2.2 TURBO) ----------
   Elemen video sendiri + canvas sendiri + muxer sendiri.
   Frame diambil sambil video diputar (tanpa seek per frame). */
async function renderPartWorker(seg, srcUrl, W, H, fps, br, vCfg, aCodec, slot, doneCb) {
  const durS = seg.end - seg.start;
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto';
  v.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:2px;height:2px;opacity:0';
  v.src = srcUrl;
  document.body.appendChild(v);
  v.addEventListener('error', () => console.error(`part ${seg.i + 1} media error: code=${v.error && v.error.code} msg=${v.error && v.error.message}`));
  let venc = null, _stage = 'init', n = 0;
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
    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(), fastStart: 'in-memory', firstTimestampBehavior: 'offset',
      video: { codec: 'avc', width: W, height: H, frameRate: fps },
      ...(aCodec ? { audio: { codec: aCodec === 'mp4a.40.2' ? 'aac' : 'opus', numberOfChannels: 2, sampleRate: 48000 } } : {})
    });
    if (aCodec) {
      _stage = 'audio';
      const mix = await withTimeout(renderMix(seg.start, durS), 120000, 'mix audio macet');
      await withTimeout(encodeAudioTo(muxer, mix, aCodec), 300000, 'encoding audio macet');
    }
    _stage = 'configure';
    const hw = vCfg.hardwareAcceleration === 'prefer-hardware';
    venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: e => console.error('venc', e) });
    venc.configure({ ...vCfg, latencyMode: hw ? 'quality' : 'realtime' });
    const CAP = hw ? 40 : 14;

    /* gambar 1 frame pada waktu media m → encode dengan timestamp nyata */
    const drawAt = (t, ts) => {
      setCompSrc(v);
      drawComposition(ec, W, H, t);
      setCompSrc(null);
      const vf = new VideoFrame(ecv, { timestamp: ts, duration: Math.round(1e6 / fps) });
      venc.encode(vf, { keyFrame: n % (fps * 2) === 0 }); vf.close();
      n++; slot.fr = n;
    };

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
      let capRate = 2, dAcc = 0, dN = 0, lastM = -1;
      v.playbackRate = capRate;
      let lastAct = Date.now(), qStallSince = 0;
      await new Promise((resolve, rej) => {
        let finished = false;
        const stop = () => { try { v.pause(); } catch (e) { } };
        const fin = () => { if (finished) return; finished = true; stop(); clearInterval(watch); resolve(); };
        const fail = (err) => { if (finished) return; finished = true; stop(); clearInterval(watch); rej(err); };
        /* --- v2.5: WATCHDOG (detak 250 ms) --- */
        const watch = setInterval(() => {
          if (finished) { clearInterval(watch); return; }
          if (state.abort) return fail(new Error('Dibatalkan'));
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
          if (v.paused && !v.seeking && venc.encodeQueueSize <= CAP && !v.ended) {
            try { const p = v.play(); if (p && p.catch) p.catch(err => fail(new Error('video tidak bisa dilanjut: ' + (err.message || err)))); }
            catch (err) { fail(new Error('video tidak bisa dilanjut: ' + (err.message || err))); }
          }
        }, 250);
        const onFrame = (now, meta) => {
          if (finished) return;
          lastAct = Date.now();
          if (state.abort) return fail(new Error('Dibatalkan'));
          const m = meta.mediaTime;
          if (v.ended || m >= seg.end - 0.004) return fin();
          if (m >= seg.start - 0.06 && m > lastM) {
            drawAt(m, Math.max(0, Math.round((m - seg.start) * 1e6)));
            /* rate adaptif: naik kalau tidak ada frame buangan, turun kalau banyak */
            if (lastM >= 0) {
              const d = m - lastM;
              if (d > 0 && d < 0.6) {
                dAcc += d; dN++;
                if (dN >= 24) {
                  const avg = dAcc / dN; dAcc = 0; dN = 0; const tg = 1 / fps;
                  if (avg < tg * 1.3 && capRate < 4) { capRate = Math.min(4, capRate + 0.5); v.playbackRate = capRate; }
                  else if (avg > tg * 2.2 && capRate > 1) { capRate = Math.max(1, capRate - 0.5); v.playbackRate = capRate; }
                }
              }
            }
            lastM = m;
            doneCb && doneCb();
          }
          /* backpressure: pause bila encoder tertinggal, lanjut otomatis */
          if (venc.encodeQueueSize > CAP) { stop(); setTimeout(pump, 5); return; }
          pump();
        };
        const pump = () => {
          if (finished) return;
          if (state.abort) return fail(new Error('Dibatalkan'));
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
      if (n === 0) {
        /* sumber aneh / tidak menghasilkan frame — jalankan jalur lama */
        _stage = 'fallback-seek';
        await renderFramesBySeek(v, ecv, ec, venc, seg, fps, slot, doneCb);
        n = slot.fr;
      }
    } else {
      /* audio-only / tanpa rVFC: jalur frame loop (tanpa seek utk audio) */
      _stage = 'frames';
      await renderFramesBySeek(v, ecv, ec, venc, seg, fps, slot, doneCb, !!state.isAudio);
      n = slot.fr;
    }

    _stage = 'flush';
    slot.stage = 'flush';
    /* v2.5: flush dengan batas waktu — encoder yang hang tidak lagi
       membuat ekspor macet selamanya tanpa pesan */
    await withTimeout(venc.flush(), 60000, 'encoder video tidak selesai (flush macet 60 dtk)');
    venc.close(); venc = null;
    _stage = 'finalize';
    slot.stage = 'finalize';
    await withTimeout(Promise.resolve().then(() => muxer.finalize()), 30000, 'penulisan header MP4 macet');
    _stage = 'save';
    slot.stage = 'save';
    const nm = partFileName(state.title, state.partPrefix, seg.i + 1);
    const wr = await withTimeout(
      saveBufferToDir(muxer.target.buffer, slot.dir, nm, (w, t) => { slot.saveProg = w / t; }),
      180000, 'menyimpan file ke disk macet (cek ruang kosong disk)');
    slot.prog = 1; slot.fr = slot.total = Math.max(slot.total, n);
    return { name: nm, path: wr.path, size: wr.size };
  } catch (err) {
    if (_stage !== 'frames' && _stage !== 'stream') console.error(`part ${seg.i + 1} GAGAL di tahap ${_stage}: ${err && err.name || 'ERR'} | ${err && err.message || err}`);
    throw err;
  } finally {
    try { if (venc && venc.state !== 'closed') venc.close(); } catch (e) { }
    try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { }
    try { v.remove(); } catch (e) { }
  }
}

/* ---------- INTI RENDER: SEMUA PART PARALEL -> folder dir ----------
   ui: {title(segs), prog(p), sub(s), canceled()} */
async function exportPartsToDir(dir, ui) {
  await ensureFontsReady();
  const fps = state.fps, sc = parseFloat(state.scale), q = QUAL[state.quality];
  const dims = outDims(sc), { W, H } = dims;
  const br = Math.round(q.br * (sc === 1 ? 1 : sc === 0.75 ? 0.62 : 0.38));
  const vCfg = await pickVCodecCfg(W, H, br, fps);
  if (!vCfg) throw new Error('Tidak ada codec video yang didukung engine');
  /* v2.5: cadangan encoder SOFTWARE untuk percobaan ulang otomatis */
  const swCfg = await pickSWCfg(W, H, br, fps);
  const wantAudio = !!(state.audioBuffer || state.music.buffer);
  const aCodec = wantAudio ? await pickACodec() : null;
  if (wantAudio && !aCodec) toast('Encoder audio tak tersedia — ekspor tanpa audio', 'warn');
  const segs = segments();
  const par = pickParallelCount(segs.length);
  const hw = vCfg.hardwareAcceleration === 'prefer-hardware';

  /* slot progres per part */
  const slots = segs.map(s => ({ seg: s, dir, prog: 0, fr: 0, total: Math.max(1, Math.round((s.end - s.start) * fps)), working: false, stage: null, saveProg: 0 }));
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

  const srcUrl = URL.createObjectURL(state.file);
  const results = new Array(segs.length).fill(null);
  try {
    if (ui.title) ui.title(segs);
    if (ui.prog) ui.prog(0);
    if (ui.sub) ui.sub(`menyiapkan ${par} render paralel${hw ? ' · encoder GPU' : ''}${RVFC_OK && !state.isAudio ? ' · turbo stream' : ''}…`);

    /* jalankan worker dengan batas `par` sekaligus (antrean) */
    let cursor = 0, abortErr = null;
    const launch = async () => {
      while (cursor < slots.length && !state.abort) {
        const idx = cursor++;
        const slot = slots[idx];
        slot.working = true; uiTick(true);
        try {
          results[idx] = await renderPartWorker(slot.seg, srcUrl, W, H, fps, br, vCfg, aCodec, slot, () => uiTick(false));
        } catch (e) {
          /* v2.5: RETRY OTOMATIS 1× dengan encoder SOFTWARE — penyembuh
             utama "ekspor macet di bagian akhir" (encoder GPU berhenti).
             Jangan ulangi bila user membatalkan sendiri. */
          if (!state.abort && swCfg) {
            console.warn(`part ${idx + 1} gagal (${e && e.message || e}) — ulangi 1× dengan encoder software`);
            slot.fr = 0; slot.stage = null; slot.saveProg = 0; slot.retried = true; slot.working = true; uiTick(true);
            try {
              results[idx] = await renderPartWorker(slot.seg, srcUrl, W, H, fps, br, swCfg, aCodec, slot, () => uiTick(false));
              console.info(`part ${idx + 1} sukses pada percobaan ke-2 (encoder software)`);
            } catch (e2) {
              const det2 = e2 && (e2.name + ' | ' + e2.message) || String(e2);
              console.error(`part ${idx + 1} GAGAL juga di percobaan ke-2: ${det2}`);
              if (!state.abort) { abortErr = e2; state.abort = true; }
              slot.working = false; uiTick(true);
              return;
            }
          } else {
            const det = e && (e.name + ' | ' + e.message + ' | ' + String(e.stack || '').split('\n')[1] || '') || String(e);
            console.error(`part ${idx + 1} GAGAL: ${det}`);
            if (!state.abort) { abortErr = e; state.abort = true; }
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
        if (state.abort || results.every(r => r)) { clearInterval(iv); res(); return; }
        const sig = slots.map(s => `${s.fr}:${s.working ? 1 : 0}:${s.stage || ''}:${Math.round((s.saveProg || 0) * 100)}`).join('|');
        const now = Date.now();
        if (sig !== lastSig) { lastSig = sig; lastSigAt = now; }
        else if (now - lastSigAt > 45000) {
          clearInterval(iv);
          if (!state.abort) {
            abortErr = new Error('Render berhenti merespons 45 detik — dihentikan otomatis. Coba set PARALEL 1× atau kualitas lebih rendah lalu ulangi.');
            state.abort = true;
          }
          res();
        }
      }, 150);
    });
    await Promise.all(runners).catch(() => { });
    if (abortErr) throw abortErr;
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
    URL.revokeObjectURL(srcUrl);
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
    const tStart = performance.now();
    const results = await exportPartsToDir(dir, {
      title(segs) {
        const par = pickParallelCount(segs.length);
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
    if (state.abort || String(e.message || e).includes('batal')) toast('Ekspor dibatalkan', 'warn');
    else { console.error(e); toast('Ekspor gagal: ' + (e.message || e), 'err'); }
  }
  state.busy = false;
}
function showResults(results, dir) {
  const body = results.map((r, i) =>
    `<div class="rrow"><span class="rn">${r.name}</span><span class="rs">${fmtMB(r.size)}</span></div>`).join('')
    + `<div class="rrow" style="border-style:dashed"><span class="rn" style="color:var(--tx2)">Folder: ${dir}</span></div>
       <button class="btn acc wide" id="openFolder" style="margin-top:6px"><i data-lucide="folder-open"></i> BUKA FOLDER OUTPUT</button>`;
  showModal({ title: 'EKSPOR SELESAI', body });
  if (window.lucide) lucide.createIcons();
  M.c.textContent = 'TUTUP';
  const of = M.b.querySelector('#openFolder');
  if (of) of.onclick = () => window.kinostra.openPath(dir);
}

/* ---------- ringkasan ekspor ---------- */
function updateOutName() {
  if (!state.file) { $('#outName').textContent = '—'; return; }
  const n = segmentsCount();
  $('#outName').textContent = `${slug(state.title)}${state.partPrefix !== '#' ? '_' + state.partPrefix : ''}_01 … ${String(n).padStart(2, '0')}.mp4  ·  ${n} part × ${state.splitSec} dtk`;
}
function updateExportInfo() {
  if (!state.file) { $('#expSum').textContent = 'Impor media untuk melihat ringkasan.'; return; }
  const sc = parseFloat(state.scale), q = QUAL[state.quality];
  const br = Math.round(q.br * (sc === 1 ? 1 : sc === 0.75 ? 0.62 : 0.38));
  const dims = outDims(sc), est = br / 8 * state.duration + 160000 / 8 * state.duration;
  const par = pickParallelCount(segmentsCount());
  $('#expSum').innerHTML = `<b>${segmentsCount()} PART</b> · ${dims.W}×${dims.H} · ${state.fps}fps · ${q.label} · PARALEL ${par}×
    <br>Estimasi total ± <b>${fmtMB(est)}</b><br><span class="mono">${slug(state.title)}_…_01.mp4</span>`;
}
function updateAll() { updateOutName(); updateExportInfo(); renderTimeline(); }
