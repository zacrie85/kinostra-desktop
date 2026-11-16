/* ================================================================
   UJI v3.21.0 — FORMULA VIDSplit (porting teknik playback stabil)
   Laporan user setelah v3.20: "masih error — setiap video 3-4 jam+
   langsung ngerestar sendiri saat di play". Referensi kunci: aplikasi
   kembar VidSplit v3.9.2 memutar film 4 jam LANCAR di mesin yang sama.
   Formula VidSplit (dari bedah kode): <video> asli SELALU tampilan di
   semua mode; overlay = lapisan terpisah; latar blur = kanvas MINI
   90×160 blur 4px 10fps dibesarkan CSS; NOL drawImage(video) kanvas
   besar saat memutar. v3.21 port utuh: native SEMUA rasio (dulu 9:16
   jatuh ke kanvas penuh), blur mini 10fps, antrean thumbnail DITAHAN
   selagi memutar, mode hemat = overlay 5fps (native tetap).
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/home/z/my-project';
const PORT = 9497;
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
async function loadAndAwait(cdp, path, minDur = 1) {
  await evalRetry(cdp, `loadFromPath(${JSON.stringify(path)}); 'ok'`, 20000, 'load');
  for (let i = 0; i < 40; i++) { await sleep(500);
    try { if (await evalRace(cdp, `state.duration > ${minDur}`, 5000)) return true; } catch (e) { } }
  return false;
}
const HANG_MS = 20000;
const injectHang = cdp => cdp.fire('Runtime.evaluate', { expression: `const __t=Date.now(); while(Date.now()-__t<${HANG_MS}){}`, returnByValue: false });

const APP = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
process.on('exit', () => { try { APP.kill('SIGKILL'); } catch (e) { } });

const P5 = [
  '/home/z/my-project/testmedia/long240.mp4',
  '/home/z/my-project/testmedia/long120.mp4',
  '/home/z/my-project/testmedia/podcast.mp4',
  '/home/z/my-project/testmedia/test_video.mp4',
  '/home/z/my-project/testmedia/v32-60s.mp4'
];

try {
  const cdp = await CDP.connect(PORT);
  await sleep(2500);

  console.log('A. SMOKE v3.21.0');
  const a = await cdp.eval(`({ ver: (document.querySelector('.tag') || {}).textContent || document.body.textContent.match(/v3\\.\\d+\\.\\d+/)?.[0] || '', mods: document.querySelectorAll('.mod').length })`);
  ok('Aplikasi hidup, header v3.21', /v3\.21/.test(a.ver), a.ver);
  ok('Modul lengkap (' + a.mods + ')', a.mods >= 15);
  ok('Kanvas latar blur mini (#bgBlurCv) ada di panggung', await cdp.eval(`!!document.querySelector('#stage #bgBlurCv')`));
  /* profil uji dipakai berulang — bersihkan flag & rasio baku */
  await cdp.eval(`try { localStorage.removeItem('kinostra.liteplay'); } catch (e) {} window.__kinoLitePlay = false; state.ratio = '16:9'; applyRatio(); 'bersih'`);

  console.log('B. IMPOR 5 VIDEO (4 jam + 4 lainnya) — kotak + thumbnail');
  await cdp.eval(`addBatchPaths(${JSON.stringify(P5)}, 'impor'); 'ok'`);
  let thumbs = 0;
  for (let i = 0; i < 90; i++) { await sleep(1000);
    thumbs = await evalRace(cdp, `state.batch.filter(b=>b.thumb).length + '/' + state.batch.length`, 5000).catch(() => -1);
    if (typeof thumbs === 'string' && thumbs.startsWith('5/5')) break; }
  ok('5 video masuk kotak & thumbnail berantai selesai (' + thumbs + ')', thumbs === '5/5', String(thumbs));

  console.log('C1. PUTAR FILM 4 JAM RASIO 16:9 — native + tanpa hang');
  ok('long240 termuat (durasi 4 jam)', await loadAndAwait(cdp, P5[0], 14000));
  await cdp.eval(`(function(){
    window.__stall = { max: 0, last: performance.now() };
    setInterval(() => { const n = performance.now(); const d = n - window.__stall.last - 60;
      if (d > window.__stall.max) window.__stall.max = d; window.__stall.last = n; }, 60);
    window.__kinoOverlayDraws = 0; window.__kinoBlurDraws = 0;
    return 'probe aktif';
  })()`);
  await cdp.eval(`(function(){ if (videoEl.paused) togglePlay(); return 'play'; })()`);
  await sleep(3000);
  ok('C1 native aktif (video asli di panggung)', await evalRace(cdp, `videoEl.classList.contains('live') && canNativePlay()`, 8000) === true);
  const t0 = await cdp.eval(`videoEl.currentTime`);
  await sleep(8000);
  const c1 = await evalRetry(cdp, `({ t: videoEl.currentTime, stall: Math.round(window.__stall.max), draws: window.__kinoOverlayDraws })`, 8000);
  ok('C1 playhead maju (Δ' + (c1.t - t0).toFixed(1) + ' dtk)', c1.t - t0 >= 5);
  ok('C1 tanpa beku >2,5 dtk (maks ' + c1.stall + ' ms)', c1.stall < 2500);
  ok('C1 overlay dithrottle (' + c1.draws + ' gambar/11 dtk ≤25 fps)', c1.draws > 30 && c1.draws < 500, String(c1.draws));
  await cdp.eval(`(function(){ if (!videoEl.paused) togglePlay(); return 'pause'; })()`);
  await sleep(1200);

  console.log('C2. RASIO 9:16 + BLUR (setelan konten potongan) — native + latar MINI ala VidSplit');
  await cdp.eval(`document.querySelector('#segRatio button[data-v="9:16"]').click(); 'ratio 9:16'`);
  await sleep(800);
  await cdp.eval(`(function(){ window.__kinoBlurDraws = 0; if (videoEl.paused) togglePlay(); return 'play'; })()`);
  await sleep(3000);
  const c2n = await evalRace(cdp, `(function(){
    const liveV = videoEl.classList.contains('live');
    const bg = document.querySelector('#bgBlurCv');
    return { liveV, cn: canNativePlay(), bgLive: !!(bg && bg.classList.contains('live')), w: bg && bg.width, h: bg && bg.height };
  })()`, 8000);
  ok('C2 native aktif di 9:16 (dulu jatuh ke kanvas penuh)', c2n.liveV === true && c2n.cn === true, JSON.stringify(c2n));
  ok('C2 latar blur mini tampil (90×160 ala VidSplit)', c2n.bgLive === true && c2n.w === 90 && c2n.h === 160, JSON.stringify(c2n));
  const tB = await cdp.eval(`videoEl.currentTime`);
  await sleep(10000);
  const c2 = await evalRetry(cdp, `({ t: videoEl.currentTime, stall: Math.round(window.__stall.max), blur: window.__kinoBlurDraws, draws: window.__kinoOverlayDraws })`, 8000);
  ok('C2 playhead maju di 9:16 (Δ' + (c2.t - tB).toFixed(1) + ' dtk)', c2.t - tB >= 5);
  ok('C2 tanpa beku >2,5 dtk di 9:16 (maks ' + c2.stall + ' ms)', c2.stall < 2500);
  ok('C2 latar blur mini ±10 fps (' + c2.blur + ' gambar/13 dtk)', c2.blur > 40 && c2.blur < 250, String(c2.blur));

  console.log('C3. ANTREAN THUMBNAIL DITAHAN SAAT MEMUTAR, lanjut saat pause');
  await cdp.eval(`state.batch[2].thumb = null; state.batch[2]._thumbErr = false; queueBatchThumb(); 'usul thumbnail'`);
  await sleep(3000);
  ok('C3 thumbnail film ke-3 DITAHAN selagi memutar', await evalRace(cdp, `state.batch[2].thumb === null`, 6000) === true);
  await cdp.eval(`(function(){ if (!videoEl.paused) togglePlay(); return 'pause'; })()`);
  let thumbLanjut = false;
  for (let i = 0; i < 15; i++) { await sleep(1000);
    try { if (await evalRace(cdp, `!!state.batch[2].thumb`, 5000)) { thumbLanjut = true; break; } } catch (e) { } }
  ok('C3 thumbnail lanjut otomatis setelah pause', thumbLanjut);
  await cdp.eval(`document.querySelector('#segRatio button[data-v="16:9"]').click(); 'ratio 16:9'`);
  await sleep(600);

  console.log('D. REGRESI PELINDUNG PUTAR v3.19 — siklus #1 pulih, #2 MODE AMAN');
  ok('long120 termuat', await loadAndAwait(cdp, P5[1], 7000));
  await cdp.eval(`(function(){ if (videoEl.paused) togglePlay(); return 'play'; })()`);
  await sleep(1200);
  const st0 = await cdp.eval(`(async () => await window.kinostra.shieldStatus())()`);
  ok('Status memutar dilaporkan (playing=true)', st0.playing === true);
  injectHang(cdp);
  let pulih1 = -1;
  for (let i = 0; i < 55; i++) { await sleep(1000);
    try { pulih1 = await cdp.eval(`document.querySelectorAll('.mod').length`, 3000); } catch (e) { continue; }
    if (pulih1 >= 15) break; }
  ok('Siklus #1: jendela PULIH (modul ' + pulih1 + ')', pulih1 >= 15);
  ok('HANG SAAT PUTAR tercatat', /HANG SAAT PUTAR/.test(await logText(cdp)));

  ok('long120 termuat (siklus #2)', await loadAndAwait(cdp, P5[1], 7000));
  await cdp.eval(`(function(){ if (videoEl.paused) togglePlay(); return 'play'; })()`);
  await sleep(1200);
  injectHang(cdp);
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
  for (let i = 0; i < 20; i++) { try { if (await evalRetry(cdp2, `document.readyState`, 5000) === 'complete') break; } catch (e) { } await sleep(500); }
  await sleep(2000);
  ok('MODE AMAN aktif di instance baru', await evalRetry(cdp2, `(async () => (await window.kinostra.shieldStatus()).safeMode)()`, 12000) === true);
  ok('Log: kejadian ke-2 → MODE AMAN otomatis', /kejadian saat memutar ke-2 dalam 15 mnt → MODE AMAN otomatis/.test(await logText(cdp2)));

  console.log('E. MODE AMAN × 2 hang putar → MODE PUTARAN HEMAT (native TETAP)');
  ok('long120 termuat (mode aman)', await loadAndAwait(cdp2, P5[1], 7000));
  await cdp2.eval(`(function(){ if (videoEl.paused) togglePlay(); return 'play'; })()`);
  await sleep(1200);
  injectHang(cdp2);
  for (let i = 0; i < 50; i++) { await sleep(1000);
    try { if (await cdp2.eval(`document.querySelectorAll('.mod').length`, 3000) >= 15) break; } catch (e) { } }
  ok('Mode aman: kejadian ke-1 tercatat (menunggu ke-2)', /hang\/mati saat memutar ke-1 → menunggu kejadian ke-2/.test(await logText(cdp2)));
  ok('video termuat lagi setelah pulih', await loadAndAwait(cdp2, P5[1], 7000));
  await cdp2.eval(`(function(){ if (videoEl.paused) togglePlay(); return 'play'; })()`);
  await sleep(1200);
  injectHang(cdp2);
  let lite = false, liteDetail = null;
  for (let i = 0; i < 50; i++) { await sleep(1000);
    try { if (await evalRetry(cdp2, `window.__kinoLitePlay === true`, 6000)) { lite = true;
      liteDetail = await evalRetry(cdp2, `({ ls: localStorage.getItem('kinostra.liteplay'), toast: [...document.querySelectorAll('.toast')].some(t => /PUTARAN HEMAT/.test(t.textContent)) })`, 8000);
      break; } } catch (e) { } }
  ok('shield:liteplay diterima → MODE PUTARAN HEMAT nyala', lite);
  ok('Flag tersimpan permanen (localStorage)', liteDetail && liteDetail.ls === '1', JSON.stringify(liteDetail));
  ok('Toast pemberitahuan tampil', liteDetail && liteDetail.toast === true);
  /* v3.21: mode hemat = overlay 5 fps, native TETAP */
  ok('long120 termuat (uji mode hemat)', await loadAndAwait(cdp2, P5[1], 7000));
  await cdp2.eval(`(function(){ window.__kinoOverlayDraws = 0; if (videoEl.paused) togglePlay(); return 'play'; })()`);
  await sleep(3000);
  const e2 = await evalRetry(cdp2, `({ cn: canNativePlay(), live: videoEl.classList.contains('live') })`, 8000);
  ok('v3.21: jalur NATIVE tetap aktif di mode hemat', e2.cn === true && e2.live === true, JSON.stringify(e2));
  await sleep(8000);
  const e3 = await evalRetry(cdp2, `window.__kinoOverlayDraws`, 8000);
  ok('v3.21: overlay diperlambat ±5 fps (' + e3 + ' gambar/11 dtk)', e3 > 5 && e3 < 90, String(e3));

  console.log('\nHASIL: ' + pass + ' lulus, ' + fail + ' gagal');
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('FATAL', e);
  console.log('HASIL: ' + pass + ' lulus, ' + fail + ' gagal (fatal)');
  process.exit(1);
} finally {
  try { APP.kill('SIGKILL'); } catch (e) { }
}
