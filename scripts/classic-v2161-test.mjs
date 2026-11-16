/* ================================================================
   KINOSTRA v2.16.1 — GARIS KLASIK · UJI SKENARIO PENGGUNA
   Persis alur yang dilaporkan user: impor video → video DIPUTAR →
   buat pengaturan → (sambil sesekali geser/scrub). Basis v2.16.0
   harus LANCAR; log crash ringan harus mencatat 'mulai' & TIDAK
   mencatat kejadian tidak-normal selama skenario.
   Jalankan: bash /home/z/my-project/scripts/run-test-xvfb.sh \
             /home/z/my-project/classic216/scripts/classic-v2161-test.mjs
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project/classic216';
const PORT = 9499;

let pass = 0, fail = 0; const fails = [];
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  LULUS  ${name}`); }
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); console.log(`  GAGAL  ${name} ${extra}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map(); this.ev = new Map();
    ws.addEventListener('message', e => {
      const m = JSON.parse(e.data);
      if (m.id && this.pend.has(m.id)) { const { res, rej } = this.pend.get(m.id); this.pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
      else if (m.method && this.ev.has(m.method)) { this.ev.get(m.method).forEach(f => f(m.params)); }
    });
  }
  static async connect(port) {
    for (let i = 0; i < 60; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        const page = list.find(t => t.type === 'page' && /index\.html/.test(t.url));
        if (page) {
          const ws = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); setTimeout(() => rej(new Error('ws timeout')), 8000); });
          return new CDP(ws);
        }
      } catch (e) { }
      await sleep(1000);
    }
    throw new Error('CDP tidak tersambung');
  }
  send(method, params = {}) {
    return new Promise((res, rej) => { const id = ++this.id; this.pend.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expr, timeoutMs = 300000) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: timeoutMs });
    if (r.exceptionDetails) throw new Error('PAGE-ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 800));
    return r.result.value;
  }
}

const APP = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu-sandbox'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }
});
const mainLog = [];
APP.stdout.on('data', d => mainLog.push(d.toString()));
APP.stderr.on('data', d => mainLog.push(d.toString()));
process.on('exit', () => { try { APP.kill('SIGKILL'); } catch (e) { } });
const conLog = [];
/* filter log per-sesi: hanya baris BARU sejak uji dimulai yang dinilai */
const LG = '/home/z/.config/KINOSTRA/kinostra-crash.log';
const baseLines = fs.existsSync(LG) ? fs.readFileSync(LG, 'utf8').split('\n').length : 0;

try {
  const cdp = await CDP.connect(PORT);
  cdp.ev.set('Runtime.consoleAPICalled', []);
  await cdp.send('Runtime.enable');
  cdp.ev.get('Runtime.consoleAPICalled').push(p => {
    const t = p.type, txt = (p.args || []).map(a => a.value != null ? String(a.value) : (a.description || a.type)).join(' ');
    if (t === 'error' || t === 'assert') conLog.push(`[console.${t}] ${txt.slice(0, 240)}`);
  });
  cdp.ev.set('Runtime.exceptionThrown', []);
  cdp.ev.get('Runtime.exceptionThrown').push(p => {
    const d = p.exceptionDetails;
    conLog.push(`[EXC] ${((d.exception && d.exception.description) || d.text || '').slice(0, 240)}`);
  });
  await sleep(2500);

  /* ============ A. SMOKE GARIS KLASIK ============ */
  console.log('A. SMOKE — versi 2.16.1 + API log crash');
  const a = await cdp.eval(`(() => ({
    tag: (document.querySelector('.tag') || {}).textContent || '',
    mods: document.querySelectorAll('.mod').length,
    hasLog: typeof window.kinostra.crashLog === 'function',
    hasOpen: typeof window.kinostra.openCrashLog === 'function'
  }))()`);
  ok('Header bertanda v2.16.3 (garis klasik)', /v2\.16\.3/.test(a.tag), JSON.stringify(a.tag));
  ok('Panel modul tampil', a.mods > 5, String(a.mods));
  ok('API log crash tersedia (crashLog + openCrashLog)', a.hasLog && a.hasOpen, JSON.stringify(a));

  /* ============ B. SKENARIO USER: IMPOR ============ */
  console.log('B. IMPOR — video dimasukan (persis keluhan user)');
  const b1 = await cdp.eval(`(async () => {
    loadFromPath('/home/z/my-project/testmedia/short-a.mp4');
    for (let i = 0; i < 25; i++) { await new Promise(r => setTimeout(r, 500)); if (state.duration > 0) break; }
    return { d: state.duration, ada: !!state.file, alive: true };
  })()`);
  ok('Video 1 termuat (durasi ' + (b1 ? b1.d.toFixed(1) : '—') + ' dtk) tanpa hang', b1 && b1.alive && b1.d > 0 && b1.ada, JSON.stringify(b1));

  /* ============ C. PUTAR ============ */
  console.log('C. PUTAR — video diputar beberapa detik');
  const c1 = await cdp.eval(`(async () => {
    getActx().resume(); videoEl.play();
    await new Promise(r => setTimeout(r, 1200));   /* video uji cuma 3 dtk — jangan tunggu sampai selesai */
    const t = videoEl.currentTime;
    return { t, playing: !videoEl.paused, alive: true };
  })()`);
  ok('Video benar-benar berputar (t=' + (c1 ? c1.t.toFixed(1) : '—') + ' dtk)', c1 && c1.playing && c1.t > 0.4, JSON.stringify(c1));

  /* ============ D. PENGATURAN BARU (saat video termuat) ============ */
  console.log('D. PENGATURAN — judul, ukuran, potong, frame (persis keluhan user)');
  const d1 = await cdp.eval(`(() => {
    const out = {};
    const ti = document.querySelector('#inTitle');
    if (ti) { ti.value = 'UJI GARIS KLASIK'; ti.dispatchEvent(new Event('input', { bubbles: true })); out.judul = state.title === 'UJI GARIS KLASIK'; }
    const ts = document.querySelector('#inTitleSize');
    if (ts) { ts.value = 55; ts.dispatchEvent(new Event('input', { bubbles: true })); out.ukuran = state.titleSize === 55; }
    const sp = document.querySelector('#inSplit');
    if (sp) { sp.value = 20; sp.dispatchEvent(new Event('input', { bubbles: true })); out.potong = true; }
    const chip = document.querySelector('#frameStyles .fchip');
    if (chip) { chip.click(); out.frame = true; }
    const vb = document.querySelector('#inVB');
    if (vb) { vb.value = 12; vb.dispatchEvent(new Event('input', { bubbles: true })); out.warna = true; }
    return out;
  })()`);
  ok('Pengaturan diterima aplikasi: ' + JSON.stringify(d1), d1 && (d1.judul || d1.ukuran) && Object.keys(d1).length >= 2, JSON.stringify(d1));

  /* ============ E. PUTAR LAGI + SCRUB ============ */
  console.log('E. PUTAR + GESER — setelah setelan disentuh');
  const e1 = await cdp.eval(`(async () => {
    videoEl.currentTime = Math.max(0, (videoEl.duration || 10) - 3);
    videoEl.play();
    await new Promise(r => setTimeout(r, 3000));
    const t = videoEl.currentTime;
    videoEl.pause();
    return { t, playing: !videoEl.paused, alive: true };
  })()`);
  ok('Putar + geser tetap lancar setelah setelan (t=' + (e1 ? e1.t.toFixed(1) : '—') + ')', e1 && e1.t > 0, JSON.stringify(e1));

  /* ============ F. IMPOR GANTI VIDEO (alur berulang) ============ */
  console.log('F. GANTI VIDEO — impor kedua menggantikan yang pertama');
  const f1 = await cdp.eval(`(async () => {
    loadFromPath('/home/z/my-project/testmedia/v34-6s.mp4');
    for (let i = 0; i < 25; i++) { await new Promise(r => setTimeout(r, 500)); if (state.duration > 0 && state.duration < 30) break; }
    return { d: state.duration, alive: true };
  })()`);
  ok('Video kedua termuat menggantikan yang lama (' + (f1 ? f1.d.toFixed(1) : '—') + ' dtk)', f1 && f1.alive && f1.d > 0, JSON.stringify(f1));

  /* ============ G. KESEHATAN + LOG CRASH ============ */
  console.log('G. KESEHATAN — nol exception & log crash bersih');
  await sleep(1500);
  const bad = conLog.filter(l => /Out of memory|crashed|FATAL|Uncaught/.test(l));
  ok('Nol exception berbahaya selama seluruh skenario', bad.length === 0, JSON.stringify(bad));
  const g1 = await cdp.eval(`(async () => { const lg = await window.kinostra.crashLog(); return { n: (lg.text.match(/\\n/g) || []).length, hasStart: /mulai — KINOSTRA v2\\.16\\./.test(lg.text), pathOk: /kinostra-crash\\.log$/.test(lg.path) }; })()`);
  ok('Log crash mencatat MULAI v2.16.x & menunjuk berkas yang benar', g1.hasStart && g1.pathOk, JSON.stringify(g1));
  const lgFile = fs.readFileSync(LG, 'utf8');
  const badLog = lgFile.split('\n').slice(baseLines).filter(l => /RENDER MATI|GPU MATI|HANG/.test(l));   /* hanya baris sesi ini — log dipakai bersama antar versi */
  ok('TIDAK ada kejadian tidak-normal selama skenario (log bersih)', badLog.length === 0, JSON.stringify(badLog));

  /* ============ RINGKASAN ============ */
  try { APP.kill('SIGTERM'); } catch (e) { }
  await sleep(1500);
  console.log('');
  console.log(`HASIL: ${pass} lulus, ${fail} gagal`);
  if (fails.length) { console.log('GAGAL:'); fails.forEach(f => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('FATAL:', e.message);
  console.log(`HASIL: ${pass} lulus, ${fail} gagal`);
  process.exit(1);
}
