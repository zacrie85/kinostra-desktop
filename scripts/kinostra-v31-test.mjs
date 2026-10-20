/* ================================================================
   KINOSTRA v3.1 — UJI OTOMATIS ZOOM PEMBICARA (Xvfb + CDP)
   Jalankan: xvfb-run -a node scripts/kinostra-v31-test.mjs
   Media uji: testmedia/podcast.mp4 (2 pembicara sintetis bergantian)
   ================================================================ */
import { spawn, spawnSync } from 'node:child_process';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project';
const OUTDIR = '/tmp/kinov31out';
const PORT = 9444;
let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  LULUS  ${name}`); }
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); console.log(`  GAGAL  ${name} ${extra}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- CDP mini client ---------- */
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
  async eval(expr, timeoutMs = 180000) {
    const tid = setTimeout(() => { console.log('    [eval berjalan lama] ' + expr.slice(0, 80)); }, Math.max(0, timeoutMs - 15000));
    try {
      const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: timeoutMs });
      if (r.exceptionDetails) throw new Error('PAGE-ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 600));
      return r.result.value;
    } finally { clearTimeout(tid); }
  }
}

/* ---------- bootstrap ---------- */
fs.rmSync(OUTDIR, { recursive: true, force: true });
fs.mkdirSync(OUTDIR, { recursive: true });
if (!fs.existsSync(path.join(ROOT, 'testmedia/podcast.mp4'))) {
  console.log('Media uji tidak ada — membuat…');
  execSync('node scripts/kinostra-v31-mkmedia.mjs', { cwd: ROOT, stdio: 'inherit' });
}
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

  /* penangkap console halaman (utk diagnosis worker) */
  await cdp.eval(`window.__LOGS = [];
    ['info','warn','error','log'].forEach(k => { const o = console[k].bind(console);
      console[k] = (...a) => { try { window.__LOGS.push(k + ': ' + a.map(x => String(x && x.message !== undefined ? x.message : x)).join(' ').slice(0, 240)); } catch (e) {} o(...a); }; });`);

  /* ============ A. SMOKE: fungsi & UI zoom pembicara ============ */
  console.log('A. SMOKE ZOOM PEMBICARA');
  const smoke = await cdp.eval(`(() => ({
    state: !!state.spk && typeof state.spk.on === 'boolean',
    analyze: typeof analyzeSpeakers === 'function',
    crop: typeof spkCropAt === 'function',
    speakerAt: typeof spkSpeakerAt === 'function',
    ensureModel: typeof ensureSpeakerModel === 'function',
    renderList: typeof renderSpkList === 'function',
    ui: ['#spkOn', '#btnSpkAnalyze', '#btnSpkReset', '#spkList', '#spkStat', '#segSpkSpeed', '#segSpkSilence', '#spkAuto']
      .map(s => !!document.querySelector(s)).every(Boolean),
    v31: document.body.innerHTML.includes('3.1.0')
  }))()`);
  ok('state.spk tersedia', smoke.state);
  ok('Fungsi inti lengkap (analyze/crop/speakerAt/ensureModel)', smoke.analyze && smoke.crop && smoke.speakerAt && smoke.ensureModel && smoke.renderList);
  ok('Modul 02C lengkap di UI', smoke.ui);
  ok('Versi 3.1.0 tampil', smoke.v31);

  /* ============ B. ANALISIS PEMBICARA ============ */
  console.log('B. ANALISIS PEMBICARA (model YOLOS diunduh sekali)');
  const ana = await cdp.eval(`(async () => {
    document.querySelector('#autoSub').checked = false;
    await loadFromPath('${ROOT}/testmedia/podcast.mp4', true);
    if (!state.file || !state.duration) return { err: 'load gagal' };
    state.spk.on = true; state.spk.speed = 'normal'; state.spk.silence = 'hold';
    state.ratio = '9:16'; $('#hudRatio').textContent = '9:16';
    const t0 = performance.now();
    await analyzeSpeakers({ prog() { }, stat() { } });
    const ax = i => state.spk.tracks[i] ? +state.spk.tracks[i].avgX.toFixed(3) : null;
    const who = t => { const i = spkSpeakerAt(t); return { i, ax: i >= 0 ? ax(i) : i }; };
    return {
      ready: state.spk.ready, n: state.spk.nSpeak, segs: state.spk.timeline.length,
      ms: Math.round(performance.now() - t0),
      w8: who(8), w13: who(13), w18: who(18), w23: who(23.5), w28: who(28.6), w105: who(10.5),
      stat: document.querySelector('#spkStat').textContent.slice(0, 80)
    };
  })()`, 420000);
  ok('Analisis selesai & siap', ana.ready === true && !ana.err, JSON.stringify(ana).slice(0, 200));
  ok('2+ pembicara terdeteksi', ana.n >= 2, 'dapat ' + ana.n);
  ok('Timeline kamera ≥ 4 segmen', ana.segs >= 4, 'dapat ' + ana.segs);
  ok('t=8 → fokus KIRI (merah)', ana.w8.i >= 0 && ana.w8.ax < 0.45, JSON.stringify(ana.w8));
  ok('t=18 → fokus KANAN (biru)', ana.w18.i >= 0 && ana.w18.ax > 0.55, JSON.stringify(ana.w18));
  ok('t=23.5 → fokus KIRI lagi', ana.w23.i >= 0 && ana.w23.ax < 0.45, JSON.stringify(ana.w23));
  ok('t=28.6 → fokus KANAN lagi', ana.w28.i >= 0 && ana.w28.ax > 0.55, JSON.stringify(ana.w28));
  ok('Senyap (t=13) → TETAP di pembicara terakhir', ana.w13.i === ana.w105.i && ana.w13.i >= 0, JSON.stringify({ w13: ana.w13, w105: ana.w105 }));

  /* ============ C. GEOMETRI CROP KAMERA ============ */
  console.log('C. GEOMETRI CROP');
  const crop = await cdp.eval(`(() => {
    const c9 = spkCropAt(640, 360, 1080, 1920, 8);      /* vertikal, kiri bicara */
    const c16 = spkCropAt(640, 360, 1600, 900, 18);     /* horizontal, kanan bicara */
    const cx9 = c9 ? (c9.sx + c9.sw / 2) / 640 : null;
    const cx16 = c16 ? (c16.sx + c16.sw / 2) / 640 : null;
    return {
      c9, c16, cx9: cx9 && +cx9.toFixed(3), cx16: cx16 && +cx16.toFixed(3),
      asp9: c9 ? +(c9.sw / c9.sh).toFixed(4) : null,
      asp16: c16 ? +(c16.sw / c16.sh).toFixed(4) : null,
      off: spkCropAt(640, 360, 1080, 1920, 99) === null ? false : true
    };
  })()`);
  ok('Crop vertikal 9:16 sempit (≤ 0.45 lebar)', crop.c9 && crop.c9.sw <= 0.45 * 640, JSON.stringify(crop.c9));
  ok('Aspek crop = 9:16 persis', Math.abs(crop.asp9 - 0.5625) < 0.02, 'dapat ' + crop.asp9);
  ok('Crop vertikal di KIRI saat kiri bicara', crop.cx9 !== null && crop.cx9 < 0.45, 'cx=' + crop.cx9);
  /* v3.1: kotak mode-halves selebar ½ frame — 3.4× melebihi lebar video →
     fallback penuh (cx tengah) adalah perilaku BENAR; yang penting kamera
     tidak nyangkut di kiri dan aspek terjaga */
  ok('Crop 16:9 tidak nyangkut ke kiri (fallback benar)', crop.cx16 !== null && crop.cx16 >= 0.45, 'cx=' + crop.cx16);
  ok('Aspek crop 16:9 terjaga', Math.abs(crop.asp16 - 16 / 9) < 0.02, 'dapat ' + crop.asp16);

  /* ============ D. PRATINJAU TIDAK CRASH (regresi) ============ */
  console.log('D. REGRESI KOMPOSISI');
  const reg = await cdp.eval(`(async () => {
    /* headless: bingkai pertama baru ter-decode setelah SEEK — pengguna
       nyata selalu play/seek dulu, jadi ini khas lingkungan uji */
    videoEl.currentTime = 8;
    await new Promise(r => { videoEl.addEventListener('seeked', r, { once: true }); setTimeout(r, 3000); });
    const c = document.createElement('canvas'); c.width = 506; c.height = 900;
    const g = c.getContext('2d');
    drawComposition(g, 506, 900, 8);
    const d = g.getImageData(0, 0, 506, 900).data;
    let lit = 0; for (let i = 0; i < d.length; i += 160) if (d[i] + d[i+1] + d[i+2] > 90) lit++;
    return { lit };
  })()`, 60000);
  ok('Preview 9:16 tergambar (zoom aktif, orang kiri memenuhi layar)', reg.lit > 3000, 'lit=' + reg.lit);

  /* ============ E. EKSPOR NYATA 9:16 + ZOOM ============ */
  console.log('E. EKSPOR NYATA (vertikal 1080×1920)');
  const exp = await cdp.eval(`(async () => {
    /* PENTING: JANGAN bump mediaEpoch di sini — hasil analisis (spk.epoch)
       harus tetap sah agar ZOOM PEMBICARA aktif selama ekspor ini */
    state.title = 'UJIV31'; state.splitSec = 30; state.splitMode = 'dur'; state.sceneCuts = [];
    state.rangeStart = 0; state.rangeEnd = 0; state.cuts = [];
    state.resumeExport = false; state.targetMB = 0; state.speed = 1;
    state.frameStyle = 'off'; state.colorFilter = 'off'; state.ratio = '9:16';
    const segsDbg = segments().map(s => [+s.start.toFixed(2), +s.end.toFixed(2)]);
    const res = await exportPartsToDir('${OUTDIR}', { prog() { }, sub() { }, title() { } });
    return { files: res.map(r => ({ name: r.name, size: r.size, skipped: !!r.skipped })), spkAktif: spkActive(), durState: state.duration, vidDur: videoEl.duration, segsDbg };
  })()`, 420000);
  ok('Ekspor 1 part vertikal sukses (zoom pembicara AKTIF)', exp.files.length === 1 && exp.files[0].size > 50000 && exp.spkAktif === true, JSON.stringify(exp).slice(0, 300));

  /* ============ F. VERIFIKASI FILE & WARNA HASIL ============ */
  console.log('F. VERIFIKASI HASIL (ffprobe + piksel)');
  const partFile = path.join(OUTDIR, 'UJIV31_PART_01.mp4');
  ok('File part ada', fs.existsSync(partFile));
  if (fs.existsSync(partFile)) {
    const p = JSON.parse(execSync(`ffprobe -v error -show_entries stream=codec_type,codec_name,width,height -show_entries format=duration -of json '${partFile}'`).toString());
    const vs = p.streams.find(s => s.codec_type === 'video');
    const as = p.streams.find(s => s.codec_type === 'audio');
    ok('Output VERTIKAL 1080×1920 H.264', vs && vs.width === 1080 && vs.height === 1920 && vs.codec_name === 'h264', JSON.stringify(vs));
    ok('Output punya audio', !!as, JSON.stringify(p.streams.map(s => s.codec_type)));
    ok('Durasi ±30 dtk', +p.format.duration > 28, (+p.format.duration).toFixed(2));
    const grab = (ss) => {
      const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(ss), '-i', partFile, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 32 * 1024 * 1024 });
      return r.stdout;
    };
    const stats = (buf) => {
      /* rata-rata R & B sepertiga kiri + kanan (1080×1920) */
      let lR = 0, lB = 0, rR = 0, rB = 0, nL = 0, nR = 0;
      for (let y = 0; y < 1920; y += 4) {
        for (let x = 0; x < 1080; x += 4) {
          const i = (y * 1080 + x) * 3;
          if (x < 540) { lR += buf[i]; lB += buf[i + 2]; nL++; }
          else { rR += buf[i]; rB += buf[i + 2]; nR++; }
        }
      }
      return { lR: lR / nL, lB: lB / nL, rR: rR / nR, rB: rB / nR };
    };
    const f8 = stats(grab(8));    /* kiri bicara → frame didominasi MERAH */
    const f18 = stats(grab(18));  /* kanan bicara → frame didominasi BIRU */
    const meanR8 = (f8.lR + f8.rR) / 2, meanB8 = (f8.lB + f8.rB) / 2;
    const meanR18 = (f18.lR + f18.rR) / 2, meanB18 = (f18.lB + f18.rB) / 2;
    ok('Hasil t=8 dikuasai pembicara MERAH (zoom kiri benar)', meanR8 > meanB8 * 1.35, `R=${meanR8.toFixed(0)} B=${meanB8.toFixed(0)}`);
    ok('Hasil t=18 dikuasai pembicara BIRU (zoom kanan benar)', meanB18 > meanR18 * 1.35, `R=${meanR18.toFixed(0)} B=${meanB18.toFixed(0)}`);
  }

  /* ============ G. SETELAN GLOBAL ANTAR VIDEO ============ */
  console.log('G. SETELAN GLOBAL');
  const glob = await cdp.eval(`(async () => {
    const wasOn = state.spk.on, wasAuto = state.spk.auto;
    await loadFromPath('${ROOT}/testmedia/short-a.mp4', true);
    return { wasOn, wasAuto, on: state.spk.on, auto: state.spk.auto,
      ready: state.spk.ready, n: state.spk.nSpeak,
      expSumHit: (() => { updateAll(); return $('#expSum').textContent.includes('ZOOM PEMBICARA'); })() };
  })()`, 120000);
  ok('Fitur tetap AKTIF utk video berikutnya (global)', glob.wasOn && glob.on && glob.auto);
  ok('Hasil analisis video lama DIRESET', glob.ready === false && glob.n === 0);
  ok('Ringkasan ekspor menampilkan ZOOM PEMBICARA', glob.expSumHit);

  /* ============ H. MODE SAAT SENYAP: TAMPILKAN SEMUA ============ */
  console.log('H. MODE SENYAP = WIDE');
  const wide = await cdp.eval(`(async () => {
    await loadFromPath('${ROOT}/testmedia/podcast.mp4', true);
    state.spk.silence = 'wide';
    await analyzeSpeakers({ prog() { }, stat() { } });
    const w13 = spkSpeakerAt(13), w8 = spkSpeakerAt(8);
    state.spk.silence = 'hold';
    return { w13, w8, segs: state.spk.timeline.length };
  })()`, 420000);
  ok('Senyap → segmen TAMPIL SEMUA (idx -1)', wide.w13 === -1, JSON.stringify(wide));
  ok('Saat bicara tetap fokus pembicara', wide.w8 >= 0);

  /* ---------- ringkasan ---------- */
  try {
    const logs = await cdp.eval(`window.__LOGS.filter(l => /part|venc|aenc|GAGAL|gagal|metadata|macet|duri/i.test(l)).slice(0, 25)`);
    if (logs && logs.length) { console.log('\n--- LOG HALAMAN ---'); logs.forEach(l => console.log(' ', l.slice(0, 230))); }
  } catch (e) { }
  console.log(`\n================ HASIL: ${pass} LULUS · ${fail} GAGAL ================`);
  if (fails.length) fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('FATAL:', e.message);
  process.exit(2);
}
