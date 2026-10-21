/* ================================================================
   KINOSTRA v3.6.1 — UJI TULISAN PART DI SAMPUL (modul 08B) — Xvfb+CDP
   Jalankan: DISPLAY=:99 node scripts/kinostra-v361-test.mjs
   Sampul uji: kanvas hijau polos 0x00B140 (640×360) → label krem
   #F2E8D5 + garis hitam di y≈0.945·H bisa dibuktikan matematis.
   Cakupan:
   A. Smoke UI: chip TULISAN PART (TANPA/PART/EPISODE/EPS/BAGIAN/#),
      default PART, state.cover.part
   B. Ganti label: EPS → TANPA → # → PART (state + chip ikut)
   C. Unit pixel drawCoverFrame: TANPA = strip bawah hijau murni;
      PART 1 = ada pixel krem terang + garis hitam; "PART 1" ≠ "PART 2";
      coverPartText() benar utk semua format
   D. EKSPOR NYATA SPLIT 2 PART + label PART: kedua part 6 dtk, strip
      bawah tiap part berisi label, label PART_01 ≠ PART_02, konten utuh
   D2. EKSPOR label TANPA: strip bawah hijau murni (label benar-benar off)
   E. GABUNG + label aktif: cover gabungan POLOS tanpa nomor (sesuai
      desain — gabungan bukan part)
   ================================================================ */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project';
const OUTS = '/tmp/kinov361-split', OUTO = '/tmp/kinov361-one', OUTM = '/tmp/kinov361-merge';
const PORT = 9461;
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
    dur: +execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 '${mp4}'`).toString().trim()
  };
}
function frameDims(mp4) {
  const [w, h] = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 '${mp4}'`).toString().trim().split(',').map(Number);
  return { w, h };
}
/* raw frame penuh (rgb24) utk analisis strip bawah */
function rawAt(file, ts) {
  return execSync(`ffmpeg -v error -ss ${ts} -i '${file}' -frames:v 1 -f rawvideo -pix_fmt rgb24 -`, { maxBuffer: 64e6, encoding: 'buffer' });
}
/* strip bawah (x 25–75%, y 88–99.5%) = wilayah tulisan part:
   hitung pixel KREM terang & pixel GELAP (garis/shadow) */
function stripStats(file, ts, w, h) {
  const raw = rawAt(file, ts);
  const y0 = Math.round(h * 0.88), y1 = Math.min(h - 1, Math.round(h * 0.995));
  const x0 = Math.round(w * 0.25), x1 = Math.round(w * 0.75);
  let bright = 0, dark = 0, n = 0;
  for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) {
    const o = (y * w + x) * 3, R = raw[o], G = raw[o + 1], B = raw[o + 2];
    if (R > 180 && G > 170 && B > 150) bright++;
    else if (R + G + B < 190) dark++;
    n++;
  }
  return { bright, dark, n };
}
/* beda byte antar dua strip (part1 vs part2 → label beda nomor) */
function stripDiff(fileA, tsA, fileB, tsB, w, h) {
  const a = rawAt(fileA, tsA), b = rawAt(fileB, tsB);
  const y0 = Math.round(h * 0.86), y1 = Math.min(h - 1, Math.round(h * 0.999));
  const x0 = Math.round(w * 0.2), x1 = Math.round(w * 0.8);
  let diff = 0;
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
    const o = (y * w + x) * 3;
    if (Math.abs(a[o] - b[o]) > 24 || Math.abs(a[o + 1] - b[o + 1]) > 24 || Math.abs(a[o + 2] - b[o + 2]) > 24) diff++;
  }
  return diff;
}

for (const d of [OUTS, OUTO, OUTM]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
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
  console.log('A. SMOKE UI — CHIP TULISAN PART DI SAMPUL');
  const a = await cdp.eval(`(() => {
    const seg = document.querySelector('#segCoverPart');
    const btns = seg ? [...seg.querySelectorAll('button')] : [];
    return {
      seg: !!seg, n: btns.length, vals: btns.map(b => b.dataset.v),
      defPart: btns.find(b => b.dataset.v === 'PART')?.classList.contains('on'),
      st: state.cover.part, lbl: (document.querySelector('#m8b .mod-h .t') || {}).textContent || ''
    };
  })()`);
  ok('Chip TULISAN PART ada: 6 pilihan TANPA/PART/EPISODE/EPS/BAGIAN/#', a.seg && a.n === 6 && JSON.stringify(a.vals) === JSON.stringify(['', 'PART', 'EPISODE', 'EPS', 'BAGIAN', '#']), JSON.stringify(a.vals));
  ok('Default PART nyala + state.cover.part = "PART"', a.defPart && a.st === 'PART');
  ok('Modul 08B bertanda DIPERBARUI v3.6.1', a.lbl.includes('v3.6.1'), a.lbl);

  /* ============ B. GANTI LABEL ============ */
  console.log('B. GANTI LABEL — EPS → TANPA → # → PART');
  const b = await cdp.eval(`(() => {
    const cl = v => document.querySelector('#segCoverPart button[data-v="' + v + '"]').click();
    const r = {};
    cl('EPS'); r.eps = { st: state.cover.part, on: document.querySelector('#segCoverPart button[data-v="EPS"]').classList.contains('on') };
    cl(''); r.tanpa = { st: state.cover.part, on: document.querySelector('#segCoverPart button[data-v=""]').classList.contains('on') };
    cl('#'); r.hash = { st: state.cover.part };
    cl('PART'); r.part = { st: state.cover.part, on: document.querySelector('#segCoverPart button[data-v="PART"]').classList.contains('on') };
    return r;
  })()`);
  ok('Chip EPS: state ikut "EPS"', b.eps.st === 'EPS' && b.eps.on, JSON.stringify(b.eps));
  ok('TANPA: state jadi "" (label mati)', b.tanpa.st === '' && b.tanpa.on, JSON.stringify(b.tanpa));
  ok('Chip #: state jadi "#"', b.hash.st === '#', JSON.stringify(b.hash));
  ok('Kembali PART: state + chip nyala', b.part.st === 'PART' && b.part.on, JSON.stringify(b.part));

  /* ============ C. UNIT PIXEL drawCoverFrame ============ */
  console.log('C. UNIT PIXEL drawCoverFrame (640×360, sampul hijau)');
  /* pasang dulu sampul hijau uji (jalur asli setCoverFromDataUrl) */
  const cov = await cdp.eval(`(async () => {
    const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360;
    const g = cv.getContext('2d'); g.fillStyle = '#00B140'; g.fillRect(0, 0, 640, 360);
    setCoverFromDataUrl(cv.toDataURL('image/png'), 'COVER_UJI.png');
    await new Promise(r => setTimeout(r, 400));
    return { on: state.cover.on, img: !!state.cover.img };
  })()`);
  ok('Sampul uji hijau terpasang + auto AKTIF', cov.on === true && cov.img === true, JSON.stringify(cov));
  const c = await cdp.eval(`(() => {
    const mk = () => { const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360; return cv.getContext('2d', { willReadFrequently: true }); };
    const strip = (g) => {
      const im = g.getImageData(0, 0, 640, 360).data;
      let bright = 0, dark = 0;
      for (let y = Math.round(360*0.88); y < 358; y += 1) for (let x = 160; x < 480; x += 1) {
        const o = (y * 640 + x) * 4, R = im[o], G = im[o+1], B = im[o+2];
        if (R > 180 && G > 170 && B > 150) bright++;
        else if (R + G + B < 190) dark++;
      }
      return { bright, dark };
    };
    const g0 = mk(); drawCoverFrame(g0, 640, 360, 0);
    const g1 = mk(); drawCoverFrame(g1, 640, 360, 1);
    const g2 = mk(); drawCoverFrame(g2, 640, 360, 2);
    const im1 = g1.getImageData(0, 0, 640, 360).data, im2 = g2.getImageData(0, 0, 640, 360).data;
    let diff = 0;
    for (let y = Math.round(360*0.86); y < 359; y++) for (let x = 128; x < 512; x++) {
      const o = (y * 640 + x) * 4;
      if (Math.abs(im1[o]-im2[o]) > 24 || Math.abs(im1[o+1]-im2[o+1]) > 24 || Math.abs(im1[o+2]-im2[o+2]) > 24) diff++;
    }
    const texts = { p3: coverPartText(3), hash: (state.cover.part = '#', coverPartText(3)), eps: (state.cover.part = 'EPS', coverPartText(3)), tanpa: (state.cover.part = '', coverPartText(3)), nol: (state.cover.part = 'PART', coverPartText(0)) };
    state.cover.part = 'PART';
    return { s0: strip(g0), s1: strip(g1), diff, texts };
  })()`);
  ok('TANPA nomor (partNum 0): strip bawah hijau murni — tanpa pixel krem/gelap', c.s0.bright === 0 && c.s0.dark === 0, JSON.stringify(c.s0));
  ok('PART 1: label tercetak — ada pixel krem terang + garis hitam', c.s1.bright > 80 && c.s1.dark > 15, JSON.stringify(c.s1));
  ok('"PART 1" ≠ "PART 2" (nomor beda → gambar beda)', c.diff > 40, `diff=${c.diff}`);
  ok('coverPartText: PART 3 / #3 / EPS 3 / "" / nol → benar semua', c.texts.p3 === 'PART 3' && c.texts.hash === '#3' && c.texts.eps === 'EPS 3' && c.texts.tanpa === '' && c.texts.nol === '', JSON.stringify(c.texts));

  /* siapkan media + matikan efek utk ekspor deterministik */
  await cdp.eval(`(async () => {
    document.querySelector('#autoSub').checked = false;
    await loadFromPath('${ROOT}/testmedia/v35-2tone.mp4', true);
  })()`);
  await sleep(1400);
  await cdp.eval(`(() => {
    state.titleOn = false; state.descOn = false; state.subsOn = false;
    state.colorFilter = 'off'; state.vfx.vignette = false; state.vfx.grain = false;
    document.querySelector('#segRatio button[data-v="16:9"]').click();
    document.querySelector('#segAcc button[data-v="cpu"]').click();
    state.spk.on = false; state.spk.ready = false;
    document.querySelector('#segCoverDur button[data-v="2"]').click();
    document.querySelector('#segCoverPart button[data-v="PART"]').click();
    const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360;
    const g = cv.getContext('2d'); g.fillStyle = '#00B140'; g.fillRect(0, 0, 640, 360);
    setCoverFromDataUrl(cv.toDataURL('image/png'), 'COVER_UJI.png');
  })()`);
  await sleep(400);

  /* ============ D. EKSPOR NYATA SPLIT 2 PART + LABEL ============ */
  console.log('D. EKSPOR NYATA SPLIT 2 PART — LABEL PART DI BAWAH JUDUL');
  const d = await cdp.eval(`(async () => {
    state.splitParts = 0; state.splitSec = 4; state._noPart = false;
    state.rangeStart = 0; state.rangeEnd = 0; state.cover.on = true;
    await new Promise(r => setTimeout(r, 300));
    const res = await exportPartsToDir('${OUTS}', { prog() { }, sub() { }, title() { } });
    return { n: res.length, names: res.map(r2 => r2.name) };
  })()`);
  const mp4s = fs.readdirSync(OUTS).filter(f => /\.mp4$/.test(f)).sort();
  ok('2 part MP4 tersimpan (split 4 dtk + cover 2 dtk)', d.n === 2 && mp4s.length === 2, JSON.stringify({ d, mp4s }));
  const prs = mp4s.map(f2 => probe(path.join(OUTS, f2)));
  ok('KEDUA part durasi = 4 + 2 = 6 dtk', prs.every(p => Math.abs(p.dur - 6) < 0.7), JSON.stringify(prs.map(p => +p.dur.toFixed(2))));
  const dm = frameDims(path.join(OUTS, mp4s[0]));
  const st1 = stripStats(path.join(OUTS, mp4s[0]), 0.2, dm.w, dm.h);
  const st2 = stripStats(path.join(OUTS, mp4s[1]), 0.2, dm.w, dm.h);
  ok('PART_01 @0.2: strip bawah berisi LABEL (krem + garis hitam)', st1.bright > 60 && st1.dark > 10, JSON.stringify(st1));
  ok('PART_02 @0.2: strip bawah berisi LABEL juga (cover ikut tiap part)', st2.bright > 60 && st2.dark > 10, JSON.stringify(st2));
  const sdiff = stripDiff(path.join(OUTS, mp4s[0]), 0.2, path.join(OUTS, mp4s[1]), 0.2, dm.w, dm.h);
  ok('Label PART_01 ≠ PART_02 (nomor benar-benar beda per file)', sdiff > 500, `diff=${sdiff}`);
  const ct = (() => { const raw = rawAt(path.join(OUTS, mp4s[0]), 3.5);
    const avg = (x0, x1) => { let R = 0, G = 0, B = 0, n = 0; for (let y = dm.h * 0.25 | 0; y < dm.h * 0.75; y += 3) for (let x = Math.round(x0); x < Math.round(x1); x += 3) { const o = (y * dm.w + x) * 3; R += raw[o]; G += raw[o + 1]; B += raw[o + 2]; n++; } return { R: Math.round(R / n), G: Math.round(G / n), B: Math.round(B / n) }; };
    return { left: avg(0, dm.w / 3), right: avg(2 * dm.w / 3, dm.w) }; })();
  ok('Konten utuh @3.5 (kiri merah / kanan biru) — label tak ganggu video', ct.left.R > 120 && ct.left.R > ct.left.B && ct.right.B > 120 && ct.right.B > ct.right.R, JSON.stringify(ct));

  /* ============ D2. LABEL TANPA → EKSPOR POLOS ============ */
  console.log('D2. LABEL TANPA — COVER POLOS TANPA NOMOR');
  const d2 = await cdp.eval(`(async () => {
    document.querySelector('#segCoverPart button[data-v=""]').click();
    state.splitParts = 0; state.splitSec = 30; state._noPart = true;
    await new Promise(r => setTimeout(r, 300));
    const res = await exportPartsToDir('${OUTO}', { prog() { }, sub() { }, title() { } });
    return { n: res.length, part: state.cover.part };
  })()`);
  const mp4o = fs.readdirSync(OUTO).filter(f2 => /\.mp4$/.test(f2))[0];
  const pro = probe(path.join(OUTO, mp4o));
  ok('1 part utuh 8+2 = 10 dtk (label TANPA tetap ekspor normal)', d2.n === 1 && Math.abs(pro.dur - 10) < 0.8 && d2.part === '', JSON.stringify({ d2, dur: +pro.dur.toFixed(2) }));
  const dmo = frameDims(path.join(OUTO, mp4o));
  const sto = stripStats(path.join(OUTO, mp4o), 0.2, dmo.w, dmo.h);
  ok('Strip bawah @0.2 = hijau murni (tidak ada label tercetak)', sto.bright === 0 && sto.dark === 0, JSON.stringify(sto));

  /* ============ E. GABUNG + LABEL AKTIF → COVER POLOS ============ */
  console.log('E. GABUNG VIDEO — COVER GABUNGAN POLOS WALAU LABEL AKTIF');
  const e = await cdp.eval(`(async () => {
    document.querySelector('#segCoverPart button[data-v="PART"]').click();
    state.splitSec = 30; state._noPart = true;
    const res = await exportMergeToDir(['${ROOT}/testmedia/short-a.mp4', '${ROOT}/testmedia/short-b.mp4'], '${OUTM}', { prog() { }, sub() { } });
    return { n: res.length, part: state.cover.part };
  })()`);
  const mp4m = fs.readdirSync(OUTM).filter(x => /\.mp4$/.test(x))[0];
  const prm = probe(path.join(OUTM, mp4m));
  ok('Gabungan tersimpan, durasi 2 + 3 + 3 = 8 dtk', e.n === 1 && Math.abs(prm.dur - 8) < 0.8, `dur=${prm.dur.toFixed(2)}`);
  const dmm = frameDims(path.join(OUTM, mp4m));
  const stm = stripStats(path.join(OUTM, mp4m), 0.2, dmm.w, dmm.h);
  ok('Cover gabungan @0.2 POLOS (tanpa nomor part — sesuai desain)', stm.bright === 0 && stm.dark === 0, JSON.stringify(stm));

  /* rapikan state */
  await cdp.eval(`state.cover.on = false; state.cover.part = 'PART'; state._noPart = false;`);

  /* ---------- ringkasan ---------- */
  console.log(`\n===== HASIL: ${pass} LULUS, ${fail} GAGAL =====`);
  if (fails.length) { console.log('Gagal:'); fails.forEach(x => console.log('  - ' + x)); process.exit(1); }
} catch (e2) {
  console.error('FATAL:', e2.message);
  process.exit(2);
} finally {
  try { app.kill('SIGKILL'); } catch (e2) { }
}
process.exit(0);
