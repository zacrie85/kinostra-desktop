/* ================================================================
   KINOSTRA v3.16.0 — UJI TAMPILAN RAPI + PERAWATAN + PRESET
   (1) 17 modul teratur: ikon header, penomoran 00-16, badge/note lama
       dihapus, modul tumpang tindih digabung (BATCH PROSES, SAMPUL AUTO)
   (2) PENGATURAN TERSIMPAN: SIMPAN → ubah-ubah → PAKAI → pulih persis
       → HAPUS
   (3) OPTIMASI PERFORMA: cache dibersihkan (counter), saran muncul &
       bisa diterapkan (kilat off → saran kilat; paralel 3 → saran auto)
   (4) BERSIHKAN CACHE: thumbnail kotak dibuang + IPC ukur/hapus bekerja
   (5) EKSPOR NYATA: satu film → 2 part via tombol (jalur UI baru)
   Jalankan: bash scripts/run-test-xvfb.sh scripts/kinostra-v316-test.mjs
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/home/z/my-project';
const MEDIA = '/tmp/kino-batch5';
const OUT = '/tmp/kinov316-out';
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

fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

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
  });
  add('Runtime.exceptionThrown', p => {
    const d = p.exceptionDetails;
    conLog.push(`[EXC] ${((d.exception && d.exception.description) || d.text || '').slice(0, 260)}`);
  });
}

try {
  const cdp = await CDP.connect(PORT);
  hookConsole(cdp);
  await sleep(2500);

  /* ============ A. SMOKE & TAMPILAN RAPI ============ */
  console.log('A. SMOKE & TAMPILAN RAPI — 17 modul, ikon, tanpa badge lama');
  const a = await cdp.eval(`(() => {
    const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
    const mods = qa('#panel .mod');
    return {
      tag: (q('.tag') || {}).textContent || '',
      nMods: mods.length,
      nos: mods.map(m => (m.querySelector('.mod-h .no') || {}).textContent || ''),
      titles: mods.map(m => ((m.querySelector('.mod-h .t') || {}).textContent || '').trim()),
      icons: mods.map(m => !!m.querySelector('.mod-h .mic svg')),
      badgeDiHeader: mods.filter(m => /BARU · v/.test((m.querySelector('.mod-h .t') || {}).textContent || '')).length,
      noteBerteletete: document.body.innerText.includes('v2.6 — geser sekarang') || document.body.innerText.includes('PEMBUATAN COVER:'),
      batchLama: !!q('#btnBatchRun') || !!q('#btnBatchAdd') || mods.some(m => /BATCH PROSES/.test((m.querySelector('.mod-h .t') || {}).textContent || '')),
      batchStatAda: !!q('#batchStat'),
      massDiKotak: !!q('#mq #massImport') && !!q('#mq #autoRun'),
      baru: {
        preset: !!q('#btnPresetSave') && !!q('#presetList'),
        opt: !!q('#btnOptimize') && !!q('#btnClearCache') && !!q('#mntInfo'),
        mmot: mods.some(m => /GERAK & TRANSISI/.test((m.querySelector('.mod-h .t') || {}).textContent || '')),
        sampulDiCover: !!q('#m8b #btnSampul'),
        exportAll: !!q('#btnExportAll')
      },
      prevBtnLama: qa('#m8 #btnSampul').length
    };
  })()`);
  ok('Header bertanda v3.16.0', /v3\.16\.0/.test(a.tag), JSON.stringify(a.tag));
  ok(`Panel berisi 17 modul (terjadi: ${a.nMods})`, a.nMods === 17, String(a.nMods));
  ok('Penomoran 00-16 berurutan tanpa loncat', a.nos.join(',') === Array.from({ length: 17 }, (_, i) => String(i).padStart(2, '0')).join(','), a.nos.join(','));
  ok('Semua header modul punya ikon (17 svg)', a.icons.every(Boolean), JSON.stringify(a.icons));
  ok('Tidak ada badge "BARU · v" di header modul', a.badgeDiHeader === 0, String(a.badgeDiHeader));
  ok('Note bertele-tele v2.x & essay cover dihapus', !a.noteBerteletete, '');
  ok('Modul BATCH PROSES lama & tombol duplikatnya hilang', !a.batchLama, '');
  ok('#batchStat dipindah (hidden) ke Kotak Video + IMPOR MASSAL & AUTO-RUN ikut', a.batchStatAda && a.massDiKotak, '');
  ok('Modul baru: PENGATURAN TERSIMPAN + PERAWATAN & PERFORMA + GERAK & TRANSISI', a.baru.preset && a.baru.opt && a.baru.mmot, JSON.stringify(a.baru));
  ok('BUKA STUDIO SAMPUL kini di modul 13 COVER (bukan 08 EFEK)', a.baru.sampulDiCover && !a.prevBtnLama, '');
  ok('BATCH EKSPOR jadi satu-satunya pintu batch di modul 14', a.baru.exportAll, '');

  /* ============ B. PENGATURAN TERSIMPAN — SIMPAN → PAKAI → HAPUS ============ */
  console.log('B. PENGATURAN TERSIMPAN — simpan, kacaukan, muat, hapus');
  const b0 = await cdp.eval(`(() => {
    /* atur sekelompok setelan via jalur UI (klik tombol & slider) */
    document.querySelector('#segRatio button[data-v="9:16"]').click();
    const t = document.querySelector('#inTitle'); t.value = 'FILM UJI PRESET'; t.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#segSplit button[data-v="50"]').click();
    const pf = document.querySelector('#selPrefix'); pf.value = 'EPISODE'; pf.dispatchEvent(new Event('change', { bubbles: true }));
    const ps = document.querySelector('#inPartSize'); ps.value = 2; ps.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#segQual button[data-v="max"]').click();
    document.querySelector('#segFps button[data-v="60"]').click();
    document.querySelector('#segKilat button[data-v="off"]').click();
    document.querySelector('#segParallel button[data-v="3"]').click();
    /* chip filter warna & frame video via teks span */
    [...document.querySelectorAll('#colorFilters button')].find(b => (b.querySelector('span') || {}).textContent === 'HOROR MISTIS').click();
    [...document.querySelectorAll('#frameStyles button')].find(b => (b.querySelector('span') || {}).textContent === 'BIOSKOP').click();
    /* chip cover layout & palet via dataset.v */
    const lay = document.querySelector('#coverLayoutChips button[data-v="banner"]') || document.querySelectorAll('#coverLayoutChips button')[1]; lay.click();
    const pal = document.querySelectorAll('#coverPaletteChips button')[3]; pal.click();
    return {
      ratio: state.ratio, title: state.title, split: state.splitSec, prefix: state.partPrefix,
      partSize: state.partSize, qual: state.quality, fps: state.fps, kilat: state.kilat, par: state.parallel,
      cf: state.colorFilter, fs: state.frameStyle, lay: state.cover.nc.layout, pal: state.cover.nc.palette
    };
  })()`);
  ok('Setelan uji terpasang via jalur UI (rasio 9:16, EPISODE, part 200%, max, 60fps)',
    b0.ratio === '9:16' && b0.prefix === 'EPISODE' && b0.partSize === 2 && b0.qual === 'max' && b0.fps === 60, JSON.stringify(b0));

  const b1 = await cdp.eval(`(() => {
    document.querySelector('#inPresetName').value = 'UJI A';
    document.querySelector('#btnPresetSave').click();
    const ls = JSON.parse(localStorage.getItem('kinostra.presets.v1') || '[]');
    const rows = document.querySelectorAll('#presetList .prow').length;
    const stat = document.querySelector('#presetStat').textContent;
    return { n: ls.length, nSetelan: ls[0] ? ls[0].n : 0, nama: ls[0] ? ls[0].name : '', rows, stat };
  })()`);
  ok(`SIMPAN menyimpan preset "UJI A" (${b1.nSetelan} setelan) & daftar tampil`, b1.n === 1 && b1.nama === 'UJI A' && b1.nSetelan >= 40 && b1.rows === 1, JSON.stringify(b1));

  const b2 = await cdp.eval(`(() => {
    /* kacaukan semua setelan tadi */
    document.querySelector('#segRatio button[data-v="16:9"]').click();
    const t = document.querySelector('#inTitle'); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#segSplit button[data-v="30"]').click();
    const pf = document.querySelector('#selPrefix'); pf.value = 'PART'; pf.dispatchEvent(new Event('change', { bubbles: true }));
    const ps = document.querySelector('#inPartSize'); ps.value = 1; ps.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#segQual button[data-v="balanced"]').click();
    document.querySelector('#segFps button[data-v="30"]').click();
    [...document.querySelectorAll('#colorFilters button')].find(b => (b.querySelector('span') || {}).textContent === 'NORMAL').click();
    const pre = {
      ratio: state.ratio, prefix: state.partPrefix, partSize: state.partSize, qual: state.quality, cf: state.colorFilter
    };
    /* PAKAI preset dari baris daftar */
    document.querySelector('#presetList .prow .pbtns .puse').click();
    return {
      pre,
      post: {
        ratio: state.ratio, title: state.title, split: state.splitSec, prefix: state.partPrefix,
        partSize: state.partSize, qual: state.quality, fps: state.fps, kilat: state.kilat, par: state.parallel,
        cf: state.colorFilter, fs: state.frameStyle, lay: state.cover.nc.layout, pal: state.cover.nc.palette,
        segRatioOn: document.querySelector('#segRatio button.on').dataset.v,
        psLabel: document.querySelector('#partSizeV').textContent
      }
    };
  })()`);
  ok('Setelah dikacaukan lalu PAKAI — seluruh setelan pulih persis (rasio, judul, split 50, EPISODE, 200%, max, 60fps, kilat off, paralel 3, filter horor, frame bioskop, cover banner×palet, label 200%)',
    b2.post.ratio === '9:16' && b2.post.title === 'FILM UJI PRESET' && b2.post.split === 50 && b2.post.prefix === 'EPISODE' &&
    b2.post.partSize === 2 && b2.post.qual === 'max' && b2.post.fps === 60 && b2.post.kilat === 'off' && b2.post.par === 3 &&
    b2.post.cf === 'horor' && b2.post.fs === 'bioskop' && b2.post.lay === b0.lay && b2.post.pal === b0.pal &&
    b2.post.segRatioOn === '9:16' && b2.post.psLabel === '200%', JSON.stringify(b2));

  const b3 = await cdp.eval(`(() => {
    document.querySelector('#presetList .prow .pbtns .pdel').click();
    const ls = JSON.parse(localStorage.getItem('kinostra.presets.v1') || '[]');
    return { n: ls.length, rows: document.querySelectorAll('#presetList .prow').length };
  })()`);
  ok('HAPUS preset mengosongkan daftar & localStorage', b3.n === 0 && b3.rows === 0, JSON.stringify(b3));

  /* ============ C. OPTIMASI PERFORMA ============ */
  console.log('C. OPTIMASI PERFORMA — cache bersih, uji encoder, saran diterapkan');
  /* kembalikan setelan sehat utk seksi berikutnya */
  await cdp.eval(`(() => {
    document.querySelector('#segKilat button[data-v="on"]').click();
    document.querySelector('#segParallel button[data-v="0"]').click();
    document.querySelector('#segFps button[data-v="30"]').click();
    document.querySelector('#segQual button[data-v="balanced"]').click();
    document.querySelector('#segRatio button[data-v="16:9"]').click();
    return true;
  })()`);
  const c1 = await cdp.eval(`(async () => {
    window.__kinoCacheCleared = 0;
    getLayer('uji-test-layer', () => document.createElement('canvas'));   /* isi cache */
    state.parallel = 3; state.kilat = 'off';                               /* picu 2 saran pasti */
    document.querySelector('#btnOptimize').click();
    await new Promise(r => setTimeout(r, 3000));
    const mTitle = document.querySelector('#mTitle').textContent;
    const bodyTxt = document.querySelector('#mBody').textContent;
    const hasSaran = /SARAN PENINGKATAN KECEPATAN/.test(bodyTxt);
    const nSaran = (bodyTxt.match(/Aktifkan MODE KILAT|Render paralel OTOMATIS|Akselerasi OTOMATIS/g) || []).length;
    const sub = document.querySelector('#mSub').textContent;
    return { mTitle, hasSaran, nSaran, sub, cleared: window.__kinoCacheCleared, open: !document.querySelector('#modal').classList.contains('hidden') };
  })()`, 60000);
  ok(`Modal OPTIMASI tampil dgn aksi bersih-bersih (counter cache = ${c1.cleared})`, c1.open && /OPTIMASI PERFORMA SELESAI/.test(c1.mTitle) && c1.cleared >= 1, JSON.stringify(c1));
  ok(`Saran kecepatan muncul (${c1.nSaran}: kilat & paralel)`, c1.hasSaran && c1.nSaran >= 2, JSON.stringify(c1));
  const c2 = await cdp.eval(`(() => {
    const b = document.querySelector('#btnApplySaran');
    if (b) b.click();
    return { par: state.parallel, kilat: state.kilat, closed: document.querySelector('#modal').classList.contains('hidden') };
  })()`);
  ok('TERAPKAN SEMUA SARAN memulihkan paralel OTOMATIS (0) & MODE KILAT aktif', c2.par === 0 && c2.kilat === 'on' && c2.closed, JSON.stringify(c2));
  const c3 = await cdp.eval(`(() => {
    const box = document.querySelector('#mntInfo').textContent;
    return { box, adaRam: /RAM TERPASANG/.test(box), adaCache: /CACHE SEMENTARA/.test(box) };
  })()`);
  ok('Kotak info perawatan terisi (RAM, CPU, cache, model AI)', c3.adaRam && c3.adaCache, JSON.stringify(c3.box.slice(0, 120)));

  /* ============ D. BERSIHKAN CACHE ============ */
  console.log('D. BERSIHKAN CACHE — thumbnail dibuang, IPC main bekerja');
  const d1 = await cdp.eval(`(async () => {
    state.batch.push({ path: '${MEDIA}/batch-test-1.mp4', name: 'batch-test-1.mp4', size: 0, status: 'wait', msg: '', thumb: 'data:image/jpeg;base64,AAAA', dur: 1, sel: false, via: 'batch' });
    document.querySelector('#btnClearCache').click();
    await new Promise(r => setTimeout(r, 2500));
    const mTitle = document.querySelector('#mTitle').textContent;
    const bodyTxt = document.querySelector('#mBody').textContent;
    const ipc = await window.kinostra.cleanupCache({ dry: true });
    return {
      mTitle, bodyTxt, thumbNull: state.batch[0].thumb === null,
      ipcNumeric: typeof ipc.whisperTmp === 'number' && typeof ipc.modelsDir === 'number' && typeof ipc.cacheDir === 'number',
      open: !document.querySelector('#modal').classList.contains('hidden')
    };
  })()`, 60000);
  ok('Modal CACHE DIBERSIHKAN tampil & laporan menyebut thumbnail kotak dibuang (lalu dibuat ulang otomatis)',
    d1.open && /CACHE DIBERSIHKAN/.test(d1.mTitle) && /thumbnail kotak dibuang/.test(d1.bodyTxt), JSON.stringify({ ...d1, bodyTxt: d1.bodyTxt.slice(0, 140) }));
  ok('IPC sys:cleanup mengukur cache/model dgn angka valid', d1.ipcNumeric, '');
  await cdp.eval(`(() => { document.querySelector('#mClose').click(); state.batch = []; return true; })()`);

  /* ============ E. EKSPOR NYATA — pipeline utuh setelah rombakan UI ============ */
  console.log('E. EKSPOR NYATA — 1 film → 2 part via mesin ekspor + wiring tombol');
  const e1 = await cdp.eval(`(async () => {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const as = document.querySelector('#autoSub'); if (as) as.checked = false;
    state.subsOn = false; state.spk.on = false; state.spk.auto = false;
    state.music.buffer = null; state.bsound.on = false; state.bsound.buffer = null;
    state.cover.on = false; state.splitSec = 10; state.splitParts = 0;
    state.applyAllStart = null; state.resumeExport = true; state.speed = 1;
    await Promise.race([
      loadFromPath('${MEDIA}/batch-test-1.mp4', true),
      new Promise(r => setTimeout(() => r('TIMEOUT-MUAT'), 60000))
    ]);
    /* wiring tombol jalur UI baru — harus terpasang (fungsi, bukan null) */
    const wiring = {
      export: typeof document.querySelector('#btnExport').onclick === 'function',
      exportAll: typeof document.querySelector('#btnExportAll').onclick === 'function',
      merge: typeof document.querySelector('#btnMerge').onclick === 'function'
    };
    /* render via mesin yang sama dipakai tombol (dir langsung — tanpa dialog) */
    let err = null, nOut = 0;
    try {
      const res = await exportPartsToDir('${OUT}', { title() { }, prog() { }, sub() { } });
      nOut = (res || []).length;
    } catch (e) { err = (e && e.message) || String(e); }
    return { err, file: !!state.file, dur: Math.round(state.duration || 0), nOut, wiring };
  })()`, 240000);
  ok(`doExport-engine selesai tanpa error (${e1.nOut} part dari film ${e1.dur} dtk)`, !e1.err && e1.dur === 20 && e1.nOut === 2, JSON.stringify({ err: e1.err, dur: e1.dur, nOut: e1.nOut }));
  ok('Tombol EKSPOR & SPLIT / BATCH EKSPOR / GABUNG masih terpasang setelah rombakan',
    e1.wiring.export && e1.wiring.exportAll && e1.wiring.merge, JSON.stringify(e1.wiring));
  await sleep(800);
  const mp4s = fs.readdirSync(OUT).filter(f => f.endsWith('.mp4'));
  ok(`Folder output berisi 2 part MP4 (terjadi: ${mp4s.length})`, mp4s.length === 2, mp4s.join(','));

  /* console error relevan */
  const errs = conLog.filter(l => !/GPU|dbus|vaapi|Vulkan|dawn|WebGPU|lucide|Autofill|DevTools|Track audio|.decoder|decoder|kilat|meta/i.test(l));
  console.log(`\nSisa console error/warning di luar ekspektasi (${errs.length}):`);
  errs.slice(0, 20).forEach(l => console.log('  ' + l));

  console.log(`\n==== HASIL v3.16: ${pass} LULUS, ${fail} GAGAL ====`);
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
