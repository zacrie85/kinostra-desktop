/* ================================================================
   UJI v3.32.0 — GERBANG SUARA + AUDIO FILM UTUH BERSEGMENT
   Akar bug: ekspor film utuh (3,5 jam) butuh AudioBuffer ±4,9 GB →
   alokasi gagal → "Audio film terlalu besar untuk decode penuh" →
   ekspor TANPA track audio (laporan user nyata: 71 part, film
   "Dikira Menantu…"). Kini: segmen 180 dtk LRU-8 + gerbang suara
   pra-ekspor dgn MUSIK OTOMATIS sekali klik + status suara di modal
   hasil. Pakai: bash scripts/run-test-xvfb.sh scripts/kinostra-v332-test.mjs 1200
   Catatan: pemicu SEGMENT = buildEnd (rentangEnd+300) > 1 GB
   → 1 GB ÷ (48.000 × 2 kanal × 4 byte) ≈ 2.712 dtk.
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/home/z/my-project';
const PORT = 9514;
const SILENT = ROOT + '/testmedia/longsilent66m.mp4';   /* 66 mnt, audio hening */
const TONE = ROOT + '/testmedia/longtone66m.mp4';       /* 66 mnt, nada −16 dB */
const OUT2 = ROOT + '/testmedia/out-v332-musik';
const OUT3 = ROOT + '/testmedia/out-v332-akhir';
const OUT4 = ROOT + '/testmedia/out-v332-monolitik';
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
/* ekspor TANPA auto-retry (eval timeout ≠ ulangi ekspor) */
async function evalOnce(cdp, expr, ms) {
  try { return await cdp.eval(expr, ms); }
  catch (e) { try { await reconnect(cdp); } catch (e2) { } throw e; }
}
async function loadVideo(cdp, path, tungguDeteksi = false) {
  for (let percobaan = 1; percobaan <= 3; percobaan++) {
    await evalRetry(cdp, `loadFromPath(${JSON.stringify(path)}); 'ok'`, 30000);
    for (let i = 0; i < 25; i++) { await sleep(1000);
      const s = await evalRetry(cdp, `state.duration || 0`, 8000).catch(() => 0);
      if (s > 0) {
        if (!tungguDeteksi) return true;
        /* v3.32: deteksi dini film panjang — tunggu audioSenyap terpasang */
        for (let k = 0; k < 140; k++) { await sleep(1000);
          const f = await evalRetry(cdp, `!!state.audioSenyap`, 8000).catch(() => false);
          if (f) return true; }
        return true;
      } }
  }
  return false;
}
function volDetect(p) {
  return new Promise(res => {
    const ch = spawn('ffmpeg', ['-v', 'info', '-i', p, '-af', 'volumedetect', '-f', 'null', '-']);
    let out = '';
    ch.stderr.on('data', d => { out += d.toString(); });
    ch.on('close', () => { const m = out.match(/max_volume:\s*(-?[\d.]+) dB/); res(m ? parseFloat(m[1]) : -999); });
    setTimeout(() => { try { ch.kill('SIGKILL'); } catch (e) { } res(-999); }, 120000);
  });
}
const SETAN = `state.cover.on = false; state.kilat = 'off'; state.parallel = 2;
  state.titleOn = false; state.descOn = false; state.subsOn = false;
  state.partShow = 'off'; state.partAnim = 'off'; state.partFrame = 'off';
  state.cutMode = 'full'; state.acc = 'cpu'; state.scale = '0.35'; state.fps = 15;`;
/* pola ekspor 1 part: rentang [s..e], splitSec ≥ panjang rentang */
async function eksporSatu(cdp, outDir, s, e, khusus) {
  return evalOnce(cdp, `(async () => {
    state.rangeStart = ${s}; state.rangeEnd = ${e}; state.splitSec = ${e - s}; state.splitCustom = true; applySplitParts();
    ${SETAN}
    ${khusus || ''}
    const res = await exportPartsToDir(${JSON.stringify(outDir)}, { title() { }, prog() { }, sub() { } });
    return { n: res.length, silent: res.map(r => !!r.silent), fatal: state.exportFatal ? String(state.exportFatal.message || state.exportFatal).slice(0, 120) : null };
  })()`, 600000);
}

try {
  for (const d of [OUT2, OUT3, OUT4]) fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(OUT2, { recursive: true }); fs.mkdirSync(OUT3, { recursive: true }); fs.mkdirSync(OUT4, { recursive: true });
  const app = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
  process.on('exit', () => { try { app.kill('SIGKILL'); } catch (e) { } });
  const cdp = await CDP.connect(PORT);
  await sleep(2500);

  /* 1 — film utuh SENYAP 66 mnt: deteksi dini SEJAK IMPOR (tanpa ekspor) */
  ok('Film utuh senyap 66 mnt termuat', await loadVideo(cdp, SILENT, true));
  const sen = await evalRetry(cdp, `({ flag: !!state.audioSenyap, stat: document.querySelector('#bsoundStat').innerText, dur: state.duration })`, 15000);
  ok('v3.32 deteksi dini: audioSenyap=true SEJAK IMPOR (film panjang)', sen && sen.flag === true, JSON.stringify({ dur: sen && sen.dur }));
  ok('Modul 11 ⚠ hening', sen && sen.stat.includes('SENYAP'), sen && sen.stat.slice(0, 60));

  /* 2 — rentang 2.347–2.530 dtk (buildEnd 2.830 dtk = 1,09 GB → SEGMENT):
         gerbang pra-ekspor muncul → MUSIK OTOMATIS sekali klik → bernada */
  const ex2 = await evalOnce(cdp, `(async () => {
    state.rangeStart = 2347; state.rangeEnd = 2530; state.splitSec = 183; state.splitCustom = true; applySplitParts();
    ${SETAN}
    const p = exportPartsToDir(${JSON.stringify(OUT2)}, { title() { }, prog() { }, sub() { } });
    let adaModal = false, segOn = false;
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (state._audioSeg && state._audioSeg.on) segOn = true;
      const t = document.querySelector('#mTitle') ? document.querySelector('#mTitle').textContent : '';
      if (t && t.includes('SENYAP')) { adaModal = true; segOn = !!(state._audioSeg && state._audioSeg.on); break; }
    }
    let musikDiklik = false;
    if (adaModal) { const b = document.querySelector('#pfMusik'); if (b) { b.click(); musikDiklik = true; } }
    const res = await p;
    showResults(res, ${JSON.stringify(OUT2)});
    const hasil = document.querySelector('#modal') ? document.querySelector('#modal').innerText : '';
    const r2 = { n: res.length, adaModal, segOn, musikDiklik, musik: !!state.music.buffer, silent: res.map(r => !!r.silent), hasil };
    hideModal();
    return r2;
  })()`, 600000);
  ok('Gerbang pra-ekspor muncul (sumber senyap, tanpa musik)', ex2 && ex2.adaModal === true, JSON.stringify({ adaModal: ex2 && ex2.adaModal, err: ex2 && ex2.fatal }));
  ok('Mode SEGMENT aktif saat ekspor film utuh (bukan buffer raksasa)', ex2 && ex2.segOn === true, 'segOn=' + (ex2 && ex2.segOn));
  ok('Tombol MUSIK OTOMATIS diklik → skor tersusun (dibatasi 300 dtk)', ex2 && ex2.musikDiklik && ex2.musik === true, 'musik=' + (ex2 && ex2.musik));
  ok('Ekspor 1 part film utuh selesai', ex2 && ex2.n === 1 && ex2.silent.length === 1 && ex2.silent[0] === false, JSON.stringify({ n: ex2 && ex2.n, silent: ex2 && ex2.silent, err: ex2 && ex2.fatal }));
  ok('Modal hasil: status SUARA BERNADA + versi KINOSTRA', ex2 && /SUARA: BERNADA/.test(ex2.hasil) && /KINOSTRA v\d+\.\d+\.\d+/.test(ex2.hasil), (ex2 && ex2.hasil.split('\n').filter(l => /SUARA|KINOSTRA/.test(l)).join(' | ')).slice(0, 140));
  const f2 = fs.readdirSync(OUT2).filter(f => f.endsWith('.mp4'));
  if (f2.length === 1) {
    const v2 = await volDetect(OUT2 + '/' + f2[0]);
    ok('Hasil BERNADA (musik otomatis > −55 dB) — suara hadir di film utuh', v2 > -55, 'max=' + v2 + ' dB · ' + f2[0]);
  } else ok('1 file part tersimpan', false, fs.readdirSync(OUT2).join(', '));

  /* 3 — film utuh BERNADA 66 mnt: rentang AKHIR (3.600–3.783 dtk) via SEGMENT → suara ASLI ikut */
  ok('Film utuh bernada 66 mnt termuat', await loadVideo(cdp, TONE));
  await evalRetry(cdp, `try { stopMusicPreview(); } catch (e) { } state.music.buffer = null; 'ok'`, 10000).catch(() => null);
  const ex3 = await evalOnce(cdp, `(async () => {
    state.rangeStart = 3600; state.rangeEnd = 3783; state.splitSec = 183; state.splitCustom = true; applySplitParts();
    ${SETAN}
    const p = exportPartsToDir(${JSON.stringify(OUT3)}, { title() { }, prog() { }, sub() { } });
    let adaModal = false, segOn = false;
    for (let i = 0; i < 100; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (state._audioSeg && state._audioSeg.on) segOn = true;
      const t = document.querySelector('#mTitle') ? document.querySelector('#mTitle').textContent : '';
      if (t && t.includes('SENYAP')) { adaModal = true; break; }
      if (state.exportFatal) break;
    }
    const res = await p;
    return { n: res.length, adaModal, segOn, silent: res.map(r => !!r.silent), fatal: state.exportFatal ? String(state.exportFatal.message || state.exportFatal).slice(0, 120) : null };
  })()`, 600000);
  ok('Rentang akhir film utuh: mode SEGMENT aktif', ex3 && ex3.segOn === true, 'segOn=' + (ex3 && ex3.segOn) + ' err=' + (ex3 && ex3.fatal));
  ok('Sumber bernada → TIDAK ada gerbang pra-ekspor', ex3 && ex3.adaModal === false, 'adaModal=' + (ex3 && ex3.adaModal));
  ok('Ekspor 1 part rentang akhir selesai', ex3 && ex3.n === 1, 'n=' + (ex3 && ex3.n) + ' err=' + (ex3 && ex3.fatal));
  const f3 = fs.readdirSync(OUT3).filter(f => f.endsWith('.mp4'));
  if (f3.length === 1) {
    const v3 = await volDetect(OUT3 + '/' + f3[0]);
    ok('SUARA ASLI ikut di rentang akhir via SEGMENT (perbaikan akar bug film utuh)', v3 > -55 && v3 < -10, 'max=' + v3 + ' dB · ' + f3[0]);
  } else ok('1 file rentang akhir tersimpan', false, fs.readdirSync(OUT3).join(', '));

  /* 4 — regresi jalur MONOLITIK (rentang kecil → buffer penuh seperti v3.30) */
  const ex4 = await eksporSatu(cdp, OUT4, 0, 183, null);
  ok('Rentang kecil tetap jalur MONOLITIK (buffer penuh v3.30 utuh)', ex4 && !ex4.fatal && await evalRetry(cdp, `!!state.audioBuffer && !state._audioSeg`, 10000) === true, JSON.stringify(ex4));
  const f4 = fs.readdirSync(OUT4).filter(f => f.endsWith('.mp4'));
  if (f4.length === 1) {
    const v4 = await volDetect(OUT4 + '/' + f4[0]);
    ok('Audio monolitik > −55 dB', v4 > -55, 'max=' + v4 + ' dB');
  } else ok('1 file monolitik tersimpan', false, fs.readdirSync(OUT4).join(', '));

  console.log('SELESAI: ' + pass + ' lulus, ' + gagal + ' gagal');
  try { app.kill('SIGKILL'); } catch (e) { }
  process.exit(gagal ? 1 : 0);
} catch (e) {
  console.error('UJI ERROR: ' + ((e && e.message) || e));
  process.exit(2);
}
