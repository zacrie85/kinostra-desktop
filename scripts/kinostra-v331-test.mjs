/* ================================================================
   UJI v3.31.0 — PEMINDAI AUDIO SENYAP
   Kasus nyata v3.30: file sumber kawan (PART_01) HENING TOTAL
   (max_volume −91 dB — track AAC ada tapi isinya kosong, umum pada
   film split-an hasil unduhan) → ekspor menyalin audio asli dgn setia
   → hasil "tidak ada suaranya" padahal aplikasi bekerja benar.
   v3.31: deteksi SEBELUM ekspor:
   1) impor sumber senyap 3 mnt → state.audioSenyap + toast SENYAP
      + #bsoundStat diberi tanda ⚠
   2) ekspor part 10 dtk → AAC ada & hening (salinan setia sumber)
   3) MUSIK sintetis dipasang → impor sumber senyap lagi → toast
      berubah: hasil akan berisi MUSIK/BACKSOUND saja
   4) ekspor sumber senyap + MUSIK → hasil BERNADA (> −55 dB)
   5) impor sumber bernada (sine −16 dB) → audioSenyap false
   Pakai: bash scripts/run-test-xvfb.sh scripts/kinostra-v331-test.mjs 480
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/home/z/my-project';
const PORT = 9511;
const SILENT = ROOT + '/testmedia/silent180.mp4';
const TONE = ROOT + '/testmedia/tone180.mp4';
const OUT = ROOT + '/testmedia/out-v331';
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  LULUS  ' + n)) : (fail++, console.log(`  GAGAL  ${n} ${x}`)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map();
    ws.addEventListener('message', e => { const m = JSON.parse(e.data);
      if (m.id && this.pend.has(m.id)) { const { res, rej } = this.pend.get(m.id); this.pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } });
  }
  static async connect(port, tries = 75) {
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
  if (!pg) throw new Error('tidak ada target');
  const ws = new WebSocket(pg.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); setTimeout(() => rej(new Error('ws')), 8000); });
  cdp.ws = ws; cdp.pend = new Map();
}
async function evalRace(cdp, expr, ms = 15000) {
  let to;
  return Promise.race([cdp.eval(expr), new Promise((_, rej) => { to = setTimeout(() => rej(new Error('eval-timeout')), ms); })]).finally(() => clearTimeout(to));
}
async function evalRetry(cdp, expr, ms = 12000) {
  try { return await evalRace(cdp, expr, ms); }
  catch (e) { await reconnect(cdp); return await evalRace(cdp, expr, ms); }
}
async function loadVideo(cdp, path) {
  for (let percobaan = 1; percobaan <= 3; percobaan++) {
    await evalRetry(cdp, `loadFromPath(${JSON.stringify(path)}); 'ok'`, 30000);
    for (let i = 0; i < 25; i++) { await sleep(1000);
      const s = await evalRetry(cdp, `state.duration || 0`, 6000).catch(() => 0);
      if (s > 0) return true; }
  }
  return false;
}
async function waitToast(cdp, kata, ms = 15000) {
  for (let i = 0; i < ms / 500; i++) {
    const t = await evalRetry(cdp, `document.querySelector('#toasts') ? document.querySelector('#toasts').innerText : ''`, 6000).catch(() => '');
    if (t && t.includes(kata)) return t;
    await sleep(500);
  }
  return null;
}
async function exportOne(cdp, outDir) {
  return evalRetry(cdp, `(async () => {
    state.rangeStart = 0; state.rangeEnd = 10; state.splitSec = 10; state.splitCustom = true; applySplitParts();
    state.cover.on = false; state.kilat = 'off'; state.parallel = 2;
    state.titleOn = false; state.descOn = false; state.subsOn = false;
    state.partShow = 'intro'; state.partAnim = 'off'; state.partFrame = 'off';
    state.cutMode = 'full'; state.acc = 'cpu'; state.scale = '0.5';
    try { const res = await exportPartsToDir(${JSON.stringify(outDir)}, { title() { }, prog() { }, sub() { } });
      return { n: res.length, fatal: state.exportFatal ? String(state.exportFatal.message) : null }; }
    catch (e) { return { n: 0, err: String((e && e.message) || e) }; }
  })()`, 300000);
}
function volDetect(p) {
  return new Promise(res => {
    const ch = spawn('ffmpeg', ['-v', 'info', '-i', p, '-af', 'volumedetect', '-f', 'null', '-']);
    let out = '';
    ch.stderr.on('data', d => { out += d.toString(); });
    ch.on('close', () => { const m = out.match(/max_volume:\s*(-?[\d.]+) dB/); res(m ? parseFloat(m[1]) : -999); });
    setTimeout(() => { try { ch.kill('SIGKILL'); } catch (e) { } res(-999); }, 60000);
  });
}

try {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const app = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
  process.on('exit', () => { try { app.kill('SIGKILL'); } catch (e) { } });
  const cdp = await CDP.connect(PORT);
  await sleep(2000);

  /* 1 — impor sumber SENYAP → peringatan muncul */
  ok('Sumber senyap (3 mnt) termuat', await loadVideo(cdp, SILENT));
  const sen = await evalRetry(cdp, `({ flag: !!state.audioSenyap, stat: document.querySelector('#bsoundStat').innerText })`, 15000);
  ok('Deteksi SENYAP: state.audioSenyap = true', sen && sen.flag === true, JSON.stringify(sen));
  ok('Peringatan muncul di toast', !!(await waitToast(cdp, 'SENYAP')));
  ok('Modul 11 diberi tanda ⚠ (bsoundStat)', sen && sen.stat.includes('SENYAP'), sen && sen.stat);

  /* 2 — ekspor tanpa musik → salinan setia sumber (AAC ada, hening) */
  const ex1 = await exportOne(cdp, OUT);
  ok('Ekspor part sumber senyap selesai', ex1 && ex1.n === 1 && !ex1.fatal, JSON.stringify(ex1));
  const f1 = fs.readdirSync(OUT).find(f => f.endsWith('.mp4'));
  const v1 = f1 ? await volDetect(OUT + '/' + f1) : -999;
  ok('Hasil = salinan setia sumber senyap (max ≤ −80 dB)', v1 <= -80, 'max=' + v1 + ' dB');

  /* 3 — pasang MUSIK sintetis → impor senyap lagi → pesan berubah */
  await evalRetry(cdp, `(async () => {
    const b = new AudioBuffer({ sampleRate: 48000, length: 48000 * 30, numberOfChannels: 2 });
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = Math.sin(2 * Math.PI * 440 * i / 48000) * 0.4; }
    state.music.buffer = b; return 'musik ok';
  })()`, 15000);
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  ok('Sumber senyap termuat ulang (dengan MUSIK terpasang)', await loadVideo(cdp, SILENT));
  await evalRetry(cdp, `state.music.buffer`, 8000);   /* pastikan musik masih ada */
  const t2 = await waitToast(cdp, 'MUSIK/BACKSOUND', 15000);
  ok('Pesan berubah: hasil akan berisi MUSIK/BACKSOUND saja', !!t2, t2 || 'toast tak ketemu');

  /* 4 — ekspor sumber senyap + MUSIK → hasil BERNADA */
  const ex2 = await exportOne(cdp, OUT);
  ok('Ekspor sumber senyap + MUSIK selesai', ex2 && ex2.n === 1 && !ex2.fatal, JSON.stringify(ex2));
  const f2 = fs.readdirSync(OUT).find(f => f.endsWith('.mp4'));
  const v2 = f2 ? await volDetect(OUT + '/' + f2) : -999;
  ok('Hasil BERNADA lewat musik (max > −55 dB)', v2 > -55, 'max=' + v2 + ' dB');
  await evalRetry(cdp, `state.music.buffer = null; 'musik dilepas'`, 8000);

  /* 5 — sumber BERNADA → tidak dianggap senyap */
  ok('Sumber bernada (sine −16 dB) termuat', await loadVideo(cdp, TONE));
  const sen2 = await evalRetry(cdp, `!!state.audioSenyap`, 15000);
  ok('Sumber bernada: audioSenyap tetap false', sen2 === false, 'flag=' + sen2);

  try { app.kill('SIGKILL'); } catch (e) { }
  console.log('SELESAI: ' + pass + ' lulus, ' + fail + ' gagal');
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('UJI ERROR:', e.message);
  process.exit(1);
}
