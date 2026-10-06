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
  Object.assign(state, { subs: [], peaks: null });
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
  try {
    await new Promise((res, rej) => {
      const ok = () => { clean(); res(); }, bad = () => { clean(); rej(); };
      const clean = () => { videoEl.removeEventListener('loadedmetadata', ok); videoEl.removeEventListener('error', bad); };
      videoEl.addEventListener('loadedmetadata', ok); videoEl.addEventListener('error', bad);
      setTimeout(() => { if (videoEl.readyState >= 1) ok(); }, 4000);
    });
  } catch (e) {
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
  $('#tInfo').textContent = `SPLIT ${state.splitSec} DTK/PART`;
  renderTimeline(); updateAll();
  toast(`Dimuat: ${file.name}`, 'ok');
}

async function decodeFileAudio() {
  if (!state.file) return;
  try {
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
  let W, H; if (state.ratio === '16:9') { W = 1920; H = 1080; } else { W = 1080; H = 1920; }
  W = Math.round(W * sc / 2) * 2; H = Math.round(H * sc / 2) * 2; return { W, H };
}
function segmentsCount() { return state.duration ? Math.max(1, Math.ceil(state.duration / state.splitSec - 1e-6)) : 1; }
function segments() {
  const n = segmentsCount(), arr = [];
  for (let i = 0; i < n; i++) arr.push({ i, start: i * state.splitSec, end: Math.min(state.duration, (i + 1) * state.splitSec) });
  return arr;
}
function containRect(vw, vh, W, H) { const s = Math.min(W / vw, H / vh); const w = vw * s, h = vh * s; return { x: (W - w) / 2, y: (H - h) / 2, w, h }; }
function coverRect(vw, vh, W, H) { const s = Math.max(W / vw, H / vh); const w = vw * s, h = vh * s; return { x: (W - w) / 2, y: (H - h) / 2, w, h }; }

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
