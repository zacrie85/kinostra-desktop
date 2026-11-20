/* ================================================================
   UJI v3.34.0 — FRAME MANUAL PNG/JPG utk JUDUL & PART DI VIDEO
   Fitur: pilih gambar sendiri (PNG/JPG) sebagai bingkai judul &
   part — posisi klik-tahan-geser di pratinjau, lebar/tinggi ditarik
   dari tepi kiri/kanan/atas/bawah, atau diisi angka; pratinjau =
   ekspor persis (drawImgFrame di compose.js, rect fraksi video).
   Pakai: bash scripts/run-test-xvfb.sh scripts/kinostra-v334-test.mjs 420
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/home/z/my-project';
const PORT = 9516;
const VID = ROOT + '/testmedia/silent180.mp4';
const TONE = ROOT + '/testmedia/tone180.mp4';
const OUT = ROOT + '/testmedia/out-v334';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, gagal = 0;
const ok = (nama, syarat, detail = '') => {
  console.log((syarat ? '✅ LULUS' : '❌ GAGAL') + ' — ' + nama + (detail ? ' · ' + detail : ''));
  syarat ? pass++ : gagal++;
};

/* PNG merah polos 64×64 — dibuat di HALAMAN via kanvas (jaminan valid & merah) */
const B64_RED = `(() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#E23B3B'; g.fillRect(0, 0, 64, 64);
  return c.toDataURL('image/png').split(',')[1];
})()`;

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map();
    ws.addEventListener('message', e => { const m = JSON.parse(e.data);
      if (m.id && this.pend.has(m.id)) { const { res, rej } = this.pend.get(m.id); this.pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } });
  }
  static async connect(port, tries = 90) {
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
    if (r.exceptionDetails) throw new Error('PAGE-ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300));
    return r.result.value;
  }
}
async function reconnect(cdp) {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const pg = list.find(t => t.type === 'page' && /index\.html/.test(t.url));
  const ws = new WebSocket(pg.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); setTimeout(() => rej(new Error('ws')), 8000); });
  cdp.ws = ws; cdp.pend = new Map();
}
async function evalRetry(cdp, expr, ms = 20000) {
  try { return await cdp.eval(expr, ms); }
  catch (e) { await reconnect(cdp); return await cdp.eval(expr, ms); }
}
/* TANPA ulang (ekspor: timeout ≠ jalankan lagi) */
async function evalOnce(cdp, expr, ms) {
  try { return await cdp.eval(expr, ms); }
  catch (e) { try { await reconnect(cdp); } catch (e2) { } throw e; }
}
async function loadVideo(cdp, path) {
  for (let i = 1; i <= 3; i++) {
    await evalRetry(cdp, `loadFromPath(${JSON.stringify(path)}); 'ok'`, 15000);
    for (let k = 0; k < 25; k++) { await sleep(1000);
      const s = await evalRetry(cdp, `state.duration || 0`, 8000).catch(() => 0);
      if (s > 0) return true;
    }
  }
  return false;
}
const SETAN = `state.cover.on = false; state.kilat = 'off'; state.parallel = 2;
  state.descOn = false; state.subsOn = false;
  state.cutMode = 'full'; state.acc = 'cpu'; state.scale = '0.35'; state.fps = 15;`;

try {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const app = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
  process.on('exit', () => { try { app.kill('SIGKILL'); } catch (e) { } });
  const cdp = await CDP.connect(PORT);
  await sleep(2500);

  /* 1 — versi & katalog: chip PNG/JPG SENDIRI masuk dua menu (17 chip) */
  const ver = await evalRetry(cdp, `document.querySelector('.tag') ? document.querySelector('.tag').innerText : ''`, 10000);
  ok('Aplikasi hidup + label versi terkini (v3.35+)', /v3\.3[5-9]/.test(ver || ''), (ver || '').slice(0, 50));
  const kat = await evalRetry(cdp, `({
    nT: document.querySelectorAll('#titleFrameChips button').length,
    nP: document.querySelectorAll('#partFrameChips button').length,
    lastT: [...document.querySelectorAll('#titleFrameChips button')].pop().textContent.trim(),
    lastP: [...document.querySelectorAll('#partFrameChips button')].pop().textContent.trim(),
    kT: (typeof TITLEFRAMES !== 'undefined') ? TITLEFRAMES.length : 0,
    kP: (typeof PARTFRAMES !== 'undefined') ? PARTFRAMES.length : 0 })`, 10000);
  ok('Katalog 21+1: chip PNG/JPG SENDIRI di menu JUDUL & PART', kat.nT === 22 && kat.nP === 22 && kat.lastT === 'PNG/JPG SENDIRI' && kat.lastP === 'PNG/JPG SENDIRI' && kat.kT === 22 && kat.kP === 22,
    `judul ${kat.nT} chip · part ${kat.nP} chip`);

  /* 2 — muat video + gambar uji (jalur loadFrameImgData = jalur tombol PILIH) */
  ok('Video uji termuat', await loadVideo(cdp, VID));
  const muat = await evalRetry(cdp, `loadFrameImgData('partImg', 'uji-merah.png', (${B64_RED}))`, 15000);
  const st1 = await evalRetry(cdp, `({ fr: state.partFrame, data: !!state.partImg.data, el: !!(state.partImg.el && state.partImg.el.complete),
    panel: document.querySelector('#partImgPanel').style.display, box: document.querySelector('#frmPi').style.display,
    chip: [...document.querySelectorAll('#partFrameChips button')].find(b => b.dataset.v === 'png').classList.contains('on') })`, 10000);
  ok('Gambar dimuat → partFrame otomatis PNG/JPG SENDIRI (chip ON, panel & kotak geser tampil)',
    muat === true && st1.fr === 'png' && st1.data && st1.el && st1.panel === '' && st1.box === '' && st1.chip, JSON.stringify(st1));

  /* 3 — kotak geser di posisi rect (fraksi → %) */
  const geo = await evalRetry(cdp, `(() => { const b = document.querySelector('#frmPi'); const d = state.partImg;
    return { dl: d.x, bl: parseFloat(b.style.left), dt: d.y, bt: parseFloat(b.style.top),
      dw: d.w, bw: parseFloat(b.style.width), dh: d.h, bh: parseFloat(b.style.height) }; })()`, 10000);
  ok('Kotak geser = rect state (fraksi → %)', ['dl', 'dt', 'dw', 'dh'].every(k => Math.abs(geo[k] * 100 - geo['b' + k[1]]) < 0.01), JSON.stringify(geo));

  /* 4 — drawComposition: gambar BENAR2 digambar di rect (vs tanpa frame) */
  const ren = await evalRetry(cdp, `(async () => {
    const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    state.partShow = 'intro'; state.partAnim = 'off'; state.partSize = 1; state.partPosX = 0; state.partPosY = 0;
    const px = () => { const d = state.partImg;
      cx.clearRect(0, 0, 640, 360); setCompSrc(document.querySelector('#vid'));
      drawComposition(cx, 640, 360, 0.6, {}); setCompSrc(null);
      const g = cx.getImageData(Math.round((d.x + d.w / 2) * 640), Math.round((d.y + d.h / 2) * 360), 1, 1).data;
      return [g[0], g[1], g[2]]; };
    const dgn = px();
    state.partFrame = 'off'; const tanpa = px();
    state.partFrame = 'png';
    return { dgn, tanpa };
  })()`, 30000);
  ok('drawComposition menggambar bingkai gambar di rect (merah terlihat, lalu hilang dgn off)',
    ren.dgn[0] > 140 && ren.tanpa[0] < 80, `dgn=${ren.dgn.join(',')} tanpa=${ren.tanpa.join(',')}`);

  /* 5 — judul: jalur sama di blok judul */
  const ren2 = await evalRetry(cdp, `(async () => {
    await loadFrameImgData('titleImg', 'uji-merah.png', (${B64_RED}));
    state.titleOn = true; state.title = 'UJI FRAME'; state.titleAnim = 'off'; state.titlePosY = 0; state.titleSize = 40;
    const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const px = () => { const d = state.titleImg;
      cx.clearRect(0, 0, 640, 360); setCompSrc(document.querySelector('#vid'));
      drawComposition(cx, 640, 360, 0.6, {}); setCompSrc(null);
      const g = cx.getImageData(Math.round((d.x + d.w / 2) * 640), Math.round((d.y + d.h / 2) * 360), 1, 1).data;
      return [g[0], g[1], g[2]]; };
    const dgn = px();
    state.titleFrame = 'off'; const tanpa = px();
    state.titleFrame = 'png';
    return { dgn, tanpa };
  })()`, 30000);
  ok('Bingkai judul juga tergambar di rect miliknya', ren2.dgn[0] > 140 && ren2.tanpa[0] < 80, `dgn=${ren2.dgn.join(',')} tanpa=${ren2.tanpa.join(',')}`);

  /* 6 — GESER: pointer di badan kotak → posisi berubah + angka ikut */
  const geser = await evalRetry(cdp, `(async () => {
    const b = document.querySelector('#frmPi');
    const d0 = { x: state.partImg.x, y: state.partImg.y };
    const r = b.getBoundingClientRect();
    const opt = { bubbles: true, pointerId: 1, button: 0 };
    b.dispatchEvent(new PointerEvent('pointerdown', { ...opt, clientX: r.left + 40, clientY: r.top + 20 }));
    b.dispatchEvent(new PointerEvent('pointermove', { ...opt, clientX: r.left + 40 + 48, clientY: r.top + 20 + 36 }));
    b.dispatchEvent(new PointerEvent('pointerup', { ...opt, clientX: r.left + 40 + 48, clientY: r.top + 20 + 36 }));
    await new Promise(rr => setTimeout(rr, 120));
    const d1 = { x: state.partImg.x, y: state.partImg.y };
    return { d0, d1, inX: document.querySelector('#inPiX').value, inY: document.querySelector('#inPiY').value,
      stageW: document.querySelector('#stage').getBoundingClientRect().width };
  })()`, 15000);
  ok('GESER: klik-tahan di kotak lalu geser → posisi ikut + input angka tersinkron',
    geser.d1.x > geser.d0.x && geser.d1.y > geser.d0.y && Math.abs(geser.inX - geser.d1.x * 100) < 0.2,
    `Δx=${(geser.d1.x - geser.d0.x).toFixed(3)} Δy=${(geser.d1.y - geser.d0.y).toFixed(3)} · inX=${geser.inX}`);

  /* 7 — TARIK: pegangan tepi kanan (lebar+) & tepi atas (tinggi+, y-)
         — pointerdown HARUS di elemen pegangan (data-m); rect di-reset dulu
         supaya ada ruang menarik tanpa ter kampas clamp layar */
  const tarik = await evalRetry(cdp, `(async () => {
    Object.assign(state.partImg, { x: 0.28, y: 0.55, w: 0.30, h: 0.12 });
    syncFrameImgUI();
    await new Promise(rr => setTimeout(rr, 100));
    const b = document.querySelector('#frmPi');
    const d0 = { w: state.partImg.w, h: state.partImg.h, y: state.partImg.y };
    const opt = { bubbles: true, pointerId: 1, button: 0 };
    const r = b.getBoundingClientRect();
    const e = b.querySelector('.fh-e');
    e.dispatchEvent(new PointerEvent('pointerdown', { ...opt, clientX: r.right - 2, clientY: r.top + 20 }));
    b.dispatchEvent(new PointerEvent('pointermove', { ...opt, clientX: r.right + 80, clientY: r.top + 20 }));
    b.dispatchEvent(new PointerEvent('pointerup', { ...opt, clientX: r.right + 80, clientY: r.top + 20 }));
    await new Promise(rr => setTimeout(rr, 120));
    const mid = { w: state.partImg.w };
    const r2 = b.getBoundingClientRect();
    const n = b.querySelector('.fh-n');
    n.dispatchEvent(new PointerEvent('pointerdown', { ...opt, clientX: r2.left + 40, clientY: r2.top - 2 }));
    b.dispatchEvent(new PointerEvent('pointermove', { ...opt, clientX: r2.left + 40, clientY: r2.top - 50 }));
    b.dispatchEvent(new PointerEvent('pointerup', { ...opt, clientX: r2.left + 40, clientY: r2.top - 50 }));
    await new Promise(rr => setTimeout(rr, 120));
    const d1 = { w: state.partImg.w, h: state.partImg.h, y: state.partImg.y };
    return { d0, mid, d1, inW: document.querySelector('#inPiW').value, inH: document.querySelector('#inPiH').value };
  })()`, 15000);
  ok('TARIK pegangan tepi kanan → lebar bertambah; tepi atas → tinggi bertambah & y turun',
    tarik.mid.w > tarik.d0.w + 0.05 && tarik.d1.h > tarik.d0.h + 0.05 && tarik.d1.y < tarik.d0.y - 0.05,
    `w ${tarik.d0.w.toFixed(2)}→${tarik.mid.w.toFixed(2)} · h ${tarik.d0.h.toFixed(2)}→${tarik.d1.h.toFixed(2)} · y ${tarik.d0.y.toFixed(2)}→${tarik.d1.y.toFixed(2)} · inW=${tarik.inW} inH=${tarik.inH}`);

  /* 8 — KAMPAS: geser badan jauh ke kanan-bawah → rect tetap dalam layar */
  const kampas = await evalRetry(cdp, `(async () => {
    const b = document.querySelector('#frmPi');
    const opt = { bubbles: true, pointerId: 1, button: 0 };
    const r = b.getBoundingClientRect();
    b.dispatchEvent(new PointerEvent('pointerdown', { ...opt, clientX: r.left + 30, clientY: r.top + 20 }));
    b.dispatchEvent(new PointerEvent('pointermove', { ...opt, clientX: r.left + 30 + 4000, clientY: r.top + 20 + 4000 }));
    b.dispatchEvent(new PointerEvent('pointerup', { ...opt, clientX: r.left + 30 + 4000, clientY: r.top + 20 + 4000 }));
    await new Promise(rr => setTimeout(rr, 120));
    const d = state.partImg;
    return d;
  })()`, 15000);
  ok('KAMPAS: geser keluar layar → rect tetap di dalam (x+w ≤ 1, y+h ≤ 1)',
    kampas.x + kampas.w <= 1.001 && kampas.y + kampas.h <= 1.001,
    `x=${kampas.x.toFixed(2)} w=${kampas.w.toFixed(2)} y=${kampas.y.toFixed(2)} h=${kampas.h.toFixed(2)}`);

  /* 9 — ANGKA: isi input LEBAR 25% → state ikut */
  const angka = await evalRetry(cdp, `(async () => {
    const el = document.querySelector('#inPiW');
    el.value = '25'; el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(rr => setTimeout(rr, 100));
    return { w: state.partImg.w, boxW: document.querySelector('#frmPi').style.width };
  })()`, 10000);
  ok('Input angka LEBAR 25% → state & kotak ikut', Math.abs(angka.w - 0.25) < 1e-9 && angka.boxW === '25%', JSON.stringify(angka));

  /* 10 — PRESET: simpan (captureSettings) → ubah rect → terapkan → kembali */
  const preset = await evalRetry(cdp, `(async () => {
    const sebelum = { x: state.partImg.x, y: state.partImg.y, w: state.partImg.w, h: state.partImg.h };
    const data = captureSettings();
    Object.assign(state.partImg, { x: 0.05, y: 0.05, w: 0.15, h: 0.05 });   /* dirusak */
    syncFrameImgUI();
    applySettingsData(JSON.parse(JSON.stringify(data)));
    await new Promise(rr => setTimeout(rr, 400));
    const sesudah = { x: state.partImg.x, y: state.partImg.y, w: state.partImg.w, h: state.partImg.h, data: !!state.partImg.data };
    return { sebelum, sesudah };
  })()`, 20000);
  ok('Preset: rect & gambar tersimpan & dipulihkan utuh',
    ['x', 'y', 'w', 'h'].every(k => Math.abs(preset.sebelum[k] - preset.sesudah[k]) < 1e-9) && preset.sesudah.data,
    JSON.stringify(preset.sesudah));

  /* 11 — EKSPOR NYATA 1 part dgn kedua bingkai PNG aktif
         (media TONE bernada → tanpa gerbang suara v3.32 yang menunggu klik) */
  ok('Media tone (bernada) termuat utk ekspor', await loadVideo(cdp, TONE));
  const ex = await evalOnce(cdp, `(async () => {
    state.rangeStart = 0; state.rangeEnd = 4; state.splitSec = 183; state.splitCustom = true; applySplitParts();
    ${SETAN}
    state.titleOn = true; state.title = 'UJI FRAME PNG'; state.titleAnim = 'off'; state.titleFrame = 'png';
    state.partShow = 'intro'; state.partFrame = 'png'; state.partAnim = 'off';
    const res = await exportPartsToDir(${JSON.stringify(OUT)}, { title() { }, prog() { }, sub() { } });
    return { n: res.length, fatal: state.exportFatal ? String(state.exportFatal.message || state.exportFatal).slice(0, 120) : null };
  })()`, 300000);
  const f = ex && ex.n === 1 ? fs.readdirSync(OUT).filter(x => x.endsWith('.mp4')) : [];
  const sz = f.length ? fs.statSync(OUT + '/' + f[0]).size : 0;
  ok('Ekspor nyata 1 part dgn bingkai PNG judul+part: MP4 jadi tanpa fatal',
    ex && ex.n === 1 && !ex.fatal && sz > 100000, `file=${f[0] || '-'} ${(sz / 1048576).toFixed(1)} MB fatal=${ex && ex.fatal}`);

  /* 12 — bersih: swatch warna & chip lain tak tersentuh */
  const aman = await evalRetry(cdp, `(() => {
    const g = document.querySelector('#neonColors');
    return [...g.querySelectorAll('button')].map(b => b.offsetWidth).every(w => Math.abs(w - 34) <= 1);
  })()`, 10000);
  ok('Chip swatch warna tetap 34px (gaya lama aman)', aman === true);

  console.log('SELESAI: ' + pass + ' lulus, ' + gagal + ' gagal');
  try { app.kill('SIGKILL'); } catch (e) { }
  process.exit(gagal ? 1 : 0);
} catch (e) {
  console.error('UJI ERROR: ' + ((e && e.message) || e));
  process.exit(2);
}
