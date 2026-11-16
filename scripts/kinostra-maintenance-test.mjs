/* ================================================================
   UJI MODUL 16 v3.26 — PERAWATAN & PERFORMA
   OPTIMASI PERFORMA (satu klik) & BERSIHKAN CACHE harus:
   - menampilkan modal hasil dengan daftar aksi nyata;
   - v3.26: melepas FLAG KANVAS DARURAT (kinostra.canvasPlay) saat
     optimasi/bersih — mesin v3.24-era mencoba native lagi;
   - v3.26: menghapus cache shader/kode GPU + menampilkan total disk;
   - v3.26: kotak info menampilkan JALUR PUTAR + nama GPU;
   - memutarkan video tetap sehat setelah pembersihan (native aktif).
   Pakai: bash scripts/run-test-xvfb.sh scripts/kinostra-maintenance-test.mjs 120
   ================================================================ */
import { spawn } from 'node:child_process';

const ROOT = '/home/z/my-project';
const PORT = 9506;
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
const modalOpen = (c) => evalRetry(c, `({ open: !document.querySelector('#modal').classList.contains('hidden'), title: (document.querySelector('#mTitle')||{}).textContent || '', body: (document.querySelector('#mBody')||{}).textContent || '' })`, 10000);
const closeModal = (c) => evalRetry(c, `try { document.querySelector('#mClose').click(); } catch (e) {} 'tutup'`, 8000);

const APP = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
process.on('exit', () => { try { APP.kill('SIGKILL'); } catch (e) { } });

try {
  const cdp = await CDP.connect(PORT);
  await sleep(2000);
  await evalRetry(cdp, `try { localStorage.removeItem('kinostra.liteplay'); localStorage.removeItem('kinostra.canvasPlay'); } catch (e) {} 'bersih'`);
  /* kotak info langsung mengisi */
  const info0 = await evalRetry(cdp, `(document.querySelector('#mntInfo')||{}).textContent || ''`, 10000);
  ok('Info sistem modul 16 terisi', info0.length > 40, info0.slice(0, 60));
  ok('Info menampilkan JALUR PUTAR (v3.26)', /JALUR PUTAR/.test(info0));
  ok('Info menampilkan nama GPU (v3.26)', /GPU:/.test(info0));
  ok('Info menampilkan CACHE SHADER/KODE GPU (v3.26)', /CACHE SHADER\/KODE GPU/.test(info0));
  const dry = await evalRetry(cdp, `window.kinostra.cleanupCache({ dry: true })`, 10000);
  ok('sys:cleanup dry mengukur cache shader GPU (v3.26)', dry && typeof dry.gpuCache === 'number' && typeof dry.codeCache === 'number', JSON.stringify(dry).slice(0, 90));

  /* muat video + seed flag kanvas darurat (simulasi mesin v3.24-era) */
  let loaded = false;
  for (let percobaan = 1; percobaan <= 3 && !loaded; percobaan++) {
    await evalRetry(cdp, `loadFromPath(${JSON.stringify(VIDEO)}); 'ok'`, 30000);
    for (let i = 0; i < 30; i++) { await sleep(1000);
      const s = await evalRetry(cdp, `state.duration || 0`, 6000).catch(() => 0);
      if (s > 0) { loaded = true; break; } }
    if (!loaded) console.log(`muat percobaan ${percobaan} gagal (kfile headless kadang terpotong) — coba lagi`);
  }
  if (!loaded) { console.error('MUAT GAGAL 3× — kfile headless bermasalah, uji modul 16 tak dapat lanjut'); process.exit(1); }
  ok('Video termuat (durasi terbaca)', loaded);
  await evalRetry(cdp, `localStorage.setItem('kinostra.canvasPlay', '1'); window.__nativeTriedOnce = true; state._forceCanvasPlay = true; 'seed'`, 8000);
  await evalRetry(cdp, `document.querySelector('#btnOptimize').click(); 'klik'`, 8000);
  let m = null;
  for (let i = 0; i < 15; i++) { await sleep(1000); m = await modalOpen(cdp); if (m.open) break; }
  ok('OPTIMASI: modal hasil muncul', m && m.open && /OPTIMASI PERFORMA SELESAI/.test(m.title), m ? m.title : 'tidak ada');
  ok('OPTIMASI: melepas flag kanvas darurat (v3.26)', m && /JALUR KANVAS darurat dilepas/.test(m.body));
  await closeModal(cdp);
  const flagGone = await evalRetry(cdp, `({ ls: localStorage.getItem('kinostra.canvasPlay'), f: state._forceCanvasPlay })`, 8000);
  ok('OPTIMASI: flag kanvas benar-benar hilang', flagGone.ls == null && flagGone.f === false, JSON.stringify(flagGone));

  await evalRetry(cdp, `document.querySelector('#btnClearCache').click(); 'klik'`, 8000);
  for (let i = 0; i < 15; i++) { await sleep(1000); m = await modalOpen(cdp); if (m.open) break; }
  ok('BERSIHKAN CACHE: modal hasil muncul', m && m.open && /CACHE DIBERSIHKAN/.test(m.title), m ? m.title : 'tidak ada');
  ok('BERSIHKAN CACHE: daftar aksi terisi', m && (m.body.match(/🗑️/g) || []).length >= 1);
  ok('BERSIHKAN CACHE: total disk dibebaskan tampil (v3.26)', m && /disk dibebaskan/.test(m.body));
  await closeModal(cdp);

  /* putar tetap sehat setelah pembersihan */
  const dbg = await evalRetry(cdp, `({ file: !!state.file, busy: !!state.busy, rs: videoEl.readyState, ns: videoEl.networkState, err: videoEl.error ? videoEl.error.code : null, paused: videoEl.paused, srcLen: (videoEl.src || '').length, dur: isFinite(videoEl.duration) ? +videoEl.duration.toFixed(1) : -1 })`, 8000);
  console.log('debug sebelum play:', JSON.stringify(dbg));
  const pr = await evalRetry(cdp, `(async () => { try { await videoEl.play(); return 'play-ok'; } catch (e) { return 'play-err: ' + (e.name || e); } })()`, 10000);
  console.log('hasil play():', pr);
  await sleep(3000);
  const pl = await evalRetry(cdp, `({ cn: canNativePlay(), t: +videoEl.currentTime.toFixed(1), live: videoEl.classList.contains('live') })`, 8000);
  ok('Setelah pembersihan: jalur NATIVE aktif', pl.cn === true && pl.live === true, JSON.stringify(pl));
  ok('Setelah pembersihan: waktu berjalan', pl.t > 1.5, String(pl.t));
  try { await evalRace(cdp, `videoEl.pause(); 'x'`, 4000); } catch (e) { }
  console.log('SELESAI: ' + pass + ' lulus, ' + fail + ' gagal');
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('UJI ERROR:', e.message);
  process.exit(1);
}
