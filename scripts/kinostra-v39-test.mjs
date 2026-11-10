/* ================================================================
   KINOSTRA v3.9.0 — UJI BINGKAI JUDUL + POSISI + MODE KILAT
   Jalankan: bash scripts/run-test-xvfb.sh scripts/kinostra-v39-test.mjs
   Media uji: testmedia/v38-3scn12.mp4 — 12 dtk, 640×360, 30fps,
   h264+aac, 3 adegan warna solid (merah 0–4, hijau 4–8, biru 8–12).
   640×360 < 720p → MODE KILAT wajib menaikkan hasil ke 1280×720.
   Cakupan:
   A. Smoke UI: BINGKAI JUDUL 11 chip (TANPA+10), slider POSISI JUDUL
      (default 80) & POSISI PART (default 100), MODE KILAT default AKTIF,
      header v3.9.0, TITLEFRAMES 11
   B. Render kanvas: 10 gaya bingkai menghasilkan penanda warna masing-
      masing di sekeliling judul; posisi judul atas/bawah benar; posisi
      part paling atas benar; anti-tabrakan part↔judul aktif
   C. MODE KILAT — demux + dekode langsung: probe wadah (avc1, 640×360),
      jumlah sampel ≈ 12 dtk × 30fps, dekode adegan merah/hijau/biru pada
      1/5/9 dtk lewat VideoDecoder (bukan pemutaran)
   D. EKSPOR NYATA KILAT: split 3 part, scale 50% → hasil 1280×720
      (jaminan 720p), durasi 6 dtk, adegan per-part benar, label PART di
      PALING ATAS, bingkai judul KOTAK + bingkai sampul KLASIK tampil
   E. KECEPATAN: ekspor tanpa cover — waktu KILAT < waktu TURBO
   F. GABUNG VIDEO lewat kfile:// virtual + KILAT: durasi 8 dtk utuh
   ================================================================ */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project';
const OUTS1 = '/tmp/kinov39-kilat', OUTT = '/tmp/kinov39-turbo', OUTM = '/tmp/kinov39-merge';
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
  let bright = 0, dark = 0, amber = 0, cyan = 0, n = 0;
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
    const o = (y * w + x) * 3, R = raw[o], G = raw[o + 1], B = raw[o + 2];
    if (R > 180 && G > 170 && B > 150) bright++;
    else if (R + G + B < 190) dark++;
    if (R > 140 && G > 90 && G < 215 && B < 115 && R - B > 60) amber++;
    if (B > 150 && G > 120 && R < 110) cyan++;
    n++;
  }
  return { bright, dark, amber, cyan, n };
}
function centerColor(file, ts, w, h) {
  const raw = rawAt(file, ts);
  let R = 0, G = 0, B = 0, n = 0;
  for (let y = Math.round(h * 0.35); y < h * 0.55; y += 2) for (let x = Math.round(w * 0.3); x < w * 0.7; x += 2) {
    const o = (y * w + x) * 3; R += raw[o]; G += raw[o + 1]; B += raw[o + 2]; n++;
  }
  return { R: Math.round(R / n), G: Math.round(G / n), B: Math.round(B / n) };
}

for (const d of [OUTS1, OUTT, OUTM]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
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
  console.log('A. SMOKE UI — BINGKAI JUDUL, POSISI, MODE KILAT');
  const a = await cdp.eval(`(() => {
    const q = s => document.querySelector(s);
    const tf = q('#segCoverTitleFrame'); const tfb = tf ? [...tf.querySelectorAll('button')] : [];
    const kl = q('#segKilat'); const klb = kl ? [...kl.querySelectorAll('button')] : [];
    return {
      tfVals: tfb.map(b => b.dataset.v), tfDef: tfb[0] && tfb[0].classList.contains('on'),
      titlePos: q('#inTitlePos') ? +q('#inTitlePos').value : -1,
      partPos: q('#inPartPos') ? +q('#inPartPos').value : -1,
      klVals: klb.map(b => b.dataset.v), klDef: klb.find(b => b.dataset.v === 'on')?.classList.contains('on'),
      kilat: state.kilat, cv: state.cover,
      nFrames: typeof TITLEFRAMES !== 'undefined' ? TITLEFRAMES.length : -1,
      lbl: (q('#m8b .mod-h .t') || {}).textContent || '',
      lbl9: (q('#segKilat') ? (q('#segKilat').closest('.mod').querySelector('.mod-h .t') || {}).textContent : '') || ''
    };
  })()`);
  ok('BINGKAI JUDUL: 11 chip — TANPA + 10 gaya', a.tfVals.length === 11 && a.tfVals[0] === 'TANPA' && a.tfVals.length - 1 === 10, JSON.stringify(a.tfVals));
  ok('Urutan gaya: KOTAK GANDA PITA SUDUT NEON STRIP EMAS KACA GRADIEN PUTUS', JSON.stringify(a.tfVals.slice(1)) === JSON.stringify(['KOTAK', 'GANDA', 'PITA', 'SUDUT', 'NEON', 'STRIP', 'EMAS', 'KACA', 'GRADIEN', 'PUTUS']), JSON.stringify(a.tfVals));
  ok('Katalog TITLEFRAMES = 11 entri', a.nFrames === 11, String(a.nFrames));
  ok('Default bingkai judul TANPA (chip pertama aktif) + state TANPA', a.tfDef && a.cv.titleFrame === 'TANPA', JSON.stringify({ tfDef: a.tfDef, st: a.cv.titleFrame }));
  ok('Slider POSISI JUDUL ada, default 80 (≈ posisi lama)', a.titlePos === 80, String(a.titlePos));
  ok('Slider POSISI PART ada, default 100 (persis posisi lama)', a.partPos === 100, String(a.partPos));
  ok('MODE KILAT: 2 chip KILAT/TURBO, default KILAT aktif + state "on"', JSON.stringify(a.klVals) === JSON.stringify(['on', 'off']) && a.klDef && a.kilat === 'on', JSON.stringify({ klVals: a.klVals, kilat: a.kilat }));
  ok('Modul 08B bertanda DIPERBARUI v3.9.0', a.lbl.includes('v3.9.0'), a.lbl);

  /* ============ B. RENDER KANVAS — 10 BINGKAI + POSISI ============ */
  console.log('B. RENDER KANVAS — 10 GAYA BINGKAI JUDUL + POSISI');
  const b = await cdp.eval(`(async () => {
    const W = 640, H = 360;
    state.cover.title = 'JUDUL UJI'; state.cover.part = 'PART';
    const mkFrame = () => { const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'); g.fillStyle = '#11AA44'; g.fillRect(0, 0, W, H); return c; };
    const draw = () => {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d', { alpha: false });
      drawAutoCoverDesign(g, W, H, mkFrame());
      const tLay = coverTitleLayout(W, H, coverTitleText());
      drawCoverPartLabel(g, W, H, 3, tLay);
      return { data: g.getImageData(0, 0, W, H).data, lay: tLay };
    };
    const scan = (d, box, fn) => {
      let c = 0;
      const x0 = Math.round(W * box[0]), x1 = Math.round(W * box[1]);
      const y0 = Math.round(H * box[2]), y1 = Math.round(H * box[3]);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const o = (y * W + x) * 4;
        if (fn(d[o], d[o + 1], d[o + 2])) c++;
      }
      return c;
    };
    const isBright = (R, G, B) => R > 180 && G > 170 && B > 150;
    const isAmber = (R, G, B) => R > 140 && G > 90 && G < 215 && B < 115 && R - B > 60;
    const isCyan = (R, G, B) => B > 140 && G > 120 && R < 110 && B - R > 60;
    const isRed = (R, G, B) => R > 60 && R < 190 && G < 60 && B < 60;
    const styleBox = lay => [0.03, 0.97, Math.max(0.01, (lay.top - 34) / H), Math.min(0.99, (lay.bot + 34) / H)];
    const res = { styles: {}, pos: {}, dodge: null };
    const stys = ['KOTAK', 'GANDA', 'PITA', 'SUDUT', 'NEON', 'STRIP', 'EMAS', 'KACA', 'GRADIEN', 'PUTUS'];
    for (const st of stys) {
      state.cover.titleFrame = st; state.cover.titlePos = 80; state.cover.partPos = 100;
      const r = draw();
      const bx = styleBox(r.lay);
      res.styles[st] = {
        bright: scan(r.data, bx, isBright),
        amber: scan(r.data, bx, isAmber),
        cyan: scan(r.data, bx, isCyan),
        red: scan(r.data, bx, isRed),
        top: +(r.lay.top / H).toFixed(3), bot: +(r.lay.bot / H).toFixed(3)
      };
    }
    state.cover.titleFrame = 'TANPA';
    state.cover.titlePos = 5; state.cover.partPos = 100;
    { const r = draw();
      res.pos.titleAtas = {
        atas: scan(r.data, [0.1, 0.9, 0.05, 0.33], isBright),
        bawah: scan(r.data, [0.1, 0.9, 0.62, 0.9], isBright)
      }; }
    state.cover.titlePos = 95; state.cover.partPos = 100;
    { const r = draw();
      res.pos.titleBawah = {
        atas: scan(r.data, [0.1, 0.9, 0.05, 0.33], isBright),
        bawah: scan(r.data, [0.1, 0.9, 0.62, 0.9], isBright)
      }; }
    state.cover.titlePos = 80; state.cover.partPos = 0;
    { const r = draw();
      res.pos.partAtas = {
        atas: scan(r.data, [0.1, 0.9, 0.02, 0.2], isBright),
        bawah: scan(r.data, [0.1, 0.9, 0.88, 0.995], isBright)
      }; }
    /* anti-tabrakan: posisi part default vs posisi bertabrakan harus berbeda */
    state.cover.titlePos = 47; state.cover.partPos = 47;
    const layT = coverTitleLayout(W, H, coverTitleText());
    const cyBentrok = partLabelCy(H, layT), cyBebas = partLabelCy(H, null);
    const half = Math.round(46 * (H / 1080)) * 0.66;
    res.dodge = {
      cyBebas: +(cyBebas / H).toFixed(3), cyBentrok: +(cyBentrok / H).toFixed(3),
      berbeda: Math.abs(cyBentrok - cyBebas) > 4,
      diLuarJudul: cyBentrok < layT.top - half * 0.5 || cyBentrok > layT.bot + half * 0.5
    };
    state.cover.titlePos = 80; state.cover.partPos = 100;
    return res;
  })()`);
  const mark = {
    KOTAK: r => r.amber > 40 && r.bright > 120, GANDA: r => r.amber > 40 && r.bright > 120,
    PITA: r => r.red > 300 && r.bright > 120, SUDUT: r => r.amber > 60 && r.bright > 120,
    NEON: r => r.cyan > 30 && r.bright > 120, STRIP: r => r.amber > 20 && r.bright > 120,
    EMAS: r => r.amber > 40 && r.bright > 120, KACA: r => r.bright > 120,
    GRADIEN: r => r.amber > 30 && r.bright > 120, PUTUS: r => r.bright > 120
  };
  for (const st of Object.keys(mark)) {
    ok(`Bingkai judul ${st}: penanda warna khas + judul terbaca`, mark[st](b.styles[st]), JSON.stringify(b.styles[st]));
  }
  ok('POSISI JUDUL paling atas (5%): judul di ATAS, kosong di BAWAH', b.pos.titleAtas.atas > 120 && b.pos.titleAtas.bawah < 25, JSON.stringify(b.pos.titleAtas));
  ok('POSISI JUDUL paling bawah (95%): judul di BAWAH, kosong di ATAS', b.pos.titleBawah.bawah > 120 && b.pos.titleBawah.atas < 25, JSON.stringify(b.pos.titleBawah));
  ok('POSISI PART paling atas (0%): tulisan part di ATAS', b.pos.partAtas.atas > 50 && b.pos.partAtas.bawah < 20, JSON.stringify(b.pos.partAtas));
  ok('Anti-tabrakan: label part bergeser saat menimpa judul & keluar dari kotak judul', b.dodge.berbeda && b.dodge.diLuarJudul, JSON.stringify(b.dodge));

  /* ============ C. MODE KILAT — DEMUX + DEKODE ============ */
  console.log('C. MODE KILAT — PROBE WADAH + DEKODE LANGSUNG (MERAH/HIJAU/BIRU)');
  await cdp.eval(`(async () => {
    document.querySelector('#autoSub').checked = false;
    await loadFromPath('${ROOT}/testmedia/v38-3scn12.mp4', true);
  })()`);
  await sleep(1600);
  const c = await cdp.eval(`(async () => {
    const avg = (cv, x, y) => {
      const d = cv.getContext('2d').getImageData(Math.round(x - 3), Math.round(y - 3), 6, 6).data;
      let R = 0, G = 0, B = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; n++; }
      return { R: Math.round(R / n), G: Math.round(G / n), B: Math.round(B / n) };
    };
    const ambil = async (t) => {
      const pk = await probeKilat(state.file);
      const K = await createKilatRender(pk);
      let got = null;
      for await (const it of K.range(t, t + 0.5)) { got = it; break; }
      K.blit(got.frame);
      const c = avg(K.cv, K.cv.width / 2, K.cv.height / 2);
      try { got.frame.close(); } catch (e) { }
      await K.close();
      return { c, nTotal: K.nTotal, dims: { w: pk.info.dispW, h: pk.info.dispH, codedW: pk.info.codedW, codedH: pk.info.codedH }, codec: pk.info.codecStr, rot: pk.info.rot };
    };
    const f1 = await ambil(1.0), f2 = await ambil(5.0), f3 = await ambil(9.0);
    return { f1, f2, f3, decOK: 'VideoDecoder' in window };
  })()`);
  ok('Probe kilat: wadah avc1 + 640×360 + tanpa rotasi', c.f1.codec.startsWith('avc1.') && c.f1.dims.codedW === 640 && c.f1.dims.codedH === 360 && c.f1.rot === 0, JSON.stringify({ codec: c.f1.codec, dims: c.f1.dims }));
  ok('Jumlah sampel masuk akal (±12 dtk × 30fps = 360)', c.f1.nTotal > 280 && c.f1.nTotal < 460, String(c.f1.nTotal));
  ok('DEKODE LANGSUNG: t=1.0 → MERAH', c.f1.c.R > 110 && c.f1.c.R > c.f1.c.G + 40 && c.f1.c.R > c.f1.c.B + 40, JSON.stringify(c.f1.c));
  ok('DEKODE LANGSUNG: t=5.0 → HIJAU', c.f2.c.G > 100 && c.f2.c.G > c.f2.c.R + 40, JSON.stringify(c.f2.c));
  ok('DEKODE LANGSUNG: t=9.0 → BIRU', c.f3.c.B > 90 && c.f3.c.B > c.f3.c.R + 40, JSON.stringify(c.f3.c));

  /* ============ D. EKSPOR NYATA KILAT — SPLIT 3 PART ============ */
  console.log('D. EKSPOR NYATA KILAT — SPLIT 3 PART + BINGKAI JUDUL KOTAK + PART PALING ATAS');
  const d = await cdp.eval(`(async () => {
    document.querySelector('#segRatio button[data-v="16:9"]').click();
    document.querySelector('#segAcc button[data-v="cpu"]').click();
    state.scale = '0.5'; state.spk.on = false; state.spk.ready = false;
    state.titleOn = false; state.descOn = false; state.subsOn = false;
    state.colorFilter = 'off'; state.vfx.vignette = false; state.vfx.grain = false;
    state.splitParts = 0; state.splitSec = 4; state._noPart = false; state.rangeStart = 0; state.rangeEnd = 0;
    document.querySelector('#segCoverDur button[data-v="2"]').click();
    document.querySelector('#segCoverPart button[data-v="PART"]').click();
    document.querySelector('#segCoverSrc button[data-v="auto"]').click();
    document.querySelector('#segCoverStyle button[data-v="KLASIK"]').click();
    document.querySelector('#segCoverTitleFrame button[data-v="KOTAK"]').click();
    document.querySelector('#inTitlePos').value = 80; document.querySelector('#inTitlePos').oninput({ target: { value: '80' } });
    document.querySelector('#inPartPos').value = 0; document.querySelector('#inPartPos').oninput({ target: { value: '0' } });
    const i = document.querySelector('#inCoverTitle'); i.value = 'SERIAL UJI'; if (i.oninput) i.oninput({ target: i });
    state.cover.on = true; setSegOn('segCover', 'on');
    let kilatHits = 0;
    const oi = console.info;
    console.info = (...x) => { if (String(x[0] || '').includes('MODE KILAT')) kilatHits++; oi(...x); };
    let t0 = 0, el = 0, err = null, n = 0;
    try { t0 = performance.now(); const res = await exportPartsToDir('${OUTS1}', { prog() { }, sub() { }, title() { } }); el = performance.now() - t0; n = res.length; }
    catch (e) { err = e && e.message; }
    console.info = oi;
    return { n, err, el: Math.round(el), kilatHits, kilatFlag: !!state._kilat };
  })()`);
  const mp4s1 = fs.readdirSync(OUTS1).filter(f => /\.mp4$/.test(f)).sort();
  ok('3 part MP4 tersimpan lewat MODE KILAT', d.n === 3 && mp4s1.length === 3 && !d.err, JSON.stringify({ n: d.n, err: d.err, files: mp4s1 }));
  ok('Pompa KILAT benar berjalan (3 part → ≥3 log MODE KILAT)', d.kilatHits >= 3, String(d.kilatHits));
  const prs1 = mp4s1.map(f => probe(path.join(OUTS1, f)));
  ok('Durasi tiap part = 4 + 2 cover = 6 dtk', prs1.every(p => Math.abs(p.dur - 6) < 0.7), JSON.stringify(prs1.map(p => +p.dur.toFixed(2))));
  const dm = frameDims(path.join(OUTS1, mp4s1[0]));
  ok('JAMINAN 720p: scale 50% (960×540) dinaikkan → hasil 1280×720', dm.w === 1280 && dm.h === 720 && prs1.every(p => p.dim === '1280,720'), JSON.stringify(prs1.map(p => p.dim)));
  const cc1 = [0, 1, 2].map(i => centerColor(path.join(OUTS1, mp4s1[i]), 3.0, dm.w, dm.h));
  ok('KILAT isi benar: PART_01 MERAH / PART_02 HIJAU / PART_03 BIRU',
    cc1[0].R > 110 && cc1[0].R > cc1[0].G + 35 &&
    cc1[1].G > 100 && cc1[1].G > cc1[1].R + 35 &&
    cc1[2].B > 90 && cc1[2].B > cc1[2].R + 35, JSON.stringify(cc1));
  const lblTop = [0, 1, 2].map(i => bandStats(path.join(OUTS1, mp4s1[i]), 1.0, dm.w, dm.h, 0.15, 0.85, 0.02, 0.22));
  ok('Tulisan PART 1/2/3 tercetak di PALING ATAS (permintaanmu kawan)', lblTop.every(x => x.bright > 40), JSON.stringify(lblTop.map(x => x.bright)));
  const lblBottom = [0, 1, 2].map(i => bandStats(path.join(OUTS1, mp4s1[i]), 1.0, dm.w, dm.h, 0.15, 0.85, 0.9, 0.995));
  ok('Bagian bawah sampul BERSIH (label sudah pindah ke atas)', lblBottom.every(x => x.bright < 40), JSON.stringify(lblBottom.map(x => x.bright)));
  const ttlKotak = bandStats(path.join(OUTS1, mp4s1[0]), 1.0, dm.w, dm.h, 0.1, 0.9, 0.6, 0.9);
  ok('Bingkai judul KOTAK: amber di sekeliling judul + judul terbaca', ttlKotak.amber > 60 && ttlKotak.bright > 400, JSON.stringify(ttlKotak));
  const edgeK = bandStats(path.join(OUTS1, mp4s1[0]), 1.0, dm.w, dm.h, 0.015, 0.06, 0.45, 0.55);
  ok('Bingkai sampul KLASIK tetap utuh (amber tepi kiri)', edgeK.amber > 20, JSON.stringify(edgeK));

  /* ============ E. KECEPATAN — KILAT vs TURBO ============ */
  console.log('E. KECEPATAN — SPLIT 3 PART TANPA COVER: KILAT vs TURBO');
  const e = await cdp.eval(`(async () => {
    state.cover.on = false; setSegOn('segCover', 'off');
    state.resumeExport = false;   /* penting: uji kecepatan — jangan lewati part lama */
    state.resOut = '720';         /* kedua jalur pada 1280×720 — perbandingan adil */
    const waktu = async () => {
      const t0 = performance.now();
      await exportPartsToDir('${OUTT}', { prog() { }, sub() { }, title() { } });
      return Math.round(performance.now() - t0);
    };
    const tk = await waktu();           /* KILAT masih aktif */
    document.querySelector('#segKilat button[data-v="off"]').click();
    const tt = await waktu();           /* TURBO */
    document.querySelector('#segKilat button[data-v="on"]').click();
    state.resOut = '';                  /* kembalikan AUTO */
    return { tk, tt, kilat: state.kilat };
  })()`);
  ok(`KILAT lebih cepat dari TURBO (${e.tk} ms vs ${e.tt} ms — ${(e.tt / Math.max(1, e.tk)).toFixed(2)}×)`, e.tk > 0 && e.tt > 0 && e.tk < e.tt, JSON.stringify(e));
  ok('Setelah uji kecepatan, KILAT kembali aktif', e.kilat === 'on', String(e.kilat));

  /* ============ F. GABUNG VIDEO + KILAT (kfile:// virtual) ============ */
  console.log('F. GABUNG VIDEO — 2 FILM LEWAT kfile:// + KILAT');
  const f = await cdp.eval(`(async () => {
    state.cover.on = false; setSegOn('segCover', 'off');
    const res = await exportMergeToDir(['${ROOT}/testmedia/short-a.mp4', '${ROOT}/testmedia/short-b.mp4'], '${OUTM}', { prog() { }, sub() { } });
    return { n: res.length };
  })()`);
  const mp4m = fs.readdirSync(OUTM).filter(x => /\.mp4$/.test(x))[0];
  const prm = mp4m ? probe(path.join(OUTM, mp4m)) : { dur: 0 };
  ok('Gabungan tersimpan + durasi utuh (2×3 dtk)', f.n === 1 && Math.abs(prm.dur - 6) < 1.0, `dur=${prm.dur.toFixed ? prm.dur.toFixed(2) : prm.dur}`);

  /* ringkasan */
  console.log(`\\n===== HASIL: ${pass} LULUS, ${fail} GAGAL =====`);
  if (fails.length) fails.forEach(x => console.log('  • ' + x));
  await app.kill('SIGKILL');
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('FATAL:', e && e.message);
  console.log(`\\n===== HASIL: ${pass} LULUS, ${fail} GAGAL (fatal) =====`);
  try { await app.kill('SIGKILL'); } catch (e2) { }
  process.exit(2);
}
