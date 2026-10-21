/* ================================================================
   KINOSTRA v3.5 — UJI CARA PERPINDAHAN FOKUS ZOOM PEMBICARA
   (GESER HALUS / FADE · LEBUR / LANGSUNG · CUT) — Xvfb + CDP
   Jalankan: DISPLAY=:99 node scripts/kinostra-v35-test.mjs
   Media uji: testmedia/v35-2tone.mp4 (8 dtk 640×360 — KIRI MERAH,
              KANAN BIRU 0x2222FF, sine 440Hz) → hasil pixel bisa
              dibuktikan matematis dari warna.
   Cakupan:
   A. Smoke UI chip CARA PERPINDAHAN FOKUS + default GESER
   B. Klik chip → state.spk.trans berganti (fade/langsung/geser)
   C. API spkCropAt per mode (mock timeline 2 pembicara, tukar di t=4):
      - GESER    : crop BERGERAK halus (interpolasi, perilaku lama)
      - LANGSUNG : crop LOMPAT instan di batas segmen, lalu statis
      - FADE     : crop utama statis di target baru + fadeFrom (target
                   lama) + fadeK naik 0→1, hilang setelah jendela
   D. PIXEL CANVAS via drawComposition asli (overlay dimatikan):
      merah→biru terbukti di ketiga mode (blend FADE = campuran)
   E. EKSPOR NYATA FADE 2 part (split pas di t=4) → ffprobe + ekstrak
      frame ffmpeg → campuran RGB dibuktikan dari file MP4 final
   F. EKSPOR NYATA LANGSUNG → PART_02 langsung biru pada 0.1 dtk
   ================================================================ */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project';
const OUTFADE = '/tmp/kinov35-fade', OUTCUT = '/tmp/kinov35-cut';
const PORT = 9454;
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

/* rata-rata RGB dari rawvideo rgb24 ffmpeg */
function avgRegion(buf, w, x0, rw) {
  const h = buf.length / 3 / w;
  let R = 0, G = 0, B = 0, n = 0;
  const X0 = Math.round(x0), X1 = Math.round(x0 + rw);
  for (let y = Math.round(h * 0.3); y < Math.round(h * 0.7); y += 2) {
    for (let x = X0; x < X1; x += 2) {
      const o = (y * w + x) * 3;
      R += buf[o]; G += buf[o + 1]; B += buf[o + 2]; n++;
    }
  }
  return { R: Math.round(R / n), G: Math.round(G / n), B: Math.round(B / n) };
}
function probe(mp4) {
  return {
    dim: execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 '${mp4}'`).toString().trim(),
    dur: +execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 '${mp4}'`).toString().trim()
  };
}

for (const d of [OUTFADE, OUTCUT]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
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

  /* ============ A. SMOKE ============ */
  console.log('A. SMOKE UI CARA PERPINDAHAN FOKUS');
  const a = await cdp.eval(`(() => {
    const seg = document.querySelector('#segSpkTrans');
    const btns = seg ? [...seg.querySelectorAll('button')] : [];
    return {
      seg: !!seg, n: btns.length, vals: btns.map(b => b.dataset.v),
      geserOn: btns[0] && btns[0].classList.contains('on'),
      trans: state.spk.trans,
      lbl: document.body.innerHTML.includes('CARA PERPINDAHAN FOKUS'),
      note: document.body.innerHTML.includes('FADE') && document.body.innerHTML.includes('LANGSUNG')
    };
  })()`);
  ok('Seg CARA PERPINDAHAN FOKUS ada dgn 3 chip (geser/fade/langsung)', a.seg && a.n === 3 && JSON.stringify(a.vals) === '["geser","fade","langsung"]', JSON.stringify(a.vals));
  ok('Default GESER HALUS aktif (chip + state.spk.trans)', a.geserOn && a.trans === 'geser');
  ok('Label + note menjelaskan FADE & LANGSUNG', a.lbl && a.note);

  /* ============ B. KLIK CHIP ============ */
  console.log('B. KLIK CHIP → STATE BERGANTI');
  const b = await cdp.eval(`(() => {
    const cl = v => document.querySelector('#segSpkTrans button[data-v="' + v + '"]').click();
    const r = {};
    cl('fade'); r.fade = { st: state.spk.trans, on: document.querySelector('#segSpkTrans button[data-v="fade"]').classList.contains('on') };
    cl('langsung'); r.cut = { st: state.spk.trans, on: document.querySelector('#segSpkTrans button[data-v="langsung"]').classList.contains('on') };
    cl('geser'); r.geser = { st: state.spk.trans, on: document.querySelector('#segSpkTrans button[data-v="geser"]').classList.contains('on') };
    return r;
  })()`);
  ok('Klik FADE → state.spk.trans = "fade" + chip nyala', b.fade.st === 'fade' && b.fade.on, JSON.stringify(b.fade));
  ok('Klik LANGSUNG → state.spk.trans = "langsung"', b.cut.st === 'langsung' && b.cut.on, JSON.stringify(b.cut));
  ok('Klik GESER → kembali "geser" (default)', b.geser.st === 'geser' && b.geser.on, JSON.stringify(b.geser));

  /* ============ C. API spkCropAt (MOCK TIMELINE) ============ */
  console.log('C. API spkCropAT PER MODE (mock 2 pembicara, tukar di t=4)');
  await cdp.eval(`(async () => {
    document.querySelector('#autoSub').checked = false;
    await loadFromPath('${ROOT}/testmedia/v35-2tone.mp4', true);
  })()`);
  await sleep(1200);
  const c = await cdp.eval(`(() => {
    /* mock hasil analisis: PEMBICARA 1 di kiri (merah), 2 di kanan (biru);
       kotak kecil (w 0.10, h 0.30) agar crop pas 9:16 (zoom < 3.2×) */
    state.spk.on = true; state.spk.ready = true;
    state.spk.epoch = state.mediaEpoch || 0;
    state.spk.nSpeak = 2;
    const mk = (x) => ({ id: x < 0.5 ? 0 : 1, label: x < 0.5 ? 'PEMBICARA 1' : 'PEMBICARA 2', avgX: x + 0.05, med: 0.01,
      samples: [ { t: 0, x, y: 0.35, w: 0.10, h: 0.30, m: 0.01 }, { t: 8, x, y: 0.35, w: 0.10, h: 0.30, m: 0.01 } ] });
    state.spk.tracks = [mk(0.05), mk(0.85)];
    state.spk.timeline = [ { t0: 0, t1: 4, idx: 0 }, { t0: 4, t1: 8, idx: 1 } ];
    const W = 360, H = 640, VW = 640, VH = 360;
    const r = {};
    /* GESER — perilaku lama: crop bergerak halus */
    state.spk.trans = 'geser';
    r.geser = {
      before: spkCropAt(VW, VH, W, H, 3.9), mid: spkCropAt(VW, VH, W, H, 4.35), after: spkCropAt(VW, VH, W, H, 4.9)
    };
    r.geser.midMoves = r.geser.mid.sx > Math.min(r.geser.before.sx, r.geser.after.sx) && r.geser.mid.sx < Math.max(r.geser.before.sx, r.geser.after.sx);
    r.geser.noFade = !r.geser.mid.fadeFrom;
    /* LANGSUNG — lompat instan */
    state.spk.trans = 'langsung';
    r.cut = { at: spkCropAt(VW, VH, W, H, 4.01), late: spkCropAt(VW, VH, W, H, 7.9), pre: spkCropAt(VW, VH, W, H, 3.99) };
    r.cut.jumps = r.cut.at.sx === r.cut.late.sx && r.cut.at.sx !== r.cut.pre.sx;
    r.cut.noFade = !r.cut.at.fadeFrom;
    /* FADE — dua rect + fadeK */
    state.spk.trans = 'fade';
    const f1 = spkCropAt(VW, VH, W, H, 4.05), f2 = spkCropAt(VW, VH, W, H, 4.3), f3 = spkCropAt(VW, VH, W, H, 4.52), f4 = spkCropAt(VW, VH, W, H, 4.62);
    r.fade = { f1, f2, f3, f4 };
    r.fade.hasBlend = !!f1.fadeFrom && !!f2.fadeFrom && !!f3.fadeFrom;
    r.fade.kRises = f1.fadeK < f2.fadeK && f2.fadeK < f3.fadeK && f3.fadeK < 1;
    r.fade.kEnd = f4.fadeK === undefined || f4.fadeK >= 1;
    r.fade.mainStatic = f1.sx === f2.sx && f2.sx === f3.sx;                 /* crop utama = target baru (statis) */
    r.fade.fromStatic = f1.fadeFrom.sx === f2.fadeFrom.sx && f2.fadeFrom.sx === f3.fadeFrom.sx;
    r.fade.diffRects = f1.sx !== f1.fadeFrom.sx;                            /* dua bingkai beda posisi */
    /* sebelum segmen 2: tanpa fade */
    r.fade.preClean = !spkCropAt(VW, VH, W, H, 3.5).fadeFrom;
    /* urutan benar: fadeFrom = sisi kiri (merah), main = kanan (biru) */
    r.fade.leftToRight = f1.fadeFrom.sx < f1.sx;
    /* tengah segmen: ketiga mode hasil crop identik (target sama) */
    state.spk.trans = 'geser'; const g1 = spkCropAt(VW, VH, W, H, 2.0);
    state.spk.trans = 'langsung'; const c1 = spkCropAt(VW, VH, W, H, 2.0);
    state.spk.trans = 'fade'; const d1 = spkCropAt(VW, VH, W, H, 2.0);
    r.midSame = g1.sx === c1.sx && c1.sx === d1.sx && g1.sw === c1.sw;
    return r;
  })()`);
  ok('GESER: crop bergerak halus antara 2 target (perilaku lama) + tanpa fade', c.geser.midMoves && c.geser.noFade, JSON.stringify(c.geser));
  ok('LANGSUNG: lompat instan di t=4.01, statis sampai akhir', c.cut.jumps && c.cut.noFade, JSON.stringify(c.cut));
  ok('FADE: fadeFrom + fadeK muncul selama jendela 0.55 dtk', c.fade.hasBlend && c.fade.kRises, JSON.stringify({ f1: c.fade.f1.fadeK, f2: c.fade.f2.fadeK, f3: c.fade.f3.fadeK }));
  ok('FADE: setelah jendela — blend hilang (crop murni)', c.fade.kEnd, JSON.stringify(c.fade.f4));
  ok('FADE: crop utama & fadeFrom statis (TANPA gerakan kamera)', c.fade.mainStatic && c.fade.fromStatic, JSON.stringify({ main: c.fade.f1.sx, from: c.fade.f1.fadeFrom.sx }));
  ok('FADE: dua bingkai beda posisi, dari kiri (merah) → kanan (biru)', c.fade.diffRects && c.fade.leftToRight, JSON.stringify({ main: c.fade.f1.sx, from: c.fade.f1.fadeFrom.sx }));
  ok('FADE: sebelum batas segmen tidak ada blend', c.fade.preClean);
  ok('Tengah segmen: ketiga mode menghasilkan crop identik', c.midSame);

  /* ============ D. PIXEL via drawComposition ============ */
  console.log('D. PIXEL drawComposition (overlay mati) — merah→biru');
  const d = await cdp.eval(`(async () => {
    state.titleOn = false; state.descOn = false; state.subsOn = false; state._noPart = true;
    state.colorFilter = 'off'; state.vfx.vignette = false; state.vfx.grain = false;
    document.querySelector('#segRatio button[data-v="9:16"]').click();
    await new Promise(r2 => setTimeout(r2, 150));
    const W = 360, H = 640;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true });
    const seek = t => new Promise(res => { const v = videoEl; const done = () => { v.removeEventListener('seeked', done); res(); }; v.addEventListener('seeked', done); v.currentTime = t; });
    const shot = async (t) => { await seek(t); await new Promise(r2 => requestAnimationFrame(r2)); drawComposition(g, W, H, t); return g.getImageData(0, 0, W, H).data; };
    const avg = (im, x0, x1) => { let R = 0, G = 0, B = 0, n = 0; for (let y = H * 0.3 | 0; y < H * 0.7; y += 3) for (let x = x0 | 0; x < x1; x += 3) { const o = (y * W + x) * 4; R += im[o]; G += im[o + 1]; B += im[o + 2]; n++; } return { R: Math.round(R / n), G: Math.round(G / n), B: Math.round(B / n) }; };
    const out = {};
    state.spk.trans = 'geser'; out.geserMid = avg(await shot(2.0), 0, W);
    state.spk.trans = 'langsung'; out.cutEarly = avg(await shot(4.15), 0, W);
    state.spk.trans = 'fade';
    out.fadeEarly = avg(await shot(4.1), 0, W);
    out.fadeMid = avg(await shot(4.3), 0, W);
    out.fadeEnd = avg(await shot(4.9), 0, W);
    document.querySelector('#segRatio button[data-v="16:9"]').click();
    await new Promise(r2 => setTimeout(r2, 150));
    return out;
  })()`);
  const isRed = p => p.R > 150 && p.B < 110, isBlue = p => p.B > 150 && p.R < 110, isMix = p => p.R > 60 && p.B > 60;
  ok('GESER t=2.0 → kiri MERAH (pembicara 1)', isRed(d.geserMid), JSON.stringify(d.geserMid));
  ok('LANGSUNG t=4.15 → sudah BIRU penuh (potong instan)', isBlue(d.cutEarly), JSON.stringify(d.cutEarly));
  ok('FADE t=4.1 → masih merah dominan (lebur baru mulai)', isRed(d.fadeEarly), JSON.stringify(d.fadeEarly));
  ok('FADE t=4.3 → CAMPURAN merah+biru (melebur, bukan geser)', isMix(d.fadeMid) && !isRed(d.fadeMid) && !isBlue(d.fadeMid), JSON.stringify(d.fadeMid));
  ok('FADE t=4.9 → biru penuh (lebur selesai)', isBlue(d.fadeEnd), JSON.stringify(d.fadeEnd));

  /* ============ E. EKSPOR NYATA FADE ============ */
  console.log('E. EKSPOR NYATA MODE FADE — 2 PART (split di t=4)');
  const e = await cdp.eval(`(async () => {
    state.spk.trans = 'fade';
    document.querySelector('#segRatio button[data-v="9:16"]').click();   /* kembali 9:16 utk crop vertikal */
    document.querySelector('#segAcc button[data-v="cpu"]').click();
    state.splitParts = 0; state.splitSec = 4; state.rangeStart = 0; state.rangeEnd = 0;
    await new Promise(r2 => setTimeout(r2, 300));
    const res = await exportPartsToDir('${OUTFADE}', { prog() { }, sub() { }, title() { } });
    return { n: res.length, names: res.map(r2 => r2.name) };
  })()`);
  const mp4sF = fs.readdirSync(OUTFADE).filter(f => /\.mp4$/.test(f)).sort();
  ok('2 part MP4 tersimpan (mode fade)', e.n === 2 && mp4sF.length === 2, JSON.stringify({ e, mp4sF }));
  const prF = mp4sF.map(fl => probe(path.join(OUTFADE, fl)));
  ok('ffprobe part valid (dim sama, durasi ±4 dtk)', prF.every(p => p.dim === prF[0].dim) && prF.every(p => Math.abs(p.dur - 4) < 0.6), JSON.stringify(prF));
  const Wout = +prF[0].dim.split(',')[0];
  const fc = (file, ts) => {
    const raw = execSync(`ffmpeg -v error -ss ${ts} -i '${file}' -frames:v 1 -f rawvideo -pix_fmt rgb24 -`, { maxBuffer: 64e6, encoding: 'buffer' });
    const w = Math.round(Math.sqrt(raw.length / 3 * (Wout / +prF[0].dim.split(',')[1])));
    const h = raw.length / 3 / w;
    const avg = (x0, x1) => { let R = 0, G = 0, B = 0, n = 0; for (let y = h * 0.35 | 0; y < h * 0.65; y += 2) for (let x = x0 | 0; x < x1; x += 2) { const o = (y * w + x) * 3; R += raw[o]; G += raw[o + 1]; B += raw[o + 2]; n++; } return { R: Math.round(R / n), G: Math.round(G / n), B: Math.round(B / n) }; };
    return { early: avg(0, w / 3), mid: avg(w / 3, w * 2 / 3), right: avg(w * 2 / 3, w) };
  };
  const p1 = fc(path.join(OUTFADE, mp4sF[0]), 2.0), p2e = fc(path.join(OUTFADE, mp4sF[1]), 0.12), p2m = fc(path.join(OUTFADE, mp4sF[1]), 0.3), p2l = fc(path.join(OUTFADE, mp4sF[1]), 0.8);
  ok('PART_01 @2.0 → MERAH (pembicara kiri)', isRed(p1.early) || isRed(p1.mid), JSON.stringify(p1));
  ok('PART_02 @0.12 → merah dominan (lebur baru mulai)', isRed(p2e.early) || isRed(p2e.mid), JSON.stringify(p2e));
  ok('PART_02 @0.3 → campuran merah+biru (bukti FADE di file final)', isMix(p2m.early) && isMix(p2m.right), JSON.stringify(p2m));
  ok('PART_02 @0.8 → BIRU penuh (pembicara kanan)', isBlue(p2l.early) && isBlue(p2l.right), JSON.stringify(p2l));

  /* ============ F. EKSPOR NYATA LANGSUNG ============ */
  console.log('F. EKSPOR NYATA MODE LANGSUNG — 2 PART');
  const f = await cdp.eval(`(async () => {
    state.spk.trans = 'langsung';
    await new Promise(r2 => setTimeout(r2, 200));
    const res = await exportPartsToDir('${OUTCUT}', { prog() { }, sub() { }, title() { } });
    return { n: res.length };
  })()`);
  const mp4sC = fs.readdirSync(OUTCUT).filter(x => /\.mp4$/.test(x)).sort();
  ok('2 part MP4 tersimpan (mode langsung)', f.n === 2 && mp4sC.length === 2, JSON.stringify({ f, mp4sC }));
  const rawC = execSync(`ffmpeg -v error -ss 0.1 -i '${path.join(OUTCUT, mp4sC[1])}' -frames:v 1 -f rawvideo -pix_fmt rgb24 -`, { maxBuffer: 64e6, encoding: 'buffer' });
  const wC = Math.round(Math.sqrt(rawC.length / 3 * (Wout / +prF[0].dim.split(',')[1])));
  const hC = rawC.length / 3 / wC;
  const avgC = (x0, x1) => { let R = 0, G = 0, B = 0, n = 0; for (let y = hC * 0.35 | 0; y < hC * 0.65; y += 2) for (let x = x0 | 0; x < x1; x += 2) { const o = (y * wC + x) * 3; R += rawC[o]; G += rawC[o + 1]; B += rawC[o + 2]; n++; } return { R: Math.round(R / n), G: Math.round(G / n), B: Math.round(B / n) }; };
  const cutEarly = { early: avgC(0, wC / 3), right: avgC(wC * 2 / 3, wC) };
  ok('LANGSUNG: PART_02 @0.1 → BIRU penuh seketika (TANPA lebur)', isBlue(cutEarly.early) && isBlue(cutEarly.right), JSON.stringify(cutEarly));

  /* rapikan state mock utk pencegahan dampak ke sesi lain (matikan spk) */
  await cdp.eval(`state.spk.on = false; state.spk.ready = false; state._noPart = false;`);

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
