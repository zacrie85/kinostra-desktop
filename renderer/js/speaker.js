/* ================================================================
   KINOSTRA DESKTOP — speaker.js (v3.1 · ZOOM PEMBICARA OTOMATIS)
   ================================================================
   Seperti aplikasi AI potong-podcast: kamera otomatis meng-zoom
   orang yang SEDANG BICARA dan pindah halus saat gantian.

   Cara kerja (100% offline, semua di PC):
   1. AI DETEKSI ORANG  — model YOLOS-tiny ONNX (±10 MB, unduh sekali
      lalu permanen offline via kmodels://) menandai posisi setiap
      orang di frame, diskandali setiap ±1 detik.
   2. GERAKAN MULUT     — pita kepala/wajah tiap orang dibandingkan
      antar sampel: orang yang bicara = wajahnya bergerak.
   3. KAPAN ADA SUARA   — envelope RMS audio per detik dari buffer
      audio yang sudah di-decode (tanpa internet).
   4. SKOR = suara × lonjakan-gerakan → pembicara aktif per detik,
      dengan histeresis (tidak goyah) + kebijakan saat senyap
      (tetap di pembicara terakhir / tampilkan semua).
   5. TIMELINE KAMERA   — daftar segmen [t0..t1 → pembicara]; crop
      kamera dihitung DETERMINISTIK dari t (aman ekspor paralel),
      aspek terkunci rasio output, zoom halus (ease 0.7 dtk).

   Dipakai compose.js (spkCropAt) di preview & ekspor — hasil split
   pun langsung mengikuti pembicara. Setelan global utk semua video.
   ================================================================ */
'use strict';

const SPK_MODEL = 'Xenova/yolos-tiny';
const SPK_FILES = {
  required: ['config.json', 'preprocessor_config.json', 'onnx/model_quantized.onnx'],
  optional: ['quantize_config.json']
};
const SPK_STEP = 1.0;      /* jarak sampel deteksi (detik) */
const SPK_EASE = 0.7;      /* durasi transisi GESER (detik) */
const SPK_FADE = 0.55;     /* v3.5: durasi crossfade FADE (detik) */
const SPK_ZMAX = 3.2;      /* zoom maksimum terhadap video sumber */
const SPK_PADW = 3.4;      /* lebar crop = lebar kotak orang × ini */
const SPK_PADH = 2.3;      /* tinggi crop = tinggi kotak orang × ini */

let _spkDet = null, _spkLoading = null, _spkAbort = false;

/* ---------- 1. MODEL AI (unduh sekali → offline permanen) ---------- */
async function ensureSpeakerModel(stat) {
  if (_spkDet) return;
  if (_spkLoading) return _spkLoading;
  _spkLoading = (async () => {
    const xf = window.transformers;
    if (!xf || !xf.pipeline) throw new Error('Mesin AI (transformers.js) belum termuat');
    if (stat) stat('Mengunduh model deteksi orang (±10 MB, sekali saja)…');
    const r = await window.kinostra.ensureModel(SPK_MODEL, SPK_FILES);
    if (!r || !r.ok) throw new Error('Unduh model deteksi gagal: ' + ((r && r.error) || 'tidak diketahui'));
    try {
      xf.env.allowLocalModels = true;
      xf.env.allowRemoteModels = false;
      xf.env.localModelPath = 'kmodels://';
      if (xf.env.backends && xf.env.backends.onnx && xf.env.backends.onnx.wasm)
        xf.env.backends.onnx.wasm.wasmPaths = (location.protocol === 'app:' ? 'app://localhost/' : location.href.replace(/[^/]*$/, '')) + 'vendor/ort/';
    } catch (e) { }
    if (stat) stat('Memuat model deteksi orang…');
    _spkDet = await xf.pipeline('object-detection', SPK_MODEL, { dtype: 'q8' });
    if (stat) stat('Model AI siap — 100% offline');
  })();
  try { await _spkLoading; } finally { _spkLoading = null; }
}

/* ---------- 2. ENVELOPE AUDIO PER LANGKAH (ternormalisasi 0..1) ---------- */
function spkAudioEnvelope(step) {
  const b = state.audioBuffer;
  if (!b || !b.duration || !b.getChannelData) return null;
  const n = Math.max(1, Math.floor(b.duration / step));
  const out = new Float32Array(n);
  const c0 = b.getChannelData(0), c1 = b.numberOfChannels > 1 ? b.getChannelData(1) : null;
  const w = Math.max(1, Math.floor(b.sampleRate * step));
  for (let k = 0; k < n; k++) {
    const o = k * w; let s = 0, c = 0;
    for (let i = 0; i < w; i += 6) {
      const v = c1 ? Math.max(Math.abs(c0[o + i] || 0), Math.abs(c1[o + i] || 0)) : Math.abs(c0[o + i] || 0);
      s += v * v; c++;
    }
    out[k] = Math.sqrt(s / Math.max(1, c));
  }
  let mx = 0; for (let k = 0; k < n; k++) if (out[k] > mx) mx = out[k];
  if (mx < 1e-4) return null;               /* video benar-benar tanpa suara */
  for (let k = 0; k < n; k++) out[k] = out[k] / mx;
  return out;
}

/* ---------- util geometri ---------- */
function spkIou(a, b) {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return inter / Math.max(1e-6, a.w * a.h + b.w * b.h - inter);
}
/* kotak pembicara pada waktu t (interpolasi linier antar sampel) */
function spkBoxAt(tr, t) {
  const s = tr.samples; if (!s || !s.length) return null;
  if (t <= s[0].t) return s[0];
  if (t >= s[s.length - 1].t) return s[s.length - 1];
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m].t <= t) lo = m; else hi = m; }
  const a = s[lo], b = s[hi], k = (t - a.t) / Math.max(1e-6, b.t - a.t);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k, m: a.m };
}
/* median sederhana */
function spkMedian(arr) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  return s[s.length >> 1];
}

/* ---------- 3. ANALISIS UTAMA ----------
   opts: { prog(p), stat(txt) } — tanpa modal (UI pembungkusnya yang
   menampilkan modal) supaya bisa dipanggil otomatis saat ekspor. */
async function analyzeSpeakers(opts = {}) {
  const S = state.spk;
  if (!state.file || !state.duration) throw new Error('Impor video dulu');
  if (state.isAudio) throw new Error('Zoom pembicara hanya untuk video');
  if (S.scanning) return;
  const stat = opts.stat || (() => { });
  const prog = opts.prog || (() => { });
  S.scanning = true; _spkAbort = false; S.prog = 0; S.ready = false;
  const dur = state.duration;
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto';
  v.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:2px;height:2px;opacity:0';
  v.src = state.file.virtual ? state.file.kurl : URL.createObjectURL(state.file);
  document.body.appendChild(v);
  const ownsUrl = !state.file.virtual;
  try {
    /* 3a. audio envelope — butuh decode audio selesai */
    stat('Membaca gelombang suara…');
    if (state.audioReady) { try { await state.audioReady; } catch (e) { } }
    const env = spkAudioEnvelope(SPK_STEP);
    prog(0.03);
    /* 3b. siapkan kanvas pindai (sisi panjang 384 px) */
    const aw = v.videoWidth || 16, ah = v.videoHeight || 9;
    let SW, SH;
    if (aw >= ah) { SW = 448; SH = Math.max(2, Math.round(448 * ah / aw / 2) * 2); }
    else { SH = 448; SW = Math.max(2, Math.round(448 * aw / ah / 2) * 2); }
    const c = document.createElement('canvas'); c.width = SW; c.height = SH;
    const g = c.getContext('2d', { willReadFrequently: true });
    await new Promise((res, rej) => {
      const ok = () => { clean(); res(); }, bad = () => { clean(); rej(new Error('meta video tidak termuat')); };
      const clean = () => { v.removeEventListener('loadedmetadata', ok); v.removeEventListener('error', bad); };
      v.addEventListener('loadedmetadata', ok); v.addEventListener('error', bad);
      setTimeout(() => { if (v.readyState >= 1) ok(); }, 5000);
    });
    /* 3c. model AI */
    await ensureSpeakerModel(stat);
    prog(0.06);
    /* 3d. PINDAI — seek tiap SPK_STEP: deteksi orang + gerakan pita kepala */
    const steps = Math.max(1, Math.floor(dur / SPK_STEP));
    const samples = [];                 /* [{t, boxes:[{x,y,w,h,m}]}] ternormalisasi */
    const halfM = [];                   /* cadangan mode-2-bagian [{l,r}] */
    let prevGray = null;
    const gray = new Float32Array(SW * SH);
    const t0 = performance.now();
    for (let k = 0; k < steps; k++) {
      if (_spkAbort || state.abort) break;
      const t = Math.min(k * SPK_STEP, Math.max(0, dur - 0.03));
      await seekTo(t, v);
      let got = true;
      try { g.drawImage(v, 0, 0, SW, SH); } catch (e) { got = false; }
      if (!got) { await sleep(0); continue; }
      const d = g.getImageData(0, 0, SW, SH).data;
      for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        gray[p] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      }
      /* gerakan 2 bagian (cadangan bila AI tidak menemukan orang) */
      const halfRect = (fx0, fx1) => {
        let s = 0, n = 0;
        if (prevGray) {
          const x0 = Math.floor(fx0 * SW), x1 = Math.ceil(fx1 * SW);
          const y0 = Math.floor(0.10 * SH), y1 = Math.ceil(0.72 * SH);
          for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 3) {
            const p2 = y * SW + x; s += Math.abs(gray[p2] - prevGray[p2]); n++;
          }
        }
        return n ? Math.min(0.35, s / n) : 0;
      };
      halfM.push({ l: halfRect(0.06, 0.48), r: halfRect(0.52, 0.94) });
      /* deteksi orang (AI) */
      let boxes = [];
      try {
        const out = await _spkDet(c.toDataURL('image/jpeg', 0.8), { threshold: 0.32 });
        for (const r of out || []) {
          if (r.label !== 'person') continue;
          const bb = r.box || {};
          const bw = (bb.xmax - bb.xmin) / SW, bh = (bb.ymax - bb.ymin) / SH;
          if (bw <= 0 || bh <= 0 || bw * bh < 0.03 || bh < 0.10) continue;
          boxes.push({ x: bb.xmin / SW, y: bb.ymin / SH, w: bw, h: bh, score: r.score || 0 });
        }
    /* kotak terlalu kecil/kurang manusiawi → gabungkan dgn kotak lain yang
       tumpang-tindih (kepala saja terdeteksi "person" = kotak kecil) */
    const merged = [];
    for (const b of boxes) {
      const hit = merged.find(m => spkIou(m, b) > 0.30 ||
        (b.x >= m.x - 0.05 && b.x + b.w <= m.x + m.w + 0.05 && b.y >= m.y - 0.05 && b.y + b.h <= m.y + m.h + 0.30));
      if (hit) {
        const x0 = Math.min(hit.x, b.x), y0 = Math.min(hit.y, b.y);
        const x1 = Math.max(hit.x + hit.w, b.x + b.w), y1 = Math.max(hit.y + hit.h, b.y + b.h);
        Object.assign(hit, { x: x0, y: y0, w: x1 - x0, h: y1 - y0, score: Math.max(hit.score, b.score) });
      } else merged.push({ ...b });
    }
    boxes = merged.slice(0, 6);
      } catch (e) { boxes = []; }
      /* gerakan pita kepala tiap kotak (vs bingkai sebelumnya) */
      for (const b of boxes) {
        let s = 0, n = 0;
        if (prevGray) {
          const x0 = Math.floor((b.x + b.w * 0.16) * SW), x1 = Math.ceil((b.x + b.w * 0.84) * SW);
          const y0 = Math.floor(b.y * SH), y1 = Math.ceil((b.y + b.h * 0.34) * SH);
          for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
            if (x < 0 || x >= SW || y < 0 || y >= SH) continue;
            const p2 = y * SW + x; s += Math.abs(gray[p2] - prevGray[p2]); n++;
          }
        }
        b.m = n ? Math.min(0.35, s / n) : 0;
      }
      samples.push({ t, boxes });
      prevGray = Float32Array.from(gray);
      prog(0.06 + 0.74 * (k + 1) / steps);
      if ((k & 3) === 0) stat(`Menganalisis ${fmtT(t)} / ${fmtT(dur)} · ${samples.length} sampel`);
      await sleep(0);
    }
    if (_spkAbort || state.abort) throw new Error('Dibatalkan');
    if (!samples.length) throw new Error('Tidak cukup sampel — video terlalu pendek');
    /* 3e. MODE CADANGAN 2 BAGIAN — bila AI jarang menemukan orang
       (kartun, rekaman layar, bingkai aneh), pakai kolom kiri/kanan */
    const detRate = samples.reduce((a, s) => a + Math.min(1, s.boxes.length), 0) / samples.length;
    if (detRate < 0.7) {
      const nS = samples.length;
      for (let k = 0; k < nS; k++) {
        const t = samples[k].t;
        samples[k].boxes = [
          { x: 0.06, y: 0.08, w: 0.42, h: 0.84, m: halfM[k] ? halfM[k].l : 0 },
          { x: 0.52, y: 0.08, w: 0.42, h: 0.84, m: halfM[k] ? halfM[k].r : 0 }
        ];
      }
    }
    /* 3f. KLASTERISASI jejak orang — TAHAN JEDA: kotak dicocokkan ke jejak
       yang terlihat sampai 3 langkah terakhir (deteksi AI kadang bolong),
       lalu jejak pecahan orang yang sama digabung (posisi rata-rata dekat) */
    const tracks = [];
    let nextId = 0;
    const liveL = [];                    /* [{id, box, lastK}] — TTL 3 langkah */
    const SPK_TTL = 3;
    for (let k = 0; k < samples.length; k++) {
      const smp = samples[k];
      const cands = [];
      smp.boxes.forEach((b, bi) => liveL.forEach((lv, li) => {
        const i = spkIou(b, lv.box); if (i > 0.15) cands.push({ bi, li, i });
      }));
      cands.sort((a, b) => b.i - a.i);
      const usedB = new Set(), usedL = new Set();
      for (const cd of cands) {
        if (usedB.has(cd.bi) || usedL.has(cd.li)) continue;
        usedB.add(cd.bi); usedL.add(cd.li);
        const b = smp.boxes[cd.bi], lv = liveL[cd.li];
        lv.box = { x: b.x, y: b.y, w: b.w, h: b.h }; lv.lastK = k;
        const tr = tracks.find(x => x.id === lv.id);
        tr.samples.push({ t: smp.t, x: b.x, y: b.y, w: b.w, h: b.h, m: b.m });
      }
      smp.boxes.forEach((b, bi) => {
        if (usedB.has(bi)) return;
        tracks.push({ id: nextId++, samples: [{ t: smp.t, x: b.x, y: b.y, w: b.w, h: b.h, m: b.m }] });
        liveL.push({ id: nextId - 1, box: { x: b.x, y: b.y, w: b.w, h: b.h }, lastK: k });
      });
      for (let li = liveL.length - 1; li >= 0; li--) if (k - liveL[li].lastK > SPK_TTL) liveL.splice(li, 1);
    }
    /* gabung jejak pecahan (orang yang sama) — rata-rata posisi dekat */
    const mergedTr = [];
    for (const tr of tracks) {
      const ax = tr.samples.reduce((a, s) => a + s.x + s.w / 2, 0) / tr.samples.length;
      const ay = tr.samples.reduce((a, s) => a + s.y + s.h / 2, 0) / tr.samples.length;
      const hit = mergedTr.find(m => Math.abs(ax - m.ax) < 0.09 && Math.abs(ay - m.ay) < 0.16);
      if (hit) { hit.samples.push(...tr.samples); hit.ax = (hit.ax + ax) / 2; hit.ay = (hit.ay + ay) / 2; }
      else mergedTr.push({ id: tr.id, samples: tr.samples.slice(), ax, ay });
    }
    mergedTr.forEach(tr => tr.samples.sort((a, b) => a.t - b.t));
    /* jejak terlalu pendek = bukan pembicara (penumpang / bayangan) */
    const minHits = Math.max(2, Math.round(samples.length * 0.12));
    let kept = mergedTr.filter(tr => tr.samples.length >= minHits);
    if (!kept.length) kept = mergedTr.slice(0, 1);
    /* normalisasi gerakan per jejak: m' = m / median-jejak */
    for (const tr of kept) {
      tr.med = spkMedian(tr.samples.map(s => s.m)) || 0.004;
      for (const s of tr.samples) s.mm = clamp(s.m / (tr.med + 0.0035), 0, 2.6);
    }
    /* 3g. SKOR & PEMBICARA AKTIF per langkah */
    let mxEnv = 0; for (let k = 0; k < env.length; k++) mxEnv = Math.max(mxEnv, env[k]);
    const esorted = Array.from(env).sort((a, b) => a - b);
    const p10 = esorted[Math.floor(esorted.length * 0.10)] || 0;
    const thr = clamp(Math.max(0.07, p10 * 1.8), 0.05, 0.5);
    const active = [];
    for (let k = 0; k < steps; k++) active.push((env[k] != null ? env[k] : 0) >= thr);
    /* skor per langkah (ewma per jejak, hanya saat terlihat) */
    const ew = kept.map(() => 0);
    const score = [];
    for (let k = 0; k < steps; k++) {
      const row = new Float32Array(kept.length);
      const t = k * SPK_STEP;
      if (active[k]) {
        const av = Math.sqrt(env[k] != null ? env[k] : 0);
        for (let i = 0; i < kept.length; i++) {
          const smp = kept[i].samples.find(s => Math.abs(s.t - t) < SPK_STEP * 0.6);
          if (!smp) continue;
          const mm = smp.mm > 1.25 ? smp.mm : smp.mm * 0.3;   /* lonjakan gerakan = bicara */
          /* v3.1: prioritas kotak besar — false-positive kecil (sudut, objek)
             kalah dari orang sungguhan walau noise geraknya kebetulan tinggi */
          const boost = 0.6 + 0.4 * clamp((smp.w * smp.h) / 0.10, 0, 1);
          row[i] = av * mm * boost;
        }
      }
      for (let i = 0; i < kept.length; i++) ew[i] = row[i] * 0.55 + ew[i] * 0.45;
      score.push(Float32Array.from(ew));
    }
    /* keputusan + histeresis (kecepatan pindah fokus)
       v3.1 FIX: keputusan menyimpan ID jejak (bukan indeks array) agar
       pemetaan urutan tampil (kiri→kanan) tidak pernah meleset */
    const switchN = { cepat: 1, normal: 2, lambat: 3 }[S.speed] || 2;
    const decide = new Int32Array(steps).fill(-1);
    let cur = -1, pend = -1, pendN = 0;
    for (let k = 0; k < steps; k++) {
      let L = -1, best = 0.02;
      for (let i = 0; i < kept.length; i++) if (score[k][i] > best) { best = score[k][i]; L = i; }
      const Lid = L >= 0 ? kept[L].id : -1;          /* → ID jejak */
      const curId = cur;                              /* cur juga ID */
      if (!active[k]) { decide[k] = curId; pend = -1; pendN = 0; continue; }
      if (curId === -1) { cur = Lid; decide[k] = cur; continue; }
      if (Lid === curId) { pend = -1; pendN = 0; decide[k] = curId; continue; }
      if (Lid === pend) {
        pendN++;
        if (pendN >= switchN) { cur = Lid; pend = -1; pendN = 0; }
      } else { pend = Lid; pendN = 1; }
      decide[k] = cur;
    }
    /* 3h. TIMELINE SEGMEN — kebijakan saat senyap */
    const segs = [];
    for (let k = 0; k < steps; k++) {
      const t0k = k * SPK_STEP, t1k = Math.min(dur, (k + 1) * SPK_STEP);
      let idx = decide[k];
      if (!active[k] && S.silence === 'wide' && kept.length > 1) idx = -1;
      const last = segs[segs.length - 1];
      if (last && last.idx === idx) last.t1 = t1k;
      else segs.push({ t0: t0k, t1: t1k, idx });
    }
    /* segmen terlalu pendek digabung ke tetangga (anti kedip) */
    const MINSEG = 1.4;
    for (let i = segs.length - 1; i >= 0; i--) {
      if (segs[i].t1 - segs[i].t0 < MINSEG) {
        const prev = segs[i - 1], next = segs[i + 1];
        if (prev) { prev.t1 = segs[i].t1; segs.splice(i, 1); }
        else if (next) { next.t0 = segs[i].t0; segs.splice(i, 1); }
      }
    }
    if (!segs.length) segs.push({ t0: 0, t1: dur, idx: -1 });
    segs[0].t0 = 0; segs[segs.length - 1].t1 = dur;
    /* nama urut posisi rata-rata (kiri → kanan) utk label UI */
    kept.forEach(tr => {
      tr.avgX = tr.samples.reduce((a, s) => a + s.x + s.w / 2, 0) / tr.samples.length;
    });
    kept.sort((a, b) => a.avgX - b.avgX);
    const idMap = new Map(kept.map((tr, i) => [tr.id, i]));
    segs.forEach(sg => { if (sg.idx >= 0) sg.idx = idMap.has(sg.idx) ? idMap.get(sg.idx) : -1; });
    kept.forEach((tr, i) => { tr.label = 'PEMBICARA ' + (i + 1); });
    /* pasang hasil */
    S.tracks = kept.map(tr => ({ id: tr.id, label: tr.label, avgX: tr.avgX, med: tr.med, samples: tr.samples }));
    S.timeline = segs;
    S.nSpeak = kept.length;
    S.epoch = state.mediaEpoch || 0;
    S.ready = true;
    prog(1);
    stat(`${kept.length} pembicara · ${segs.length} segmen kamera`);
    renderSpkList(); syncSpkUI();
  } finally {
    try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { }
    try { v.remove(); } catch (e) { }
    if (ownsUrl) try { URL.revokeObjectURL(v.src); } catch (e) { }
    S.scanning = false;
  }
}

/* ---------- 4. TARGET CROP (deterministik dari t) ----------
   Semua ukuran dalam piksel sumber; aspek terkunci rasio output. */
function spkChMax(vw, vh, aspect) { return Math.min(vh, vw / aspect); }
/* b = kotak TERNORMALISASI (0..1) → diubah ke piksel sumber dulu!
   (v3.1 FIX: dulu dihitung langsung sebagai piksel → crop 63×112 di pojok) */
function spkFitBox(bn, vw, vh, aspect) {
  const b = { x: bn.x * vw, y: bn.y * vh, w: bn.w * vw, h: bn.h * vh };
  let ch = b.h * SPK_PADH, cw = ch * aspect;
  if (cw < b.w * SPK_PADW) { cw = b.w * SPK_PADW; ch = cw / aspect; }
  const chMax = spkChMax(vw, vh, aspect);
  ch = clamp(ch, chMax / SPK_ZMAX, chMax);
  cw = ch * aspect;
  const cx = clamp(b.x + b.w / 2, cw / 2, vw - cw / 2);
  const cy = clamp(b.y + b.h * 0.42, ch / 2, vh - ch / 2);
  return { cx, cy, cw, ch };
}
function spkTarget(seg, t, vw, vh, aspect) {
  const S = state.spk;
  if (seg.idx < 0) {
    /* TAMPILKAN SEMUA — gabungan kotak semua pembicara */
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0, n = 0;
    for (const tr of S.tracks) {
      const b = spkBoxAt(tr, t);
      if (b) { n++; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
    }
    if (!n) return { cx: vw / 2, cy: vh / 2, cw: vw, ch: spkChMax(vw, vh, aspect) };
    const pad = 0.05;
    return spkFitBox({ x: Math.max(0, x0 - pad), y: Math.max(0, y0 - pad), w: Math.min(1, x1 - x0 + pad * 2), h: Math.min(1, y1 - y0 + pad * 2) }, vw, vh, aspect);
  }
  const tr = S.tracks[seg.idx];
  const b = (tr && spkBoxAt(tr, t)) || null;
  if (!b) {
    /* jejak hilang → gabungan semua kotak (fallback aman) */
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0, n = 0;
    for (const t2 of S.tracks) {
      const bb = spkBoxAt(t2, t);
      if (bb) { n++; x0 = Math.min(x0, bb.x); y0 = Math.min(y0, bb.y); x1 = Math.max(x1, bb.x + bb.w); y1 = Math.max(y1, bb.y + bb.h); }
    }
    if (!n) return { cx: vw / 2, cy: vh / 2, cw: vw, ch: spkChMax(vw, vh, aspect) };
    return spkFitBox({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, vw, vh, aspect);
  }
  return spkFitBox(b, vw, vh, aspect);
}
/* apakah zoom pembicara aktif untuk kondisi saat ini */
function spkActive() {
  const S = state.spk;
  return !!(S && S.on && S.ready && !state.isAudio &&
    S.epoch === (state.mediaEpoch || 0) && S.timeline && S.timeline.length);
}
/* indeks pembicara aktif pada waktu t (utk UI & pengujian); -1 = semua */
function spkSpeakerAt(t) {
  if (!spkActive()) return -2;
  const tl = state.spk.timeline;
  for (const sg of tl) if (t >= sg.t0 && t < sg.t1) return sg.idx;
  return tl[tl.length - 1].idx;
}
/* finalisasi param crop → rect piksel (jaminan: dalam bingkai, aspek
   persis, zoom terkendali) — dipakai semua mode transisi v3.5 */
function spkFinishRect(p, vw, vh, aspect) {
  let cx = p.cx, cy = p.cy, cw = p.cw, ch = p.ch;
  const chMax = spkChMax(vw, vh, aspect);
  ch = clamp(ch, chMax / SPK_ZMAX, chMax);
  cw = ch * aspect;
  if (cw > vw) { cw = vw; ch = cw / aspect; }
  cx = clamp(cx, cw / 2, vw - cw / 2);
  cy = clamp(cy, ch / 2, vh - ch / 2);
  return {
    sx: Math.round(cx - cw / 2), sy: Math.round(cy - ch / 2),
    sw: Math.round(cw), sh: Math.round(ch)
  };
}
/* RECT CROP utk drawComposition — fungsi murni dari t (aman paralel)
   v3.5: CARA PERPINDAHAN FOKUS (state.spk.trans, setelan global):
   - 'geser'    (default) — kamera bergerak smoothstep SPK_EASE (lama)
   - 'langsung' — potong instan di batas segmen (tanpa gerakan kamera)
   - 'fade'     — crossfade dua bingkai statis SPK_FADE; hasil membawa
                  fadeFrom (rect lama) + fadeK 0..1 → compose.js meleburkan
   Semua tetap fungsi murni dari t → ekspor/split/batch deterministik. */
function spkCropAt(vw, vh, W, H, t) {
  if (!spkActive()) return null;
  if (!vw || !vh) return null;
  const S = state.spk, tl = S.timeline;
  let i = 0;
  while (i < tl.length - 1 && t >= tl[i + 1].t0) i++;
  const seg = tl[i];
  const aspect = W / H;
  const tgt = spkTarget(seg, t, vw, vh, aspect);
  const trans = S.trans || 'geser';
  if (i > 0 && trans === 'fade') {
    const e = clamp((t - seg.t0) / SPK_FADE, 0, 1);
    if (e < 1) {
      const pv = spkTarget(tl[i - 1], seg.t0, vw, vh, aspect);
      const k = e * e * (3 - 2 * e);
      return Object.assign(spkFinishRect(tgt, vw, vh, aspect), {
        fadeFrom: spkFinishRect(pv, vw, vh, aspect), fadeK: k
      });
    }
    return spkFinishRect(tgt, vw, vh, aspect);
  }
  let cx = tgt.cx, cy = tgt.cy, cw = tgt.cw, ch = tgt.ch;
  if (i > 0 && trans !== 'langsung') {
    /* transisi halus dari segmen sebelumnya (smoothstep) — mode GESER */
    const e = clamp((t - seg.t0) / SPK_EASE, 0, 1);
    if (e < 1) {
      const pv = spkTarget(tl[i - 1], seg.t0, vw, vh, aspect);
      const k = e * e * (3 - 2 * e);
      cx = pv.cx + (cx - pv.cx) * k; cy = pv.cy + (cy - pv.cy) * k;
      cw = pv.cw + (cw - pv.cw) * k; ch = pv.ch + (ch - pv.ch) * k;
    }
  }
  return spkFinishRect({ cx, cy, cw, ch }, vw, vh, aspect);
}

/* ---------- 5. UI MODUL 02C ---------- */
const SPK_COLORS = ['#F7A600', '#3EE6C1', '#FF4FA3', '#9BE15D', '#6EA8FF', '#C792EA'];
function renderSpkList() {
  const el = $('#spkList');
  if (!el) return;
  const S = state.spk;
  if (!S.ready || !(S.timeline || []).length) {
    el.innerHTML = '<div class="empty">BELUM DIANALISIS — JALANKAN ANALISIS PEMBICARA</div>';
  } else {
    el.innerHTML = '';
    S.timeline.forEach((sg, i) => {
      const r = document.createElement('div'); r.className = 'cutrow';
      const col = sg.idx < 0 ? '#8b93a3' : SPK_COLORS[sg.idx % SPK_COLORS.length];
      const nm = sg.idx < 0 ? 'TAMPIL SEMUA' : (S.tracks[sg.idx] ? S.tracks[sg.idx].label : 'PEMBICARA');
      r.innerHTML = `<span class="cutno mono" style="color:${col}">●</span>
        <span class="cuttime mono">${nm}</span>
        <span class="cutlen mono">${fmtT(sg.t0)} → ${fmtT(sg.t1)}</span>`;
      el.appendChild(r);
    });
  }
  const st = $('#spkStat');
  if (st) st.innerHTML = !S.on ? 'Fitur <b>MATI</b> — aktifkan ceklis di atas'
    : !S.ready ? (S.scanning ? 'Menganalisis…' : 'Belum dianalisis — jalankan ANALISIS PEMBICARA')
      : `<b>${S.nSpeak} pembicara</b> terdeteksi · ${S.timeline.length} segmen kamera · zoom ${S.on ? '<b style="color:var(--acc)">AKTIF</b>' : 'MATI'}${S.epoch === (state.mediaEpoch || 0) ? '' : ' · video baru: analisis ulang'}`;
}
function syncSpkUI() {
  const on = $('#spkOn');
  if (on && on.checked !== !!state.spk.on) on.checked = !!state.spk.on;
  const au = $('#spkAuto');
  if (au && au.checked !== !!state.spk.auto) au.checked = !!state.spk.auto;
  const bb = $('#btnSpkAnalyze');
  if (bb) bb.disabled = !!state.spk.scanning;
  renderSpkList();
}
/* tombol ANALISIS PEMBICARA (modal + progres) */
async function spkAnalyzeUI() {
  if (!state.file || state.isAudio) { toast('Impor video dulu — zoom pembicara hanya untuk video', 'warn'); return; }
  if (state.busy) { toast('Tunggu proses lain selesai', 'warn'); return; }
  state.busy = true; _spkAbort = false;
  showModal({ title: 'ANALISIS PEMBICARA (AI OFFLINE)', sub: 'Menyiapkan model…', cancel: true, onCancel() { _spkAbort = true; } });
  const t0 = performance.now();
  try {
    await analyzeSpeakers({ prog: p => setProg(p), stat: s => setSub(s) });
    if (_spkAbort || state.abort) { toast('Analisis pembicara dibatalkan', 'warn'); }
    else {
      const el = ((performance.now() - t0) / 1000).toFixed(1);
      toast(`${state.spk.nSpeak} pembicara terdeteksi dalam ${el} dtk — zoom otomatis siap (aktifkan rasio 9:16 untuk hasil vertikal)`, 'ok');
    }
  } catch (e) {
    if (!/Dibatalkan/.test(String(e.message || e))) toast('Analisis gagal: ' + (e.message || e), 'err');
    else toast('Analisis dibatalkan', 'warn');
  }
  hideModal(); syncSpkUI(); updateAll();
  state.busy = false;
}
