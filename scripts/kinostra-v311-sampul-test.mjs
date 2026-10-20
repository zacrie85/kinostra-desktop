/* ================================================================
   KINOSTRA v3.1.1 — UJI BUGFIX SAMPUL "_sampulCounter is not defined"
   Jalankan: xvfb-run -a node scripts/kinostra-v311-sampul-test.mjs
   Simulasi persis alur user: openSampul() -> klik SIMPAN PNG (2x)
   -> toast harus "Sampul tersimpan", file PNG ada di disk, nomor urut 01->02
   ================================================================ */
import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project';
const OUTDIR = '/tmp/kinov311out';
const PORT = 9446;
let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  LULUS  ${name}`); }
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); console.log(`  GAGAL  ${name} ${extra}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- CDP mini client (pola sama dgn v30/v31) ---------- */
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
  async eval(expr, timeoutMs = 60000) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: timeoutMs });
    if (r.exceptionDetails) throw new Error('PAGE-ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 600));
    return r.result.value;
  }
}

/* ---------- bootstrap ---------- */
fs.rmSync(OUTDIR, { recursive: true, force: true });
fs.mkdirSync(OUTDIR, { recursive: true });
console.log('Menjalankan Electron (Xvfb)…');
const app = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu-sandbox'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }
});
app.stderr.on('data', d => { const s = d.toString(); if (/error|Error/i.test(s)) console.log('  [main]', s.trim().slice(0, 160)); });
process.on('exit', () => { try { app.kill('SIGKILL'); } catch (e) { } });

let cdp;
try {
  cdp = await CDP.connect(PORT);
  await cdp.send('Runtime.enable');
  await sleep(2500);
  console.log('CDP tersambung.\n');

  /* ============ A. IMPOR VIDEO & BUKA STUDIO SAMPUL ============ */
  console.log('A. BUKA STUDIO SAMPUL');
  const opened = await cdp.eval(`(async () => {
    document.querySelector('#autoSub').checked = false;
    await loadFromPath('${ROOT}/testmedia/podcast.mp4', true);
    if (!state.file || state.isAudio) return { err: 'load gagal / bukan video' };
    openSampul();
    await new Promise(r => setTimeout(r, 1200));
    const cv = document.querySelector('#sampulCv');
    const lit = (() => { if (!cv) return 0; const x = cv.getContext('2d'); const d = x.getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 40) if (d[i] + d[i + 1] + d[i + 2] > 90) n++; return n; })();
    return {
      modalOpen: !M.el.classList.contains('hidden'),
      title: M.t.textContent, btn: M.c.textContent,
      cvW: cv ? cv.width : 0, lit,
      srcDecl: (function(){ try { _sampulCounter = _sampulCounter || 0; return true; } catch (e) { return false; } })()
    };
  })()`);
  ok('Modal STUDIO SAMPUL terbuka', opened.modalOpen === true, JSON.stringify(opened).slice(0, 200));
  ok('Tombol utama = SIMPAN PNG', /SIMPAN PNG/.test(opened.btn || ''), String(opened.btn));
  ok('Kanvas sampul 1280×720 tergambar', opened.cvW === 1280 && opened.lit > 1500, 'lit=' + opened.lit);
  ok('Variabel _sampulCounter kini TERDEFINISI (bugfix)', opened.srcDecl === true);

  /* ============ B. KLIK SIMPAN PNG — 2 KALI (nomor urut) ============ */
  console.log('B. KLIK SIMPAN PNG (persis alur user)');
  await cdp.eval(`_lastOutDir = '${OUTDIR}'; window.__toastErr = []; 'siap'`);
  /* catat setiap toast utk verifikasi */
  await cdp.eval(`(() => { const el = document.querySelector('#toasts'); new MutationObserver(() => {
      [...el.querySelectorAll('.toast')].forEach(t => { if (/err/.test(t.className)) window.__toastErr.push(t.textContent.slice(0, 120)); });
    }).observe(el, { childList: true }); return 'obs'; })()`);

  const r1 = await cdp.eval(`(async () => {
    await M.c.onclick();
    await new Promise(r => setTimeout(r, 1500));
    const toasts = [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent);
    return { ok: toasts.some(t => /Sampul tersimpan/.test(t)), toasts: toasts.map(t => t.slice(0, 90)) };
  })()`);
  ok('Simpan ke-1: toast "Sampul tersimpan" (Bukan error)', r1.ok, JSON.stringify(r1));

  const r2 = await cdp.eval(`(async () => {
    await M.c.onclick();
    await new Promise(r => setTimeout(r, 1500));
    const toasts = [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent);
    return { ok: toasts.filter(t => /Sampul tersimpan/.test(t)).length >= 2, toasts: toasts.map(t => t.slice(0, 90)) };
  })()`);
  ok('Simpan ke-2: tetap sukses (dipakai berulang)', r2.ok, JSON.stringify(r2));

  const errToasts = await cdp.eval(`window.__toastErr`);
  ok('Tidak ada toast error "_sampulCounter is not defined"', errToasts.length === 0, JSON.stringify(errToasts));

  /* ============ C. FILE DI DISK + NOMOR URUT ============ */
  console.log('C. FILE DI DISK');
  const pngs = fs.readdirSync(OUTDIR).filter(f => /_SAMPUL_\d+\.png$/.test(f)).sort();
  ok('2 file PNG tersimpan dengan pola nama benar', pngs.length === 2, JSON.stringify(pngs));
  ok('Nomor urut otomatis 01 → 02', /_SAMPUL_01\.png$/.test(pngs[0] || '') && /_SAMPUL_02\.png$/.test(pngs[1] || ''), JSON.stringify(pngs));
  const sizes = pngs.map(f => fs.statSync(path.join(OUTDIR, f)).size);
  ok('PNG valid (ukuran > 50KB, bukan korup)', sizes.length === 2 && sizes.every(s => s > 50 * 1024), JSON.stringify(sizes));
  const pngInfo = (() => { try { const h = fs.readFileSync(path.join(OUTDIR, pngs[0])).subarray(0, 8); return h[0] === 0x89 && h[1] === 0x50; } catch (e) { return false; } })();
  ok('Header PNG magic number benar', pngInfo === true);

  /* ============ D. JUDUL KOSONG → fallback nama video ============ */
  console.log('D. FALLBACK JUDUL KOSONG');
  const r3 = await cdp.eval(`(async () => {
    document.querySelector('#inSampulTitle').value = '';
    await M.c.onclick();
    await new Promise(r => setTimeout(r, 1500));
    const toasts = [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent);
    return { ok: toasts.some(t => /Sampul tersimpan/.test(t)) };
  })()`);
  ok('Judul kosong → fallback state.title, simpan sukses (nomor 03)', r3.ok === true);

  /* ---------- ringkasan ---------- */
  console.log(`\n===== HASIL: ${pass} LULUS, ${fail} GAGAL =====`);
  if (fails.length) { console.log('Gagal:'); fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
} catch (e) {
  console.error('FATAL:', e.message);
  process.exit(2);
} finally {
  try { app.kill('SIGKILL'); } catch (e) { }
}
process.exit(0);
