/* ================================================================
   KINOSTRA DESKTOP v3.16 — maintenance.js
   PERAWATAN & PERFORMA (modul 16):
   - OPTIMASI PERFORMA (satu klik): bersihkan memori & cache mesin,
     uji ulang encoder GPU vs CPU, lanjutkan thumbnail, saran setelan.
   - BERSIHKAN CACHE: hapus sisa kegiatan sebelumnya — thumbnail kotak,
     cache lapisan pratinjau, file sementara transkripsi, cache
     tampilan aplikasi. Pekerjaan & setelan TIDAK hilang.
   ================================================================ */
'use strict';

/* ---------- pengukur memori JS (Chromium) ---------- */
function heapMB() {
  try { return performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null; } catch (e) { return null; }
}
const fMB = v => (v == null ? '—' : v.toFixed(1) + ' MB');

/* ---------- bersih-bersih sisi renderer ----------
   Kembalikan daftar aksi yang dilakukan (utk laporan). */
function kinoCleanRendererCaches() {
  const acts = [];
  try { if (typeof clearComposeCaches === 'function') { clearComposeCaches(); acts.push('cache lapisan pratinjau & neon (mesin compose)'); } } catch (e) { }
  try { if (typeof resetAccAdaptation === 'function') { resetAccAdaptation(); acts.push('adaptasi encoder GPU/CPU direset — akan diuji ulang'); } } catch (e) { }
  try {
    state._kilat = null; state.audioRms = 0;
    if (!state.busy) { state.audioReady = null; }
    acts.push('probe kilat & cache RMS dilepas');
  } catch (e) { }
  try {
    if (!state.busy && state.batch.length) {
      let n = 0;
      state.batch.forEach(b => { if (b.thumb || b._thumbErr) { b.thumb = null; b._thumbErr = false; n++; } });
      if (n) { acts.push(n + ' thumbnail kotak dibuang — dibuat ulang otomatis'); if (typeof queueBatchThumb === 'function') queueBatchThumb(); if (typeof renderQueue === 'function') renderQueue(); }
    }
  } catch (e) { }
  try { if (typeof renderTimeline === 'function' && state.file) { /* paksa gambar ulang pratinjau */ _lastDrawT = -1; } } catch (e) { }
  return acts;
}

/* ---------- info sistem utk kotak PERAWATAN ---------- */
async function refreshMntInfo() {
  const box = $('#mntInfo');
  if (!box) return;
  try {
    const sys = await window.kinostra.sysInfo();
    const cl = await window.kinostra.cleanupCache({ dry: true });
    const ram = sys && sys.ramGB ? sys.ramGB : (sys && sys.totalMem ? (sys.totalMem / 1073741824).toFixed(1) : null);
    const cores = navigator.hardwareConcurrency || '?';
    box.innerHTML =
      `<b>RAM TERPASANG:</b> ${ram ? ram + ' GB' : '—'} · <b>CPU:</b> ${cores} core<br>` +
      `<b>CACHE SEMENTARA TRANSKRIPSI:</b> ${cl.whisperTmp ? fMB(cl.whisperTmp / 1048576) : 'bersih'} (${cl.whisperTmpFiles || 0} file)<br>` +
      `<b>MODEL AI LOKAL:</b> ${cl.modelsDir ? fMB(cl.modelsDir / 1048576) : '—'} (tidak dihapus — dipakai subtitel & suara)<br>` +
      `<span style="opacity:.7">Cache tampilan/HTTP: ${cl.cacheDir ? fMB(cl.cacheDir / 1048576) : '—'} · dipakai ulang otomatis saat dibutuhkan</span>`;
  } catch (e) {
    box.textContent = 'Info sistem belum tersedia — ' + (e.message || e);
  }
}

/* ---------- OPTIMASI PERFORMA (satu klik) ---------- */
async function kinoOptimize() {
  if (state.busy) { toast('Tunggu proses lain selesai — optimasi aman dijalankan saat idle', 'warn'); return; }
  const h0 = heapMB();
  const acts = kinoCleanRendererCaches();
  /* uji ulang encoder GPU vs CPU secara segar */
  let probe = null;
  try { if (typeof quickAccProbe === 'function') probe = await quickAccProbe(); } catch (e) { }
  /* saran setelan aman berdasar kondisi mesin */
  const saran = [];
  try {
    const gi = await window.kinostra.gpuInfo();
    if (state.acc === 'cpu' && gi && gi.hasEncHw) saran.push({ t: 'Akselerasi OTOMATIS', d: 'Encoder GPU terdeteksi — mode CPU membuang kecepatan (GPU bisa 5-10× lebih cepat)', fn() { state.acc = 'auto'; if (typeof setSegOn === 'function') setSegOn('segAcc', 'auto'); if (typeof resetAccAdaptation === 'function') resetAccAdaptation(); } });
    if (state.kilat !== 'on') saran.push({ t: 'Aktifkan MODE KILAT', d: 'Potong langsung tanpa memutar video — ekspor jauh lebih cepat', fn() { state.kilat = 'on'; if (typeof setSegOn === 'function') setSegOn('segKilat', 'on'); } });
    if (state.parallel > 0) saran.push({ t: 'Render paralel OTOMATIS', d: 'Aplikasi memilih jumlah paralel terbaik untuk mesinmu', fn() { state.parallel = 0; if (typeof setSegOn === 'function') setSegOn('segParallel', '0'); } });
    if (state._igpu && state.parallel >= 5) saran.push({ t: 'Paralel maksimal 4×', d: 'GPU terintegrasi (iGPU) kewalahan bila terlalu banyak sesi encode', fn() { state.parallel = 4; if (typeof setSegOn === 'function') setSegOn('segParallel', '4'); } });
  } catch (e) { }
  const h1 = heapMB();
  const freed = (h0 != null && h1 != null) ? Math.max(0, h0 - h1) : null;
  const rows = acts.map(a => `<div class="rrow"><span class="rn">✅ ${a}</span></div>`).join('');
  const saranRows = saran.length
    ? `<div class="rrow" style="border-style:dashed"><span class="rn" style="color:var(--acc)"><b>${saran.length} SARAN PENINGKATAN KECEPATAN:</b></span></div>` +
      saran.map((s, i) => `<div class="rrow"><span class="rn"><b>${s.t}</b> — ${s.d}</span></div>`).join('') +
      `<button class="btn acc wide" id="btnApplySaran" style="margin-top:6px"><i data-lucide="check-check"></i> TERAPKAN SEMUA SARAN</button>`
    : `<div class="rrow" style="border-style:dashed"><span class="rn" style="color:var(--tx2)">Setelan kecepatanmu sudah optimal — tidak ada saran.</span></div>`;
  showModal({
    title: 'OPTIMASI PERFORMA SELESAI',
    sub: `Memori JS dibebaskan: ${freed != null ? fMB(freed) : '—'}${probe ? ` · uji encoder: GPU ${probe.hw || 0} fps vs CPU ${probe.sw || 0} fps` : ''}`,
    body: rows + saranRows,
    cancel: false
  });
  M.c.textContent = 'TUTUP'; M.c.style.display = ''; M.c.onclick = hideModal;
  if (window.lucide) lucide.createIcons();
  if (saran.length) {
    const b = M.b.querySelector('#btnApplySaran');
    if (b) b.onclick = () => { saran.forEach(s => { try { s.fn(); } catch (e) { } }); hideModal(); toast(`${saran.length} saran diterapkan — setelan ekspor kini optimal`, 'ok'); };
  }
  acts.push('uji ulang encoder GPU vs CPU');
  toast(`Optimasi selesai — ${acts.length} aksi${freed != null ? ' · ' + fMB(freed) + ' memori dibebaskan' : ''}`, 'ok');
  refreshMntInfo();
}

/* ---------- BERSIHKAN CACHE ---------- */
async function kinoClearCache() {
  if (state.busy) { toast('Tunggu proses lain selesai — pembersihan aman saat idle', 'warn'); return; }
  const b = $('#btnClearCache');
  if (b) b.disabled = true;
  try {
    const h0 = heapMB();
    const acts = kinoCleanRendererCaches();
    let cl = null;
    try { cl = await window.kinostra.cleanupCache({ dry: false }); } catch (e) { }
    if (cl) {
      if (cl.whisperTmpCleared) acts.push(`${cl.whisperTmpCleared} file sementara transkripsi dihapus (${fMB(cl.whisperTmp / 1048576)})`);
      if ((cl.cleared || []).includes('cache tampilan/HTTP')) acts.push('cache tampilan/HTTP aplikasi dibersihkan');
    }
    const h1 = heapMB();
    const freed = (h0 != null && h1 != null) ? Math.max(0, h0 - h1) : null;
    showModal({
      title: 'CACHE DIBERSIHKAN',
      sub: `Aplikasi kini fresh kembali${freed != null ? ' · memori JS dibebaskan ' + fMB(freed) : ''}`,
      body: acts.map(a => `<div class="rrow"><span class="rn">🗑️ ${a}</span></div>`).join('') +
        `<div class="rrow" style="border-style:dashed"><span class="rn" style="color:var(--tx2)">Model AI, setelan, preset &amp; pekerjaan TIDAK dihapus. Thumbnail dibuat ulang otomatis saat kotak dipakai.</span></div>`,
      cancel: false
    });
    M.c.textContent = 'TUTUP'; M.c.style.display = ''; M.c.onclick = hideModal;
    if (window.lucide) lucide.createIcons();
    toast(`Cache dibersihkan — ${acts.length} aksi`, 'ok');
    refreshMntInfo();
  } finally {
    if (b) b.disabled = false;
  }
}

/* ---------- wiring modul 16 ---------- */
(function initMaintenance() {
  const bO = $('#btnOptimize'), bC = $('#btnClearCache');
  if (bO) bO.onclick = kinoOptimize;
  if (bC) bC.onclick = kinoClearCache;
  if (bO || bC) refreshMntInfo();
})();
