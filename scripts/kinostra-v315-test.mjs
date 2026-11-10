/* ================================================================
   KINOSTRA v3.15.0 — UJI BATCH ANTI-GAGAL
   Gejala pengguna: impor 5 video sekaligus → ekspor semua; video 1
   lancar, video ke-2 dst berhenti setengah jalan "GAGAL IMPORT VIDEO".
   Perbaikan 4 lapis: (1) muat metadata ulang 3× + anti-macet + tolak
   Infinity; (2) percobaan ulang render dgn SETELAN AMAN (paralel 1 ·
   software · tanpa kilat) tanpa mengulang part jadi; (3) thumbnail
   kotak TUNDA saat ekspor; (4) bersih-bersih total antar film.
   Plus: TERAPKAN KE SEMUA VIDEO kini tampil N PART/video.
   Jalankan: bash scripts/run-test-xvfb.sh scripts/kinostra-v315-test.mjs
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project';
const MEDIA = '/tmp/kino-batch5';
const OUT = '/tmp/kinov315-out';
const OUT_D = '/tmp/kinov315-out-d';
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
  async eval(expr, timeoutMs = 560000) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: timeoutMs });
    if (r.exceptionDetails) throw new Error('PAGE-ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 800));
    return r.result.value;
  }
}

fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(OUT_D, { recursive: true, force: true }); fs.mkdirSync(OUT_D, { recursive: true });

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
    if (t === 'error' || t === 'warning' || t === 'assert') conLog.push(`[console.${t}] ${txt.slice(0, 260)}`);
    else if (t === 'info' && /SUKSES|safe|aman/i.test(txt)) conLog.push(`[console.info] ${txt.slice(0, 260)}`);
  });
  add('Runtime.exceptionThrown', p => {
    const d = p.exceptionDetails;
    conLog.push(`[EXCEPTION] ${((d.exception && d.exception.description) || d.text || '').split('\n').slice(0, 4).join(' | ').slice(0, 300)}`);
  });
}

let cdp;
try {
  cdp = await CDP.connect(PORT);
  await cdp.send('Runtime.enable');
  hookConsole(cdp);
  await sleep(2500);
  console.log('CDP tersambung.\n');

  /* ============ A. SMOKE ============ */
  console.log('A. SMOKE — VERSI 3.15.0');
  const a = await cdp.eval(`(() => {
    const q = s => document.querySelector(s);
    return { tag: (q('.tag') || {}).textContent || '' };
  })()`);
  ok('Header bertanda v3.15.0', /v3\.15\.0/.test(a.tag), JSON.stringify(a));

  /* setelan umum */
  await cdp.eval(`(() => {
    const as = document.querySelector('#autoSub'); if (as) as.checked = false;
    state.subsOn = false; state.spk.on = false; state.spk.auto = false;
    state.music.buffer = null; state.bsound.on = false; state.bsound.buffer = null;
    state.cover.on = false; state.splitSec = 6; state.splitParts = 0;
    state.applyAllStart = null; state.resumeExport = true;
    return true;
  })()`);

  /* ============ B. FILE RUSAK — MUAT GAGAL BERSIH (ANTI-MACET) ============ */
  console.log('B. FILE RUSAK — loadFromPath gagal BERSIH (muat ulang 3×, tidak macet)');
  const tB = Date.now();
  const b = await cdp.eval(`(async () => {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    await loadFromPath('${MEDIA}/rusak.mp4', true);
    await sleep(100);
    const toasts = [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ');
    return { file: !!state.file, dur: state.duration, hud: document.querySelector('#hudName').textContent, toasts, ms: 0 };
  })()`, 60000);
  b.ms = Date.now() - tB;
  ok(`File rusak ditolak bersih: state.file=null, durasi 0 (${(b.ms / 1000).toFixed(1)} dtk — tidak macet)`,
    !b.file && b.dur === 0 && b.ms < 45000, JSON.stringify(b));
  ok('Toast memandu konversi MP4/H.264', /MP4\/H\.264/.test(b.toasts), b.toasts);
  ok('HUD menandai FORMAT TAK DIDUKUNG', b.hud === 'FORMAT TAK DIDUKUNG', b.hud);

  const b2 = await cdp.eval(`(async () => {
    await loadFromPath('${MEDIA}/batch-test-1.mp4', true);
    return { file: !!state.file, dur: Math.round(state.duration || 0) };
  })()`);
  ok(`Film valid termuat normal setelah kegagalan (dur ${b2.dur}s)`, b2.file && b2.dur === 20, JSON.stringify(b2));

  /* ============ C. BATCH KETAHANAN — RUSAK DI TENGAH ANTREAN ============ */
  console.log('C. BATCH KETAHANAN — film rusak di posisi 2, lainnya harus tetap SELESAI');
  const c = await cdp.eval(`(async () => {
    clearQueue();
    addBatchPaths(['${MEDIA}/batch-test-1.mp4', '${MEDIA}/rusak.mp4', '${MEDIA}/batch-test-2.mp4', '${MEDIA}/batch-test-3.mp4'], 'batch');
    pickOutDir = async () => ${JSON.stringify(OUT)};
    let err = null;
    try { await runBatch(); } catch (e) { err = (e && e.message) || String(e); }
    return { err, items: state.batch.map(b2 => ({ n: b2.name, s: b2.status, m: b2.msg })) };
  })()`, 420000);
  ok('runBatch tidak melempar error tak tertangani', !c.err, String(c.err));
  const st1 = c.items[0], st2 = c.items[1], st3 = c.items[2], st4 = c.items[3];
  ok('Film 1 SELESAI', st1.s === 'done', JSON.stringify(st1));
  ok(`Film rusak ditandai GAGAL dgn pesan memandu: "${st2.m}"`, st2.s === 'err' && /konversi/.test(st2.m || ''), JSON.stringify(st2));
  ok('Film 3 SELESAI (batch LANJUT setelah gagal)', st3.s === 'done', JSON.stringify(st3));
  ok('Film 4 SELESAI', st4.s === 'done', JSON.stringify(st4));
  const mp4s = fs.readdirSync(OUT).filter(f => /BATCH_TEST_\d_PART/.test(f));
  ok(`Folder output berisi 12 part dari 3 film valid (terjadi: ${mp4s.length})`, mp4s.length === 12, String(mp4s.length));

  /* ============ D. PERCOBAAN ULANG SETELAN AMAN ============ */
  console.log('D. RENDER GAGAL DI TENGAH JALAN → ULANG OTOMATIS SETELAN AMAN → SELESAI');
  const d = await cdp.eval(`(async () => {
    clearQueue();
    addBatchPaths(['${MEDIA}/batch-test-4.mp4', '${MEDIA}/batch-test-5.mp4'], 'batch');
    /* simulasi: pemanggilan render PERTAMA gagal (seperti encoder GPU kewalahan
       di film kedua) — lapisan pemulihan harus mengulang dgn setelan aman */
    window._xN = 0; const _xOrig = exportPartsToDir;
    window._xSafeUsed = null;
    exportPartsToDir = async function (dir, ui) {
      window._xN++;
      const safe = state.parallel === 1 && state.acc === 'cpu' && state.kilat === 'off';
      if (window._xN === 1) throw new Error('simulasi render gagal di tengah jalan');
      if (safe && window._xSafeUsed == null) window._xSafeUsed = window._xN;
      return _xOrig(dir, ui);
    };
    pickOutDir = async () => ${JSON.stringify(OUT_D)};
    let err = null;
    try { await runBatch(); } catch (e) { err = (e && e.message) || String(e); }
    exportPartsToDir = _xOrig;
    return {
      err, xN: window._xN, safeUsed: window._xSafeUsed,
      items: state.batch.map(b2 => ({ n: b2.name, s: b2.status, m: b2.msg })),
      par: state.parallel, kil: state.kilat, acc: state.acc
    };
  })()`, 420000);
  ok('Batch D: tidak ada error tak tertangani', !d.err, String(d.err));
  ok(`Render dipanggil 3× (1 gagal + 1 ulang + 1 film berikutnya) — terjadi: ${d.xN}`, d.xN === 3, String(d.xN));
  ok(`Percobaan ulang memakai SETELAN AMAN (paralel 1 · cpu · tanpa kilat) — tercatat di panggilan ke-${d.safeUsed}`, d.safeUsed === 2, String(d.safeUsed));
  ok('KEDUA film SELESAI walau render pertama disabotase', d.items.every(i => i.s === 'done'), JSON.stringify(d.items));
  ok(`Setelan asli dikembalikan (par ${d.par}, kilat ${d.kil}, acc ${d.acc})`, d.par === 0 && d.kil === 'on' && d.acc === 'auto', JSON.stringify({ par: d.par, kil: d.kil, acc: d.acc }));
  ok('Console mencatat "percobaan ulang setelan aman SUKSES"', conLog.some(l => /percobaan ulang setelan aman SUKSES/.test(l)));

  /* ============ E. TERAPKAN KE SEMUA VIDEO — N PART/VIDEO ============ */
  console.log('E. TERAPKAN KE SEMUA VIDEO — tampil N PART/video saat JUMLAH PART aktif');
  const e1 = await cdp.eval(`(() => {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    state.splitParts = 3; state.splitSec = 7; state.applyAllStart = null;
    syncRangeApplyUI();
    const stat0 = document.querySelector('#rangeApplyStat').textContent;
    document.querySelector('#btnRangeApplyAll').click();
    const stat = document.querySelector('#rangeApplyStat').textContent;
    const toast = (document.querySelector('.toast') || {}).textContent || '';
    return { stat0, stat, toast, preset: state.applyAllStart };
  })()`);
  ok('Status MATI dulu, lalu AKTIF setelah klik', /MATI/.test(e1.stat0) && /AKTIF/.test(e1.stat), JSON.stringify(e1));
  ok(`Status menampilkan 3 PART/video: "${e1.stat}"`, /3 PART\/video/.test(e1.stat), e1.stat);
  ok(`Toast menyebut 3 PART per video: "${e1.toast}"`, /3 PART per video/.test(e1.toast), e1.toast);
  const e2 = await cdp.eval(`(async () => {
    await Promise.race([
      loadFromPath('${MEDIA}/batch-test-2.mp4', true),
      new Promise(r => setTimeout(() => r('TIMEOUT-MUAT'), 60000))
    ]);
    const r = { start: rangeInfo().start, splitParts: state.splitParts, splitSec: +state.splitSec.toFixed(2) };
    /* reset preset utk kebersihan antar-seksi */
    document.querySelector('#btnRangeApplyReset').click();
    r.resetOk = state.applyAllStart == null && rangeInfo().start === 0;
    r.file = !!state.file;
    return r;
  })()`, 80000);
  ok(`Preset diterapkan ke video baru (file ${e2.file}, mulai ${e2.start}, splitParts ${e2.splitParts}, split ${e2.splitSec}s = 20/3)`,
    e2.start === 0 && e2.splitParts === 3 && Math.abs(e2.splitSec - 20 / 3) < 0.01, JSON.stringify(e2));
  ok('Reset penerapan massal berfungsi', e2.resetOk, JSON.stringify(e2));

  /* ============ F. THUMBNAIL TUNDA SAAT EKSPOR ============ */
  console.log('F. THUMBNAIL KOTAK — TUNDA selagi proses, LANJUT setelahnya');
  const f = await cdp.eval(`(async () => {
    clearQueue();
    state.busy = true;   /* tiru ekspor sedang berjalan */
    addBatchPaths(['${MEDIA}/batch-test-4.mp4', '${MEDIA}/batch-test-5.mp4'], 'batch');
    await sleep(1500);
    const saatBusy = state.batch.map(b2 => b2.thumb ? 1 : 0);
    state.busy = false;
    queueBatchThumb();
    await sleep(16000);
    const setelah = state.batch.map(b2 => b2.thumb ? 1 : 0);
    return { saatBusy, setelah };
  })()`, 45000);
  ok(`Thumbnail TERTUNDA selagi busy (diproses: ${f.saatBusy.join(',')})`, f.saatBusy.every(v => v === 0), JSON.stringify(f));
  ok(`Thumbnail dilanjutkan otomatis setelah proses (${f.setelah.join(',')})`, f.setelah.every(v => v === 1), JSON.stringify(f));

  /* console error relevan */
  const errs = conLog.filter(l => !/GPU|dbus|vaapi|Vulkan|dawn|WebGPU|lucide|Autofill|DevTools|rusak|meta (error|lambat)|tidak masuk akal|metadata tidak datang|Track audio|simulasi render|render gagal \(|percobaan ulang|baca sumber|kilat|decoder|tabel sampel/i.test(l));
  console.log(`\nSisa console error/warning di luar ekspektasi (${errs.length}):`);
  errs.slice(0, 20).forEach(l => console.log('  ' + l));

  console.log(`\n==== HASIL v3.15: ${pass} LULUS, ${fail} GAGAL ====`);
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
