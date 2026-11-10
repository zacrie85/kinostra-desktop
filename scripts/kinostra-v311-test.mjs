/* ================================================================
   KINOSTRA v3.11.0 — UJI MESIN COVER NOVACUT (port dari NOVACUT Studio)
   Jalankan: bash scripts/run-test-xvfb.sh scripts/kinostra-v311-test.mjs
   Media uji: testmedia/v38-3scn12.mp4 — 12 dtk, 640×360, 30fps,
   h264+aac, 3 adegan warna solid (merah 0–4, hijau 4–8, biru 8–12).
   Cakupan:
   A. Smoke UI: 10 chip LAYOUT + 10 chip PALET + LATAR/BINGKAI/EFEK +
      animasi cover (9 chip ×2) + animasi video (9 chip ×2) + 29 chip
      TRANSISI (TANPA + 28) + slider durasi transisi + default state
   B. Unit render: 10 layout × 10 palet menghasilkan cover dengan
      aksen palet masing-masing; ncTextState (slam/typewriter/rise);
      kenburns; SEMUA 28 transisi menghasilkan frame tengah unik &
      ujung p=0/p=1 persis cover/video (kecuali pixelate ≥2px)
   C. COMPOSE animasi: judul & PART di video masuk dengan animasi
      (frame awal ≠ frame settled) — dan identik saat TANPA
   D. EKSPOR NYATA: cover manual HIJAU + layout NEON + palet GOLD +
      bingkai KLASIK + transisi FLASH + animasi judul FADE → 3 part:
      durasi 5 dtk, cover hijau + badge PART, kilat putih di tengah
      transisi, isi merah/hijau/biru, judul fade-in terverifikasi
   E. Gerbang POTONG LANGSUNG: cover aktif → terblokir dengan alasan
   ================================================================ */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project';
const OUT1 = '/tmp/kinov311-nc', OUTM = '/tmp/kinov311-merge';
const PORT = 9495;
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
  const tmp = '/tmp/ncframe.raw';
  execSync(`ffmpeg -y -v error -ss ${ts} -i '${file}' -frames:v 1 -f rawvideo -pix_fmt rgb24 '${tmp}'`);
  return fs.readFileSync(tmp);
}
function bandStats(file, ts, w, h, x0f, x1f, y0f, y1f) {
  const raw = rawAt(file, ts);
  const y0 = Math.round(h * y0f), y1 = Math.min(h - 1, Math.round(h * y1f));
  const x0 = Math.round(w * x0f), x1 = Math.round(w * x1f);
  let bright = 0, green = 0, n = 0, luma = 0;
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
    const o = (y * w + x) * 3, R = raw[o], G = raw[o + 1], B = raw[o + 2];
    if (R > 180 && G > 170 && B > 150) bright++;
    if (G > 90 && G > R + 30 && G > B + 30) green++;
    luma += 0.299 * R + 0.587 * G + 0.114 * B;
    n++;
  }
  return { bright, green, luma: Math.round(luma / Math.max(1, n)), n };
}
function centerColor(file, ts, w, h) {
  const raw = rawAt(file, ts);
  let R = 0, G = 0, B = 0, n = 0;
  for (let y = Math.round(h * 0.35); y < h * 0.55; y += 2) for (let x = Math.round(w * 0.3); x < w * 0.7; x += 2) {
    const o = (y * w + x) * 3; R += raw[o]; G += raw[o + 1]; B += raw[o + 2]; n++;
  }
  return { R: Math.round(R / n), G: Math.round(G / n), B: Math.round(B / n) };
}

for (const d of [OUT1, OUTM]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
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
  console.log('A. SMOKE UI — MESIN COVER NOVACUT');
  const a = await cdp.eval(`(() => {
    const q = s => document.querySelector(s);
    const chips = id => [...q('#' + id).querySelectorAll('button')].map(b => b.dataset.v);
    const animBtns = id => [...q('#' + id).querySelectorAll('button')].map(b => ({ v: b.dataset.v, on: b.classList.contains('on') }));
    return {
      layouts: chips('coverLayoutChips'), palettes: chips('coverPaletteChips'),
      transAll: [...document.querySelectorAll('#coverTransChips .fchip')].map(b => b.dataset.v),
      animCoverT: animBtns('segCoverTitleAnim'), animCoverP: animBtns('segCoverPartAnim'),
      animTitle: animBtns('segTitleAnim'), animPart: animBtns('segPartAnim'),
      bgVals: chips('segCoverBg'), frameVals: chips('segCoverFrame'), fxVals: chips('segCoverFx'),
      nc: state.cover.nc, titleAnim: state.titleAnim, partAnim: state.partAnim,
      nLay: NCLAYOUTS.length, nPal: NCPALETTES.length, nTrans: NCTRANS.length, nAnim: NCTEXTANIMS.length,
      lbl: (q('#m8b .mod-h .t') || {}).textContent || '',
      hasPlay: !!q('#btnCoverPlay'), hasPrevCv: !!q('#coverPreviewCv'), hasTd: !!q('#inCoverTransDur')
    };
  })()`);
  ok('Katalog NOVACUT: 10 layout + 10 palet + 28 transisi + 9 animasi',
    a.nLay === 10 && a.nPal === 10 && a.nTrans === 28 && a.nAnim === 9, JSON.stringify({ nLay: a.nLay, nPal: a.nPal, nTrans: a.nTrans, nAnim: a.nAnim }));
  ok('10 chip LAYOUT tampil (impact…band)', a.layouts.length === 10 && a.layouts[0] === 'impact' && a.layouts[9] === 'band', JSON.stringify(a.layouts));
  ok('10 chip PALET tampil (cyber…ocean)', a.palettes.length === 10 && a.palettes[0] === 'cyber' && a.palettes[9] === 'ocean', JSON.stringify(a.palettes));
  ok('29 chip TRANSISI (TANPA + 28 gaya) tampil bergrup', a.transAll.length === 29 && a.transAll[0] === 'off' && new Set(a.transAll).size === 29, String(a.transAll.length));
  ok('Default state.nc: impact × cyber · adegan · tanpa bingkai · fx in · transisi FLASH 0.6 dtk · anim slam/slam',
    a.nc.layout === 'impact' && a.nc.palette === 'cyber' && a.nc.bg === 'adegan' && a.nc.frame === 'none' && a.nc.fx === 'in' && a.nc.trans === 'flash' && Math.abs(a.nc.transDur - 0.6) < 0.01 && a.nc.titleAnim === 'slam' && a.nc.partAnim === 'slam', JSON.stringify(a.nc));
  ok('Animasi cover: 9 chip (TANPA + 8), default SLAM aktif di judul & part',
    a.animCoverT.length === 9 && a.animCoverP.length === 9 && a.animCoverT.find(b => b.v === 'slam').on && a.animCoverP.find(b => b.v === 'slam').on, JSON.stringify(a.animCoverT));
  ok('Animasi VIDEO (modul 02): 9 chip × judul & part, default TANPA',
    a.animTitle.length === 9 && a.animPart.length === 9 && a.animTitle.find(b => b.v === 'off').on && a.animPart.find(b => b.v === 'off').on && a.titleAnim === 'off' && a.partAnim === 'off', JSON.stringify({ t: a.animTitle.length, p: a.animPart.length }));
  ok('LATAR (adegan/hitam) + BINGKAI (4) + EFEK (5) + slider durasi + tombol pratinjau ada',
    JSON.stringify(a.bgVals) === JSON.stringify(['adegan', 'hitam']) && a.frameVals.length === 4 && a.fxVals.length === 5 && a.hasTd && a.hasPlay && a.hasPrevCv, JSON.stringify({ bg: a.bgVals, fr: a.frameVals.length, fx: a.fxVals.length }));
  ok('Modul 08B kini bertanda MESIN NOVACUT v3.11', /NOVACUT/.test(a.lbl) && /v\.3\.11|v3\.11/.test(a.lbl), a.lbl);

  /* ============ B. UNIT RENDER — LAYOUT × PALET + TRANSISI ============ */
  console.log('B. UNIT RENDER — 10 LAYOUT × 10 PALET + 28 TRANSISI + ANIMASI');
  const b = await cdp.eval(`(() => {
    const W = 640, H = 360;
    const mkScene = () => { const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d', { alpha: false }); g.fillStyle = '#0d3b12'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#14522a'; g.fillRect(W * 0.2, H * 0.2, W * 0.6, H * 0.6); return c; };
    const res = { lay: {}, pal: {}, anim: {}, kb: null, trans: {} };
    /* 10 layout × palet cyber: aksen cyan harus muncul + teks terang */
    for (const l of NCLAYOUTS) {
      state.cover.nc.layout = l.k; state.cover.nc.palette = 'cyber'; state.cover.nc.bg = 'adegan'; state.cover.nc.frame = 'none';
      const L = ncBuildCoverLayers(W, H, { img: mkScene(), title: 'UJI NOVACUT', part: 'PART 3', nc: state.cover.nc });
      const d = L.final.getContext('2d').getImageData(0, 0, W, H).data;
      let cyan = 0, bright = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 2] > 140 && d[i + 1] > 120 && d[i] < 110) cyan++;
        if (d[i] > 190 && d[i + 1] > 180 && d[i + 2] > 160) bright++;
      }
      res.lay[l.k] = { cyan, bright };
    }
    /* 10 palet pada layout impact: aksen khas tiap palet */
    const accProbe = { cyber: d => d[2] > 140 && d[1] > 120 && d[0] < 110, sunset: d => d[0] > 170 && d[1] > 90 && d[1] < 200 && d[2] < 120,
      gold: d => d[0] > 180 && d[1] > 140 && d[2] < 110, ice: d => d[2] > 170 && d[1] > 150 && d[0] < 160,
      toxic: d => d[1] > 150 && d[0] < 130 && d[2] < 130, royal: d => d[2] > 140 && d[0] > 120 && d[1] < 150,
      blood: d => d[0] > 170 && d[1] < 140 && d[2] < 140, mono: d => d[0] > 220 && d[1] > 220 && d[2] > 220,
      candy: d => d[0] > 180 && d[2] > 140 && d[1] < 150, ocean: d => d[1] > 140 && d[2] > 120 && d[0] < 110 };
    state.cover.nc.layout = 'impact';
    for (const p of NCPALETTES) {
      state.cover.nc.palette = p.k;
      const L = ncBuildCoverLayers(W, H, { img: mkScene(), title: 'PALET UJI', part: 'PART 1', nc: state.cover.nc });
      const d = L.final.getContext('2d').getImageData(0, 0, W, H).data;
      let hit = 0;
      for (let i = 0; i < d.length; i += 4) if (accProbe[p.k]([d[i], d[i + 1], d[i + 2]])) hit++;
      res.pal[p.k] = hit;
    }
    /* animasi teks */
    const s0 = ncTextState('slam', 0.01, 4), s1 = ncTextState('slam', 1, 4);
    const tw = ncTextState('typewriter', 0.2, 4), ri = ncTextState('rise', 0.02, 4), of = ncTextState('off', 0, 4);
    res.anim = { slamBig: s0.scale, slamEnd: s1.scale, slamA1: s1.alpha, twKind: tw.kind, riseDy: ri.dy, offA: of.alpha, offS: of.scale };
    /* kenburns */
    const k0 = ncKenburnsRect(0, W, H, 'in'), k1 = ncKenburnsRect(1, W, H, 'in');
    res.kb = { w0: k0.w, w1: k1.w };
    /* 28 transisi: ujung persis + tengah unik */
    const cov = ncBuildCoverLayers(W, H, { img: mkScene(), title: 'TR', part: 'PART 1', nc: { ...state.cover.nc, trans: 'flash' } }).final;
    /* vid MERAH non-uniform (ada rect dalam): kontras dgn cover hijau →
       dc/dv bermakna; shake/bounce/pixelate pada kanvas seragam tak
       menghasilkan beda piksel — non-uniform = pengujian nyata */
    const vid = (() => { const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d', { alpha: false }); g.fillStyle = '#3a0808'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#a81f1f'; g.fillRect(W * 0.2, H * 0.2, W * 0.6, H * 0.6); return c; })();
    const hash = cv => { const d = cv.getContext('2d').getImageData(0, 0, W, H).data; let s = 0;
      for (let i = 0; i < d.length; i += 40) s += d[i] + d[i + 1] + d[i + 2]; return s; };
    const diffPx = (c1, c2) => { const a = c1.getContext('2d').getImageData(0, 0, W, H).data, b = c2.getContext('2d').getImageData(0, 0, W, H).data;
      let n = 0, tot = 0; for (let i = 0; i < a.length; i += 16) { tot++; if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 60) n++; } return n / tot; };
    const hc = hash(cov), hv = hash(vid);
    const outs = [], ins = [], mids = [];
    for (const t of NCTRANS) {
      const m0 = document.createElement('canvas'); m0.width = W; m0.height = H;
      ncApplyTransition(t.k, m0.getContext('2d', { alpha: false }), cov, vid, 0, W, H);
      const m1 = document.createElement('canvas'); m1.width = W; m1.height = H;
      ncApplyTransition(t.k, m1.getContext('2d', { alpha: false }), cov, vid, 1, W, H);
      const mm = document.createElement('canvas'); mm.width = W; mm.height = H;
      ncApplyTransition(t.k, mm.getContext('2d', { alpha: false }), cov, vid, 0.5, W, H);
      outs.push(diffPx(m0, cov)); ins.push(diffPx(m1, vid));
      mids.push({ k: t.k, dc: diffPx(mm, cov), dv: diffPx(mm, vid), h: hash(mm) });
    }
    res.trans = { hc, hv, outs, ins, mids, uniqMid: new Set(mids.map(m => m.h)).size };
    state.cover.nc.layout = 'impact'; state.cover.nc.palette = 'cyber';
    return res;
  })()`);
  const layOK = Object.entries(b.lay).every(([k, v]) => v.cyan > 30 && v.bright > 40);
  ok('10 LAYOUT semuanya menggambar aksen CYAN palet + teks terang', layOK, JSON.stringify(b.lay));
  const palOK = Object.entries(b.pal).every(([k, v]) => v > 20);
  ok('10 PALET semuanya menandai warna aksen khasnya', palOK, JSON.stringify(b.pal));
  ok('ncTextState SLAM: menghantam dari besar (skala > 2.4) → tenang (1.0, alpha 1)',
    b.anim.slamBig > 2.4 && b.anim.slamEnd === 1 && b.anim.slamA1 === 1, JSON.stringify(b.anim));
  ok('ncTextState TYPEWRITER (kind) + RISE (dy > 0) + OFF (netral)',
    b.anim.twKind === 'typewriter' && b.anim.riseDy > 0 && b.anim.offA === 1 && b.anim.offS === 1, JSON.stringify(b.anim));
  ok('KEN BURNS zoom in: lebar bingkai p=1 lebih besar dari p=0', b.kb.w1 > b.kb.w0, JSON.stringify(b.kb));
  ok('28 transisi: p=0 & p=1 persis cover/video (pixelate & shake dikecualikan: ≥2px blok / zoom 1.03 bawaan)',
    b.trans.outs.every((v, i) => b.trans.mids[i].k === 'pixelate' || b.trans.mids[i].k === 'shake-impact' || v < 0.02) && b.trans.ins.every((v, i) => b.trans.mids[i].k === 'pixelate' || b.trans.mids[i].k === 'shake-impact' || v < 0.02),
    JSON.stringify({ outs: b.trans.outs.map(v => +v.toFixed(3)), ins: b.trans.ins.map(v => +v.toFixed(3)) }));
  ok('28 transisi: frame TENGAH selalu berbeda dari cover & video', b.trans.mids.every(m => m.dc > 0.01 && m.dv > 0.01), JSON.stringify(b.trans.mids.filter(m => m.dc <= 0.01 || m.dv <= 0.01)));
  ok(`28 transisi menghasilkan tampilan tengah yang UNIK satu sama lain (${b.trans.uniqMid}/28)`, b.trans.uniqMid >= 26, String(b.trans.uniqMid));

  /* ============ C. COMPOSE ANIMASI JUDUL & PART DI VIDEO ============ */
  console.log('C. COMPOSE — ANIMASI MASUK JUDUL & PART DI VIDEO');
  await cdp.eval(`(async () => {
    document.querySelector('#autoSub').checked = false;
    await loadFromPath('${ROOT}/testmedia/v38-3scn12.mp4', true);
  })()`);
  await sleep(1800);
  const c = await cdp.eval(`(async () => {
    const W = 480, H = 270;
    /* beku-kan frame video: pause + seek tetap → perbedaan frame hanya dari animasi */
    try { videoEl.pause(); await seekTo(0.5, videoEl); } catch (e) { }
    state.titleOn = true; state.title = 'JUDUL ANIMASI'; state.upper = true; state.descOn = false; state.subsOn = false;
    state.titleSize = 120; state.titleScale = 1;   /* teks besar agar piksel animasi terukur */
    state._noPart = false; state.partShow = 'intro'; state.partPrefix = 'PART'; state.speed = 1;
    state.splitSec = 6; state.rangeStart = 0; state.rangeEnd = 0; state.cuts = [];
    const draw = t => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      setCompSrc(videoEl); drawComposition(cv.getContext('2d', { alpha: false }), W, H, t); setCompSrc(null);
      return cv; };
    const diff = (c1, c2) => { const a = c1.getContext('2d').getImageData(0, 0, W, H).data, b2 = c2.getContext('2d').getImageData(0, 0, W, H).data;
      let n = 0, tot = 0; for (let i = 0; i < a.length; i += 16) { tot++; if (Math.abs(a[i] - b2[i]) + Math.abs(a[i + 1] - b2[i + 1]) + Math.abs(a[i + 2] - b2[i + 2]) > 50) n++; } return n / tot; };
    const res = {};
    /* METODE: bandingkan t SAMA — dgn animasi vs TANPA animasi.
       Settled = setelah masa masuk → harus identik dgn perilaku lama. */
    state.partAnim = 'off';
    state.titleAnim = 'typewriter';
    const dTw = draw(0.15);            /* judul sedang diketik */
    state.titleAnim = 'off';
    const dOff = draw(0.15);           /* judul tampil langsung */
    const dEnd = draw(2.0);            /* acuan settled (tanpa animasi) */
    state.titleAnim = 'typewriter';
    const dTwEnd = draw(2.0);          /* typewriter usai mengetik */
    res.titleAnimDiff = diff(dTw, dOff);
    res.titleSettledDiff = diff(dTwEnd, dEnd);
    state.titleAnim = 'off';
    state.partAnim = 'slam';
    const pSl = draw(0.15);            /* bumper menghantam (skala besar) */
    state.partAnim = 'off';
    const pOff = draw(0.15);
    state.partAnim = 'slam';
    const pSlEnd = draw(0.9);          /* slam usai (masih di jendela intro) */
    state.partAnim = 'off';
    const pOffEnd = draw(0.9);
    res.partAnimDiff = diff(pSl, pOff);
    res.partSettledDiff = diff(pSlEnd, pOffEnd);
    return res;
  })()`);
  ok('ANIMASI JUDUL typewriter: saat masuk, frame dgn animasi ≠ tanpa (t sama)', c.titleAnimDiff > 0.005, String(c.titleAnimDiff));
  ok('Setelah usai mengetik, frame = perilaku lama persis (nol jejak)', c.titleSettledDiff < 0.002, String(c.titleSettledDiff));
  ok('ANIMASI PART slam: saat masuk, bumper ≠ tanpa animasi (t sama)', c.partAnimDiff > 0.005, String(c.partAnimDiff));
  ok('Setelah slam selesai, bumper = perilaku lama persis (nol jejak)', c.partSettledDiff < 0.002, String(c.partSettledDiff));

  /* ============ D. EKSPOR NYATA — COVER NOVACUT + TRANSISI ============ */
  console.log('D. EKSPOR NYATA — COVER HIJAU + NEON/GOLD + BINGKAI KLASIK + TRANSISI FLASH + JUDUL FADE');
  const d = await cdp.eval(`(async () => {
    document.querySelector('#segRatio button[data-v="16:9"]').click();
    document.querySelector('#segAcc button[data-v="cpu"]').click();
    state.scale = '1'; state.resOut = '720'; state.spk.on = false; state.spk.ready = false;
    state.splitParts = 0; state.splitSec = 4; state._noPart = false; state.rangeStart = 0; state.rangeEnd = 0;
    state.titleOn = true; state.title = 'UJI NOVACUT'; state.upper = true; state.descOn = false; state.subsOn = false;
    state.titleAnim = 'fade'; state.partAnim = 'off'; state.partShow = 'off';
    state.colorFilter = 'off'; state.vfx.vignette = false; state.vfx.grain = false;
    state.kb.mode = 'off'; state.trans.mode = 'off'; state.frameStyle = 'off'; state.neon.on = false;
    state.cutMode = 'render';
    /* cover manual hijau */
    const cCv = document.createElement('canvas'); cCv.width = 640; cCv.height = 360;
    const cg = cCv.getContext('2d'); cg.fillStyle = '#00B140'; cg.fillRect(0, 0, 640, 360);
    setCoverFromDataUrl(cCv.toDataURL('image/png'), 'HIJAU-UJI');
    await new Promise(r => setTimeout(r, 300));
    state.cover.dur = 1; setSegOn('segCoverDur', '1');
    state.cover.nc.layout = 'neon'; state.cover.nc.palette = 'gold'; state.cover.nc.frame = 'klasik';
    state.cover.nc.bg = 'adegan'; state.cover.nc.fx = 'in'; state.cover.nc.trans = 'flash';
    state.cover.nc.transDur = 0.6; state.cover.nc.titleAnim = 'slam'; state.cover.nc.partAnim = 'slam';
    state.cover.title = 'COVER UJI'; state.cover.part = 'PART';
    setSegOn('coverLayoutChips', 'neon');
    [...document.querySelectorAll('#coverLayoutChips button')].forEach(x => x.classList.toggle('on', x.dataset.v === 'neon'));
    [...document.querySelectorAll('#coverPaletteChips button')].forEach(x => x.classList.toggle('on', x.dataset.v === 'gold'));
    setSegOn('segCoverFrame', 'klasik');
    state.cover.on = true; setSegOn('segCover', 'on');
    let logHit = 0;
    const oi = console.info;
    console.info = (...x) => { if (String(x[0] || '').includes('cover NOVACUT')) logHit++; oi(...x); };
    let t0 = 0, el = 0, err = null, n = 0;
    try { t0 = performance.now(); const res = await exportPartsToDir('${OUT1}', { prog() { }, sub() { }, title() { } }); el = performance.now() - t0; n = res.length; }
    catch (e) { err = e && e.message; }
    console.info = oi;
    return { n, err, el: Math.round(el), logHit };
  })()`);
  const mp4s = fs.readdirSync(OUT1).filter(f => /\.mp4$/.test(f)).sort();
  ok('3 part MP4 tersimpan dengan mesin cover NOVACUT', d.n === 3 && mp4s.length === 3 && !d.err, JSON.stringify({ n: d.n, err: d.err, files: mp4s }));
  ok(`Pipeline cover NOVACUT berjalan di semua part (${d.logHit} log)`, d.logHit >= 3, String(d.logHit));
  const prs = mp4s.map(f => probe(path.join(OUT1, f)));
  ok('Durasi tiap part = 4 konten + 1 cover = 5 dtk', prs.every(p => Math.abs(p.dur - 5) < 0.7), JSON.stringify(prs.map(p => +p.dur.toFixed(2))));
  const dm = frameDimsSafe(path.join(OUT1, mp4s[0]));
  ok('Resolusi tetap 1280×720 (resOut 720)', dm.w === 1280 && dm.h === 720 && prs.every(p => p.dim === '1280,720'), JSON.stringify(prs.map(p => p.dim)));
  const covG = centerColor(path.join(OUT1, mp4s[0]), 0.5, dm.w, dm.h);
  ok('COVER: latar HIJAU manual tergambar + diperjelas template', covG.G > 70 && covG.G > covG.R + 25 && covG.G > covG.B + 25, JSON.stringify(covG));
  const covBadge = bandStats(path.join(OUT1, mp4s[0]), 0.85, dm.w, dm.h, 0.2, 0.8, 0.55, 0.85);
  ok('COVER: badge PART 1 + judul slam terlihat (piksel terang area tengah-bawah)', covBadge.bright > 60, JSON.stringify(covBadge));
  const trMid = bandStats(path.join(OUT1, mp4s[0]), 1.3, dm.w, dm.h, 0.05, 0.95, 0.1, 0.9);
  const trPre = bandStats(path.join(OUT1, mp4s[0]), 1.05, dm.w, dm.h, 0.05, 0.95, 0.1, 0.9);
  const trPost = bandStats(path.join(OUT1, mp4s[0]), 1.7, dm.w, dm.h, 0.05, 0.95, 0.1, 0.9);
  ok(`TRANSISI FLASH: kilat putih di tengah (luma ${trMid.luma} > ${trPre.luma}/${trPost.luma})`,
    trMid.luma > trPre.luma + 25 && trMid.luma > trPost.luma + 25, JSON.stringify({ mid: trMid.luma, pre: trPre.luma, post: trPost.luma }));
  const cc = [0, 1, 2].map(i => centerColor(path.join(OUT1, mp4s[i]), 3.0, dm.w, dm.h));
  ok('ISI benar setelah transisi: PART_01 MERAH / PART_02 HIJAU / PART_03 BIRU',
    cc[0].R > 100 && cc[0].R > cc[0].G + 35 && cc[1].G > 90 && cc[1].G > cc[1].R + 35 && cc[2].B > 80 && cc[2].B > cc[2].R + 35, JSON.stringify(cc));
  const ttlSettled = bandStats(path.join(OUT1, mp4s[0]), 3.0, dm.w, dm.h, 0.1, 0.9, 0.02, 0.3);
  ok(`JUDUL terbakar di video (settled, band atas terang: ${ttlSettled.bright})`, ttlSettled.bright > 250, JSON.stringify(ttlSettled));
  const covTitle = bandStats(path.join(OUT1, mp4s[0]), 0.85, dm.w, dm.h, 0.15, 0.85, 0.35, 0.6);
  ok('Judul di COVER terbaca (piksel terang blok tengah)', covTitle.bright > 250, JSON.stringify(covTitle));

  /* ============ E. GERBANG POTONG LANGSUNG ============ */
  console.log('E. GERBANG POTONG LANGSUNG — COVER AKTIF TERBLOKIR');
  const e = await cdp.eval(`(() => {
    /* sembunyikan pemicu lain agar alasan tepat 'COVER PEMBUKA' */
    state.titleOn = false; state.descOn = false; state.subsOn = false; state.partShow = 'off';
    const r = fastCutBlockedReason();
    state.cover.on = false; setSegOn('segCover', 'off');
    const r2 = fastCutBlockedReason();
    return { withCover: r, reasonAfter: r2 };
  })()`);
  ok('Cover NOVACUT aktif → POTONG LANGSUNG terblokir dgn alasan COVER PEMBUKA', e.withCover === 'COVER PEMBUKA', JSON.stringify(e));
  ok('Cover dimatikan → gerbang terbuka (alasan bergeser ke setelan lain/lewat)', e.reasonAfter !== 'COVER PEMBUKA', JSON.stringify(e));

  /* ============ F. GABUNG VIDEO tetap sehat ============ */
  console.log('F. GABUNG VIDEO — SMOKE SETELAH REFACTOR COVER');
  const f = await cdp.eval(`(async () => {
    const res = await exportMergeToDir(['${ROOT}/testmedia/short-a.mp4', '${ROOT}/testmedia/short-b.mp4'], '${OUTM}', { prog() { }, sub() { } });
    return { n: res.length };
  })()`);
  const mp4m = fs.readdirSync(OUTM).filter(x => /\.mp4$/.test(x))[0];
  const prm = mp4m ? probe(path.join(OUTM, mp4m)) : { dur: 0 };
  ok('Gabungan tersimpan + durasi utuh (2×3 dtk)', f.n === 1 && Math.abs(prm.dur - 6) < 1.0, `dur=${prm.dur.toFixed ? prm.dur.toFixed(2) : prm.dur}`);

  /* ringkasan */
  console.log(`\n===== HASIL: ${pass} LULUS, ${fail} GAGAL =====`);
  if (fails.length) fails.forEach(x => console.log('  • ' + x));
  await app.kill('SIGKILL');
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('FATAL:', e && e.message);
  console.log(`\n===== HASIL: ${pass} LULUS, ${fail} GAGAL (fatal) =====`);
  if (fails.length) fails.forEach(x => console.log('  • ' + x));
  try { await app.kill('SIGKILL'); } catch (e2) { }
  process.exit(1);
}

function frameDimsSafe(mp4) {
  const [w, h] = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 '${mp4}'`).toString().trim().split(',').map(Number);
  return { w, h };
}
