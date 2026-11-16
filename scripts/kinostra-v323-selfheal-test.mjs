/* ================================================================
   UJI PENYEMBUH OTOMATIS v3.23 — pengawas gerak gambar (media.js)
   Skenario: putar → PAKSA pompa macet (elemen disembunyikan inline —
   kompositor berhenti menyajikan frame sementara jam media terus jalan,
   persis laporan user) → tangga penyembuhan harus menyala:
   kocok halus → visibilitas → jalur kanvas (_forceCanvasPlay).
   Kondisi disembunyikan dijaga terus agar seluruh tangga teruji.
   Pakai: bash scripts/run-test-xvfb.sh scripts/kinostra-v323-selfheal-test.mjs 120
   ================================================================ */
import { spawn } from 'node:child_process';

const ROOT = '/home/z/my-project';
const PORT = 9502;
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
  const pre = await evalRetry(cdp, `(() => { const q = videoEl.getVideoPlaybackQuality();
    return { fr: q.totalVideoFrames, t: +videoEl.currentTime.toFixed(1) }; })()`, 8000);
  ok('Pompa hidup sebelum disandera (Δfr>0)', pre.fr > 0, 'fr=' + pre.fr);

  console.log('SANDERA: counter frame dibuat DIAM (monkey-patch getVideoPlaybackQuality — simulasi pompa macet ala Windows; jam media terus jalan)');
  await evalRetry(cdp, `const __realQ = videoEl.getVideoPlaybackQuality.bind(videoEl);
    videoEl.getVideoPlaybackQuality = () => ({ totalVideoFrames: 424242, droppedVideoFrames: 0, corruptedVideoFrames: 0, creationTime: Date.now() });
    window.__unpatch = () => { delete videoEl.getVideoPlaybackQuality; }; 'disandera'`, 8000);

  let ladder = { kocok: false, vis: false, kanvas: false };
  for (let i = 0; i < 12; i++) {
    await sleep(2000);
    const s = await evalRetry(cdp, `({ fc: !!state._forceCanvasPlay, t: +videoEl.currentTime.toFixed(1), paused: videoEl.paused })`, 8000).catch(() => null);
    if (!s) continue;
    if (i % 3 === 0) console.log('  t+' + ((i + 1) * 2) + 's', JSON.stringify(s));
    if (s.fc) break;
  }
  const log = await logTail(cdp);
  const v323 = log.split('\n').filter(l => /v3\.25 GAMBAR BEKU/.test(l));
  ladder.kocok = v323.some(l => /kocok halus/.test(l));
  ladder.vis = v323.some(l => /visibilitas/.test(l));
  ladder.kanvas = v323.some(l => /jalur kanvas overlay/.test(l));
  console.log('LOG PENYEMBUH:\n  ' + (v323.join('\n  ') || '(kosong)'));
  ok('Pengawas mendeteksi beku & mencatat ke log', v323.length >= 1, v323.length + ' entri');
  ok('Tangga 1: kocok halus (seek +0,05)', ladder.kocok);
  ok('Tangga 2: visibilitas dinyalakan ulang', ladder.vis);
  ok('Tangga 3: jatuh ke jalur kanvas (_forceCanvasPlay)', ladder.kanvas && await evalRetry(cdp, `state._forceCanvasPlay === true && canNativePlay() === false`, 8000));
  const post = await evalRetry(cdp, `(() => { const q = videoEl.getVideoPlaybackQuality();
    return { t: +videoEl.currentTime.toFixed(1), fc: !!state._forceCanvasPlay }; })()`, 8000);
  ok('Waktu tetap berjalan sepanjang penyembuhan', post.t > pre.t + 5, 'Δt=' + (post.t - pre.t).toFixed(1));
  try { await evalRace(cdp, `window.__unpatch && window.__unpatch(); videoEl.pause(); 'x'`, 4000); } catch (e) { }
  console.log('SELESAI: ' + pass + ' lulus, ' + fail + ' gagal');
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('UJI ERROR:', e.message);
  process.exit(1);
}
