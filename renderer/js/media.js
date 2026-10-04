/* ================================================================
   KINOSTRA DESKTOP — media.js
   Impor media (dialog / drag-drop), probe metadata, decode audio,
   dimensi output & segmen split, seek presisi
   ================================================================ */
'use strict';

/* ---------- IMPOR ---------- */
$('#btnImport').onclick = async () => {
  const paths = await window.kinostra.openMedia();
  if (!paths || !paths.length) return;
  if (paths.length === 1) {
    loadFromPath(paths[0]);
  } else {
    // beberapa file -> isi antrian batch + muat yang pertama
    addBatchPaths(paths);
    loadFromPath(paths[0]);
  }
};
$('#fileInput').onchange = e => { if (e.target.files[0]) loadFileBlob(e.target.files[0]); e.target.value = ''; };

['dragover', 'dragenter'].forEach(ev => window.addEventListener(ev, e => { e.preventDefault(); document.body.classList.add('dropping'); }));
['dragleave', 'drop'].forEach(ev => window.addEventListener(ev, e => { e.preventDefault(); if (ev === 'drop' || e.target === document.body) document.body.classList.remove('dropping'); }));
window.addEventListener('drop', e => {
  e.preventDefault(); document.body.classList.remove('dropping');
  const files = [...e.dataTransfer.files].filter(f => /video|audio/.test(f.type) || /\.(mp4|mkv|ts|webm|mp3|m4a|aac|wav|ogg|flac|mov)$/i.test(f.name));
  if (!files.length) return;
  if (files.length === 1) { loadFileBlob(files[0]); }
  else {
    files.forEach(f => { if (f.path) addBatchPath(f.path); });
    loadFileBlob(files[0]);
  }
});

/* ---------- MEMUAT DARI PATH (desktop dialog) ---------- */
async function loadFromPath(p) {
  try {
    const [item] = await window.kinostra.readMediaFiles([p]);
    if (!item || item.error) { toast('Gagal membaca file: ' + (item && item.error || p), 'err'); return; }
    const blob = new Blob([item.data]);
    blob.name = item.name;
    loadFileBlob(blob);
  } catch (e) {
    toast('Gagal membuka file: ' + e.message, 'err');
  }
}

/* ---------- MEMUAT FILE (Blob + nama) ---------- */
async function loadFileBlob(file, force = false) {
  if (state.busy && !force) { toast('Tunggu proses lain selesai', 'warn'); return; }
  file.name = file.name || 'media.mp4';
  stopMusicPreview();
  // reset
  Object.assign(state, { subs: [], peaks: null });
  state.track = { active: false, points: [], tpl: null, tw: 26, th: 26, stats: null, label: state.track.label, color: state.track.color };
  $('#trackStat').textContent = '0 titik terlacak';
  state.file = file;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  state.isAudio = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(ext);
  const url = URL.createObjectURL(file);
  videoEl.srcObject = null; videoEl.src = url;
  $('#emptyMsg').style.display = 'none';
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
  state.duration = state.isAudio ? (await new Promise(async res => {
    await decodeFileAudio(); res(state.audioBuffer ? state.audioBuffer.duration : videoEl.duration || 0);
  })) : (videoEl.duration || 0);
  if (!state.isAudio) await decodeFileAudio();
  if (state.audioBuffer && state.isAudio) buildPeaks();
  // judul otomatis dari nama file
  state.title = file.name.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\b\p{Ll}/gu, c => c.toUpperCase());
  $('#inTitle').value = state.title;
  $('#fName').textContent = file.name;
  $('#fDur').textContent = fmtT(state.duration);
  $('#fRes').textContent = state.isAudio ? 'AUDIO ONLY' : `${videoEl.videoWidth}×${videoEl.videoHeight}`;
  $('#fSize').textContent = fmtMB(file.size);
  $('#fFmt').textContent = ext.toUpperCase();
  $('#hudName').textContent = file.name.slice(0, 42).toUpperCase();
  $('#tInfo').textContent = `SPLIT ${state.splitSec} DTK/PART`;
  renderTimeline(); updateAll();
  toast(`Dimuat: ${file.name}`, 'ok');
}

async function decodeFileAudio() {
  if (!state.file) return;
  try {
    const ab = await state.file.arrayBuffer();
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

/* ---------- SEEK PRESISI ---------- */
function seekTo(t) {
  return new Promise(res => {
    const v = videoEl; t = clamp(t, 0, Math.max(0, state.duration - 0.02));
    if (Math.abs(v.currentTime - t) < 0.004 && !v.seeking) { res(); return; }
    let done = false;
    const fin = () => { if (done) return; done = true; v.removeEventListener('seeked', fin); clearTimeout(tm); res(); };
    const tm = setTimeout(fin, 1600);
    v.addEventListener('seeked', fin);
    v.currentTime = t;
  });
}
