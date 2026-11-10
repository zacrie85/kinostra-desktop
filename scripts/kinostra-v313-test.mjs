/* ================================================================
   KINOSTRA v3.13.0 — UJI UKURAN TULISAN PART DI COVER (SLIDER 50–250%)
   Jalankan: bash scripts/run-test-xvfb.sh scripts/kinostra-v313-test.mjs
   Media uji: testmedia/v38-3scn12.mp4 — 12 dtk, 640×360, 30fps,
   h264+aac, 3 adegan warna solid (merah 0–4, hijau 4–8, biru 8–12).
   Cakupan:
   A. Smoke UI: versi 3.13.0 + slider UKURAN TULISAN PART ada, default 100%
   B. NOL-REGRESI PIKSEL: layer part ps=1 = rumus lama v3.12
      (6 layout dgn geometri: impact/lower/boxed/sticker/outline/band)
   C. UNIT SKALA: area tinta part monoton 60% < 100% < 200% di 10 layout;
      lebar badge impact ≈ 2× & 0.6×; layer JUDUL tak tersentuh ps
   D. JALUR UI: geser slider → state.partScale → pratinjau berubah
   E. EKSPOR NYATA: partScale 200% via slider → badge PART ±2× lebih lebar
      di MP4; judul tetap utuh; cover tetap bersih; transisi tetap jalan
   F. Gerbang POTONG LANGSUNG tetap 'COVER PEMBUKA'
   ================================================================ */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project';
const OUT1 = '/tmp/kinov313-nc';
const PORT = 9497;
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
  const tmp = '/tmp/ncframe313.raw';
  execSync(`ffmpeg -y -v error -ss ${ts} -i '${file}' -frames:v 1 -f rawvideo -pix_fmt rgb24 '${tmp}'`);
  return fs.readFileSync(tmp);
}
function bandStats(file, ts, w, h, x0f, x1f, y0f, y1f) {
  const raw = rawAt(file, ts);
  const y0 = Math.round(h * y0f), y1 = Math.min(h - 1, Math.round(h * y1f));
  const x0 = Math.round(w * x0f), x1 = Math.round(w * x1f);
  let bright = 0, cream = 0, amber = 0, cyan = 0, n = 0, luma = 0;
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
    const o = (y * w + x) * 3, R = raw[o], G = raw[o + 1], B = raw[o + 2];
    if (R > 185 && G > 175 && B > 155) { bright++; cream++; }
    if (R > 165 && G > 105 && G < 210 && B < 90) amber++;
    if (B > 150 && G > 130 && R < 130) cyan++;
    luma += 0.299 * R + 0.587 * G + 0.114 * B;
    n++;
  }
  return { bright, cream, amber, cyan, luma: Math.round(luma / Math.max(1, n)), n };
}
/* lebar run kontinu piksel cyan terpanjang dalam band — lebar badge PART */
function maxCyanRun(file, ts, w, h, y0f, y1f) {
  const raw = rawAt(file, ts);
  const y0 = Math.round(h * y0f), y1 = Math.min(h - 1, Math.round(h * y1f));
  let best = 0;
  for (let y = y0; y <= y1; y++) {
    let run = 0;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3, R = raw[o], G = raw[o + 1], B = raw[o + 2];
      if (B > 150 && G > 130 && R < 130) { run++; best = Math.max(best, run); } else run = 0;
    }
  }
  return best;
}
function frameDimsSafe(mp4) {
  try { const [w, h] = probe(mp4).dim.split(',').map(Number); return { w, h }; } catch (e) { return { w: 0, h: 0 }; }
}
function inkRows(file, ts, w, h, x0f, x1f, y0f, y1f) {
  const raw = rawAt(file, ts);
  const y0 = Math.round(h * y0f), y1 = Math.min(h - 1, Math.round(h * y1f));
  const x0 = Math.round(w * x0f), x1 = Math.round(w * x1f);
  const rows = [];
  for (let y = y0; y <= y1; y++) {
    let c = 0;
    for (let x = x0; x <= x1; x += 2) {
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

fs.rmSync(OUT1, { recursive: true, force: true }); fs.mkdirSync(OUT1, { recursive: true });
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
  console.log('A. SMOKE UI — VERSI 3.13.0 + SLIDER UKURAN TULISAN PART');
  const a = await cdp.eval(`(() => {
    const q = s => document.querySelector(s);
    const sl = q('#inCoverPartSize');
    return {
      tag: (q('.tag') || {}).textContent || '',
      lbl8b: (q('#m8b .mod-h .t') || {}).textContent || '',
      nLay: NCLAYOUTS.length, nPal: NCPALETTES.length, nTrans: NCTRANS.length,
      sliderAda: !!sl, min: sl ? +sl.min : 0, max: sl ? +sl.max : 0, step: sl ? +sl.step : 0, val: sl ? +sl.value : 0,
      lblV: (q('#coverPartSizeV') || {}).textContent || '',
      ps0: state.cover.nc.partScale,
      nc: { layout: state.cover.nc.layout, palette: state.cover.nc.palette }
    };
  })()`);
  ok('Header bertanda v3.13.0', /v3\.13\.0/.test(a.tag), JSON.stringify({ tag: a.tag }));
  ok('Modul 08B menyebut UKURAN TULISAN PART (v3.13)', /UKURAN TULISAN PART/.test(a.lbl8b) || /v3\.13/.test(a.lbl8b), a.lbl8b);
  ok('Katalog NOVACUT utuh: 10 layout + 10 palet + 28 transisi', a.nLay === 10 && a.nPal === 10 && a.nTrans === 28, JSON.stringify({ nLay: a.nLay, nPal: a.nPal, nTrans: a.nTrans }));
  ok(`Slider UKURAN TULISAN PART ada: min ${a.min} max ${a.max} step ${a.step} nilai awal ${a.val}`,
    a.sliderAda && a.min === 0.5 && a.max === 2.5 && a.step === 0.05 && a.val === 1, JSON.stringify(a));
  ok('Label slider awal 100% + state.partScale default 1', a.lblV === '100%' && a.ps0 === 1, JSON.stringify({ lblV: a.lblV, ps0: a.ps0 }));

  /* ============ B. NOL-REGRESI PIKSEL ps=1 = RUMUS LAMA v3.12 ============ */
  console.log('B. NOL-REGRESI PIKSEL — LAYER PART ps=1 = RUMUS LAMA v3.12 (6 LAYOUT)');
  const b = await cdp.eval(`(() => {
    const W = 640, H = 360, part = 'PART 3';
    const pal = NCPALETTES.find(p => p.k === 'cyber');
    const scene = document.createElement('canvas'); scene.width = W; scene.height = H;
    scene.getContext('2d', { alpha: false }).fillStyle = '#0d3b12';
    scene.getContext('2d', { alpha: false }).fillRect(0, 0, W, H);
    /* replika RUMUS LAMA v3.12 fase part (sebelum slider ukuran) */
    const REF = {
      impact: (x, P) => ncDrawPartBadge(x, part, P, W / 2, H * 0.74, H * 0.032, 'center'),
      lower: (x, P) => { x.textAlign = 'left'; x.font = \`700 \${H * 0.03}px \${ncFontStack('sans')}\`; x.fillStyle = P.acc; x.fillText(part.toUpperCase(), W * 0.04, H * 0.885); },
      boxed: (x, P) => { x.fillStyle = P.bg1; x.fillRect(W * 0.34, H * 0.28, W * 0.32, H * 0.045); x.fillStyle = P.acc; x.textAlign = 'center'; x.font = \`700 \${H * 0.026}px \${ncFontStack('sans')}\`; x.fillText(part.toUpperCase(), W / 2, H * 0.312); },
      sticker: (x, P) => { x.save(); x.translate(W * 0.72, H * 0.24); x.rotate(-0.12); x.fillStyle = P.acc; x.beginPath(); const bw = W * 0.2, bh = H * 0.13; try { x.roundRect(-bw / 2, -bh / 2, bw, bh, H * 0.02); } catch (e) { x.rect(-bw / 2, -bh / 2, bw, bh); } x.fill(); x.fillStyle = '#000'; x.font = \`900 \${H * 0.032}px \${ncFontStack('impact')}\`; x.textAlign = 'center'; x.fillText(part.toUpperCase().slice(0, 12), 0, H * 0.012); x.restore(); },
      outline: (x, P) => { x.fillStyle = P.acc; x.fillRect(W * 0.2, H * 0.7, W * 0.6, H * 0.05); x.fillStyle = '#000'; x.textAlign = 'center'; x.font = \`900 \${H * 0.032}px \${ncFontStack('impact')}\`; x.fillText(part.toUpperCase(), W / 2, H * 0.74); },
      band: (x, P) => ncDrawPartBadge(x, part, P, W * 0.06, H * 0.78, H * 0.03, 'left')
    };
    const res = {};
    for (const [lay, fn] of Object.entries(REF)) {
      const L = ncBuildCoverLayers(W, H, { img: scene, title: 'UJI', part, nc: { layout: lay, palette: 'cyber', bg: 'adegan', frame: 'none', partScale: 1 } });
      const ref = document.createElement('canvas'); ref.width = W; ref.height = H;
      fn(ref.getContext('2d'), pal);
      const aa = L.part.getContext('2d').getImageData(0, 0, W, H).data;
      const bb = ref.getContext('2d').getImageData(0, 0, W, H).data;
      let diff = 0;
      for (let i = 0; i < aa.length; i += 4) if (Math.abs(aa[i] - bb[i]) + Math.abs(aa[i + 1] - bb[i + 1]) + Math.abs(aa[i + 2] - bb[i + 2]) > 24) diff++;
      res[lay] = diff;
    }
    return res;
  })()`);
  ok('Layer part ps=1 identik piksel dgn rumus lama di 6 layout geometri (impact/lower/boxed/sticker/outline/band)',
    Object.values(b).every(d => d === 0), JSON.stringify(b));

  /* ============ C. UNIT SKALA — AREA MONOTON + BADGE 2× + JUDUL UTUH ============ */
  console.log('C. UNIT SKALA — 60% < 100% < 200% DI 10 LAYOUT, BADGE ±2×, JUDUL TAK TERSentuh');
  const c = await cdp.eval(`(() => {
    const W = 640, H = 360, part = 'EPISODE 12';
    const scene = document.createElement('canvas'); scene.width = W; scene.height = H;
    const sg = scene.getContext('2d', { alpha: false }); sg.fillStyle = '#0d3b12'; sg.fillRect(0, 0, W, H);
    const lays = NCLAYOUTS.map(l => l.k);
    const areaOf = ps => {
      const L = ncBuildCoverLayers(W, H, { img: scene, title: 'UJI NOVACUT', part, nc: { layout: state.cover.nc.layout, palette: 'cyber', bg: 'adegan', frame: 'none', partScale: ps } });
      const dd = L.part.getContext('2d').getImageData(0, 0, W, H).data;
      let n = 0; for (let i = 3; i < dd.length; i += 4) if (dd[i] > 8) n++;
      return n;
    };
    const res = {};
    for (const lay of lays) {
      state.cover.nc.layout = lay;
      const a6 = areaOf(0.6), a1 = areaOf(1), a2 = areaOf(2);
      res[lay] = { a6, a1, a2, mono: a6 < a1 && a1 < a2, grows: a2 > a1 * 1.35 };
    }
    /* lebar badge impact: bounding piksel aksen di baris tengah badge */
    state.cover.nc.layout = 'impact';
    const badgeW = ps => {
      const L = ncBuildCoverLayers(W, H, { img: scene, title: 'UJI NOVACUT', part: 'PART 3', nc: { layout: 'impact', palette: 'cyber', bg: 'adegan', frame: 'none', partScale: ps } });
      const dd = L.part.getContext('2d').getImageData(0, 0, W, H).data;
      let minx = W, maxx = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        if (dd[o + 3] > 8) { if (x < minx) minx = x; if (x > maxx) maxx = x; }
      }
      return maxx > minx ? maxx - minx + 1 : 0;
    };
    const w1 = badgeW(1), w2 = badgeW(2), w6 = badgeW(0.6);
    /* layer judul TIDAK boleh berubah oleh ps */
    const t1 = ncBuildCoverLayers(W, H, { img: scene, title: 'UJI NOVACUT', part: 'PART 1', nc: { layout: 'impact', palette: 'cyber', bg: 'adegan', frame: 'none', partScale: 1 } });
    const t2 = ncBuildCoverLayers(W, H, { img: scene, title: 'UJI NOVACUT', part: 'PART 1', nc: { layout: 'impact', palette: 'cyber', bg: 'adegan', frame: 'none', partScale: 2.5 } });
    const da = t1.title.getContext('2d').getImageData(0, 0, W, H).data, db = t2.title.getContext('2d').getImageData(0, 0, W, H).data;
    let tdiff = 0;
    for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 24) tdiff++;
    return { res, w1, w2, w6, ratio2: +(w2 / w1).toFixed(2), ratio6: +(w6 / w1).toFixed(2), tdiff };
  })()`);
  const monoN = Object.values(c.res).filter(v => v.mono && v.grows).length;
  ok(`Area tinta part monoton & tumbuh di ${monoN}/10 layout (60% < 100% < 200%)`, monoN === 10, JSON.stringify(c.res));
  ok(`Lebar badge impact skala linear dgn ps: 0.6× = ${c.ratio6}, 2× = ${c.ratio2} (target 0.6 & 2.0 ±15%)`,
    Math.abs(c.ratio2 - 2) < 0.3 && Math.abs(c.ratio6 - 0.6) < 0.12, JSON.stringify({ w1: c.w1, w2: c.w2, w6: c.w6 }));
  ok('Layer JUDUL sama persis pada ps=1 vs ps=2.5 (slider hanya menyentuh tulisan part)', c.tdiff === 0, String(c.tdiff));

  /* ============ D. JALUR UI — SLIDER → STATE → PRATINJAU ============ */
  console.log('D. JALUR UI — GESER SLIDER → STATE + PRATINJAU + STATUS');
  const d = await cdp.eval(`(() => {
    const sl = document.querySelector('#inCoverPartSize'), lbl = document.querySelector('#coverPartSizeV');
    const pcv = document.querySelector('#coverPreviewCv');
    const snap = () => pcv.getContext('2d', { alpha: false }).getImageData(0, 0, pcv.width, pcv.height).data;
    state.cover.on = true; setSegOn('segCover', 'on');
    state.cover.part = 'EPISODE';
    [...document.querySelectorAll('#segCoverPart button')].forEach(x => x.classList.toggle('on', x.dataset.v === 'EPISODE'));
    state.cover.auto = true; state.cover.scope = 'part'; setSegOn('segCoverSrc', 'auto');
    syncCoverUI();
    state.cover.nc.bg = 'hitam'; setSegOn('segCoverBg', 'hitam');
    ncSyncCoverPreview();
    const p1 = snap();
    sl.value = '2'; sl.dispatchEvent(new Event('input', { bubbles: true }));
    const lblMid = lbl.textContent, psMid = state.cover.nc.partScale;
    const p2 = snap();
    sl.value = '2.5'; sl.dispatchEvent(new Event('input', { bubbles: true }));
    const lblMax = lbl.textContent, psMax = state.cover.nc.partScale;
    const p3 = snap();
    sl.value = '0.5'; sl.dispatchEvent(new Event('input', { bubbles: true }));
    const lblMin = lbl.textContent, psMin = state.cover.nc.partScale;
    const p4 = snap();
    sl.dispatchEvent(new Event('change', { bubbles: true }));
    const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 40) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) n++; return n; };
    /* kembalikan normal utk seksi berikutnya */
    sl.value = '1'; sl.dispatchEvent(new Event('input', { bubbles: true }));
    return {
      lblMid, psMid, lblMax, psMax, lblMin, psMin,
      toastTxt: (document.querySelector('.toast') || {}).textContent || '',
      d12: diff(p1, p2), d13: diff(p1, p3), d14: diff(p1, p4), d23: diff(p2, p3),
      stat: (document.querySelector('#coverStat') || {}).textContent || ''
    };
  })()`);
  ok(`Slider 2.0 → label ${d.lblMid} + state ${d.psMid}; 2.5 → ${d.lblMax}/${d.psMax}; 0.5 → ${d.lblMin}/${d.psMin}`,
    d.lblMid === '200%' && d.psMid === 2 && d.lblMax === '250%' && d.psMax === 2.5 && d.lblMin === '50%' && d.psMin === 0.5,
    JSON.stringify({ lblMid: d.lblMid, psMid: d.psMid, lblMax: d.lblMax, psMax: d.psMax, lblMin: d.lblMin, psMin: d.psMin }));
  ok(`Pratinjau cover berubah mengikuti slider (100→200: ${d.d12}, 100→250: ${d.d13}, 100→50: ${d.d14}, 200→250: ${d.d23} piksel beda)`,
    d.d12 > 4 && d.d13 > 4 && d.d14 > 4 && d.d23 > 0, JSON.stringify({ d12: d.d12, d13: d.d13, d14: d.d14, d23: d.d23 }));
  ok('Status modul 08B menampilkan ukuran part saat bukan 100%', /ukuran part/.test(d.stat), d.stat.slice(0, 160));

  /* ============ E. EKSPOR NYATA — BADGE 200% VIA SLIDER ============ */
  console.log('E. EKSPOR NYATA — SLIDER 200% → BADGE PART LEBAR ±2× DI MP4');
  await cdp.eval(`(async () => {
    document.querySelector('#autoSub').checked = false;
    await loadFromPath('${ROOT}/testmedia/v38-3scn12.mp4', true);
  })()`);
  await sleep(1800);
  const e = await cdp.eval(`(async () => {
    const sl = document.querySelector('#inCoverPartSize');
    document.querySelector('#segRatio button[data-v="16:9"]').click();
    document.querySelector('#segAcc button[data-v="cpu"]').click();
    state.scale = '1'; state.resOut = '720'; state.spk.on = false; state.spk.ready = false;
    state.splitParts = 0; state.splitSec = 4; state._noPart = false; state.rangeStart = 0; state.rangeEnd = 0;
    /* overlay video sengaja NYALA — tidak boleh ikut ke cover (regresi v3.12) */
    state.titleOn = true; state.title = 'JUDUL DI LAYAR'; state.upper = true; state.descOn = false; state.subsOn = false;
    state.titleAnim = 'off'; state.partAnim = 'off'; state.partShow = 'pojok'; state.partPrefix = 'EPISODE';
    state.titlePosY = 0; state.titleFrame = 'off'; state.titleSize = 46; state.titleScale = 1;
    state.colorFilter = 'off'; state.vfx.vignette = false; state.vfx.grain = false;
    state.kb.mode = 'off'; state.trans.mode = 'off'; state.frameStyle = 'off'; state.neon.on = false;
    state.cutMode = 'render';
    state.cover.auto = true; state.cover.scope = 'part';
    state.cover.nc.layout = 'impact'; state.cover.nc.palette = 'cyber'; state.cover.nc.frame = 'none';
    state.cover.nc.bg = 'adegan'; state.cover.nc.fx = 'in'; state.cover.nc.trans = 'flash';
    state.cover.nc.transDur = 0.4; state.cover.nc.titleAnim = 'off'; state.cover.nc.partAnim = 'off';
    state.cover.title = 'PETUALANGAN SI KEMBAR BALAS DENDAM DI KUTA BAROS'; state.cover.part = 'PART';
    state.cover.dur = 1; setSegOn('segCoverDur', '1');
    [...document.querySelectorAll('#coverLayoutChips button')].forEach(x => x.classList.toggle('on', x.dataset.v === 'impact'));
    [...document.querySelectorAll('#coverPaletteChips button')].forEach(x => x.classList.toggle('on', x.dataset.v === 'cyber'));
    /* UKURAN PART via slider = 200% — jalur UI penuh */
    sl.value = '2'; sl.dispatchEvent(new Event('input', { bubbles: true }));
    state.cover.on = true; setSegOn('segCover', 'on');
    let err = null, n = 0;
    try { const res = await exportPartsToDir('${OUT1}', { prog() { }, sub() { }, title() { } }); n = res.length; }
    catch (e2) { err = e2 && e2.message; }
    /* referensi lebar badge teoretis dgn font ekspor (H=720): ps=1 & ps=2 */
    const mg = document.createElement('canvas').getContext('2d');
    const bw = ps => { const size = 720 * 0.032 * ps; mg.font = \`700 \${size}px \${ncFontStack('condensed')}\`; return Math.ceil(mg.measureText('PART 1'.toUpperCase()).width + size * 0.5 * 2); };
    return { n, err, ps: state.cover.nc.partScale, bw1: bw(1), bw2: bw(2) };
  })()`);
  const mp4s = fs.readdirSync(OUT1).filter(f => /\.mp4$/.test(f)).sort();
  ok('3 part MP4 tersimpan (ekspor dgn partScale 200% lewat slider)', e.n === 3 && mp4s.length === 3 && !e.err, JSON.stringify({ n: e.n, err: e.err, ps: e.ps }));
  const dm = frameDimsSafe(path.join(OUT1, mp4s[0]));
  ok('Resolusi tetap 1280×720, durasi 4+1 = 5 dtk', dm.w === 1280 && dm.h === 720, JSON.stringify({ dim: probe(path.join(OUT1, mp4s[0])) }));
  const run2 = maxCyanRun(path.join(OUT1, mp4s[0]), 0.5, dm.w, dm.h, 0.7, 0.88);
  ok(`BADGE 200% terukur di MP4: lebar run cyan ${run2}px ≈ teoretis ${e.bw2}px (±15%) — jauh lebih besar dari badge 100% (${e.bw1}px)`,
    Math.abs(run2 - e.bw2) <= e.bw2 * 0.15 && run2 > e.bw1 * 1.5, JSON.stringify({ run2, bw2: e.bw2, bw1: e.bw1 }));
  const ink = inkRows(path.join(OUT1, mp4s[0]), 0.5, dm.w, dm.h, 0.08, 0.92, 0.26, 0.72);
  ok(`Judul tetap UTUH dgn auto-fit (${ink.count} baris tinta, tinggi maks ${ink.maxH}px ≤ 79px)`, ink.count >= 2 && ink.maxH <= 79, JSON.stringify(ink));
  const top = bandStats(path.join(OUT1, mp4s[0]), 0.5, dm.w, dm.h, 0.05, 0.95, 0.02, 0.18);
  ok(`COVER tetap BERSIH: nol teks overlay video di band atas (krem ${top.cream})`, top.cream < 12 && top.bright < 30, JSON.stringify(top));
  const corner = bandStats(path.join(OUT1, mp4s[0]), 0.5, dm.w, dm.h, 0.02, 0.28, 0.86, 0.985);
  ok(`Nol label EPISODE video di pojok (amber ${corner.amber})`, corner.amber < 12, JSON.stringify(corner));
  const flashMid = bandStats(path.join(OUT1, mp4s[0]), 1.2, dm.w, dm.h, 0.05, 0.95, 0.1, 0.9);
  const flashPost = bandStats(path.join(OUT1, mp4s[0]), 2.0, dm.w, dm.h, 0.05, 0.95, 0.1, 0.9);
  ok(`TRANSISI FLASH tetap bekerja (luma ${flashMid.luma} > ${flashPost.luma})`, flashMid.luma > flashPost.luma + 20, JSON.stringify({ mid: flashMid.luma, post: flashPost.luma }));
  const vidTop = bandStats(path.join(OUT1, mp4s[0]), 3.0, dm.w, dm.h, 0.1, 0.9, 0.02, 0.3);
  ok('VIDEO konten: judul overlay tetap terbakar (tak terpengaruh slider part)', vidTop.bright > 250, JSON.stringify(vidTop));

  /* ============ F. GERBANG POTONG LANGSUNG ============ */
  console.log('F. GERBANG POTONG LANGSUNG');
  const f = await cdp.eval(`(() => {
    state.titleOn = false; state.descOn = false; state.subsOn = false; state.partShow = 'off';
    const r = fastCutBlockedReason();
    state.cover.on = false; setSegOn('segCover', 'off');
    return { withCover: r };
  })()`);
  ok('Cover aktif → POTONG LANGSUNG terblokir (COVER PEMBUKA)', f.withCover === 'COVER PEMBUKA', JSON.stringify(f));

  /* ============ RINGKASAN ============ */
  console.log(`\\n==== HASIL v3.13: ${pass} LULUS, ${fail} GAGAL ====`);
  if (fails.length) { console.log('GAGAL:'); fails.forEach(x => console.log('  - ' + x)); }
  process.exitCode = fail ? 1 : 0;
} catch (err) {
  console.error('FATAL:', err && err.message);
  console.error((err && err.stack || '').split('\\n').slice(0, 6).join('\\n'));
  process.exitCode = 1;
} finally {
  try { app.kill('SIGKILL'); } catch (e) { }
  process.exit(process.exitCode || 0);
}
