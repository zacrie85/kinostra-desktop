/* ================================================================
   KINOSTRA DESKTOP — exporter.js
   Pipeline ekspor WebCodecs → MP4 (port setia dari v1.0)
   UPGRADE DESKTOP: hasil ditulis langsung ke folder pilihan
   Refactor: loop render dipisah agar dipakai ekspor tunggal & batch
   ================================================================ */
'use strict';

async function pickVCodec(W, H, br, fps) {
  for (const c of ['avc1.640028', 'avc1.4D0028', 'avc1.42002A']) {
    try {
      const s = await VideoEncoder.isConfigSupported({ codec: c, width: W, height: H, bitrate: br, framerate: fps });
      if (s.supported) return c;
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

/* ---------- INTI RENDER: semua part -> folder dir ----------
   ui: {title(seg,segs), prog(p), sub(s), canceled()} */
async function exportPartsToDir(dir, ui) {
  await ensureFontsReady();
  const fps = state.fps, sc = parseFloat(state.scale), q = QUAL[state.quality];
  const dims = outDims(sc), { W, H } = dims;
  const br = Math.round(q.br * (sc === 1 ? 1 : sc === 0.75 ? 0.62 : 0.38));
  const codec = await pickVCodec(W, H, br, fps);
  if (!codec) throw new Error('Tidak ada codec video yang didukung engine');
  const wantAudio = !!(state.audioBuffer || state.music.buffer);
  const aCodec = wantAudio ? await pickACodec() : null;
  if (wantAudio && !aCodec) toast('Encoder audio tak tersedia — ekspor tanpa audio', 'warn');
  const segs = segments(), results = [];
  const ecv = document.createElement('canvas'); ecv.width = W; ecv.height = H;
  const ec = ecv.getContext('2d');
  for (const seg of segs) {
    if (state.abort) throw new Error('Dibatalkan');
    const durS = seg.end - seg.start;
    if (ui.title) ui.title(seg, segs);
    if (ui.prog) ui.prog(0);
    if (ui.sub) ui.sub('Menyiapkan encoder…');
    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(), fastStart: 'in-memory', firstTimestampBehavior: 'offset',
      video: { codec: 'avc', width: W, height: H, frameRate: fps },
      ...(aCodec ? { audio: { codec: aCodec === 'mp4a.40.2' ? 'aac' : 'opus', numberOfChannels: 2, sampleRate: 48000 } } : {})
    });
    if (aCodec) {
      if (ui.sub) ui.sub('Miksu audio asli + skor musik…');
      const mix = await renderMix(seg.start, durS);
      await encodeAudioTo(muxer, mix, aCodec);
    }
    const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: e => console.error(e) });
    venc.configure({ codec, width: W, height: H, bitrate: br, framerate: fps, latencyMode: 'quality' });
    const n = Math.max(1, Math.round(durS * fps)), t0 = performance.now();
    for (let i = 0; i < n; i++) {
      if (state.abort) { try { venc.close(); } catch (e) { } throw new Error('Dibatalkan'); }
      const t = seg.start + i / fps;
      await seekTo(t);
      drawComposition(ec, W, H, t);
      const vf = new VideoFrame(ecv, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
      venc.encode(vf, { keyFrame: i % (fps * 2) === 0 }); vf.close();
      while (venc.encodeQueueSize > 6) await sleep(3);
      if (i % 5 === 0 && ui.prog) {
        const el = (performance.now() - t0) / 1000;
        ui.prog((i + 1) / n);
        if (ui.sub) ui.sub(`frame ${i + 1}/${n} · ${(i / Math.max(el, 0.01)).toFixed(1)} fps · ETA ${fmtT(n / Math.max(i / el, 0.01) * (n - i))}`);
      }
    }
    await venc.flush(); venc.close();
    muxer.finalize();
    const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    const nm = partFileName(state.title, state.partPrefix, seg.i + 1);
    if (ui.sub) ui.sub(`Menulis ${nm} ke disk…`);
    const wr = await saveBlobToDir(blob, dir, nm);
    results.push({ name: nm, path: wr.path, size: wr.size });
  }
  return results;
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
    const results = await exportPartsToDir(dir, {
      title(seg, segs) {
        showModal({ title: `MERENDER PART ${String(seg.i + 1).padStart(2, '0')} / ${String(segs.length).padStart(2, '0')}`,
          sub: 'Menyiapkan encoder…', cancel: true, onCancel() { state.abort = true; } });
      },
      prog: p => setProg(p),
      sub: s => setSub(s)
    });
    hideModal(); showResults(results, dir);
    toast(`${results.length} file selesai dirender`, 'ok');
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
  $('#expSum').innerHTML = `<b>${segmentsCount()} PART</b> · ${dims.W}×${dims.H} · ${state.fps}fps · ${q.label}
    <br>Estimasi total ± <b>${fmtMB(est)}</b><br><span class="mono">${slug(state.title)}_…_01.mp4</span>`;
}
function updateAll() { updateOutName(); updateExportInfo(); renderTimeline(); }
