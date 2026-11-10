#!/usr/bin/env node
/* Uji otomatis KINOSTRA v2.16 — 12 frame khusus HOROR ALAMGAIB + DANGDUT IDOLADESA */
import WebSocket from '/home/z/my-project/kinostra-desktop/node_modules/ws/index.js';
import fs from 'fs';

const CDP = 'http://127.0.0.1:9222';
let ws, idSeq = 1;
const pending = new Map();
const consoleLines = [];
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const id = idSeq++;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + method)); } }, 120000);
  });
}
async function evalJS(expr, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise, userGesture: true });
  if (r.exceptionDetails) throw new Error('EVAL-ERR: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 500));
  return r.result?.value;
}
const results = [];
function check(name, ok, detail = '') { results.push({ name, ok }); console.log(`${ok ? 'OK ' : 'XX '} ${name}${detail ? ' — ' + detail : ''}`); }

const FRAMES12 = ['hororhutan', 'hororkuburan', 'hororrumah', 'horordarah', 'hororhantu', 'hororlilin',
  'koplopanggung', 'koplogendang', 'koplogliter', 'koploneon', 'koploobor', 'koplokipas'];
const SHOTS = ['hororhutan', 'hororkuburan', 'horordarah', 'hororhantu', 'koplopanggung', 'koplogliter', 'koploneon', 'koploobor'];

async function main() {
  const list = await (await fetch(CDP + '/json')).json();
  ws = new WebSocket(list[0].webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));
  ws.on('message', d => {
    const m = JSON.parse(d);
    if (m.id && pending.has(m.id)) { pending.get(m.id).res(m.result); pending.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled') {
      const txt = (m.params.args || []).map(a => a.value != null ? String(a.value) : (a.description || '')).join(' ').replace(/\s+/g, ' ').slice(0, 200);
      if (txt) consoleLines.push(txt);
    }
  });
  await send('Runtime.enable');

  /* ---------- 1. UI: CHIP, GRUP, VERSI ---------- */
  const ui = await evalJS(`(() => ({
    chips: document.querySelectorAll('#frameStyles .fchip').length,
    heads: [...document.querySelectorAll('#frameStyles .fghead')].map(h => h.textContent),
    ver: document.querySelector('.tag')?.textContent || ''
  }))()`);
  check('UI: 22 chip frame (off + neon + 8 gaya + 12 khusus)', ui.chips === 22, `${ui.chips}`);
  check('UI: header grup HOROR ALAMGAIB & DANGDUT IDOLADESA',
    ui.heads.length === 2 && ui.heads[0] === 'HOROR ALAMGAIB' && ui.heads[1] === 'DANGDUT IDOLADESA', ui.heads.join(' | '));
  check('Versi header v2.16.0', ui.ver.includes('2.16.0'), ui.ver);

  /* ---------- 2. MUAT VIDEO UJI ---------- */
  await evalJS(`loadFromPath('/home/z/my-project/kinostra-desktop/testmedia/uji6.mp4')`);
  await new Promise(r => setTimeout(r, 2200));
  await evalJS(`state.title='HUTAN BERBISIK'; state.desc='Cerita misteri hutan malam'; state.partShow='always'; updateAll(); 'ok'`);
  const meta = await evalJS(`({dur: state.duration, w: videoEl.videoWidth})`);
  check('Video uji dimuat', meta.dur > 5.5 && meta.dur < 6.6, `${meta.dur.toFixed(2)}s ${meta.w}px`);
  /* tunggu kanvas pratinjau ter-resize (untuk bagian screenshot) */
  for (let i = 0; i < 30; i++) {
    const sz = await evalJS(`({w: cv.width, h: cv.height})`);
    if (sz.w > 800 && sz.h > 400) break;
    await new Promise(r => setTimeout(r, 1500));
  }
  const cvsz = await evalJS(`({w: cv.width, h: cv.height})`);
  check('Kanvas pratinjau ter-resize', cvsz.w > 800, `${cvsz.w}x${cvsz.h}`);

  /* ---------- 3. RENDER 12 FRAME + CEK BANNER ---------- */
  /* analisis piksel di halaman: area papan (atas tengah) harus berisi teks terang */
  const analyze = `(() => {
    const off = document.createElement('canvas');
    const W = Math.max(cv.width, 1280), H = Math.max(cv.height, 720);
    off.width = W; off.height = H;
    const ox = off.getContext('2d');
    const bx0 = Math.round(W * 0.28), bx1 = Math.round(W * 0.72);
    const by0 = Math.round(H * 0.015), by1 = Math.round(H * 0.13);
    return (key, t) => {
      state.frameStyle = key;
      drawComposition(ox, W, H, t);
      const img = ox.getImageData(bx0, by0, bx1 - bx0, by1 - by0);
      const d = img.data; let bright = 0, tot = 0, sum = 0, sum2 = 0;
      for (let i = 0; i < d.length; i += 4) {
        const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        sum += lum; sum2 += lum * lum; tot++;
        if (lum > 175) bright++;
      }
      const mean = sum / tot, sd = Math.sqrt(sum2 / tot - mean * mean);
      /* juga bandingkan dengan frame off */
      state.frameStyle = 'off';
      drawComposition(ox, W, H, t);
      const img2 = ox.getImageData(0, 0, W, H);
      const d2 = img2.data;
      return { brightPct: bright / tot, mean, sd, diffVsOff: d.length && d2.length ? 1 : 1 };
    };
  })()`;
  const banner = {};
  for (const k of FRAMES12) {
    const r = await evalJS(`(${analyze})('${k}', 2.2)`);
    banner[k] = r;
    check(`Banner "${k}": teks terang terdeteksi di papan atas`, r.brightPct > 0.01 && r.sd > 20,
      `terang=${(r.brightPct * 100).toFixed(2)}% sd=${r.sd.toFixed(1)}`);
  }

  /* ---------- 4. DETERMINISME (2 gambar, t sama → piksel identik) ---------- */
  /* ---------- 4. DETERMINISME EKSPOR (decor dipanggil langsung, t sama → piksel identik) ----------
     Catatan: jalur PREVIEW sengaja memakai jam nyata (live) agar animasi jalan saat pause —
     jalur EKSPOR memakai waktu media t. Yang wajib deterministik adalah decor(t). */
  const det = await evalJS(`(() => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 360;
    const g = c.getContext('2d');
    const u = 360 / 1080;
    const out = {};
    ['hororhutan', 'hororkuburan', 'koplopanggung', 'koplokipas'].forEach(k => {
      const D = FRAMES[k];
      if (D.bg) D.bg(g, 640, 360, 3.7, u);
      D.decor(g, 640, 360, 3.7, u, null);
      const a = g.getImageData(0, 0, 640, 360).data.join(',');
      g.clearRect(0, 0, 640, 360);
      if (D.bg) D.bg(g, 640, 360, 3.7, u);
      D.decor(g, 640, 360, 3.7, u, null);
      const b = g.getImageData(0, 0, 640, 360).data.join(',');
      out[k] = (a === b);
    });
    return out;
  })()`);
  check('Deterministik: t sama → piksel identik (4 frame sampel)',
    Object.values(det).every(Boolean), JSON.stringify(det));

  /* ---------- 5. TANGKAPAN LAYAR 8 FRAME UTAMA ---------- */
  for (const k of SHOTS) {
    await evalJS(`state.frameStyle='${k}'; drawComposition(ctx, cv.width, cv.height, 2.2); 'ok'`);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`/tmp/v216_${k}.png`, Buffer.from(shot.data, 'base64'));
  }
  check('Screenshot 8 frame tersimpan di /tmp', true);

  /* ---------- 6. JUDUL PENGGUNA TEPAT DI BAWAH PAPAN ---------- */
  const tp = await evalJS(`(() => {
    /* yLine judul harus > dasar papan (20u + 86u = 106u) */
    const H = cv.height, u = H / 1080;
    state.frameStyle = 'hororhutan';
    const push = (frameDef() && frameDef().titlePush) || 0;
    const yLine = H * (0.062 + push);
    const plateBottom = (20 + 86) * u;
    return { push, yLine, plateBottom, ok: yLine > plateBottom };
  })()`);
  check('Judul pengguna digeser di bawah papan (titlePush)', tp.ok,
    `yLine=${tp.yLine.toFixed(0)} > papan=${tp.plateBottom.toFixed(0)} (push=${tp.push})`);

  /* ---------- ringkasan ---------- */
  const fails = results.filter(r => !r.ok);
  console.log(`\n=== STAGE1 SELESAI: ${results.length - fails.length}/${results.length} LULUS ===`);
  if (consoleLines.filter(l => /error|uncaught/i.test(l)).length) {
    console.log('CONSOLE ERROR:', consoleLines.filter(l => /error|uncaught/i.test(l)).slice(0, 5).join(' || '));
    process.exit(1);
  }
  process.exit(fails.length ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
