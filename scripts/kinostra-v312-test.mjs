/* ================================================================
   KINOSTRA v3.12.0 — UJI AUTO-FIT JUDUL COVER + COVER BERSIH
   Jalankan: bash scripts/run-test-xvfb.sh scripts/kinostra-v312-test.mjs
   Media uji: testmedia/v38-3scn12.mp4 — 12 dtk, 640×360, 30fps,
   h264+aac, 3 adegan warna solid (merah 0–4, hijau 4–8, biru 8–12).
   Cakupan:
   A. Smoke UI: versi 3.12.0 + katalog NOVACUT utuh (10/10/28/9)
   B. UNIT AUTO-FIT: judul panjang → SEMUA kata masuk di 10 layout
      (font mengecil); judul pendek → ukuran dasar persis v3.11
   C. NOL-REGRESI PIKSEL: layer judul judul-pendek = rumus lama v3.11
   D. UNIT COVER BERSIH: drawComposition {noText} = video murni tanpa
      judul/PART/deskripsi/sub/neon — teks video nol piksel
   E. EKSPOR NYATA: cover OTOMATIS (adegan) bersih + judul panjang
      utuh di cover + badge part cover; teks overlay video TIDAK ikut;
      judul video tetap terbakar di bagian konten
   F. Gerbang POTONG LANGSUNG tetap 'COVER PEMBUKA'
   ================================================================ */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project';
const OUT1 = '/tmp/kinov312-nc';
const PORT = 9496;
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
  const tmp = '/tmp/ncframe312.raw';
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
function centerColor(file, ts, w, h) {
  const raw = rawAt(file, ts);
  let R = 0, G = 0, B = 0, n = 0;
  for (let y = Math.round(h * 0.35); y < h * 0.55; y += 2) for (let x = Math.round(w * 0.3); x < w * 0.7; x += 2) {
    const o = (y * w + x) * 3; R += raw[o]; G += raw[o + 1]; B += raw[o + 2]; n++;
  }
  return { R: Math.round(R / n), G: Math.round(G / n), B: Math.round(B / n) };
}
function frameDimsSafe(mp4) {
  try { const [w, h] = probe(mp4).dim.split(',').map(Number); return { w, h }; } catch (e) { return { w: 0, h: 0 }; }
}

/* hitung jumlah "baris tinta" terang pada band — utk verifikasi judul
   panjang tergambar UTUH dalam beberapa baris dgn tinggi font kecil */
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
  console.log('A. SMOKE UI — VERSI 3.12.0 + KATALOG NOVACUT UTUH');
  const a = await cdp.eval(`(() => {
    const q = s => document.querySelector(s);
    return {
      bsub: (q('.bsub') || {}).textContent || '',
      tag: (q('.tag') || {}).textContent || '',
      lbl8b: (q('#m8b .mod-h .t') || {}).textContent || '',
      nLay: NCLAYOUTS.length, nPal: NCPALETTES.length, nTrans: NCTRANS.length, nAnim: NCTEXTANIMS.length,
      hasFit: typeof ncFitTitle === 'function',
      nc: { layout: state.cover.nc.layout, palette: state.cover.nc.palette }
    };
  })()`);
  ok('Header bertanda v3.12.0 (layar boot dihapus setelah startup)', /v3\.12\.0/.test(a.tag), JSON.stringify({ tag: a.tag }));
  ok('Katalog NOVACUT utuh: 10 layout + 10 palet + 28 transisi + 9 animasi', a.nLay === 10 && a.nPal === 10 && a.nTrans === 28 && a.nAnim === 9, JSON.stringify({ nLay: a.nLay, nPal: a.nPal, nTrans: a.nTrans, nAnim: a.nAnim }));
  ok('ncFitTitle (AUTO-FIT judul) tersedia global', a.hasFit, String(a.hasFit));
  ok('Modul 08B masih MESIN NOVACUT', /NOVACUT/.test(a.lbl8b), a.lbl8b);

  /* ============ B. UNIT AUTO-FIT — JUDUL PANJANG MASUK SEMUA ============ */
  console.log('B. UNIT AUTO-FIT — 10 LAYOUT: JUDUL PANJANG UTUH, JUDUL PENDEK PERSIS');
  const LONG = 'CEO DIRACUNI TUNANGAN LIMA TAHUN KEMUDIAN SI KEMBAR BALAS DENDAM PUTRA MAHKOTA';
  const SHORT = 'UJI NOVACUT';
  const b = await cdp.eval(`(() => {
    const W = 640, H = 360;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const LONG = '${LONG}', SHORT = '${SHORT}';
    const minFs = H * 0.024;
    /* replika param auto-fit per layout (harus sama dgn ncLayoutPass) */
    const CFG = {
      impact: { fo: s => \`900 \${s}px \${ncFontStack('impact')}\`, fs0: H * 0.115, mw: W * 0.84, ml: 3 },
      lower: { fo: s => \`900 \${s}px \${ncFontStack('impact')}\`, fs0: H * 0.085, mw: W * 0.64, ml: 2 },
      side: { fo: s => \`900 \${s}px \${ncFontStack('impact')}\`, fs0: H * 0.095, mw: W * 0.5, ml: 3 },
      sticker: { fo: s => \`900 \${s}px \${ncFontStack('impact')}\`, fs0: H * 0.105, mw: W * 0.8, ml: 3 },
      outline: { fo: s => \`900 \${s}px \${ncFontStack('impact')}\`, fs0: H * 0.17, mw: W * 0.9, ml: 3, up: true },
      banner: { fo: s => \`900 \${s}px \${ncFontStack('condensed')}\`, fs0: H * 0.1, mw: W * 0.86, ml: 1, min1: H * 0.07, fsB: H * 0.062, mlB: 3, up: true },
      boxed: { fo: s => \`900 \${s}px \${ncFontStack('condensed')}\`, fs0: H * 0.09, mw: W * 0.72, ml: 3, up: true },
      bars: { fo: s => \`900 \${s}px \${ncFontStack('condensed')}\`, fs0: H * 0.075, mw: W * 0.8, ml: 3, up: true },
      band: { fo: s => \`900 \${s}px \${ncFontStack('condensed')}\`, fs0: H * 0.085, mw: W * 0.84, ml: 3, up: true },
      neon: { fo: s => \`900 \${s}px \${ncFontStack('display')}\`, fs0: H * 0.1, mw: W * 0.8, ml: 3, up: true }
    };
    const res = { long: {}, short: {}, banner: {} };
    const norm = s => String(s).replace(/\\s+/g, ' ').trim();
    for (const [k, c] of Object.entries(CFG)) {
      /* judul panjang — SEMUA kata harus tercakup & tiap baris muat lebar */
      const ft = ncFitTitle(g, c.up ? LONG.toUpperCase() : LONG, c.fo, c.fs0, c.mw, c.ml, minFs);
      const words = norm((c.up ? LONG.toUpperCase() : LONG)).split(' ');
      const got = norm(ft.lines.join(' ')).split(' ');
      const allWords = words.length === got.length && words.every((w, i) => got[i] === w);
      let widthsOk = true, maxW = 0;
      for (const ln of ft.lines) { const w = g.measureText(ln).width; maxW = Math.max(maxW, w); if (w > c.mw + 0.6) widthsOk = false; }
      res.long[k] = { allWords, widthsOk, fs: +ft.fs.toFixed(2), fs0: +c.fs0.toFixed(2), n: ft.lines.length, shrunk: ft.fs < c.fs0 * 0.999, maxW: +maxW.toFixed(1), mw: +c.mw.toFixed(1) };
      /* judul pendek — ukuran dasar PERSIS (nol regresi v3.11) */
      const fs2 = ncFitTitle(g, c.up ? SHORT.toUpperCase() : SHORT, c.fo, c.fs0, c.mw, c.ml, minFs);
      res.short[k] = { fsEq: Math.abs(fs2.fs - c.fs0) < 0.001, oneLine: fs2.lines.length === 1 };
    }
    /* banner dua tahap: 1 baris besar bila muat, selain itu 2-3 baris rapat */
    const c = CFG.banner;
    let ft = ncFitTitle(g, LONG, c.fo, c.fs0, c.mw, 1, c.min1);
    if (ft.lines.length > 1) ft = ncFitTitle(g, LONG.toUpperCase(), c.fo, c.fsB, c.mw, c.mlB, minFs);
    const wordsL = norm(LONG.toUpperCase()).split(' ');
    const gotL = norm(ft.lines.join(' ')).split(' ');
    res.banner = { allWords: wordsL.length === gotL.length && wordsL.every((w, i) => gotL[i] === w), fs: +ft.fs.toFixed(2), n: ft.lines.length };
    return res;
  })()`);
  const longOk = Object.values(b.long).every(v => v.allWords && v.widthsOk);
  const nShrunk = Object.values(b.long).filter(v => v.shrunk).length;
  ok(`JUDUL PANJANG (${LONG.split(' ').length} kata): SEMUA kata masuk di 10 layout (${nShrunk} layout font mengecil, sisanya muat di ukuran dasar)`,
    longOk && nShrunk >= 4, JSON.stringify(b.long));
  const shortOk = Object.values(b.short).every(v => v.fsEq && v.oneLine);
  ok('JUDUL PENDEK: ukuran font = ukuran dasar layout PERSIS v3.11 (tidak menyusut)', shortOk, JSON.stringify(b.short));
  ok('BANNER: judul panjang utuh lewat mode 2-3 baris rapat di pita', b.banner.allWords && b.banner.n >= 2, JSON.stringify(b.banner));

  /* ============ C. NOL-REGRESI PIKSEL (judul pendek = rumus lama) ============ */
  console.log('C. NOL-REGRESI PIKSEL — LAYER JUDUL = RUMUS LAMA v3.11 (JUDUL PENDEK)');
  const c = await cdp.eval(`(() => {
    const W = 640, H = 360;
    state.cover.nc.layout = 'impact'; state.cover.nc.palette = 'cyber'; state.cover.nc.bg = 'adegan'; state.cover.nc.frame = 'none';
    const scene = document.createElement('canvas'); scene.width = W; scene.height = H;
    const sg = scene.getContext('2d', { alpha: false }); sg.fillStyle = '#0d3b12'; sg.fillRect(0, 0, W, H);
    const L = ncBuildCoverLayers(W, H, { img: scene, title: 'UJI NOVACUT', part: 'PART 3', nc: state.cover.nc });
    /* replika RUMUS LAMA v3.11 layout impact (sebelum auto-fit) */
    const ref = document.createElement('canvas'); ref.width = W; ref.height = H;
    const x = ref.getContext('2d');
    const title = 'UJI NOVACUT';
    const pal = NCPALETTES.find(p => p.k === 'cyber');
    x.textBaseline = 'alphabetic'; x.lineJoin = 'round'; x.textAlign = 'center';
    x.font = \`900 \${H * 0.115}px \${ncFontStack('impact')}\`;
    const lines = ncWrapText(x, title, W * 0.84, 3);
    const startY = H / 2 - ((lines.length - 1) * H * 0.125) / 2 + H * 0.03;
    lines.forEach((ln, i) => {
      const y = startY + i * H * 0.125;
      x.fillStyle = '#000'; x.fillText(ln, W / 2 + H * 0.006, y + H * 0.006);
      x.fillStyle = pal.fg; x.fillText(ln, W / 2, y);
    });
    x.fillStyle = pal.acc;
    x.fillRect(W / 2 - W * 0.08, startY + lines.length * H * 0.125 - H * 0.06, W * 0.16, H * 0.012);
    const a = L.title.getContext('2d').getImageData(0, 0, W, H).data;
    const bb = ref.getContext('2d').getImageData(0, 0, W, H).data;
    let diff = 0;
    for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - bb[i]) + Math.abs(a[i + 1] - bb[i + 1]) + Math.abs(a[i + 2] - bb[i + 2]) > 24) diff++;
    return { diff, n: lines.length };
  })()`);
  ok('Layer judul judul-pendek identik piksel dgn rumus lama v3.11 (nol regresi)', c.diff === 0, JSON.stringify(c));

  /* ============ D. UNIT COVER BERSIH — drawComposition noText ============ */
  console.log('D. UNIT COVER BERSIH — TANGKAPAN TANPA TEKS OVERLAY VIDEO');
  await cdp.eval(`(async () => {
    document.querySelector('#autoSub').checked = false;
    await loadFromPath('${ROOT}/testmedia/v38-3scn12.mp4', true);
  })()`);
  await sleep(1800);
  const d = await cdp.eval(`(async () => {
    const W = 480, H = 270;
    try { videoEl.pause(); await seekTo(0.5, videoEl); } catch (e) { }
    /* nyalakan SEMUA teks overlay video — di cover tidak boleh ikut */
    state.titleOn = true; state.title = 'JUDUL DI LAYAR'; state.upper = true;
    state.titleSize = 46; state.titleScale = 1; state.titlePosY = 0; state.titleFrame = 'off';
    state.descOn = true; state.desc = 'deskripsi uji'; state.descPos = 'under';
    state.subsOn = true; state.subs = [{ s: 0, e: 12, text: 'Teks subtitel uji' }]; state.subPosY = 0.9;
    state._noPart = false; state.partShow = 'pojok'; state.partPrefix = 'EPISODE'; state.partPosX = 0; state.partPosY = 0;
    state.speed = 1; state.splitSec = 6; state.rangeStart = 0; state.rangeEnd = 0; state.cuts = [];
    state.colorFilter = 'off'; state.vfx.vignette = false; state.vfx.grain = false;
    state.frameStyle = 'off'; state.neon.on = true; state.neon.color = '#f7a600';
    const draw = (clean) => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      setCompSrc(videoEl); drawComposition(cv.getContext('2d', { alpha: false }), W, H, 0.5, clean ? { noText: true } : undefined); setCompSrc(null); return cv; };
    const k1 = draw(false), k2 = draw(true);
    /* video murni: gambar frame fit langsung (acuan latar bersih) */
    const kv = document.createElement('canvas'); kv.width = W; kv.height = H;
    const fit = videoFrameRect(videoEl.videoWidth, videoEl.videoHeight, W, H, 0.5);
    kv.getContext('2d', { alpha: false }).drawImage(videoEl, fit.x, fit.y, fit.w, fit.h);
    const stat = (cv) => { const dd = cv.getContext('2d').getImageData(0, 0, W, H).data;
      let cream = 0; for (let i = 0; i < dd.length; i += 4) if (dd[i] > 185 && dd[i + 1] > 175 && dd[i + 2] > 155) cream++;
      return { cream }; };
    const diff = (c1, c2) => { const aa = c1.getContext('2d').getImageData(0, 0, W, H).data, b2 = c2.getContext('2d').getImageData(0, 0, W, H).data;
      let n = 0, tot = 0; for (let i = 0; i < aa.length; i += 16) { tot++; if (Math.abs(aa[i] - b2[i]) + Math.abs(aa[i + 1] - b2[i + 1]) + Math.abs(aa[i + 2] - b2[i + 2]) > 50) n++; } return n / tot; };
    return { k1: stat(k1), k2: stat(k2), d12: diff(k1, k2), d2v: diff(k2, kv) };
  })()`);
  ok(`Tangkapan BIASA membawa teks video (${d.k1.cream} piksel krem) — BERSIH (noText) nol teks (${d.k2.cream})`,
    d.k1.cream > 300 && d.k2.cream < 8, JSON.stringify(d));
  ok('noText = video murni (beda dgn acuan video fit hampir nol)', d.d2v < 0.004, String(d.d2v));
  ok('Teks overlay video benar-benar hilang dari tangkapan bersih (frame beda)', d.d12 > 0.01, String(d.d12));

  /* ============ E. EKSPOR NYATA — COVER OTOMATIS BERSIH + AUTO-FIT ============ */
  console.log('E. EKSPOR NYATA — COVER ADEGAN OTOMATIS BERSIH + JUDUL PANJANG UTUH');
  const e = await cdp.eval(`(async () => {
    document.querySelector('#segRatio button[data-v="16:9"]').click();
    document.querySelector('#segAcc button[data-v="cpu"]').click();
    state.scale = '1'; state.resOut = '720'; state.spk.on = false; state.spk.ready = false;
    state.splitParts = 0; state.splitSec = 4; state._noPart = false; state.rangeStart = 0; state.rangeEnd = 0;
    /* overlay video: judul PENDEK + label EPISODE pojok — TIDAK boleh ikut ke cover */
    state.titleOn = true; state.title = 'JUDUL DI LAYAR'; state.upper = true; state.descOn = false; state.subsOn = false;
    state.titleAnim = 'off'; state.partAnim = 'off'; state.partShow = 'pojok'; state.partPrefix = 'EPISODE';
    state.titlePosY = 0; state.titleFrame = 'off'; state.titleSize = 46; state.titleScale = 1;
    state.colorFilter = 'off'; state.vfx.vignette = false; state.vfx.grain = false;
    state.kb.mode = 'off'; state.trans.mode = 'off'; state.frameStyle = 'off'; state.neon.on = false;
    state.cutMode = 'render';
    /* cover OTOMATIS (adegan dari pemindai) + judul PANJANG → auto-fit */
    state.cover.auto = true; state.cover.scope = 'part';
    state.cover.nc.layout = 'impact'; state.cover.nc.palette = 'cyber'; state.cover.nc.frame = 'none';
    state.cover.nc.bg = 'adegan'; state.cover.nc.fx = 'in'; state.cover.nc.trans = 'flash';
    state.cover.nc.transDur = 0.4; state.cover.nc.titleAnim = 'off'; state.cover.nc.partAnim = 'off';
    state.cover.title = '${LONG}'; state.cover.part = 'PART';
    state.cover.dur = 1; setSegOn('segCoverDur', '1');
    setSegOn('coverLayoutChips', 'impact');
    [...document.querySelectorAll('#coverLayoutChips button')].forEach(x => x.classList.toggle('on', x.dataset.v === 'impact'));
    [...document.querySelectorAll('#coverPaletteChips button')].forEach(x => x.classList.toggle('on', x.dataset.v === 'cyber'));
    state.cover.on = true; setSegOn('segCover', 'on');
    let logHit = 0, logTxt = '';
    const oi = console.info;
    console.info = (...x) => { const s = String(x[0] || ''); if (s.includes('cover NOVACUT')) { logHit++; logTxt = s; } oi(...x); };
    let t0 = 0, el = 0, err = null, n = 0;
    try { t0 = performance.now(); const res = await exportPartsToDir('${OUT1}', { prog() { }, sub() { }, title() { } }); el = performance.now() - t0; n = res.length; }
    catch (e2) { err = e2 && e2.message; }
    console.info = oi;
    return { n, err, el: Math.round(el), logHit, logTxt };
  })()`);
  const mp4s = fs.readdirSync(OUT1).filter(f => /\.mp4$/.test(f)).sort();
  ok('3 part MP4 tersimpan (cover otomatis NOVACUT)', e.n === 3 && mp4s.length === 3 && !e.err, JSON.stringify({ n: e.n, err: e.err }));
  const prs = mp4s.map(f => probe(path.join(OUT1, f)));
  ok('Durasi tiap part = 4 konten + 1 cover = 5 dtk', prs.every(p => Math.abs(p.dur - 5) < 0.7), JSON.stringify(prs.map(p => +p.dur.toFixed(2))));
  const dm = frameDimsSafe(path.join(OUT1, mp4s[0]));
  ok('Resolusi tetap 1280×720', dm.w === 1280 && dm.h === 720 && prs.every(p => p.dim === '1280,720'), JSON.stringify(prs.map(p => p.dim)));
  const covBg = centerColor(path.join(OUT1, mp4s[0]), 0.5, dm.w, dm.h);
  ok('COVER: latar = ADEGAN video (merah, dgn peredup template)', covBg.R > covBg.G + 20 && covBg.R > covBg.B + 20, JSON.stringify(covBg));
  const top = bandStats(path.join(OUT1, mp4s[0]), 0.5, dm.w, dm.h, 0.05, 0.95, 0.02, 0.18);
  ok(`COVER BERSIH: nol teks overlay video di band atas (krem ${top.cream}, terang ${top.bright})`, top.cream < 12 && top.bright < 30, JSON.stringify(top));
  const corner = bandStats(path.join(OUT1, mp4s[0]), 0.5, dm.w, dm.h, 0.02, 0.28, 0.86, 0.985);
  ok(`COVER BERSIH: nol label EPISODE video di pojok (amber ${corner.amber}, krem ${corner.cream})`, corner.amber < 12 && corner.cream < 12, JSON.stringify(corner));
  const ink = inkRows(path.join(OUT1, mp4s[0]), 0.5, dm.w, dm.h, 0.08, 0.92, 0.26, 0.72);
  ok(`AUTO-FIT: judul panjang UTUH di cover — ${ink.count} baris tinta (≥2), tinggi baris maks ${ink.maxH}px ≤ ukuran dasar (79px)`,
    ink.count >= 2 && ink.maxH <= 79 && ink.maxH > 6, JSON.stringify(ink));
  const badge = bandStats(path.join(OUT1, mp4s[0]), 0.5, dm.w, dm.h, 0.3, 0.7, 0.7, 0.8);
  ok('COVER: badge PART (aksen cyan) tetap digambar di posisi layout impact', badge.cyan > 60, JSON.stringify(badge));
  const flashMid = bandStats(path.join(OUT1, mp4s[0]), 1.2, dm.w, dm.h, 0.05, 0.95, 0.1, 0.9);
  const flashPost = bandStats(path.join(OUT1, mp4s[0]), 2.0, dm.w, dm.h, 0.05, 0.95, 0.1, 0.9);
  ok(`TRANSISI FLASH tetap bekerja (luma ${flashMid.luma} > ${flashPost.luma})`, flashMid.luma > flashPost.luma + 20, JSON.stringify({ mid: flashMid.luma, post: flashPost.luma }));
  const vidTop = bandStats(path.join(OUT1, mp4s[0]), 3.0, dm.w, dm.h, 0.1, 0.9, 0.02, 0.3);
  ok('VIDEO konten: judul overlay TETAP terbakar di video (tak terpengaruh noText)', vidTop.bright > 250, JSON.stringify(vidTop));
  const cc2 = [1, 2].map(i => centerColor(path.join(OUT1, mp4s[i]), 3.0, dm.w, dm.h));
  ok('Adegan cover per part benar: PART_02 hijau / PART_03 biru di kontennya', cc2[0].G > cc2[0].R + 25 && cc2[1].B > cc2[1].R + 20, JSON.stringify(cc2));

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
  console.log(`\\n==== HASIL v3.12: ${pass} LULUS, ${fail} GAGAL ====`);
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
