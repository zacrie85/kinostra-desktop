/* ================================================================
   KINOSTRA v3.7.0 — UJI COVER OTOMATIS DARI ADEGAN VIDEO (modul 08B)
   Jalankan: bash scripts/run-test-xvfb.sh scripts/kinostra-v37-test.mjs
   Media uji: testmedia/v37-3scn.mp4 — 9 dtk, 3 adegan warna solid
   (merah 0–3 dtk, hijau 3–6, biru 6–9) → split 3 part 3 dtk, cover
   otomatis tiap part WAJIB mengambil adegan di rentangnya sendiri:
   part1 merah, part2 hijau, part3 biru (bukti warna tengah sampul).
   Cakupan:
   A. Smoke UI: segCoverSrc (MANUAL/OTOMATIS), segCoverStyle (4 gaya),
      inCoverTitle, btnCoverPrev, header v3.7.0
   B. Mode switch: OTOMATIS → panel ikut, AKTIF tanpa gambar diterima,
      gaya + judul ikut state, ringkasan ekspor menyebut OTOMATIS,
      kembali MANUAL → perilaku lama (AKTIF ditolak tanpa gambar)
   C. Unit pixel: drawAutoCoverDesign (bingkai KLASIK amber di tepi,
      tengah tetap warna adegan, judul krem terang), TANPA tanpa amber,
      SINEMA bar atas gelap, drawCoverFrame dgn covCv + label part,
      scoreAutoFrame (hitam < abu < berwarna), coverTitleText normalisasi
   D. EKSPOR NYATA SPLIT 3 PART OTOMATIS: tiap part cover dari adegan
      sendiri (merah/hijau/biru), bingkai amber, label PART 1/2/3,
      cover antar part benar-benar berbeda
   E. EKSPOR TUNGGAL OTOMATIS: 1 file 11 dtk, cover + judul + PART 1
   F. GABUNG + OTOMATIS: cover pembuka bersampul otomatis, tanpa nomor
   G. Regresi MANUAL: impor gambar → auto mati ke manual, label v3.6.1
      tetap jalan, AKTIF tetap ditolak bila manual tanpa gambar
   ================================================================ */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project';
const OUTS = '/tmp/kinov37-split', OUTO = '/tmp/kinov37-one', OUTM = '/tmp/kinov37-merge';
const PORT = 9471;
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
function rawAt(file, ts) {
  return execSync(`ffmpeg -v error -ss ${ts} -i '${file}' -frames:v 1 -f rawvideo -pix_fmt rgb24 -`, { maxBuffer: 64e6, encoding: 'buffer' });
}
/* statistik persegi (fraksi): krem terang (teks/garis terang), gelap,
   amber (bingkai emas) */
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
/* warna rata-rata pita tengah (0.3–0.7 W × 0.35–0.55 H) — bebas scrim
   & bingkai → mewakili adegan sumber */
function centerColor(file, ts, w, h) {
  const raw = rawAt(file, ts);
  let R = 0, G = 0, B = 0, n = 0;
  for (let y = Math.round(h * 0.35); y < h * 0.55; y += 2) for (let x = Math.round(w * 0.3); x < w * 0.7; x += 2) {
    const o = (y * w + x) * 3; R += raw[o]; G += raw[o + 1]; B += raw[o + 2]; n++;
  }
  return { R: Math.round(R / n), G: Math.round(G / n), B: Math.round(B / n) };
}
/* beda byte dua frame penuh (sampul antar part harus jauh berbeda) */
function coverDiff(fileA, tsA, fileB, tsB, w, h) {
  const a = rawAt(fileA, tsA), b = rawAt(fileB, tsB);
  let diff = 0, n = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    const o = (y * w + x) * 3; n++;
    if (Math.abs(a[o] - b[o]) > 24 || Math.abs(a[o + 1] - b[o + 1]) > 24 || Math.abs(a[o + 2] - b[o + 2]) > 24) diff++;
  }
  return { diff, n };
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
  console.log('A. SMOKE UI — SUMBER OTOMATIS, GAYA BINGKAI, JUDUL, PRATINJAU');
  const a = await cdp.eval(`(() => {
    const q = s => document.querySelector(s);
    const src = q('#segCoverSrc'), sty = q('#segCoverStyle');
    const sb = src ? [...src.querySelectorAll('button')] : [];
    const tb = sty ? [...sty.querySelectorAll('button')] : [];
    return {
      src: !!src, sVals: sb.map(b => b.dataset.v), sDef: sb.find(b => b.dataset.v === 'manual')?.classList.contains('on'),
      sty: !!sty, tVals: tb.map(b => b.dataset.v), tDef: tb.find(b => b.dataset.v === 'KLASIK')?.classList.contains('on'),
      inp: !!q('#inCoverTitle'), prev: !!q('#btnCoverPrev'),
      rowM: q('#coverManualRow') ? q('#coverManualRow').style.display : 'x',
      boxA: q('#coverAutoBox') ? q('#coverAutoBox').style.display : 'x',
      auto: state.cover.auto, style: state.cover.style, title: state.cover.title,
      lbl: (q('#m8b .mod-h .t') || {}).textContent || ''
    };
  })()`);
  ok('Chip SUMBER COVER ada: MANUAL/OTOMATIS DARI VIDEO, default MANUAL', a.src && JSON.stringify(a.sVals) === JSON.stringify(['manual', 'auto']) && a.sDef && a.auto === false, JSON.stringify(a.sVals));
  ok('Chip GAYA BINGKAI ada: KLASIK/GARIS/SINEMA/TANPA, default KLASIK', a.sty && JSON.stringify(a.tVals) === JSON.stringify(['KLASIK', 'GARIS', 'SINEMA', 'TANPA']) && a.tDef && a.style === 'KLASIK', JSON.stringify(a.tVals));
  ok('Input judul sampul + tombol PRATINJAU ada', a.inp && a.prev);
  ok('Default: panel MANUAL tampak, panel OTOMATIS tersembunyi', a.rowM !== 'none' && a.boxA === 'none', `rowM=${a.rowM} boxA=${a.boxA}`);
  ok('Modul 08B bertanda DIPERBARUI v3.7.0', a.lbl.includes('v3.7.0'), a.lbl);

  /* ============ B. GANTI MODE ============ */
  console.log('B. GANTI MODE — OTOMATIS → AKTIF tanpa gambar → gaya/judul → MANUAL');
  const b = await cdp.eval(`(() => {
    const q = s => document.querySelector(s);
    const cl = s => q(s).click();
    const r = {};
    cl('#segCoverSrc button[data-v="auto"]');
    r.auto = { st: state.cover.auto, rowM: q('#coverManualRow').style.display, boxA: q('#coverAutoBox').style.display,
      prev: q('#btnCoverPrev').style.display, stat: q('#coverStat').textContent };
    cl('#segCover button[data-v="on"]');
    r.on = { st: state.cover.on, chipOn: q('#segCover button[data-v="on"]').classList.contains('on'), stat: q('#coverStat').textContent };
    cl('#segCoverStyle button[data-v="GARIS"]');
    r.garis = { st: state.cover.style, chip: q('#segCoverStyle button[data-v="GARIS"]').classList.contains('on') };
    const i = q('#inCoverTitle'); i.value = 'SERIAL UJI'; if (i.oninput) i.oninput({ target: i });
    r.title = state.cover.title;
    cl('#segCoverSrc button[data-v="manual"]');
    r.back = { auto: state.cover.auto, on: state.cover.on, rowM: q('#coverManualRow').style.display, boxA: q('#coverAutoBox').style.display,
      chipOff: q('#segCover button[data-v="off"]').classList.contains('on') };
    cl('#segCover button[data-v="on"]');
    r.reject = { on: state.cover.on, chipOff: q('#segCover button[data-v="off"]').classList.contains('on') };
    cl('#segCoverStyle button[data-v="KLASIK"]');
    return r;
  })()`);
  ok('Klik OTOMATIS: state.cover.auto, panel tertukar, status menyebut OTOMATIS', b.auto.st === true && b.auto.rowM === 'none' && b.auto.boxA !== 'none' && b.auto.prev !== 'none' && /OTOMATIS/.test(b.auto.stat), JSON.stringify({ st: b.auto.st, rowM: b.auto.rowM, boxA: b.auto.boxA }));
  ok('AKTIF DITERIMA tanpa gambar di mode OTOMATIS', b.on.st === true && b.on.chipOn && /AKTIF/.test(b.on.stat), JSON.stringify({ on: b.on.st }));
  ok('Gaya bingkai GARIS ikut state + chip', b.garis.st === 'GARIS' && b.garis.chip);
  ok('Judul sampul custom tersimpan lewat input', b.title === 'SERIAL UJI', b.title);
  ok('Kembali MANUAL: auto false, cover tanpa gambar otomatis MATI, panel tertukar balik', b.back.auto === false && b.back.on === false && b.back.rowM !== 'none' && b.back.boxA === 'none' && b.back.chipOff, JSON.stringify(b.back));
  ok('AKTIF tetap DITOLAK bila MANUAL tanpa gambar (perilaku v3.6 utuh)', b.reject.on === false && b.reject.chipOff, JSON.stringify(b.reject));

  /* ============ C. UNIT PIXEL ============ */
  console.log('C. UNIT PIXEL — drawAutoCoverDesign / drawCoverFrame / scoreAutoFrame');
  const c = await cdp.eval(`(() => {
    const mkcv = (w, h) => { const c2 = document.createElement('canvas'); c2.width = w; c2.height = h; return c2; };
    const red = mkcv(640, 360); const rg = red.getContext('2d'); rg.fillStyle = '#D8402F'; rg.fillRect(0, 0, 640, 360);
    state.title = 'UJI_JUDUL.cover-Video';   /* utk uji normalisasi coverTitleText */
    state.cover.auto = true; state.cover.style = 'KLASIK'; state.cover.title = 'SERIAL UJI'; state.cover.part = 'PART'; state.cover.on = true; state.cover.img = null;
    const out = mkcv(640, 360); drawAutoCoverDesign(out.getContext('2d', { alpha: false }), 640, 360, red);
    state.cover.style = 'TANPA';
    const outNo = mkcv(640, 360); drawAutoCoverDesign(outNo.getContext('2d', { alpha: false }), 640, 360, red);
    state.cover.style = 'SINEMA';
    const outSin = mkcv(640, 360); drawAutoCoverDesign(outSin.getContext('2d', { alpha: false }), 640, 360, red);
    state.cover.style = 'KLASIK';
    const g0 = mkcv(640, 360).getContext('2d', { alpha: false, willReadFrequently: true }); drawCoverFrame(g0, 640, 360, 0, out);
    const g1 = mkcv(640, 360).getContext('2d', { alpha: false, willReadFrequently: true }); drawCoverFrame(g1, 640, 360, 1, out);
    const scan = (cv, x0, x1, y0, y1) => {
      const im = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, 640, 360).data;
      let bright = 0, dark = 0, amber = 0, R = 0, G = 0, B = 0, n = 0;
      for (let y = Math.round(360 * y0); y < Math.round(360 * y1); y++) for (let x = Math.round(640 * x0); x < Math.round(640 * x1); x++) {
        const o = (y * 640 + x) * 4, r = im[o], g = im[o + 1], b2 = im[o + 2];
        if (r > 180 && g > 170 && b2 > 150) bright++;
        else if (r + g + b2 < 190) dark++;
        if (r > 140 && g > 90 && g < 215 && b2 < 115 && r - b2 > 60) amber++;
        R += r; G += g; B += b2; n++;
      }
      return { bright, dark, amber, avg: { R: Math.round(R / n), G: Math.round(G / n), B: Math.round(B / n) } };
    };
    const edgeK = scan(out, 0.015, 0.06, 0.45, 0.55);
    const edgeN = scan(outNo, 0.015, 0.06, 0.45, 0.55);
    const mid = scan(out, 0.3, 0.7, 0.35, 0.55);
    const title = scan(out, 0.2, 0.8, 0.6, 0.87);
    const sinTop = scan(outSin, 0.2, 0.8, 0.0, 0.045);
    const sinLine = scan(outSin, 0.2, 0.8, 0.056, 0.07);
    const strip0 = scan(g0.canvas, 0.25, 0.75, 0.88, 0.995);
    const strip1 = scan(g1.canvas, 0.25, 0.75, 0.88, 0.995);
    /* scoreAutoFrame: hitam < abu polos < berwarna bergradasi */
    const mkData = (fn) => { const d = new ImageData(64, 36); for (let y = 0; y < 36; y++) for (let x = 0; x < 64; x++) { const o = (y * 64 + x) * 4; const [r, g, b2] = fn(x, y); d.data[o] = r; d.data[o + 1] = g; d.data[o + 2] = b2; d.data[o + 3] = 255; } return d; };
    const sB = scoreAutoFrame(mkData(() => [0, 0, 0]).data, 64, 36);
    const sG = scoreAutoFrame(mkData(() => [128, 128, 128]).data, 64, 36);
    const sC = scoreAutoFrame(mkData((x, y) => [40 + x * 3, 60 + y * 4, 220 - x]).data, 64, 36);
    const titles = { def: coverTitleText() };
    state.cover.title = ''; titles.fromFile = coverTitleText();
    state.cover.title = 'SERIAL UJI';
    const actAuto = !!coverActive();
    state.cover.on = false; const actOff = !!coverActive(); state.cover.on = true;
    state.cover.auto = false; const actManNoImg = !!coverActive(); state.cover.auto = true;
    return { edgeK, edgeN, mid, title, sinTop, sinLine, strip0, strip1, sB, sG, sC, titles, actAuto, actOff, actManNoImg };
  })()`);
  ok('KLASIK: bingkai amber di tepi kiri terdeteksi', c.edgeK.amber > 30, JSON.stringify(c.edgeK));
  ok('TANPA: tanpa pixel amber di tepi', c.edgeN.amber === 0, JSON.stringify(c.edgeN));
  ok('Pita tengah tetap warna adegan (merah dominan — scrim tak mengganggu)', c.mid.avg.R > 120 && c.mid.avg.R > c.mid.avg.G + 40 && c.mid.avg.R > c.mid.avg.B + 40, JSON.stringify(c.mid.avg));
  ok('Judul krem terang tercetak di pita 0.60–0.87H', c.title.bright > 120, JSON.stringify({ bright: c.title.bright }));
  ok('SINEMA: bar atas gelap + garis emas di bawahnya', c.sinTop.avg.R + c.sinTop.avg.G + c.sinTop.avg.B < 130 && c.sinLine.amber > 30, JSON.stringify({ top: c.sinTop.avg, line: c.sinLine.amber }));
  ok('Cover OTOMATIS tanpa nomor (partNum 0): strip bawah tanpa teks krem', c.strip0.bright === 0, JSON.stringify(c.strip0));
  ok('Cover OTOMATIS + PART 1: label krem tercetak di strip bawah', c.strip1.bright > 60 && c.strip1.dark > 5, JSON.stringify(c.strip1));
  ok('scoreAutoFrame: hitam < abu < berwarna (urutan benar)', c.sB < c.sG && c.sG < c.sC, `hitam=${c.sB.toFixed(3)} abu=${c.sG.toFixed(3)} warna=${c.sC.toFixed(3)}`);
  ok('coverTitleText: dari judul video dinormalisasi (garis/titik → spasi; kapital saat digambar)', c.titles.fromFile === 'UJI JUDUL cover Video' && c.titles.def === 'SERIAL UJI', JSON.stringify(c.titles));
  ok('coverActive: OTOMATIS tanpa gambar = aktif; MATI = null; MANUAL tanpa gambar = null', c.actAuto === true && c.actOff === false && c.actManNoImg === false, JSON.stringify({ actAuto: c.actAuto, actOff: c.actOff, actManNoImg: c.actManNoImg }));

  /* ============ D. EKSPOR NYATA SPLIT 3 PART OTOMATIS ============ */
  console.log('D. EKSPOR NYATA SPLIT 3 PART — TIAP PART COVER DARI ADEGAN SENDIRI');
  await cdp.eval(`(async () => {
    document.querySelector('#autoSub').checked = false;
    await loadFromPath('${ROOT}/testmedia/v37-3scn.mp4', true);
  })()`);
  await sleep(1600);
  await cdp.eval(`(() => {
    state.titleOn = false; state.descOn = false; state.subsOn = false;
    state.colorFilter = 'off'; state.vfx.vignette = false; state.vfx.grain = false;
    document.querySelector('#segRatio button[data-v="16:9"]').click();
    document.querySelector('#segAcc button[data-v="cpu"]').click();
    state.spk.on = false; state.spk.ready = false;
    document.querySelector('#segCoverDur button[data-v="2"]').click();
    document.querySelector('#segCoverPart button[data-v="PART"]').click();
    document.querySelector('#segCoverSrc button[data-v="auto"]').click();
    document.querySelector('#segCoverStyle button[data-v="KLASIK"]').click();
    const i = document.querySelector('#inCoverTitle'); i.value = 'SERIAL UJI'; if (i.oninput) i.oninput({ target: i });
    state.cover.on = true; setSegOn('segCover', 'on');
  })()`);
  await sleep(400);
  const sumD = await cdp.eval(`(() => { updateExportInfo(); return document.querySelector('#expSum').innerHTML; })()`);
  ok('Ringkasan ekspor menyebut COVER … (OTOMATIS DARI ADEGAN)', /OTOMATIS DARI ADEGAN/.test(sumD), sumD.slice(0, 200));
  const d = await cdp.eval(`(async () => {
    state.splitParts = 0; state.splitSec = 3; state._noPart = false;
    state.rangeStart = 0; state.rangeEnd = 0;
    await new Promise(r => setTimeout(r, 300));
    const res = await exportPartsToDir('${OUTS}', { prog() { }, sub() { }, title() { } });
    return { n: res.length, names: res.map(r2 => r2.name) };
  })()`);
  const mp4s = fs.readdirSync(OUTS).filter(f => /\.mp4$/.test(f)).sort();
  ok('3 part MP4 tersimpan (split 3 dtk + cover 2 dtk)', d.n === 3 && mp4s.length === 3, JSON.stringify({ d, mp4s }));
  const prs = mp4s.map(f => probe(path.join(OUTS, f)));
  ok('KETIGA part durasi = 3 + 2 = 5 dtk', prs.every(p => Math.abs(p.dur - 5) < 0.7), JSON.stringify(prs.map(p => +p.dur.toFixed(2))));
  const dm = frameDims(path.join(OUTS, mp4s[0]));
  const cc = [0, 1, 2].map(i => centerColor(path.join(OUTS, mp4s[i]), 1.0, dm.w, dm.h));
  ok('PART_01 cover = ADEGAN MERAH (rentang 0–3 dtk)', cc[0].R > 110 && cc[0].R > cc[0].G + 35 && cc[0].R > cc[0].B + 35, JSON.stringify(cc[0]));
  ok('PART_02 cover = ADEGAN HIJAU (rentang 3–6 dtk)', cc[1].G > 100 && cc[1].G > cc[1].R + 35 && cc[1].G > cc[1].B + 25, JSON.stringify(cc[1]));
  ok('PART_03 cover = ADEGAN BIRU (rentang 6–9 dtk)', cc[2].B > 95 && cc[2].B > cc[2].R + 35 && cc[2].B > cc[2].G + 25, JSON.stringify(cc[2]));
  const ambers = [0, 1, 2].map(i => bandStats(path.join(OUTS, mp4s[i]), 1.0, dm.w, dm.h, 0.015, 0.06, 0.45, 0.55));
  ok('Bingkai KLASIK amber tercetak di ketiga cover', ambers.every(x => x.amber > 20), JSON.stringify(ambers.map(x => x.amber)));
  const lbls = [0, 1, 2].map(i => bandStats(path.join(OUTS, mp4s[i]), 1.0, dm.w, dm.h, 0.25, 0.75, 0.88, 0.995));
  ok('Label PART 1/2/3 tercetak di strip bawah ketiga cover', lbls.every(x => x.bright > 60 && x.dark > 5), JSON.stringify(lbls.map(x => ({ bright: x.bright, dark: x.dark }))));
  const df12 = coverDiff(path.join(OUTS, mp4s[0]), 1.0, path.join(OUTS, mp4s[1]), 1.0, dm.w, dm.h);
  const df23 = coverDiff(path.join(OUTS, mp4s[1]), 1.0, path.join(OUTS, mp4s[2]), 1.0, dm.w, dm.h);
  ok('Cover antar part benar-benar BERBEDA (merah≠hijau≠biru, >25% piksel)', df12.diff > df12.n * 0.25 && df23.diff > df23.n * 0.25, `12=${(100 * df12.diff / df12.n).toFixed(0)}% 23=${(100 * df23.diff / df23.n).toFixed(0)}%`);

  /* ============ E. EKSPOR TUNGGAL OTOMATIS ============ */
  console.log('E. EKSPOR TUNGGAL (1 PART) — COVER OTOMATIS + PART 1');
  const e = await cdp.eval(`(async () => {
    state.splitParts = 0; state.splitSec = 30; state._noPart = true;
    await new Promise(r => setTimeout(r, 300));
    const res = await exportPartsToDir('${OUTO}', { prog() { }, sub() { }, title() { } });
    return { n: res.length };
  })()`);
  const mp4o = fs.readdirSync(OUTO).filter(f => /\.mp4$/.test(f))[0];
  const pro = probe(path.join(OUTO, mp4o));
  ok('1 file utuh 9 + 2 = 11 dtk', e.n === 1 && Math.abs(pro.dur - 11) < 0.9, `dur=${pro.dur.toFixed(2)}`);
  const dmo = frameDims(path.join(OUTO, mp4o));
  const ambE = bandStats(path.join(OUTO, mp4o), 1.0, dmo.w, dmo.h, 0.015, 0.06, 0.45, 0.55);
  ok('Cover tunggal berbingkai amber (adegan dipindai dari rentang penuh)', ambE.amber > 20, JSON.stringify(ambE));
  const ttlE = bandStats(path.join(OUTO, mp4o), 1.0, dmo.w, dmo.h, 0.2, 0.8, 0.6, 0.87);
  ok('Judul tercetak pada cover tunggal', ttlE.bright > 120, JSON.stringify({ bright: ttlE.bright }));
  const cce = centerColor(path.join(OUTO, mp4o), 1.0, dmo.w, dmo.h);
  ok('Warna cover tunggal dari adegan terbaik rentang penuh (bukan biru — skor eksposur hijau menang)', cce.G > cce.B + 25 || cce.R > cce.B + 35, JSON.stringify(cce));
  const lblE = bandStats(path.join(OUTO, mp4o), 1.0, dmo.w, dmo.h, 0.25, 0.75, 0.88, 0.995);
  ok('PART 1 tercetak pada ekspor tunggal (nomor konsisten v3.6.1)', lblE.bright > 60, JSON.stringify({ bright: lblE.bright }));

  /* ============ F. GABUNG + OTOMATIS ============ */
  console.log('F. GABUNG VIDEO — COVER OTOMATIS DI PEMBUKA, TANPA NOMOR');
  const f = await cdp.eval(`(async () => {
    state.cover.title = 'GABUNG UJI';
    const res = await exportMergeToDir(['${ROOT}/testmedia/short-a.mp4', '${ROOT}/testmedia/short-b.mp4'], '${OUTM}', { prog() { }, sub() { } });
    return { n: res.length };
  })()`);
  const mp4m = fs.readdirSync(OUTM).filter(x => /\.mp4$/.test(x))[0];
  const prm = probe(path.join(OUTM, mp4m));
  ok('Gabungan tersimpan, durasi 2 (cover) + 3 + 3 = 8 dtk', f.n === 1 && Math.abs(prm.dur - 8) < 0.9, `dur=${prm.dur.toFixed(2)}`);
  const dmm = frameDims(path.join(OUTM, mp4m));
  const ambM = bandStats(path.join(OUTM, mp4m), 0.6, dmm.w, dmm.h, 0.015, 0.06, 0.45, 0.55);
  ok('Cover gabungan berbingkai amber (disusun otomatis)', ambM.amber > 20, JSON.stringify(ambM));
  const ttlM = bandStats(path.join(OUTM, mp4m), 0.6, dmm.w, dmm.h, 0.2, 0.8, 0.6, 0.87);
  ok('Judul GABUNG UJI tercetak', ttlM.bright > 120, JSON.stringify({ bright: ttlM.bright }));
  const lblM = bandStats(path.join(OUTM, mp4m), 0.6, dmm.w, dmm.h, 0.25, 0.75, 0.88, 0.995);
  ok('Gabungan POLOS tanpa nomor part (sesuai desain — hanya garis bingkai)', lblM.bright === 0 && lblM.dark > 3, JSON.stringify(lblM));

  /* ============ G. REGRESI MANUAL ============ */
  console.log('G. REGRESI MANUAL — impor gambar kembali ke jalur v3.6.x');
  const g = await cdp.eval(`(async () => {
    const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360;
    const gg = cv.getContext('2d'); gg.fillStyle = '#00B140'; gg.fillRect(0, 0, 640, 360);
    setCoverFromDataUrl(cv.toDataURL('image/png'), 'COVER_UJI.png');
    await new Promise(r => setTimeout(r, 450));
    const r1 = { auto: state.cover.auto, on: state.cover.on, img: !!state.cover.img,
      chipM: document.querySelector('#segCoverSrc button[data-v="manual"]').classList.contains('on'),
      rowM: document.querySelector('#coverManualRow').style.display,
      boxA: document.querySelector('#coverAutoBox').style.display };
    state.cover.part = '';
    const g0 = document.createElement('canvas'); g0.width = 640; g0.height = 360;
    drawCoverFrame(g0.getContext('2d', { alpha: false }), 640, 360, 0);
    state.cover.part = 'PART';
    const g1 = document.createElement('canvas'); g1.width = 640; g1.height = 360;
    drawCoverFrame(g1.getContext('2d', { alpha: false }), 640, 360, 1);
    const scan = (cvx) => {
      const im = cvx.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, 640, 360).data;
      let bright = 0, dark = 0, green = 0;
      for (let y = Math.round(360 * 0.88); y < 358; y++) for (let x = 160; x < 480; x++) {
        const o = (y * 640 + x) * 4, r = im[o], gg2 = im[o + 1], b2 = im[o + 2];
        if (r > 180 && gg2 > 170 && b2 > 150) bright++;
        else if (r + gg2 + b2 < 190) dark++;
        if (Math.abs(r - 0) < 60 && Math.abs(gg2 - 177) < 60 && Math.abs(b2 - 64) < 60) green++;
      }
      return { bright, dark, green };
    };
    return { r1, s0: scan(g0), s1: scan(g1) };
  })()`);
  ok('Impor gambar: sumber otomatis kembali MANUAL + chip ikut', g.r1.auto === false && g.r1.chipM && g.r1.rowM !== 'none' && g.r1.boxA === 'none', JSON.stringify(g.r1));
  ok('Cover manual tetap AKTIF + gambar terpasang (jalur v3.6 utuh)', g.r1.on === true && g.r1.img, JSON.stringify({ on: g.r1.on, img: g.r1.img }));
  ok('MANUAL TANPA nomor: strip bawah hijau murni', g.s0.bright === 0 && g.s0.dark === 0 && g.s0.green > 500, JSON.stringify(g.s0));
  ok('MANUAL + PART 1: label krem tercetak (fitur v3.6.1 tetap jalan)', g.s1.bright > 80 && g.s1.dark > 10, JSON.stringify(g.s1));

  /* rapikan state */
  await cdp.eval(`state.cover.on = false; state.cover.auto = false; state.cover.title = ''; state.cover.part = 'PART';`);

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
