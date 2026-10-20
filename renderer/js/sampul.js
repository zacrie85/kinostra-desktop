/* ================================================================
   KINOSTRA DESKTOP — sampul.js (v3.0 · SAMPUL AUTO / THUMBNAIL)
   ================================================================
   Generator thumbnail 100% offline untuk upload YouTube/TikTok:
   - ambil frame terbaik dari video (posisi bebas / PAKAI PLAYHEAD)
   - papan judul bergaya: HOROR ALAMGAIB · ALAM GAIB · DANGDUT
     IDOLADESA · SINEMA · NEON · POLOS — serasi dengan frame v2.16/v3.0
   - filter warna ikut setelan modul 08 (FILTER WARNA)
   - judul besar otomatis pas-lebar + subjudul opsional
   - simpan PNG siap upload (1280×720 atau 720×1280 sesuai rasio)
   ================================================================ */
'use strict';

const SAMPUL_STYLES = [
  { k: 'horor', n: 'HOROR ALAMGAIB' },
  { k: 'gaib', n: 'ALAM GAIB' },
  { k: 'dangdut', n: 'DANGDUT IDOLADESA' },
  { k: 'sinema', n: 'SINEMA EMAS' },
  { k: 'neon', n: 'NEON GLOW' },
  { k: 'polos', n: 'POLOS MINIMALIS' }
];

/* gaya teks judul per pilihan */
function sampulTextStyle(k) {
  switch (k) {
    case 'horor': return { font: 'Cinzel', weight: 900, glow: 'rgba(225,45,66,.95)', fill: '#eae1cb', upper: true };
    case 'gaib': return { font: 'Cinzel', weight: 900, glow: 'rgba(70,235,140,.95)', fill: '#dbe9d3', upper: true };
    case 'dangdut': return { font: 'Anton', weight: 400, glow: 'rgba(58,6,14,.9)', fill: '#ffeaa6', upper: true };
    case 'sinema': return { font: 'Playfair Display', weight: 700, glow: 'rgba(232,182,76,.75)', fill: '#f6efe0', upper: true };
    case 'neon': return { font: 'Orbitron', weight: 700, glow: 'rgba(46,230,255,.95)', fill: '#eafcff', upper: true };
    default: return { font: 'Bebas Neue', weight: 400, glow: 'rgba(0,0,0,.9)', fill: '#ffffff', upper: true };
  }
}

function sampulDims() { return state.ratio === '9:16' ? { W: 720, H: 1280 } : { W: 1280, H: 720 }; }

/* gambar satu sampul penuh ke context x (W×H) pada waktu media t */
function drawSampul(x, W, H, t, style, titleTxt, subTxt) {
  const u = H / 1080;
  const vid = videoEl;
  x.save();
  x.fillStyle = '#050608'; x.fillRect(0, 0, W, H);
  if (vid.videoWidth) {
    const co = coverRect(vid.videoWidth, vid.videoHeight, W, H);
    /* filter warna ikut modul 08 */
    const CF = (typeof COLORFILTERS !== 'undefined' && COLORFILTERS.find(c => c.k === state.colorFilter)) || null;
    const V = state.vfx;
    const fl = [];
    if (V.bright !== 1) fl.push(`brightness(${V.bright})`);
    if (V.contrast !== 1) fl.push(`contrast(${V.contrast})`);
    if (V.saturate !== 1) fl.push(`saturate(${V.saturate})`);
    if (CF && CF.css) fl.push(CF.css);
    x.filter = fl.length ? fl.join(' ') : 'none';
    try { x.drawImage(vid, co.x, co.y, co.w, co.h); } catch (e) { }
    x.filter = 'none';
    if (CF && CF.tint) {
      x.globalCompositeOperation = CF.op || 'overlay';
      x.fillStyle = CF.tint; x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'source-over';
    }
  }
  /* gelapkan atas & bawah agar teks selalu terbaca */
  const gd = x.createLinearGradient(0, 0, 0, H);
  gd.addColorStop(0, 'rgba(0,0,0,.6)'); gd.addColorStop(0.34, 'rgba(0,0,0,0)');
  gd.addColorStop(0.6, 'rgba(0,0,0,0)'); gd.addColorStop(1, 'rgba(0,0,0,.72)');
  x.fillStyle = gd; x.fillRect(0, 0, W, H);
  /* papan judul tema (serasi dgn frame video) */
  if (style === 'horor') frHororPlate(x, W, u);
  else if (style === 'gaib') frGaibPlate(x, W, u);
  else if (style === 'dangdut') frDangdutPlate(x, W, u);
  /* judul besar otomatis pas-lebar (maks 2 baris) */
  const TS = sampulTextStyle(style);
  const txt = (TS.upper ? String(titleTxt || '').toUpperCase() : String(titleTxt || '')).trim();
  if (txt) {
    let fs = Math.round(120 * u);
    x.font = `${TS.weight} ${fs}px "${TS.font}"`;
    const maxW = W * 0.86;
    let lines = wrapLines(x, txt, maxW);
    while (lines.length > 2 && fs > 40 * u) {
      fs = Math.round(fs * 0.82);
      x.font = `${TS.weight} ${fs}px "${TS.font}"`;
      lines = wrapLines(x, txt, maxW);
    }
    lines = lines.slice(0, 2);
    const lh = fs * 1.14, y0 = H * (lines.length > 1 ? 0.72 : 0.76);
    x.textAlign = 'center'; x.lineJoin = 'round';
    x.shadowColor = TS.glow; x.shadowBlur = 26 * u;
    x.fillStyle = TS.fill;
    lines.forEach((ln, i) => {
      x.strokeStyle = 'rgba(0,0,0,.85)'; x.lineWidth = 10 * u;
      x.strokeText(ln, W / 2, y0 + i * lh);
      x.fillText(ln, W / 2, y0 + i * lh);
    });
    x.shadowBlur = 0;
  }
  /* subjudul opsional */
  const st = String(subTxt || '').trim();
  if (st) {
    const fs2 = Math.round(34 * u);
    x.font = `600 ${fs2}px "Chakra Petch"`;
    x.fillStyle = 'rgba(240,238,232,.94)';
    x.strokeStyle = 'rgba(0,0,0,.85)'; x.lineWidth = 7 * u; x.lineJoin = 'round';
    x.textAlign = 'center';
    x.strokeText(st, W / 2, H * 0.88);
    x.fillText(st, W / 2, H * 0.88);
  }
  /* tanda kecil KINOSTRA di pojok */
  x.font = `500 ${Math.round(17 * u)}px "JetBrains Mono"`;
  x.textAlign = 'right';
  x.fillStyle = 'rgba(240,238,232,.5)';
  x.fillText('KINOSTRA', W - 20 * u, 34 * u);
  x.restore();
}

let _sampulIv = null, _sampulT = 0, _sampulCounter = 0;

/* buka studio sampul (modal) */
function openSampul() {
  if (!state.file) { toast('Impor media dulu', 'warn'); return; }
  if (state.isAudio) { toast('Sampul hanya untuk video', 'warn'); return; }
  _sampulT = videoEl.currentTime || 0;
  const body = `
    <div class="sampulwrap">
      <canvas id="sampulCv" width="1280" height="720"></canvas>
      <div class="row" style="margin-top:8px;align-items:center">
        <button class="btn sm" id="btnSampulHere"><i data-lucide="crosshair"></i> PAKAI PLAYHEAD</button>
        <input type="range" id="inSampulT" min="0" max="${Math.max(0.1, state.duration).toFixed(2)}" step="0.05" value="${_sampulT.toFixed(2)}" style="flex:1">
        <span class="mono" id="sampulTV" style="font-size:11px">${fmtT(_sampulT)}</span>
      </div>
      <div class="lbl">GAYA SAMPUL</div>
      <div class="chips" id="sampulStyles"></div>
      <input class="in" id="inSampulTitle" placeholder="Judul besar (kosong = judul video)" maxlength="60">
      <input class="in" id="inSampulSub" placeholder="Subjudul opsional — mis. PART 1 · FULL MOVIE" maxlength="48">
      <div class="note">Hasil PNG ${state.ratio === '9:16' ? '720×1280' : '1280×720'} siap upload. Filter warna & efek modul 08 ikut terpasang. Tekan <b>SIMPAN PNG</b> — bisa simpan banyak sampul (nomor urut otomatis).</div>
    </div>`;
  showModal({ title: 'STUDIO SAMPUL — THUMBNAIL OTOMATIS', body, cancel: false });
  M.c.textContent = 'SIMPAN PNG';
  M.c.style.display = '';
  M.b.hidden = false;
  if (window.lucide) lucide.createIcons();
  const cvS = $('#sampulCv');
  const dims = sampulDims();
  cvS.width = dims.W; cvS.height = dims.H;
  cvS.style.width = '100%'; cvS.style.borderRadius = '10px'; cvS.style.background = '#000';
  let style = 'horor';
  const redraw = () => {
    drawSampul(cvS.getContext('2d'), cvS.width, cvS.height, _sampulT, style,
      $('#inSampulTitle').value || state.title, $('#inSampulSub').value);
  };
  /* chip gaya */
  const gch = $('#sampulStyles');
  SAMPUL_STYLES.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'fchip' + (i === 0 ? ' on' : '');
    b.innerHTML = `<span>${s.n}</span>`;
    b.onclick = () => { style = s.k; [...gch.children].forEach(c => c.classList.remove('on')); b.classList.add('on'); redraw(); };
    gch.appendChild(b);
  });
  $('#inSampulTitle').value = state.title || '';
  $('#inSampulTitle').oninput = redraw;
  $('#inSampulSub').oninput = redraw;
  $('#inSampulT').oninput = e => { _sampulT = parseFloat(e.target.value) || 0; $('#sampulTV').textContent = fmtT(_sampulT); redraw(); };
  $('#btnSampulHere').onclick = () => {
    _sampulT = videoEl.currentTime || 0;
    $('#inSampulT').value = _sampulT; $('#sampulTV').textContent = fmtT(_sampulT);
    redraw(); toast('Posisi sampul diambil dari playhead: ' + fmtT(_sampulT), 'ok');
  };
  redraw();
  clearInterval(_sampulIv);
  _sampulIv = setInterval(() => { if (M.el.classList.contains('hidden')) { clearInterval(_sampulIv); return; } redraw(); }, 400);
  /* tombol BATAL/TUTUP modal (M.x / ESC) menutup interval via guard di atas */
  M.onCancel = () => { clearInterval(_sampulIv); hideModal(); };
  /* tombol SIMPAN PNG (tombol cancel modal dipakai sebagai aksi utama) */
  M.c.onclick = async () => {
    try {
      M.c.disabled = true;
      const blob = await new Promise(res => cvS.toBlob(res, 'image/png'));
      if (!blob) throw new Error('canvas tidak bisa dikonversi PNG');
      _sampulCounter = ((_sampulCounter || 0) % 99) + 1;
      const nm = `${slug($('#inSampulTitle').value || state.title)}_SAMPUL_${String(_sampulCounter).padStart(2, '0')}.png`;
      const dir = _lastOutDir || await window.kinostra.pickOutputDir();
      if (!dir) { M.c.disabled = false; return; }
      _lastOutDir = dir;
      const r = await saveBlobToDir(blob, dir, nm);
      toast('Sampul tersimpan: ' + r.path, 'ok');
      M.c.disabled = false;
    } catch (e) {
      M.c.disabled = false;
      toast('Gagal menyimpan sampul: ' + (e.message || e), 'err');
    }
  };
}
