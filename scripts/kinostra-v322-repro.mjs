/* ================================================================
   REPRO v3.22 — verifikasi "impor film 3,6 jam tidak lagi hang"
   Video uji realistis real12960.mp4 (moov di akhir, stereo, 3,6 jam).
   Laptop lemah = CPU throttle CDP 6×. Monitor: jeda event loop,
   heap, progres peaks, proses mati/target hilang, log crash app.
   Pakai: bash scripts/run-test-xvfb.sh scripts/kinostra-v322-repro.mjs 260
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/home/z/my-project';
const PORT = 9498;
const VIDEO = process.argv[2] || '/home/z/my-project/testmedia/real12960.mp4';
const THROTTLE = Number(process.argv[3] || 6);
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
  async eval(expr, timeoutMs = 60000) {
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
async function logTail(cdp) {
  try { const x = await evalRace(cdp, `(async () => { const x = await window.kinostra.crashLog(); return typeof x === 'string' ? x : (x && x.text) || ''; })()`, 12000);
    return String(x || ''); } catch (e) { return ''; }
}

if (!fs.existsSync(VIDEO)) { console.error('video uji tidak ada:', VIDEO); process.exit(2); }
const APP = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
process.on('exit', () => { try { APP.kill('SIGKILL'); } catch (e) { } });

try {
  const cdp = await CDP.connect(PORT);
  await sleep(2500);
  console.log('R1. SIAP — throttle CPU ' + (THROTTLE || 'tidak') + '×');
  if (THROTTLE) { await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE }); console.log('  throttle 6× aktif (simulasi laptop lemah)'); }
  await evalRetry(cdp, `try { localStorage.removeItem('kinostra.liteplay'); } catch (e) {} window.__kinoLitePlay = false; 'bersih'`);
  await evalRetry(cdp, `(function(){ window.__gap = { max: 0, last: Date.now() };
    setInterval(() => { const n = Date.now(); const d = n - window.__gap.last - 1000;
      if (d > window.__gap.max) window.__gap.max = d; window.__gap.last = n; }, 1000); return 'probe aktif'; })()`, 20000);

  console.log('R2. IMPOR ' + VIDEO.split('/').pop());
  await evalRetry(cdp, `loadFromPath(${JSON.stringify(VIDEO)}); 'ok'`, 30000);

  let died = false, gagalBeruntun = 0;
  for (let i = 0; i < 70; i++) {
    await sleep(1000);
    try {
      const s = await evalRace(cdp, `({ dur: Math.round(state.duration || 0),
        peak: state.peaks ? state.peaks.filter(v => v > 0).length : -1,
        winBusy: !!state._audioWinBusy, gap: Math.round(window.__gap.max),
        heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1 })`, 6000);
      gagalBeruntun = 0;
      if (i % 5 === 0 || s.gap > 3000) console.log('  t+' + (i + 1) + 's', JSON.stringify(s));
      if (s.gap > 11000) console.log('  !!! JEDA EVENT LOOP >11 dtk');
    } catch (e) {
      gagalBeruntun++;
      if (gagalBeruntun === 1 || gagalBeruntun % 10 === 0) console.log('  t+' + (i + 1) + 's eval GAGAL (' + gagalBeruntun + ' beruntun): ' + e.message.slice(0, 100));
      try { await reconnect(cdp); } catch (e2) { console.log('  → TIDAK ADA TARGET = proses mati & tidak pulih'); died = true; break; }
      if (gagalBeruntun >= 35) { console.log('  !!! RENDERER TIDAK MERESPONS >35 dtk beruntun — HANG TERREPRODUKSI'); died = true; break; }
    }
    try { if (APP.exitCode !== null || APP.signalCode) { console.log('  PROSES APP KELUAR (exit ' + APP.exitCode + ' ' + APP.signalCode + ')'); died = true; break; } } catch (e) { }
  }

  const log = await logTail(cdp);
  const segmenSesi = log.split('\n').filter(l => /v3\.22/.test(l));
  const hangBaru = segmenSesi.some(l => /HANG —|RENDER MATI/.test(l));
  console.log('LOG CRASH (6 terakhir):\n  ' + log.trim().split('\n').slice(-6).join('\n  '));
  ok('Impor 3,6 jam tidak memicu HANG/watchdog', !died && !hangBaru, died ? 'proses mati / tak merespons' : '');
  if (!died) {
    ok('Event loop tetap bernapas (jeda maks < 11 dtk)', await evalRetry(cdp, `window.__gap.max < 11000`, 10000));
    ok('Analisis audio berjalan tertib (peaks terisi)', await evalRetry(cdp, `state.peaks ? state.peaks.filter(v => v > 0).length > 0 : false`, 10000));
  } else { fail += 2; console.log('  GAGAL  Event loop bernapas'); console.log('  GAGAL  Analisis tertib'); }
  console.log('SELESAI: ' + pass + ' lulus, ' + fail + ' gagal');
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('REPRO ERROR:', e.message);
  process.exit(1);
}
