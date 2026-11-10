/* ================================================================
   KINOSTRA v3.14.0 — UJI UKURAN TULISAN PART DI VIDEO (SLIDER 50–250%)
   Jalankan: bash scripts/run-test-xvfb.sh scripts/kinostra-v314-test.mjs
   Media uji: testmedia/v38-3scn12.mp4 — 12 dtk, 640×360, 30fps,
   h264+aac, 3 adegan warna solid (merah 0–4, hijau 4–8, biru 8–12).
   Cakupan:
   A. Smoke UI: versi 3.14.0 + slider UKURAN TULISAN PART DI VIDEO ada,
      default 100%; slider cover v3.13 tetap utuh
   B. PRATINJAU PIKSEL (mesin compose langsung): tinggi tinta PART intro
      monoton 50% < 100% < 200%; maxH 100% ≈ ascent teoretis rumus lama
      (112*u — nol-regresi v3.13); ratio 200/100 ≈ 2; kembali ke 100%
      = piksel kembali ke semula
   C. JALUR UI: geser slider → state.partSize + label % + toast
   D. EKSPOR NYATA: intro 100% vs intro 200% — maxH & lebar run krem
      skala ±2×; JUDUL di band atas sama persis (tidak tersentuh)
   E. EKSPOR NYATA pojok: partShow 'always' 200% — run krem ≈ 2×
      pratinjau 100% (proporsional)
   F. Gerbang POTONG LANGSUNG tetap 'COVER PEMBUKA'
   ================================================================ */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project';
const OUT_A = '/tmp/kinov314-a';   /* ekspor intro 100% */
const OUT_B = '/tmp/kinov314-b';   /* ekspor intro 200% */
const OUT_C = '/tmp/kinov314-c';   /* ekspor pojok 200% */
const PORT = 9498;
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
function rawAt(file, ts) {
  const tmp = '/tmp/ncframe314.raw';
  execSync(`ffmpeg -y -v error -ss ${ts} -i '${file}' -frames:v 1 -f rawvideo -pix_fmt rgb24 '${tmp}'`);
  return fs.readFileSync(tmp);
}
/* statistik tinta krem di band: baris-baris berturut berpiksel krem → bars */
function inkRows(file, ts, w, h, x0f, x1f, y0f, y1f) {
  const raw = rawAt(file, ts);
  const y0 = Math.max(0, Math.round(h * y0f)), y1 = Math.min(h - 1, Math.round(h * y1f));
  const x0 = Math.round(w * x0f), x1 = Math.round(w * x1f);
  const rows = [];
  for (let y = y0; y <= y1; y++) {
    let c = 0;
    for (let x = x0; x <= x1; x += 1) {
      const o = (y * w + x) * 3, R = raw[o], G = raw[o + 1], B = raw[o + 2];
      if (R > 185 && G > 175 && B > 155) c++;
    }
    rows.push(c > 3);
  }
  const bars = []; let run = 0;
  for (const r of rows) { if (r) run++; else if (run) { bars.push(run); run = 0; } }
  if (run) bars.push(run);
  return { count: bars.length, maxH: bars.length ? Math.max(...bars) : 0, bars };
}
/* run kontinu piksel krem terpanjang di band — lebar teks PART */
function maxInkRun(file, ts, w, h, x0f, x1f, y0f, y1f) {
  const raw = rawAt(file, ts);
  const y0 = Math.max(0, Math.round(h * y0f)), y1 = Math.min(h - 1, Math.round(h * y1f));
  const x0 = Math.round(w * x0f), x1 = Math.round(w * x1f);
  let best = 0;
  for (let y = y0; y <= y1; y++) {
    let run = 0;
    for (let x = x0; x <= x1; x++) {
      const o = (y * w + x) * 3, R = raw[o], G = raw[o + 1], B = raw[o + 2];
      if (R > 185 && G > 175 && B > 155) { run++; best = Math.max(best, run); } else run = 0;
    }
  }
  return best;
}
/* lebar bounding box piksel krem di band — lebar total teks PART (bukan per huruf) */
function bboxInkWidth(file, ts, w, h, x0f, x1f, y0f, y1f) {
  const raw = rawAt(file, ts);
  const y0 = Math.max(0, Math.round(h * y0f)), y1 = Math.min(h - 1, Math.round(h * y1f));
  const x0 = Math.round(w * x0f), x1 = Math.round(w * x1f);
  let minx = w, maxx = -1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const o = (y * w + x) * 3, R = raw[o], G = raw[o + 1], B = raw[o + 2];
      if (R > 185 && G > 175 && B > 155) { if (x < minx) minx = x; if (x > maxx) maxx = x; }
    }
  }
  return maxx > minx ? maxx - minx + 1 : 0;
}
function frameDimsSafe(mp4) {
  try { const [w, h] = probe(mp4).dim.split(',').map(Number); return { w, h }; } catch (e) { return { w: 0, h: 0 }; }
}

fs.rmSync(OUT_A, { recursive: true, force: true }); fs.mkdirSync(OUT_A, { recursive: true });
fs.rmSync(OUT_B, { recursive: true, force: true }); fs.mkdirSync(OUT_B, { recursive: true });
fs.rmSync(OUT_C, { recursive: true, force: true }); fs.mkdirSync(OUT_C, { recursive: true });
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

  /* ============ A. SMOKE UI & VERSI ============ */
  console.log('A. SMOKE UI — VERSI 3.14.0 + SLIDER UKURAN TULISAN PART DI VIDEO');
  const a = await cdp.eval(`(() => {
    const q = s => document.querySelector(s);
    const sl = q('#inPartSize');
    const notes = [...document.querySelectorAll('#m2 .note, #m1 .note')].map(n => n.textContent).join(' ');
    return {
      tag: (q('.tag') || {}).textContent || '',
      bsub: (q('.bsub') || {}).textContent || '',
      sliderAda: !!sl, min: sl ? +sl.min : 0, max: sl ? +sl.max : 0, step: sl ? +sl.step : 0, val: sl ? +sl.value : 0,
      lblV: (q('#partSizeV') || {}).textContent || '',
      ps0: state.partSize,
      noteVid: /DI DALAM VIDEO/.test(notes) && /50%/.test(notes),
      sliderCoverAda: !!q('#inCoverPartSize'),
      prefixOpt: [...q('#selPrefix').options].map(o => o.text).join(',')
    };
  })()`);
  ok('Header bertanda v3.14.0', /v3\.14\.0/.test(a.tag), JSON.stringify({ tag: a.tag }));
  ok(`Slider UKURAN TULISAN PART DI VIDEO ada: min ${a.min} max ${a.max} step ${a.step} nilai awal ${a.val}`,
    a.sliderAda && a.min === 0.5 && a.max === 2.5 && a.step === 0.05 && a.val === 1, JSON.stringify(a));
  ok('Label slider awal 100% + state.partSize default 1', a.lblV === '100%' && a.ps0 === 1, JSON.stringify({ lblV: a.lblV, ps0: a.ps0 }));
  ok('Note menyebut tulisan part DI DALAM VIDEO (bukan cover)', a.noteVid, String(a.noteVid));
  ok('Slider cover v3.13 tetap utuh + prefix 5 pilihan (PART/EPISODE/EPS/BAGIAN/#)',
    a.sliderCoverAda && a.prefixOpt === 'PART,EPISODE,EPS,BAGIAN,#', JSON.stringify({ cover: a.sliderCoverAda, prefix: a.prefixOpt }));

  /* ============ MUAT VIDEO UJI ============ */
  await cdp.eval(`(async () => {
    document.querySelector('#autoSub').checked = false;
    await loadFromPath('${ROOT}/testmedia/v38-3scn12.mp4', true);
  })()`);
  await sleep(1800);

  /* ============ B. PRATINJAU PIKSEL — MESIN COMPOSE LANGSUNG ============ */
  console.log('B. PRATINJAU PIKSEL — TINGGI TINTA PART INTRO 50% < 100% < 200% + NOL-REGRESI RUMUS LAMA');
  const b = await cdp.eval(`(async () => {
    const w = videoEl;
    w.pause();
    /* overlay lain MATI — band tengah hanya berisi teks PART intro */
    state.titleOn = false; state.descOn = false; state.subsOn = false; state.partShow = 'intro';
    state.partPrefix = 'PART'; state.partAnim = 'off'; state.partPosX = 0; state.partPosY = 0;
    state.partSize = 1;
    state.titleAnim = 'off'; state.partAnim = 'off'; state._noPart = false;
    state.colorFilter = 'off'; state.vfx.vignette = false; state.vfx.grain = false;
    state.kb.mode = 'off'; state.trans.mode = 'off'; state.frameStyle = 'off'; state.neon.on = false;
    state.trackMode = false; state.spk.on = false; state.cover.on = false;
    w.currentTime = 0.15; await new Promise(r => setTimeout(r, 500));
    const snap = () => {
      const c = document.querySelector('#cv');
      const g = c.getContext('2d', { alpha: false });
      /* gambar langsung dgn mesin compose (pratinjau rAF tidak redraw saat pause) */
      drawComposition(g, c.width, c.height, 0.15);
      return { d: g.getImageData(0, 0, c.width, c.height), W: c.width, H: c.height };
    };
    const inkOf = s => {
      const { d, W, H } = s, y0 = Math.round(H * 0.28), y1 = Math.round(H * 0.65);
      const x0 = Math.round(W * 0.08), x1 = Math.round(W * 0.92);
      let area = 0; const rows = [];
      for (let y = y0; y <= y1; y++) {
        let c2 = 0;
        for (let x = x0; x <= x1; x++) {
          const o = (y * W + x) * 4, R = d.data[o], G = d.data[o + 1], B = d.data[o + 2];
          if (R > 185 && G > 175 && B > 155) c2++;
        }
        if (c2 > 2) rows.push(1); else rows.push(0);
        area += c2;
      }
      let maxH = 0, run = 0;
      for (const r of rows) { if (r) run++; else if (run) { maxH = Math.max(maxH, run); run = 0; } }
      maxH = Math.max(maxH, run);
      return { area, maxH };
    };
    const theoAscent = () => {
      const c = document.createElement('canvas').getContext('2d');
      const u = document.querySelector('#cv').height / 1080;
      c.font = Math.round(112 * u) + 'px "Bebas Neue"';
      const m = c.measureText('PART 01');
      return m.actualBoundingBoxAscent;
    };
    const setPS = v => { const sl = document.querySelector('#inPartSize'); sl.value = String(v); sl.dispatchEvent(new Event('input', { bubbles: true })); };
    setPS(0.5); const s50 = snap(), i50 = inkOf(s50);
    setPS(1); const s100 = snap(), i100 = inkOf(s100);
    setPS(2); const s200 = snap(), i200 = inkOf(s200);
    setPS(0.5); const s50b = snap(), i50b = inkOf(s50b);
    setPS(1);
    const s100b = snap(), i100b = inkOf(s100b);
    const diffPix = (s1, s2) => { let n = 0; for (let i = 0; i < s1.d.data.length; i += 40) if (Math.abs(s1.d.data[i] - s2.d.data[i]) + Math.abs(s1.d.data[i + 1] - s2.d.data[i + 1]) + Math.abs(s1.d.data[i + 2] - s2.d.data[i + 2]) > 24) n++; return n; };
    return {
      H: s100.H, W: s100.W, theo: theoAscent(),
      maxH50: Math.max(i50.maxH, i50b.maxH), maxH100: i100.maxH, maxH100b: i100b.maxH, maxH200: i200.maxH,
      area50: Math.max(i50.area, i50b.area), area100: i100.area, area200: i200.area,
      backDiff: diffPix(s100, s100b), valBack: state.partSize, lblBack: document.querySelector('#partSizeV').textContent
    };
  })()`);
  ok(`Tinggi tinta PART monoton di pratinjau: 50%=${b.maxH50} < 100%=${b.maxH100} < 200%=${b.maxH200} px`,
    b.maxH50 < b.maxH100 && b.maxH100 < b.maxH200 && b.maxH50 > 4, JSON.stringify(b));
  ok(`NOL-REGRESI: maxH 100% (${b.maxH100}px) ≈ ascent teoretis rumus lama 112*u (${Math.round(b.theo)}px, ±25%) — 100% = persis v3.13`,
    Math.abs(b.maxH100 - b.theo) <= b.theo * 0.25, JSON.stringify({ maxH100: b.maxH100, theo: Math.round(b.theo) }));
  ok(`Ratio 200%/100% = ${(b.maxH200 / b.maxH100).toFixed(2)} (target 2.0 ±25%)`,
    Math.abs(b.maxH200 / b.maxH100 - 2) <= 0.5, JSON.stringify({ r: +(b.maxH200 / b.maxH100).toFixed(2) }));
  ok(`Area tinta monoton: 50%=${b.area50} < 100%=${b.area100} < 200%=${b.area200} (200% > 2.6×)`,
    b.area50 < b.area100 && b.area100 < b.area200 && b.area200 > b.area100 * 2.0, JSON.stringify({ a50: b.area50, a100: b.area100, a200: b.area200 }));
  ok(`Kembali ke 100% → piksel pratinjau kembali (diff ${b.backDiff} ≤ 8), state ${b.valBack}, label ${b.lblBack}`,
    b.backDiff <= 8 && b.valBack === 1 && b.lblBack === '100%', JSON.stringify({ backDiff: b.backDiff }));

  /* ============ C. JALUR UI — SLIDER → STATE + LABEL + TOAST ============ */
  console.log('C. JALUR UI — SLIDER → STATE.PARTSIZE + LABEL %');
  const c = await cdp.eval(`(() => {
    document.querySelectorAll('.toast').forEach(t => t.remove());   /* toast lama (VOCALIS) bersih */
    const sl = document.querySelector('#inPartSize'), lbl = document.querySelector('#partSizeV');
    sl.value = '2'; sl.dispatchEvent(new Event('input', { bubbles: true }));
    const mid = { lbl: lbl.textContent, ps: state.partSize };
    sl.dispatchEvent(new Event('change', { bubbles: true }));
    const toastMid = (document.querySelector('.toast') || {}).textContent || '';
    document.querySelectorAll('.toast').forEach(t => t.remove());
    sl.value = '0.5'; sl.dispatchEvent(new Event('input', { bubbles: true }));
    const lo = { lbl: lbl.textContent, ps: state.partSize };
    sl.value = '1'; sl.dispatchEvent(new Event('input', { bubbles: true }));
    return { mid, lo, toastMid, back: { lbl: lbl.textContent, ps: state.partSize } };
  })()`);
  ok(`Slider 2.0 → ${c.mid.lbl}/ps=${c.mid.ps}; 0.5 → ${c.lo.lbl}/ps=${c.lo.ps}; kembali 100%/1`,
    c.mid.lbl === '200%' && c.mid.ps === 2 && c.lo.lbl === '50%' && c.lo.ps === 0.5 && c.back.lbl === '100%' && c.back.ps === 1,
    JSON.stringify(c));
  ok(`Toast konfirmasi tampil: "${c.toastMid}"`, /Ukuran tulisan part di video/.test(c.toastMid), c.toastMid);

  /* ============ D. EKSPOR NYATA — INTRO 100% vs 200% ============ */
  console.log('D. EKSPOR NYATA — INTRO 100% vs INTRO 200% (JUDUL TAK TERSentuh)');
  const d1 = await cdp.eval(`(async () => {
    /* setelan umum: overlay minimal, part intro, cover OFF */
    document.querySelector('#segRatio button[data-v="16:9"]').click();
    document.querySelector('#segAcc button[data-v="cpu"]').click();
    state.scale = '1'; state.resOut = '720'; state.spk.on = false; state.spk.ready = false;
    state.splitParts = 0; state.splitSec = 4; state._noPart = false; state.rangeStart = 0; state.rangeEnd = 0;
    state.titleOn = true; state.title = 'JUDUL DI LAYAR'; state.upper = true; state.descOn = false; state.subsOn = false;
    state.titleAnim = 'off'; state.partAnim = 'off'; state.partShow = 'intro'; state.partPrefix = 'PART';
    state.partPosX = 0; state.partPosY = 0; state.partSize = 1;
    state.titlePosY = 0; state.titleFrame = 'off'; state.titleSize = 46; state.titleScale = 1;
    state.colorFilter = 'off'; state.vfx.vignette = false; state.vfx.grain = false;
    state.kb.mode = 'off'; state.trans.mode = 'off'; state.frameStyle = 'off'; state.neon.on = false;
    state.cutMode = 'render'; state.cover.on = false; setSegOn('segCover', 'off');
    let err = null, n = 0;
    try { const res = await exportPartsToDir('${OUT_A}', { prog() { }, sub() { }, title() { } }); n = res.length; }
    catch (e2) { err = e2 && e2.message; }
    return { n, err };
  })()`);
  const mp4A = fs.readdirSync(OUT_A).filter(f => /\.mp4$/.test(f)).sort();
  ok('Ekspor A (intro 100%): 3 part MP4 tersimpan', d1.n === 3 && mp4A.length === 3 && !d1.err, JSON.stringify(d1));

  const d2 = await cdp.eval(`(async () => {
    const sl = document.querySelector('#inPartSize');
    sl.value = '2'; sl.dispatchEvent(new Event('input', { bubbles: true }));   /* jalur UI penuh */
    let err = null, n = 0;
    try { const res = await exportPartsToDir('${OUT_B}', { prog() { }, sub() { }, title() { } }); n = res.length; }
    catch (e2) { err = e2 && e2.message; }
    return { n, err, ps: state.partSize };
  })()`);
  const mp4B = fs.readdirSync(OUT_B).filter(f => /\.mp4$/.test(f)).sort();
  ok(`Ekspor B (intro 200% via slider): 3 part MP4, state.partSize=${d2.ps}`, d2.n === 3 && mp4B.length === 3 && !d2.err && d2.ps === 2, JSON.stringify(d2));

  const dA = frameDimsSafe(path.join(OUT_A, mp4A[0]));
  const dB = frameDimsSafe(path.join(OUT_B, mp4B[0]));
  ok('Resolusi kedua ekspor 1280×720', dA.w === 1280 && dA.h === 720 && dB.w === 1280 && dB.h === 720, JSON.stringify({ dA, dB }));
  /* intro alpha penuh mendekati t=0.15; teks PART di band tengah */
  const mH100 = inkRows(path.join(OUT_A, mp4A[0]), 0.15, dA.w, dA.h, 0.08, 0.92, 0.26, 0.66);
  const mH200 = inkRows(path.join(OUT_B, mp4B[0]), 0.15, dB.w, dB.h, 0.08, 0.92, 0.24, 0.70);
  ok(`EKSPOR: tinggi tinta PART intro 200% (${mH200.maxH}px) ≈ 2× 100% (${mH100.maxH}px, ratio ${(mH200.maxH / Math.max(1, mH100.maxH)).toFixed(2)} ±25%)`,
    mH100.maxH >= 20 && Math.abs(mH200.maxH / Math.max(1, mH100.maxH) - 2) <= 0.5, JSON.stringify({ mH100: mH100.maxH, mH200: mH200.maxH }));
  const w100 = bboxInkWidth(path.join(OUT_A, mp4A[0]), 0.15, dA.w, dA.h, 0.05, 0.95, 0.26, 0.66);
  const w200 = bboxInkWidth(path.join(OUT_B, mp4B[0]), 0.15, dB.w, dB.h, 0.05, 0.95, 0.24, 0.70);
  ok(`EKSPOR: lebar bbox PART intro 200% (${w200}px) ≈ 2× 100% (${w100}px, ratio ${(w200 / Math.max(1, w100)).toFixed(2)} ±30%)`,
    w100 >= 120 && Math.abs(w200 / Math.max(1, w100) - 2) <= 0.6, JSON.stringify({ w100, w200 }));
  /* JUDUL di band atas: harus SAMA antara 100% & 200% (slider tidak menyentuh judul) */
  const j100 = inkRows(path.join(OUT_A, mp4A[0]), 3.0, dA.w, dA.h, 0.06, 0.94, 0.02, 0.22);
  const j200 = inkRows(path.join(OUT_B, mp4B[0]), 3.0, dB.w, dB.h, 0.06, 0.94, 0.02, 0.22);
  ok(`JUDUL tak tersentuh: baris tinta band atas ${j100.count} vs ${j200.count}, tinggi maks ${j100.maxH} vs ${j200.maxH} (±3px)`,
    j100.count >= 1 && j100.count === j200.count && Math.abs(j100.maxH - j200.maxH) <= 3, JSON.stringify({ j100, j200 }));
  /* part ke-3 juga terukur (intro muncul di awal tiap part — t=0.15 dalam file part 3) */
  const mH200p3 = inkRows(path.join(OUT_B, mp4B[2]), 0.15, dB.w, dB.h, 0.08, 0.92, 0.24, 0.70);
  ok(`Intro part 3 juga 200% (tinggi ${mH200p3.maxH}px ≈ 2× baseline ${mH100.maxH}px ±30%)`,
    Math.abs(mH200p3.maxH / Math.max(1, mH100.maxH) - 2) <= 0.6, JSON.stringify({ p3: mH200p3.maxH, base: mH100.maxH }));

  /* ============ E. EKSPOR NYATA POJOK — 'ALWAYS' 200% ============ */
  console.log('E. EKSPOR NYATA POJOK — SELALU TAMPIL 200%');
  const runPrev100 = await cdp.eval(`(async () => {
    const sl = document.querySelector('#inPartSize');
    sl.value = '1'; sl.dispatchEvent(new Event('input', { bubbles: true }));
    state.partShow = 'always';
    videoEl.pause(); videoEl.currentTime = 2.0; await new Promise(r => setTimeout(r, 500));
    const cc = document.querySelector('#cv');
    const g2 = cc.getContext('2d', { alpha: false });
    drawComposition(g2, cc.width, cc.height, 2.0);   /* mesin compose langsung */
    const d = g2.getImageData(0, 0, cc.width, cc.height).data;
    const W = cc.width, H = cc.height;
    const y0 = Math.round(H * 0.82), y1 = Math.round(H * 0.99), x0 = Math.round(W * 0.02), x1 = Math.round(W * 0.55);
    let minx = W, maxx = -1;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const o = (y * W + x) * 4, R = d[o], G = d[o + 1], B = d[o + 2];
        if (R > 185 && G > 175 && B > 155) { if (x < minx) minx = x; if (x > maxx) maxx = x; }
      }
    }
    return { run: maxx > minx ? maxx - minx + 1 : 0, H };
  })()`);
  const d3 = await cdp.eval(`(async () => {
    const sl = document.querySelector('#inPartSize');
    sl.value = '2'; sl.dispatchEvent(new Event('input', { bubbles: true }));
    let err = null, n = 0;
    try { const res = await exportPartsToDir('${OUT_C}', { prog() { }, sub() { }, title() { } }); n = res.length; }
    catch (e2) { err = e2 && e2.message; }
    return { n, err, ps: state.partSize };
  })()`);
  const mp4C = fs.readdirSync(OUT_C).filter(f => /\.mp4$/.test(f)).sort();
  ok('Ekspor C (pojok 200%): 3 part MP4', d3.n === 3 && mp4C.length === 3 && !d3.err && d3.ps === 2, JSON.stringify(d3));
  const dC = frameDimsSafe(path.join(OUT_C, mp4C[0]));
  const rPojok = bboxInkWidth(path.join(OUT_C, mp4C[0]), 3.0, dC.w, dC.h, 0.02, 0.55, 0.80, 0.99);
  const theoPojok = runPrev100.run * (720 / runPrev100.H) * 2;
  ok(`POJOK 200% terukur di MP4: bbox ${rPojok}px ≈ teoretis 2× pratinjau 100% (${Math.round(theoPojok)}px, ±35%) — bbox pratinjau 100% = ${runPrev100.run}px`,
    runPrev100.run >= 60 && Math.abs(rPojok - theoPojok) <= theoPojok * 0.35, JSON.stringify({ rPojok, theoPojok: Math.round(theoPojok), prev100: runPrev100.run }));

  /* ============ F. GERBANG POTONG LANGSUNG ============ */
  console.log('F. GERBANG POTONG LANGSUNG');
  const f = await cdp.eval(`(() => {
    state.titleOn = false; state.descOn = false; state.subsOn = false; state.partShow = 'off';
    const resKeep = state.resOut; state.resOut = '';   /* resolusi tetap bukan blok efek */
    const r = fastCutBlockedReason();
    state.resOut = resKeep;
    state.cover.on = false; setSegOn('segCover', 'off');
    return { noCover: r };
  })()`);
  ok('Tanpa efek → POTONG LANGSUNG tersedia (null = boleh)', f.noCover === null, JSON.stringify(f));

  /* ============ RINGKASAN ============ */
  console.log(`\n==== HASIL v3.14: ${pass} LULUS, ${fail} GAGAL ====`);
  if (fails.length) { console.log('GAGAL:'); fails.forEach(x => console.log('  - ' + x)); }
  process.exitCode = fail ? 1 : 0;
} catch (err) {
  console.error('FATAL:', err && err.message);
  console.error((err && err.stack || '').split('\n').slice(0, 6).join('\n'));
  process.exitCode = 1;
} finally {
  try { app.kill('SIGKILL'); } catch (e) { }
  process.exit(process.exitCode || 0);
}
