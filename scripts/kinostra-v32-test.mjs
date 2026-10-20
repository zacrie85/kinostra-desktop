/* ================================================================
   KINOSTRA v3.2 — UJI JUMLAH PART OTOMATIS (Xvfb + CDP)
   Jalankan: DISPLAY=:99 node scripts/kinostra-v32-test.mjs
   Media uji: testmedia/v32-60s.mp4 (60 dtk) + testmedia/podcast.mp4 (30 dtk)
   ================================================================ */
import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project';
const OUTDIR = '/tmp/kinov32out';
const PORT = 9448;
let pass = 0, fail = 0;
const fails = [];
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
    const tid = setTimeout(() => { console.log('    [eval berjalan lama] ' + expr.slice(0, 80)); }, Math.max(0, timeoutMs - 15000));
    try {
      const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: timeoutMs });
      if (r.exceptionDetails) throw new Error('PAGE-ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 600));
      return r.result.value;
    } finally { clearTimeout(tid); }
  }
}

fs.rmSync(OUTDIR, { recursive: true, force: true });
fs.mkdirSync(OUTDIR, { recursive: true });
console.log('Menjalankan Electron (Xvfb)…');
const app = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu-sandbox'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }
});
app.stderr.on('data', d => { const s = d.toString(); if (/MAIN-|PAGE-ERR/i.test(s)) console.log('  [main]', s.trim().slice(0, 160)); });
process.on('exit', () => { try { app.kill('SIGKILL'); } catch (e) { } });

let cdp;
try {
  cdp = await CDP.connect(PORT);
  await cdp.send('Runtime.enable');
  await sleep(2500);
  console.log('CDP tersambung.\n');

  /* ============ A. SMOKE UI ============ */
  console.log('A. SMOKE UI JUMLAH PART');
  const smoke = await cdp.eval(`(() => ({
    input: !!document.querySelector('#inSplitParts'),
    stat: !!document.querySelector('#splitPartsStat'),
    state: typeof state.splitParts === 'number',
    apply: typeof applySplitParts === 'function',
    v32: document.body.innerHTML.includes('3.2.0'),
    lbl: document.body.innerHTML.includes('JUMLAH PART OTOMATIS')
  }))()`);
  ok('Input #inSplitParts + stat tersedia', smoke.input && smoke.stat);
  ok('state.splitParts + applySplitParts() ada', smoke.state && smoke.apply);
  ok('Label JUMLAH PART OTOMATIS + versi 3.2.0', smoke.lbl && smoke.v32);

  /* ============ B. PEMBAGIAN EKSAK 60s → 10 PART ============ */
  console.log('B. PEMBAGIAN EKSAK (60 dtk → 10 part)');
  const b = await cdp.eval(`(async () => {
    document.querySelector('#autoSub').checked = false;
    await loadFromPath('${ROOT}/testmedia/v32-60s.mp4', true);
    if (!state.file) return { err: 'load gagal' };
    const ip = document.querySelector('#inSplitParts');
    ip.value = '10'; ip.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 300));
    const segs = segments();
    const lens = segs.map(s => +(s.end - s.start).toFixed(3));
    return {
      n: segmentsCount(), splitSec: +state.splitSec.toFixed(4), lens,
      idx: segs.map(s => s.i).join(','),
      bounds: segs.map(s => +s.start.toFixed(2)).join(','),
      tInfo: document.querySelector('#tInfo').textContent,
      stat: document.querySelector('#splitPartsStat').textContent.slice(0, 90),
      inSplit: document.querySelector('#inSplit').value,
      chipCustom: document.querySelector('#segSplit button.on')?.dataset.v,
      customShown: document.querySelector('#splitCustom').style.display !== 'none'
    };
  })()`);
  ok('Jumlah part = 10', b.n === 10, JSON.stringify(b).slice(0, 300));
  ok('Durasi per part = 6.0 dtk eksak', Math.abs(b.splitSec - 6) < 0.001 && b.lens.every(l => Math.abs(l - 6) < 0.011), JSON.stringify(b.lens));
  ok('Urutan indeks 0..9 berurutan', b.idx === '0,1,2,3,4,5,6,7,8,9', b.idx);
  ok('Batas mulai part tepat 0,6,12,…,54', b.bounds === '0,6,12,18,24,30,36,42,48,54', b.bounds);
  ok('HUD: "SPLIT OTOMATIS 10 PART"', /SPLIT OTOMATIS 10 PART/.test(b.tInfo || ''), b.tInfo);
  ok('Stat: "10 PART × 6 dtk/part"', /10 PART × 6 dtk\/part/.test(b.stat || ''), b.stat);
  ok('Chip otomatis pindah ke ATUR SENDIRI + kolom terisi 6', b.chipCustom === 'custom' && b.customShown && b.inSplit === '6');

  /* ============ C. GANTI ANGKA 4 → 15 DTK/PART ============ */
  console.log('C. GANTI ANGKA (4 part)');
  const c = await cdp.eval(`(() => {
    const ip = document.querySelector('#inSplitParts');
    ip.value = '4'; ip.dispatchEvent(new Event('input'));
    const segs = segments();
    return { n: segmentsCount(), splitSec: +state.splitSec.toFixed(3), first: +(segs[0].end - segs[0].start).toFixed(2) };
  })()`);
  ok('4 part × 15 dtk', c.n === 4 && Math.abs(c.splitSec - 15) < 0.001 && Math.abs(c.first - 15) < 0.011, JSON.stringify(c));

  /* ============ D. CLAMP: N > DURASI ============ */
  console.log('D. CLAMP AMAN (N=1000 di video 60 dtk)');
  const d = await cdp.eval(`(() => {
    const ip = document.querySelector('#inSplitParts');
    ip.value = '1000'; ip.dispatchEvent(new Event('input'));
    return { parts: state.splitParts, n: segmentsCount(), splitSec: +state.splitSec.toFixed(3) };
  })()`);
  ok('Dibatasi jadi 60 part × ±1 dtk (tidak crash)', d.parts === 60 && d.n === 60 && Math.abs(d.splitSec - 1) < 0.001, JSON.stringify(d));

  /* ============ E. EDIT DURASI MANUAL = MATIKAN JUMLAH PART ============ */
  console.log('E. INTERAKSI DENGAN DURASI MANUAL & CHIP');
  const e1 = await cdp.eval(`(() => {
    const is = document.querySelector('#inSplit');
    is.value = '20'; is.dispatchEvent(new Event('input'));
    return { parts: state.splitParts, splitSec: state.splitSec, stat: document.querySelector('#splitPartsStat').textContent.slice(0, 40), inParts: document.querySelector('#inSplitParts').value, n: segmentsCount() };
  })()`);
  ok('Edit durasi manual → JUMLAH PART mati otomatis (60/20=3 part, splitParts=0)', e1.parts === 0 && e1.splitSec === 20 && e1.n === 3 && e1.inParts === '' , JSON.stringify(e1));
  const e2 = await cdp.eval(`(() => {
    document.querySelector('#segSplit button[data-v="30"]').click();
    return { parts: state.splitParts, splitSec: state.splitSec, custom: state.splitCustom, n: segmentsCount() };
  })()`);
  ok('Chip preset 30 dtk → 2 part, splitParts tetap 0', e2.parts === 0 && e2.splitSec === 30 && e2.custom === false && e2.n === 2, JSON.stringify(e2));

  /* ============ F. HITUNG ULANG OTOMATIS ANTAR VIDEO ============ */
  console.log('F. SETELAN TETAP BERLAKU UTK VIDEO BARU');
  const f = await cdp.eval(`(async () => {
    const ip = document.querySelector('#inSplitParts');
    ip.value = '5'; ip.dispatchEvent(new Event('input'));
    const on60 = { n: segmentsCount(), splitSec: +state.splitSec.toFixed(3) };
    await loadFromPath('${ROOT}/testmedia/podcast.mp4', true);
    await new Promise(r => setTimeout(r, 500));
    const on30 = { n: segmentsCount(), splitSec: +state.splitSec.toFixed(3), tInfo: document.querySelector('#tInfo').textContent };
    return { on60, on30 };
  })()`);
  ok('Video 60 dtk: 5 part × 12 dtk', f.on60.n === 5 && Math.abs(f.on60.splitSec - 12) < 0.001, JSON.stringify(f.on60));
  ok('Video 30 dtk: tetap 5 part, otomatis jadi 6 dtk/part', f.on30.n === 5 && Math.abs(f.on30.splitSec - 6) < 0.001 && /5 PART/.test(f.on30.tInfo), JSON.stringify(f.on30));

  /* ============ G. EKSPOR NYATA 10 PART ============ */
  console.log('G. EKSPOR NYATA (60 dtk → 10 file MP4)');
  const g = await cdp.eval(`(async () => {
    await loadFromPath('${ROOT}/testmedia/v32-60s.mp4', true);
    const ip = document.querySelector('#inSplitParts');
    ip.value = '10'; ip.dispatchEvent(new Event('input'));
    const res = await exportPartsToDir('${OUTDIR}', { prog() { }, sub() { }, title() { } });
    return { files: res.files || res.count || 'ok', n: segmentsCount() };
  })()`);
  const mp4s = fs.readdirSync(OUTDIR).filter(f => /_PART_\d+\.mp4$/.test(f)).sort();
  ok('10 file MP4 tersimpan', mp4s.length === 10, JSON.stringify({ g, mp4s }));
  const durs = mp4s.map(f => { try { return +execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 '${path.join(OUTDIR, f)}'`).toString().trim(); } catch (e) { return 0; } });
  ok('Semua part ±6.0 dtk (ffprobe)', durs.length === 10 && durs.every(x => Math.abs(x - 6) < 0.6), JSON.stringify(durs.map(x => +x.toFixed(2))));
  ok('Nomor urut PART_01 … PART_10 lengkap', /PART_01\.mp4$/.test(mp4s[0] || '') && /PART_10\.mp4$/.test(mp4s[9] || ''), JSON.stringify(mp4s));

  /* ============ H. REGRESI MODE ADEGAN & DURASI ============ */
  console.log('H. REGRESI MODE LAIN');
  const h = await cdp.eval(`(async () => {
    await loadFromPath('${ROOT}/testmedia/scene-cut.mp4', true);
    await new Promise(r => setTimeout(r, 400));
    document.querySelector('#inSplitParts').value = '';
    document.querySelector('#inSplitParts').dispatchEvent(new Event('input'));
    document.querySelector('#segSplit button[data-v="30"]').click();
    const durN = segmentsCount();
    state.splitMode = 'scene'; state.sceneCuts = [3];
    const sc = segments();
    state.splitMode = 'dur'; state.sceneCuts = [];
    return { durN, scN: sc.length, scBounds: sc.map(s => +s.start.toFixed(1)).join(',') };
  })()`);
  ok('Mode durasi normal (6 dtk / 30 dtk = 1 part)', h.durN === 1, JSON.stringify(h.durN));
  ok('Mode adegan tetap jalan (potong di 3 dtk)', h.scN === 2 && h.scBounds === '0,3', JSON.stringify(h));

  /* ---------- ringkasan ---------- */
  console.log(`\n===== HASIL: ${pass} LULUS, ${fail} GAGAL =====`);
  if (fails.length) { console.log('Gagal:'); fails.forEach(x => console.log('  - ' + x)); process.exit(1); }
} catch (e) {
  console.error('FATAL:', e.message);
  process.exit(2);
} finally {
  try { app.kill('SIGKILL'); } catch (e) { }
}
process.exit(0);
