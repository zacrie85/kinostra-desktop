/* ================================================================
   KINOSTRA v3.15 — REPRO BUG BATCH 5 VIDEO · SKENARIO B (BERAT)
   5 film 90 dtk 720p HIGH profile (B-frame → MODE KILAT ditolak →
   TURBO), MUSIK SKOR aktif (composeMusic ulang per film), COVER
   OTOMATIS per part (pindai adegan). Menangkap semua console.error
   + exception supaya akar "GAGAL IMPORT VIDEO" terlihat jelas.
   Jalankan: bash scripts/run-test-xvfb.sh scripts/kinostra-v315-batch-testb.mjs
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project';
const MEDIA_DIR = '/tmp/kino-batch5b';
const OUT_DIR = '/tmp/kino-batch5b-out';
const PORT = 9497;

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

  /* persiapan: fitur berat AI luar mati, musik + cover auto AKTIF */
  await cdp.eval(`(async () => {
    const as = document.querySelector('#autoSub'); if (as) as.checked = false;
    state.subsOn = false;
    state.spk.on = false; state.spk.auto = false;
    state.splitSec = 22;            /* ±4 part per film 90 dtk */
    state.splitParts = 0;
    state.applyAllStart = null;
    /* MUSIK SKOR — susun sekali (pengguna) lalu batch menyusun ulang per film */
    await loadFromPath('${MEDIA_DIR}/film-1.mp4', true);
    await composeMusic(false, true, true);
    const mOk = !!state.music.buffer;
    /* COVER OTOMATIS per part — pindai adegan saat ekspor */
    state.cover.on = true; state.cover.auto = true; state.cover.scope = 'part';
    state.cover.dur = 1.5; state.cover.nc.trans = 'off';
    return { mOk };
  })()`);
  const chk = await cdp.eval(`({ mOk: !!state.music.buffer })`);
  ok('Musik skor tersusun (reuseMusic aktif di batch)', chk.mOk, JSON.stringify(chk));

  const paths = [1, 2, 3, 4, 5].map(i => `${MEDIA_DIR}/film-${i}.mp4`);
  const imp = await cdp.eval(`(() => {
    const n = addBatchPaths(${JSON.stringify(paths)}, 'batch');
    return { n, inBox: state.batch.length };
  })()`);
  ok(`Impor massal 5 film → ${imp.inBox} dalam kotak`, imp.n === 5 && imp.inBox === 5, JSON.stringify(imp));
  await sleep(10000);   /* thumbnail berantiran selesai */

  console.log('\nMenjalankan runBatch() skenario B (musik + cover auto)…');
  const t0 = Date.now();
  const rb = await cdp.eval(`(async () => {
    pickOutDir = async () => ${JSON.stringify(OUT_DIR)};
    let err = null;
    try { await runBatch(); } catch (e) { err = (e && e.message) || String(e); }
    return { err, items: state.batch.map(b => ({ name: b.name, status: b.status, msg: b.msg })) };
  })()`, 560000);
  const el = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`runBatch selesai dalam ${el} dtk — err: ${rb.err || '(tidak ada)'}`);
  rb.items.forEach((it, i) => console.log(`  ${String(i + 1).padStart(2, '0')}. ${it.name} → ${it.status.toUpperCase()}${it.msg ? ' · ' + it.msg : ''}`));

  const outs = fs.readdirSync(OUT_DIR).filter(f => /\.mp4$/i.test(f)).sort();
  console.log(`\nFolder output: ${outs.length} MP4`);
  const perFilm = {};
  outs.forEach(f => { const m = /FILM_(\d)/.exec(f); if (m) perFilm[m[1]] = (perFilm[m[1]] || 0) + 1; });
  console.log('Part per film:', JSON.stringify(perFilm));

  ok('Batch B: tidak ada error tak tertangani', !rb.err, String(rb.err));
  const doneN = rb.items.filter(i => i.status === 'done').length;
  ok(`SEMUA 5 film SELESAI (terjadi: ${doneN} selesai · ${rb.items.filter(i => i.status === 'err').length} gagal)`, doneN === 5, JSON.stringify(rb.items.map(i => ({ n: i.name.slice(0, 10), s: i.status, m: i.msg }))));

  const errs = conLog.filter(l => !/GPU|dbus|vaapi|Vulkan|dawn|WebGPU|lucide|Autofill|DevTools/i.test(l));
  console.log(`\nCatatan console/exception (${conLog.length} mentah, ${errs.length} relevan):`);
  errs.slice(0, 50).forEach(l => console.log('  ' + l));

  console.log(`\n==== HASIL v315-REPRO-B: ${pass} LULUS, ${fail} GAGAL ====`);
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
