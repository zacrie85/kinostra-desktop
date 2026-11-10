/* ================================================================
   KINOSTRA v3.9.0 — UJI FRAME JUDUL DI VIDEO + POTONG LANGSUNG
   Jalankan: bash scripts/run-test-xvfb.sh scripts/kinostra-v39-test.mjs
   Cakupan:
   A. Smoke UI: 11 chip FRAME JUDUL (TANPA + 10 gaya), MODE PROSES
      (RENDER PENUH/POTONG LANGSUNG), GAYA TAMPIL PART + TANPA LABEL,
      header v3.9.0
   B. FRAME JUDUL DI VIDEO: EMAS KLASIK + judul di PALING BAWAH →
      amber & teks terbakar di pita bawah, area atas bersih; GRADASI +
      judul di paling atas (kontras)
   C. POTONG LANGSUNG: 3 part dari video 60 dtk TANPA re-encode —
      flag fast, resolusi = sumber, durasi pas keyframe, decode bersih,
      audio ikut rentang video, jauh lebih cepat dari render
   D. FALLBACK OTOMATIS: cutMode fast + judul aktif → render penuh
      (hasil tanpa flag fast), fastCutBlockedReason() benar
   E. PART PALING ATAS: partShow SELALU + partPosY −1 → label PART
      pindah ke pita paling atas, pita bawah bersih
   ================================================================ */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project';
const OUTA = '/tmp/kinov39-frame', OUTB = '/tmp/kinov39-fast', OUTC = '/tmp/kinov39-fallback', OUTD = '/tmp/kinov39-parttop';
const PORT = 9491;
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
  async eval(expr, timeoutMs = 420000) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: timeoutMs });
    if (r.exceptionDetails) throw new Error('PAGE-ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 600));
    return r.result.value;
  }
}

function probe(mp4) {
  return {
    dim: execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 '${mp4}'`).toString().trim(),
    dur: +execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 '${mp4}'`).toString().trim(),
    vdur: +(execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=duration -of csv=p=0 '${mp4}'`).toString().trim() || 0),
    adur: +(execSync(`ffprobe -v error -select_streams a:0 -show_entries stream=duration -of csv=p=0 '${mp4}'`).toString().trim() || 0)
  };
}
function decodeClean(file) {
  const out = execSync(`ffmpeg -v error -i '${file}' -f null - 2>&1`, { maxBuffer: 32e6 }).toString().trim();
  return out === '' ? '' : out.slice(0, 160);
}
function rawAt(file, ts) {
  return execSync(`ffmpeg -v error -ss ${ts} -i '${file}' -frames:v 1 -f rawvideo -pix_fmt rgb24 -`, { maxBuffer: 64e6, encoding: 'buffer' });
}
function bandStats(file, ts, w, h, x0f, x1f, y0f, y1f) {
  const raw = rawAt(file, ts);
  const y0 = Math.round(h * y0f), y1 = Math.min(h - 1, Math.round(h * y1f));
  const x0 = Math.round(w * x0f), x1 = Math.round(w * x1f);
  let bright = 0, dark = 0, amber = 0, n = 0;
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
    const o = (y * w + x) * 3, R = raw[o], G = raw[o + 1], B = raw[o + 2];
    if (R > 180 && G > 170 && B > 150) bright++;
    else if (R + G + B < 190) dark++;
    if (R > 140 && G > 90 && G < 215 && B < 115 && R - B > 60) amber++;
    n++;
  }
  return { bright, dark, amber, n };
}

for (const d of [OUTA, OUTB, OUTC, OUTD]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
console.log('Menjalankan Electron (Xvfb)…');
const app = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu-sandbox'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }
});
process.on('exit', () => { try { app.kill('SIGKILL'); } catch (e) { } });

let cdp;
try {
  cdp = await CDP.connect(PORT);
  await cdp.send('Runtime.enable');
  await sleep(2500);
  console.log('CDP tersambung.\n');

  /* ============ A. SMOKE UI ============ */
  console.log('A. SMOKE UI — FRAME JUDUL, MODE PROSES, PART TANPA LABEL');
  const a = await cdp.eval(`(() => ({
    chips: [...document.querySelectorAll('#titleFrameChips button')].map(b => b.dataset.v),
    chipDef: document.querySelector('#titleFrameChips button.on')?.dataset.v,
    cutBtns: [...document.querySelectorAll('#segCutMode button')].map(b => b.dataset.v),
    cutDef: document.querySelector('#segCutMode button.on')?.dataset.v,
    cutStat: document.querySelector('#cutModeStat')?.textContent || '',
    partShowBtns: [...document.querySelectorAll('#segPartShow button')].map(b => b.dataset.v),
    hdr: document.querySelector('header .tag')?.textContent || '',
    boot: document.querySelector('#boot .bsub')?.textContent || '',
    tf: state.titleFrame, cm: state.cutMode
  }))()`);
  ok('Header menunjukkan v3.9.0', a.hdr.includes('v3.9.0'), a.hdr);
  ok('FRAME JUDUL: 11 chip (TANPA + 10 gaya), default TANPA', a.chips.length === 11 && a.chipDef === 'off' && a.tf === 'off', JSON.stringify(a.chips));
  ok('Semua 10 nama gaya tampil', ['garis2', 'kotak', 'bingkai', 'sudut', 'pita', 'sinema', 'neon', 'klasik', 'panel', 'gradasi'].every(k => a.chips.includes(k)), JSON.stringify(a.chips));
  ok('MODE PROSES: RENDER PENUH default + POTONG LANGSUNG tersedia', a.cutBtns.includes('render') && a.cutBtns.includes('fast') && a.cutDef === 'render' && a.cm === 'render', JSON.stringify(a.cutBtns));
  ok('Status mode: RENDER PENUH dgn keterangan efek', /RENDER PENUH/.test(a.cutStat), a.cutStat);
  ok('GAYA TAMPIL PART kini punya TANPA LABEL (off)', a.partShowBtns.includes('off'), JSON.stringify(a.partShowBtns));

  /* ============ B. FRAME JUDUL DI VIDEO + POSISI PALING BAWAH ============ */
  console.log('B. FRAME JUDUL DI VIDEO — EMAS KLASIK DI BAWAH LAYAR');
  await cdp.eval(`(async () => {
    document.querySelector('#autoSub').checked = false;
    await loadFromPath('${ROOT}/testmedia/v38-3scn12.mp4', true);
  })()`);
  await sleep(1500);
  await cdp.eval(`(() => {
    document.querySelector('#segRatio button[data-v="16:9"]').click();
    document.querySelector('#segAcc button[data-v="cpu"]').click();
    state.spk.on = false; state.spk.ready = false;
    state.cover.on = false; state.cover.auto = false;
    state.splitParts = 0; state.splitSec = 12; state.rangeStart = 0; state.rangeEnd = 0;
    state.descOn = false; state.subsOn = false;
    state.partShow = 'off';
    state.colorFilter = 'off'; state.vfx.vignette = false; state.vfx.grain = false;
    state.scale = '0.5';
    state.titleOn = true; state.title = 'SERIAL UJI';
    state.titleFrame = 'klasik'; state.titlePosY = 1;   /* paling bawah */
    state.wm.mode = 'off'; state.neon.on = false; state.frameStyle = 'off';
    state.kb.mode = 'off'; state.trans.mode = 'off'; state.speed = 1;
    updateExportInfo();
    return document.querySelector('#expSum').innerHTML;
  })()`);
  const sumB = await cdp.eval(`document.querySelector('#expSum').innerHTML`);
  ok('Ringkasan tidak menampilkan POTONG LANGSUNG di mode render', !/POTONG LANGSUNG/.test(sumB), sumB.slice(0, 160));
  const tB0 = Date.now();
  const b = await cdp.eval(`(async () => {
    const res = await exportPartsToDir('${OUTA}', { prog() { }, sub() { }, title() { } });
    return { n: res.length, names: res.map(r => r.name), fast: res.map(r => !!r.fast) };
  })()`);
  ok('1 part dirender (RENDER PENUH, tanpa flag fast)', b.n === 1 && b.fast[0] === false, JSON.stringify(b));
  const mp4A = path.join(OUTA, fs.readdirSync(OUTA).filter(f => /\.mp4$/.test(f))[0]);
  const prA = probe(mp4A);
  ok('Durasi part ≈ 12 dtk (tanpa cover)', Math.abs(prA.dur - 12) < 0.8, prA.dur.toFixed(2));
  const dmA = { w: +prA.dim.split(',')[0], h: +prA.dim.split(',')[1] };
  const botB = bandStats(mp4A, 5.0, dmA.w, dmA.h, 0.15, 0.85, 0.58, 0.995);
  ok('Frame EMAS KLASIK + judul terbakar di PALING BAWAH video (amber & teks terang)', botB.amber > 150 && botB.bright > 150, JSON.stringify(botB));
  const topB = bandStats(mp4A, 5.0, dmA.w, dmA.h, 0.15, 0.85, 0.02, 0.30);
  ok('Area ATAS bersih — judul benar-benar pindah ke bawah (bukan sampul)', topB.amber < 40 && topB.bright < 200, JSON.stringify(topB));
  ok('Decode bersih (frame judul + posisi tidak merusak hasil)', decodeClean(mp4A) === '', decodeClean(mp4A));
  console.log(`  waktu render penuh 1 part 12 dtk: ${((Date.now() - tB0) / 1000).toFixed(1)} dtk`);

  /* kontras: GRADASI di paling atas */
  await cdp.eval(`(() => {
    state.titleFrame = 'gradasi'; state.titlePosY = -1;   /* paling atas */
  })()`);
  await sleep(250);
  const b2 = await cdp.eval(`(async () => {
    state.splitSec = 12; state.rangeStart = 0; state.rangeEnd = 0;
    const res = await exportPartsToDir('${OUTA}', { prog() { }, sub() { }, title() { } });
    return { n: res.length };
  })()`);
  const filesA = fs.readdirSync(OUTA).filter(f => /\.mp4$/)
    .map(f => path.join(OUTA, f)).sort((x, y) => fs.statSync(y).mtimeMs - fs.statSync(x).mtimeMs);
  const mp4A2 = filesA[0];   /* file terbaru = hasil GRADASI */
  const prA2 = probe(mp4A2);
  const dmA2 = { w: +prA2.dim.split(',')[0], h: +prA2.dim.split(',')[1] };
  const topB2 = bandStats(mp4A2, 5.0, dmA2.w, dmA2.h, 0.15, 0.85, 0.02, 0.30);
  ok('Frame GRADASI + judul di PALING ATAS: pita gradasi & teks di pita atas', topB2.amber > 60 && topB2.bright > 150, JSON.stringify(topB2));

  /* ============ C. POTONG LANGSUNG ============ */
  console.log('C. POTONG LANGSUNG — 3 PART TANPA RE-ENCODE');
  const srcInfo = probe(`${ROOT}/testmedia/v32-60s.mp4`);
  await cdp.eval(`(() => {
    state.titleOn = false; state.partShow = 'off'; state.descOn = false; state.subsOn = false;
    state.titleFrame = 'off'; state.titlePosY = 0; state.partPosY = 0;
    state.scale = '1'; state.splitParts = 0; state.splitSec = 20;
    state.rangeStart = 0; state.rangeEnd = 0; state.cuts = [];
    document.querySelector('#segCutMode button[data-v="fast"]').click();
    updateExportInfo();
    return document.querySelector('#cutModeStat').innerHTML;
  })()`);
  const statC = await cdp.eval(`document.querySelector('#cutModeStat').innerHTML`);
  ok('Status mode: SIAP (semua efek mati)', /SIAP/.test(statC), statC);
  const sumC = await cdp.eval(`document.querySelector('#expSum').innerHTML`);
  ok('Ringkasan menampilkan POTONG LANGSUNG', /POTONG LANGSUNG/.test(sumC) && /ASLI/.test(sumC), sumC.slice(0, 200));
  await cdp.eval(`(async () => { await loadFromPath('${ROOT}/testmedia/v32-60s.mp4', true); })()`);
  await sleep(1500);
  await cdp.eval(`state.title = ''; state.autoTitle = false;`);
  const tC0 = Date.now();
  const c = await cdp.eval(`(async () => {
    const res = await exportPartsToDir('${OUTB}', { prog() { }, sub() { }, title() { } });
    return { n: res.length, fast: res.map(r => !!r.fast), names: res.map(r => r.name) };
  })()`);
  const elC = (Date.now() - tC0) / 1000;
  console.log(`  waktu POTONG LANGSUNG 3 part 60 dtk: ${elC.toFixed(2)} dtk`);
  ok('3 part tersimpan & SEMUA berflag fast (tanpa render)', c.n === 3 && c.fast.every(Boolean), JSON.stringify(c));
  const mp4sB = fs.readdirSync(OUTB).filter(f => /\.mp4$/).sort().map(f => path.join(OUTB, f));
  const prs = mp4sB.map(probe);
  ok('Resolusi hasil = resolusi SUMBER (kualitas asli, tidak diturunkan)', prs.every(p => p.dim === srcInfo.dim), JSON.stringify({ src: srcInfo.dim, out: prs.map(p => p.dim) }));
  ok('Part 1 ≈ 20 dtk (batas akhir = sampel pertama ≥ 20 dtk)', prs[0].dur > 19.9 && prs[0].dur < 20.5, prs[0].dur.toFixed(2));
  ok('Part 2 & 3 ≥ 20 dtk dan ≤ 20 + jarak keyframe (≈8.4 dtk)', prs[1].dur >= 19.9 && prs[1].dur <= 29 && prs[2].dur >= 19.9 && prs[2].dur <= 29, JSON.stringify(prs.map(p => +p.dur.toFixed(2))));
  ok('Total isi part menutup seluruh 60 dtk sumber', prs.reduce((a, p) => a + p.dur, 0) >= 59.5, prs.reduce((a, p) => a + p.dur, 0).toFixed(2));
  ok('Audio ikut rentang video tiap part (±0.3 dtk — tanpa awal bisu)', prs.every(p => Math.abs(p.vdur - p.adur) < 0.3), JSON.stringify(prs.map(p => [p.vdur, p.adur].map(x => +x.toFixed(2)))));
  ok('Semua part decode bersih tanpa error', mp4sB.map(decodeClean).every(x => x === ''), mp4sB.map(decodeClean).join(' | ').slice(0, 200));
  ok('POTONG LANGSUNG selesai < 15 dtk utk 60 dtk video (render biasa puluhan dtk)', elC < 15, elC.toFixed(2));

  /* ============ D. FALLBACK OTOMATIS ============ */
  console.log('D. FALLBACK — POTONG LANGSUNG DITOLAK BILA JUDUL AKTIF');
  const d0 = await cdp.eval(`(() => {
    state.titleOn = true; state.title = 'ADA JUDUL';
    updateExportInfo();
    return { blk: fastCutBlockedReason(), stat: document.querySelector('#cutModeStat').innerHTML };
  })()`);
  ok('fastCutBlockedReason() = JUDUL DI VIDEO saat judul aktif', d0.blk === 'JUDUL DI VIDEO', d0.blk);
  ok('Status mode menunjukkan TAK BISA + alasan', /TAK BISA/.test(d0.stat) && /JUDUL DI VIDEO/.test(d0.stat), d0.stat);
  await cdp.eval(`(async () => {
    await loadFromPath('${ROOT}/testmedia/v34-6s.mp4', true);
  })()`);
  await sleep(1400);
  await cdp.eval(`(() => { state.splitParts = 0; state.splitSec = 6; state.rangeStart = 0; state.rangeEnd = 0; state.scale = '0.5'; })()`);
  const d = await cdp.eval(`(async () => {
    const res = await exportPartsToDir('${OUTC}', { prog() { }, sub() { }, title() { } });
    return { n: res.length, fast: res.map(r => !!r.fast) };
  })()`);
  ok('Dengan judul aktif → otomatis RENDER PENUH (hasil tanpa flag fast)', d.n === 1 && d.fast[0] === false, JSON.stringify(d));
  const mp4C = path.join(OUTC, fs.readdirSync(OUTC).filter(f => /\.mp4$/)[0]);
  ok('Hasil fallback tetap valid & bisa di-decode', probe(mp4C).dur > 5 && decodeClean(mp4C) === '', '');

  /* ============ E. PART PALING ATAS ============ */
  console.log('E. POSISI PART — SAMPAI PALING ATAS LAYAR');
  await cdp.eval(`(() => {
    state.titleOn = false; state.partShow = 'always'; state.partPosY = -1; state.partPosX = 0;
    state.cutMode = 'render';
    document.querySelector('#segCutMode button[data-v="render"]').click();
  })()`);
  const e = await cdp.eval(`(async () => {
    const res = await exportPartsToDir('${OUTD}', { prog() { }, sub() { }, title() { } });
    return { n: res.length };
  })()`);
  const mp4D = path.join(OUTD, fs.readdirSync(OUTD).filter(f => /\.mp4$/)[0]);
  const prD = probe(mp4D);
  const dmD = { w: +prD.dim.split(',')[0], h: +prD.dim.split(',')[1] };
  const topE = bandStats(mp4D, 5.0, dmD.w, dmD.h, 0.02, 0.60, 0.01, 0.12);
  const botE = bandStats(mp4D, 5.0, dmD.w, dmD.h, 0.02, 0.95, 0.90, 0.995);
  ok('Label PART tercetak di PALING ATAS (bar amber + teks terang)', topE.amber > 20 && topE.bright > 60, JSON.stringify(topE));
  ok('Pita bawah bersih — bar amber label benar-benar pindah ke atas', botE.amber < 10, JSON.stringify(botE));   /* krem isi video tak dihitung */
  ok('Hasil part atas decode bersih', decodeClean(mp4D) === '', '');

  console.log(`\nHasil: ${pass} lulus, ${fail} gagal`);
  if (fails.length) { console.log('Daftar gagal:'); fails.forEach(f => console.log(' -', f)); }
} catch (e) {
  console.error('FATAL:', e.message);
  fail++;
} finally {
  try { app.kill('SIGKILL'); } catch (e) { }
}
process.exit(fail ? 1 : 0);
