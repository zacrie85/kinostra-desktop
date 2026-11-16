/* ================================================================
   UJI DETEKTOR PIKSEL v3.24 — mekanisme PENYAJIAN MATI (rekaman user:
   decoder maju tapi gambar yang tersaji tak pernah berubah).
   Reproduksi realistis: video ADEGAN DIAM (warna solid) — totalVideoFrames
   terus maju (decoder bekerja) sementara piksel video tak pernah berubah.
   Harapan: pengawas menyala dgn alasan 'piksel diam', tangga berjalan
   (kocok → visibilitas → kanvas), _forceCanvasPlay aktif, flag diingat.
   Pakai: bash scripts/run-test-xvfb.sh scripts/kinostra-v324-pixel-test.mjs 120
   ================================================================ */
import { spawn } from 'node:child_process';

const ROOT = '/home/z/my-project';
const PORT = 9503;
const VIDEO = process.argv[2] || '/home/z/my-project/testmedia/solid12.mp4';
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
  console.log('MEMUTAR ADEGAN DIAM 12 dtk (fr maju, piksel tak berubah — mekanisme rekaman user)');
  let fcAt = -1;
  for (let i = 0; i < 9; i++) {
    await sleep(2000);
    const s = await evalRetry(cdp, `(() => { const q = videoEl.getVideoPlaybackQuality();
      return { fc: !!state._forceCanvasPlay, t: +videoEl.currentTime.toFixed(1), fr: q.totalVideoFrames, nat: canNativePlay() }; })()`, 8000).catch(() => null);
    if (!s) continue;
    if (i % 2 === 0) console.log('  t+' + ((i + 1) * 2) + 's', JSON.stringify(s));
    if (s.fc && fcAt < 0) fcAt = (i + 1) * 2;
    if (s.fc) break;
  }
  const log = await logTail(cdp);
  const bek = log.split('\n').filter(l => /v3\.25 GAMBAR BEKU/.test(l));
  console.log('LOG PENYEMBUH:\n  ' + (bek.join('\n  ') || '(kosong)'));
  ok('Detektor menyala & mencatat ke log', bek.length >= 3, bek.length + ' entri');
  ok('Alasan = PIKSEL DIAM (penyajian mati — bukan pompa)', bek.some(l => /piksel diam \(decoder maju tapi penyajian mati\)/.test(l)));
  ok('Tangga 1: kocok halus', bek.some(l => /kocok halus/.test(l)));
  ok('Tangga 2: visibilitas dinyalakan ulang', bek.some(l => /visibilitas/.test(l)));
  ok('Tangga 3: jalur kanvas + DIINGAT', bek.some(l => /jalur kanvas overlay \(diingat/.test(l)) && await evalRetry(cdp, `localStorage.getItem('kinostra.canvasPlay') === '1'`, 8000));
  ok('_forceCanvasPlay aktif & native dimatikan', await evalRetry(cdp, `state._forceCanvasPlay === true && canNativePlay() === false`, 8000));
  ok('Waktu tetap berjalan sepanjang penyembuhan', await evalRetry(cdp, `videoEl.currentTime > 6`, 8000), '');
  ok('Decoder memang maju (fr > 0 — persis kondisi mesin user)', await evalRetry(cdp, `videoEl.getVideoPlaybackQuality().totalVideoFrames > 0`, 8000));
  console.log('SELESAI: ' + pass + ' lulus, ' + fail + ' gagal');
  try { await evalRace(cdp, `videoEl.pause(); 'x'`, 4000); } catch (e) { }
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('UJI ERROR:', e.message);
  process.exit(1);
}
