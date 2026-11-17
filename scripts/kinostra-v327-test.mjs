/* ================================================================
   UJI v3.27.0 — MODUL 03: UKURAN 10% + WARNA TULISAN PART
   1) Slider ukuran tulisan part kini 10%–250% (dulu 50% minimal)
   2) Warna tulisan part bebas (intro & label pojok); OTOMATIS = putih
      gading; garis hias & sub-info tetap bawaan; preset ikut menyimpan
   3) Pixel test: teks merah muncul di kedua mode, ukuran 10% vs 100%
   4) Ekspor nyata smoke 1 part dgn 10% + merah
   Pakai: bash scripts/run-test-xvfb.sh scripts/kinostra-v327-test.mjs 120
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/home/z/my-project';
const PORT = 9508;
const VIDEO = '/home/z/my-project/testmedia/long120.mp4';
const OUT = '/home/z/my-project/testmedia/out-v327';
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
async function evalRace(cdp, expr, ms = 15000) {
  let to;
  return Promise.race([cdp.eval(expr), new Promise((_, rej) => { to = setTimeout(() => rej(new Error('eval-timeout')), ms); })]).finally(() => clearTimeout(to));
}
async function evalRetry(cdp, expr, ms = 12000) {
  try { return await evalRace(cdp, expr, ms); }
  catch (e) { await reconnect(cdp); return await evalRace(cdp, expr, ms); }
}
async function loadVideo(cdp) {
  for (let percobaan = 1; percobaan <= 3; percobaan++) {
    await evalRetry(cdp, `loadFromPath(${JSON.stringify(VIDEO)}); 'ok'`, 30000);
    for (let i = 0; i < 30; i++) { await sleep(1000);
      const s = await evalRetry(cdp, `state.duration || 0`, 6000).catch(() => 0);
      if (s > 0) return true; }
  }
  return false;
}
function startApp() {
  const app = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
  process.on('exit', () => { try { app.kill('SIGKILL'); } catch (e) { } });
  return app;
}

try {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const app = startApp();
  const cdp = await CDP.connect(PORT);
  await sleep(2000);
  ok('Video 2 jam termuat', await loadVideo(cdp));

  /* ===== UI: slider 10% + warna ===== */
  const ui = await evalRetry(cdp, `(() => {
    const sld = $('#inPartSize'), cin = $('#inPartColor'), btn = $('#btnPartColorAuto');
    const minOK = sld && sld.min === '0.1';
    sld.value = '0.1'; sld.dispatchEvent(new Event('input', { bubbles: true }));
    const st10 = state.partSize;
    sld.value = '1'; sld.dispatchEvent(new Event('input', { bubbles: true }));
    cin.value = '#ff0000'; cin.dispatchEvent(new Event('input', { bubbles: true }));
    const cRed = state.partColor;
    let lblRed = $('#partColorV') ? $('#partColorV').textContent : '';
    btn.click();
    const cAuto = state.partColor, lblAuto = $('#partColorV') ? $('#partColorV').textContent : '';
    return { minOK, st10, cRed, lblRed, cAuto, lblAuto };
  })()`, 12000);
  ok('Slider UKURAN PART kini min 10% (dulu 50%)', ui && ui.minOK && Math.abs(ui.st10 - 0.1) < 0.001, JSON.stringify(ui));
  ok('Pemilih warna: merah diterapkan + label ikut', ui && ui.cRed === '#ff0000' && ui.lblRed === '#FF0000', JSON.stringify(ui));
  ok('Tombol OTOMATIS kembali ke bawaan', ui && ui.cAuto === '' && ui.lblAuto === 'OTOMATIS', JSON.stringify(ui));

  /* ===== PIXEL (metode DIFF): render A vs B — piksel yang berubah = area teks
     persis (kebal polusi warna video latar). Intro (bumper) ===== */
  const px = await evalRetry(cdp, `(() => {
    const W = 960, H = 540;
    const cvA = document.createElement('canvas'); cvA.width = W; cvA.height = H;
    const cvB = document.createElement('canvas'); cvB.width = W; cvB.height = H;
    const xa = cvA.getContext('2d'), xb = cvB.getContext('2d');
    const diff = () => { const da = xa.getImageData(0, 0, W, H).data, db = xb.getImageData(0, 0, W, H).data; let n = 0;
      for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i]-db[i]) + Math.abs(da[i+1]-db[i+1]) + Math.abs(da[i+2]-db[i+2]) + Math.abs(da[i+3]-db[i+3]) > 60) n++; return n; };
    const amber = (d) => { let n = 0; for (let i = 0; i < d.length; i += 4)
      if (d[i+3] > 200 && d[i] > 225 && d[i+1] > 120 && d[i+1] < 200 && d[i+2] < 90) n++; return n; };
    state.partShow = 'intro'; state.partAnim = 'off'; state.partPrefix = 'PART'; state._noPart = false;
    state.partSize = 1; state.partColor = '';
    drawComposition(xa, W, H, 0.3, { native: false });   /* A = 100% OTOMATIS */
    const amberAuto = amber(xa.getImageData(0, 0, W, H).data);
    state.partColor = '#ff0000';
    drawComposition(xb, W, H, 0.3, { native: false });   /* B = 100% MERAH */
    const dIntro100red = diff();          /* piksel berubah = area teks 100% */
    state.partSize = 0.1; state.partColor = '';
    drawComposition(xa, W, H, 0.3, { native: false });   /* A = 10% OTOMATIS */
    state.partColor = '#ff0000';
    drawComposition(xb, W, H, 0.3, { native: false });   /* B = 10% MERAH */
    const dIntro10 = diff();              /* area teks 10% */
    state.partSize = 1; state.partColor = '';
    return { amberAuto, dIntro100red, dIntro10 };
  })()`, 20000);
  ok('Intro 100%: warna merah mengubah area teks (diff besar)', px && px.dIntro100red > 800, JSON.stringify(px));
  ok('Garis hias TETAP amber saat warna teks merah', px && px.amberAuto > 30, JSON.stringify(px));
  ok('Intro 10%: teks tetap tergambar, area menyusut wajar (>30× lebih kecil)',
    px && px.dIntro10 > 10 && px.dIntro10 * 30 < px.dIntro100red, JSON.stringify(px));

  /* ===== PIXEL (DIFF): label pojok (SELALU TAMPIL) ===== */
  const px2 = await evalRetry(cdp, `(() => {
    const W = 960, H = 540;
    const cvA = document.createElement('canvas'); cvA.width = W; cvA.height = H;
    const cvB = document.createElement('canvas'); cvB.width = W; cvB.height = H;
    const xa = cvA.getContext('2d'), xb = cvB.getContext('2d');
    const diff = () => { const da = xa.getImageData(0, 0, W, H).data, db = xb.getImageData(0, 0, W, H).data; let n = 0;
      for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i]-db[i]) + Math.abs(da[i+1]-db[i+1]) + Math.abs(da[i+2]-db[i+2]) + Math.abs(da[i+3]-db[i+3]) > 60) n++; return n; };
    state.partShow = 'always'; state.partAnim = 'off'; state.partPrefix = 'PART'; state._noPart = false;
    state.partSize = 1; state.partColor = '';
    drawComposition(xa, W, H, 5.0, { native: false });
    drawComposition(xb, W, H, 5.0, { native: false });
    xb.putImageData(xa.getImageData(0, 0, W, H), 0, 0);   /* B = A (merah vs merah → diff 0) */
    state.partColor = '#ff0000';
    drawComposition(xb, W, H, 5.0, { native: false });
    const red100 = diff();
    state.partSize = 0.1; state.partColor = '';
    drawComposition(xa, W, H, 5.0, { native: false });   /* A = 10% OTOMATIS */
    state.partColor = '#ff0000';
    drawComposition(xb, W, H, 5.0, { native: false });   /* B = 10% MERAH */
    const red10 = diff();
    state.partColor = ''; state.partShow = 'intro';
    return { red100, red10 };
  })()`, 20000);
  ok('Label pojok MERAH muncul & ikut skala 10%', px2 && px2.red100 > 50 && px2.red10 > 2 && px2.red10 * 15 < px2.red100, JSON.stringify(px2));

  /* ===== native overlay redraw saat warna berubah ===== */
  const sig = await evalRetry(cdp, `(() => {
    const s1 = nativeOverlaySig(1.0);
    state.partColor = '#123456';
    const s2 = nativeOverlaySig(1.0);
    state.partColor = '';
    return { beda: s1 !== s2 };
  })()`, 10000);
  ok('Overlay native menggambar ulang saat warna part berubah', sig && sig.beda, JSON.stringify(sig));

  /* ===== PRESET roundtrip — preset menyimpan nilai KONTROL UI (slider) +
     warna via state snapshot (pola neonColor). Ukuran: set lewat UI dulu. ===== */
  const pr = await evalRetry(cdp, `(() => {
    $('#inPartSize').value = '0.3'; $('#inPartSize').dispatchEvent(new Event('input', { bubbles: true }));
    state.partColor = '';
    const before = { c: state.partColor, s: state.partSize };
    const snap = captureSettings();
    /* ubah: ukuran lewat UI, warna langsung state */
    $('#inPartSize').value = '2.2'; $('#inPartSize').dispatchEvent(new Event('input', { bubbles: true }));
    state.partColor = '#00ff00';
    const applied = applySettingsData(snap);
    return { before, restored: { c: state.partColor, s: state.partSize }, applied };
  })()`, 12000);
  ok('Preset menyimpan & memulihkan warna + ukuran part',
    pr && pr.restored.c === pr.before.c && Math.abs(pr.restored.s - pr.before.s) < 0.001, JSON.stringify(pr));

  /* ===== EKSPOR NYATA smoke: 1 part, 10%, merah ===== */
  const exp = await evalRetry(cdp, `(async () => {
    state.rangeStart = 0; state.rangeEnd = 10; state.splitSec = 9999;
    state.cover.on = false; state.kilat = 'off'; state.parallel = 1;
    state.partSize = 0.1; state.partColor = '#ff0000'; state.partShow = 'intro';
    try {
      const res = await exportPartsToDir('${OUT}', { title() { }, prog() { }, sub() { } });
      return { n: res.length, fatal: state.exportFatal ? String(state.exportFatal.message) : null };
    } catch (e) { return { n: 0, err: String((e && e.message) || e) }; }
  })()`, 180000);
  ok('Ekspor nyata 1 part (10% + merah) selesai tanpa fatal', exp && exp.n === 1 && !exp.fatal && !exp.err, JSON.stringify(exp));
  const f = (fs.readdirSync(OUT)[0]) || '';
  const sz = f ? fs.statSync(OUT + '/' + f).size : 0;
  ok('File hasil ekspor tersimpan & berukuran wajar', sz > 50000, f + ' ' + sz);

  try { app.kill('SIGKILL'); } catch (e) { }
  console.log('SELESAI: ' + pass + ' lulus, ' + fail + ' gagal');
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('UJI ERROR:', e.message);
  process.exit(1);
}
