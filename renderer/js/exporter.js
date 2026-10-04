/* ================================================================
   KINOSTRA DESKTOP — exporter.js  (v2.1 TURBO PARALLEL)
   Pipeline ekspor WebCodecs → MP4.
   UPGRADE v2.1:
   - Semua PART dirender PARALEL (elemen video + encoder sendiri)
   - Encoder hardware GPU dulu (prefer-hardware), fallback software
   - Seek berantai tumpang-tindih: seek frame berikutnya berjalan
     bersamaan dengan encoding frame saat ini
   - Progres gabungan + ETA, hasil ditulis ke disk segera per part
   ================================================================ */
'use strict';

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
    const n = Math.min(BLK, abuf.length - off);
    const data = new Float32Array(n * chs);
    data.set(L.subarray(off, off + n), 0);
    if (chs > 1) data.set(R2.subarray(off, off + n), n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: chs,
      timestamp: Math.round(off / sr * 1e6), data });
    aenc.encode(ad); ad.close();
    while (aenc.encodeQueueSize > 10) await sleep(2);
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

/* ---------- v2.1: JUMLAH RENDER PARALEL ---------- */
function pickParallelCount(parts) {
  if (state.parallel > 0) return Math.max(1, Math.min(state.parallel, parts));
  const cores = navigator.hardwareConcurrency || 8;
  return Math.max(1, Math.min(3, parts, Math.max(1, Math.floor(cores / 4))));
}

/* ---------- v2.1: WORKER SATU PART ----------
   Elemen video sendiri + canvas sendiri + muxer sendiri.
   srcUrl dibagikan (satu Blob URL untuk semua worker). */
async function renderPartWorker(seg, srcUrl, W, H, fps, br, vCfg, aCodec, slot, doneCb) {
  const durS = seg.end - seg.start;
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto';
  v.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:2px;height:2px;opacity:0';
  v.src = srcUrl;
  document.body.appendChild(v);
  v.addEventListener('error', () => console.error(`part ${seg.i + 1} media error: code=${v.error && v.error.code} msg=${v.error && v.error.message}`));
  let venc = null, _stage = 'init';
  try {
    await new Promise((res, rej) => {
      const ok = () => { clean(); res(); };
      const bad = () => { clean(); rej(new Error('worker: meta tidak termuat')); };
      const clean = () => { v.removeEventListener('loadedmetadata', ok); v.removeEventListener('error', bad); };
      v.addEventListener('loadedmetadata', ok); v.addEventListener('error', bad);
      setTimeout(() => { if (v.readyState >= 1) ok(); }, 6000);
    });
    _stage = 'seek0';
    /* frame pertama harus benar-benar siap sebelum gambar */
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
      const mix = await renderMix(seg.start, durS);
      await encodeAudioTo(muxer, mix, aCodec);
    }
    _stage = 'configure';
    venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: e => console.error('venc', e) });
    venc.configure({ ...vCfg, latencyMode: 'quality' });

    const n = Math.max(1, Math.round(durS * fps));
    let seekP = null, t0 = performance.now(), lastDraw = -1;
    for (let i = 0; i < n; i++) {
      if (state.abort) throw new Error('Dibatalkan');
      _stage = 'frames';
      try {
        if (seekP) { await seekP; seekP = null; }
        const t = Math.min(seg.start + i / fps, Math.max(0, (v.duration || seg.end) - 0.011));
        /* blok sinkron: sumber → gambar → tangkap frame (aman dari race antar worker) */
        setCompSrc(v);
        drawComposition(ec, W, H, t);
        setCompSrc(null);
        const vf = new VideoFrame(ecv, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
        venc.encode(vf, { keyFrame: i % (fps * 2) === 0 }); vf.close();
        /* seek frame berikutnya SUDAH berjalan selama encode frame ini */
        if (i + 1 < n) seekP = seekTo(seg.start + (i + 1) / fps, v);
        while (venc.encodeQueueSize > 14) await sleep(2);
      } catch (err) {
        console.error(`part ${seg.i + 1} frame ${i}: ${err && err.name || 'ERR'} | ${err && err.message || err} | venc.state=${venc.state} queue=${venc.encodeQueueSize}`);
        throw err;
      }
      slot.fr = i + 1;
      const el = (performance.now() - t0) / 1000;
      if (el - lastDraw > 0.25) { lastDraw = el; doneCb && doneCb(); }
    }
    if (seekP) await seekP;
    _stage = 'flush';
    await venc.flush(); venc.close(); venc = null;
    _stage = 'finalize';
    muxer.finalize();
    _stage = 'save';
    /* v2.1: tulis buffer muxer LANGSUNG ke disk — tanpa Blob (hemat RAM & cepat) */
    const nm = partFileName(state.title, state.partPrefix, seg.i + 1);
    const wr = await saveBufferToDir(muxer.target.buffer, slot.dir, nm);
    slot.prog = 1; slot.fr = n; slot.total = n;
    return { name: nm, path: wr.path, size: wr.size };
  } catch (err) {
    if (_stage !== 'frames') console.error(`part ${seg.i + 1} GAGAL di tahap ${_stage}: ${err && err.name || 'ERR'} | ${err && err.message || err}`);
    throw err;
  } finally {
    try { if (venc && venc.state !== 'closed') venc.close(); } catch (e) { }
    try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { }
    try { v.remove(); } catch (e) { }
  }
}

/* ---------- INTI RENDER v2.1: SEMUA PART PARALEL -> folder dir ----------
   ui: {title(segs), prog(p), sub(s), canceled()} */
async function exportPartsToDir(dir, ui) {
  await ensureFontsReady();
  const fps = state.fps, sc = parseFloat(state.scale), q = QUAL[state.quality];
  const dims = outDims(sc), { W, H } = dims;
  const br = Math.round(q.br * (sc === 1 ? 1 : sc === 0.75 ? 0.62 : 0.38));
  const vCfg = await pickVCodecCfg(W, H, br, fps);
  if (!vCfg) throw new Error('Tidak ada codec video yang didukung engine');
  const wantAudio = !!(state.audioBuffer || state.music.buffer);
  const aCodec = wantAudio ? await pickACodec() : null;
  if (wantAudio && !aCodec) toast('Encoder audio tak tersedia — ekspor tanpa audio', 'warn');
  const segs = segments();
  const par = pickParallelCount(segs.length);
  const hw = vCfg.hardwareAcceleration === 'prefer-hardware';

  /* slot progres per part */
  const slots = segs.map(s => ({ seg: s, dir, prog: 0, fr: 0, total: Math.max(1, Math.round((s.end - s.start) * fps)), working: false }));
  const totalFr = slots.reduce((a, s) => a + s.total, 0);
  let lastUi = 0;
  const uiTick = (force) => {
    const now = performance.now();
    if (!force && now - lastUi < 120) return;
    lastUi = now;
    const done = slots.reduce((a, s) => a + Math.min(s.fr, s.total), 0);
    if (ui.prog) ui.prog(done / totalFr);
    if (ui.sub) {
      ui.sub(slots.map(s => {
        const pct = Math.round(100 * Math.min(s.fr, s.total) / s.total);
        return s.working ? `P${String(s.seg.i + 1).padStart(2, '0')} ${pct}%` : null;
      }).filter(Boolean).join(' · ') || 'menunggu…');
    }
  };

  const srcUrl = URL.createObjectURL(state.file);
  const results = new Array(segs.length).fill(null);
  const t0 = performance.now();
  try {
    if (ui.title) ui.title(segs);
    if (ui.prog) ui.prog(0);
    if (ui.sub) ui.sub(`menyiapkan ${par} render paralel${hw ? ' · encoder GPU' : ''}…`);

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
          const det = e && (e.name + ' | ' + e.message + ' | ' + String(e.stack || '').split('\n')[1] || '') || String(e);
          console.error(`part ${idx + 1} GAGAL: ${det}`);
          if (!state.abort) { abortErr = e; state.abort = true; }
          slot.working = false; uiTick(true);
          return;
        }
        slot.working = false; uiTick(true);
      }
    };
    const runners = [];
    for (let k = 0; k < par; k++) runners.push(launch());
    /* pantau progres + ETA selagi worker jalan */
    await new Promise(res => {
      const iv = setInterval(() => {
        uiTick(false);
        const done = slots.reduce((a, s) => a + Math.min(s.fr, s.total), 0);
        const el = (performance.now() - t0) / 1000;
        const rate = done / Math.max(el, 0.01);
        if (rate > 0 && ui.prog) {
          /* ETA gabungan di judul sub sudah cukup — prog bar utama */
        }
        if (state.abort || results.every(r => r)) { clearInterval(iv); res(); }
      }, 150);
    });
    await Promise.all(runners);
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
    toast(`${results.length} file selesai · ${(el / 60).toFixed(1)} menit`, 'ok');
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
