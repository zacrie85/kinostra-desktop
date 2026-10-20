/* ================================================================
   KINOSTRA DESKTOP — media.js
   Impor media (dialog / drag-drop), probe metadata, decode audio,
   dimensi output & segmen split, seek presisi
   ================================================================ */
'use strict';

/* ---------- IMPOR (v2.3: massal sampai 100 video + proses berurutan otomatis) ---------- */
$('#btnImport').onclick = async () => {
  const paths = await window.kinostra.openMedia();
  if (!paths || !paths.length) return;
  const n = addBatchPaths(paths, 'impor');
  if (!maybeAutoBatch(n)) loadFromPath(paths[0]);
};
$('#fileInput').onchange = e => { if (e.target.files[0]) loadFileBlob(e.target.files[0]); e.target.value = ''; };

['dragover', 'dragenter'].forEach(ev => window.addEventListener(ev, e => { e.preventDefault(); document.body.classList.add('dropping'); }));
['dragleave', 'drop'].forEach(ev => window.addEventListener(ev, e => { e.preventDefault(); if (ev === 'drop' || e.target === document.body) document.body.classList.remove('dropping'); }));
window.addEventListener('drop', e => {
  e.preventDefault(); document.body.classList.remove('dropping');
  const files = [...e.dataTransfer.files].filter(f => /video|audio/.test(f.type) || /\.(mp4|mkv|ts|webm|mp3|m4a|aac|wav|ogg|flac|mov)$/i.test(f.name));
  if (!files.length) return;
  /* v2.2: semua file yang di-drop juga masuk KOTAK VIDEO */
  const ps = files.map(f => f.path).filter(Boolean);
  if (ps.length) {
    const n = addBatchPaths(ps, 'drop');
    if (!maybeAutoBatch(n)) loadFromPath(ps[0]);
  } else {
    loadFileBlob(files[0]);   /* file tanpa path (jarang di desktop) */
  }
});

/* ---------- MEMUAT DARI PATH (desktop dialog) ----------
   v2.6: STREAMING via protokol kfile:// (Range request) — file TIDAK
   dibaca utuh ke memori lagi. Video 2 GB pun tampil & berjudul
   hampir instan; dulu harus menunggu seluruh file disalin via IPC. */
async function loadFromPath(p, force = false) {
  try {
    const name = p.split(/[\\/]/).pop();
    let size = 0;
    try { const st = await window.kinostra.stat(p); if (st && st.ok) size = st.size; } catch (e) { }
    const vf = { name, path: p, size, virtual: true, kurl: kfileURL(p) };
    await loadFileBlob(vf, force);
  } catch (e) {
    toast('Gagal membuka file: ' + e.message, 'err');
  }
}

/* v2.6: judul bersih dari nama file (dipakai loadFileBlob & modul 02) */
function fileBaseTitle(name) {
  return (name || 'VIDEO').replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\b\p{Ll}/gu, c => c.toUpperCase());
}

/* ---------- MEMUAT FILE (Blob / deskriptor virtual + nama) ----------
   v2.6:
   - JUDUL dari nama file dipasang PALING AWAL (sebelum metadata &
     decode audio) → muncul instan, tidak menunggu decode lagi.
   - file virtual (kfile://) diputar streaming dari disk.
   - decode audio video TIDAK menahan loading (jalan di belakang). */
async function loadFileBlob(file, force = false) {
  if (state.busy && !force) { toast('Tunggu proses lain selesai', 'warn'); return; }
  file.name = file.name || 'media.mp4';
  const isVirtual = !!file.virtual;
  stopMusicPreview();
  state.mediaEpoch = (state.mediaEpoch || 0) + 1;   /* v2.2: invalidasi cache lapisan komposisi */
  // reset
  /* v2.12: potongan bersifat per-video — bersihkan saat ganti media */
  Object.assign(state, { subs: [], peaks: null, cuts: [], rangeStart: 0, rangeEnd: 0, sceneCuts: [] });
  /* v3.1: hasil analisis ZOOM PEMBICARA juga per-video — setelan global
     (on/speed/silence/auto) tetap terbawa ke video berikutnya */
  state.spk.ready = false; state.spk.scanning = false; state.spk.timeline = [];
  state.spk.tracks = []; state.spk.nSpeak = 0; state.spk.epoch = -1;
  state.track = { active: false, points: [], tpl: null, tpl0: null, tw: 30, th: 30, stats: null, label: state.track.label, color: state.track.color, vx: 0, vy: 0, scale: 1, lost: 0 };
  $('#trackStat').textContent = '0 titik terlacak';
  state.file = file;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  state.isAudio = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(ext);
  /* v2.6: JUDUL LANGSUNG — instan dari nama file */
  if (state.autoTitle) {
    state.title = fileBaseTitle(file.name);
    $('#inTitle').value = state.title;
    updateAll();
  }
  $('#fName').textContent = file.name;
  $('#fSize').textContent = file.size ? fmtMB(file.size) : '—';
  $('#fFmt').textContent = ext.toUpperCase();
  $('#hudName').textContent = file.name.slice(0, 42).toUpperCase();
  $('#emptyMsg').style.display = 'none';
  const url = isVirtual ? file.kurl : URL.createObjectURL(file);
  videoEl.srcObject = null; videoEl.src = url;
  /* v3.1: ANTIANTRIAN META — bila metadata terbaca tapi DURASI TIDAK MASUK
     AKAL (mis. 0.1 dtk utk file ratusan KB — balasan decoder/kfile kadang
     terpotong di headless/disk lambat), muat ULANG sekali. Dulu durasi
     sampah mengalir ke segments() → ekspor "berhasil" berisi 4 frame. */
  const awaitMeta = () => new Promise((res, rej) => {
    const ok = () => { clean(); res(); }, bad = () => { clean(); rej(); };
    const clean = () => { videoEl.removeEventListener('loadedmetadata', ok); videoEl.removeEventListener('error', bad); };
    videoEl.addEventListener('loadedmetadata', ok); videoEl.addEventListener('error', bad);
    setTimeout(() => { if (videoEl.readyState >= 1) ok(); }, 4000);
  });
  try {
    await awaitMeta();
    if (videoEl.duration > 0 && videoEl.duration < 0.5 && (file.size || 0) > 200 * 1024) {
      console.warn('metadata durasi tidak masuk akal (' + videoEl.duration + ' dtk) — muat ulang sekali');
      videoEl.src = url;
      await awaitMeta();
      /* media efektifnya berubah → invalidasi SEMUA cache lapisan/komposisi */
      state.mediaEpoch = (state.mediaEpoch || 0) + 1;
    }
  } catch (e) {
    /* v2.10: muat gagal → bersihkan state agar pemanggil (terutama BATCH)
       tahu video ini TIDAK termuat. Dulu file & durasi lama tetap terpasang,
       batch lalu "mengekspor" video rusak memakai durasi video sebelumnya. */
    state.file = null; state.duration = 0; state.audioBuffer = null;
    toast(`Format .${ext} tidak bisa diputar engine Chromium — coba konversi ke MP4/H.264`, 'err');
    $('#hudName').textContent = 'FORMAT TAK DIDUKUNG'; return;
  }
  if (state.isAudio) {
    state.duration = await new Promise(async res => {
      await decodeFileAudio(); res(state.audioBuffer ? state.audioBuffer.duration : videoEl.duration || 0);
    });
    if (state.audioBuffer) buildPeaks();
  } else {
    state.duration = videoEl.duration || 0;
    /* v2.6: decode audio asli jalan DI BELAKANG — loading tidak menunggu;
       ekspor otomatis menunggu lewat state.audioReady */
    state.audioReady = decodeFileAudio();
  }
  $('#fDur').textContent = fmtT(state.duration);
  $('#fRes').textContent = state.isAudio ? 'AUDIO ONLY' : `${videoEl.videoWidth}×${videoEl.videoHeight}`;
  /* v3.2: bila JUMLAH PART aktif → hitung ulang durasi per part utk video ini */
  applySplitParts();
  syncTInfoSplit();
  /* v2.9: terapkan preset TERAPKAN-KE-SEMUA (bila aktif) ke video yang baru dimuat,
     lalu segarkan input waktu mulai/berhenti di modul 02 */
  applyRangePreset(); syncRangeInputs();
  if (typeof renderCutList === 'function') renderCutList();   /* v2.12: kosongkan daftar potongan */
  renderTimeline(); updateAll();
  toast(`Dimuat: ${file.name}`, 'ok');
}

async function decodeFileAudio() {
  if (!state.file) return;
  try {
    /* v2.15: lepaskan buffer audio film LAMA lebih dulu — decode film 60 mnt
       butuh ArrayBuffer ±2 GB + hasil decode ±1.4 GB; bila buffer lama masih
       dipegang saat decode baru jalan, puncak RAM jadi dua kali lipat dan
       batch film ke-3 ke atas kehabisan memori fisik */
    state.audioBuffer = null; state.peaks = null;
    /* v2.6: file virtual dibaca lewat fetch kfile:// (streaming disk) */
    const ab = state.file.virtual ? await (await fetch(state.file.kurl)).arrayBuffer()
      : await state.file.arrayBuffer();
    state.audioBuffer = await getActx().decodeAudioData(ab);
    buildPeaks();
  } catch (e) { state.audioBuffer = null; toast('Track audio tidak terbaca — ekspor mungkin tanpa suara asli', 'warn'); }
}

function buildPeaks() {
  const b = state.audioBuffer; if (!b) { state.peaks = []; return; }
  const d = b.getChannelData(0), N = 1400, arr = new Float32Array(N), bs = Math.max(1, Math.floor(d.length / N));
  for (let i = 0; i < N; i++) { let m = 0; const o = i * bs; for (let j = 0; j < bs; j += 16) { const v = Math.abs(d[o + j] || 0); if (v > m) m = v; } arr[i] = m; }
  state.peaks = arr;
}

/* ---------- DIMENSI & SEGMENTASI ---------- */
function previewDims() { return state.ratio === '16:9' ? { W: 1600, H: 900 } : { W: 506, H: 900 }; }
function outDims(sc = 1) {
  /* v3.4: RESOLUSI TETAP — bila user memilih 720p/1080p/2K/4K di modul 09,
     hasil ekspor DIKUNCI ke ukuran itu (skala 100/75/50% diabaikan).
     Rasio 9:16 membalik W↔H: 4K vertikal = 2160×3840 (sisi pendek mengikuti
     angka pilihan — konvensi TikTok/Shorts). AUTO = perilaku lama. */
  const R = state.resOut && typeof RESOUTS !== 'undefined' ? RESOUTS[state.resOut] : null;
  if (R) return state.ratio === '16:9' ? { W: R.W, H: R.H } : { W: R.H, H: R.W };
  let W, H; if (state.ratio === '16:9') { W = 1920; H = 1080; } else { W = 1080; H = 1920; }
  W = Math.round(W * sc / 2) * 2; H = Math.round(H * sc / 2) * 2; return { W, H };
}
/* ---------- v2.9: WAKTU MULAI & BERHENTI EKSPOR ----------
   rangeInfo() = rentang efektif video aktif: {start, end, len}.
   Segmen, timeline, ringkasan & seluruh mesin ekspor memakai ini —
   part hanya dibuat DI DALAM rentang, sisanya tidak diekspor. */
function parseTimeArg(str) {
  /* terima "90", "90.5", "1:30", "1:02:03" → detik (NaN bila tidak valid) */
  const s = String(str == null ? '' : str).trim(); if (!s) return NaN;
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const p = s.split(':').map(x => parseFloat(x.trim()));
  if (!p.length || p.length > 3 || p.some(isNaN) || p.some(v => v < 0)) return NaN;
  return p.reverse().reduce((a, v, i) => a + v * Math.pow(60, i), 0);
}
function rangeInfo() {
  const dur = state.duration || 0;
  let s = clamp(state.rangeStart || 0, 0, Math.max(0, dur - 0.1));
  let e = state.rangeEnd > 0 ? Math.min(state.rangeEnd, dur) : dur;
  if (e - s < 0.1) { s = 0; e = dur; }   /* rentang tidak valid → penuh */
  return { start: s, end: e, len: Math.max(0.1, e - s) };
}

/* ---------- v2.12: HAPUS BAGIAN (POTONG) ----------
   state.cuts = daftar rentang yang DIBUANG dari hasil ekspor/split:
   [{s, e}, …]. Interval efektif = rentang ekspor DIKURANGI semua potongan.
   Part hanya dibuat di dalam interval efektif — penomoran part lanjut
   menyambung melewati tiap potongan. */
function effIntervals() {
  const r = rangeInfo();
  const cuts = (state.cuts || [])
    .map(c => ({ s: clamp(Math.min(c.s, c.e), r.start, r.end), e: clamp(Math.max(c.s, c.e), r.start, r.end) }))
    .filter(c => c.e - c.s > 0.08)
    .sort((a, b) => a.s - b.s);
  const out = []; let cur = r.start;
  for (const c of cuts) {
    if (c.s > cur + 0.05) out.push({ a: cur, b: Math.min(c.s, r.end) });
    cur = Math.max(cur, c.e);
  }
  if (cur < r.end - 0.05) out.push({ a: cur, b: r.end });
  return out.filter(iv => iv.b - iv.a >= 0.1);
}
/* total durasi yang dibuang (utk statistik & ringkasan) */
function cutsLen() {
  const r = rangeInfo();
  return (state.cuts || []).reduce((a, c) => a + Math.max(0, Math.min(c.e, r.end) - Math.max(c.s, r.start)), 0);
}
/* total durasi yang BENAR-BENAR diekspor (rentang − potongan) */
function expLen() { return Math.max(0.1, rangeInfo().len - cutsLen()); }

/* ---------- v3.2: JUMLAH PART OTOMATIS ----------
   Isi angka N (mis. 10) → durasi per part = durasi video / N (pembagian
   merata). Dihitung ulang otomatis setiap video dimuat, jadi setelan
   "10 part" tetap berlaku untuk video berikutnya tanpa dihitung manual.
   splitSec hasilnya boleh pecahan — mesin split (segBoundsList) memakai
   float langsung, jadi 10 part selalu eksak. */
function applySplitParts(fromInput) {
  const dur = state.duration || 0;
  let n = state.splitParts > 0 ? Math.round(state.splitParts) : 0;
  if (n > 0 && dur > 0) {
    if (n > dur) n = Math.max(1, Math.floor(dur));   /* jaga minimal ±1 dtk/part */
    state.splitSec = dur / n;
    const fx = +state.splitSec.toFixed(2);
    try {
      const inp = $('#inSplit'); if (inp) inp.value = fx;
      const st = $('#splitPartsStat');
      if (st) st.innerHTML = `<b>${n} PART</b> × ${fx} dtk/part — dihitung otomatis dari durasi ${fmtT(dur)}`;
    } catch (e) { }
    if (fromInput && typeof toast === 'function') toast(`Split otomatis: ${n} part × ${fx} dtk`, 'ok');
  }
  state.splitParts = n;
  return state.splitSec;
}
/* reset tampilan stat JUMLAH PART ke teks default */
function resetSplitPartsUI() {
  try { const st = $('#splitPartsStat'); if (st) st.textContent = 'Isi angka → durasi per part dihitung otomatis dari durasi video'; } catch (e) { }
}
/* teks HUD atas: tunjukkan mode jumlah part saat aktif */
function syncTInfoSplit() {
  try {
    $('#tInfo').textContent = state.splitParts > 0
      ? `SPLIT OTOMATIS ${state.splitParts} PART × ${+(state.splitSec.toFixed(2))} DTK`
      : `SPLIT ${state.splitSec} DTK/PART`;
  } catch (e) { }
}

/* ---------- v3.0: BATAS PART — MODE DURASI / MODE ADEGAN ----------
   Mode 'scene' memecah di titik pergantian adegan (state.sceneCuts, hasil
   DETEKSI ADEGAN). Mode 'dur' perilakunya 100% sama dengan dulu.
   Daftar batas di-cache (kunci = semua sumber perubahan) supaya pemanggilan
   per-frame (drawComposition/HUD) tetap murah. */
let _segKey = null, _segList = null;
function segBoundsList() {
  const sc = state.sceneCuts || [];
  let scSum = 0; for (let i = 0; i < sc.length; i++) scSum += sc[i];
  /* v3.1 FIX: DURASI MASUK KUNCI CACHE — dulu metadata yang tadinya salah
     (lalu diperbaiki muat-ulang) meninggalkan daftar part [0..0.1] yang
     ter-cache selamanya → ekspor "berhasil" berisi 4 frame */
  const key = `${state.mediaEpoch || 0}|${(state.duration || 0).toFixed(3)}|${state.splitMode}|${state.splitSec}|${rangeInfo().start.toFixed(3)}|${(state.rangeEnd || 0).toFixed(3)}|${(state.cuts || []).length}|${sc.length}|${scSum.toFixed(3)}`;
  if (_segKey === key && _segList) return _segList;
  const ivs = effIntervals(), out = [];
  if (state.splitMode === 'scene' && sc.length) {
    for (const iv of ivs) {
      const pts = [iv.a];
      sc.slice().sort((a, b) => a - b).forEach(p => { if (p > iv.a + 1.2 && p < iv.b - 1.2) pts.push(p); });
      pts.push(iv.b);
      for (let i = 0; i < pts.length - 1; i++) {
        const s = pts[i], e = pts[i + 1];
        if (e - s < 1.5 && out.length && out[out.length - 1].start >= iv.a) { out[out.length - 1].end = e; continue; }
        out.push({ i: 0, start: s, end: e });
      }
    }
  } else {
    for (const iv of ivs) {
      let t = iv.a;
      while (t < iv.b - 1e-6) { const end = Math.min(iv.b, t + state.splitSec); out.push({ i: 0, start: t, end }); t = end; }
    }
  }
  out.forEach((o, i) => { o.i = i; });
  if (!out.length) { const r = rangeInfo(); out.push({ i: 0, start: r.start, end: Math.max(r.end, r.start + 0.1) }); }
  _segKey = key; _segList = out;
  return out;
}

function segmentsCount() {
  if (!state.duration) return 1;
  return Math.max(1, segBoundsList().length);
}
function segments() {
  if (!state.duration) return [{ i: 0, start: 0, end: 0.1 }];
  return segBoundsList().map(o => ({ i: o.i, start: o.start, end: o.end }));
}
/* v2.12 → v3.0: batas part yang memuat waktu t (mendukung mode adegan) */
function currentSegBounds(t) {
  const list = segBoundsList();
  for (const b of list) if (t >= b.start - 1e-6 && t <= b.end + 1e-6) return b;
  return null;
}
/* indeks part saat ini (0-based) — sadar interval & potongan */
function currentSegIndex(t) {
  const b = currentSegBounds(t);
  return b ? b.i : 0;
}
/* v2.9: preset massal — dipanggil tiap video dimuat (impor, klik kotak, batch).
   Waktu mulai video = preset applyAllStart (dipotong bila melebihi durasi);
   berhenti selalu sampai video habis. Bila preset mati → penuh 0–akhir. */
function applyRangePreset() {
  const dur = state.duration || 0;
  state.rangeStart = (state.applyAllStart != null && dur > 0 && state.applyAllStart < dur)
    ? state.applyAllStart : 0;
  state.rangeEnd = 0;   /* 0 = sampai habis */
}
function containRect(vw, vh, W, H) { const s = Math.min(W / vw, H / vh); const w = vw * s, h = vh * s; return { x: (W - w) / 2, y: (H - h) / 2, w, h }; }
function coverRect(vw, vh, W, H) { const s = Math.max(W / vw, H / vh); const w = vw * s, h = vh * s; return { x: (W - w) / 2, y: (H - h) / 2, w, h }; }

/* ---------- v3.0: RMS AUDIO AKTIF (utk normalizer AUDIO SEHAT) ----------
   Diukur sekali per video (sampel tiap 24 data → cepat) lalu di-cache. */
function measureAudioRms() {
  const b = state.audioBuffer;
  if (!b) return 0;
  if (state.audioRms > 0 && state._rmsEpoch === (state.mediaEpoch || 0)) return state.audioRms;
  const d = b.getChannelData(0), d2 = b.numberOfChannels > 1 ? b.getChannelData(1) : null;
  let s = 0, n = 0;
  for (let i = 0; i < d.length; i += 24) { const v = d2 ? (d[i] + d2[i]) / 2 : d[i]; s += v * v; n++; }
  state.audioRms = Math.sqrt(s / Math.max(1, n));
  state._rmsEpoch = state.mediaEpoch || 0;
  return state.audioRms;
}

/* ---------- SEEK PRESISI (v2.1: mendukung elemen video worker paralel) ---------- */
function seekTo(t, el) {
  return new Promise(res => {
    const v = el || videoEl; t = clamp(t, 0, Math.max(0, (v.duration || state.duration) - 0.02));
    if (Math.abs(v.currentTime - t) < 0.004 && !v.seeking) { res(); return; }
    let done = false;
    const fin = () => { if (done) return; done = true; v.removeEventListener('seeked', fin); clearTimeout(tm); res(); };
    const tm = setTimeout(fin, 2500);
    v.addEventListener('seeked', fin);
    v.currentTime = t;
  });
}
