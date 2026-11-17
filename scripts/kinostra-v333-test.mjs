/* ================================================================
   UJI v3.33.0 — LAYOUT MENU FRAME DILEBARKAN (semua chip terbaca)
   Akar keluhan "hanya 9 frame yang tampil": chip menu FRAME PART &
   FRAME JUDUL memakai kotak swatch warna 34px → 16 tombol hanya
   muat ±9 per baris & nama panjang terpotong tak terbaca (flex-wrap
   v3.30 hanya memindahkan sisanya ke baris kedua, teks tetap
   terpotong). Kini varian .chips.names — chip melar mengikuti nama
   lengkap. Uji mengukur layout DOM NYATA di aplikasi Electron.
   Pakai: bash scripts/run-test-xvfb.sh scripts/kinostra-v333-test.mjs 300
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/home/z/my-project';
const PORT = 9515;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, gagal = 0;
const ok = (nama, syarat, detail = '') => {
  console.log((syarat ? '✅ LULUS' : '❌ GAGAL') + ' — ' + nama + (detail ? ' · ' + detail : ''));
  syarat ? pass++ : gagal++;
};

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
/* ukur semua chip di sebuah menu: lebar, clipping, posisi (rect relatif container), baris */
const UKUR = `(() => {
  const g = document.querySelector(%SEL%);
  if (!g) return null;
  const gs = getComputedStyle(g);
  const btns = [...g.querySelectorAll('button')];
  const gr = g.getBoundingClientRect();
  const rr = btns.map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), w: b.offsetWidth, l: r.left - gr.left, rgt: r.right - gr.left, btm: r.bottom - gr.top, top: r.top - gr.top }; });
  return {
    cw: g.clientWidth, ch: g.clientHeight,
    maxRight: Math.max(0, ...rr.map(x => x.rgt)),
    maxBottom: Math.max(0, ...rr.map(x => x.btm)),
    rows: [...new Set(rr.map(x => Math.round(x.top)))].length,
    n: btns.length,
    teks: rr.map(x => x.t),
    lebar: rr.map(x => x.w),
    clip: rr.filter(x => { const b = btns[rr.indexOf(x)]; return b.scrollWidth > b.clientWidth; }).map(x => x.t),
    luar: rr.filter(x => x.rgt > gr.width + 1 || x.btm > gr.height + 1).map(x => x.t),
    display: gs.display, wrap: gs.flexWrap
  };
})()`;

try {
  const app = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
  process.on('exit', () => { try { app.kill('SIGKILL'); } catch (e) { } });
  const cdp = await CDP.connect(PORT);
  await sleep(2500);

  /* 1 — aplikasi hidup & label versi v3.33.0 */
  const ver = await evalRetry(cdp, `document.querySelector('.tag') ? document.querySelector('.tag').innerText : ''`, 10000);
  ok('Aplikasi hidup + label versi terkini (v3.34+)', /v3\.3[4-9]\.0/.test(ver || ''), (ver || '').slice(0, 50));

  /* 2 — buka modul 02 & pastikan menu frame part ada */
  const buka = await evalRetry(cdp, `(() => {
    const g = document.querySelector('#partFrameChips');
    if (!g) return false;
    const mod = g.closest('.mod');
    if (mod && !mod.classList.contains('open')) mod.classList.add('open');
    const judul = document.querySelector('#titleFrameChips');
    const m2 = judul && judul.closest('.mod');
    if (m2 && !m2.classList.contains('open')) m2.classList.add('open');
    return true;
  })()`, 10000);
  await sleep(600); /* tunggu transisi mod-b selesai supaya layout terukur */
  ok('Modul 02 terbuka + #partFrameChips & #titleFrameChips ada', buka === true);

  /* 3 — 16 chip dgn nama katalog lengkap (TANPA + 15 gaya) */
  const p = await evalRetry(cdp, UKUR.replace('%SEL%', "'#partFrameChips'"), 10000);
  const HARAP = ['TANPA', 'HUD SUDUT', 'GARIS HUD', 'KAPSUL BENING', 'KURUNG TEKNO', 'CHIP DATA', 'SEGI ENAM', 'PITA TEKNO',
    'GARIS GANDA HUD', 'TITIK ORBIT', 'FASE SUDUT', 'PANEL SISTEM', 'SINAR SAMPING', 'JARING TITIK', 'GARIS MURNI', 'BERKAS CAHAYA', 'PNG/JPG SENDIRI'];
  ok('17 chip frame part dgn nama katalog lengkap (v3.34 +PNG)', !!p && p.n === 17 && JSON.stringify(p.teks) === JSON.stringify(HARAP),
    !!p ? p.n + ' chip · wrap=' + p.wrap : 'null');

  /* 4 — chip melar mengikuti nama: semua lebar > kotak swatch 34px */
  ok('Chip lebar-otomatis (semua >34px, nama utuh butuh ruang)', !!p && p.lebar.every(w => w > 34),
    !!p ? 'min=' + Math.min(...p.lebar) + 'px maks=' + Math.max(...p.lebar) + 'px' : 'null');

  /* 5 — nol teks terpotong: scrollWidth == clientWidth semua chip */
  ok('Nol teks terpotong (scrollWidth==clientWidth, dulu nama panjang terpotong)', !!p && p.clip.length === 0,
    !!p ? (p.clip.length ? 'terpotong: ' + p.clip.join(', ') : 'bersih') : 'null');

  /* 6 — semua chip di dalam panel & melipat ≥2 baris (16 muat) */
  ok('Semua chip di dalam panel & ≥2 baris (16 gaya terlihat SEMUA)', !!p && p.luar.length === 0 && p.rows >= 2 && p.maxBottom <= p.ch + 1,
    !!p ? p.rows + ' baris · maxRight=' + p.maxRight + '/' + p.cw + 'px' : 'null');

  /* 7 — jalur UI: klik SEGI ENAM → state.partFrame=hexa + toast */
  const klik = await evalRetry(cdp, `(async () => {
    const b = [...document.querySelectorAll('#partFrameChips button')].find(x => x.textContent.trim() === 'SEGI ENAM');
    if (!b) return { klik: false };
    b.click();
    await new Promise(r => setTimeout(r, 300));
    const t = [...document.querySelectorAll('#toasts .toast')].map(x => x.textContent).join(' | ');
    return { klik: true, state: state.partFrame, on: b.classList.contains('on'), toast: t };
  })()`, 15000);
  ok('Klik SEGI ENAM → state.partFrame=hexa + class ON pindah + toast', !!klik && klik.klik && klik.state === 'hexa' && klik.on && /frame part/i.test(klik.toast),
    klik ? 'state=' + klik.state + ' toast=' + (klik.toast || '').slice(0, 40) : 'null');

  /* 8 — menu frame judul: TANPA + 15 gaya = 16 chip, perlakuan sama
         (label HTML kini dibetulkan: dulu "10 GAYA" padahal katalog v3.28 = 15 gaya) */
  const j = await evalRetry(cdp, UKUR.replace('%SEL%', "'#titleFrameChips'"), 10000);
  const HARAPJ = ['TANPA', 'GARIS KEMBAR', 'KOTAK TEGAS', 'BINGKAI GANDA', 'SUDUT KAMERA', 'PITA JUDUL', 'PITA SINEMA', 'NEON MENYALA',
    'EMAS KLASIK', 'PANEL MODERN', 'GRADASI PANAS', 'KACA HALUS', 'KRISTAL BENING', 'GARIS BENING', 'MEWAH BENING', 'ETERE', 'PNG/JPG SENDIRI'];
  ok('Frame judul 17 chip (TANPA+15+PNG v3.34) nama utuh & di dalam panel', !!j && j.n === 17 && JSON.stringify(j.teks) === JSON.stringify(HARAPJ) && j.clip.length === 0 && j.luar.length === 0 && j.lebar.every(w => w > 34),
    !!j ? j.n + ' chip · clip=' + j.clip.length + ' min=' + Math.min(...j.lebar) + 'px' : 'null');

  /* 9 — regresi: chip swatch warna tetap kotak 34px persis sebelumnya */
  const sw = await evalRetry(cdp, `(() => {
    const g = document.querySelector('#neonColors');
    if (!g) return null;
    const mod = g.closest('.mod'); if (mod && !mod.classList.contains('open')) mod.classList.add('open');
    return null;
  })()`, 10000);
  await sleep(400);
  const sw2 = await evalRetry(cdp, UKUR.replace('%SEL%', "'#neonColors'"), 10000);
  ok('Chip swatch warna tetap 34px (gaya lama tak tersentuh)', !!sw2 && sw2.n > 0 && sw2.lebar.every(w => Math.abs(w - 34) <= 1),
    sw2 ? sw2.n + ' swatch · lebar=' + [...new Set(sw2.lebar)].join(',') + 'px' : 'null');

  /* kembalikan state default supaya sesi bersih */
  await evalRetry(cdp, `state.partFrame='off'; 'ok'`, 5000).catch(() => { });

  console.log('SELESAI: ' + pass + ' lulus, ' + gagal + ' gagal');
  fs.writeFileSync(ROOT + '/testmedia/hasil-v333.json', JSON.stringify({ pass, gagal, part: p, judul: j, swatch: sw2 }, null, 1));
  try { app.kill('SIGKILL'); } catch (e) { }
  process.exit(gagal ? 1 : 0);
} catch (e) {
  console.error('UJI ERROR: ' + ((e && e.message) || e));
  process.exit(2);
}
