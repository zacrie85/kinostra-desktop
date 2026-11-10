/* ================================================================
   KINOSTRA v3.15 — UJI REPRODUKSI BUG BATCH 5 VIDEO
   Laporan pengguna: video 1 sukses ekspor & split; video 2 berhenti
   setengah jalan lalu "GAGAL IMPORT VIDEO"; video 3-5 gagal serupa.
   Skrip ini MENJALANKAN batch ekspor 5 video asli (load → render →
   simpan) dan MENANGKAP SEMUA console.error / exception dari
   aplikasi supaya akar masalah terlihat, bukan tertutup toast.
   Jalankan: bash scripts/run-test-xvfb.sh scripts/kinostra-v315-batch-test.mjs
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project';
const MEDIA_DIR = '/tmp/kino-batch5';
const OUT_DIR = '/tmp/kino-batch5-out';
const PORT = 9496;

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
  async eval(expr, timeoutMs = 560000) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: timeoutMs });
    if (r.exceptionDetails) throw new Error('PAGE-ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 800));
    return r.result.value;
  }
}

fs.rmSync(OUT_DIR, { recursive: true, force: true }); fs.mkdirSync(OUT_DIR, { recursive: true });

console.log('Menjalankan Electron (Xvfb)…');
const app = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu-sandbox'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }
});
process.on('exit', () => { try { app.kill('SIGKILL'); } catch (e) { } });

/* penangkap console/exception sisi aplikasi */
const conLog = [];
function hookConsole(cdp) {
  const add = (k, f) => { const a = cdp.ev.get(k) || []; a.push(f); cdp.ev.set(k, a); };
  add('Runtime.consoleAPICalled', p => {
    const t = p.type, txt = (p.args || []).map(a => a.value != null ? String(a.value) : (a.description || a.type)).join(' ');
    if (t === 'error' || t === 'warning' || t === 'assert') conLog.push(`[console.${t}] ${txt.slice(0, 300)}`);
  });
  add('Runtime.exceptionThrown', p => {
    const d = p.exceptionDetails;
    conLog.push(`[EXCEPTION] ${((d.exception && d.exception.description) || d.text || '').split('\n').slice(0, 4).join(' | ').slice(0, 400)}`);
  });
}

let cdp;
try {
  cdp = await CDP.connect(PORT);
  await cdp.send('Runtime.enable');
  hookConsole(cdp);
  await sleep(2500);
  console.log('CDP tersambung.\n');

  /* ---------- persiapan: matikan fitur berat (model AI luar) ---------- */
  await cdp.eval(`(() => {
    const as = document.querySelector('#autoSub'); if (as) as.checked = false;
    state.subsOn = false;
    state.spk.on = false; state.spk.auto = false;
    state.music.buffer = null;      /* tanpa skor musik — fokus jalur batch inti */
    state.bsound.on = false; state.bsound.buffer = null;
    state.cover.on = false;
    state.splitSec = 6;             /* part ±6 dtk → 3-4 part per video uji */
    state.splitParts = 0;
    state.applyAllStart = null;
    return true;
  })()`);

  /* ---------- impor 5 video sekaligus (seperti pengguna) ---------- */
  const paths = [1, 2, 3, 4, 5].map(i => `${MEDIA_DIR}/batch-test-${i}.mp4`);
  const imp = await cdp.eval(`(() => {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const n = addBatchPaths(${JSON.stringify(paths)}, 'batch');
    return { n, inBox: state.batch.length, stat: document.querySelector('#qStat').textContent };
  })()`);
  ok(`Impor massal 5 video → ${imp.inBox} video dalam kotak`, imp.n === 5 && imp.inBox === 5, JSON.stringify(imp));
  /* beri waktu thumbnail berantiran selesai supaya tidak berebut dekoder */
  await sleep(9000);

  /* ---------- jalankan BATCH EKSPOR (runBatch, folder uji) ---------- */
  console.log('\nMenjalankan runBatch() pada 5 video… (bisa beberapa menit)');
  const t0 = Date.now();
  const rb = await cdp.eval(`(async () => {
    pickOutDir = async () => ${JSON.stringify(OUT_DIR)};   /* timpa pemilih folder */
    let err = null;
    try { await runBatch(); } catch (e) { err = (e && e.message) || String(e); }
    return {
      err,
      items: state.batch.map(b => ({ name: b.name, status: b.status, msg: b.msg, dur: Math.round(b.durS || 0) })),
      files: undefined
    };
  })()`);
  const el = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`runBatch selesai dalam ${el} dtk — err: ${rb.err || '(tidak ada)'}`);
  rb.items.forEach((it, i) => console.log(`  ${String(i + 1).padStart(2, '0')}. ${it.name} → ${it.status.toUpperCase()}${it.msg ? ' · ' + it.msg : ''} · dur ${it.dur}s`));

  /* ---------- cek file hasil di folder output ---------- */
  const outs = fs.readdirSync(OUT_DIR).filter(f => /\.(mp4|txt)$/i.test(f)).sort();
  console.log(`\nFolder output berisi ${outs.length} file:`);
  outs.forEach(f => console.log(`  - ${f} (${(fs.statSync(path.join(OUT_DIR, f)).size / 1048576).toFixed(2)} MB)`));

  ok('Batch: tidak ada error tak tertangani dari runBatch', !rb.err, String(rb.err));
  const doneN = rb.items.filter(i => i.status === 'done').length;
  ok(`SEMUA 5 video SELESAI (yang terjadi: ${doneN} selesai · ${rb.items.filter(i => i.status === 'err').length} gagal)`, doneN === 5, JSON.stringify(rb.items.map(i => ({ n: i.name.slice(0, 14), s: i.status, m: i.msg }))));

  /* ---------- cetak semua console error/exception selama batch ---------- */
  const errs = conLog.filter(l => !/GPU|dbus|vaapi|Vulkan|dawn|WebGPU|lucide|Autofill|DevTools/i.test(l));
  console.log(`\nCatatan console/exception (${conLog.length} mentah, ${errs.length} relevan):`);
  errs.slice(0, 40).forEach(l => console.log('  ' + l));

  console.log(`\n==== HASIL v315-REPRO: ${pass} LULUS, ${fail} GAGAL ====`);
  if (fails.length) { console.log('GAGAL:'); fails.forEach(x => console.log('  - ' + x)); }
  process.exitCode = fail ? 1 : 0;
} catch (err) {
  console.error('FATAL:', err && err.message);
  console.error((err && err.stack || '').split('\n').slice(0, 6).join('\n'));
  console.error('\nConsole terakhir sebelum fatal:');
  conLog.slice(-15).forEach(l => console.log('  ' + l));
  process.exitCode = 1;
} finally {
  try { app.kill('SIGKILL'); } catch (e) { }
  process.exit(process.exitCode || 0);
}
