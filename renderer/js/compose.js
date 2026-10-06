/* ================================================================
   KINOSTRA DESKTOP — compose.js
   Mesin komposisi frame: latar + video + part bumper + judul +
   deskripsi + subtitel + tracking + watermark + efek visual
   ================================================================ */
'use strict';

function drawSpaced(x, text, cx, y, ls, align = 'center') {
  const prev = x.textAlign; x.textAlign = 'left';
  const ws = [...text].map(c => x.measureText(c).width);
  const tot = ws.reduce((a, b) => a + b, 0) + ls * Math.max(0, text.length - 1);
  let px = align === 'center' ? cx - tot / 2 : align === 'right' ? cx - tot : cx;
  for (let i = 0; i < text.length; i++) { x.fillText(text[i], px, y); px += ws[i] + ls; }
  x.textAlign = prev; return tot;
}
function wrapLines(x, text, maxW) {
  const out = []; let line = '';
  for (const w of text.split(/\s+/)) {
    const t = line ? line + ' ' + w : w;
    if (x.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line); return out;
}
/* ---------- v2.2: WRAP UNTUK TEKS BER-SPASI HURUF (judul) ---------- */
function measureSpaced(x, text, ls) {
  const ws = [...text].map(c => x.measureText(c).width);
  return ws.reduce((a, b) => a + b, 0) + ls * Math.max(0, text.length - 1);
}
function wrapSpaced(x, text, maxW, ls) {
  const out = []; let line = '';
  for (const w of text.split(/\s+/)) {
    const t = line ? line + ' ' + w : w;
    if (measureSpaced(x, t, ls) > maxW && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line); return out;
}

/* ---------- SUMBER GAMBAR KOMPOSISI (UPGRADE v2.1) ----------
   Preview memakai videoEl; worker ekspor paralel memakai elemen
   videonya sendiri. Karena set + draw + capture VideoFrame dilakukan
   SINKRON dalam satu task JS, pergantian sumber aman dari race. */
let _compSrc = null;
function setCompSrc(el) { _compSrc = el || null; }
function compSrc() { return _compSrc || videoEl; }

/* ---------- UPGRADE v2.1 → v2.6: RECT VIDEO DENGAN ZOOM & GESER ----------
   Dipakai preview, ekspor, dan tracking agar semuanya konsisten.
   Mode 9:16: zoom 1 = muat penuh (letterbox), zoom > 1 = membesar
   hingga menutup frame (maks 4×).
   v2.6 FIX — GESER SEKARANG SELALU BERFUNGSI:
   - panX/panY (−1..1) memposisikan video DI DALAM frame:
     · video lebih kecil dari frame → geser memindahkan posisi strip
       video (atas/bawah/kiri/kanan) — berfungsi di zoom 1× pun
     · video lebih besar (zoom) → geser memilih bagian yang terlihat
   - Dulu: pan hanya berlaku saat zoom > 1, dan video landscape butuh
     zoom ≥ 3.16× untuk overflow vertikal (slider mentok 3×) → slider
     GESER ATAS/BAWAH tidak pernah berfungsi. Sekarang model unified. */
function videoFrameRect(vw, vh, W, H) {
  const fit = containRect(vw, vh, W, H);
  if (state.ratio !== '9:16') return fit;
  const z = clamp(state.frame.zoom || 1, 1, 4);
  const sw = fit.w * z, sh = fit.h * z;
  /* posisi linear −1..1 → 0..(W−sw): satu rumus untuk DUA mode —
     video lebih kecil (slack) = memindahkan strip; video lebih besar
     (crop) = memilih bagian yang terlihat. px/py −1 selalu = ATAS/KIRI. */
  const px = clamp(state.frame.panX || 0, -1, 1), py = clamp(state.frame.panY || 0, -1, 1);
  return {
    x: (px + 1) / 2 * (W - sw),
    y: (py + 1) / 2 * (H - sh),
    w: sw, h: sh,
    covers: sw >= W - 0.6 && sh >= H - 0.6
  };
}

/* ---------- v2.2 → v2.6: CACHE LAPISAN STATIS (kecepatan render) ----------
   Latar blur 9:16 & vignette tidak berubah antar frame — dibangun
   SEKALI lalu di-blit tiap frame (menghemat 50-150ms/frame).
   Cache LRU kecil: preview & tiap ukuran ekspor punya entrinya.
   v2.6: di PREVIEW latar blur di-refresh tiap ±1.6 dtk dari frame
   terkini (ikut video berjalan) — di ekspor tetap statis (kecepatan). */
const _layerCache = new Map();
function getLayer(key, build) {
  let cv = _layerCache.get(key);
  if (!cv) {
    cv = build();
    _layerCache.set(key, cv);
    if (_layerCache.size > 10) { const k0 = _layerCache.keys().next().value; _layerCache.delete(k0); }
  }
  return cv;
}
function buildBlurBg(vid, W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const co = coverRect(vid.videoWidth, vid.videoHeight, W, H);
  const u = H / 1080;
  g.filter = `blur(${Math.round(36 * u)}px) saturate(1.2)`;
  g.drawImage(vid, co.x, co.y, co.w, co.h);
  g.filter = 'none';
  g.fillStyle = 'rgba(4,5,8,.45)'; g.fillRect(0, 0, W, H);
  return c;
}
function bgLayerKey(vid, W, H, tLive) {
  /* v2.6: preview = bucket waktu ±1.6 dtk (latar ikut video); ekspor = statis */
  const bucket = tLive == null ? 's' : 'b' + Math.floor(tLive / 1.6);
  return `bg|${state.mediaEpoch || 0}|${vid.videoWidth}x${vid.videoHeight}|${W}x${H}|${bucket}`;
}
function buildVignette(W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.5)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  return c;
}

/* ---------- KOMPONEN KOMPOSISI ---------- */
function drawComposition(x, W, H, t) {
  const u = H / 1080, F = state.font;
  /* --- latar --- */
  if (state.isAudio) {
    drawWaveBg(x, W, H, t, u);
  } else if (compSrc().videoWidth) {
    const vid = compSrc();
    const fit = videoFrameRect(vid.videoWidth, vid.videoHeight, W, H);
    /* v2.6 FIX BLUR SINEMATIK: latar blur digambar SELALU saat video belum
       menutup frame (zoom berapa pun) — dulu kondisi `fit.w <= W+1` gagal
       saat zoom > 1 sehingga latar jadi HITAM. Sekarang pakai flag `covers`.
       Preview: latar blur mengikuti frame terkini (bucket ±1.6 dtk). */
    if (state.ratio === '9:16' && state.bgMode === 'blur' && !fit.covers) {
      const live = vid === videoEl ? t : null;
      const bg = getLayer(bgLayerKey(vid, W, H, live), () => buildBlurBg(vid, W, H));
      x.drawImage(bg, 0, 0);
    } else { x.fillStyle = '#050608'; x.fillRect(0, 0, W, H); }
    /* UPGRADE: filter warna (kecerahan/kontras/saturasi) pada video */
    const V = state.vfx;
    x.save();
    const fl = [];
    if (V.bright !== 1) fl.push(`brightness(${V.bright})`);
    if (V.contrast !== 1) fl.push(`contrast(${V.contrast})`);
    if (V.saturate !== 1) fl.push(`saturate(${V.saturate})`);
    x.filter = fl.length ? fl.join(' ') : 'none';
    x.drawImage(vid, fit.x, fit.y, fit.w, fit.h);
    x.restore();
    /* UPGRADE: vignette (v2.2: dari cache) */
    if (V.vignette) {
      const vg = getLayer('vg|' + W + 'x' + H, () => buildVignette(W, H));
      x.drawImage(vg, 0, 0);
    }
    /* UPGRADE: film grain (murah: noise halus per frame) */
    if (V.grain) drawGrain(x, W, H, t);
  } else { x.fillStyle = '#050608'; x.fillRect(0, 0, W, H); }
  /* --- PART (v2.6: posisi bisa digeser kiri/kanan & atas/bawah) --- */
  const total = segmentsCount();
  const seg = Math.min(total - 1, Math.floor(t / state.splitSec));
  const ppx = clamp(state.partPosX || 0, -1, 1), ppy = clamp(state.partPosY || 0, -1, 1);
  if (state.partShow === 'intro') {
    const tin = t - seg * state.splitSec, a = clamp(1 - tin / 1.6, 0, 1);
    if (a > 0) {
      x.save(); x.globalAlpha = a; x.textAlign = 'center';
      /* geser: ±30% tinggi layar (vertikal), ±30% lebar (horizontal) */
      const cx = W / 2 + ppx * W * 0.30;
      const cy = H * clamp(0.42 + ppy * 0.30, 0.10, 0.88);
      x.fillStyle = '#F7A600'; x.fillRect(cx - 60 * u, cy - 84 * u, 120 * u, 3 * u);
      x.fillStyle = '#F2F0EA'; x.font = `${Math.round(112 * u)}px "${F}"`;
      drawSpaced(x, `${state.partPrefix} ${String(seg + 1).padStart(2, '0')}`, cx, cy + 40 * u, 8 * u, 'center');
      x.fillStyle = 'rgba(239,237,231,.55)'; x.font = `500 ${Math.round(24 * u)}px "JetBrains Mono"`;
      x.fillText(`SEGMEN ${seg + 1} / ${total} · ${Math.round(state.splitSec)} DTK`, cx, cy + 92 * u);
      x.fillStyle = '#F7A600'; x.fillRect(cx - 60 * u, cy + 116 * u, 120 * u, 3 * u);
      x.restore();
    }
  } else {
    x.save();
    /* label pojok: geser horizontal 5% → ±35% lebar, vertikal 92.5% → ±22% tinggi */
    const px = W * clamp(0.05 + ppx * 0.35, 0.02, 0.68);
    const py = H * clamp(0.925 + ppy * 0.22, 0.045, 0.985);
    x.fillStyle = '#F7A600'; x.fillRect(px, py - 40 * u, 4 * u, 50 * u);
    x.fillStyle = '#F2F0EA'; x.font = `${Math.round(46 * u)}px "${F}"`;
    const w = drawSpaced(x, `${state.partPrefix} ${String(seg + 1).padStart(2, '0')}`, px + 16 * u, py, 3 * u, 'left');
    x.fillStyle = 'rgba(239,237,231,.5)'; x.font = `500 ${Math.round(20 * u)}px "JetBrains Mono"`;
    x.fillText(`/${String(total).padStart(2, '0')}`, px + 16 * u + w + 10 * u, py);
    x.restore();
  }
  /* --- JUDUL & DESKRIPSI (v2.3 ukuran · v2.6 posisi bisa digeser atas/bawah) --- */
  let yTitleBase = 0;
  if (state.titleOn && state.title) {
    x.save(); x.textAlign = 'center';
    /* v2.6: geser vertikal ±14% tinggi layar dari posisi default */
    const tpy = clamp(state.titlePosY || 0, -1, 1);
    const yLine = H * clamp(0.062 + tpy * 0.14, 0.012, 0.46);
    x.fillStyle = '#F7A600'; x.fillRect(W / 2 - 30 * u, yLine, 60 * u, 3 * u);
    x.fillStyle = '#F2F0EA';
    const txt = state.upper ? state.title.toUpperCase() : state.title;
    const szBase = clamp(state.titleSize || 40, 14, 160);
    let fs = Math.round(szBase * u * state.titleScale);
    let ls = Math.max(1, 7 * u * (fs / (52 * u)));   /* spasi huruf proporsional ukuran */
    x.font = `${fs}px "${F}"`;
    let lines = wrapSpaced(x, txt, W * 0.84, ls);
    let guard = 0;
    while (lines.length > 4 && guard < 8) {
      fs = Math.max(Math.round(fs * 0.86), Math.round(20 * u));
      ls *= 0.9;
      x.font = `${fs}px "${F}"`;
      lines = wrapSpaced(x, txt, W * 0.84, ls);
      guard++;
    }
    lines = lines.slice(0, 4);
    const lh = fs * 1.18;
    const ty0 = yLine + fs * 1.15;
    lines.forEach((ln, i) => drawSpaced(x, ln, W / 2, ty0 + i * lh, ls, 'center'));
    yTitleBase = ty0 + (lines.length - 1) * lh;
    x.restore();
  }
  if (state.descOn && state.desc.trim()) {
    x.save();
    const fs2 = Math.round(25 * u);
    x.font = `500 ${fs2}px "Chakra Petch"`;
    const lines = wrapLines(x, state.desc.trim(), W * 0.62).slice(0, 3);
    x.fillStyle = 'rgba(239,237,231,.82)'; x.textAlign = 'center';
    if (state.descPos === 'under' && yTitleBase) {
      lines.forEach((ln, i) => x.fillText(ln, W / 2, yTitleBase + fs2 * 1.9 + i * fs2 * 1.4));
    } else {
      lines.forEach((ln, i) => x.fillText(ln, W / 2, H * 0.955 - (lines.length - 1 - i) * fs2 * 1.4));
    }
    x.restore();
  }
  /* --- SUBTITEL --- */
  if (state.subsOn && state.subs.length) {
    const sub = state.subs.find(s => t >= s.s && t < s.e);
    if (sub && sub.text) {
      x.save();
      const fs = Math.round(38 * u * state.subScale);
      x.font = `600 ${fs}px "${F}"`;
      const lines = wrapLines(x, sub.text, W * 0.62).slice(0, 3);
      /* v2.5: POSISI SUBTITEL BISA DIGESER — state.subPosY 0.45 (tengah)
         sampai 0.97 (bawah). Default 0.90 = posisi lama. Digeser ke atas
         agar tidak berdempetan dengan label PART / deskripsi. */
      const posY = clamp(state.subPosY == null ? 0.9 : state.subPosY, 0.08, 0.97);
      const lh = fs * 1.3, baseY = posY * H - (lines.length - 1) * lh;
      x.textAlign = 'center'; x.lineJoin = 'round'; x.strokeStyle = 'rgba(0,0,0,.88)'; x.lineWidth = 7 * u;
      lines.forEach((ln, i) => { x.strokeText(ln, W / 2, baseY + i * lh); x.fillStyle = '#F5F3ED'; x.fillText(ln, W / 2, baseY + i * lh); });
      x.restore();
    }
  }
  /* --- TRACK TARGET --- */
  drawTrack(x, W, H, t, u);
  /* --- UPGRADE: WATERMARK --- */
  drawWatermark(x, W, H, u);
}

/* ---------- UPGRADE: FILM GRAIN (v2.2: 6 tile pre-generate, di-cycle) ---------- */
let _grainTiles = null;
function getGrainTiles() {
  if (_grainTiles) return _grainTiles;
  _grainTiles = [];
  for (let k = 0; k < 6; k++) {
    const c = document.createElement('canvas'); c.width = 320; c.height = 180;
    const g = c.getContext('2d');
    const img = g.createImageData(320, 180);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 128 + (Math.random() * 90 - 45);
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    _grainTiles.push(c);
  }
  return _grainTiles;
}
function drawGrain(x, W, H, t) {
  const tiles = getGrainTiles();
  const tl = tiles[Math.floor(t * 24) % tiles.length];
  x.save();
  x.globalAlpha = 0.055; x.globalCompositeOperation = 'overlay';
  x.imageSmoothingEnabled = true;
  x.drawImage(tl, 0, 0, W, H);
  x.restore();
}

/* ---------- UPGRADE: WATERMARK (teks / logo) ---------- */
function drawWatermark(x, W, H, u) {
  const wm = state.wm;
  if (wm.mode === 'off') return;
  const pad = 28 * u;
  const m = 0.14 * wm.opacity; // bayangan tipis biar terbaca
  x.save();
  x.globalAlpha = wm.opacity;
  if (wm.mode === 'text') {
    const fs = Math.round(30 * u * wm.scale);
    x.font = `700 ${fs}px "Chakra Petch"`;
    const txt = wm.text || '@KINOSTRA';
    const tw = x.measureText(txt).width;
    let px, py;
    if (wm.pos === 'br') { px = W - pad - tw; py = H - pad; }
    else if (wm.pos === 'bl') { px = pad; py = H - pad; }
    else if (wm.pos === 'tr') { px = W - pad - tw; py = pad + fs; }
    else { px = pad; py = pad + fs; }
    x.fillStyle = `rgba(0,0,0,${m * 3})`; x.fillText(txt, px + 2 * u, py + 2 * u);
    x.fillStyle = '#FFFFFF'; x.fillText(txt, px, py);
  } else if (wm.mode === 'logo' && wm.img) {
    const iw = wm.img.width, ih = wm.img.height;
    const maxW = W * 0.16 * wm.scale, maxH = H * 0.16 * wm.scale;
    const s = Math.min(maxW / iw, maxH / ih, 1.2);
    const w = iw * s, h = ih * s;
    let px, py;
    if (wm.pos === 'br') { px = W - pad - w; py = H - pad - h; }
    else if (wm.pos === 'bl') { px = pad; py = H - pad - h; }
    else if (wm.pos === 'tr') { px = W - pad - w; py = pad; }
    else { px = pad; py = pad; }
    x.drawImage(wm.img, px, py, w, h);
  }
  x.restore();
}

/* ---------- LATAR AUDIO ONLY ---------- */
function drawWaveBg(x, W, H, t, u) {
  x.fillStyle = '#05070A'; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(120,140,160,.07)'; x.lineWidth = 1;
  for (let gy = 0; gy < H; gy += 64 * u) { x.beginPath(); x.moveTo(0, gy); x.lineTo(W, gy); x.stroke(); }
  const mid = H / 2, p = state.peaks || [];
  const bw = Math.max(2, Math.round(3 * u)), gap = Math.round(2 * u), n = Math.floor(W / (bw + gap));
  for (let i = 0; i < n; i++) {
    const v = p[Math.floor(i / n * p.length)] || 0, h = Math.max(2 * u, v * H * 0.3);
    x.fillStyle = (i / n) < (t / (state.duration || 1)) ? '#F7A600' : 'rgba(160,175,190,.32)';
    x.fillRect(i * (bw + gap), mid - h / 2, bw, h);
  }
  x.fillStyle = '#F7A600'; x.fillRect((t / (state.duration || 1)) * W - 1 * u, H * 0.12, 2.5 * u, H * 0.76);
  x.font = `500 ${Math.round(20 * u)}px "JetBrains Mono"`; x.fillStyle = 'rgba(239,237,231,.5)';
  x.textAlign = 'left'; x.fillText('AUDIO ONLY · ' + (state.file ? state.file.name.toUpperCase() : ''), 24 * u, H * 0.085);
}
