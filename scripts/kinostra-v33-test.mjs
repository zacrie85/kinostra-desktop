/* ================================================================
   KINOSTRA v3.3 — UJI BACKSOUND MP3 SENDIRI (Xvfb + CDP)
   Jalankan: DISPLAY=:99 node scripts/kinostra-v33-test.mjs
   Media uji: testmedia/bs-sine.mp3 (1200Hz 8 dtk) + testmedia/podcast.mp4
   (podcast: audio 440Hz mulai detik ke-5 → jendela 0–4 dtk SUNYI, cocok
   untuk mengukur kontribusi backsound secara terpisah)
   ================================================================ */
import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project';
const OUTDIR = '/tmp/kinov33out';
const PORT = 9450;
let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  LULUS  ${name}`); }
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); console.log(`  GAGAL  ${name} ${extra}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
  async eval(expr, timeoutMs = 300000) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: timeoutMs });
    if (r.exceptionDetails) throw new Error('PAGE-ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 600));
    return r.result.value;
  }
}

fs.rmSync(OUTDIR, { recursive: true, force: true });
fs.mkdirSync(OUTDIR, { recursive: true });
console.log('Menjalankan Electron (Xvfb)…');
const app = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu-sandbox'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }
});
process.on('exit', () => { try { app.kill('SIGKILL'); } catch (e) { } });

let cdp;
try {
  cdp = await CDP.connect(PORT);
  await cdp.send('Runtime.enable');
  await sleep(2500);
  console.log('CDP tersambung.\n');

  /* ============ A. SMOKE ============ */
  console.log('A. SMOKE UI BACKSOUND');
  const smoke = await cdp.eval(`(() => ({
    btn: !!document.querySelector('#btnBsound'), clr: !!document.querySelector('#btnBsoundClear'),
    inp: !!document.querySelector('#bsoundInput'), on: !!document.querySelector('#bsoundOn'),
    vol: !!document.querySelector('#inBS'), stat: !!document.querySelector('#bsoundStat'),
    state: !!state.bsound && typeof state.bsound.gain === 'number',
    loadFile: typeof loadBsoundFile === 'function', loadPath: typeof loadBsoundFromPath === 'function',
    sync: typeof startBsoundSync === 'function', stop: typeof stopBsoundPreview === 'function',
    lbl: document.body.innerHTML.includes('BACKSOUND MP3 SENDIRI')
  }))()`);
  ok('Semua elemen UI backsound ada', smoke.btn && smoke.clr && smoke.inp && smoke.on && smoke.vol && smoke.stat);
  ok('state.bsound + fungsi loader/sync ada', smoke.state && smoke.loadFile && smoke.loadPath && smoke.sync && smoke.stop);
  ok('Label BACKSOUND MP3 SENDIRI tampil', smoke.lbl);

  /* ============ B. MUAT MP3 ============ */
  console.log('B. MUAT FILE MP3 (jalur path via kfile)');
  const b = await cdp.eval(`(async () => {
    document.querySelector('#autoSub').checked = false;
    await loadFromPath('${ROOT}/testmedia/podcast.mp4', true);
    if (!state.file) return { err: 'load video gagal' };
    const r = await loadBsoundFromPath('${ROOT}/testmedia/bs-sine.mp3');
    return { r, bufDur: state.bsound.buffer ? +state.bsound.buffer.duration.toFixed(2) : 0,
      name: state.bsound.name, on: state.bsound.on,
      stat: document.querySelector('#bsoundStat').textContent.slice(0, 80) };
  })()`);
  ok('MP3 ter-decode jadi AudioBuffer (±8 dtk)', b.r && b.r.ok && Math.abs(b.bufDur - 8) < 0.5, JSON.stringify(b).slice(0, 200));
  ok('Nama file + status SIAP tampil di UI', /bs-sine\.mp3/.test(b.name || '') && /SIAP/.test(b.stat || ''), b.stat);

  /* ============ C. MIX RENDER (renderMix) ============ */
  console.log('C. KONTRIBUSI BACKSOUND DI MESIN MIX');
  const c = await cdp.eval(`(async () => {
    const rmsOf = async (start, len) => {
      const m = await renderMix(start, len, 1);
      const d = m.getChannelData(0); let s = 0;
      for (let i = 0; i < d.length; i++) s += d[i] * d[i];
      return Math.sqrt(s / d.length);
    };
    state.music.buffer = null;               /* isolasi: skor prosedural mati */
    state.bsound.on = false;
    const off = await rmsOf(0, 2);           /* podcast 0–5 dtk sunyi → hanya backsound bisa bunyi */
    state.bsound.on = true; state.bsound.gain = 1.0;
    const on = await rmsOf(0, 2);
    state.bsound.gain = 0.3;
    const soft = await rmsOf(0, 2);
    state.bsound.gain = 1.0;
    const loop = await rmsOf(20, 1);         /* buffer 8 dtk, t=20 → WAJIB loop */
    state.bsound.on = false;
    const off2 = await rmsOf(0, 2);
    state.bsound.on = true; state.bsound.gain = 0.35;
    return { off, on, soft, loop, off2, ratio: on > 0 ? soft / on : 0 };
  })()`);
  ok('Backsound MATI → mix sunyi (jendela 0–2 dtk)', c.off < 0.005, 'rms=' + c.off.toFixed(5));
  ok('Backsound NYALA → mix berbunyi', c.on > 0.05, 'rms=' + c.on.toFixed(4));
  ok('Volume 30% ≈ 1/3× volume 100%', c.ratio > 0.2 && c.ratio < 0.5, 'ratio=' + c.ratio.toFixed(3));
  ok('LOOP: tetap bunyi di t=20 dtk (buffer cuma 8 dtk)', c.loop > 0.05, 'rms=' + c.loop.toFixed(4));
  ok('Cheklis ON/OFF mengontrol mix (off2 sunyi)', c.off2 < 0.005, 'rms=' + c.off2.toFixed(5));

  /* ============ D. PRATINJAU SINKRON ============ */
  console.log('D. PRATINJAU (guarded saat pause)');
  const d = await cdp.eval(`(() => {
    videoEl.pause();
    startBsoundSync();                       /* pause → tidak boleh bikin sumber */
    const pausedOk = bsSrc === null;
    stopBsoundPreview();                     /* idempoten, tidak boleh error */
    return { pausedOk };
  })()`);
  ok('startBsoundSync saat pause = aman (tanpa sumber)', d.pausedOk);

  /* ============ E. EKSPOR NYATA DENGAN BACKSOUND ============ */
  console.log('E. EKSPOR NYATA (3 part, backsound 80%)');
  const e = await cdp.eval(`(async () => {
    state.bsound.on = true; state.bsound.gain = 0.8;
    const ip = document.querySelector('#inSplitParts');
    ip.value = '3'; ip.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 300));
    const res = await exportPartsToDir('${OUTDIR}', { prog() { }, sub() { }, title() { } });
    return { n: segmentsCount(), files: res.files ? res.files.length : null };
  })()`);
  const mp4s = fs.readdirSync(OUTDIR).filter(f => /_PART_\d+\.mp4$/.test(f)).sort();
  ok('3 part MP4 tersimpan', mp4s.length === 3, JSON.stringify({ e, mp4s }));
  const vol = mp4s.map(f => {
    try {
      const o = execSync(`ffmpeg -i '${path.join(OUTDIR, f)}' -af volumedetect -f null - 2>&1 | rg "mean_volume" || echo "mean_volume: -99 dB"`).toString();
      return +(o.match(/mean_volume:\s*(-?[\d.]+)/) || [0, -99])[1];
    } catch (er) { return -99; }
  });
  ok('Audio hasil EKSPOR tidak sunyi (backsound terdengar, mean > -40 dB)', vol.length === 3 && vol.every(v => v > -40), JSON.stringify(vol));

  /* ============ F. HAPUS BACKSOUND ============ */
  console.log('F. HAPUS BACKSOUND');
  const f = await cdp.eval(`(() => {
    document.querySelector('#btnBsoundClear').click();
    return { buf: state.bsound.buffer, name: state.bsound.name, stat: document.querySelector('#bsoundStat').textContent.slice(0, 50) };
  })()`);
  ok('Buffer + nama dibersihkan, stat kembali default', f.buf === null && f.name === '' && /Belum ada backsound/.test(f.stat), JSON.stringify(f));

  /* ---------- ringkasan ---------- */
  console.log(`\n===== HASIL: ${pass} LULUS, ${fail} GAGAL =====`);
  if (fails.length) { console.log('Gagal:'); fails.forEach(x => console.log('  - ' + x)); process.exit(1); }
} catch (e2) {
  console.error('FATAL:', e2.message);
  process.exit(2);
} finally {
  try { app.kill('SIGKILL'); } catch (e2) { }
}
process.exit(0);
