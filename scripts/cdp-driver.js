#!/usr/bin/env node
/* CDP driver: reproduksi alur user KINOSTRA
   impor video panjang → putar → buka modul 03 (JUDUL & PART OTOMATIS)
   → scroll panel cepat → pantau console error & crash proses render */
const http = require('http');
const WebSocket = require('ws');

const PORT = 9222;
const VIDEO = '/home/z/my-project/testmedia/long120.mp4';

function getTargets() {
  return new Promise((res, rej) => {
    http.get(`http://127.0.0.1:${PORT}/json`, r => {
      let b = ''; r.on('data', d => b += d);
      r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // tunggu app siap
  let page = null;
  for (let i = 0; i < 60 && !page; i++) {
    try {
      const ts = await getTargets();
      page = ts.find(t => t.type === 'page' && /index\.html/.test(t.url));
    } catch (_) { }
    if (!page) await sleep(1000);
  }
  if (!page) { console.log('DRIVER: target tidak ditemukan'); process.exit(1); }
  console.log('DRIVER: target', page.url);

  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = new Map(); let ctxCount = 0;
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id; pend.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evl = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('EVAL-ERR: ' + JSON.stringify(r.exceptionDetails).slice(0, 500));
    return r.result && r.result.value;
  };

  ws.on('message', m => {
    const d = JSON.parse(m);
    if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); p(d.result || d); return; }
    if (d.method === 'Runtime.consoleAPICalled') {
      const a = (d.params.args || []).map(x => x.value !== undefined ? JSON.stringify(x.value) : (x.description || x.type)).join(' ');
      console.log(`[con:${d.params.type}]`, String(a).slice(0, 300));
    } else if (d.method === 'Runtime.exceptionThrown') {
      console.log('[EXCEPTION]', JSON.stringify(d.params.exceptionDetails).slice(0, 400));
    } else if (d.method === 'Runtime.executionContextCreated') {
      ctxCount++;
      console.log(`[ctx-created #${ctxCount}] baru — indikasi reload/pulihan`);
    }
  });
  ws.on('close', () => { console.log('DRIVER: WS TERTUTUP — proses render kemungkinan mati'); process.exit(2); });
  ws.on('error', e => { console.log('DRIVER: WS error', e.message); process.exit(2); });

  await new Promise(r => ws.once('open', r));
  await send('Runtime.enable');
  await send('Page.enable');
  await sleep(2000);
  /* reset DOM: reload halaman supaya tiap skenario mulai dari keadaan bersih */
  if (process.env.SKIPRELOAD !== '1') {
    console.log('DRIVER: reload halaman (reset keadaan)');
    await send('Page.reload', { ignoreCache: true });
    await sleep(5000);
  }
  if (process.env.NOAUDIODECODE === '1') {
    /* bukti akar masalah: cegah decodeAudioData panjang penuh SEBELUM impor */
    await evl(`(function(){ window.decodeFileAudio = async function(){ window.__audioDecodeDilewati = true; return; }; return 'decode audio dinonaktifkan'; })()`);
  }

  const ctxAtStart = ctxCount;   /* baseline setelah reload awal */
  console.log('DRIVER: langkah 1 — impor video panjang (NOIMPORT=' + (process.env.NOIMPORT || '0') + ')');
  await evl(`(function(){
    const ar = document.querySelector('#autoRun'); if (ar) ar.checked = false;   /* matikan auto-batch agar uji murni */
    const mi = document.querySelector('#massImport'); if (mi) mi.checked = false;
    return true;
  })()`);
  if (process.env.NOIMPORT !== '1') {
    await evl(`loadFromPath(${JSON.stringify(VIDEO)})`);
    // tunggu metadata termuat
    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      const st = await evl(`({d: state.duration, f: state.file && state.file.name, w: videoEl.videoWidth})`);
      if (st && st.d > 0) { console.log('DRIVER: video termuat', JSON.stringify(st)); break; }
      if (i === 59) { console.log('DRIVER: gagal memuat video'); process.exit(1); }
    }
  }

  console.log('DRIVER: langkah 2 — putar preview (PLAY=' + process.env.PLAY + ')');
  if (process.env.PLAY !== '0') await evl(`videoEl.play()`);
  await sleep(1500);

  console.log('DRIVER: langkah 3 — modul (EXPAND=' + process.env.EXPAND + ')');
  if (process.env.EXPAND !== '0') {
    await evl(`(function(){
      document.querySelectorAll('.mod').forEach(m => m.classList.add('open'));
      const t = document.querySelector('#inTitle'); if (t) t.focus();
      return document.querySelectorAll('.mod.open').length;
    })()`);
  }

  console.log('DRIVER: langkah 4 — scroll (TL=' + process.env.TL + ') ' + (process.env.SECS || 30) + ' dtk');
  if (process.env.HIDECHIPS === '1') {
    await evl(`document.querySelectorAll('#tlInner .tlseg, #tlInner .tlskip, #tlInner .tlcut').forEach(c => c.style.display = 'none'); 'chips disembunyikan'`);
  }
  if (process.env.NOPLAYHEAD === '1') {
    await evl(`(function(){ const ph = document.querySelector('#tlPlay'); if (ph) ph.remove(); return 'playhead dihapus'; })()`);
  }
  if (process.env.STOPRAF === '1') {
    /* hentikan loop gambar preview — bukti apakah crash butuh rAF aktif */
    await evl(`(function(){ window.__rafKilled = true; const id = requestAnimationFrame(function(){}); cancelAnimationFrame(id);
      /* loop() memanggil rAF berulang: blok via override */
      const orig = window.requestAnimationFrame; window.requestAnimationFrame = function(cb){ if (String(cb).includes('drawComposition') || String(cb).includes('lastBusyDraw')) return 0; return orig(cb); }; return 'rAF diblok'; })()`);
  }
  if (process.env.HIDEONLYCV === '1') {
    await evl(`(function(){ const c = document.querySelector('#cv'); if (c) c.style.display = 'none'; return '#cv disembunyikan'; })()`);
  }
  if (process.env.HIDESTAGEONLY === '1') {
    await evl(`(function(){ let n = 0; ['#stageWrap', '#stage'].forEach(s => { const el = document.querySelector(s); if (el) { el.style.display = 'none'; n++; } }); return 'stage disembunyikan (' + n + ') — #cv tetap'; })()`);
  }
  if (process.env.HIDENC === '1') {
    await evl(`(function(){ let n = 0; ['#ncPlayCv', '#coverPreviewCv'].forEach(s => { document.querySelectorAll(s).forEach(el => { el.style.display = 'none'; n++; }); }); return 'canvas lain disembunyikan: ' + n; })()`);
  }
  if (process.env.NOSTAGECLIP === '1') {
    /* uji: tanpa sembunyi — cukup lepas clipping/masking di #stage */
    await evl(`(function(){ const s = document.querySelector('#stage'); if (s) { s.style.overflow = 'visible'; s.style.borderRadius = '0'; } return 'clip stage dilepas'; })()`);
  }
  if (process.env.HIDESTAGE === '1') {
    await evl(`(function(){
      const sel = ['#stageWrap', '#stage', '#cv', 'canvas'];
      let done = [];
      sel.forEach(s => document.querySelectorAll(s).forEach(el => { el.style.display = 'none'; done.push(s); }));
      const v = document.querySelector('video'); if (v) { v.style.display = 'none'; done.push('video'); }
      return 'disembunyikan: ' + done.join(',');
    })()`);
  }
  if (process.env.RAFSTOP === '1') {
    await evl(`(function(){ window.requestAnimationFrame = function(){ return 0; }; return 'rAF global dibunuh — loop preview berhenti'; })()`);
  }
  const t0 = Date.now(); let scrollOps = 0;
  while (Date.now() - t0 < (parseInt(process.env.SECS || '30', 10) * 1000)) {
    if (scrollOps % parseInt(process.env.PROBEIV || '80', 10) === 0) {
      try {
        const probe = await evl(`({d: state.duration, fn: (state.file && state.file.name) || null, ready: videoEl.readyState, src: (videoEl.currentSrc || '').slice(-24)})`);
        console.log('PROBE', scrollOps, JSON.stringify(probe));
      } catch (e) { console.log('PROBE', scrollOps, 'GAGAL:', e.message.slice(0, 120)); }
    }
    await evl(`(function(){
      ${process.env.PANEL === '0' ? '' : `const p = document.querySelector('#panel');
      if (p) p.scrollTop = (p.scrollTop + 260) % Math.max(1, p.scrollHeight - p.clientHeight);`}
      ${process.env.TL === '0' ? '' : `const tl = document.querySelector('#timeline');
      if (tl) tl.scrollLeft = (tl.scrollLeft + 120) % Math.max(1, tl.scrollWidth - tl.clientWidth);`}
      return true;
    })()`);
    scrollOps++;
    await sleep(40);
  }
  console.log('DRIVER: scroll selesai', scrollOps, 'operasi');

  console.log('DRIVER: langkah 5 — status akhir');
  const stat = await evl(`({paused: videoEl.paused, t: videoEl.currentTime, d: state.duration,
    parts: document.querySelectorAll('#tlInner .tlseg').length,
    raf: (window.__kinoCacheCleared || 0)})`);
  console.log('DRIVER: status', JSON.stringify(stat));
  await sleep(5000);
  const reloaded = Math.max(0, ctxCount - ctxAtStart);
  console.log(`VERDICT: reload/crash ${reloaded}× → ${reloaded > 0 ? 'GAGAL (crash)' : 'BERSIH (tanpa crash)'}`);
  process.exit(0);
})().catch(e => { console.log('DRIVER: FATAL', e.message); process.exit(1); });
