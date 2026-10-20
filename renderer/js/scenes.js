/* ================================================================
   KINOSTRA DESKTOP — scenes.js (v3.0 · SPLIT ADEGAN)
   ================================================================
   Deteksi pergantian adegan 100% offline (tanpa internet, tanpa AI):
   - video disembunyikan lalu di-seek setiap langkah (±320 sampel)
   - tiap sampel dikecilkan ke 64×36 piksel lalu dibandingkan dengan
     sampel sebelumnya: selisih piksel (MAE) + selisih histogram luma
   - ambang ADAPTIF (rata-rata + 2.4× simpangan baku) → hanya perubahan
     BESAR yang dianggap adegan baru; gerakan kamera ringan tidak
     salah diambil sebagai "adegan"
   - titik yang terlalu rapat (< 2 detik) digabung
   Hasil: state.sceneCuts → mode split PER ADEGAN (modul 02).
   ================================================================ */
'use strict';

let _sceneAbort = false;

/* daftar titik adegan di panel modul 02 */
function renderSceneList() {
  const el = $('#sceneList');
  if (!el) return;
  const sc = state.sceneCuts || [];
  if (!sc.length) {
    el.innerHTML = '<div class="empty">BELUM ADA TITIK ADEGAN — JALANKAN DETEKSI</div>';
  } else {
    el.innerHTML = '';
    sc.forEach((p, i) => {
      const r = document.createElement('div'); r.className = 'cutrow';
      r.innerHTML = `<span class="cutno mono">${String(i + 1).padStart(2, '0')}</span>
        <span class="cuttime mono">ADEGAN ${i + 1} MULAI</span>
        <span class="cutlen mono">${fmtT(p)}</span>`;
      const del = document.createElement('button'); del.className = 'sdel'; del.textContent = '×';
      del.title = 'Hapus titik adegan ini';
      del.onclick = () => { state.sceneCuts.splice(i, 1); renderSceneList(); updateAll(); };
      r.appendChild(del); el.appendChild(r);
    });
  }
  const st = $('#sceneStat');
  if (st) st.textContent = `${sc.length} adegan terdeteksi · mode: ${state.splitMode === 'scene' && sc.length ? 'PER ADEGAN' : 'PER DURASI'}`;
}

/* deteksi utama — dipanggil tombol DETEKSI ADEGAN (modul 02) */
async function detectScenes() {
  if (!state.file || !state.duration) { toast('Impor media dulu', 'warn'); return; }
  if (state.isAudio) { toast('Deteksi adegan hanya untuk video', 'warn'); return; }
  if (state.busy) { toast('Tunggu proses lain selesai', 'warn'); return; }
  _sceneAbort = false;
  state.busy = true;
  const dur = state.duration;
  const STEP = clamp(dur / 320, 0.4, 1.6);   /* ±320 sampel maksimum */
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto';
  v.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:2px;height:2px;opacity:0';
  v.src = state.file.virtual ? state.file.kurl : URL.createObjectURL(state.file);
  document.body.appendChild(v);
  const ownsUrl = !state.file.virtual;
  try {
    await new Promise((res, rej) => {
      const ok = () => { clean(); res(); }, bad = () => { clean(); rej(new Error('meta video tidak termuat')); };
      const clean = () => { v.removeEventListener('loadedmetadata', ok); v.removeEventListener('error', bad); };
      v.addEventListener('loadedmetadata', ok); v.addEventListener('error', bad);
      setTimeout(() => { if (v.readyState >= 1) ok(); }, 5000);
    });
    const SW = 64, SH = 36;
    const c = document.createElement('canvas'); c.width = SW; c.height = SH;
    const g = c.getContext('2d', { willReadFrequently: true });
    showModal({ title: 'DETEKSI ADEGAN', sub: 'Menganalisis video…', cancel: true, onCancel() { _sceneAbort = true; } });
    setProg(0);
    const scores = [];
    let prevPix = null, prevLuma = null;
    const t0 = performance.now();
    for (let t = 0.04; t < dur - 0.02; t += STEP) {
      if (_sceneAbort || state.abort) break;
      await seekTo(t, v);
      try { g.drawImage(v, 0, 0, SW, SH); } catch (e) { continue; }
      const d = g.getImageData(0, 0, SW, SH).data;
      const luma = new Float32Array(16);
      let tot = 0;
      for (let i = 0; i < d.length; i += 4) {
        const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        luma[Math.min(15, L >> 4)]++; tot++;
      }
      /* bingkai belum siap (hitam total / decode awal) → jangan dipakai */
      if (!tot) continue;
      for (let b = 0; b < 16; b++) luma[b] /= tot;
      if (prevPix) {
        let mae = 0;
        for (let i = 0; i < d.length; i += 4) {
          mae += Math.abs(d[i] - prevPix[i]) + Math.abs(d[i + 1] - prevPix[i + 1]) + Math.abs(d[i + 2] - prevPix[i + 2]);
        }
        mae /= (d.length / 4) * 3 * 255;
        let hd = 0;
        if (prevLuma) for (let b = 0; b < 16; b++) hd += Math.abs(luma[b] - prevLuma[b]);
        scores.push({ t, sc: mae * 0.62 + hd * 0.38 });
      }
      prevPix = d; prevLuma = luma;
      setProg(clamp(t / dur, 0, 1));
      setSub(`Memeriksa ${fmtT(t)} / ${fmtT(dur)} · ${scores.length} sampel`);
      await sleep(0);
    }
    hideModal();
    if (_sceneAbort || state.abort) { toast('Deteksi adegan dibatalkan', 'warn'); return; }
    /* ambang ADAPTIF ROBUST (v3.0): median + 4×MAD — tahan terhadap
       outlier (bingkai awal yang aneh) tanpa menutup adegan nyata.
       Bila sinyal sepi (MAD ≈ 0), pakai ambang minimum 0.055. */
    if (!scores.length) { toast('Tidak cukup sampel — video terlalu pendek', 'warn'); return; }
    const sorted = scores.map(s => s.sc).sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    const absd = sorted.map(v => Math.abs(v - med)).sort((a, b) => a - b);
    const mad = absd[absd.length >> 1];
    const thr = Math.max(0.055, med + Math.max(0.05, mad * 4));
    const raw = scores.filter(s => s.sc >= thr).map(s => s.t);
    /* gabung titik rapat < 2 detik (pertahankan yang paling awal) */
    const cuts = [];
    for (const p of raw) { if (!cuts.length || p - cuts[cuts.length - 1] >= 2.0) cuts.push(Math.round(p * 100) / 100); }
    state.sceneCuts = cuts.slice(0, 200);
    if (state.sceneCuts.length) {
      state.splitMode = 'scene';
      const el = $('#segSplitMode');
      if (el) el.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === 'scene'));
      toast(`${state.sceneCuts.length} adegan terdeteksi dalam ${((performance.now() - t0) / 1000).toFixed(1)} dtk — split otomatis PER ADEGAN`, 'ok');
    } else {
      toast('Tidak ada perubahan adegan besar — video dianggap satu adegan', 'warn');
    }
    renderSceneList(); updateAll();
  } catch (e) {
    hideModal();
    toast('Deteksi adegan gagal: ' + (e.message || e), 'err');
  } finally {
    try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { }
    try { v.remove(); } catch (e) { }
    if (ownsUrl) try { URL.revokeObjectURL(v.src); } catch (e) { }
    state.busy = false;
  }
}
