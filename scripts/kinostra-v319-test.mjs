/* ================================================================
   UJI v3.19.0 — PELINDUNG PUTAR
   Laporan user v3.18: "begitu video di import dan di play aplikasi
   langsung hang, blank dan ngerestar sendiri" — pemulihan bekerja,
   tapi bila penyebabnya GPU lemah yang beku saat MEMUTAR, pemulihan
   biasa mengulang loop. v3.19: hang/crash saat memutar dicatat
   terpisah; ke-2× dalam 15 mnt → MODE AMAN otomatis (maks 1 restart).
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/home/z/my-project';
const PORT = 9499;
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
  static async connectTo(page) {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); setTimeout(() => rej(new Error('ws')), 8000); });
    const c = new CDP(ws); c.tid = page.id; return c;
  }
  send(method, params = {}) { return new Promise((res, rej) => { const id = ++this.id; this.pend.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expr, timeoutMs = 300000) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: timeoutMs });
    if (r.exceptionDetails) throw new Error('PAGE-ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300));
    return r.result.value;
  }
  fire(method, params = {}) { try { this.ws.send(JSON.stringify({ id: ++this.id, method, params })); } catch (e) { } }
}
/* Runtime.evaluate CDP TIDAK menghormati param timeout bila promise
   tak kunjung selesai — bungkus dgn race agar uji selalu lanjut */
async function evalRace(cdp, expr, ms = 15000) {
  let to;
  return Promise.race([
    cdp.eval(expr),
    new Promise((_, rej) => { to = setTimeout(() => rej(new Error('eval-timeout ' + ms + 'ms')), ms); })
  ]).finally(() => clearTimeout(to));
}
async function reconnectSame(cdp, port) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const pg = list.find(t => t.type === 'page' && /index\.html/.test(t.url));
  if (!pg) throw new Error('tidak ada target index.html');
  return await CDP.connectTo(pg);
}
/* eval dgn log + sambung-ulang sekali bila soket menggantung */
async function evalRetry(cdp, expr, ms = 12000, label = '') {
  try { const v = await evalRace(cdp, expr, ms); if (label) console.log('  [eval]', label, '=>', JSON.stringify(v)?.slice(0, 70)); return v; }
  catch (e) {
    if (label) console.log('  [eval]', label, 'gantung (' + e.message + ') → sambung ulang…');
    const c2 = await reconnectSame(cdp, PORT);
    cdp.ws = c2.ws; cdp.tid = c2.tid; cdp.pend = c2.pend; cdp.id = c2.id;
    const v = await evalRace(cdp, expr, ms);
    if (label) console.log('  [eval]', label, '=> (setelah sambung ulang)', JSON.stringify(v)?.slice(0, 70));
    return v;
  }
}
async function logText(cdp) {
  try { const r = await evalRace(cdp, `(async () => { const x = await window.kinostra.crashLog(); return typeof x === 'string' ? x : (x && x.text) || ''; })()`, 12000);
    return String(r || ''); } catch (e) { return ''; }
}

const APP = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
process.on('exit', () => { try { APP.kill('SIGKILL'); } catch (e) { } });
let UD = '';

try {
  const cdp = await CDP.connect(PORT);
  await sleep(2500);

  console.log('A. SMOKE v3.19.0');
  const a = await cdp.eval(`({ ver: (document.querySelector('.tag') || {}).textContent || document.body.textContent.match(/v3\\.\\d+\\.\\d+/)?.[0] || '', mods: document.querySelectorAll('.mod').length })`);
  ok('Aplikasi hidup, header v3.19', /v3\.19/.test(a.ver), a.ver);
  ok('Modul lengkap (' + a.mods + ')', a.mods >= 15);

  console.log('B. HANG SAAT PUTAR #1 — pulih biasa, belum MODE AMAN');
  await cdp.eval(`loadFromPath('/home/z/my-project/testmedia/v32-60s.mp4'); 'ok'`);
  for (let i = 0; i < 20; i++) { await sleep(500); if (await cdp.eval(`state.duration > 0`, 5000)) break; }
  await cdp.eval(`(function(){ if (videoEl.paused) togglePlay(); return 'play'; })()`);   /* reportPlay(true) */
  await sleep(1500);
  const st0 = await evalRace(cdp, `(async () => await window.kinostra.shieldStatus())()`, 15000);
  UD = st0.ud || '';
  ok('Status memutar dilaporkan ke main (playing=true)', st0.playing === true, JSON.stringify({ playing: st0.playing }));
  ok('Belum MODE AMAN sebelum siklus kedua', st0.safeMode === false);
  cdp.fire('Runtime.evaluate', { expression: `const __t=Date.now(); while(Date.now()-__t<30000){}`, returnByValue: false });
  let pulih1 = -1;
  for (let i = 0; i < 55; i++) { await sleep(1000);
    try { pulih1 = await cdp.eval(`document.querySelectorAll('.mod').length`, 3000); } catch (e) { continue; }
    if (pulih1 >= 15) break; }
  ok('Siklus #1: jendela PULIH (modul ' + pulih1 + ')', pulih1 >= 15);
  await sleep(1500);
  const L1 = await logText(cdp);
  ok('HANG SAAT PUTAR tercatat', /HANG SAAT PUTAR/.test(L1));
  ok('PELINDUNG PUTAR kejadian ke-1 → pulihkan biasa dulu', /kejadian saat memutar ke-1 dalam 15 mnt → pulihkan biasa dulu/.test(L1));

  console.log('C. HANG SAAT PUTAR #2 — MODE AMAN OTOMATIS (maks 1 restart)');
  await cdp.eval(`loadFromPath('/home/z/my-project/testmedia/v32-60s.mp4'); 'ok'`);
  for (let i = 0; i < 20; i++) { await sleep(500); if (await cdp.eval(`state.duration > 0`, 5000)) break; }
  await cdp.eval(`(function(){ if (videoEl.paused) togglePlay(); return 'play'; })()`);
  await sleep(1200);
  cdp.fire('Runtime.evaluate', { expression: `const __t=Date.now(); while(Date.now()-__t<30000){}`, returnByValue: false });
  /* tunggu instance BARU: target devtools dengan ID berbeda dari lama
     (server lama bisa masih mengikat port beberapa detik saat exit) */
  let cdp2 = null;
  for (let i = 0; i < 120; i++) { await sleep(1000);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const pg = list.find(t => t.type === 'page' && /index\.html/.test(t.url));
      if (pg && pg.id !== cdp.tid) { cdp2 = await CDP.connectTo(pg); break; }
    } catch (e) { }
  }
  ok('Instance baru hidup setelah relaunch MODE AMAN', !!cdp2);
  if (!cdp2) throw new Error('instance baru tidak muncul');
  for (let i = 0; i < 20; i++) { try { if (await evalRetry(cdp2, `document.readyState`, 5000, 'ready#' + i) === 'complete') break; } catch (e) { } await sleep(500); }
  await sleep(1500);
  let lgDisk = await logText(cdp2);
  if (!lgDisk && UD) { try { lgDisk = fs.readFileSync(UD + '/kinostra-crash.log', 'utf8'); } catch (e) { } }
  ok('PELINDUNG PUTAR kejadian ke-2 tercatat di log disk', /kejadian saat memutar ke-2 dalam 15 mnt → MODE AMAN otomatis/.test(lgDisk));
  ok('Alasan MODE AMAN tercatat', /MODE AMAN otomatis \(crash\/hang berulang saat memutar video\)/.test(lgDisk));
  let st1 = { safeMode: null };
  try { st1 = await evalRetry(cdp2, `(async () => await window.kinostra.shieldStatus())()`, 15000, 'shieldStatus'); } catch (e) {
    try { const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); console.log('  [target]', list.map(t => t.type + ':' + t.url.slice(0, 40)).join(' | ')); } catch (e2) { }
  }
  ok('shieldStatus: MODE AMAN AKTIF di instance baru', st1.safeMode === true, JSON.stringify({ safeMode: st1.safeMode }));

  console.log('D. SEHAT DALAM MODE AMAN — impor jalan lagi');
  await evalRetry(cdp2, `loadFromPath('/home/z/my-project/testmedia/v34-6s.mp4'); 'ok'`, 20000, 'impor').catch(() => { });
  for (let i = 0; i < 16; i++) { await sleep(500); try { if (await evalRetry(cdp2, `state.duration > 0`, 5000, 'dur#' + i)) break; } catch (e) { } }
  const d6 = await evalRetry(cdp2, `state.duration`, 8000, 'durasi');
  ok('Impor baru sukses dalam MODE AMAN (' + d6.toFixed(1) + ' dtk)', d6 > 3);
  ok('Aplikasi tetap hidup (17 modul)', await evalRetry(cdp2, `document.querySelectorAll('.mod').length`, 8000, 'modul') >= 15);

  try { APP.kill('SIGTERM'); } catch (e) { }
  console.log(`HASIL: ${pass} lulus, ${fail} gagal`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('FATAL:', e.message);
  console.log(`HASIL: ${pass} lulus, ${fail} gagal`);
  process.exit(1);
}
