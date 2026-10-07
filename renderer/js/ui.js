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
$('#inZoom').oninput = e => { state.frame.zoom = clamp(parseFloat(e.target.value), 1, 4); syncFrameLabels(); };
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
  /* v2.6: gambar mengikuti jari (direct manipulation) — berlaku baik saat
     memposisikan strip video (zoom 1×) maupun memilih area crop (zoom) */
  state.frame.panX = clamp(_frameDrag.px + dx, -1, 1);
  state.frame.panY = clamp(_frameDrag.py + dy, -1, 1);
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
/* v2.6: posisi PART (kiri/kanan & atas/bawah) + posisi JUDUL (atas/bawah) */
function syncTextPosLabels() {
  const pc = v => Math.round(Math.abs(v) * 100) + '%';
  $('#partXV').textContent = Math.abs(state.partPosX) < 0.03 ? 'TENGAH' : (state.partPosX < 0 ? `KIRI ${pc(state.partPosX)}` : `KANAN ${pc(state.partPosX)}`);
  $('#partYV').textContent = Math.abs(state.partPosY) < 0.03 ? 'TENGAH' : (state.partPosY < 0 ? `ATAS ${pc(state.partPosY)}` : `BAWAH ${pc(state.partPosY)}`);
  $('#titleYV').textContent = Math.abs(state.titlePosY) < 0.03 ? 'TENGAH · DEFAULT' : (state.titlePosY < 0 ? `KE ATAS ${pc(state.titlePosY)}` : `KE BAWAH ${pc(state.titlePosY)}`);
  $('#inPartX').value = state.partPosX; $('#inPartY').value = state.partPosY; $('#inTitleY').value = state.titlePosY;
}
$('#inPartX').oninput = e => { state.partPosX = clamp(parseFloat(e.target.value) || 0, -1, 1); syncTextPosLabels(); };
$('#inPartY').oninput = e => { state.partPosY = clamp(parseFloat(e.target.value) || 0, -1, 1); syncTextPosLabels(); };
$('#inTitleY').oninput = e => { state.titlePosY = clamp(parseFloat(e.target.value) || 0, -1, 1); syncTextPosLabels(); };
$('#btnTextPosReset').onclick = () => { state.partPosX = 0; state.partPosY = 0; state.titlePosY = 0; syncTextPosLabels(); toast('Posisi teks kembali ke default', 'ok'); };
syncTextPosLabels();
$('#inSplit').oninput = e => { state.splitSec = clamp(parseInt(e.target.value) || 3, 3, 600); updateAll(); };

/* ---------- 02b WAKTU MULAI & BERHENTI EKSPOR (v2.9) ----------
   Contoh: video 5 menit, mulai 2:00 berhenti 4:00 → hanya 2:00–4:00
   yang dipecah jadi part & diekspor. Sisanya hanya pratinjau. */
function fmtClock(t) {
  t = Math.max(0, Math.round(t || 0));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
           : `${m}:${String(s).padStart(2, '0')}`;
}
function syncRangeInputs() {
  const r = rangeInfo(), dur = state.duration || 0;
  const rs = $('#inRangeStart'), re = $('#inRangeEnd');
  if (!rs || !re) return;
  rs.value = fmtClock(r.start);
  re.value = (state.rangeEnd > 0 && r.end < dur - 0.01) ? fmtClock(r.end) : '';
  re.placeholder = 'SAMPAI HABIS';
  const st = $('#rangeStat');
  if (st) st.innerHTML = r.start > 0.01 || (state.rangeEnd > 0 && r.end < dur - 0.01)
    ? `EKSPOR <b>${fmtT(r.start)} → ${fmtT(r.end)}</b> · durasi <b>${fmtT(r.len)}</b> · <b>${segmentsCount()}</b> part`
    : `PENUH — 0:00 → ${fmtT(dur)} · <b>${segmentsCount()}</b> part`;
}
function setRangeStart(sec) {
  if (!state.file) { toast('Impor media dulu', 'warn'); return; }
  if (isNaN(sec)) { toast('Format waktu: detik (90) atau 1:30 / 1:02:03', 'warn'); return; }
  const dur = state.duration || 0;
  sec = clamp(sec, 0, Math.max(0, dur - 0.5));
  if (sec > rangeInfo().end - 0.5) { toast('Waktu mulai terlalu dekat/melebihi waktu berhenti', 'warn'); return; }
  state.rangeStart = sec; updateAll(); syncRangeInputs();
}
function setRangeEnd(sec) {
  if (!state.file) { toast('Impor media dulu', 'warn'); return; }
  if (isNaN(sec)) { toast('Kosongkan = sampai habis, atau isi 1:30 / 90', 'warn'); return; }
  const dur = state.duration || 0;
  sec = clamp(sec, 0, dur);
  if (sec <= state.rangeStart + 0.5) { toast('Waktu berhenti harus sesudah waktu mulai', 'warn'); return; }
  state.rangeEnd = (sec >= dur - 0.05) ? 0 : sec;   /* menempel akhir = sampai habis */
  updateAll(); syncRangeInputs();
}
$('#inRangeStart').onchange = e => setRangeStart(parseTimeArg(e.target.value));
$('#inRangeEnd').onchange = e => setRangeEnd(e.target.value.trim() === '' ? 0 : parseTimeArg(e.target.value));
$('#btnRangeStartHere').onclick = () => setRangeStart(videoEl.currentTime || 0);
$('#btnRangeEndHere').onclick = () => setRangeEnd(videoEl.currentTime || 0);
$('#btnRangeReset').onclick = () => {
  state.rangeStart = 0; state.rangeEnd = 0;
  updateAll(); syncRangeInputs(); toast('Rentang kembali penuh — 0:00 sampai habis', 'ok');
};
/* TERAPKAN KE SEMUA VIDEO DI KOTAK — menyimpan waktu mulai (video aktif)
   + durasi split per part (setelan di atas) sebagai preset massal. Semua
   video berikutnya (batch / batch ekspor) mulai dari waktu itu; berhenti
   tetap sampai masing-masing video habis. */
function syncRangeApplyUI() {
  const st = $('#rangeApplyStat'), on = state.applyAllStart != null;
  if (st) st.innerHTML = on
    ? `<b>AKTIF</b> · mulai <b>${fmtClock(state.applyAllStart)}</b> · split <b>${Math.round(state.splitSec)} dtk</b> — berlaku utk semua video di kotak`
    : 'MATI — setiap video diekspor penuh dari 0:00 sampai habis';
  const b = $('#btnRangeApplyAll');
  if (b) b.classList.toggle('on', on);
}
$('#btnRangeApplyAll').onclick = () => {
  if (!state.batch.length) { toast('Kotak masih kosong — impor video dulu (modul 00)', 'warn'); return; }
  state.applyAllStart = rangeInfo().start;
  syncRangeApplyUI(); renderQueue(); updateAll();
  toast(`Diterapkan ke ${state.batch.length} video di kotak: mulai ${fmtClock(state.applyAllStart)} · split ${Math.round(state.splitSec)} dtk`, 'ok');
};
$('#btnRangeApplyReset').onclick = () => {
  if (state.applyAllStart == null) { toast('Penerapan massal memang sedang mati'); return; }
  state.applyAllStart = null;
  applyRangePreset(); syncRangeApplyUI(); syncRangeInputs(); renderQueue(); updateAll();
  toast('Penerapan massal dimatikan — semua video diekspor penuh', 'ok');
};
syncRangeApplyUI();
$('#selPrefix').onchange = e => { state.partPrefix = e.target.value; updateAll(); };
bindSeg('segPartShow', v => { state.partShow = v; });
$('#titleOn').onchange = e => { state.titleOn = e.target.checked; };
/* v2.3: judul otomatis dari nama file + font Bebas Neue + ukuran default 40 */
$('#titleAuto').onchange = e => {
  state.autoTitle = e.target.checked;
  if (state.autoTitle && state.file) {
    /* terapkan langsung dari nama file yang sedang dimuat (v2.6: helper bersama) */
    state.title = fileBaseTitle(state.file.name);
    $('#inTitle').value = state.title; updateAll();
  }
  toast(state.autoTitle ? 'Judul otomatis dari nama file: AKTIF' : 'Judul manual: teks kamu dipertahankan', 'ok');
};
$('#inTitle').oninput = e => { state.title = e.target.value; updateAll(); };
function syncTitleFontUI() {
  const sel = $('#selTitleFont');
  if (sel && sel.value !== state.font) sel.value = state.font;
  $('#tszV').textContent = String(state.titleSize);
  const num = $('#inTitleSize'); if (num && +num.value !== state.titleSize) num.value = state.titleSize;
}
(function initTitleFont() {
  const sel = $('#selTitleFont');
  FONTS.forEach(f => {
    const o = document.createElement('option'); o.value = f.n; o.textContent = f.n;
    if (f.n === state.font) o.selected = true;
    sel.appendChild(o);
  });
  sel.onchange = e => {
    state.font = e.target.value;
    document.fonts.load(`700 48px "${state.font}"`);
    renderFontGrid();          /* sinkron dengan grid modul 07 */
    updateAll();
    toast(`Font judul: ${state.font}`, 'ok');
  };
  $('#inTitleSize').oninput = e => {
    state.titleSize = clamp(parseInt(e.target.value) || 40, 14, 160);
    $('#tszV').textContent = String(state.titleSize);
    updateAll();
  };
  syncTitleFontUI();
})();

/* ---------- 03 DESKRIPSI ---------- */
$('#descOn').onchange = e => { state.descOn = e.target.checked; };
$('#inDesc').oninput = e => { state.desc = e.target.value; };
bindSeg('segDescPos', v => { state.descPos = v; });

/* ---------- 04 SUBTITEL AI (VOCALIS v4 NATIVE) ---------- */
$('#asrLang').onchange = e => {
  /* label bahasa ikut pilihan manual; AUTO = menunggu deteksi VOCALIS */
  $('#vmLang').textContent = e.target.value === 'auto' ? 'AUTO'
    : (e.target.value === 'javanese' ? 'JAWA' : 'INDONESIA');
};
$('#subsOn').onchange = e => { state.subsOn = e.target.checked; };
/* v2.4: mesin default mengikuti RAM ASLI (bukan estimasi browser) —
   TURBO native butuh ±1.5-2 GB saat inferensi (jauh lebih ringan dari v3) */
(async function pickEngineByRAM() {
  try {
    const sel = $('#asrModel');
    if (!sel) return;
    const info = await window.kinostra.sysInfo();
    const mem = Math.round(info.ramGB || 0);
    if (sel.value === 'turbo' && mem < 8) {
      sel.value = 'small';
      if (mem < 4) sel.value = 'tiny';
      setTimeout(() => toast(`RAM ${mem} GB terdeteksi — mesin VOCALIS disesuaikan agar tetap mulus (bisa diubah manual)`, 'warn'), 1500);
    }
  } catch (e) { }
})();
$('#subSize').oninput = e => { state.subScale = parseFloat(e.target.value); $('#subSizeV').textContent = state.subScale.toFixed(2) + '×'; };
/* v2.5: geser posisi subtitel atas/bawah */
function syncSubPosY() {
  const p = Math.round(clamp(state.subPosY, 0.45, 0.97) * 100);
  const hint = p <= 62 ? 'TENGAH LAYAR' : p <= 80 ? 'AGAK BAWAH' : p <= 89 ? 'RENDAH' : 'BAWAH';
  $('#subPosYV').textContent = p + '% · ' + hint;
}
$('#subPosY').oninput = e => { state.subPosY = clamp(parseFloat(e.target.value) || 0.9, 0.45, 0.97); syncSubPosY(); };
syncSubPosY();
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

/* v2.4: status mesin subtitel native saat start */
(async () => {
  try {
    const st = await window.kinostra.whisperStatus();
    if (!st) return;
    const ready = Object.entries(st.models).filter(([k, m]) => m.ready)
      .map(([k, m]) => `${m.label} ${m.sizeOnDiskMB}MB`).join(' · ');
    const bin = st.binOk ? 'mesin native siap' : 'MESIN TIDAK DITEMUKAN';
    $('#modelNote').innerHTML = `VOCALIS v4 (whisper.cpp) — <b>${bin}</b>` +
      (ready ? ` · model tersimpan &amp; siap offline: <b>${ready}</b>` : ' · model akan diunduh sekali saat pertama dipakai') +
      ` — <b id="modelLink" style="cursor:pointer;color:var(--acc)">buka folder model →</b>`;
    $('#modelLink').onclick = () => window.kinostra.openPath(st.modelsDir);
  } catch (e) { }
})();

/* ---------- 05 TRACKING ---------- */
$('#trackMode').onchange = syncTrackUI;
$('#trackLabel').oninput = e => { state.track.label = e.target.value; };
$('#btnScan').onclick = scanTrack;
$('#btnTrackClear').onclick = () => {
  state.track = { active: false, points: [], tpl: null, tpl0: null, tw: 30, th: 30, stats: null, label: state.track.label, color: state.track.color, vx: 0, vy: 0, scale: 1, lost: 0 };
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
      if (typeof syncTitleFontUI === 'function') syncTitleFontUI();
      updateAll();
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

/* ---------- v2.8: FRAME NEON BERPUTAR (9:16 & 16:9) ---------- */
function syncNeonLabels() {
  $('#neonWV').textContent = String(state.neon.width);
  $('#neonSV').textContent = state.neon.speed.toFixed(1) + '×';
  $('#inNeonW').value = state.neon.width; $('#inNeonS').value = state.neon.speed;
  $('#neonOn').checked = !!state.neon.on; $('#neonDual').checked = !!state.neon.dual;
}
$('#neonOn').onchange = e => { state.neon.on = e.target.checked; toast(state.neon.on ? 'Frame neon berputar: AKTIF — ikut terbakar ke video saat ekspor' : 'Frame neon: MATI', 'ok'); };
$('#neonDual').onchange = e => { state.neon.dual = e.target.checked; };
$('#inNeonW').oninput = e => { state.neon.width = clamp(parseInt(e.target.value) || 7, 2, 16); syncNeonLabels(); };
$('#inNeonS').oninput = e => { state.neon.speed = clamp(parseFloat(e.target.value) || 1, 0.2, 3); syncNeonLabels(); };
NEONCOLORS.forEach(([name, val]) => {
  const b = document.createElement('button');
  if (val === 'rainbow') {
    b.style.background = 'linear-gradient(90deg,#ff4fa3,#f7a600,#9be15d,#2ee6ff,#4d7cff)';
    b.title = 'RAINBOW — warna pelangi ikut berputar';
  } else { b.style.background = val; b.title = name; }
  if (state.neon.color === val) b.classList.add('on');
  b.onclick = () => {
    state.neon.color = val;
    $$('#neonColors button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    if (!state.neon.on) { state.neon.on = true; syncNeonLabels(); }
    toast('Warna neon: ' + name, 'ok');
  };
  $('#neonColors').appendChild(b);
});
syncNeonLabels();

/* ---------- 09 EKSPOR ---------- */
bindSeg('segQual', v => { state.quality = v; updateAll(); });
bindSeg('segScale', v => { state.scale = v; updateAll(); });
bindSeg('segFps', v => { state.fps = parseInt(v); updateAll(); });
bindSeg('segParallel', v => { state.parallel = parseInt(v) || 0; updateAll(); }); /* v2.1 */
$('#btnExport').onclick = doExport;
/* v2.8: BATCH EKSPOR dari menu EKSPOR & KOMPRESI — semua video di kotak
   diekspor berurutan memakai setelan saat ini (paksa proses ulang yang
   berstatus selesai — nama tombol memang "SEMUA VIDEO DI KOTAK") */
$('#btnExportAll').onclick = () => runBatch(true);

/* ---------- 10 BATCH (v2.3: impor massal 100 + proses berurutan otomatis) ---------- */
$('#btnBatchAdd').onclick = async () => {
  const paths = await window.kinostra.openMedia();
  if (paths && paths.length) {
    const n = addBatchPaths(paths, 'batch');
    toast(`${n} video masuk Kotak Video`, 'ok');
    maybeAutoBatch(n);
  }
};
$('#btnBatchClear').onclick = clearQueue;
$('#btnBatchRun').onclick = runBatch;

/* ---------- 00 KOTAK VIDEO (v2.3) ---------- */
$('#btnQAdd').onclick = async () => {
  const paths = await window.kinostra.openMedia();
  if (paths && paths.length) {
    const n = addBatchPaths(paths, 'impor');
    toast(`${n} video masuk Kotak Video`, 'ok');
    if (!maybeAutoBatch(n) && !state.file) loadFromPath(paths[0]);
  }
};
$('#btnQClear').onclick = clearQueue;

/* ---------- TIMELINE ---------- */
function renderTimeline() {
  /* v2.8.1: ambil referensi playhead SEBELUM innerHTML='' — setelah terdetach,
     document.querySelector('#tlPlay') tidak bisa menemukannya lagi (null) */
  const inn = $('#tlInner'), ph = $('#tlPlay');
  inn.innerHTML = '';
  if (!state.file) { $('#tlMeta').textContent = '—'; inn.appendChild(ph); return; }
  const dur = state.duration || 0, r = rangeInfo();
  /* v2.9: zona TIDAK DIEKSPOR (sebelum mulai & sesudah berhenti) digambar
     redup bergaris — hanya bagian tengah yang dipecah jadi part */
  if (r.start > 0.01) {
    const d = document.createElement('div'); d.className = 'tlskip';
    d.style.flexGrow = r.start.toFixed(2);
    d.innerHTML = `<span>MULAI ${fmtT(r.start)}</span><em>TIDAK DIEKSPOR</em>`;
    inn.appendChild(d);
  }
  segments().forEach(s => {
    const d = document.createElement('div'); d.className = 'tlseg'; d.dataset.i = s.i;
    d.style.flexGrow = (s.end - s.start).toFixed(2);
    d.innerHTML = `<span>PART ${String(s.i + 1).padStart(2, '0')}</span><em>${fmtT(s.start)}–${fmtT(s.end)}</em>`;
    inn.appendChild(d);
  });
  if (dur - r.end > 0.01) {
    const d = document.createElement('div'); d.className = 'tlskip';
    d.style.flexGrow = (dur - r.end).toFixed(2);
    d.innerHTML = `<span>BERHENTI ${fmtT(r.end)}</span><em>TIDAK DIEKSPOR</em>`;
    inn.appendChild(d);
  }
  /* playhead ditempel lagi di akhir tlInner → posisi %-nya relatif ke lebar
     konten penuh, tetap akurat saat timeline panjang discrol ke samping */
  inn.appendChild(ph);
  const rangeTxt = (r.start > 0.01 || (state.rangeEnd > 0 && r.end < dur - 0.01))
    ? ` · RANGE ${fmtT(r.start)}–${fmtT(r.end)}` : '';
  $('#tlMeta').textContent = `${segmentsCount()} PART · SPLIT ${state.splitSec} DTK${rangeTxt} · TOTAL ${fmtT(dur)}`;
}
let tlDrag = false;
function tlSeek(e) {
  /* v2.8.1: ukur tlInner (bukan #timeline) → klik/drag tetap akurat saat
     timeline panjang sedang discrol ke samping */
  const r = $('#tlInner').getBoundingClientRect();
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
$('#btnPrev').onclick = () => { if (state.duration) { const r = rangeInfo();
  const c = Math.floor((videoEl.currentTime - r.start) / state.splitSec);
  videoEl.currentTime = r.start + clamp(c - 1, 0, segmentsCount() - 1) * state.splitSec + 0.01; } };
$('#btnNext').onclick = () => { if (state.duration) { const r = rangeInfo();
  const c = Math.floor((videoEl.currentTime - r.start) / state.splitSec);
  videoEl.currentTime = r.start + clamp(c + 1, 0, segmentsCount() - 1) * state.splitSec + 0.01; } };
videoEl.addEventListener('play', () => { getActx().resume(); startMusicSync(); setPlayIcon(); });
videoEl.addEventListener('pause', () => { stopMusicPreview(); setPlayIcon(); });
videoEl.addEventListener('seeked', () => { if (!videoEl.paused) startMusicSync(); });

/* v2.8.1: auto-scroll horizontal timeline mengikuti playhead (hanya saat play,
   hanya jika konten lebih lebar dari layar, dan hanya saat playhead keluar view) */
function tlFollow(t) {
  const tl = $('#timeline'), inn = $('#tlInner');
  if (inn.scrollWidth <= tl.clientWidth + 4) return;   /* muat di layar → tak perlu scroll */
  if (videoEl.paused || tlDrag) return;                 /* pause / sedang drag → jangan ganggu */
  const x = (t / (state.duration || 1)) * inn.scrollWidth;
  const L = tl.scrollLeft, R = L + tl.clientWidth;
  if (x < L + 24 || x > R - 24) {
    tl.scrollLeft = clamp(x - tl.clientWidth * 0.35, 0, inn.scrollWidth - tl.clientWidth);
  }
}
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

let lastTrack = 0, lastHud = 0, lastBusyDraw = 0;
function loop() {
  requestAnimationFrame(loop);
  if (state.file) {
    /* v2.3: saat proses berat (AI/batch), kurangi frekuensi gambar preview
       agar CPU penuh untuk inferensi AI — dari 60x/s menjadi ±2.5x/s */
    const now = performance.now();
    if (state.busy && now - lastBusyDraw < 400) return;
    if (state.busy) lastBusyDraw = now;
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
      const seg = currentSegIndex(t);
      $('#hudPart').textContent = `PART ${String(seg + 1).padStart(2, '0')}/${String(segmentsCount()).padStart(2, '0')}`;
      $('#tlPlay').style.left = (t / (state.duration || 1) * 100) + '%';
      [...$('#tlInner').children].forEach(c => { if (c.id !== 'tlPlay') c.classList.toggle('cur', +c.dataset.i === seg); });
      /* v2.8.1: timeline panjang yang sedang discrol — ikuti playhead otomatis
         saat video diputar, berhenti mengikuti saat pause (bebas menelusuri) */
      tlFollow(t);
    }
  }
}
loop();

/* ---------- INIT ---------- */
$('#chipCodec').textContent = 'VideoEncoder' in window ? 'WEBCODECS AKTIF' : 'WEBCODECS TIDAK ADA';
$('#chipCodec').classList.add('VideoEncoder' in window ? 'ok' : 'bad');
if (window.lucide) lucide.createIcons();
