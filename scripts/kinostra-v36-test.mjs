/* ================================================================
   KINOSTRA v3.6 — UJI COVER VIDEO PEMBUKA (modul 08B) — Xvfb + CDP
   Jalankan: DISPLAY=:99 node scripts/kinostra-v36-test.mjs
   Cover uji: kanvas hijau polos 0x00B140 + tulisan "COVER" (640×360)
              → warna pixel bisa dibuktikan matematis dari file final.
   Cakupan:
   A. Smoke UI modul 08B (segCover MATI/AKTIF, segCoverDur 1/2/3/5,
      tombol IMPOR COVER & BUAT DI STUDIO SAMPUL, default MATI 2 dtk)
   B. setCoverFromDataUrl (jalur asli impor & Studio Sampul) → auto
      AKTIF + status; toggle chip MATI/AKTIF; chip durasi
   C. Pixel drawCoverFrame (320×180) = hijau 0x00B140 + coverActive()
   C2. STUDIO SAMPUL mode cover: openSampul(true) → tombol "PAKAI
       SEBAGAI COVER VIDEO" memasang cover dari kanvas
   D. EKSPOR NYATA 1 PART + cover 2 dtk: durasi 8+2=10 dtk, frame
      0.1–1.9 HIJAU, @2.5 konten (kiri merah/kanan biru), audio 2 dtk
      pertama BUNGKAM lalu sine terdengar
   E. EKSPOR NYATA SPLIT 2 PART + cover: KEDUA part 2+4=6 dtk, keduanya
      dibuka cover hijau lalu konten
   F. GABUNG 2 VIDEO + cover: 2+3+3=8 dtk, cover cuma SEKALI di awal
   ================================================================ */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project';
const OUT1 = '/tmp/kinov36-one', OUT2 = '/tmp/kinov36-split', OUTM = '/tmp/kinov36-merge';
const PORT = 9456;
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
/* dimensi + sampling frame per wilayah (kiri/tengah/kanan) pada ts */
function frameDims(mp4) {
  const [w, h] = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 '${mp4}'`).toString().trim().split(',').map(Number);
  return { w, h };
}
function frameAt(file, ts, w, h) {
  const raw = execSync(`ffmpeg -v error -ss ${ts} -i '${file}' -frames:v 1 -f rawvideo -pix_fmt rgb24 -`, { maxBuffer: 64e6, encoding: 'buffer' });
  const avg = (x0, x1) => { let R = 0, G = 0, B = 0, n = 0;
    for (let y = h * 0.25 | 0; y < h * 0.75; y += 2) for (let x = Math.round(x0); x < Math.round(x1); x += 2) {
      const o = (y * w + x) * 3; R += raw[o]; G += raw[o + 1]; B += raw[o + 2]; n++;
    } return { R: Math.round(R / n), G: Math.round(G / n), B: Math.round(B / n) };
  };
  return { left: avg(0, w / 3), mid: avg(w / 3, (2 * w) / 3), right: avg((2 * w) / 3, w) };
}
const allGreen = f => isGreen(f.left) && isGreen(f.mid) && isGreen(f.right);
const noneGreen = f => !isGreen(f.left) && !isGreen(f.mid) && !isGreen(f.right);
const isGreen = p => p.G > 110 && p.R < 90 && p.B < 110;
const isRed = p => p.R > 140 && p.B < 110 && p.G < 120;
const isBlue = p => p.B > 140 && p.R < 110;
/* audio: mean_volume dB pada rentang */
function volDb(file, from, to) {
  const out = execSync(`ffmpeg -v info -ss ${from} -t ${to - from} -i '${file}' -af volumedetect -f null - 2>&1 | grep mean_volume || true`).toString();
  const m = /mean_volume:\s*(-?[\d.]+|-inf)/.exec(out);
  return m ? m[1] : '?';
}
const dbNum = s => s.startsWith('-inf') ? -999 : parseFloat(s);

for (const d of [OUT1, OUT2, OUTM]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
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
  console.log('A. SMOKE UI MODUL 08B COVER VIDEO PEMBUKA');
  const a = await cdp.eval(`(() => {
    const seg = document.querySelector('#segCover');
    const bOn = document.querySelector('#segCover button[data-v="on"]');
    const bOff = document.querySelector('#segCover button[data-v="off"]');
    const dur = document.querySelector('#segCoverDur');
    const durBtns = dur ? [...dur.querySelectorAll('button')] : [];
    return {
      seg: !!seg, offOn: bOff && bOff.classList.contains('on') && !bOn.classList.contains('on'),
      durN: durBtns.length, durVals: durBtns.map(b => b.dataset.v), dur2: durBtns.find(b => b.dataset.v === '2')?.classList.contains('on'),
      btnImp: !!document.querySelector('#btnCoverImport'), btnStd: !!document.querySelector('#btnCoverStudio'),
      stat: (document.querySelector('#coverStat') || {}).textContent || '',
      note: document.body.innerHTML.includes('COVER VIDEO PEMBUKA'),
      st: { on: state.cover.on, dur: state.cover.dur, img: !!state.cover.img, name: state.cover.name }
    };
  })()`);
  ok('Modul 08B ada: segCover MATI/AKTIF + default MATI', a.seg && a.offOn && a.st.on === false);
  ok('DURASI COVER: 4 chip (1/2/3/5), default 2 DETIK', a.durN === 4 && JSON.stringify(a.durVals) === '["1","2","3","5"]' && a.dur2 && a.st.dur === 2, JSON.stringify(a.durVals));
  ok('Tombol IMPOR COVER + BUAT DI STUDIO SAMPUL ada', a.btnImp && a.btnStd);
  ok('Status awal "Belum ada cover" + label & note tampil', a.stat.includes('Belum ada cover') && a.note);

  /* ============ B. PASANG COVER (jalur asli setCoverFromDataUrl) ============ */
  console.log('B. PASANG COVER VIA setCoverFromDataUrl (jalur impor asli)');
  const b = await cdp.eval(`(async () => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 360;
    const g = c.getContext('2d');
    g.fillStyle = '#00B140'; g.fillRect(0, 0, 640, 360);
    g.fillStyle = '#ffffff'; g.font = '700 90px sans-serif'; g.textAlign = 'center';
    g.fillText('COVER', 320, 205);
    const durl = c.toDataURL('image/png');
    setCoverFromDataUrl(durl, 'COVER_UJI.png');
    await new Promise(r => setTimeout(r, 400));
    const bOn = document.querySelector('#segCover button[data-v="on"]');
    return {
      on: state.cover.on, w: state.cover.img && state.cover.img.naturalWidth, h: state.cover.img && state.cover.img.naturalHeight,
      name: state.cover.name, chipOn: bOn && bOn.classList.contains('on'),
      stat: (document.querySelector('#coverStat') || {}).textContent || '', dur: state.cover.dur
    };
  })()`);
  ok('Cover terpasang + AUTO AKTIF (chip AKTIF nyala, 640×360)', b.on === true && b.w === 640 && b.h === 360 && b.chipOn, JSON.stringify(b));
  ok('Status menampilkan AKTIF + nama + durasi 2 dtk', b.stat.includes('AKTIF') && b.stat.includes('COVER_UJI.png') && b.stat.includes('2 dtk'), b.stat);
  const b2 = await cdp.eval(`(() => {
    const cl = v => document.querySelector('#segCover button[data-v="' + v + '"]').click();
    const r = {};
    cl('off'); r.off = { on: state.cover.on, chipOff: document.querySelector('#segCover button[data-v="off"]').classList.contains('on') };
    cl('on'); r.on = { on: state.cover.on };
    document.querySelector('#segCoverDur button[data-v="3"]').click(); r.d3 = state.cover.dur;
    document.querySelector('#segCoverDur button[data-v="2"]').click(); r.d2 = state.cover.dur;
    return r;
  })()`);
  ok('Toggle MATI → AKTIF berfungsi (state + chip)', b2.off.on === false && b2.off.chipOff && b2.on.on === true, JSON.stringify(b2));
  ok('Chip durasi 3 → state.cover.dur=3, kembali 2', b2.d3 === 3 && b2.d2 === 2, JSON.stringify(b2));

  /* ============ C. PIXEL drawCoverFrame ============ */
  console.log('C. PIXEL drawCoverFrame (320×180)');
  const c = await cdp.eval(`(() => {
    const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180;
    const g = cv.getContext('2d', { willReadFrequently: true });
    drawCoverFrame(g, 320, 180);
    const im = g.getImageData(0, 0, 320, 180).data;
    let R = 0, G = 0, B = 0, n = 0;
    for (let y = 40; y < 140; y += 3) for (let x = 30; x < 290; x += 3) { const o = (y * 320 + x) * 4; R += im[o]; G += im[o + 1]; B += im[o + 2]; n++; }
    return { avg: { R: Math.round(R / n), G: Math.round(G / n), B: Math.round(B / n) }, act: !!coverActive() };
  })()`);
  ok('drawCoverFrame mengisi penuh = HIJAU 0x00B140 (crop pas)', isGreen(c.avg), JSON.stringify(c.avg));
  ok('coverActive() true saat AKTIF + gambar siap', c.act === true);

  /* ============ C2. STUDIO SAMPUL MODE COVER ============ */
  console.log('C2. STUDIO SAMPUL — PAKAI SEBAGAI COVER VIDEO');
  await cdp.eval(`(async () => {
    document.querySelector('#autoSub').checked = false;
    await loadFromPath('${ROOT}/testmedia/v35-2tone.mp4', true);
  })()`);
  await sleep(1400);
  const c2 = await cdp.eval(`(async () => {
    openSampul(true);
    await new Promise(r => setTimeout(r, 600));
    const btn = document.querySelector('#btnSampulUseCover');
    const r = { btn: !!btn, title: (document.querySelector('#mTitle') || {}).textContent || '', before: state.cover.name };
    if (btn) { btn.click(); await new Promise(r2 => setTimeout(r2, 500)); }
    r.afterName = state.cover.name; r.afterOn = state.cover.on;
    r.modalHidden = document.querySelector('#modal').classList.contains('hidden');
    return r;
  })()`);
  ok('Modal Studio Sampul mode cover: tombol PAKAI SEBAGAI COVER VIDEO ada', c2.btn && /COVER/.test(c2.title), JSON.stringify({ title: c2.title, btn: c2.btn }));
  ok('Klik tombol → cover dari kanvas terpasang ("STUDIO SAMPUL") + modal tutup', c2.afterName === 'STUDIO SAMPUL' && c2.afterOn === true && c2.modalHidden, JSON.stringify({ name: c2.afterName, on: c2.afterOn, hid: c2.modalHidden }));
  /* kembalikan cover hijau deterministik utk uji ekspor */
  await cdp.eval(`(async () => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 360;
    const g = c.getContext('2d'); g.fillStyle = '#00B140'; g.fillRect(0, 0, 640, 360);
    setCoverFromDataUrl(c.toDataURL('image/png'), 'COVER_UJI.png');
    await new Promise(r => setTimeout(r, 300));
  })()`);

  /* ============ D. EKSPOR NYATA 1 PART + COVER 2 DTK ============ */
  console.log('D. EKSPOR NYATA 1 PART + COVER 2 DETIK (8 dtk konten → 10 dtk)');
  const d = await cdp.eval(`(async () => {
    state.titleOn = false; state.descOn = false; state.subsOn = false; state._noPart = true;
    state.colorFilter = 'off'; state.vfx.vignette = false; state.vfx.grain = false;
    document.querySelector('#segRatio button[data-v="16:9"]').click();
    document.querySelector('#segAcc button[data-v="cpu"]').click();
    state.splitParts = 0; state.splitSec = 30; state.rangeStart = 0; state.rangeEnd = 0;
    state.spk.on = false; state.spk.ready = false;
    document.querySelector('#segCoverDur button[data-v="2"]').click();
    state.cover.on = true;
    await new Promise(r => setTimeout(r, 300));
    const res = await exportPartsToDir('${OUT1}', { prog() { }, sub() { }, title() { } });
    return { n: res.length, names: res.map(r2 => r2.name) };
  })()`);
  const mp4s1 = fs.readdirSync(OUT1).filter(f => /\.mp4$/.test(f)).sort();
  ok('1 part MP4 tersimpan (cover AKTIF)', d.n === 1 && mp4s1.length === 1, JSON.stringify({ d, mp4s1 }));
  const f1 = path.join(OUT1, mp4s1[0]);
  const pr1 = probe(f1);
  ok('Durasi output = 8 (konten) + 2 (cover) = 10 dtk', Math.abs(pr1.dur - 10) < 0.8, `dur=${pr1.dur.toFixed(2)}`);
  ok('ffprobe dim valid (16:9 skala 100% = 1920×1080, perilaku outDims lama)', pr1.dim === '1920,1080', pr1.dim);
  const dm1 = frameDims(f1);
  const fr1 = ts => frameAt(f1, ts, dm1.w, dm1.h);
  ok('Frame @0.1 dtk = HIJAU penuh (cover tampil)', allGreen(fr1(0.1)), JSON.stringify(fr1(0.1)));
  ok('Frame @1.9 dtk = HIJAU penuh (cover masih tampil)', allGreen(fr1(1.9)), JSON.stringify(fr1(1.9)));
  const ct25 = fr1(2.5), ct75 = fr1(7.5);
  ok('Frame @2.5 dtk = KONTEN (kiri merah / kanan biru)', isRed(ct25.left) && isBlue(ct25.right), JSON.stringify(ct25));
  ok('Frame @7.5 dtk = KONTEN (video asli berjalan normal)', isRed(ct75.left) && isBlue(ct75.right), JSON.stringify(ct75));
  const vEarly = dbNum(volDb(f1, 0.2, 1.8)), vMid = dbNum(volDb(f1, 3, 5));
  ok(`Audio 2 dtk pertama BUNGKAM (${vEarly} dB) lalu sine terdengar (${vMid} dB)`, vEarly < -55 && vMid > -45, `${vEarly} vs ${vMid}`);

  /* ============ E. EKSPOR NYATA SPLIT 2 PART + COVER ============ */
  console.log('E. EKSPOR NYATA SPLIT 2 PART — SETIAP PART DIBUKA COVER');
  const e = await cdp.eval(`(async () => {
    document.querySelector('#segRatio button[data-v="16:9"]').click();
    state.splitParts = 0; state.splitSec = 4; state._noPart = false;
    await new Promise(r => setTimeout(r, 300));
    const res = await exportPartsToDir('${OUT2}', { prog() { }, sub() { }, title() { } });
    return { n: res.length, names: res.map(r2 => r2.name) };
  })()`);
  const mp4s2 = fs.readdirSync(OUT2).filter(f => /\.mp4$/.test(f)).sort();
  ok('2 part MP4 tersimpan (split 4 dtk + cover)', e.n === 2 && mp4s2.length === 2, JSON.stringify({ e, mp4s2 }));
  const pr2 = mp4s2.map(fl => probe(path.join(OUT2, fl)));
  ok('KEDUA part durasi = 4 (konten) + 2 (cover) = 6 dtk', pr2.every(p => Math.abs(p.dur - 6) < 0.7), JSON.stringify(pr2.map(p => +p.dur.toFixed(2))));
  ok('KEDUA part dim sama', pr2.every(p => p.dim === pr2[0].dim), JSON.stringify(pr2.map(p => p.dim)));
  const dm2 = frameDims(path.join(OUT2, mp4s2[0]));
  const e1g = frameAt(path.join(OUT2, mp4s2[0]), 0.1, dm2.w, dm2.h), e1c = frameAt(path.join(OUT2, mp4s2[0]), 2.5, dm2.w, dm2.h);
  const e2g = frameAt(path.join(OUT2, mp4s2[1]), 0.1, dm2.w, dm2.h), e2c = frameAt(path.join(OUT2, mp4s2[1]), 2.5, dm2.w, dm2.h);
  ok('PART_01: @0.1 HIJAU (cover) → @2.5 konten merah/biru', allGreen(e1g) && isRed(e1c.left) && isBlue(e1c.right), JSON.stringify({ cover: e1g, konten: e1c }));
  ok('PART_02: @0.1 HIJAU (cover ikut SETIAP part) → @2.5 konten', allGreen(e2g) && isRed(e2c.left) && isBlue(e2c.right), JSON.stringify({ cover: e2g, konten: e2c }));

  /* ============ F. GABUNG 2 VIDEO + COVER SEKALI DI AWAL ============ */
  console.log('F. GABUNG VIDEO — COVER HANYA DI PEMBUKA GABUNGAN');
  const f = await cdp.eval(`(async () => {
    state.splitSec = 30; state._noPart = true;
    const res = await exportMergeToDir(['${ROOT}/testmedia/short-a.mp4', '${ROOT}/testmedia/short-b.mp4'], '${OUTM}', { prog() { }, sub() { } });
    return { n: res.length, names: res.map(r2 => r2.name) };
  })()`);
  const mp4sM = fs.readdirSync(OUTM).filter(x => /\.mp4$/.test(x));
  ok('1 file gabungan tersimpan', f.n === 1 && mp4sM.length === 1, JSON.stringify({ f, mp4sM }));
  const fm = path.join(OUTM, mp4sM[0]);
  const prM = probe(fm);
  ok('Durasi gabungan = 2 (cover) + 3 + 3 = 8 dtk', Math.abs(prM.dur - 8) < 0.8, `dur=${prM.dur.toFixed(2)}`);
  const dmM = frameDims(fm);
  const mg = frameAt(fm, 0.1, dmM.w, dmM.h), mg2 = frameAt(fm, 1.9, dmM.w, dmM.h), mc = frameAt(fm, 2.4, dmM.w, dmM.h), mc2 = frameAt(fm, 5.5, dmM.w, dmM.h);
  ok('Gabungan @0.1 & @1.9 = HIJAU penuh (cover pembuka)', allGreen(mg) && allGreen(mg2), JSON.stringify({ a: mg, b: mg2 }));
  ok('Gabungan @2.4 & @5.5 = konten film (tidak hijau penuh) — cover TIDAK diulang antar film', !allGreen(mc) && !allGreen(mc2), JSON.stringify({ a: mc, b: mc2 }));

  /* rapikan state */
  await cdp.eval(`state.cover.on = false; state._noPart = false;`);

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
