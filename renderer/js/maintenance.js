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
  /* v3.20: OPTIMASI/BERSIHKAN CACHE mematikan MODE PUTARAN HEMAT — pengguna
     mencoba kembali jalur native penuh (flag permanen v3.20 dihapus) */
  try {
    if (localStorage.getItem('kinostra.liteplay') === '1') {
      localStorage.removeItem('kinostra.liteplay'); window.__kinoLitePlay = false;
      acts.push('MODE PUTARAN HEMAT dimatikan — jalur native dipakai lagi');
    }
  } catch (e) { }
  /* v3.26: FLAG KANVAS DARURAT (v3.24) IKUT DILEPAS — mesin yang dulu terpaksa
     masuk jalur kanvas karena "penyajian mati" kini mencoba jalur native lagi;
     akar beku sudah dibedah tuntas di v3.25 (overlay statik), dan bila pun
     masih beku, pengawas pompa/piksel/layar + tangga penyembuhan tetap jaga. */
  try {
    if (localStorage.getItem('kinostra.canvasPlay') === '1') {
      localStorage.removeItem('kinostra.canvasPlay');
      window.__nativeTriedOnce = false;
      state._forceCanvasPlay = false;
      acts.push('JALUR KANVAS darurat dilepas — jalur native (perbaikan v3.25) dicoba lagi, pengawas tetap aktif');
    }
  } catch (e) { }
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
function fShield(s) {
  if (!s) return '';
  const parts = [];
  if (s.safeMode) parts.push('<b style="color:#f7a600">MODE AMAN</b> (komposit GPU dimatikan — render hardware tetap jalan)');
  else parts.push('aktif');
  const rec = (s.gpuCrashes || 0) + (s.renderCrashes || 0);
  if (rec > 0) parts.push(`<b>${rec} pemulihan otomatis</b> (GPU ${s.gpuCrashes || 0} · render ${s.renderCrashes || 0} · muat ulang ${s.reloads || 0}×)`);
  if (s.dirtyExit) parts.push('sesi sebelumnya mati tak wajar — cache grafis dibersihkan otomatis saat mulai');
  if (s.lastEvent) parts.push('kejadian terakhir: ' + String(s.lastEvent).replace(/</g, '&lt;'));
  return `<b>PELINDUNG LAYAR HITAM:</b> ${parts.join(' · ')}<br>`;
}
async function refreshMntInfo() {
  const box = $('#mntInfo');
  if (!box) return;
  try {
    const sys = await window.kinostra.sysInfo();
    const cl = await window.kinostra.cleanupCache({ dry: true });
    let sh = null;
    try { sh = await window.kinostra.shieldStatus(); } catch (e) { }
    let lg = null;
    try { lg = await window.kinostra.crashLog(); } catch (e) { }
    let gi = null;
    try { gi = await window.kinostra.gpuInfo(); } catch (e) { }
    /* v3.26: JALUR PUTAR (native/kanvas) + nama GPU — relevan sejak v3.25 */
    let jalur = 'NATIVE — video berdiri sendiri ala VidSplit · pengawas gambar & layar aktif';
    let jalurWarn = false;
    try {
      if (localStorage.getItem('kinostra.canvasPlay') === '1') { jalur = 'JALUR KANVAS (darurat tersimpan) — jalankan OPTIMASI PERFORMA untuk mencoba native lagi'; jalurWarn = true; }
    } catch (e) { }
    const ram = sys && sys.ramGB ? sys.ramGB : (sys && sys.totalMem ? (sys.totalMem / 1073741824).toFixed(1) : null);
    const cores = navigator.hardwareConcurrency || '?';
    const hm = heapMB();
    box.innerHTML =
      `<b>JALUR PUTAR:</b> ${jalurWarn ? `<b style="color:#FFB020">${jalur}</b>` : jalur}<br>` +
      `<b>GPU:</b> ${gi && gi.label ? String(gi.label).replace(/</g, '&lt;') : '—'}${gi && gi.hasEncHw ? ' · encoder hardware tersedia' : ''}<br>` +
      `<b>PELINDUNG LAYAR HITAM:</b> ${sh ? (sh.safeMode ? 'MODE AMAN aktif' : 'AKTIF') + ` · ${sh.upMin || 0} mnt nyala · memori JS ${fMB(hm)}` : 'memuat…'}<br>` +
      fShield(sh) +
      `<b>RAM TERPASANG:</b> ${ram ? ram + ' GB' : '—'} · <b>CPU:</b> ${cores} core<br>` +
      `<b>CACHE SEMENTARA TRANSKRIPSI:</b> ${cl.whisperTmp ? fMB(cl.whisperTmp / 1048576) : 'bersih'} (${cl.whisperTmpFiles || 0} file)<br>` +
      `<b>CACHE SHADER/KODE GPU:</b> ${(cl.gpuCache || 0) + (cl.codeCache || 0) > 0 ? fMB(((cl.gpuCache || 0) + (cl.codeCache || 0)) / 1048576) + ' — dihapus oleh BERSIHKAN CACHE' : 'bersih'}<br>` +
      `<b>MODEL AI LOKAL:</b> ${cl.modelsDir ? fMB(cl.modelsDir / 1048576) : '—'} (tidak dihapus — dipakai subtitel & suara)<br>` +
      `<span style="opacity:.7">Cache tampilan/HTTP: ${cl.cacheDir ? fMB(cl.cacheDir / 1048576) : '—'} · dipakai ulang otomatis saat dibutuhkan · cache grafis korup dibersihkan otomatis saat aplikasi dimulai</span><br>` +
      `<b>RIWAYAT KEJADIAN (tersimpan permanen):</b> ${lg && lg.text ? String(lg.text.trim().split('\n').pop()).replace(/</g, '&lt;') : 'belum ada — log kosong'}<br>` +
      `<span style="opacity:.7">Setiap pemulihan otomatis &amp; penyebabnya tercatat di berkas log (tombol SALIN LOG CRASH di atas) — kirimkan saat melapor agar penyebab pasti diketahui.</span>`;
  } catch (e) {
    box.textContent = 'Info sistem belum tersedia — ' + (e.message || e);
  }
}

/* ================================================================
   v3.17: PELINDUNG — bagian renderer
   1) WATCHDOG MEMORI: tiap 20 dtk cek heap JS. Bila melewati 2000 MB
      (video panjang + komposit lama), cache komposisi dibersihkan
      OTOMATIS (dibangun ulang di frame berikutnya) + pemberitahuan —
      dulu memori bisa membengkak sampai renderer kehabisan & mati
      (layar hitam) tanpa pemberitahuan apa pun.
   2) TOAST PEMULIHAN: setelah proses render/GPU mati & jendela
      dimuat ulang otomatis oleh main, pengguna diberi tahu jelas
      bahwa aplikasi sudah pulih & setelannya aman.
   ================================================================ */
let _wdCool = 0;
setInterval(() => {
  try {
    const h = heapMB();
    if (h != null && h > 2000 && !state.busy && Date.now() - _wdCool > 3 * 60 * 1000) {
      _wdCool = Date.now();
      if (typeof clearComposeCaches === 'function') clearComposeCaches();
      console.warn('SHIELD watchdog: heap ' + fMB(h) + ' — cache komposisi dibersihkan otomatis');
      toast('Memori tinggi (' + fMB(h) + ') — cache pratinjau dibersihkan otomatis agar aplikasi tetap lancar', 'warn');
    }
  } catch (e) { }
}, 20000);
try {
  if (window.kinostra.onShieldRecovered) window.kinostra.onShieldRecovered(info => {
    toast('Aplikasi dipulihkan otomatis setelah galat tampilan (' + (info && (info.gpu + info.render) || 0) + '×) — setelan, preset & pekerjaan di kotak tetap aman', 'ok');
  });
} catch (e) { }

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
      if ((cl.cleared || []).includes('http')) acts.push('cache tampilan/HTTP aplikasi dibersihkan');   /* v3.26: benahi — dulu mengecek teks yang tak pernah dikirim main */
      /* v3.26.1: cache shader/kode GPU DIJADWALKAN (dihapus saat dibuka
         ulang, sebelum proses GPU naik — aman; dulu v3.26.0 dihapus di
         tengah sesi dan berisiko membuat encoder GPU tersendat) */
      if (cl.gpuCacheCleared) acts.push(`cache shader GPU (${fMB(cl.gpuCache / 1048576)}) dijadwalkan dihapus saat aplikasi dibuka ulang — obat efek tampilan korup`);
      if (cl.codeCacheCleared) acts.push(`cache kode JS/GPU (${fMB(cl.codeCache / 1048576)}) ikut dijadwalkan`);
      if (cl.diskFreed > 0) acts.push(`<b>total disk dibebaskan ±${fMB(cl.diskFreed / 1048576)}</b> (cache shader terhapus penuh saat aplikasi dibuka ulang)`);
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
  /* v3.17.2: log crash permanen — salin ke clipboard utk dilaporkan,
     buka foldernya, dan tombol MODE AMAN manual (hentikan crash berulang
     tanpa menunggu 4 crash otomatis). */
  const bCopy = $('#btnCopyCrashLog');
  if (bCopy) bCopy.onclick = async () => {
    try {
      const lg = await window.kinostra.crashLog();
      const txt = (lg && lg.text) ? lg.text : '(log kosong — belum ada kejadian tercatat)';
      const full = 'LOG CRASH KINOSTRA — ' + ((lg && lg.path) || '') + '\n' + txt;
      try { await navigator.clipboard.writeText(full); }
      catch (_) {
        const ta = document.createElement('textarea');
        ta.value = full; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
      }
      toast('Log crash disalin — tempel (Ctrl+V) di pesan ke pengembang', 'ok');
    } catch (e) { toast('Gagal menyalin log: ' + (e.message || e), 'err'); }
  };
  const bOpen = $('#btnOpenCrashLog');
  if (bOpen) bOpen.onclick = async () => {
    try { await window.kinostra.openCrashLog(); } catch (e) { toast('Gagal membuka folder log', 'err'); }
  };
  const bSafe = $('#btnSafeModeNow');
  if (bSafe) bSafe.onclick = async () => {
    toast('Menyalakan ulang dalam MODE AMAN (komposit GPU dimatikan — tampilan jadi mode aman, render tetap cepat)…', 'info');
    setTimeout(async () => { try { await window.kinostra.safeModeNow(); } catch (_) { } }, 600);
  };
  if (bO || bC) refreshMntInfo();
})();
