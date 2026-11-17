/* ================================================================
   UJI EKSPOR NYATA v3.26.1 — modul EKSPOR & SPLIT anti-beku
   1) Ekspor NYATA 2 part (30 dtk × 2 + cover 3 dtk di part 1) dgn
      MODE KILAT + paralel 2× — jalur loop cover & kilat yang baru
      diberi penjaga antrean 20 dtk (dulu spin tanpa akhir → watchdog
      45 dtk → "GAGAL: render berhenti merespons").
   2) BERSIHKAN CACHE (dry:false) → cache shader GPU DIJADWALKAN
      (marker pending-gpu-cache-clean.json), TIDAK dihapus saat sesi.
   3) Buka ulang aplikasi → tunggakan dihapus saat mulai (log main).
   Pakai: bash scripts/run-test-xvfb.sh scripts/kinostra-export-test.mjs 120
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/home/z/my-project';
const PORT = 9507;
const VIDEO = '/home/z/my-project/testmedia/long120.mp4';
const OUT = '/home/z/my-project/testmedia/out-v3261';
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  LULUS  ' + n)) : (fail++, console.log(`  GAGAL  ${n} ${x}`)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map();
    ws.addEventListener('message', e => { const m = JSON.parse(e.data);
      if (m.id && this.pend.has(m.id)) { const { res, rej } = this.pend.get(m.id); this.pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } });
  }
  static async connect(port, tries = 75) {
    for (let i = 0; i < tries; i++) {
      try { const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        const page = list.find(t => t.type === 'page' && /index\.html/.test(t.url));
        if (page) { const ws = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); setTimeout(() => rej(new Error('ws')), 8000); });
          return new CDP(ws); } } catch (e) { }
      await sleep(1000);
    } throw new Error('CDP tidak tersambung');
  }
  send(method, params = {}) { return new Promise((res, rej) => { const id = ++this.id; this.pend.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expr, timeoutMs = 30000) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: timeoutMs });
    if (r.exceptionDetails) throw new Error('PAGE-ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300));
    return r.result.value;
  }
}
async function reconnect(cdp) {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const pg = list.find(t => t.type === 'page' && /index\.html/.test(t.url));
  if (!pg) throw new Error('tidak ada target');
  const ws = new WebSocket(pg.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); setTimeout(() => rej(new Error('ws')), 8000); });
  cdp.ws = ws; cdp.pend = new Map();
}
async function evalRetry(cdp, expr, ms = 12000) {
  try { return await evalRace(cdp, expr, ms); }
  catch (e) { await reconnect(cdp); return await evalRace(cdp, expr, ms); }
}
async function evalRace(cdp, expr, ms = 15000) {
  let to;
  return Promise.race([cdp.eval(expr), new Promise((_, rej) => { to = setTimeout(() => rej(new Error('eval-timeout ' + ms + 'ms')), ms); })]).finally(() => clearTimeout(to));
}
async function loadVideo(cdp) {
  for (let percobaan = 1; percobaan <= 3; percobaan++) {
    await evalRetry(cdp, `loadFromPath(${JSON.stringify(VIDEO)}); 'ok'`, 30000);
    for (let i = 0; i < 30; i++) { await sleep(1000);
      const s = await evalRetry(cdp, `state.duration || 0`, 6000).catch(() => 0);
      if (s > 0) return true; }
    console.log(`muat percobaan ${percobaan} gagal — coba lagi`);
  }
  return false;
}
function startApp(stdoutSink) {
  const app = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
  app.stdout.on('data', d => { const s = String(d); if (stdoutSink) stdoutSink.push(s); });
  process.on('exit', () => { try { app.kill('SIGKILL'); } catch (e) { } });
  return app;
}

try {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const sink = [];
  let app = startApp(sink);
  const cdp = await CDP.connect(PORT);
  await sleep(2000);
  await evalRetry(cdp, `try { localStorage.removeItem('kinostra.liteplay'); localStorage.removeItem('kinostra.canvasPlay'); } catch (e) {} 'bersih'`);

  ok('Video 2 jam termuat', await loadVideo(cdp));
  /* konfigurasi: 60 dtk pertama, split 30 dtk → 2 part + cover 3 dtk */
  const cfg = await evalRetry(cdp, `(() => {
    state.rangeStart = 0; state.rangeEnd = 60; state.splitSec = 30; state.splitMode = state.splitMode || 'durasi';
    state.cover.on = true; state.cover.dur = 3; state.cover.auto = true;   /* auto: frame dr video, tanpa gambar */
    state.kilat = 'on'; state.parallel = 2; state.title = 'UJI V3261'; state.partPrefix = 'PART';
    return { segs: segments().length, cov: coverDurFor(null) };
  })()`, 12000);
  ok('Konfigurasi: 2 part dgn range 60 dtk', cfg && cfg.segs === 2, JSON.stringify(cfg));
  ok('Cover aktif 3 dtk', cfg && Math.abs(cfg.cov - 3) < 0.01, String(cfg && cfg.cov));

  /* jadwalkan bersih-bersih cache GPU (v3.26.1: tak dihapus saat sesi) */
  const cl = await evalRetry(cdp, `window.kinostra.cleanupCache({ dry: false })`, 15000);
  const sched = cl && (cl.cleared || []).includes('gpu-shader-scheduled');
  ok('Cache shader GPU diJADWALKAN (marker), bukan dihapus saat sesi', sched, JSON.stringify(cl && cl.cleared));

  /* ===== EKSPOR NYATA ===== */
  const t0 = Date.now();
  const exp = await evalRetry(cdp, `(async () => {
    try {
      const res = await exportPartsToDir('${OUT}', { title() { }, prog() { }, sub() { } });
      return { n: res.length, fatal: state.exportFatal ? String(state.exportFatal.message) : null };
    } catch (e) { return { n: 0, err: String((e && e.message) || e) }; }
  })()`, 240000);
  const el = (Date.now() - t0) / 1000;
  ok(`Ekspor nyata 2 part selesai (${el.toFixed(0)} dtk) tanpa fatal`, exp && exp.n === 2 && !exp.fatal && !exp.err, JSON.stringify(exp));

  const OUTJ = JSON.stringify(OUT + '/');
  const st = await evalRetry(cdp, `(async () => {
    const out = [];
    for (const nm of ['UJI_V3261_PART_01.mp4', 'UJI_V3261_PART_02.mp4']) {
      try { const s = await window.kinostra.stat(${OUTJ} + nm); out.push(s && s.ok ? s.size : 0); } catch (e) { out.push(-1); }
    }
    return out;
  })()`, 15000).catch(() => [0, 0]);
  ok('File part tersimpan & berukuran wajar', Array.isArray(st) && st[0] > 100000 && st[1] > 100000, JSON.stringify(st));

  try { await evalRace(cdp, `'x'`, 1500); } catch (e) { }
  app.kill('SIGKILL');
  await sleep(2500);

  /* ===== FASE B: buka ulang → tunggakan cache GPU dihapus saat mulai ===== */
  if (sched) {
    const sink2 = [];
    app = startApp(sink2);
    for (let i = 0; i < 25; i++) { await sleep(1000); if (sink2.join('').includes('MAIN-READY')) break; }
    await sleep(3000);
    const log2 = sink2.join('');
    ok('Buka ulang: tunggakan cache shader/kode GPU dihapus saat mulai (log main)', /tunggakan cache shader\/kode GPU dihapus saat mulai/.test(log2), log2.split('\n').filter(l => /tunggakan|MAIN-READY/.test(l)).slice(0, 3).join(' | ').slice(0, 160));
    try { app.kill('SIGKILL'); } catch (e) { }
  } else {
    console.log('  INFO   cache GPU kosong di sandbox — fase marker dilewati');
  }
  console.log('SELESAI: ' + pass + ' lulus, ' + fail + ' gagal');
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('UJI ERROR:', e.message);
  process.exit(1);
}
