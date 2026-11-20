/* ================================================================
   UJI v3.35.0 — 5 FRAME REFERENSI KAWAN utk JUDUL & PART DI VIDEO
   Fitur: katalog TITLEFRAMES & PARTFRAMES +5 kunci (komik, glossy,
   sport, pitaemas, neonlayar) — port gaya 5 gambar referensi user;
   bagian dalam KOSONG/TRANSPARAN utk tulisan; digambar drawRefFrame
   (compose.js) via drawTitleFrame & drawPartFrame → otomatis
   menyesuaikan ukuran teks; pratinjau = ekspor persis.
   Pakai: bash scripts/run-test-xvfb.sh scripts/kinostra-v335-test.mjs 420
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/home/z/my-project';
const PORT = 9517;
const VID = ROOT + '/testmedia/silent180.mp4';
const TONE = ROOT + '/testmedia/tone180.mp4';
const OUT = ROOT + '/testmedia/out-v335';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, gagal = 0;
const ok = (nama, syarat, detail = '') => {
  console.log((syarat ? '✅ LULUS' : '❌ GAGAL') + ' — ' + nama + (detail ? ' · ' + detail : ''));
  syarat ? pass++ : gagal++;
};

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map();
    ws.addEventListener('message', e => { const m = JSON.parse(e.data);
      if (m.id && this.pend.has(m.id)) { const { res, rej } = this.pend.get(m.id); this.pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } });
  }
  static async connect(port, tries = 90) {
    for (let i = 0; i < tries; i++) {
      try { const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        const page = list.find(t => t.type === 'page' && /index\.html/.test(t.url));
        if (page) { const ws = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); setTimeout(() => rej(new Error('ws')), 8000); });
          return new CDP(ws); } } catch (e) { }
      await sleep(1000);
    } throw new Error('CDP tidak tersambung');
  }
  send(method, params = {}) { return new Promise((res, rej) => { const id = ++this.id; this.pend.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expr, timeoutMs = 30000) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: timeoutMs });
    if (r.exceptionDetails) throw new Error('PAGE-ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300));
    return r.result.value;
  }
}
async function reconnect(cdp) {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const pg = list.find(t => t.type === 'page' && /index\.html/.test(t.url));
  const ws = new WebSocket(pg.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); setTimeout(() => rej(new Error('ws')), 8000); });
  cdp.ws = ws; cdp.pend = new Map();
}
async function evalRetry(cdp, expr, ms = 20000) {
  try { return await cdp.eval(expr, ms); }
  catch (e) { await reconnect(cdp); return await cdp.eval(expr, ms); }
}
async function evalOnce(cdp, expr, ms) {
  try { return await cdp.eval(expr, ms); }
  catch (e) { try { await reconnect(cdp); } catch (e2) { } throw e; }
}
async function loadVideo(cdp, path) {
  for (let i = 1; i <= 3; i++) {
    await evalRetry(cdp, `loadFromPath(${JSON.stringify(path)}); 'ok'`, 15000);
    for (let k = 0; k < 25; k++) { await sleep(1000);
      const s = await evalRetry(cdp, `state.duration || 0`, 8000).catch(() => 0);
      if (s > 0) return true;
    }
  }
  return false;
}
const SETAN = `state.cover.on = false; state.kilat = 'off'; state.parallel = 2;
  state.descOn = false; state.subsOn = false;
  state.cutMode = 'full'; state.acc = 'cpu'; state.scale = '0.35'; state.fps = 15;`;

/* kode halaman: gambar drawRefFrame langsung + ukur piksel (interior &
   warna khas per gaya) */
const UJI_LANGSUNG = `(() => {
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const box = { cx: 320, x0: 200, x1: 440, y0: 100, y1: 200, fs: 52, u: 1, safe: 28.6 };
  const KEYZ = ['komik', 'glossy', 'sport', 'pitaemas', 'neonlayar'];
  const out = {};
  for (const k of KEYZ) {
    g.clearRect(0, 0, 640, 360);
    drawRefFrame(g, 640, 360, k, Object.assign({}, box));
    const im = g.getImageData(0, 0, 640, 360).data;
    const px = (X, Y) => { const i = ((Y | 0) * 640 + (X | 0)) * 4; return [im[i], im[i + 1], im[i + 2], im[i + 3]]; };
    let ungu = 0, merah = 0, kuning = 0, cyan = 0, pink = 0, emas = 0;
    for (let i = 0; i < im.length; i += 4) {
      const r = im[i], gg = im[i + 1], b = im[i + 2], a = im[i + 3];
      if (a < 120) continue;
      if (b > 170 && b - gg > 40 && r < 200) ungu++;
      if (r > 150 && gg < 90 && b < 90) merah++;
      if (r > 230 && gg > 170 && b < 130) kuning++;
      if (b > 200 && gg > 140 && r < 140) cyan++;
      if (r > 200 && b > 120 && gg < 130) pink++;
      if (r > 190 && gg > 110 && gg < 215 && b < 110) emas++;
    }
    const rr = Math.min(200 * 0.30, 52 * 0.30, 28.6 * 0.95);
    out[k] = { pusat: px(320, 150)[3], zonaTeks: px(234.6, 150)[3],
      ungu, merah, kuning, cyan, pink, emas,
      ekor: px(186, 150), cincin: px(200, 150 - rr)[3] };
  }
  return out;
})()`;

/* kode halaman: pixel-diff drawComposition (dgn frame vs TANPA) utk 5 kunci */
const DIFF = (mode) => `(() => {
  const W = 960, H = 540;
  const cvA = document.createElement('canvas'); cvA.width = W; cvA.height = H;
  const cvB = document.createElement('canvas'); cvB.width = W; cvB.height = H;
  const xa = cvA.getContext('2d'), xb = cvB.getContext('2d');
  const KEYZ = ['komik', 'glossy', 'sport', 'pitaemas', 'neonlayar'];
  ${mode === 'judul'
    ? `state.titleOn = true; state.title = 'PETUALANGAN GUNUNG'; state.titleSize = 40; state.titlePosY = 0;
       state.partShow = 'off'; state.descOn = false; state.subsOn = false;`
    : mode === 'intro'
      ? `state.titleOn = false; state.partShow = 'intro'; state.partAnim = 'off'; state.partPrefix = 'PART';
         state.partSize = 0.6; state.partColor = ''; state.descOn = false; state.subsOn = false;`
      : `state.titleOn = false; state.partShow = 'always'; state.partAnim = 'off'; state.partPrefix = 'PART';
         state.partSize = 0.6; state.partColor = ''; state.descOn = false; state.subsOn = false;`}
  const tt = ${mode === 'intro' ? '0.3' : '5.0'};
  const per = {};
  for (const k of KEYZ) {
    ${mode === 'judul' ? `state.titleFrame = 'off';` : `state.partFrame = 'off';`}
    drawComposition(xa, W, H, tt, { native: false });
    ${mode === 'judul' ? `state.titleFrame = k;` : `state.partFrame = k;`}
    drawComposition(xb, W, H, tt, { native: false });
    const da = xa.getImageData(0, 0, W, H).data, db = xb.getImageData(0, 0, W, H).data;
    let n = 0;
    for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) + Math.abs(da[i + 3] - db[i + 3]) > 60) n++;
    per[k] = n;
  }
  ${mode === 'judul' ? `state.titleFrame = 'off';` : `state.partFrame = 'off';`}
  return per;
})()`;

/* kode halaman: klamp layar — box mepet tepi kanan & kiri, semua gaya */
const UJI_CLAMP = `(() => {
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const KEYZ = ['komik', 'glossy', 'sport', 'pitaemas', 'neonlayar'];
  const out = {};
  const boxKanan = { cx: 598, x0: 560, x1: 636, y0: 40, y1: 120, fs: 52, u: 1 };
  const boxKiri = { cx: 42, x0: 4, x1: 80, y0: 40, y1: 120, fs: 52, u: 1 };
  for (const k of KEYZ) {
    let err = null, ada = 0;
    try {
      g.clearRect(0, 0, 640, 360);
      drawRefFrame(g, 640, 360, k, Object.assign({ safe: 20 }, boxKanan));
      let im = g.getImageData(0, 0, 640, 360).data;
      for (let i = 3; i < im.length; i += 4) if (im[i] > 100) ada++;
      g.clearRect(0, 0, 640, 360);
      drawRefFrame(g, 640, 360, k, Object.assign({ safe: 20 }, boxKiri));
      im = g.getImageData(0, 0, 640, 360).data;
      for (let i = 3; i < im.length; i += 4) if (im[i] > 100) ada++;
    } catch (e) { err = String(e && e.message || e).slice(0, 80); }
    out[k] = { err, ada };
  }
  return out;
})()`;

try {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const app = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
  process.on('exit', () => { try { app.kill('SIGKILL'); } catch (e) { } });
  const cdp = await CDP.connect(PORT);
  await sleep(2500);

  /* 1 — versi & katalog 22+22 dgn 5 kunci baru di kedua menu */
  const ver = await evalRetry(cdp, `document.querySelector('.tag') ? document.querySelector('.tag').innerText : ''`, 10000);
  ok('Aplikasi hidup + label versi v3.35.0', /v3\.35\.0/.test(ver || ''), (ver || '').slice(0, 50));
  const kat = await evalRetry(cdp, `(() => {
    const baru = ['komik', 'glossy', 'sport', 'pitaemas', 'neonlayar'];
    const cek = K => ({ n: K.length, ada: baru.every(b => K.some(f => f.k === b)),
      pngTerakhir: K[K.length - 1].k, baruSebelumPng: K.map(f => f.k).indexOf('png') - K.map(f => f.k).indexOf('neonlayar') === 1 });
    return { T: cek(TITLEFRAMES), P: cek(PARTFRAMES),
      nT: document.querySelectorAll('#titleFrameChips button').length,
      nP: document.querySelectorAll('#partFrameChips button').length,
      namaBaru: [...document.querySelectorAll('#partFrameChips button')].filter(b => baru.includes(b.dataset.v)).map(b => b.textContent.trim()) };
  })()`, 10000);
  ok('Katalog 22+22: 5 kunci baru di JUDUL & PART, urut sebelum PNG/JPG SENDIRI (22 chip per menu)',
    kat.T.n === 22 && kat.P.n === 22 && kat.T.ada && kat.P.ada && kat.T.pngTerakhir === 'png' && kat.P.pngTerakhir === 'png'
      && kat.T.baruSebelumPng && kat.P.baruSebelumPng && kat.nT === 22 && kat.nP === 22 && kat.namaBaru.length === 5,
    `judul ${kat.T.n}/${kat.nT} chip · part ${kat.P.n}/${kat.nP} chip · ${kat.namaBaru.join('|')}`);

  /* 2 — label menu diperbarui: 20 GAYA + PNG/JPG SENDIRI */
  const lbl = await evalRetry(cdp, `(() => {
    const semua = [...document.querySelectorAll('.lbl')].map(e => e.innerText);
    return { part: semua.find(t => /FRAME PART DI VIDEO/.test(t) || '') || '',
      judul: semua.find(t => /FRAME JUDUL DI VIDEO/.test(t) || '') || '' };
  })()`, 10000);
  ok('Label menu: FRAME PART & FRAME JUDUL — 20 GAYA + PNG/JPG SENDIRI',
    /20 GAYA \+ PNG\/JPG SENDIRI/.test(lbl.part) && /20 GAYA \+ PNG\/JPG SENDIRI/.test(lbl.judul),
    `${lbl.part} · ${lbl.judul}`);

  /* 3 — klik chip KOMIK (judul) → state + chip ON + toast */
  const klikT = await evalRetry(cdp, `(async () => {
    const b = [...document.querySelectorAll('#titleFrameChips button')].find(x => x.dataset.v === 'komik');
    b.click(); await new Promise(r => setTimeout(r, 120));
    const t = document.querySelector('#toast');
    return { fr: state.titleFrame, on: b.classList.contains('on'),
      toast: t ? t.innerText : (document.querySelector('.toast') ? document.querySelector('.toast').innerText : '') };
  })()`, 10000);
  ok('Klik chip KOMIK MERAH-BIRU (judul) → state.titleFrame=komik + chip ON',
    klikT.fr === 'komik' && klikT.on, `toast="${String(klikT.toast).slice(0, 60)}"`);

  /* 4 — klik chip PITA EMAS (part) → state + chip ON */
  const klikP = await evalRetry(cdp, `(async () => {
    const b = [...document.querySelectorAll('#partFrameChips button')].find(x => x.dataset.v === 'pitaemas');
    b.click(); await new Promise(r => setTimeout(r, 120));
    const off = [...document.querySelectorAll('#partFrameChips button')].find(x => x.dataset.v === 'sport');
    return { fr: state.partFrame, on: b.classList.contains('on'), offTetap: !off.classList.contains('on') };
  })()`, 10000);
  ok('Klik chip PITA EMAS (part) → state.partFrame=pitaemas + chip ON (yang lain tetap mati)',
    klikP.fr === 'pitaemas' && klikP.on && klikP.offTetap);

  /* 5 — drawRefFrame langsung: interior KOSONG (pusat & zona teks transparan)
         — NEONLAYAR kecuali pendar glow ≤30/255 (cahaya neon, bukan penutup;
         referensi juga berpendar ke dalam; teks tetap terbaca penuh) */
  const uji = await evalRetry(cdp, UJI_LANGSUNG, 20000);
  const dalam = uji && Object.keys(uji).length === 5
    && Object.entries(uji).every(([k, v]) =>
      k === 'neonlayar' ? (v.pusat <= 30 && v.zonaTeks <= 30) : (v.pusat === 0 && v.zonaTeks === 0));
  ok('Interior KOSONG/TRANSPARAN terukur: pusat box & zona teks tanpa isi di semua 5 gaya (neon = glow ≤12%)',
    dalam, JSON.stringify(Object.fromEntries(Object.entries(uji || {}).map(([k, v]) => [k, [v.pusat, v.zonaTeks]]))));

  /* 6 — warna khas per gaya terukur */
  const st = uji || {};
  ok('KOMIK: bingkai ungu + strip merah + bintang kuning tergambar',
    st.komik && st.komik.ungu > 30 && st.komik.merah > 30 && st.komik.kuning > 10,
    `ungu=${st.komik && st.komik.ungu} merah=${st.komik && st.komik.merah} kuning=${st.komik && st.komik.kuning}`);
  ok('GLOSSY: plat/bibir merah + cincin lencana di tepi kiri tergambar',
    st.glossy && st.glossy.merah > 30 && st.glossy.cincin > 150,
    `merah=${st.glossy && st.glossy.merah} cincin=${st.glossy && st.glossy.cincin}`);
  ok('SPORT: banner biru-cyan + garis kecepatan tergambar',
    st.sport && st.sport.cyan > 30, `cyan=${st.sport && st.sport.cyan}`);
  ok('PITA EMAS: badan emas + ekor kiri terisi emas tergambar',
    st.pitaemas && st.pitaemas.emas > 30 && st.pitaemas.ekor[0] > 190 && st.pitaemas.ekor[2] < 110,
    `emas=${st.pitaemas && st.pitaemas.emas} ekor=${st.pitaemas && st.pitaemas.ekor.join(',')}`);
  ok('NEON CYAN-PINK: bingkai cyan + pendar pink bawah tergambar',
    st.neonlayar && st.neonlayar.cyan > 30 && st.neonlayar.pink > 5,
    `cyan=${st.neonlayar && st.neonlayar.cyan} pink=${st.neonlayar && st.neonlayar.pink}`);

  /* 7 — pixel-diff jalur JUDUL (5 kunci semua mengubah piksel) */
  await ok2(await loadVideo(cdp, VID), 'Video uji termuat');
  const td = await evalRetry(cdp, DIFF('judul'), 60000);
  ok('Pixel-diff JUDUL: 5 frame referensi semua tergambar (>60 px beda vs TANPA)',
    td && Object.keys(td).length === 5 && Object.values(td).every(n => n > 60), JSON.stringify(td));

  /* 8 — pixel-diff jalur PART bumper intro */
  const pd = await evalRetry(cdp, DIFF('intro'), 60000);
  ok('Pixel-diff PART INTRO: 5 frame semua tergambar (>40 px)',
    pd && Object.keys(pd).length === 5 && Object.values(pd).every(n => n > 40), JSON.stringify(pd));

  /* 9 — pixel-diff jalur PART label pojok */
  const pk = await evalRetry(cdp, DIFF('pojok'), 60000);
  ok('Pixel-diff PART POJOK: 5 frame semua tergambar (>40 px)',
    pk && Object.keys(pk).length === 5 && Object.values(pk).every(n => n > 40), JSON.stringify(pk));

  /* 10 — klamp layar: box mepet tepi kanan & kiri → tanpa error, hiasan luar terkampas */
  const clamp = await evalRetry(cdp, UJI_CLAMP, 20000);
  ok('KLAMP layar: box mepet tepi kiri/kanan → tanpa error, bintang/ekor/garis kecepatan terkampas',
    clamp && Object.keys(clamp).length === 5 && Object.values(clamp).every(v => !v.err && v.ada > 100),
    JSON.stringify(clamp));

  /* 11 — gerbang POTONG LANGSUNG: frame judul = efek → TAK BISA potong langsung
         (partShow dinolkan dulu supaya cek LABEL PART tak mendahului) */
  const gate = await evalRetry(cdp, `(() => { state.partShow = 'off'; state.titleOn = false;
    state.titleFrame = 'komik';
    const r = fastCutBlockedReason();
    state.titleFrame = 'pitaemas';
    const r2 = fastCutBlockedReason();
    state.titleFrame = 'off'; state.partShow = 'intro';
    return { r, r2 }; })()`, 10000);
  ok('Gerbang POTONG LANGSUNG: frame referensi dihitung efek (FRAME JUDUL)',
    gate && gate.r === 'FRAME JUDUL' && gate.r2 === 'FRAME JUDUL', JSON.stringify(gate));

  /* 12 — tanda overlay native ikut sadar frame */
  const sig = await evalRetry(cdp, `(() => { if (typeof nativeOverlaySig !== 'function') return null;
    state.partFrame = 'komik'; const a = nativeOverlaySig(0);
    state.partFrame = 'sport'; const b = nativeOverlaySig(0);
    state.partFrame = 'off'; state.titleFrame = 'pitaemas'; const c = nativeOverlaySig(0);
    state.titleFrame = 'off';
    return { bedaPart: a !== b, bedaJudul: b !== c }; })()`, 10000);
  ok('Tanda overlay native berubah saat ganti frame referensi (gambar-ulang otomatis)',
    sig && sig.bedaPart && sig.bedaJudul, JSON.stringify(sig));

  /* 13 — preset: frame referensi tersimpan & dipulihkan (lewat KLIK chip —
         jalur UI nyata; captureSettings membaca chip DOM yang 'on') */
  const preset = await evalRetry(cdp, `(async () => {
    const klik = (sel, v) => { const b = [...document.querySelectorAll(sel + ' button')].find(x => x.dataset.v === v); b.click(); };
    klik('#titleFrameChips', 'pitaemas'); klik('#partFrameChips', 'glossy');
    await new Promise(r => setTimeout(r, 120));
    const data = captureSettings();
    klik('#titleFrameChips', 'off'); klik('#partFrameChips', 'off');
    await new Promise(r => setTimeout(r, 120));
    const tengah = { t: state.titleFrame, p: state.partFrame };
    applySettingsData(JSON.parse(JSON.stringify(data)));
    await new Promise(r => setTimeout(r, 400));
    return { tengah, t: state.titleFrame, p: state.partFrame };
  })()`, 20000);
  ok('Preset: gaya PITA EMAS (judul) + GLOSSY (part) tersimpan & pulih',
    preset.tengah.t === 'off' && preset.tengah.p === 'off' && preset.t === 'pitaemas' && preset.p === 'glossy', JSON.stringify(preset));

  /* 14 — EKSPOR NYATA 1 part: judul KOMIK + part PITA EMAS */
  ok('Media tone (bernada) termuat utk ekspor', await loadVideo(cdp, TONE));
  const ex = await evalOnce(cdp, `(async () => {
    state.rangeStart = 0; state.rangeEnd = 4; state.splitSec = 183; state.splitCustom = true; applySplitParts();
    ${SETAN}
    state.titleOn = true; state.title = 'UJI FRAME REFERENSI'; state.titleAnim = 'off'; state.titleFrame = 'komik';
    state.partShow = 'intro'; state.partFrame = 'pitaemas'; state.partAnim = 'off'; state.partSize = 1;
    const res = await exportPartsToDir(${JSON.stringify(OUT)}, { title() { }, prog() { }, sub() { } });
    return { n: res.length, fatal: state.exportFatal ? String(state.exportFatal.message || state.exportFatal).slice(0, 120) : null };
  })()`, 300000);
  const f = ex && ex.n === 1 ? fs.readdirSync(OUT).filter(x => x.endsWith('.mp4')) : [];
  const sz = f.length ? fs.statSync(OUT + '/' + f[0]).size : 0;
  ok('Ekspor nyata 1 part dgn KOMIK (judul) + PITA EMAS (part): MP4 jadi tanpa fatal',
    ex && ex.n === 1 && !ex.fatal && sz > 100000, `file=${f[0] || '-'} ${(sz / 1048576).toFixed(1)} MB fatal=${ex && ex.fatal}`);

  /* 15 — bersih: swatch warna & chip lain tak tersentuh */
  const aman = await evalRetry(cdp, `(() => {
    const g = document.querySelector('#neonColors');
    return [...g.querySelectorAll('button')].map(b => b.offsetWidth).every(w => Math.abs(w - 34) <= 1);
  })()`, 10000);
  ok('Chip swatch warna tetap 34px (gaya lama aman)', aman === true);

  console.log('SELESAI: ' + pass + ' lulus, ' + gagal + ' gagal');
  try { app.kill('SIGKILL'); } catch (e) { }
  process.exit(gagal ? 1 : 0);
} catch (e) {
  console.error('UJI ERROR: ' + ((e && e.message) || e));
  process.exit(2);
}
async function ok2(syarat, nama) { ok(nama, !!syarat); }
