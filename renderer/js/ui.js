/* ================================================================
   KINOSTRA DESKTOP — ui.js
   Binding seluruh panel, timeline, transport, loop preview & init
   ================================================================ */
'use strict';

/* ---------- helper binding segmen ---------- */
function bindSeg(id, fn) {
  $$('#' + id + ' button').forEach(b => b.onclick = () => {
    $$('#' + id + ' button').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); fn(b.dataset.v);
  });
}
$$('.mod-h').forEach(h => h.onclick = () => h.parentElement.classList.toggle('open'));

/* ---------- 01 SUMBER & RASIO ---------- */
bindSeg('segRatio', v => { state.ratio = v; $('#hudRatio').textContent = v; $('#bgRow').style.display = v === '9:16' ? '' : 'none'; applyRatio(); });
bindSeg('segBg', v => { state.bgMode = v; });

/* ---------- v2.1: ZOOM FOKUS & GESER (MODE 9:16) ---------- */
function syncFrameLabels() {
  $('#zoomV').textContent = state.frame.zoom.toFixed(2) + '×';
  const px = state.frame.panX, py = state.frame.panY;
  $('#panXV').textContent = Math.abs(px) < 0.02 ? 'TENGAH' : (px < 0 ? `KIRI ${Math.round(-px * 100)}%` : `KANAN ${Math.round(px * 100)}%`);
  $('#panYV').textContent = Math.abs(py) < 0.02 ? 'TENGAH' : (py < 0 ? `ATAS ${Math.round(-py * 100)}%` : `BAWAH ${Math.round(py * 100)}%`);
  $('#inZoom').value = state.frame.zoom; $('#inPanX').value = state.frame.panX; $('#inPanY').value = state.frame.panY;
}
$('#inZoom').oninput = e => { state.frame.zoom = clamp(parseFloat(e.target.value), 1, 3); syncFrameLabels(); };
$('#inPanX').oninput = e => { state.frame.panX = clamp(parseFloat(e.target.value), -1, 1); syncFrameLabels(); };
$('#inPanY').oninput = e => { state.frame.panY = clamp(parseFloat(e.target.value), -1, 1); syncFrameLabels(); };
$('#btnFrameReset').onclick = () => { state.frame = { zoom: 1, panX: 0, panY: 0 }; syncFrameLabels(); toast('Posisi fokus direset', 'ok'); };

/* drag langsung di preview: geser kiri/kanan/atas/bawah */
let _frameDrag = null, _frameDragMoved = false;
cv.addEventListener('pointerdown', e => {
  if (state.ratio !== '9:16' || state.trackMode || !state.file || state.isAudio) return;
  const r = cv.getBoundingClientRect();
  _frameDrag = { x: e.clientX, y: e.clientY, px: state.frame.panX, py: state.frame.panY, r };
  _frameDragMoved = false;
  try { cv.setPointerCapture(e.pointerId); } catch (err) { }
});
cv.addEventListener('pointermove', e => {
  if (!_frameDrag) return;
  const dx = (e.clientX - _frameDrag.x) / _frameDrag.r.width * 2;
  const dy = (e.clientY - _frameDrag.y) / _frameDrag.r.height * 2;
  if (Math.abs(e.clientX - _frameDrag.x) + Math.abs(e.clientY - _frameDrag.y) > 6) _frameDragMoved = true;
  if (!_frameDragMoved) return;
  /* geser gambar ke kiri → melihat bagian kanan video (rasa drag natural) */
  state.frame.panX = clamp(_frameDrag.px - dx, -1, 1);
  state.frame.panY = clamp(_frameDrag.py - dy, -1, 1);
  syncFrameLabels();
});
cv.addEventListener('pointerup', () => { setTimeout(() => { _frameDrag = null; }, 0); });
cv.addEventListener('pointerleave', () => { _frameDrag = null; });
syncFrameLabels();

/* ---------- 02 JUDUL & PART ---------- */
bindSeg('segSplit', v => {
  if (v === 'custom') { state.splitCustom = true; $('#splitCustom').style.display = '';
    state.splitSec = clamp(parseInt($('#inSplit').value) || 45, 3, 600); }
  else { state.splitCustom = false; $('#splitCustom').style.display = 'none'; state.splitSec = parseInt(v); }
  updateAll();
});
$('#inSplit').oninput = e => { state.splitSec = clamp(parseInt(e.target.value) || 3, 3, 600); updateAll(); };
$('#selPrefix').onchange = e => { state.partPrefix = e.target.value; updateAll(); };
bindSeg('segPartShow', v => { state.partShow = v; });
$('#titleOn').onchange = e => { state.titleOn = e.target.checked; };
$('#inTitle').oninput = e => { state.title = e.target.value; updateAll(); };

/* ---------- 03 DESKRIPSI ---------- */
$('#descOn').onchange = e => { state.descOn = e.target.checked; };
$('#inDesc').oninput = e => { state.desc = e.target.value; };
bindSeg('segDescPos', v => { state.descPos = v; });

/* ---------- 04 SUBTITEL AI ---------- */
bindSeg('segTarget', v => { state.subTarget = v; });
$('#asrLang').onchange = e => {
  /* v2.2: label bahasa ikut pilihan manual; AUTO = menunggu deteksi VOICEMATCH */
  $('#vmLang').textContent = e.target.value === 'auto' ? 'AUTO' : e.target.selectedOptions[0].text.split('·')[0].trim().toUpperCase();
};
$('#subsOn').onchange = e => { state.subsOn = e.target.checked; };
$('#subSize').oninput = e => { state.subScale = parseFloat(e.target.value); $('#subSizeV').textContent = state.subScale.toFixed(2) + '×'; };
$('#btnGen').onclick = generateSubs;
$('#btnSrt').onclick = async () => {
  if (!state.subs.length) { toast('Belum ada subtitel', 'err'); return; }
  const srt = state.subs.map((s, i) => `${i + 1}\n${srtTime(s.s)} --> ${srtTime(s.e)}\n${s.text}\n`).join('\n');
  const r = await saveTextFile(srt, (slug(state.title) || 'subtitle') + '.srt');
  if (r) toast('SRT tersimpan: ' + r.path, 'ok');
};
$('#btnSubClear').onclick = () => { state.subs = []; renderSubList(); $('#subStat').textContent = '0 baris'; toast('Subtitel dikosongkan'); };
$('#btnShiftB').onclick = () => shiftSubs(-0.5);
$('#btnShiftF').onclick = () => shiftSubs(0.5);
$('#modelLink').onclick = () => window.kinostra.openModelsFolder();

/* model status saat start */
(async () => {
  try {
    const st = await window.kinostra.modelStatus();
    if (st.models.length) {
      const names = st.models.map(m => `${m.id.split('/')[1]} (${m.sizeMB}MB)`).join(' · ');
      $('#modelNote').innerHTML = `Model AI tersimpan &amp; siap offline: <b>${names}</b> — <b id="modelLink" style="cursor:pointer;color:var(--acc)">buka folder model →</b>`;
      $('#modelLink').onclick = () => window.kinostra.openModelsFolder();
    }
  } catch (e) { }
})();

/* ---------- 05 TRACKING ---------- */
$('#trackMode').onchange = syncTrackUI;
$('#trackLabel').oninput = e => { state.track.label = e.target.value; };
$('#btnScan').onclick = scanTrack;
$('#btnTrackClear').onclick = () => {
  state.track = { active: false, points: [], tpl: null, tw: 26, th: 26, stats: null, label: state.track.label, color: state.track.color };
  $('#trackStat').textContent = '0 titik terlacak'; toast('Target dihapus');
};
function syncTrackUI() {
  state.trackMode = $('#trackMode').checked;
  stage.classList.toggle('hunting', state.trackMode);
}
TRACKCOLORS.forEach(c => {
  const b = document.createElement('button'); b.style.background = c;
  if (c === state.track.color) b.classList.add('on');
  b.onclick = () => { state.track.color = c; $$('#trackColors button').forEach(x => x.classList.remove('on')); b.classList.add('on'); };
  $('#trackColors').appendChild(b);
});

/* ---------- 06 MUSIK ---------- */
bindSeg('segMood', v => { state.music.mood = v; });
$('#inInt').oninput = e => { state.music.intensity = parseFloat(e.target.value); $('#intV').textContent = Math.round(state.music.intensity * 100) + '%'; };
$('#inMG').oninput = e => { state.music.gain = parseFloat(e.target.value); $('#mgV').textContent = Math.round(state.music.gain * 100) + '%';
  if (musGainNode) musGainNode.gain.value = state.music.gain; };
$('#inAG').oninput = e => { state.audioGain = parseFloat(e.target.value); $('#agV').textContent = Math.round(state.audioGain * 100) + '%'; };
$('#btnCompose').onclick = () => composeMusic(false);
$('#btnReroll').onclick = () => composeMusic(true);

/* ---------- 07 TIPOGRAFI ---------- */
function renderFontGrid() {
  const g = $('#fontGrid'); g.innerHTML = '';
  FONTS.forEach(f => {
    const b = document.createElement('button');
    b.className = 'fchip' + (f.n === state.font ? ' on' : '');
    b.style.fontFamily = `"${f.n}"`;
    b.innerHTML = `<span>${f.n}</span><em>${f.d}</em>`;
    b.onclick = () => { state.font = f.n; document.fonts.load(`700 48px "${f.n}"`); renderFontGrid();
      toast(`Font: ${f.n}`, 'ok'); };
    g.appendChild(b);
  });
}
renderFontGrid();
$('#inTS').oninput = e => { state.titleScale = parseFloat(e.target.value); $('#tsV').textContent = state.titleScale.toFixed(2) + '×'; };
$('#upperOn').onchange = e => { state.upper = e.target.checked; };

/* ---------- 08 EFEK VISUAL & WATERMARK (UPGRADE) ---------- */
$('#inVB').oninput = e => { state.vfx.bright = parseFloat(e.target.value); $('#vbV').textContent = Math.round(state.vfx.bright * 100) + '%'; };
$('#inVC').oninput = e => { state.vfx.contrast = parseFloat(e.target.value); $('#vcV').textContent = Math.round(state.vfx.contrast * 100) + '%'; };
$('#inVS').oninput = e => { state.vfx.saturate = parseFloat(e.target.value); $('#vsV').textContent = Math.round(state.vfx.saturate * 100) + '%'; };
$('#vignetteOn').onchange = e => { state.vfx.vignette = e.target.checked; };
$('#grainOn').onchange = e => { state.vfx.grain = e.target.checked; };
bindSeg('segWm', v => { state.wm.mode = v; });
bindSeg('segWmPos', v => { state.wm.pos = v; });
$('#wmText').oninput = e => { state.wm.text = e.target.value; };
$('#inWmO').oninput = e => { state.wm.opacity = parseFloat(e.target.value); $('#wmOv').textContent = Math.round(state.wm.opacity * 100) + '%'; };
$('#inWmS').oninput = e => { state.wm.scale = parseFloat(e.target.value); $('#wmSv').textContent = state.wm.scale.toFixed(2) + '×'; };
$('#btnWmLogo').onclick = async () => {
  const r = await window.kinostra.pickWatermark();
  if (!r) return;
  const img = new Image();
  img.onload = () => {
    state.wm.img = img; state.wm.imgName = r.name;
    $('#wmLogoName').textContent = r.name;
    if (state.wm.mode === 'off') { state.wm.mode = 'logo'; $$('#segWm button').forEach(x => x.classList.toggle('on', x.dataset.v === 'logo')); }
    toast('Logo watermark dimuat: ' + r.name, 'ok');
  };
  img.onerror = () => toast('Gambar tidak bisa dibaca', 'err');
  img.src = 'data:image/' + (r.name.toLowerCase().endsWith('svg') ? 'svg+xml' : 'png') + ';base64,' + r.data;
};

/* ---------- 09 EKSPOR ---------- */
bindSeg('segQual', v => { state.quality = v; updateAll(); });
bindSeg('segScale', v => { state.scale = v; updateAll(); });
bindSeg('segFps', v => { state.fps = parseInt(v); updateAll(); });
bindSeg('segParallel', v => { state.parallel = parseInt(v) || 0; updateAll(); }); /* v2.1 */
$('#btnExport').onclick = doExport;

/* ---------- 10 BATCH (v2.2: memakai KOTAK VIDEO terpadu) ---------- */
$('#btnBatchAdd').onclick = async () => {
  const paths = await window.kinostra.openMedia();
  if (paths && paths.length) { addBatchPaths(paths, 'batch'); toast(`${paths.length} video masuk Kotak Video`, 'ok'); }
};
$('#btnBatchClear').onclick = clearQueue;
$('#btnBatchRun').onclick = runBatch;

/* ---------- 00 KOTAK VIDEO (v2.2) ---------- */
$('#btnQAdd').onclick = async () => {
  const paths = await window.kinostra.openMedia();
  if (paths && paths.length) {
    addBatchPaths(paths, 'impor');
    toast(`${paths.length} video masuk Kotak Video`, 'ok');
    if (!state.file) loadFromPath(paths[0]);
  }
};
$('#btnQClear').onclick = clearQueue;

/* ---------- TIMELINE ---------- */
function renderTimeline() {
  const inn = $('#tlInner'); inn.innerHTML = '';
  if (!state.file) { $('#tlMeta').textContent = '—'; return; }
  segments().forEach(s => {
    const d = document.createElement('div'); d.className = 'tlseg'; d.dataset.i = s.i;
    d.style.flexGrow = (s.end - s.start).toFixed(2);
    d.innerHTML = `<span>PART ${String(s.i + 1).padStart(2, '0')}</span><em>${fmtT(s.start)}–${fmtT(s.end)}</em>`;
    inn.appendChild(d);
  });
  $('#tlMeta').textContent = `${segmentsCount()} PART · SPLIT ${state.splitSec} DTK · TOTAL ${fmtT(state.duration)}`;
}
let tlDrag = false;
function tlSeek(e) {
  const r = $('#timeline').getBoundingClientRect();
  videoEl.currentTime = clamp((e.clientX - r.left) / r.width, 0, 1) * (state.duration || 0);
}
$('#timeline').addEventListener('pointerdown', e => {
  if (!state.file) return; tlDrag = true;
  $('#timeline').setPointerCapture(e.pointerId); tlSeek(e);
});
$('#timeline').addEventListener('pointermove', e => { if (tlDrag) tlSeek(e); });
$('#timeline').addEventListener('pointerup', () => tlDrag = false);

/* ---------- TRANSPORT ---------- */
function setPlayIcon() {
  $('#btnPlay').innerHTML = `<i data-lucide="${videoEl.paused ? 'play' : 'pause'}"></i>`;
  if (window.lucide) lucide.createIcons();
}
function togglePlay() {
  if (!state.file) return;
  if (videoEl.paused) { getActx().resume(); videoEl.play(); } else videoEl.pause();
}
$('#btnPlay').onclick = togglePlay;
$('#btnPrev').onclick = () => { if (state.duration) { const c = Math.floor(videoEl.currentTime / state.splitSec);
  videoEl.currentTime = clamp(c - 1, 0, segmentsCount() - 1) * state.splitSec + 0.01; } };
$('#btnNext').onclick = () => { if (state.duration) { const c = Math.floor(videoEl.currentTime / state.splitSec);
  videoEl.currentTime = clamp(c + 1, 0, segmentsCount() - 1) * state.splitSec + 0.01; } };
videoEl.addEventListener('play', () => { getActx().resume(); startMusicSync(); setPlayIcon(); });
videoEl.addEventListener('pause', () => { stopMusicPreview(); setPlayIcon(); });
videoEl.addEventListener('seeked', () => { if (!videoEl.paused) startMusicSync(); });
window.addEventListener('keydown', e => {
  if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
    e.preventDefault(); togglePlay();
  }
  if (e.ctrlKey && e.code === 'KeyO') { e.preventDefault(); $('#btnImport').click(); }
});

/* klik pada preview: play/pause, atau tangkap target saat mode bidik */
stage.addEventListener('mousemove', e => {
  const r = stage.getBoundingClientRect();
  $('#crosshair').style.left = (e.clientX - r.left) + 'px';
  $('#crosshair').style.top = (e.clientY - r.top) + 'px';
});
cv.addEventListener('click', e => {
  if (_frameDragMoved) { _frameDragMoved = false; return; } /* v2.1: jangan play/pause setelah drag */
  if (!state.file) return;
  if (state.trackMode) {
    const r = cv.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    if (state.isAudio) { toast('Tracking hanya untuk video', 'err'); return; }
    const fit = containRect(videoEl.videoWidth, videoEl.videoHeight, cv.width, cv.height);
    const nx = (px * cv.width - fit.x) / fit.w, ny = (py * cv.height - fit.y) / fit.h;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) { toast('Klik di dalam area video', 'warn'); return; }
    captureTarget(nx, ny);
  } else togglePlay();
});

/* ---------- PREVIEW LOOP ---------- */
function applyRatio() { setPreviewSize(); fitStage(); }
function setPreviewSize() { const d = previewDims(); cv.width = d.W; cv.height = d.H; }
function fitStage() {
  const w = stageWrap.clientWidth - 36, h = stageWrap.clientHeight - 90;
  const ar = state.ratio === '16:9' ? 16 / 9 : 9 / 16;
  let sw = w, sh = w / ar; if (sh > h) { sh = h; sw = h * ar; }
  stage.style.width = Math.max(200, sw) + 'px'; stage.style.height = Math.max(112, sh) + 'px';
}
window.addEventListener('resize', fitStage);
setPreviewSize(); fitStage(); applyRatio();

let lastTrack = 0, lastHud = 0;
function loop() {
  requestAnimationFrame(loop);
  if (state.file) {
    const t = videoEl.currentTime || 0;
    // tracking realtime saat play
    if (!videoEl.paused && state.track.active && performance.now() - lastTrack > 70) {
      lastTrack = performance.now(); trackStep(t);
    }
    drawComposition(ctx, cv.width, cv.height, t);
    // HUD & playhead
    if (performance.now() - lastHud > 80) {
      lastHud = performance.now();
      $('#tTime').textContent = `${fmtT(t)} / ${fmtT(state.duration)}`;
      $('#hudState').textContent = state.busy ? 'WORKING' : (videoEl.paused ? 'PAUSED' : 'PLAYING');
      const seg = Math.min(segmentsCount() - 1, Math.floor(t / state.splitSec));
      $('#hudPart').textContent = `PART ${String(seg + 1).padStart(2, '0')}/${String(segmentsCount()).padStart(2, '0')}`;
      $('#tlPlay').style.left = (t / (state.duration || 1) * 100) + '%';
      [...$('#tlInner').children].forEach(c => c.classList.toggle('cur', +c.dataset.i === seg));
    }
  }
}
loop();

/* ---------- INIT ---------- */
$('#chipCodec').textContent = 'VideoEncoder' in window ? 'WEBCODECS AKTIF' : 'WEBCODECS TIDAK ADA';
$('#chipCodec').classList.add('VideoEncoder' in window ? 'ok' : 'bad');
if (window.lucide) lucide.createIcons();
