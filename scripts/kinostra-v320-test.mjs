/* ================================================================
   UJI v3.20.0 — PEMUTARAN RINGAN (akar "hang saat diputar" film 4 jam)
   Laporan user v3.19: "masih tidak bisa — saat videonya di play aplikasi
   hang dan kemudian merestar; videonya durasi 4 jam; aku memasukan
   sebanyak 5 video". Akar yang ditemukan: video hanya terlihat lewat
   drawImage(videoEl) ke kanvas SETIAP frame saat memutar (elemen video
   display:none) + blur 9:16 tiap 1,6 dtk + HUD sapu 480 part tiap 80 ms
   → GPU lemah beku saat sinkronisasi → thread utama mati >12 dtk →
   pelindung mengulang loop. v3.20: jalur NATIVE (video asli di belakang
   kanvas overlay), throttle 15/24 fps, blur per 8 dtk, part O(1),
   MODE PUTARAN HEMAT permanen bila mode aman pun masih beku.
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/home/z/my-project';
const PORT = 9498;
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
/* muat file uji & tunggu metadata masuk akal */
async function loadAndAwait(cdp, path, minDur = 1) {
  await evalRetry(cdp, `loadFromPath(${JSON.stringify(path)}); 'ok'`, 20000, 'load');
  for (let i = 0; i < 40; i++) { await sleep(500);
    try { if (await evalRace(cdp, `state.duration > ${minDur}`, 5000)) return true; } catch (e) { } }
  return false;
}
/* suntik hang main-thread (busy loop) selagi video diputar */
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

  console.log('A. SMOKE v3.20.0');
  const a = await cdp.eval(`({ ver: (document.querySelector('.tag') || {}).textContent || document.body.textContent.match(/v3\\.\\d+\\.\\d+/)?.[0] || '', mods: document.querySelectorAll('.mod').length })`);
  ok('Aplikasi hidup, header v3.20', /v3\.20/.test(a.ver), a.ver);
  ok('Modul lengkap (' + a.mods + ')', a.mods >= 15);
  ok('canNativePlay & setLiveVideo terpasang', await cdp.eval(`typeof canNativePlay==='function' && typeof setLiveVideo==='function' && typeof window.__kinoOverlayDraws==='number'`));
  ok('MODE PUTARAN HEMAT: bridge onLitePlay ada', await cdp.eval(`typeof window.kinostra.onLitePlay==='function'`));
  /* profil uji dipakai berulang — flag liteplay dari run sebelumnya WAJAR
     mematikan jalur native; bersihkan agar skenario C menguji kondisi baku */
  await cdp.eval(`try { localStorage.removeItem('kinostra.liteplay'); } catch (e) {} window.__kinoLitePlay = false; 'bersih'`);

  console.log('B. IMPOR 5 VIDEO (4 jam + 4 pendek/2 jam) — kotak + thumbnail');
  await cdp.eval(`addBatchPaths(${JSON.stringify(P5)}, 'impor'); 'ok'`);
  let thumbs = 0;
  for (let i = 0; i < 90; i++) { await sleep(1000);
    thumbs = await evalRace(cdp, `state.batch.filter(b=>b.thumb).length + '/' + state.batch.length`, 5000).catch(() => -1);
    if (typeof thumbs === 'string' && thumbs.startsWith('5/5')) break; }
  ok('5 video masuk kotak & thumbnail berantai selesai (' + thumbs + ')', thumbs === '5/5', String(thumbs));
  ok('Metadata 4 jam terbaca di kotak', await cdp.eval(`Math.abs((state.batch.find(b=>b.name==='long240.mp4')||{dur:0}).dur - 14400) < 30`));

  console.log('C. PUTAR FILM 4 JAM 45 DTK — jalur NATIVE, tanpa hang');
  ok('long240 termuat (durasi 4 jam)', await loadAndAwait(cdp, P5[0], 14000));
  ok('480 part @ split 30 dtk (durasi 14400.02 → 481)', await cdp.eval(`state.splitSec===30 && segmentsCount()>=480 && segmentsCount()<=481`));
  /* probe beku main-thread + longtask */
  await cdp.eval(`(function(){
    window.__stall = { max: 0, last: performance.now() };
    setInterval(() => { const n = performance.now(); const d = n - window.__stall.last - 60;
      if (d > window.__stall.max) window.__stall.max = d; window.__stall.last = n; }, 60);
    window.__longtasks = [];
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__longtasks.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] }); } catch (e) {}
    window.__kinoOverlayDraws = 0;
    return 'probe aktif';
  })()`);
  const logLen0 = (await logText(cdp)).split('\n').length;
  await cdp.eval(`(function(){ if (videoEl.paused) togglePlay(); return 'play'; })()`);
  await sleep(3000);
  const nativeOn = await evalRace(cdp, `(function(){
    const okk = videoEl.classList.contains('live') && canNativePlay() && !!document.querySelector('#stage #vid');
    return okk === true ? true : JSON.stringify({ live: videoEl.classList.contains('live'), cn: canNativePlay(),
      rs: videoEl.readyState, p: videoEl.paused, busy: state.busy, ratio: state.ratio, fs: state.frameStyle,
      vfx: JSON.stringify(state.vfx), cf: state.colorFilter, kb: state.kb.mode, tr: state.trans.mode, spk: state.spk.on && state.spk.ready });
  })()`, 8000);
  ok('JALUR NATIVE aktif saat memutar (video asli di panggung)', nativeOn === true, JSON.stringify(nativeOn));
  const t0 = await cdp.eval(`videoEl.currentTime`);
  let lastT = t0, memMB = 0;
  for (let i = 0; i < 9; i++) { await sleep(5000);
    lastT = await evalRetry(cdp, `videoEl.currentTime`, 6000).catch(() => lastT);
    memMB = await evalRetry(cdp, `Math.round((performance.memory&&performance.memory.usedJSHeapSize||0)/1048576)`, 6000).catch(() => 0); }
  await sleep(2000);
  const stalled = await cdp.eval(`({ max: Math.round(window.__stall.max), lt: (window.__longtasks||[]).filter(d=>d>=2000).length, draws: window.__kinoOverlayDraws })`);
  ok('Playhead maju (' + Math.round(lastT) + ' dtk dari ' + Math.round(t0) + ')', lastT - t0 >= 25, `Δ=${(lastT - t0).toFixed(1)}`);
  ok('TIDAK ADA beku main-thread >2,5 dtk (maks ' + stalled.max + ' ms)', stalled.max < 2500, JSON.stringify(stalled));
  ok('Tidak ada longtask ≥2 dtk (' + stalled.lt + ')', stalled.lt === 0);
  ok('Overlay dithrottle: ' + stalled.draws + ' gambar/47 dtk (≤25 fps)', stalled.draws > 80 && stalled.draws < 1200, String(stalled.draws));
  ok('Heap renderer wajar (' + memMB + ' MB)', memMB > 0 && memMB < 500, memMB + ' MB');
  const logNow = await logText(cdp);
  const newBad = logNow.split('\n').slice(logLen0).filter(l => /RENDER MATI|HANG/.test(l));
  ok('Log bersih selama memutar (tanpa RENDER MATI/HANG)', newBad.length === 0, JSON.stringify(newBad).slice(0, 120));
  const paused = await cdp.eval(`(function(){ if (!videoEl.paused) togglePlay(); return videoEl.paused; })()`);
  await sleep(1600);
  ok('Pause → jalur native turun, kanvas gambar penuh kembali',
    await cdp.eval(`!videoEl.classList.contains('live') && !canNativePlay() && (function(){const d0=window.__kinoOverlayDraws; return new Promise(r=>setTimeout(()=>r(window.__kinoOverlayDraws>d0),900));})()`),
    'paused=' + paused);

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
  const L1 = await logText(cdp);
  ok('HANG SAAT PUTAR tercatat', /HANG SAAT PUTAR/.test(L1));
  ok('Kejadian ke-1 → pulihkan biasa', /kejadian saat memutar ke-1 dalam 15 mnt → pulihkan biasa dulu/.test(L1));

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

  console.log('E. MODE AMAN × 2 hang putar → MODE PUTARAN HEMAT permanen');
  ok('long120 termuat (mode aman)', await loadAndAwait(cdp2, P5[1], 7000));
  await cdp2.eval(`(function(){ if (videoEl.paused) togglePlay(); return 'play'; })()`);
  await sleep(1200);
  injectHang(cdp2);   /* kejadian ke-1 di mode aman */
  for (let i = 0; i < 50; i++) { await sleep(1000);
    try { if (await cdp2.eval(`document.querySelectorAll('.mod').length`, 3000) >= 15) break; } catch (e) { } }
  const L2 = await logText(cdp2);
  ok('Mode aman: kejadian ke-1 tercatat (menunggu ke-2)', /hang\/mati saat memutar ke-1 → menunggu kejadian ke-2/.test(L2), L2.split('\n').filter(l=>/ke-1/.test(l)).slice(-1)[0]);
  ok('video termuat lagi setelah pulih', await loadAndAwait(cdp2, P5[1], 7000));
  await cdp2.eval(`(function(){ if (videoEl.paused) togglePlay(); return 'play'; })()`);
  await sleep(1200);
  injectHang(cdp2);   /* kejadian ke-2 → shield:liteplay (dikirim setelah pulih) */
  let lite = false, liteDetail = null;
  for (let i = 0; i < 50; i++) { await sleep(1000);
    try { if (await evalRetry(cdp2, `window.__kinoLitePlay === true`, 6000)) { lite = true;
      /* toast berumur 4,2 dtk — periksa SEMUA sekaligus sekarang */
      liteDetail = await evalRetry(cdp2, `({ ls: localStorage.getItem('kinostra.liteplay'), cn: canNativePlay(),
        toast: [...document.querySelectorAll('.toast')].some(t => /PUTARAN HEMAT/.test(t.textContent)) })`, 8000);
      break; } } catch (e) { } }
  ok('shield:liteplay diterima → MODE PUTARAN HEMAT nyala', lite);
  ok('Flag tersimpan permanen (localStorage)', liteDetail && liteDetail.ls === '1', JSON.stringify(liteDetail));
  ok('Jalur native dimatikan di mode putaran hemat', liteDetail && liteDetail.cn === false);
  ok('Toast pemberitahuan tampil', liteDetail && liteDetail.toast === true);

  console.log('\nHASIL: ' + pass + ' lulus, ' + fail + ' gagal');
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('FATAL', e);
  console.log('HASIL: ' + pass + ' lulus, ' + fail + ' gagal (fatal)');
  process.exit(1);
} finally {
  try { APP.kill('SIGKILL'); } catch (e) { }
}
