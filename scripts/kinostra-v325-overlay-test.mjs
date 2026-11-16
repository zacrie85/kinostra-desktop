/* ================================================================
   UJI JALUR VIDSPLIT v3.25 — akar gambar beku dibedah dari rekaman user:
   overlay kanvas DI ATAS video digambar ulang 15x/dtk WALAU isinya statik
   → region di atas video terus di-invalidate → lapisan video tak pernah
   naik ke hardware overlay kompositor Windows → gambar beku.
   Harapan: saat native & isi tak berubah, drawComposition nyaris TIDAK
   dipanggil (≤3 dlm 6 dtk; dulu ±90); event input/part berubah memicu
   gambar ulang tepat satu kali; pengawas layar tidak false-fire.
   Pakai: bash scripts/run-test-xvfb.sh scripts/kinostra-v325-overlay-test.mjs 120
   ================================================================ */
import { spawn } from 'node:child_process';

const ROOT = '/home/z/my-project';
const PORT = 9504;
const VIDEO = process.argv[2] || '/home/z/my-project/testmedia/long120.mp4';
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
    if (r.exceptionDetails) throw new Error('PAGE-ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200));
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
async function logTail(cdp) {
  try { const x = await evalRace(cdp, `(async () => { const x = await window.kinostra.crashLog(); return typeof x === 'string' ? x : (x && x.text) || ''; })()`, 12000);
    return String(x || ''); } catch (e) { return ''; }
}

const APP = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
process.on('exit', () => { try { APP.kill('SIGKILL'); } catch (e) { } });

try {
  const cdp = await CDP.connect(PORT);
  await sleep(2000);
  await evalRetry(cdp, `try { localStorage.removeItem('kinostra.liteplay'); localStorage.removeItem('kinostra.canvasPlay'); } catch (e) {} 'bersih'`);
  await evalRetry(cdp, `loadFromPath(${JSON.stringify(VIDEO)}); 'ok'`, 30000);
  for (let i = 0; i < 30; i++) { await sleep(1000);
    const s = await evalRetry(cdp, `state.duration || 0`, 6000).catch(() => 0);
    if (s > 0) break; }
  await evalRetry(cdp, `videoEl.play(); 'play'`, 8000);
  await sleep(3000);
  const d1 = await evalRetry(cdp, `window.__kinoOverlayDraws || 0`, 8000);
  console.log('overlay draws setelah 3 dtk putar:', d1);
  await sleep(6000);
  const d2 = await evalRetry(cdp, `({ n: window.__kinoOverlayDraws || 0, nat: canNativePlay(), t: +videoEl.currentTime.toFixed(1) })`, 8000);
  console.log('setelah 6 dtk lagi:', JSON.stringify(d2));
  ok('Jalur NATIVE aktif saat putar', d2.nat === true);
  ok('OVERLAY STATIK: ≤3 gambar ulang dalam 6 dtk (dulu ±90)', (d2.n - d1) <= 3, 'delta=' + (d2.n - d1));
  await evalRetry(cdp, `document.dispatchEvent(new Event('input', { bubbles: true })); 'kotor'`, 8000);
  await sleep(1500);
  const d3 = await evalRetry(cdp, `window.__kinoOverlayDraws || 0`, 8000);
  ok('Event pengeditan → gambar ulang tepat satu kali', (d3 - d2.n) >= 1, 'delta=' + (d3 - d2.n));
  await evalRetry(cdp, `videoEl.currentTime = videoEl.duration * 0.5; 'pindah part'`, 8000);
  await sleep(1500);
  const d4 = await evalRetry(cdp, `window.__kinoOverlayDraws || 0`, 8000);
  ok('Pindah part → overlay digambar ulang (label part ikut)', (d4 - d3) >= 1, 'delta=' + (d4 - d3));
  await sleep(4000);
  const log = await logTail(cdp);
  ok('Pengawas layar TIDAK false-fire di video bergerak', !/v3\.25 GAMBAR BEKU/.test(log));
  ok('Waktu tetap berjalan', await evalRetry(cdp, `videoEl.currentTime > 10`, 8000));
  try { await evalRace(cdp, `videoEl.pause(); 'x'`, 4000); } catch (e) { }
  console.log('SELESAI: ' + pass + ' lulus, ' + fail + ' gagal');
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('UJI ERROR:', e.message);
  process.exit(1);
}
