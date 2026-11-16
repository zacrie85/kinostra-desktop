/* ================================================================
   KINOSTRA v3.17.2 — UJI LOG CRASH PERMANEN + SHIELD
   FASE 0: start → baca jalur userData asli → app dimatikan PAKSA
           (SIGKILL = exit tak wajar, marker tetap ada)
   FASE 1: GPUCache palsu ditanam → start lagi →
   (1) SMOKE: versi 3.17.1, 17 modul, API shield, baris PELINDUNG
   (2) GUARD EXIT-KOTOR: marker terdeteksi & cache grafis dibersihkan
   (3) STORM: impor 3 video + PAKAI preset 6× beruntun tanpa exception
   (4) PEMULIHAN CRASH NYATA: renderer dipaksa crash → pulih otomatis,
       toast muncul, preset selamat, impor + PAKAI jalan lagi
   (5) LOG CRASH PERMANEN: berkas terisi (mulai, sesi mati tak wajar, RENDER MATI),
       tombol SALIN LOG/BUKA FOLDER/MODE AMAN ada, RIWAYAT KEJADIAN tampil,
       guard backsound >160 MB terpasang
   (6) BUMP 6 file 3.17.2
   Jalankan: bash scripts/run-test-xvfb.sh scripts/kinostra-v317-test.mjs
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project';
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

let APP = null;
const mainLog = [];
function launch() {
  APP = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu-sandbox'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99', ELECTRON_DISABLE_SECURITY_WARNINGS: '1', KINOSTRA_TEST: '1' }
  });
  APP.stdout.on('data', d => { const s = d.toString(); mainLog.push(s); if (/SHIELD/.test(s)) process.stdout.write('[main] ' + s); });
  APP.stderr.on('data', d => { const s = d.toString(); mainLog.push(s); });
}
async function killHard() {
  if (!APP) return;
  APP.kill('SIGKILL');
  await new Promise(r => { APP.once('exit', r); setTimeout(r, 5000); });
  APP = null;
}
process.on('exit', () => { try { if (APP) APP.kill('SIGKILL'); } catch (e) { } });

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
  /* ============ FASE 0: baca jalur userData asli lalu matikan paksa ============ */
  console.log('FASE 0 — baca jalur userData asli, lalu app dimatikan PAKSA (SIGKILL)');
  launch();
  let cdp0 = await CDP.connect(PORT);
  const ud0 = await cdp0.eval(`(async () => (await window.kinostra.shieldStatus()).ud)()`);
  ok('Jalur userData asli terbaca via shieldStatus', typeof ud0 === 'string' && ud0.length > 4, String(ud0));
  console.log('userData = ' + ud0);
  await killHard();
  try { cdp0.ws.close(); } catch (e) { }
  await sleep(1200);

  /* tanam GPUCache palsu (marker pasti sudah ada — SIGKILL tidak menghapusnya) */
  fs.mkdirSync(path.join(ud0, 'GPUCache'), { recursive: true });
  fs.writeFileSync(path.join(ud0, 'GPUCache', 'fake.bin'), 'x');
  fs.writeFileSync(path.join(ud0, 'kinostra.running'), String(Date.now()));
  const hadMarker = fs.existsSync(path.join(ud0, 'kinostra.running'));
  ok('Marker exit-kotor + GPUCache palsu ditanam di userData asli', hadMarker && fs.existsSync(path.join(ud0, 'GPUCache', 'fake.bin')), ud0);

  /* ============ FASE 1: start ulang ============ */
  console.log('FASE 1 — aplikasi dimulai ulang; PELINDUNG harus membersihkan cache grafis');
  launch();
  const cdp = await CDP.connect(PORT);
  hookConsole(cdp);
  await sleep(2500);

  /* ============ A. SMOKE + PELINDUNG TERPASANG ============ */
  console.log('A. SMOKE — versi, 17 modul, API pelindung');
  const a = await cdp.eval(`(() => ({
    tag: (document.querySelector('.tag') || {}).textContent || '',
    nMods: document.querySelectorAll('#panel .mod').length,
    hasShield: typeof window.kinostra.shieldStatus === 'function',
    hasTestCrash: typeof window.kinostra.testCrashRender === 'function',
    hasRecovered: typeof window.kinostra.onShieldRecovered === 'function'
  }))()`);
  ok('Header bertanda versi berjalan', new RegExp('v' + (JSON.parse(fs.readFileSync('/home/z/my-project/package.json', 'utf8')).version).replace(/\./g, '\\.')).test(a.tag), JSON.stringify(a.tag));
  ok('Panel tetap 17 modul', a.nMods === 17, String(a.nMods));
  ok('API pelindung lengkap (status + uji crash + notifikasi pemulihan)', a.hasShield && a.hasTestCrash && a.hasRecovered, JSON.stringify(a));

  await sleep(1500);
  const a2 = await cdp.eval(`(async () => {
    const sh = await window.kinostra.shieldStatus();
    return { sh, infoTxt: (document.querySelector('#mntInfo') || {}).textContent || '' };
  })()`);
  ok('shieldStatus hidup: upMin angka, safeMode boolean, counter nol di awal',
    a2.sh && typeof a2.sh.upMin === 'number' && typeof a2.sh.safeMode === 'boolean' &&
    a2.sh.renderCrashes === 0 && a2.sh.gpuCrashes === 0, JSON.stringify(a2.sh));
  ok('Kotak PERAWATAN memuat baris PELINDUNG LAYAR HITAM',
    /PELINDUNG LAYAR HITAM/.test(a2.infoTxt), a2.infoTxt.slice(0, 160));

  /* ============ B. GUARD EXIT-KOTOR ============ */
  console.log('B. GUARD EXIT-KOTOR — marker & cache grafis palsu dibersihkan saat mulai');
  const b1 = await cdp.eval(`(async () => { const s = await window.kinostra.shieldStatus(); return { dirty: s.dirtyExit, ev: s.lastEvent }; })()`);
  ok('Exit tak wajar sesi sebelumnya TERDETEKSI (marker ditemukan)', b1.dirty === true, JSON.stringify(b1));
  const gpuGone = !fs.existsSync(path.join(ud0, 'GPUCache', 'fake.bin'));
  ok('Isi GPUCache lama dibersihkan otomatis saat mulai (folder segar boleh dibuat ulang Chromium)', gpuGone, '');
  ok('Log main menunjukkan aksi pembersihan SHIELD', mainLog.join('').includes('SHIELD: sesi sebelumnya mati tak wajar'), '');

  /* ============ C. STORM IMPORT + PAKAI PRESET (gejala user) ============ */
  console.log('C. STORM — impor 3 video + PAKAI preset 6× beruntun');
  const c1 = await cdp.eval(`(() => {
    document.querySelector('#segSplit button[data-v="50"]').click();
    const pf = document.querySelector('#selPrefix'); pf.value = 'EPISODE'; pf.dispatchEvent(new Event('change', { bubbles: true }));
    const ps = document.querySelector('#inPartSize'); ps.value = 2; ps.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#inPresetName').value = 'STORM';
    document.querySelector('#btnPresetSave').click();
    const n = addBatchPaths([
      '/home/z/my-project/testmedia/short-a.mp4',
      '/home/z/my-project/testmedia/short-b.mp4',
      '/home/z/my-project/testmedia/v34-6s.mp4'
    ], 'impor');
    return { n, presets: JSON.parse(localStorage.getItem('kinostra.presets.v1') || '[]').length };
  })()`);
  ok('3 video masuk kotak & preset STORM tersimpan', c1.n === 3 && c1.presets === 1, JSON.stringify(c1));

  let thumbs = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    thumbs = await cdp.eval(`({ done: state.batch.filter(b => b.thumb).length, n: state.batch.length })`);
    if (thumbs.done >= thumbs.n) break;
  }
  ok(`Thumbnail kotak lengkap (${thumbs.done}/${thumbs.n}) tanpa mematikan aplikasi`, thumbs.done === 3 && thumbs.n === 3, JSON.stringify(thumbs));

  conLog.length = 0;
  const c2 = await cdp.eval(`(async () => {
    const hasil = [];
    for (let i = 0; i < 6; i++) {
      const b = document.querySelector('#presetList .prow .pbtns .puse');
      if (!b) return { gagal: true, i };
      b.click();
      await new Promise(r => setTimeout(r, 350));
      hasil.push(state.partPrefix + '|' + state.partSize);
    }
    const hm = (performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null);
    return { gagal: false, hasil, heapMB: hm, alive: true };
  })()`, 120000);
  ok('PAKAI preset 6× beruntun: aplikasi tetap hidup & setelan selalu pulih',
    c2.alive && !c2.gagal && c2.hasil.length === 6 && c2.hasil.every(h => h === 'EPISODE|2'), JSON.stringify(c2).slice(0, 200));
  const c3 = conLog.filter(l => /Out of memory|crashed|FATAL/.test(l));
  ok('Nol exception berbahaya selama storm (heap ' + (c2.heapMB != null ? c2.heapMB.toFixed(0) + ' MB' : '—') + ')', c3.length === 0, JSON.stringify(c3));

  /* ============ C2. AUDIO FILM PANJANG — PERBAIKAN AKAR v3.17.1 ============ */
  console.log('C2. AUDIO FILM PANJANG — impor film 120 mnt: tanpa decode utuh, analisis bertahap, ekspor bersuara');
  conLog.length = 0;
  const L1 = await cdp.eval(`(async () => {
    loadFromPath('/home/z/my-project/testmedia/long120.mp4');
    for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 1000)); if (state.duration > 0) break; }
    return { d: state.duration, alive: true };
  })()`);
  ok('Film 120 menit termuat (durasi ' + (L1 ? L1.d.toFixed(0) : '—') + ' dtk) tanpa crash', L1 && L1.alive && L1.d > 7000, JSON.stringify(L1));

  await sleep(12000);
  const L2 = await cdp.eval(`(() => ({ alive: true, d: state.duration,
    audioBufferNull: state.audioBuffer === null, demux: !!state._audioDemux }))()`);
  ok('12 dtk setelah impor: proses hidup & audioBuffer tetap NULL (tanpa decode utuh ±2,5 GB)',
    L2.alive && L2.d > 7000 && L2.audioBufferNull, JSON.stringify(L2));

  let L3 = null;
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    L3 = await cdp.eval(`(() => ({ peak: state.peaks && Math.max(...state.peaks), rms: +(state.audioRms||0).toFixed(4), env: state._audioEnv && state._audioEnv.length }))()`);
    if (L3.peak > 0 && L3.env > 0) break;
  }
  ok('Analisis bertahap berjalan: peaks terisi & envelope dibangun (RAM puncak = 1 jendela)',
    L3 && L3.peak > 0 && L3.env > 0, JSON.stringify(L3));
  ok('RMS global terukur (normalizer AUDIO SEHAT tetap punya data)', L3 && L3.rms > 0.001, JSON.stringify(L3));

  const L4 = await cdp.eval(`(async () => {
    const m1 = await renderMix(30, 2, 1);
    let nz1 = 0; const d1 = m1.getChannelData(0);
    for (let j = 0; j < d1.length; j += 997) if (Math.abs(d1[j]) > 0.001) nz1++;
    const m2 = await renderMix(3600, 2, 1);
    let nz2 = 0; const d2 = m2.getChannelData(0);
    for (let j = 0; j < d2.length; j += 997) if (Math.abs(d2[j]) > 0.001) nz2++;
    return { p30: nz1, p3600: nz2, dur: +m1.duration.toFixed(2), alive: true };
  })()`);
  ok('RENDER PENUH bersuara asli per jendela: audio di detik 30 & 3600 keduanya ada',
    L4.alive && L4.p30 > 0 && L4.p3600 > 0, JSON.stringify(L4));
  const c3b = conLog.filter(l => /Out of memory|crashed|FATAL/.test(l));
  ok('Nol exception berbahaya selama fase film panjang', c3b.length === 0, JSON.stringify(c3b));

  const L5 = await cdp.eval(`(async () => {
    loadFromPath('/home/z/my-project/testmedia/short-a.mp4');
    for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 500)); if (state.duration > 0 && state.duration < 60) break; }
    return { d: state.duration, native: !!state.audioBuffer, sr: state.audioBuffer && state.audioBuffer.sampleRate, alive: true };
  })()`);
  ok('Video pendek tetap di-decode penuh (perilaku lama tak berubah, kualitas penuh)',
    L5.alive && L5.native && L5.d > 0, JSON.stringify(L5));

  /* ============ D. PEMULIHAN CRASH NYATA ============ */
  console.log('D. PEMULIHAN CRASH — renderer dipaksa crash, harus pulih otomatis');
  let d1ok = false, d1err = '';
  try { const d1 = await cdp.eval(`window.kinostra.testCrashRender()`); d1ok = !!(d1 && d1.ok); if (!d1ok) d1err = JSON.stringify(d1); }
  catch (e) {
    /* "Target crashed" saat memanggil = renderer benar-benar crash → itu tujuan uji */
    d1ok = /crashed|Target/i.test(e.message); d1err = e.message.slice(0, 120);
  }
  ok('Renderer BENAR-BENAR crash saat dipicu (pemicu uji bekerja)', d1ok, d1err);

  let recovered = null;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try {
      const r = await cdp.eval(`({ ready: document.readyState, tag: (document.querySelector('.tag') || {}).textContent || '', preset: JSON.parse(localStorage.getItem('kinostra.presets.v1') || '[]').length })`);
      if (r.ready === 'complete' && new RegExp('v' + (JSON.parse(fs.readFileSync('/home/z/my-project/package.json', 'utf8')).version).replace(/\./g, '\\.')).test(r.tag)) { recovered = r; break; }
    } catch (e) { /* sedang crash / reload — coba lagi */ }
  }
  ok('Jendela dimuat ulang OTOMATIS setelah crash (±beberapa detik)', !!recovered, recovered ? JSON.stringify(recovered) : 'tidak pulih dalam 30 dtk');
  if (!recovered) { console.log(fails); console.log(`HASIL: ${pass} lulus, ${fail} gagal`); process.exit(1); }

  await sleep(1500);
  const d2 = await cdp.eval(`(async () => {
    const s = await window.kinostra.shieldStatus();
    const toasts = [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).join(' | ');
    return { render: s.renderCrashes, reloads: s.reloads, ev: s.lastEvent, toasts };
  })()`);
  ok('Counter pemulihan naik: render crash tercatat ≥1 & reload ≥1',
    d2.render >= 1 && d2.reloads >= 1, JSON.stringify(d2));
  ok('Toast pemulihan memberi tahu pengguna aplikasi sudah pulih',
    /dipulihkan otomatis/.test(d2.toasts), d2.toasts.slice(0, 200));
  ok('Preset STORM tetap aman di localStorage setelah crash', recovered.preset === 1, String(recovered.preset));

  /* ============ E. SETELAH PULIH — aplikasi tetap berfungsi ============ */
  console.log('E. SETELAH PULIH — import + PAKAI preset berfungsi lagi');
  const e1 = await cdp.eval(`(() => {
    const n = addBatchPaths(['/home/z/my-project/testmedia/v34-6s.mp4'], 'impor');
    return { n, batch: state.batch.length };
  })()`);
  ok('Impor video berfungsi setelah pemulihan', e1.n === 1 && e1.batch === 1, JSON.stringify(e1));
  let th2 = null;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    th2 = await cdp.eval(`({ done: state.batch.filter(b => b.thumb).length })`);
    if (th2.done >= 1) break;
  }
  ok('Thumbnail dibuat lagi setelah pemulihan', th2 && th2.done >= 1, JSON.stringify(th2));
  const e2 = await cdp.eval(`(() => {
    document.querySelector('#presetList .prow .pbtns .puse').click();
    return { prefix: state.partPrefix, partSize: state.partSize };
  })()`);
  ok('PAKAI preset masih bekerja persis setelah pemulihan (EPISODE · 200%)', e2.prefix === 'EPISODE' && e2.partSize === 2, JSON.stringify(e2));

  /* ============ G. LOG CRASH PERMANEN (baru v3.17.2) ============ */
  console.log('G. LOG CRASH PERMANEN — kejadian tercatat di disk & tombol pelaporan ada');
  const g1 = await cdp.eval(`(async () => {
    const lg = await window.kinostra.crashLog();
    return { fn: typeof window.kinostra.crashLog === 'function',
      fnOpen: typeof window.kinostra.openCrashLog === 'function',
      fnSafe: typeof window.kinostra.safeModeNow === 'function',
      pathOk: /kinostra-crash\.log$/.test(lg.path || ''),
      hasStart: /mulai — KINOSTRA v3\.17\.2/.test(lg.text || ''),
      hasDirty: /mati tak wajar/.test(lg.text || ''),
      hasRender: /RENDER MATI/.test(lg.text || ''),
      hasCode: /kode keluar/.test(lg.text || ''), alive: true };
  })()`);
  ok('API log crash tersedia (crashLog + openCrashLog + safeModeNow)', g1.fn && g1.fnOpen && g1.fnSafe, JSON.stringify(g1));
  ok('Berkas log menunjuk kinostra-crash.log di userData', g1.pathOk, JSON.stringify(g1.pathOk));
  ok('Log memuat baris MULAI v3.17.2', g1.hasStart, '');
  ok('Log memuat catatan sesi sebelumnya mati tak wajar', g1.hasDirty, '');
  ok('Log memuat RENDER MATI + kode keluar (crash fase D tercatat permanen)', g1.hasRender && g1.hasCode, '');
  const g2 = fs.readFileSync(path.join(ud0, 'kinostra-crash.log'), 'utf8');
  ok('Berkas log benar-benar ada di disk dgn isi nyata (bukan hanya memori)', g2.includes('RENDER MATI') && g2.includes('mulai'), String(g2.length));
  const g3 = await cdp.eval(`(() => ({
    bCopy: !!document.querySelector('#btnCopyCrashLog'),
    bOpen: !!document.querySelector('#btnOpenCrashLog'),
    bSafe: !!document.querySelector('#btnSafeModeNow'),
    info: (document.querySelector('#mntInfo') || {}).textContent || '',
    guard: typeof loadBsoundFile === 'function' && loadBsoundFile.toString().includes('160 * 1024 * 1024')
  }))()`);
  ok('3 tombol baru ada di PERAWATAN (SALIN LOG / BUKA FOLDER / MODE AMAN)', g3.bCopy && g3.bOpen && g3.bSafe, JSON.stringify(g3));
  ok('RIWAYAT KEJADIAN tersimpan tampil di kotak info', /RIWAYAT KEJADIAN/.test(g3.info), g3.info.slice(-200));
  ok('Pengaman backsound >160 MB terpasang (decode utuh dicegah)', g3.guard, '');

  /* ============ F. BUMP 6 FILE ============ */
  console.log('F. BUMP 3.17.2 — enam file versi');
  const pj = JSON.parse(fs.readFileSync(ROOT + '/package.json', 'utf8'));
  const ap = fs.readFileSync(ROOT + '/build/afterpack.js', 'utf8');
  const nsi = fs.readFileSync(ROOT + '/build/installer.nsi', 'utf8');
  const idx = fs.readFileSync(ROOT + '/renderer/index.html', 'utf8');
  const rdm = fs.readFileSync(ROOT + '/README.md', 'utf8');
  const pdn = fs.readFileSync(ROOT + '/KINOSTRA-PANDUAN.md', 'utf8');
  ok('package.json = 3.17.2', pj.version === '3.17.2', pj.version);
  ok('afterpack.js memuat 3.17 (string & numeric)', ap.includes('3.17.2.0') && /minor: 17/.test(ap), '');
  ok('installer.nsi memuat 3.17.2 (≥2 titik)', (nsi.match(/3\.17\.2/g) || []).length >= 2, '');
  ok('index.html boot+header v3.17.2', /v3\.17\.2/.test(idx), '');
  ok('README & PANDUAN menyebut 3.17', rdm.includes('3.17') && pdn.includes('3.17'), '');

  /* ============ RINGKASAN ============ */
  await killHard();
  console.log('');
  console.log(`HASIL: ${pass} lulus, ${fail} gagal`);
  if (fails.length) { console.log('GAGAL:'); fails.forEach(f => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('FATAL:', e.message);
  console.log(`HASIL: ${pass} lulus, ${fail} gagal`);
  process.exit(1);
}
