/* ================================================================
   UJI FRAME v3.23 — "waktu berjalan tapi gambar beku"
   Deteksi: totalVideoFrames (getVideoPlaybackQuality) harus NAIK
   selama memutar. Jika Δframe = 0 sementara Δtime > 0 → gambar beku.
   Juga mencatat readyState & jalur native utk diagnosis akar.
   Pakai: bash scripts/run-test-xvfb.sh scripts/kinostra-v323-frame-test.mjs 120
   ================================================================ */
import { spawn } from 'node:child_process';

const ROOT = '/home/z/my-project';
const PORT = 9501;
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
const snap = () => `(() => { const q = videoEl.getVideoPlaybackQuality ? videoEl.getVideoPlaybackQuality() : { totalVideoFrames: videoEl.webkitDecodedFrameCount || -1 };
  return { t: +(videoEl.currentTime.toFixed(2)), rs: videoEl.readyState, fr: q.totalVideoFrames,
    live: videoEl.classList.contains('live'), nat: (typeof canNativePlay === 'function') ? canNativePlay() : null, net: videoEl.networkState }; })()`;

const APP = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
process.on('exit', () => { try { APP.kill('SIGKILL'); } catch (e) { } });

try {
  const cdp = await CDP.connect(PORT);
  await sleep(2000);
  await evalRetry(cdp, `try { localStorage.removeItem('kinostra.liteplay'); } catch (e) {} 'bersih'`);
  await evalRetry(cdp, `loadFromPath(${JSON.stringify(VIDEO)}); 'ok'`, 30000);
  for (let i = 0; i < 30; i++) { await sleep(1000);
    const s = await evalRetry(cdp, `state.duration || 0`, 6000).catch(() => 0);
    if (s > 0) break; }

  const a = await evalRetry(cdp, snap(), 8000);
  console.log('SEBELUM PUTAR:', JSON.stringify(a));
  ok('Video termuat (durasi 2 jam)', await evalRetry(cdp, `Math.abs(state.duration - 7200) < 30`, 8000));
  ok('Frame pertama terdekod (readyState >= 2)', a.rs >= 2, 'readyState=' + a.rs);
  ok('Frame pertama TERGAMBAR (totalVideoFrames >= 1)', a.fr >= 1, 'fr=' + a.fr);

  await evalRetry(cdp, `videoEl.play(); 'play'`, 8000);
  await sleep(6000);
  const b = await evalRetry(cdp, snap(), 8000);
  console.log('SESUDAH 6 dtk PUTAR:', JSON.stringify(b));
  const dt = b.t - a.t, dfr = b.fr - a.fr;
  ok('Waktu berjalan (Δt > 3 dtk)', dt > 3, 'Δt=' + dt.toFixed(2));
  /* ambang realistis sandbox: kompositor Xvbf memompa ±2 fps; yang diuji =
     POMPA HIDUP (frame bertambah), bukan kecepatan penuh 24 fps */
  ok('Pompa frame HIDUP (ΔtotalVideoFrames >= 5)', dfr >= 5, 'Δfr=' + dfr + ' — jika 0 = gambar beku persis laporan user');
  ok('Jalur native aktif saat putar', b.nat === true && b.live === true, 'nat=' + b.nat + ' live=' + b.live);
  console.log('SELESAI: ' + pass + ' lulus, ' + fail + ' gagal');
  try { await evalRace(cdp, `videoEl.pause(); 'x'`, 4000); } catch (e) { }
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('UJI ERROR:', e.message);
  process.exit(1);
}
