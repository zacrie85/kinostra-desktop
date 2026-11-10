/* ================================================================
   KINOSTRA v3.8.0 — UJI 1 SAMPUL SEMUA PART (modul 08B, scope single)
   Jalankan: bash scripts/run-test-xvfb.sh scripts/kinostra-v38-test.mjs
   Media uji: testmedia/v38-3scn12.mp4 — 12 dtk, 3 adegan warna solid
   (merah 0–4 dtk, hijau 4–8, biru 8–12). Scope SINGLE memindai window
   menit 5–7 → untuk 12 dtk = clamp [4.2, 10.2] (hijau+biru saja) →
   SEMUA part WAJIB memakai sampul yang sama (bukan merah, saling mirip
   <4% piksel beda, hanya digit label berbeda). Mode PER PART (v3.7)
   dipakai sebagai kontras: merah/hijau/biru per part, >25% beda.
   Cakupan:
   A. Smoke UI: segCoverSrc 3 chip (MANUAL/OTOMATIS TIAP PART/1 SAMPUL
      SEMUA PART), default MANUAL, scope default 'part', header v3.8.0
   B. Mode switch: single → auto+scope single + status "1 SAMPUL";
      AKTIF tanpa gambar diterima; auto → scope part; kembali manual
   C. EKSPOR NYATA SINGLE: split 3 part — ketiganya cover SAMA (mirip),
      bukan merah (window 4.2–10.2 tak menyentuh adegan merah), amber +
      judul + label PART 1/2/3 tetap per part
   D. EKSPOR NYATA PER PART (kontras v3.7): merah/hijau/biru, >25% beda
   E. GABUNG + single: cover pembuka otomatis, polos tanpa nomor
   F. Regresi MANUAL: impor gambar → auto mati, label v3.6.1 tetap jalan
   ================================================================ */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project';
const OUTS1 = '/tmp/kinov38-single', OUTS2 = '/tmp/kinov38-perpart', OUTM = '/tmp/kinov38-merge';
const PORT = 9481;
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
function centerColor(file, ts, w, h) {
  const raw = rawAt(file, ts);
  let R = 0, G = 0, B = 0, n = 0;
  for (let y = Math.round(h * 0.35); y < h * 0.55; y += 2) for (let x = Math.round(w * 0.3); x < w * 0.7; x += 2) {
    const o = (y * w + x) * 3; R += raw[o]; G += raw[o + 1]; B += raw[o + 2]; n++;
  }
  return { R: Math.round(R / n), G: Math.round(G / n), B: Math.round(B / n) };
}
function coverDiff(fileA, tsA, fileB, tsB, w, h) {
  const a = rawAt(fileA, tsA), b = rawAt(fileB, tsB);
  let diff = 0, n = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    const o = (y * w + x) * 3; n++;
    if (Math.abs(a[o] - b[o]) > 24 || Math.abs(a[o + 1] - b[o + 1]) > 24 || Math.abs(a[o + 2] - b[o + 2]) > 24) diff++;
  }
  return { diff, n };
}
const mirip = (c1, c2, tol) => Math.abs(c1.R - c2.R) < tol && Math.abs(c1.G - c2.G) < tol && Math.abs(c1.B - c2.B) < tol;
const bukanMerah = c => !(c.R > c.G + 35 && c.R > c.B + 35);

for (const d of [OUTS1, OUTS2, OUTM]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
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
  console.log('A. SMOKE UI — 3 SUMBER COVER');
  const a = await cdp.eval(`(() => {
    const q = s => document.querySelector(s);
    const src = q('#segCoverSrc');
    const sb = src ? [...src.querySelectorAll('button')] : [];
    return {
      sVals: sb.map(b => b.dataset.v), sDef: sb.find(b => b.dataset.v === 'manual')?.classList.contains('on'),
      sTxt: sb.map(b => b.textContent.trim()),
      scope: state.cover.scope, auto: state.cover.auto,
      lbl: (q('#m8b .mod-h .t') || {}).textContent || ''
    };
  })()`);
  ok('Chip SUMBER COVER ada 3: manual/auto/single, default MANUAL', JSON.stringify(a.sVals) === JSON.stringify(['manual', 'auto', 'single']) && a.sDef, JSON.stringify(a.sVals));
  ok('Label chip jelas: OTOMATIS TIAP PART & 1 SAMPUL SEMUA PART', /OTOMATIS TIAP PART/.test(a.sTxt[1] || '') && /1 SAMPUL SEMUA PART/.test(a.sTxt[2] || ''), JSON.stringify(a.sTxt));
  ok('Default: auto false, scope "part" (perilaku v3.7 utuh)', a.auto === false && a.scope === 'part', JSON.stringify({ auto: a.auto, scope: a.scope }));
  ok('Modul 08B bertanda DIPERBARUI v3.8.0', a.lbl.includes('v3.8.0'), a.lbl);

  /* ============ B. GANTI MODE ============ */
  console.log('B. GANTI MODE — single → AKTIF → auto → manual');
  const b = await cdp.eval(`(() => {
    const q = s => document.querySelector(s);
    const cl = s => q(s).click();
    const r = {};
    cl('#segCoverSrc button[data-v="single"]');
    r.single = { auto: state.cover.auto, scope: state.cover.scope, stat: q('#coverStat').textContent };
    cl('#segCover button[data-v="on"]');
    r.on = { st: state.cover.on, stat: q('#coverStat').textContent };
    cl('#segCoverSrc button[data-v="auto"]');
    r.auto = { auto: state.cover.auto, scope: state.cover.scope, stat: q('#coverStat').textContent };
    cl('#segCoverSrc button[data-v="single"]');
    r.backSingle = { auto: state.cover.auto, scope: state.cover.scope };
    cl('#segCoverSrc button[data-v="manual"]');
    r.manual = { auto: state.cover.auto, scope: state.cover.scope, on: state.cover.on,
      chipOff: q('#segCover button[data-v="off"]').classList.contains('on') };
    cl('#segCover button[data-v="on"]');
    r.reject = { on: state.cover.on, chipOff: q('#segCover button[data-v="off"]').classList.contains('on') };
    return r;
  })()`);
  ok('Klik 1 SAMPUL SEMUA PART: auto=true + scope="single" + status menyebut 1 SAMPUL', b.single.auto === true && b.single.scope === 'single' && /1 SAMPUL SEMUA PART/.test(b.single.stat), JSON.stringify(b.single));
  ok('AKTIF diterima tanpa gambar di mode single', b.on.st === true && /AKTIF/.test(b.on.stat), JSON.stringify({ on: b.on.st }));
  ok('Klik OTOMATIS TIAP PART: scope kembali "part" (v3.7)', b.auto.auto === true && b.auto.scope === 'part' && /OTOMATIS TIAP PART/.test(b.auto.stat), JSON.stringify(b.auto));
  ok('Bolak-balik single ↔ auto stabil', b.backSingle.auto === true && b.backSingle.scope === 'single', JSON.stringify(b.backSingle));
  ok('Kembali MANUAL: auto mati + scope reset + cover tanpa gambar MATI', b.manual.auto === false && b.manual.scope === 'part' && b.manual.on === false && b.manual.chipOff, JSON.stringify(b.manual));
  ok('AKTIF tetap ditolak bila MANUAL tanpa gambar', b.reject.on === false && b.reject.chipOff, JSON.stringify(b.reject));

  /* ============ C. EKSPOR NYATA — 1 SAMPUL SEMUA PART ============ */
  console.log('C. EKSPOR NYATA SPLIT 3 PART — SATU SAMPUL DIPAKAI SEMUA PART');
  await cdp.eval(`(async () => {
    document.querySelector('#autoSub').checked = false;
    await loadFromPath('${ROOT}/testmedia/v38-3scn12.mp4', true);
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
    document.querySelector('#segCoverSrc button[data-v="single"]').click();
    document.querySelector('#segCoverStyle button[data-v="KLASIK"]').click();
    const i = document.querySelector('#inCoverTitle'); i.value = 'SERIAL UJI'; if (i.oninput) i.oninput({ target: i });
    state.cover.on = true; setSegOn('segCover', 'on');
  })()`);
  await sleep(400);
  const sumC = await cdp.eval(`(() => { state.splitParts = 0; state.splitSec = 4; state._noPart = false; state.rangeStart = 0; state.rangeEnd = 0; updateExportInfo(); return document.querySelector('#expSum').innerHTML; })()`);
  ok('Ringkasan ekspor menyebut (OTOMATIS DARI ADEGAN · 1 SAMPUL)', /OTOMATIS DARI ADEGAN · 1 SAMPUL/.test(sumC), sumC.slice(0, 220));
  const c = await cdp.eval(`(async () => {
    await new Promise(r => setTimeout(r, 300));
    const res = await exportPartsToDir('${OUTS1}', { prog() { }, sub() { }, title() { } });
    return { n: res.length, names: res.map(r2 => r2.name) };
  })()`);
  const mp4s1 = fs.readdirSync(OUTS1).filter(f => /\.mp4$/.test(f)).sort();
  ok('3 part MP4 tersimpan (split 4 dtk + cover 2 dtk)', c.n === 3 && mp4s1.length === 3, JSON.stringify({ c, mp4s1 }));
  const prs1 = mp4s1.map(f => probe(path.join(OUTS1, f)));
  ok('KETIGA part durasi = 4 + 2 = 6 dtk', prs1.every(p => Math.abs(p.dur - 6) < 0.7), JSON.stringify(prs1.map(p => +p.dur.toFixed(2))));
  const dm = frameDims(path.join(OUTS1, mp4s1[0]));
  const cc1 = [0, 1, 2].map(i => centerColor(path.join(OUTS1, mp4s1[i]), 1.0, dm.w, dm.h));
  ok('Cover PART_01 BUKAN adegan merah-nya (window menit-5-7 clamp tak menyentuh 0–4 dtk merah)', bukanMerah(cc1[0]), JSON.stringify(cc1[0]));
  ok('Cover PART_02 juga bukan merah — SAMPA SAMA dgn PART_01', bukanMerah(cc1[1]) && mirip(cc1[0], cc1[1], 35), JSON.stringify({ p1: cc1[0], p2: cc1[1] }));
  ok('Cover PART_03 juga bukan merah — SAMPA SAMA dgn PART_01 & PART_02', bukanMerah(cc1[2]) && mirip(cc1[0], cc1[2], 35) && mirip(cc1[1], cc1[2], 35), JSON.stringify({ p3: cc1[2] }));
  const df12 = coverDiff(path.join(OUTS1, mp4s1[0]), 1.0, path.join(OUTS1, mp4s1[1]), 1.0, dm.w, dm.h);
  const df23 = coverDiff(path.join(OUTS1, mp4s1[1]), 1.0, path.join(OUTS1, mp4s1[2]), 1.0, dm.w, dm.h);
  ok('Sampul antar part NYARIS IDENTIK (<4% piksel beda — hanya digit label)', df12.diff < df12.n * 0.04 && df23.diff < df23.n * 0.04, `12=${(100 * df12.diff / df12.n).toFixed(2)}% 23=${(100 * df23.diff / df23.n).toFixed(2)}%`);
  const ambs = [0, 1, 2].map(i => bandStats(path.join(OUTS1, mp4s1[i]), 1.0, dm.w, dm.h, 0.015, 0.06, 0.45, 0.55));
  ok('Bingkai KLASIK amber di ketiga part', ambs.every(x => x.amber > 20), JSON.stringify(ambs.map(x => x.amber)));
  const lbls = [0, 1, 2].map(i => bandStats(path.join(OUTS1, mp4s1[i]), 1.0, dm.w, dm.h, 0.25, 0.75, 0.88, 0.995));
  ok('Label PART 1/2/3 tetap tercetak di bawah judul tiap part (nomor tetap otomatis)', lbls.every(x => x.bright > 60 && x.dark > 5), JSON.stringify(lbls.map(x => ({ bright: x.bright, dark: x.dark }))));
  const ttlC = bandStats(path.join(OUTS1, mp4s1[0]), 1.0, dm.w, dm.h, 0.2, 0.8, 0.6, 0.87);
  ok('Judul SERIAL UJI tercetak di sampul', ttlC.bright > 120, JSON.stringify({ bright: ttlC.bright }));

  /* ============ D. KONTRAS — OTOMATIS TIAP PART (v3.7) ============ */
  console.log('D. KONTRAS OTOMATIS TIAP PART — MERAH/HIJAU/BIRU PER PART');
  await cdp.eval(`document.querySelector('#segCoverSrc button[data-v="auto"]').click();`);
  await sleep(300);
  const d = await cdp.eval(`(async () => {
    const res = await exportPartsToDir('${OUTS2}', { prog() { }, sub() { }, title() { } });
    return { n: res.length };
  })()`);
  const mp4s2 = fs.readdirSync(OUTS2).filter(f => /\.mp4$/.test(f)).sort();
  ok('3 part MP4 mode TIAP PART tersimpan', d.n === 3 && mp4s2.length === 3, JSON.stringify({ d, mp4s2 }));
  const cc2 = [0, 1, 2].map(i => centerColor(path.join(OUTS2, mp4s2[i]), 1.0, dm.w, dm.h));
  ok('PER PART: PART_01 = MERAH adegannya sendiri', cc2[0].R > 110 && cc2[0].R > cc2[0].G + 35 && cc2[0].R > cc2[0].B + 35, JSON.stringify(cc2[0]));
  ok('PER PART: PART_02 = HIJAU, PART_03 = BIRU (adegan masing-masing)', cc2[1].G > 100 && cc2[1].G > cc2[1].R + 35 && cc2[2].B > 95 && cc2[2].B > cc2[2].R + 35, JSON.stringify([cc2[1], cc2[2]]));
  const dfp = coverDiff(path.join(OUTS2, mp4s2[0]), 1.0, path.join(OUTS2, mp4s2[1]), 1.0, dm.w, dm.h);
  ok('PER PART: cover antar part SANGAT BERBEDA (>25%) — kontras dgn single (<4%)', dfp.diff > dfp.n * 0.25, `diff=${(100 * dfp.diff / dfp.n).toFixed(0)}%`);

  /* ============ E. GABUNG + SINGLE ============ */
  console.log('E. GABUNG VIDEO — COVER OTOMATIS PEMBUKA (single), TANPA NOMOR');
  const e = await cdp.eval(`(async () => {
    const res = await exportMergeToDir(['${ROOT}/testmedia/short-a.mp4', '${ROOT}/testmedia/short-b.mp4'], '${OUTM}', { prog() { }, sub() { } });
    return { n: res.length };
  })()`);
  const mp4m = fs.readdirSync(OUTM).filter(x => /\.mp4$/.test(x))[0];
  const prm = probe(path.join(OUTM, mp4m));
  ok('Gabungan tersimpan, durasi 2 (cover) + 3 + 3 = 8 dtk', e.n === 1 && Math.abs(prm.dur - 8) < 0.9, `dur=${prm.dur.toFixed(2)}`);
  const dmm = frameDims(path.join(OUTM, mp4m));
  const ambM = bandStats(path.join(OUTM, mp4m), 0.6, dmm.w, dmm.h, 0.015, 0.06, 0.45, 0.55);
  ok('Cover gabungan berbingkai amber (disusun otomatis dari film pertama)', ambM.amber > 20, JSON.stringify(ambM));
  const lblM = bandStats(path.join(OUTM, mp4m), 0.6, dmm.w, dmm.h, 0.25, 0.75, 0.88, 0.995);
  ok('Gabungan POLOS tanpa nomor part (sesuai desain)', lblM.bright === 0 && lblM.dark > 3, JSON.stringify(lblM));

  /* ============ F. REGRESI MANUAL ============ */
  console.log('F. REGRESI MANUAL — jalur v3.6.x tetap utuh');
  const g = await cdp.eval(`(async () => {
    const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360;
    const gg = cv.getContext('2d'); gg.fillStyle = '#00B140'; gg.fillRect(0, 0, 640, 360);
    setCoverFromDataUrl(cv.toDataURL('image/png'), 'COVER_UJI.png');
    await new Promise(r => setTimeout(r, 450));
    const r1 = { auto: state.cover.auto, scope: state.cover.scope, on: state.cover.on, img: !!state.cover.img,
      chipM: document.querySelector('#segCoverSrc button[data-v="manual"]').classList.contains('on') };
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
        const o = (y * 640 + x) * 4, r = im[o], g2 = im[o + 1], b2 = im[o + 2];
        if (r > 180 && g2 > 170 && b2 > 150) bright++;
        else if (r + g2 + b2 < 190) dark++;
        if (Math.abs(r - 0) < 60 && Math.abs(g2 - 177) < 60 && Math.abs(b2 - 64) < 60) green++;
      }
      return { bright, dark, green };
    };
    return { r1, s0: scan(g0), s1: scan(g1) };
  })()`);
  ok('Impor gambar: sumber kembali MANUAL + chip ikut + cover tetap AKTIF', g.r1.auto === false && g.r1.scope === 'part' && g.r1.chipM && g.r1.on === true && g.r1.img, JSON.stringify(g.r1));
  ok('MANUAL TANPA nomor: strip bawah hijau murni', g.s0.bright === 0 && g.s0.dark === 0 && g.s0.green > 500, JSON.stringify(g.s0));
  ok('MANUAL + PART 1: label krem tercetak (fitur v3.6.1 tetap jalan)', g.s1.bright > 80 && g.s1.dark > 10, JSON.stringify(g.s1));

  /* rapikan state */
  await cdp.eval(`state.cover.on = false; state.cover.auto = false; state.cover.scope = 'part'; state.cover.title = ''; state.cover.part = 'PART';`);

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
