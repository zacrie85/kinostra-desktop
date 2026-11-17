/* ================================================================
   UJI v3.28.0 — 15 FRAME JUDUL (5 ELEGAN TRANSPARAN BARU) +
   15 FRAME FUTURISTIK TRANSPARAN utk PART/EPISODE (FITUR BARU)
   1) TITLEFRAMES kini 15 gaya (+TANPA) — semua tergambar (pixel-DIFF)
   2) PARTFRAMES 15 gaya baru — chips di modul 03, tergambar di bumper
      intro & label pojok, ikut skala ukuran part
   3) Preset ikut menyimpan frame part; overlay native gambar ulang
   4) Ekspor nyata smoke: 1 part dgn frame part + warna merah + 60%
   Pakai: bash scripts/run-test-xvfb.sh scripts/kinostra-v328-test.mjs 120
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/home/z/my-project';
const PORT = 9508;
const VIDEO = '/home/z/my-project/testmedia/long120.mp4';
const OUT = '/home/z/my-project/testmedia/out-v328';
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
  ok('Video panjang termuat', await loadVideo(cdp));

  /* ===== UI: chips frame judul (16) & frame part (16) ===== */
  const ui = await evalRetry(cdp, `(() => {
    const tb = $('#titleFrameChips'), pb = $('#partFrameChips');
    const nt = tb ? tb.querySelectorAll('button').length : 0;
    const np = pb ? pb.querySelectorAll('button').length : 0;
    const pBtn = [...(pb || { querySelectorAll: () => [] }).querySelectorAll('button')].find(b => b.dataset.v === 'hud');
    if (pBtn) pBtn.click();
    const stAfter = state.partFrame;
    const lblToast = [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' ');
    const sig1 = nativeOverlaySig(1.0);
    state.partFrame = 'kapsul';
    const sigBeda = sig1 !== nativeOverlaySig(1.0);
    state.partFrame = stAfter;
    return { nt, np, stAfter, sigBeda, lblToast };
  })()`, 15000);
  ok('Chips FRAME JUDUL: 16 gaya + TANPA + PNG SENDIRI (17 tombol — v3.34)', ui && ui.nt >= 16, 'n=' + (ui && ui.nt));
  ok('Chips FRAME PART: 15 gaya + TANPA + PNG SENDIRI (17 tombol — v3.34)', ui && ui.np >= 16, 'n=' + (ui && ui.np));
  ok('Klik chip HUD → state.partFrame ikut + toast', ui && ui.stAfter === 'hud' && /frame part/i.test(ui.lblToast || ''), JSON.stringify(ui && { st: ui.stAfter, t: (ui.lblToast || '').slice(0, 60) }));
  ok('Overlay native menggambar ulang saat frame part berubah', ui && ui.sigBeda, '');

  /* ===== PIXEL-DIFF: 15 frame judul — semua mengubah piksel ===== */
  const td = await evalRetry(cdp, `(() => {
    const W = 960, H = 540;
    const cvA = document.createElement('canvas'); cvA.width = W; cvA.height = H;
    const cvB = document.createElement('canvas'); cvB.width = W; cvB.height = H;
    const xa = cvA.getContext('2d'), xb = cvB.getContext('2d');
    state.titleOn = true; state.title = 'PETUALANGAN GUNUNG'; state.titleSize = 40; state.titlePosY = 0;
    state.partShow = 'off'; state.descOn = false; state.subsOn = false;
    const per = {};
    for (const f of TITLEFRAMES) {
      if (f.k === 'off') continue;
      state.titleFrame = 'off';
      drawComposition(xa, W, H, 5.0, { native: false });
      state.titleFrame = f.k;
      drawComposition(xb, W, H, 5.0, { native: false });
      const da = xa.getImageData(0, 0, W, H).data, db = xb.getImageData(0, 0, W, H).data;
      let n = 0;
      for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i]-db[i]) + Math.abs(da[i+1]-db[i+1]) + Math.abs(da[i+2]-db[i+2]) + Math.abs(da[i+3]-db[i+3]) > 60) n++;
      per[f.k] = n;
    }
    state.titleFrame = 'off';
    return per;
  })()`, 60000);
  const tKeys = td ? Object.keys(td) : [];
  ok('Semua 15 frame judul tergambar (pixel-diff > 60 px masing-masing)',
    tKeys.length === 15 && tKeys.every(k => td[k] > 60), JSON.stringify(td));

  /* ===== PIXEL-DIFF: 15 frame part di BUMPER INTRO (ukuran 60% biar beda jelas) ===== */
  const pd = await evalRetry(cdp, `(() => {
    const W = 960, H = 540;
    const cvA = document.createElement('canvas'); cvA.width = W; cvA.height = H;
    const cvB = document.createElement('canvas'); cvB.width = W; cvB.height = H;
    const xa = cvA.getContext('2d'), xb = cvB.getContext('2d');
    state.partShow = 'intro'; state.partAnim = 'off'; state.partPrefix = 'PART';
    state.partSize = 0.6; state.partColor = ''; state.titleOn = false; state.descOn = false;
    const per = {};
    for (const f of PARTFRAMES) {
      if (f.k === 'off') continue;
      state.partFrame = 'off';
      drawComposition(xa, W, H, 0.3, { native: false });
      state.partFrame = f.k;
      drawComposition(xb, W, H, 0.3, { native: false });
      const da = xa.getImageData(0, 0, W, H).data, db = xb.getImageData(0, 0, W, H).data;
      let n = 0;
      for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i]-db[i]) + Math.abs(da[i+1]-db[i+1]) + Math.abs(da[i+2]-db[i+2]) + Math.abs(da[i+3]-db[i+3]) > 60) n++;
      per[f.k] = n;
    }
    state.partFrame = 'off';
    return per;
  })()`, 60000);
  const pKeys = pd ? Object.keys(pd) : [];
  ok('Semua 15 frame PART tergambar di bumper intro (pixel-diff > 40 px)',
    pKeys.length === 15 && pKeys.every(k => pd[k] > 40), JSON.stringify(pd));

  /* ===== PIXEL-DIFF: frame part di LABEL POJOK (2 gaya sampel) + skala ikut ===== */
  const pk = await evalRetry(cdp, `(() => {
    const W = 960, H = 540;
    const cvA = document.createElement('canvas'); cvA.width = W; cvA.height = H;
    const cvB = document.createElement('canvas'); cvB.width = W; cvB.height = H;
    const xa = cvA.getContext('2d'), xb = cvB.getContext('2d');
    const diff = () => { const da = xa.getImageData(0, 0, W, H).data, db = xb.getImageData(0, 0, W, H).data; let n = 0;
      for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i]-db[i]) + Math.abs(da[i+1]-db[i+1]) + Math.abs(da[i+2]-db[i+2]) + Math.abs(da[i+3]-db[i+3]) > 60) n++; return n; };
    state.partShow = 'always'; state.partAnim = 'off'; state.partSize = 0.6;
    state.partFrame = 'off';
    drawComposition(xa, W, H, 5.0, { native: false });
    state.partFrame = 'kapsul';
    drawComposition(xb, W, H, 5.0, { native: false });
    const pojokKapsul = diff();
    state.partFrame = 'off'; state.partSize = 1.8;
    drawComposition(xa, W, H, 5.0, { native: false });
    state.partFrame = 'hud';
    drawComposition(xb, W, H, 5.0, { native: false });
    const pojokHud180 = diff();
    state.partFrame = 'off'; state.partShow = 'intro';
    return { pojokKapsul, pojokHud180 };
  })()`, 40000);
  ok('Frame part tergambar juga di LABEL POJOK (kapsul & hud)', pk && pk.pojokKapsul > 40 && pk.pojokHud180 > 40, JSON.stringify(pk));

  /* ===== PRESET: frame part & frame judul ikut tersimpan ===== */
  const pr = await evalRetry(cdp, `(() => {
    const pBtn = [...$('#partFrameChips').querySelectorAll('button')].find(b => b.dataset.v === 'hexa');
    pBtn.click();
    const tBtn = [...$('#titleFrameChips').querySelectorAll('button')].find(b => b.dataset.v === 'kaca');
    tBtn.click();
    const before = { p: state.partFrame, t: state.titleFrame };
    const snap = captureSettings();
    [...$('#partFrameChips').querySelectorAll('button')].find(b => b.dataset.v === 'off').click();
    [...$('#titleFrameChips').querySelectorAll('button')].find(b => b.dataset.v === 'off').click();
    const mid = { p: state.partFrame, t: state.titleFrame };
    const applied = applySettingsData(snap);
    return { before, mid, restored: { p: state.partFrame, t: state.titleFrame }, applied };
  })()`, 15000);
  ok('Preset menyimpan & memulihkan frame part + frame judul',
    pr && pr.before.p === 'hexa' && pr.before.t === 'kaca' && pr.mid.p === 'off' &&
    pr.restored.p === 'hexa' && pr.restored.t === 'kaca', JSON.stringify(pr));

  /* ===== EKSPOR NYATA smoke: 1 part dgn frame part + merah + 60% ===== */
  const exp = await evalRetry(cdp, `(async () => {
    state.rangeStart = 0; state.rangeEnd = 10; state.splitSec = 9999;
    state.cover.on = false; state.kilat = 'off'; state.parallel = 1;
    state.partSize = 0.6; state.partColor = '#ff0000'; state.partShow = 'intro';
    state.partFrame = 'hud'; state.titleOn = false; state.descOn = false;
    try {
      const res = await exportPartsToDir('${OUT}', { title() { }, prog() { }, sub() { } });
      return { n: res.length, fatal: state.exportFatal ? String(state.exportFatal.message) : null };
    } catch (e) { return { n: 0, err: String((e && e.message) || e) }; }
  })()`, 180000);
  ok('Ekspor nyata 1 part (frame HUD + merah + 60%) selesai tanpa fatal', exp && exp.n === 1 && !exp.fatal && !exp.err, JSON.stringify(exp));
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
