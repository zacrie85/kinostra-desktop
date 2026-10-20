/* ================================================================
   KINOSTRA v3.0 — UJI OTOMATIS (Xvfb + CDP)
   Jalankan: xvfb-run -a node scripts/kinostra-v30-test.mjs
   ================================================================ */
import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project';
const OUTDIR = '/tmp/kinov30out';
const PORT = 9333;
let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  LULUS  ${name}`); }
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); console.log(`  GAGAL  ${name} ${extra}`); }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- CDP mini client (Node 24 punya WebSocket global) ---------- */
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map(); this.ev = new Map();
    ws.addEventListener('message', e => {
      const m = JSON.parse(e.data);
      if (m.id && this.pend.has(m.id)) { const { res, rej } = this.pend.get(m.id); this.pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
      else if (m.method && this.ev.has(m.method)) { this.ev.get(m.method).forEach(f => f(m.params)); }
    });
  }
  static async connect(port) {
    for (let i = 0; i < 60; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        const page = list.find(t => t.type === 'page' && /index\.html/.test(t.url));
        if (page) {
          const ws = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); setTimeout(() => rej(new Error('ws timeout')), 8000); });
          return new CDP(ws);
        }
      } catch (e) { }
      await sleep(1000);
    }
    throw new Error('CDP tidak tersambung');
  }
  send(method, params = {}) {
    return new Promise((res, rej) => { const id = ++this.id; this.pend.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expr, timeoutMs = 120000) {
    const tid = setTimeout(() => { console.log('    [eval timeout] ' + expr.slice(0, 90)); }, Math.max(0, timeoutMs - 15000));
    try {
      const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: timeoutMs });
      if (r.exceptionDetails) throw new Error('PAGE-ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 500));
      return r.result.value;
    } finally { clearTimeout(tid); }
  }
}

/* ---------- bootstrap ---------- */
console.log('Menjalankan Electron (Xvfb)…');
const app = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu-sandbox'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }
});
app.stderr.on('data', d => { const s = d.toString(); if (/MAIN-|error|Error/i.test(s)) console.log('  [main]', s.trim().slice(0, 160)); });
process.on('exit', () => { try { app.kill('SIGKILL'); } catch (e) { } });

let cdp;
try {
  cdp = await CDP.connect(PORT);
  await cdp.send('Runtime.enable');
  await sleep(2500);
  console.log('CDP tersambung.\n');

  /* ============ A. SMOKE: pustaka & katalog ============ */
  console.log('A. SMOKE');
  const smoke = await cdp.eval(`(() => ({
    mp4muxer: typeof Mp4Muxer !== 'undefined',
    transformers: !!window.transformers,
    frames: FRAMESTYLES.length,
    gaibGroup: FRAMESTYLES.filter(f => f.g === 'ALAM GAIB').length,
    colorfilters: COLORFILTERS.length,
    frGaibPlate: typeof frGaibPlate === 'function',
    frPocong: typeof frPocong === 'function',
    frKunti: typeof frKunti === 'function',
    frTuyul: typeof frTuyul === 'function',
    segBoundsList: typeof segBoundsList === 'function',
    detectScenes: typeof detectScenes === 'function',
    openSampul: typeof openSampul === 'function',
    drawSampul: typeof drawSampul === 'function',
    tts: typeof ttsSynthesize === 'function',
    merge: typeof exportMergeToDir === 'function',
    doMerge: typeof doMerge === 'function',
    measureAudioRms: typeof measureAudioRms === 'function',
    statJoin: typeof window.kinostra.statJoin === 'function',
    shutdownPC: typeof window.kinostra.shutdownPC === 'function',
    uiEls: ['#btnSceneDetect', '#btnSampul', '#btnMerge', '#btnTtsGen', '#btnTtsPlace', '#inTargetMB', '#resumeExport', '#autoShutdown', '#audioFixOn', '#segSplitMode', '#colorFilters', '#frameStyles', '#sceneList'].map(s => !!document.querySelector(s)).every(Boolean)
  }))()`);
  ok('Mp4Muxer + transformers termuat', smoke.mp4muxer && smoke.transformers);
  ok('FRAMESTYLES = 28 gaya', smoke.frames === 28, 'dapat ' + smoke.frames);
  ok('Grup ALAM GAIB = 6 frame', smoke.gaibGroup === 6, 'dapat ' + smoke.gaibGroup);
  ok('COLORFILTERS = 10 preset', smoke.colorfilters === 10, 'dapat ' + smoke.colorfilters);
  ok('Fungsi baru lengkap', smoke.frGaibPlate && smoke.frPocong && smoke.frKunti && smoke.frTuyul && smoke.segBoundsList && smoke.detectScenes && smoke.openSampul && smoke.drawSampul && smoke.tts && smoke.merge && smoke.doMerge && smoke.measureAudioRms);
  ok('IPC baru (statJoin, shutdownPC)', smoke.statJoin && smoke.shutdownPC);
  ok('Elemen UI baru lengkap', smoke.uiEls);

  /* ============ B. SEGMENTASI: durasi & adegan ============ */
  console.log('B. SEGMENTASI');
  const seg = await cdp.eval(`(async () => {
    state.duration = 300; state.splitSec = 30; state.splitMode = 'dur'; state.cuts = []; state.sceneCuts = []; state.mediaEpoch = (state.mediaEpoch||0)+1;
    const dur = segments();
    const r1 = { n: dur.length, s0: dur[0].start, s1: dur[1].start, eLast: dur[9].end, idx5: currentSegBounds(152)?.i, bounds0: currentSegBounds(0)?.start };
    state.sceneCuts = [45, 150]; state.splitMode = 'scene'; state.mediaEpoch++;
    const sc = segments();
    const r2 = { n: sc.length, bounds: sc.map(s => [Math.round(s.start), Math.round(s.end)]) };
    state.sceneCuts = [10, 11.2]; state.mediaEpoch++;
    const r3 = { n: segments().length };
    state.sceneCuts = [45, 150, 260]; state.cuts = [{ s: 200, e: 240 }]; state.mediaEpoch++;
    const r4 = { n: segments().length, bounds: segments().map(s => [Math.round(s.start), Math.round(s.end)]) };
    state.cuts = []; state.sceneCuts = []; state.splitMode = 'dur'; state.mediaEpoch++;
    return { r1, r2, r3, r4 };
  })()`);
  ok('Mode durasi: 10 part × 30 dtk', seg.r1.n === 10 && seg.r1.s0 === 0 && seg.r1.s1 === 30 && seg.r1.eLast === 300, JSON.stringify(seg.r1));
  ok('currentSegBounds(152) → part 6', seg.r1.idx5 === 5 && seg.r1.bounds0 === 0);
  ok('Mode adegan [45,150] → 3 part', seg.r2.n === 3 && JSON.stringify(seg.r2.bounds) === '[[0,45],[45,150],[150,300]]', JSON.stringify(seg.r2));
  ok('Titik adegan rapat digabung ke part sebelumnya', seg.r3.n === 2, 'dapat ' + seg.r3.n);
  ok('Adegan + potongan bekerja bersama', seg.r4.n === 5 && JSON.stringify(seg.r4.bounds) === '[[0,45],[45,150],[150,200],[240,260],[260,300]]', JSON.stringify(seg.r4));

  /* ============ C. FRAME ALAM GAIB TERGAMBAR (pixel check) ============ */
  console.log('C. FRAME ALAM GAIB');
  const frames = await cdp.eval(`(async () => {
    await document.fonts.load('900 48px "Cinzel"'); await document.fonts.ready;
    await loadFromPath('${ROOT}/testmedia/short-a.mp4', true);
    if (!state.duration) return { err: 'load gagal' };
    const keys = ['gaibpocong','gaibtuyul','gaibkunti','gaibsanggah','gaibmakam','gaibritual','hororhutan','koplopanggung'];
    const out = {};
    for (const k of keys) {
      state.frameStyle = k; state.mediaEpoch++;
      const c = document.createElement('canvas'); c.width = 900; c.height = 506;
      const g = c.getContext('2d');
      drawComposition(g, 900, 506, 1.3);
      const d = g.getImageData(0, 0, 900, 506).data;
      let lit = 0, plateLit = 0;
      for (let i = 0; i < d.length; i += 40) { const v = d[i] + d[i+1] + d[i+2]; if (v > 90) lit++; }
      for (let y = 18; y < 100; y += 3) for (let x = 300; x < 600; x += 4) { const i = (y * 900 + x) * 4; if (d[i] + d[i+1] + d[i+2] > 260) plateLit++; }
      out[k] = { lit, plateLit };
    }
    state.frameStyle = 'off'; state.mediaEpoch++;
    return out;
  })()`);
  for (const k of ['gaibpocong', 'gaibtuyul', 'gaibkunti', 'gaibsanggah', 'gaibmakam', 'gaibritual']) {
    ok(`Frame ${k} tergambar + papan ALAM GAIB`, frames[k].lit > 400 && frames[k].plateLit > 25, JSON.stringify(frames[k]));
  }
  ok('Frame v2.16 tetap utuh (regresi)', frames.hororhutan.lit > 400 && frames.koplopanggung.lit > 400);

  /* ============ D. FILTER WARNA ============ */
  console.log('D. FILTER WARNA');
  const filt = await cdp.eval(`(() => {
    const c = document.createElement('canvas'); c.width = 8; c.height = 8;
    const g = c.getContext('2d');
    const chk = (css) => {
      g.filter = 'none'; g.fillStyle = '#ff2222'; g.fillRect(0, 0, 8, 8);
      if (css) g.filter = css; else g.filter = 'none';
      g.fillStyle = '#ff2222'; g.fillRect(0, 0, 8, 8); g.filter = 'none';
      const d = g.getImageData(4, 4, 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    const off = chk('');
    const noir = chk('grayscale(1) contrast(1.24)');
    const cf = COLORFILTERS.find(x => x.k === 'noir');
    return { off, noir, cat: cf && cf.css, uiChips: document.querySelectorAll('#colorFilters button').length };
  })()`);
  ok('ctx.filter grayscale bekerja (noir ≈ abu)', Math.abs(filt.noir[0] - filt.noir[1]) < 26 && Math.abs(filt.noir[1] - filt.noir[2]) < 26, JSON.stringify(filt.noir));
  ok('10 chip filter di UI', filt.uiChips === 10, 'dapat ' + filt.uiChips);

  /* ============ E. AUDIO SEHAT (RMS + renderMix) ============ */
  console.log('E. AUDIO SEHAT');
  const audio = await cdp.eval(`(async () => {
    const ac = new AudioContext();
    const len = 48000; const buf = ac.createBuffer(2, len, 48000);
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    for (let i = 0; i < len; i++) { const v = Math.sin(i * 0.02) * 0.06; L[i] = v; R[i] = v; }   /* sinyal PELAN (rms ±0.042) */
    state.audioBuffer = buf; state.audioRms = 0; state._rmsEpoch = -1;
    const rms = measureAudioRms();
    state.music.buffer = null; state.audioGain = 1; state.tts.buffer = null;
    /* normalizer ON → keluaran lebih keras dari masukan */
    state.audioFix = { on: true, hiss: true };
    const mixN = await renderMix(0, 1, 1);
    let sN = 0; const chN = mixN.getChannelData(0); for (let i = 0; i < chN.length; i += 8) sN += chN[i] * chN[i];
    const rmsN = Math.sqrt(sN / (chN.length / 8));
    /* normalizer OFF → keluaran = masukan */
    state.audioFix = { on: false, hiss: false };
    const mixO = await renderMix(0, 1, 1);
    let sO = 0; const chO = mixO.getChannelData(0); for (let i = 0; i < chO.length; i += 8) sO += chO[i] * chO[i];
    const rmsO = Math.sqrt(sO / (chO.length / 8));
    state.audioBuffer = null;
    return { rms: +rms.toFixed(4), rmsN: +rmsN.toFixed(4), rmsO: +rmsO.toFixed(4) };
  })()`);
  ok('RMS terukur ±0.042 (sinyal 0.06)', Math.abs(audio.rms - 0.0424) < 0.01, JSON.stringify(audio));
  ok('Normalizer memperkuat sinyal pelan > 2×', audio.rmsN > audio.rmsO * 2, `N=${audio.rmsN} vs OFF=${audio.rmsO}`);

  /* ============ F. TTS: mix dgn buffer sintetis (tanpa unduh model) ============ */
  console.log('F. TTS MIX');
  const tts = await cdp.eval(`(async () => {
    const ac = new AudioContext();
    const buf = ac.createBuffer(1, 16000, 16000);   /* 1 dtk "suara" */
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.sin(i * 0.1) * 0.5;
    state.tts = { buffer: buf, at: 0.5, gain: 1, text: 'uji', ready: true };
    const ab = ac.createBuffer(2, 48000, 48000);
    const mix = await renderMix(0, 1, 1);   /* tanpa audio asli — hanya tts */
    let s = 0; const ch = mix.getChannelData(0); for (let i = 0; i < ch.length; i += 8) s += ch[i] * ch[i];
    const rms = Math.sqrt(s / (ch.length / 8));
    state.tts = { buffer: null, at: 0, gain: 0.9, text: '', ready: false };
    return { rms: +rms.toFixed(3), dur: +mix.duration.toFixed(2) };
  })()`);
  ok('Narasi TTS ter-mix ke audio ekspor', tts.rms > 0.05 && tts.dur === 1, JSON.stringify(tts));

  /* ============ G. RESUME: statJoin + lewati part yang ada ============ */
  console.log('G. RESUME EKSPOR');
  const resume = await cdp.eval(`(async () => {
    const nm = 'TESTV30_PART_01.mp4';
    const blob = new Blob([new Uint8Array(60000).fill(7)]);
    await saveBlobToDir(blob, '/tmp', nm);
    const st = await window.kinostra.statJoin('/tmp', nm);
    state.file = { name: 'Test V30.mp4', path: '/tmp/does-not-exist.mp4', size: 1, virtual: false };
    state.title = 'TESTV30'; state.partPrefix = 'PART'; state.duration = 10; state.splitSec = 10;
    state.splitMode = 'dur'; state.sceneCuts = []; state.cuts = []; state.targetMB = 0;
    state.mediaEpoch = (state.mediaEpoch || 0) + 1;
    state.resumeExport = true; state.audioBuffer = null; state.music.buffer = null; state.speed = 1;
    const res = await exportPartsToDir('/tmp', { prog() { }, sub() { }, title() { } });
    return { statOk: st.ok, statSize: st.size, skipped: res[0] && !!res[0].skipped, name: res[0] && res[0].name };
  })()`, 90000);
  ok('statJoin menemukan file', resume.statOk && resume.statSize === 60000, JSON.stringify(resume));
  ok('Ekspor MELEWATI part yang sudah ada (lanjutkan)', resume.skipped === true && resume.name === 'TESTV30_PART_01.mp4', JSON.stringify(resume));

  /* ============ H. EKSPOR NYATA: 3 dtk → 1 part ============ */
  console.log('H. EKSPOR NYATA');
  const exp = await cdp.eval(`(async () => {
    document.querySelector('#autoSub').checked = false;   /* jangan panggil whisper di uji */
    await loadFromPath('${ROOT}/testmedia/short-a.mp4', true);
    if (!state.file || !state.duration) return { err: 'load gagal' };
    state.title = 'UJIV30A'; state.splitSec = 30; state.splitMode = 'dur'; state.sceneCuts = [];
    state.rangeStart = 0; state.rangeEnd = 0; state.cuts = []; state.mediaEpoch++;
    state.resumeExport = false; state.targetMB = 0; state.speed = 1;
    state.frameStyle = 'gaibpocong'; state.colorFilter = 'horor'; state.mediaEpoch++;
    state.audioReady = Promise.resolve();
    const t0 = performance.now();
    const res = await exportPartsToDir('${OUTDIR}', { prog() { }, sub() { }, title() { } });
    return { files: res.map(r => ({ name: r.name, size: r.size })), ms: Math.round(performance.now() - t0) };
  })()`, 300000);
  ok('Ekspor part nyata (frame gaib + filter horor)', !!exp.files && exp.files.length === 1 && exp.files[0].size > 50000, JSON.stringify(exp));

  /* ============ I. GABUNG VIDEO: 2 file → 1 ============ */
  console.log('I. GABUNG VIDEO');
  const merge = await cdp.eval(`(async () => {
    const res = await exportMergeToDir(['${ROOT}/testmedia/short-a.mp4', '${ROOT}/testmedia/short-b.mp4'], '${OUTDIR}', { prog() { }, sub() { } });
    return res;
  })()`, 300000);
  ok('Gabung 2 video → 1 file', !!merge[0] && merge[0].size > 100000, JSON.stringify(merge));

  /* ============ J. DETEKSI ADEGAN ============ */
  console.log('J. DETEKSI ADEGAN');
  const scenes = await cdp.eval(`(async () => {
    await loadFromPath('${ROOT}/testmedia/scene-cut.mp4', true);
    if (!state.duration) return { err: 'load gagal' };
    state.splitMode = 'dur';
    await detectScenes();
    return { cuts: state.sceneCuts, mode: state.splitMode, stat: document.querySelector('#sceneStat').textContent };
  })()`, 120000);
  const sc = scenes.cuts || [];
  ok('Adegan terdeteksi di ~3 dtk (merah→biru)', sc.length === 1 && sc[0] >= 2.4 && sc[0] <= 3.6, JSON.stringify(scenes));

  /* ============ K. SAMPUL AUTO ============ */
  console.log('K. SAMPUL AUTO');
  const sampul = await cdp.eval(`(async () => {
    await loadFromPath('${ROOT}/testmedia/short-a.mp4', true);
    videoEl.currentTime = 1.5;
    await new Promise(r => { videoEl.addEventListener('seeked', r, { once: true }); setTimeout(r, 2500); });
    state.frameStyle = 'off'; state.mediaEpoch++;
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    drawSampul(c.getContext('2d'), 1280, 720, 1.5, 'gaib', 'UJI SAMPUL V30', 'PART 1 · FULL');
    const d = c.getContext('2d').getImageData(0, 0, 1280, 720).data;
    let lit = 0; for (let i = 0; i < d.length; i += 160) if (d[i] + d[i+1] + d[i+2] > 120) lit++;
    const url = c.toDataURL('image/png');
    return { lit, pngKB: Math.round(url.length / 1024) };
  })()`, 60000);
  ok('Sampul tergambar + PNG siap', sampul.lit > 1500 && sampul.pngKB > 50, JSON.stringify(sampul));

  /* ============ L. UI: chips & modal & tombol ============ */
  console.log('L. UI');
  const uiT = await cdp.eval(`(() => {
    const gaibChips = [...document.querySelectorAll('#frameStyles button')].filter(b => b.style.borderLeftColor === 'rgb(79, 220, 132)').length;
    document.querySelector('#segSplitMode button[data-v="scene"]').click();
    const modeAfter = state.splitMode;
    document.querySelector('#segSplitMode button[data-v="dur"]').click();
    return { gaibChips, modeAfter, sceneListOk: !!document.querySelector('#sceneList'), headGaib: !!document.querySelector('.fg-gaib') };
  })()`);
  ok('Chip grup ALAM GAIB = 6 di menu', uiT.gaibChips === 6, 'dapat ' + uiT.gaibChips);
  ok('Toggle split mode → PER ADEGAN', uiT.modeAfter === 'scene');
  ok('Header grup .fg-gaib tampil', uiT.headGaib && uiT.sceneListOk);

  /* ============ M. KOMPRES PINTAR: ringkasan target ============ */
  console.log('M. KOMPRES PINTAR');
  const tgt = await cdp.eval(`(() => {
    state.targetMB = 500; updateAll();
    const s1 = document.querySelector('#expSum').textContent;
    state.targetMB = 0; updateAll();
    return { hit: s1.includes('TARGET 500 MB'), s1: s1.slice(0, 120) };
  })()`);
  ok('Ringkasan menampilkan TARGET 500 MB/PART', tgt.hit, tgt.s1);

  /* ============ N. LAPORAN BATCH ============ */
  console.log('N. LAPORAN BATCH');
  const rep = await cdp.eval(`(() => {
    state.batch = [{ name: 'film-a.mp4', status: 'done', msg: '2 part', durS: 120, outSize: 50000000, elapsed: 34 }];
    const r = buildBatchReport('/tmp', 1, 0, 34000);
    state.batch = [];
    return { ok: /film-a\\.mp4/.test(r) && /KINOSTRA v3\\.0/.test(r), len: r.length };
  })()`);
  ok('Laporan rekap berisi status & durasi', rep.ok, JSON.stringify(rep));

  /* ============ ffprobe hasil nyata ============ */
  console.log('O. VERIFIKASI FILE (ffprobe)');
  const outFiles = fs.readdirSync(OUTDIR).filter(f => f.endsWith('.mp4'));
  ok('File output ada: ' + outFiles.join(', '), outFiles.length >= 2);
  const mergedFile = outFiles.find(f => f.startsWith('GABUNGAN'));
  const partFile = outFiles.find(f => f.startsWith('UJIV30A'));
  if (mergedFile) {
    const p = JSON.parse(execSync(`ffprobe -v error -show_entries format=duration -show_entries stream=codec_type,codec_name -of json '${path.join(OUTDIR, mergedFile)}'`).toString());
    const dur = +p.format.duration, streams = p.streams.map(s => s.codec_type).sort().join(',');
    ok(`Gabungan durasi ±6 dtk (dapat ${dur.toFixed(2)})`, dur > 5.5 && dur < 7);
    ok('Gabungan punya video+audio', streams === 'audio,video', streams);
  }
  if (partFile) {
    const p = JSON.parse(execSync(`ffprobe -v error -show_entries format=duration -show_entries stream=codec_type,codec_name -of json '${path.join(OUTDIR, partFile)}'`).toString());
    ok(`Part ekspor ±3 dtk H.264 (dapat ${(+p.format.duration).toFixed(2)})`, +p.format.duration > 2.7 && p.streams[0].codec_name === 'h264');
  }

  /* ---------- ringkasan ---------- */
  console.log(`\n================ HASIL: ${pass} LULUS · ${fail} GAGAL ================`);
  if (fails.length) fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('FATAL:', e.message);
  process.exit(2);
}
