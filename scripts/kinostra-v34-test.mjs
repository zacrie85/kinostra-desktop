/* ================================================================
   KINOSTRA v3.4 — UJI RESOLUSI OUTPUT 720p/1080p/2K/4K (Xvfb + CDP)
   Jalankan: DISPLAY=:99 node scripts/kinostra-v34-test.mjs
   Media uji: testmedia/v34-8s.mp4 (8 dtk 1280×720 + sine 440Hz)
              testmedia/v34-6s.mp4 (6 dtk 960×540 + sine 600Hz)
   Cakupan:
   A. Smoke UI chip RESOLUSI OUTPUT + AUTO default
   B. Dimensi keluaran tiap chip (16:9 & 9:16) + ringkasan ekspor
   C. Eksklusivitas dua arah chip resolusi ↔ skala + preset
   D. Bitrate mengikuti resolusi (exportBitrate)
   E. Daftar codec H.264 per resolusi (level 4.0 vs 5.1/5.2)
   F. EKSPOR NYATA 720p (2 part) → ffprobe 1280×720
   G. EKSPOR NYATA 2K   (1 part)  → ffprobe 2560×1440
   H. EKSPOR NYATA 4K   (2 part)  → ffprobe 3840×2160
   I. BATCH EKSPOR 2 video @720p (tombol asli btnExportAll) → ffprobe
   ================================================================ */
import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project';
const OUT720 = '/tmp/kinov34-720', OUT2K = '/tmp/kinov34-2k', OUT4K = '/tmp/kinov34-4k', OUTBAT = '/tmp/kinov34-batch';
const PORT = 9452;
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

for (const d of [OUT720, OUT2K, OUT4K, OUTBAT]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
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
  console.log('A. SMOKE UI RESOLUSI OUTPUT');
  const a = await cdp.eval(`(() => {
    const seg = document.querySelector('#segRes');
    const btns = seg ? [...seg.querySelectorAll('button')] : [];
    return {
      seg: !!seg, n: btns.length,
      vals: btns.map(b => b.dataset.v),
      autoOn: btns[0] && btns[0].classList.contains('on'),
      resOut: state.resOut, cat: typeof RESOUTS !== 'undefined' && !!RESOUTS['2160'],
      dims4k: RESOUTS ? RESOUTS['2160'].W + 'x' + RESOUTS['2160'].H : '',
      note: !!document.querySelector('#resNote'),
      lbl: document.body.innerHTML.includes('RESOLUSI OUTPUT — 720p / 1080p / 2K / 4K'),
      fbr: typeof exportBitrate === 'function', cdc: typeof h264CodecsFor === 'function'
    };
  })()`);
  ok('Seg RESOLUSI OUTPUT ada dgn 5 chip (AUTO/720/1080/1440/2160)', a.seg && a.n === 5 && JSON.stringify(a.vals) === '["","720","1080","1440","2160"]', JSON.stringify(a.vals));
  ok('AUTO aktif + state.resOut kosong (perilaku lama utuh)', a.autoOn && a.resOut === '');
  ok('Katalog RESOUTS 4K = 3840×2160 + note tampil', a.cat && a.dims4k === '3840x2160' && a.note && a.lbl);
  ok('Fungsi exportBitrate + h264CodecsFor terdefinisi', a.fbr && a.cdc);

  /* ============ B. DIMENSI TIAP CHIP ============ */
  console.log('B. DIMENSI KELUARAN TIAP CHIP (16:9 & 9:16)');
  const b = await cdp.eval(`(async () => {
    document.querySelector('#autoSub').checked = false;   /* offline murni — tanpa ASR */
    await loadFromPath('${ROOT}/testmedia/v34-8s.mp4', true);
    if (!state.file) return { err: 'muat video gagal' };
    const clickRes = v => { const b = document.querySelector('#segRes button[data-v="' + v + '"]'); b.click(); };
    const out = {};
    for (const v of ['720', '1080', '1440', '2160']) {
      clickRes(v);
      await new Promise(r => setTimeout(r, 120));
      const d = outDims();
      out[v] = { w: d.W, h: d.H, sum: document.querySelector('#expSum').textContent };
    }
    /* vertikal 9:16 → W↔H dibalik */
    document.querySelector('#segRatio button[data-v="9:16"]').click();
    await new Promise(r => setTimeout(r, 120));
    const d916 = outDims();
    out.v916 = { w: d916.W, h: d916.H };
    document.querySelector('#segRatio button[data-v="16:9"]').click();
    await new Promise(r => setTimeout(r, 120));
    const dBack = outDims();
    out.back = { w: dBack.W, h: dBack.H };
    return out;
  })()`);
  if (b.err) throw new Error('B: ' + b.err);
  ok('Chip 720p → keluaran 1280×720 + ringkasan "RESOLUSI 720p HD"', b['720'].w === 1280 && b['720'].h === 720 && /RESOLUSI 720p HD/.test(b['720'].sum), JSON.stringify(b['720']));
  ok('Chip 1080p → keluaran 1920×1080 + label FHD', b['1080'].w === 1920 && b['1080'].h === 1080 && /RESOLUSI 1080p FULL HD/.test(b['1080'].sum), JSON.stringify(b['1080']));
  ok('Chip 2K → keluaran 2560×1440', b['1440'].w === 2560 && b['1440'].h === 1440, JSON.stringify(b['1440']));
  ok('Chip 4K → keluaran 3840×2160 + label 4K ULTRA HD', b['2160'].w === 3840 && b['2160'].h === 2160 && /RESOLUSI 4K ULTRA HD/.test(b['2160'].sum), JSON.stringify(b['2160']));
  ok('Rasio 9:16 + 4K → 2160×3840 (terbalik otomatis)', b.v916.w === 2160 && b.v916.h === 3840, JSON.stringify(b.v916));
  ok('Kembali 16:9 → 3840×2160 lagi', b.back.w === 3840 && b.back.h === 2160, JSON.stringify(b.back));

  /* ============ C. EKSKLUSIVITAS ============ */
  console.log('C. EKSKLUSIVITAS RESOLUSI ↔ SKALA ↔ PRESET');
  const c = await cdp.eval(`(() => {
    const r = {};
    const clickRes = v => document.querySelector('#segRes button[data-v="' + v + '"]').click();
    const clickScale = v => document.querySelector('#segScale button[data-v="' + v + '"]').click();
    clickRes('2160');
    r.dim4k = { resOut: state.resOut, dimCls: document.querySelector('#segScale').classList.contains('res-dim'),
      dims: outDims().W + 'x' + outDims().H };
    clickScale('0.75');
    r.afterScale = { resOut: state.resOut, dimCls: document.querySelector('#segScale').classList.contains('res-dim'),
      autoOn: document.querySelector('#segRes button[data-v=""]').classList.contains('on'),
      dims: (d => d.W + 'x' + d.H)(outDims(parseFloat(state.scale))) };
    clickRes('720');
    r.res720 = { resOut: state.resOut, dims: outDims().W + 'x' + outDims().H };
    /* preset YOUTUBE → resolusi tetap ikut ter-reset ke AUTO */
    document.querySelector('#expPresets button').click();
    r.afterPreset = { resOut: state.resOut, autoOn: document.querySelector('#segRes button[data-v=""]').classList.contains('on'),
      dimCls: document.querySelector('#segScale').classList.contains('res-dim') };
    return r;
  })()`);
  ok('Pilih 4K → skala redup (res-dim) + dims terkunci 3840×2160', c.dim4k.resOut === '2160' && c.dim4k.dimCls && c.dim4k.dims === '3840x2160', JSON.stringify(c.dim4k));
  ok('Klik skala 75% → balik AUTO (chip AUTO nyala, redup hilang, 1440×810)', c.afterScale.resOut === '' && !c.afterScale.dimCls && c.afterScale.autoOn && c.afterScale.dims === '1440x810', JSON.stringify(c.afterScale));
  ok('Pilih 720p lagi → 1280×720', c.res720.resOut === '720' && c.res720.dims === '1280x720', JSON.stringify(c.res720));
  ok('Klik preset YOUTUBE → resolusi kembali AUTO (setelan preset menang)', c.afterPreset.resOut === '' && c.afterPreset.autoOn && !c.afterPreset.dimCls, JSON.stringify(c.afterPreset));

  /* ============ D. BITRATE ============ */
  console.log('D. BITRATE MENGIKUTI RESOLUSI');
  const d = await cdp.eval(`(() => {
    const r = {};
    state.quality = 'balanced';
    state.resOut = ''; state.scale = 1; r.auto1080 = exportBitrate();
    state.resOut = '720'; r.res720 = exportBitrate();
    state.resOut = '1080'; r.res1080 = exportBitrate();
    state.resOut = '1440'; r.res1440 = exportBitrate();
    state.resOut = '2160'; r.res2160 = exportBitrate();
    state.quality = 'max'; r.res2160max = exportBitrate();
    state.quality = 'balanced';
    state.resOut = ''; return r;
  })()`);
  ok('AUTO (skala 100%) = 6 Mbps persis perilaku lama', d.auto1080 === 6000000, String(d.auto1080));
  ok('Bitrate naik monoton 720p < 1080p < 2K < 4K', d.res720 < d.res1080 && d.res1080 < d.res1440 && d.res1440 < d.res2160, JSON.stringify(d));
  ok('4K SEIMBANG ≈ 24 Mbps (4× 1080p)', Math.abs(d.res2160 - 24e6) < 1e5, String(d.res2160));
  ok('4K MAKSIMAL di-clamp 48 Mbps (aman encoder)', d.res2160max === 48000000, String(d.res2160max));
  ok('720p SEIMBANG ≈ 2.67 Mbps (area 0.444×)', Math.abs(d.res720 - 2.666e6) < 5e4, String(d.res720));

  /* ============ E. CODEC PER RESOLUSI ============ */
  console.log('E. DAFTAR CODEC H.264 (LEVEL 4.0 vs 5.1/5.2)');
  const e = await cdp.eval(`(() => ({
    fhd: h264CodecsFor(1920, 1080, 30),
    fhd60: h264CodecsFor(1920, 1080, 60),
    qhd: h264CodecsFor(2560, 1440, 30),
    uh: h264CodecsFor(3840, 2160, 30),
    uh60: h264CodecsFor(3840, 2160, 60),
    sup2160sw: null
  }))()`);
  ok('≤1080p → daftar lama persis v2.x (nol regresi)', JSON.stringify(e.fhd) === '["avc1.640028","avc1.4D0028","avc1.42002A"]', JSON.stringify(e.fhd));
  ok('2K/4K@30 → level 5.1 (avc1.640033) pilihan pertama', e.qhd[0] === 'avc1.640033' && e.uh[0] === 'avc1.640033', JSON.stringify([e.qhd[0], e.uh[0]]));
  ok('4K@60fps → level 5.2 (avc1.640034)', e.uh60[0] === 'avc1.640034', e.uh60[0]);
  ok('Semua codec >1080p ber-awalan High/Main/Baseline level sama', e.uh.every(c => /6400|4D00|4200/.test(c)), JSON.stringify(e.uh));

  /* dukungan encoder nyata utk 4K (menentukan jalur uji H) */
  const sup = await cdp.eval(`(async () => {
    try {
      const s = await VideoEncoder.isConfigSupported({ codec: 'avc1.640033', width: 3840, height: 2160, bitrate: 24e6, framerate: 30, hardwareAcceleration: 'prefer-software' });
      return !!s.supported;
    } catch (er) { return false; }
  })()`);
  console.log(`  (info) encoder software 4K didukung di env ini: ${sup}`);

  /* ============ F. EKSPOR NYATA 720p ============ */
  console.log('F. EKSPOR NYATA 720p — 2 PART');
  const f = await cdp.eval(`(async () => {
    document.querySelector('#segRes button[data-v="720"]').click();
    document.querySelector('#segAcc button[data-v="cpu"]').click();
    const ip = document.querySelector('#inSplitParts');
    ip.value = '2'; ip.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 400));
    const res = await exportPartsToDir('${OUT720}', { prog() { }, sub() { }, title() { } });
    return { n: res.length, names: res.map(r => r.name) };
  })()`);
  const mp4s720 = fs.readdirSync(OUT720).filter(f => /\.mp4$/.test(f)).sort();
  ok('2 part MP4 720p tersimpan', f.n === 2 && mp4s720.length === 2, JSON.stringify({ f, mp4s720 }));
  const dim720 = mp4s720.map(fl => {
    const o = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 '${path.join(OUT720, fl)}'`).toString().trim();
    const dur = +execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 '${path.join(OUT720, fl)}'`).toString().trim();
    return { o, dur };
  });
  ok('ffprobe SEMUA part = 1280×720', dim720.every(x => x.o === '1280,720'), JSON.stringify(dim720));
  ok('Durasi tiap part ±4 dtk (8 dtk ÷ 2 part)', dim720.every(x => Math.abs(x.dur - 4) < 0.6), JSON.stringify(dim720));

  /* ============ G. EKSPOR NYATA 2K ============ */
  console.log('G. EKSPOR NYATA 2K — 1 PART (tanpa split)');
  const g = await cdp.eval(`(async () => {
    document.querySelector('#segRes button[data-v="1440"]').click();
    const ip = document.querySelector('#inSplitParts');
    ip.value = ''; ip.dispatchEvent(new Event('input'));
    state.splitParts = 0; state.splitSec = 999;
    await new Promise(r => setTimeout(r, 400));
    const res = await exportPartsToDir('${OUT2K}', { prog() { }, sub() { }, title() { } });
    return { n: res.length };
  })()`);
  const mp4s2k = fs.readdirSync(OUT2K).filter(f => /\.mp4$/.test(f));
  ok('1 part MP4 2K tersimpan', g.n === 1 && mp4s2k.length === 1, JSON.stringify({ g, mp4s2k }));
  const dim2k = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 '${path.join(OUT2K, mp4s2k[0])}'`).toString().trim();
  ok('ffprobe = 2560×1440', dim2k === '2560,1440', dim2k);

  /* ============ H. EKSPOR NYATA 4K ============ */
  console.log('H. EKSPOR NYATA 4K — 2 PART (range 0–5 dtk agar ringkas)');
  if (sup) {
    const h = await cdp.eval(`(async () => {
      document.querySelector('#segRes button[data-v="2160"]').click();
      state.rangeStart = 0; state.rangeEnd = 5;
      const ip = document.querySelector('#inSplitParts');
      ip.value = '2'; ip.dispatchEvent(new Event('input'));
      await new Promise(r => setTimeout(r, 400));
      const res = await exportPartsToDir('${OUT4K}', { prog() { }, sub() { }, title() { } });
      return { n: res.length };
    })()`);
    const mp4s4k = fs.readdirSync(OUT4K).filter(f => /\.mp4$/.test(f)).sort();
    ok('2 part MP4 4K tersimpan (5 dtk ÷ 2)', h.n === 2 && mp4s4k.length === 2, JSON.stringify({ h, mp4s4k }));
    const dim4k = mp4s4k.map(fl => execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 '${path.join(OUT4K, fl)}'`).toString().trim());
    ok('ffprobe SEMUA part = 3840×2160', dim4k.every(x => x === '3840,2160'), JSON.stringify(dim4k));
  } else {
    console.log('  LEWATI — encoder software env ini tidak mendukung 4K (di Windows + GPU pengguna tetap jalan via level 5.1/5.2)');
    const h2 = await cdp.eval(`(async () => {
      document.querySelector('#segRes button[data-v="2160"]').click();
      try { await exportPartsToDir('${OUT4K}', { prog() { }, sub() { }, title() { } }); return { threw: false }; }
      catch (er) { return { threw: true, msg: String(er.message || er) }; }
    })()`);
    ok('Encoder tak sanggup 4K → pesan error JELAS menyebut resolusi + saran turunkan', h2.threw && /3840×2160/.test(h2.msg) && /RESOLUSI/.test(h2.msg), h2.msg);
  }
  /* bersihkan range utk uji batch */
  await cdp.eval(`state.rangeStart = 0; state.rangeEnd = 0;`);

  /* ============ I. BATCH EKSPOR 720p — 2 VIDEO ============ */
  console.log('I. BATCH EKSPOR (tombol asli) — 2 VIDEO @720p');
  const i = await cdp.eval(`(async () => {
    document.querySelector('#segRes button[data-v="720"]').click();
    const ip = document.querySelector('#inSplitParts');
    ip.value = ''; ip.dispatchEvent(new Event('input'));
    state.splitParts = 0; state.splitSec = 4;   /* part ±4 dtk utk 2 video uji */
    pickOutDir = async () => '${OUTBAT}';
    addBatchPath('${ROOT}/testmedia/v34-8s.mp4', 'batch');
    addBatchPath('${ROOT}/testmedia/v34-6s.mp4', 'batch');
    await runBatch(true);
    return { n: state.batch.length, st: state.batch.map(b => b.status + ':' + b.msg) };
  })()`);
  ok('Batch memproses 2 video sukses', i.n === 2 && i.st.every(s => /^done/.test(s)), JSON.stringify(i));
  const mp4sBat = fs.readdirSync(OUTBAT).filter(f => /_PART_\d+\.mp4$/.test(f)).sort();
  ok('Part batch tersimpan (8s→2 part 4dtk, 6s→2 part ±3dtk)', mp4sBat.length === 4, JSON.stringify(mp4sBat));
  const dimBat = mp4sBat.map(fl => execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 '${path.join(OUTBAT, fl)}'`).toString().trim());
  ok('ffprobe SEMUA part batch = 1280×720 (resolusi ikut SEMUA video)', dimBat.length === 4 && dimBat.every(x => x === '1280,720'), JSON.stringify(dimBat));
  const durBat = mp4sBat.map(fl => +execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 '${path.join(OUTBAT, fl)}'`).toString().trim());
  ok('Durasi part batch wajar (1.5-5 dtk)', durBat.every(x => x >= 1.5 && x < 5), JSON.stringify(durBat));

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
