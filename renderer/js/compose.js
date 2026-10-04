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

/* ---------- KOMPONEN KOMPOSISI ---------- */
function drawComposition(x, W, H, t) {
  const u = H / 1080, F = state.font;
  /* --- latar --- */
  if (state.isAudio) {
    drawWaveBg(x, W, H, t, u);
  } else if (videoEl.videoWidth) {
    const fit = containRect(videoEl.videoWidth, videoEl.videoHeight, W, H);
    if (state.ratio === '9:16' && state.bgMode === 'blur') {
      const c = coverRect(videoEl.videoWidth, videoEl.videoHeight, W, H);
      x.save(); x.filter = `blur(${Math.round(36 * u)}px) saturate(1.2)`;
      x.drawImage(videoEl, c.x, c.y, c.w, c.h); x.restore();
      x.fillStyle = 'rgba(4,5,8,.45)'; x.fillRect(0, 0, W, H);
    } else { x.fillStyle = '#050608'; x.fillRect(0, 0, W, H); }
    /* UPGRADE: filter warna (kecerahan/kontras/saturasi) pada video */
    const V = state.vfx;
    x.save();
    const fl = [];
    if (V.bright !== 1) fl.push(`brightness(${V.bright})`);
    if (V.contrast !== 1) fl.push(`contrast(${V.contrast})`);
    if (V.saturate !== 1) fl.push(`saturate(${V.saturate})`);
    x.filter = fl.length ? fl.join(' ') : 'none';
    x.drawImage(videoEl, fit.x, fit.y, fit.w, fit.h);
    x.restore();
    /* UPGRADE: vignette */
    if (V.vignette) {
      const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.5)');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
    /* UPGRADE: film grain (murah: noise halus per frame) */
    if (V.grain) drawGrain(x, W, H, t);
  } else { x.fillStyle = '#050608'; x.fillRect(0, 0, W, H); }
  /* --- PART --- */
  const total = segmentsCount();
  const seg = Math.min(total - 1, Math.floor(t / state.splitSec));
  if (state.partShow === 'intro') {
    const tin = t - seg * state.splitSec, a = clamp(1 - tin / 1.6, 0, 1);
    if (a > 0) {
      x.save(); x.globalAlpha = a; x.textAlign = 'center';
      const cy = H * 0.42;
      x.fillStyle = '#F7A600'; x.fillRect(W / 2 - 60 * u, cy - 84 * u, 120 * u, 3 * u);
      x.fillStyle = '#F2F0EA'; x.font = `${Math.round(112 * u)}px "${F}"`;
      drawSpaced(x, `${state.partPrefix} ${String(seg + 1).padStart(2, '0')}`, W / 2, cy + 40 * u, 8 * u, 'center');
      x.fillStyle = 'rgba(239,237,231,.55)'; x.font = `500 ${Math.round(24 * u)}px "JetBrains Mono"`;
      x.fillText(`SEGMEN ${seg + 1} / ${total} · ${Math.round(state.splitSec)} DTK`, W / 2, cy + 92 * u);
      x.fillStyle = '#F7A600'; x.fillRect(W / 2 - 60 * u, cy + 116 * u, 120 * u, 3 * u);
      x.restore();
    }
  } else {
    x.save();
    const px = W * 0.05, py = H * 0.925;
    x.fillStyle = '#F7A600'; x.fillRect(px, py - 40 * u, 4 * u, 50 * u);
    x.fillStyle = '#F2F0EA'; x.font = `${Math.round(46 * u)}px "${F}"`;
    const w = drawSpaced(x, `${state.partPrefix} ${String(seg + 1).padStart(2, '0')}`, px + 16 * u, py, 3 * u, 'left');
    x.fillStyle = 'rgba(239,237,231,.5)'; x.font = `500 ${Math.round(20 * u)}px "JetBrains Mono"`;
    x.fillText(`/${String(total).padStart(2, '0')}`, px + 16 * u + w + 10 * u, py);
    x.restore();
  }
  /* --- JUDUL & DESKRIPSI --- */
  let yTitleBase = 0;
  if (state.titleOn && state.title) {
    x.save(); x.textAlign = 'center';
    const fs = Math.round(52 * u * state.titleScale);
    x.fillStyle = '#F7A600'; x.fillRect(W / 2 - 30 * u, H * 0.062, 60 * u, 3 * u);
    x.fillStyle = '#F2F0EA'; x.font = `${fs}px "${F}"`;
    const txt = state.upper ? state.title.toUpperCase() : state.title;
    const ty = H * 0.062 + fs * 1.15;
    drawSpaced(x, txt, W / 2, ty, 7 * u * state.titleScale, 'center');
    yTitleBase = ty; x.restore();
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
      const lh = fs * 1.3, baseY = H * 0.9 - (lines.length - 1) * lh;
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

/* ---------- UPGRADE: FILM GRAIN ---------- */
let _grainCv = null, _grainStamp = 0;
function drawGrain(x, W, H, t) {
  const stamp = Math.floor(t * 24);
  if (!_grainCv) { _grainCv = document.createElement('canvas'); _grainCv.width = 320; _grainCv.height = 180; }
  if (_grainStamp !== stamp) {
    _grainStamp = stamp;
    const g = _grainCv.getContext('2d');
    const img = g.createImageData(320, 180);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 128 + (Math.random() * 90 - 45);
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  x.save();
  x.globalAlpha = 0.055; x.globalCompositeOperation = 'overlay';
  x.imageSmoothingEnabled = true;
  x.drawImage(_grainCv, 0, 0, W, H);
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
