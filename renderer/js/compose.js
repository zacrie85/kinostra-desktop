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

/* ---------- UPGRADE v2.1 → v2.12: RECT VIDEO DENGAN ZOOM & GESER + KEN BURNS ----------
   Dipakai preview, ekspor, dan tracking agar semuanya konsisten.
   Mode 9:16: zoom 1 = muat penuh (letterbox), zoom > 1 = membesar
   hingga menutup frame (maks 4×).
   v2.6 FIX — GESER SEKARANG SELALU BERFUNGSI:
   - panX/panY (−1..1) memposisikan video DI DALAM frame:
     · video lebih kecil dari frame → geser memindahkan posisi strip
       video (atas/bawah/kiri/kanan) — berfungsi di zoom 1× pun
     · video lebih besar (zoom) → geser memilih bagian yang terlihat
   v2.12 — KEN BURNS OTOMATIS (efek "video statis jadi hidup"):
   - ZOOM IN / ZOOM OUT : skala berubah perlahan sepanjang part
   - PAN X / PAN Y      : video menyapu kiri→kanan / atas→bawah
   - Diterapkan di KEDUA rasio (16:9 & 9:16) di atas setelan manual.
   - Progres memakai posisi DI DALAM part → tiap part mengulang efek
     dari awal (sinematik & konsisten antar part). */
function kbProgress(t) {
  if (t == null) return 0;
  const b = (typeof currentSegBounds === 'function' && currentSegBounds(t)) || null;
  const start = b ? b.start : rangeInfo().start, len = b ? (b.end - b.start) : state.splitSec;
  return clamp((t - start) / Math.max(0.1, len), 0, 1);
}
function videoFrameRect(vw, vh, W, H, t) {
  const fit = containRect(vw, vh, W, H);
  const v9 = state.ratio === '9:16';
  let z = v9 ? clamp(state.frame.zoom || 1, 1, 4) : 1;
  let px = v9 ? clamp(state.frame.panX || 0, -1, 1) : 0;
  let py = v9 ? clamp(state.frame.panY || 0, -1, 1) : 0;
  /* v2.12: KEN BURNS — progres 0..1 dalam part berjalan.
     PAN butuh overscan minimal supaya geseran SELALU terlihat di
     semua rasio (video yang pas-pasan penuh frame di zoom 1 tidak
     punya ruang geser) → paksa zoom ringan 1+strength saat PAN. */
  const K = state.kb;
  if (t != null && K && K.mode && K.mode !== 'off') {
    const s = clamp(K.strength || 0.3, 0.05, 0.8);
    const p = kbProgress(t);
    if (K.mode === 'in') z *= 1 + s * p;
    else if (K.mode === 'out') z *= 1 + s * (1 - p);
    else if (K.mode === 'panx') { z = Math.max(z, 1 + s); px = clamp(px + (p * 2 - 1) * s, -1, 1); }
    else if (K.mode === 'pany') { z = Math.max(z, 1 + s); py = clamp(py + (p * 2 - 1) * s, -1, 1); }
    else if (K.mode === 'diag') { z = Math.max(z, 1 + s * 0.6) * (1 + s * p); px = clamp(px + (p * 2 - 1) * s * 0.6, -1, 1); }
  }
  const sw = fit.w * z, sh = fit.h * z;
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
  const FST = (typeof frameDef === 'function') ? frameDef() : null;   /* v2.12 */
  /* --- latar --- */
  if (state.isAudio) {
    drawWaveBg(x, W, H, t, u);
  } else if (compSrc().videoWidth) {
    const vid = compSrc();
    /* v3.1: ZOOM PEMBICARA — crop kamera otomatis mengisi PENUH kanvas.
       spkCropAt = fungsi murni dari t (deterministik) → preview, ekspor
       tunggal, split & batch menghasilkan kamera yang persis sama. */
    const spk = (typeof spkCropAt === 'function')
      ? spkCropAt(vid.videoWidth, vid.videoHeight, W, H, t) : null;
    const fit = spk
      ? { x: 0, y: 0, w: W, h: H, covers: true }
      : videoFrameRect(vid.videoWidth, vid.videoHeight, W, H, t);
    /* v2.12: frame bergaya punya LATAR SENDIRI bertema (mis. merah bioskop,
       biru panel) — menggantikan blur saat frame aktif, persis referensi.
       v3.1: zoom pembicara aktif → video full-bleed, tanpa latar. */
    const useBlur = !spk && state.ratio === '9:16' && state.bgMode === 'blur' && !fit.covers && !(FST && FST.bg);
    if (!spk) {
      if (FST && FST.bg) {
        drawFrameBg(x, W, H, t, u);
      } else if (useBlur) {
        const live = vid === videoEl ? t : null;
        const bg = getLayer(bgLayerKey(vid, W, H, live), () => buildBlurBg(vid, W, H));
        x.drawImage(bg, 0, 0);
      } else { x.fillStyle = '#050608'; x.fillRect(0, 0, W, H); }
      /* v2.12: lapisan SEBELUM video (mis. panel putih gaya Exploraship) */
      if (FST && FST.under) drawFrameUnder(x, W, H, t, u, fit);
    }
    /* UPGRADE: filter warna (kecerahan/kontras/saturasi) pada video
       v3.0: + FILTER WARNA sinematik (katalog COLORFILTERS) — css digabung
       dgn setelan manual VFX; lapisan tint tipis hanya di area video */
    const V = state.vfx;
    const CF = (typeof COLORFILTERS !== 'undefined' && COLORFILTERS.find(c => c.k === state.colorFilter)) || null;
    x.save();
    const fl = [];
    if (V.bright !== 1) fl.push(`brightness(${V.bright})`);
    if (V.contrast !== 1) fl.push(`contrast(${V.contrast})`);
    if (V.saturate !== 1) fl.push(`saturate(${V.saturate})`);
    if (CF && CF.css) fl.push(CF.css);
    x.filter = fl.length ? fl.join(' ') : 'none';
    /* v3.1: crop kamera pembicara (9-argumen: potong sumber → penuh kanvas)
       atau jalur lama (muat/zoom manual)
       v3.5: mode FADE — bingkai lama digambar penuh, bingkai baru di atasnya
       dengan alpha naik 0→1 (melebur, tanpa gerakan kamera terlihat) */
    if (spk && spk.fadeFrom && spk.fadeK < 1) {
      x.drawImage(vid, spk.fadeFrom.sx, spk.fadeFrom.sy, spk.fadeFrom.sw, spk.fadeFrom.sh, 0, 0, W, H);
      x.globalAlpha = Math.max(0, Math.min(1, spk.fadeK));
      x.drawImage(vid, spk.sx, spk.sy, spk.sw, spk.sh, 0, 0, W, H);
      x.globalAlpha = 1;
    }
    else if (spk) x.drawImage(vid, spk.sx, spk.sy, spk.sw, spk.sh, 0, 0, W, H);
    else x.drawImage(vid, fit.x, fit.y, fit.w, fit.h);
    x.filter = 'none';
    if (CF && CF.tint) {
      x.globalCompositeOperation = CF.op || 'overlay';
      x.fillStyle = CF.tint;
      x.fillRect(fit.x, fit.y, fit.w, fit.h);
      x.globalCompositeOperation = 'source-over';
    }
    x.restore();
    /* UPGRADE: vignette (v2.2: dari cache) */
    if (V.vignette) {
      const vg = getLayer('vg|' + W + 'x' + H, () => buildVignette(W, H));
      x.drawImage(vg, 0, 0);
    }
    /* UPGRADE: film grain (murah: noise halus per frame) */
    if (V.grain) drawGrain(x, W, H, t);
    /* v2.12: hiasan frame bergaya — SEBELUM teks supaya judul/deskripsi/part
       tampil DI ATAS pita & banner (persis skema posisi referensi pengguna) */
    if (FST && FST.decor) drawFrameDecor(x, W, H, t, u, vid === videoEl, fit);
  } else { x.fillStyle = '#050608'; x.fillRect(0, 0, W, H); }
  /* --- PART (v2.6 posisi geser · v2.9 sadar-rentang · v2.12 sadar-potong)
         v3.0: state._noPart = true saat GABUNG VIDEO — label part tidak
         masuk file gabungan (judul tiap film tetap tampil)
         v3.9: gaya TANPA LABEL (off) + slider vertikal menjangkau
         PALING ATAS layar (dulu terhenti di ±22% tinggi) --- */
  if (!state._noPart && state.partShow !== 'off') {
  const total = segmentsCount();
  const segB = (typeof currentSegBounds === 'function' && currentSegBounds(t))
    || { i: 0, start: rangeInfo().start, end: rangeInfo().end };
  const seg = clamp(segB.i, 0, Math.max(0, total - 1));
  const ppx = clamp(state.partPosX || 0, -1, 1), ppy = clamp(state.partPosY || 0, -1, 1);
  /* v3.11: ANIMASI MASUK PART (NCTEXTANIMS — NOVACUT) — bumper intro &
     label pojok masuk dengan animasi pilihan di awal tiap part; waktu
     lokal = detik OUTPUT sejak awal part (ikut kecepatan) */
  const _spdP = clamp(state.speed || 1, 0.25, 4);
  const _tinP = (t - segB.start) / _spdP;
  const _pA = (state.partAnim && state.partAnim !== 'off' && _tinP < 1.6)
    ? ncTextState(state.partAnim, _tinP, 1e9, seg * 131 + 7 + Math.floor(t * 30)) : null;
  if (state.partShow === 'intro') {
    let a = clamp(1 - _tinP / 1.6, 0, 1);
    if (_pA) a = Math.min(a, _pA.alpha);
    if (a > 0.004) {
      x.save(); x.globalAlpha = a; x.textAlign = 'center';
      const cx = W / 2 + ppx * W * 0.30;
      const cy = H * clamp(0.42 + ppy * 0.40, 0.085, 0.90);
      if (_pA) {
        if (_pA.scale !== 1) { x.translate(cx, cy); x.scale(_pA.scale, _pA.scale); x.translate(-cx, -cy); }
        if (_pA.dy) x.translate(0, _pA.dy * H);
      }
      x.fillStyle = '#F7A600'; x.fillRect(cx - 60 * u, cy - 84 * u, 120 * u, 3 * u);
      x.fillStyle = '#F2F0EA'; x.font = `${Math.round(112 * u)}px "${F}"`;
      const _pTxt = `${state.partPrefix} ${String(seg + 1).padStart(2, '0')}`;
      ncAnimSpacedLine(x, _pA, _pTxt, cx, cy + 40 * u, 8 * u, 112 * u,
        (t2, ls2, dx) => drawSpaced(x, t2, cx + dx, cy + 40 * u, ls2, 'center'), W);
      x.fillStyle = 'rgba(239,237,231,.55)'; x.font = `500 ${Math.round(24 * u)}px "JetBrains Mono"`;
      x.fillText(`SEGMEN ${seg + 1} / ${total} · ${Math.round(state.splitSec)} DTK`, cx, cy + 92 * u);
      x.fillStyle = '#F7A600'; x.fillRect(cx - 60 * u, cy + 116 * u, 120 * u, 3 * u);
      x.restore();
    }
  } else {
    x.save();
    const px = W * clamp(0.05 + ppx * 0.35, 0.02, 0.68);
    const py = H * clamp(0.925 + ppy * 0.88, 0.062, 0.985);
    if (_pA) {
      x.globalAlpha = _pA.alpha;
      if (_pA.scale !== 1) { x.translate(px, py); x.scale(_pA.scale, _pA.scale); x.translate(-px, -py); }
      if (_pA.dy) x.translate(0, _pA.dy * H);
    }
    x.fillStyle = '#F7A600'; x.fillRect(px, py - 40 * u, 4 * u, 50 * u);
    x.fillStyle = '#F2F0EA'; x.font = `${Math.round(46 * u)}px "${F}"`;
    const _cTxt = `${state.partPrefix} ${String(seg + 1).padStart(2, '0')}`;
    const w = drawSpaced(x, ncAnimSpacedTxt(x, _pA, _cTxt), px + 16 * u, py, 3 * u + (_pA && _pA.kind === 'tracking' ? (1 - ncEaseOut(_pA.inP || 0)) * 46 * u * 0.5 : 0), 'left');
    x.fillStyle = 'rgba(239,237,231,.5)'; x.font = `500 ${Math.round(20 * u)}px "JetBrains Mono"`;
    x.fillText(`/${String(total).padStart(2, '0')}`, px + 16 * u + w + 10 * u, py);
    x.restore();
  }
  }
  /* --- JUDUL & DESKRIPSI (v2.3 ukuran · v2.6 posisi digeser atas/bawah)
         v3.9: POSISI PENUH — slider menjangkau PALING BAWAH layar (dulu
         terhenti di 46% tinggi) + 10 FRAME FITURISTIK di sekeliling judul
         (state.titleFrame, katalog TITLEFRAMES — hiasan DI DALAM VIDEO,
         pratinjau = hasil ekspor persis karena satu mesin gambar) --- */
  let yTitleBase = 0;
  if (state.titleOn && state.title) {
    x.save(); x.textAlign = 'center';
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
    const lh = fs * 1.18, nL = lines.length;
    /* v3.9: posisi penuh atas → bawah. Frame HOROR/KOPLO tetap mendorong
       judul ke bawah papan tematiknya (FST.titlePush). */
    const tpy = clamp(state.titlePosY || 0, -1, 1);
    const tPush = (FST && FST.titlePush) || 0;
    let yLine = H * clamp(0.062 + tPush + tpy * 0.87, 0.012, 0.93);
    yLine = clamp(yLine, H * 0.012, H * 0.93);
    let ty0 = yLine + fs * 1.15;
    /* jaga seluruh blok tetap di dalam layar walau slider mentok bawah */
    const maxTy0 = H * 0.982 - (nL - 1) * lh - fs * 0.12;
    if (ty0 > maxTy0) ty0 = maxTy0;
    const yTop = ty0 - fs * 1.15;   /* titik acuan atas — garis/frame ikut teks */
    yTitleBase = ty0 + (nL - 1) * lh;
    /* v3.11: ANIMASI MASUK JUDUL (NCTEXTANIMS — NOVACUT) — judul di video
       masuk dengan animasi di awal tiap part; waktu lokal = detik OUTPUT
       sejak awal part; NEON = efek berkelap-kelip terus-menerus */
    const _spdA = clamp(state.speed || 1, 0.25, 4);
    const _sbA = (typeof currentSegBounds === 'function' && currentSegBounds(t)) || null;
    const _tlA = _sbA ? (t - _sbA.start) / _spdA : 1e9;
    const _aKey = state.titleAnim && state.titleAnim !== 'off' ? state.titleAnim : null;
    const tA = (_aKey && (_aKey === 'neon' || _tlA < 1.6))
      ? ncTextState(_aKey, _tlA, 1e9, 700 + Math.floor(t * 30)) : null;
    if (tA && tA.alpha <= 0.004 && tA.kind !== 'wipe') {
      x.restore();   /* belum waktunya muncul — blok judul disembunyikan */
    } else {
      if (tA) {
        x.globalAlpha = tA.alpha;
        const _blkCy = (yTop + yTitleBase) / 2;
        if (tA.scale !== 1) { x.translate(W / 2, _blkCy); x.scale(tA.scale, tA.scale); x.translate(-W / 2, -_blkCy); }
        if (tA.dy) x.translate(0, tA.dy * H);
      }
      const tfKey = state.titleFrame || 'off';
      if (tfKey !== 'off') {
        /* ukur lebar blok judul utk menggambar bingkai yang pas */
        let blkW = 0;
        for (const ln of lines) blkW = Math.max(blkW, measureSpaced(x, ln, ls));
        drawTitleFrame(x, W, H, tfKey, {
          cx: W / 2, x0: W / 2 - blkW / 2, x1: W / 2 + blkW / 2,
          top: yTop, bot: ty0 + (nL - 1) * lh + fs * 0.30, fs, u
        });
      } else {
        /* gaya lama: garis amber kecil di atas judul */
        x.fillStyle = '#F7A600'; x.fillRect(W / 2 - 30 * u, yTop, 60 * u, 3 * u);
      }
      /* v3.11: NEON — pendar amber di sekeliling huruf (port anim neon) */
      if (_aKey === 'neon') { x.shadowColor = 'rgba(247,166,0,.95)'; x.shadowBlur = fs * 0.45; }
      lines.forEach((ln, i) => {
        x.fillStyle = '#F2F0EA';
        ncAnimSpacedLine(x, tA, ln, W / 2, ty0 + i * lh, ls, fs,
          (t2, ls2, dx) => drawSpaced(x, t2, W / 2 + dx, ty0 + i * lh, ls2, 'center'), W);
      });
      x.shadowBlur = 0;
      x.restore();
    }
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
  /* --- v2.8: FRAME NEON BERPUTAR (di lapisan paling atas) --- */
  if (state.neon && state.neon.on) drawNeonFrame(x, W, H, t, u, compSrc() === videoEl);
  /* --- v2.12: TRANSISI ANTAR BAGIAN (paling atas semuanya) --- */
  applyTransition(x, W, H, t);
}

/* ================================================================
   v3.9 — 10 FRAME FITURISTIK JUDUL DI VIDEO (katalog TITLEFRAMES)
   Hiasan di sekeliling teks judul yang TERBAKAR DI DALAM VIDEO —
   digambar di drawComposition, jadi pratinjau = hasil ekspor persis.
   Dipanggil SEBELUM teks judul digambar (teks selalu di lapisan atas).
   b = { cx, x0, x1 (lebar teks), top, bot (batas blok teks), fs, u }
   ================================================================ */
function drawTitleFrame(x, W, H, key, b) {
  const AMB = '#F7A600', CREAM = 'rgba(242,240,234,', u = b.u, fs = b.fs;
  const px = fs * 0.55;                     /* ruang napas kiri-kanan */
  const bx0 = Math.max(4 * u, b.x0 - px), bx1 = Math.min(W - 4 * u, b.x1 + px);
  const by0 = Math.max(4 * u, b.top - fs * 0.38), by1 = Math.min(H - 4 * u, b.bot + fs * 0.30);
  const bw = Math.max(10 * u, bx1 - bx0), bh = by1 - by0;
  const lw = m => Math.max(2, m * fs / 52);
  x.save(); x.lineJoin = 'round'; x.lineCap = 'round';
  if (key === 'garis2') {
    /* GARIS KEMBAR — dua garis emas di atas & bawah judul */
    x.fillStyle = AMB;
    x.fillRect(bx0, by0, bw, lw(4.5)); x.fillRect(bx0, by1 - lw(4.5), bw, lw(4.5));
    x.fillStyle = 'rgba(247,166,0,.45)';
    x.fillRect(bx0 + bw * 0.08, by0 + lw(4.5) + 2 * u, bw * 0.84, lw(1.8));
    x.fillRect(bx0 + bw * 0.08, by1 - lw(4.5) - 2 * u - lw(1.8), bw * 0.84, lw(1.8));
  } else if (key === 'kotak') {
    /* KOTAK TEGAS — kotak garis lurus mengelilingi judul */
    x.strokeStyle = AMB; x.lineWidth = lw(5); x.strokeRect(bx0, by0, bw, bh);
  } else if (key === 'bingkai') {
    /* BINGKAI GANDA — luar tebal + dalam tipis */
    x.strokeStyle = AMB; x.lineWidth = lw(6.5); x.strokeRect(bx0, by0, bw, bh);
    const in1 = fs * 0.26;
    x.strokeStyle = CREAM + '.5)'; x.lineWidth = lw(2);
    x.strokeRect(bx0 + in1, by0 + in1, bw - in1 * 2, bh - in1 * 2);
  } else if (key === 'sudut') {
    /* SUDUT KAMERA — empat kurungan sudut gaya viewfinder */
    const L = Math.min(fs * 0.95, bw * 0.3), wl = lw(5);
    x.strokeStyle = AMB; x.lineWidth = wl;
    x.beginPath();
    x.moveTo(bx0, by0 + L); x.lineTo(bx0, by0); x.lineTo(bx0 + L, by0);
    x.moveTo(bx1 - L, by0); x.lineTo(bx1, by0); x.lineTo(bx1, by0 + L);
    x.moveTo(bx0, by1 - L); x.lineTo(bx0, by1); x.lineTo(bx0 + L, by1);
    x.moveTo(bx1 - L, by1); x.lineTo(bx1, by1); x.lineTo(bx1, by1 - L);
    x.stroke();
    x.fillStyle = CREAM + '.4)';
    x.fillRect(b.cx - 8 * u, by0, 16 * u, lw(2));
    x.fillRect(b.cx - 8 * u, by1 - lw(2), 16 * u, lw(2));
  } else if (key === 'pita') {
    /* PITA JUDUL — pita gelap dgn lipatan ujung + tepi emas */
    const fold = fs * 0.45;
    x.fillStyle = 'rgba(2,3,6,.55)';
    x.beginPath(); x.moveTo(bx0 - fold, by0); x.lineTo(bx0, by0); x.lineTo(bx0, by1); x.lineTo(bx0 - fold, by1); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(bx1 + fold, by0); x.lineTo(bx1, by0); x.lineTo(bx1, by1); x.lineTo(bx1 + fold, by1); x.closePath(); x.fill();
    x.fillStyle = 'rgba(6,8,13,.85)'; x.fillRect(bx0, by0, bw, bh);
    x.fillStyle = AMB;
    x.fillRect(bx0, by0, bw, lw(3)); x.fillRect(bx0, by1 - lw(3), bw, lw(3));
  } else if (key === 'sinema') {
    /* PITA SINEMA — pita letterbox gelap selebar layar + garis emas */
    x.fillStyle = 'rgba(2,3,6,.82)'; x.fillRect(0, by0, W, bh);
    x.fillStyle = AMB;
    x.fillRect(0, by0, W, lw(3)); x.fillRect(0, by1 - lw(3), W, lw(3));
  } else if (key === 'neon') {
    /* NEON MENYALA — bingkai membulat amber berpendar */
    const r = fs * 0.34;
    roundedRectPath(x, bx0, by0, bw, bh, r);
    x.shadowColor = AMB; x.shadowBlur = fs * 0.55;
    x.strokeStyle = 'rgba(247,166,0,.9)'; x.lineWidth = lw(5); x.stroke(); x.stroke();
    x.shadowBlur = fs * 0.9;
    x.strokeStyle = 'rgba(247,166,0,.35)'; x.lineWidth = lw(9); x.stroke();
    x.shadowBlur = 0;
    x.strokeStyle = 'rgba(255,240,214,.9)'; x.lineWidth = Math.max(1, lw(1.6)); x.stroke();
  } else if (key === 'klasik') {
    /* EMAS KLASIK — bingkai emas ganda + aksen sudut */
    x.strokeStyle = '#D9A441'; x.lineWidth = lw(6); x.strokeRect(bx0, by0, bw, bh);
    const in1 = fs * 0.24;
    x.strokeStyle = 'rgba(217,164,65,.55)'; x.lineWidth = lw(2);
    x.strokeRect(bx0 + in1, by0 + in1, bw - in1 * 2, bh - in1 * 2);
    const L = Math.min(fs * 0.6, bw * 0.2), g = in1;
    x.strokeStyle = '#D9A441'; x.lineWidth = lw(3);
    x.beginPath();
    x.moveTo(bx0 + g, by0 + g + L); x.lineTo(bx0 + g, by0 + g); x.lineTo(bx0 + g + L, by0 + g);
    x.moveTo(bx1 - g - L, by0 + g); x.lineTo(bx1 - g, by0 + g); x.lineTo(bx1 - g, by0 + g + L);
    x.moveTo(bx0 + g, by1 - g - L); x.lineTo(bx0 + g, by1 - g); x.lineTo(bx0 + g + L, by1 - g);
    x.moveTo(bx1 - g - L, by1 - g); x.lineTo(bx1 - g, by1 - g); x.lineTo(bx1 - g, by1 - g - L);
    x.stroke();
  } else if (key === 'panel') {
    /* PANEL MODERN — panel kaca gelap + bar emas kiri-kanan */
    x.fillStyle = 'rgba(7,9,14,.72)';
    roundedRectPath(x, bx0, by0, bw, bh, fs * 0.2); x.fill();
    x.strokeStyle = CREAM + '.18)'; x.lineWidth = lw(2); x.stroke();
    x.fillStyle = AMB;
    const bwid = Math.max(4, lw(6));
    x.fillRect(bx0 + fs * 0.22, by0 + fs * 0.22, bwid, bh - fs * 0.44);
    x.fillRect(bx1 - fs * 0.22 - bwid, by0 + fs * 0.22, bwid, bh - fs * 0.44);
  } else if (key === 'gradasi') {
    /* GRADASI PANAS — latar gelap lembut + pita gradasi amber→merah */
    x.fillStyle = 'rgba(4,5,9,.62)';
    roundedRectPath(x, bx0, by0, bw, bh, fs * 0.18); x.fill();
    const gh = Math.max(3, fs * 0.12);
    const gd = x.createLinearGradient(b.x0, 0, b.x1, 0);
    gd.addColorStop(0, '#F7A600'); gd.addColorStop(0.55, '#E85D2A'); gd.addColorStop(1, '#D7372D');
    x.fillStyle = gd;
    x.fillRect(b.x0, by1 - gh - fs * 0.06, Math.max(20 * u, b.x1 - b.x0), gh);
    x.fillStyle = CREAM + '.55)';
    x.fillRect(b.cx - 26 * u, by0 + fs * 0.16, 52 * u, lw(2));
  }
  x.restore();
}

/* ================================================================
   v2.12 — TRANSISI ANTAR BAGIAN (fade / slide)
   Karena tiap part adalah file MP4 sendiri, transisi diterapkan di
   AWAL dan AKHIR tiap part → saat part diputar berurutan, pergantian
   terasa halus seperti diklip satu proyek.
   - FADE  : masuk dari hitam di awal part + keluar ke hitam di akhir.
   - SLIDE : seluruh gambar masuk dari kanan + keluar ke kiri
             (canvas digambar ulang digeser; sisi kosong diisi hitam).
   Durasi memakai WAKTU OUTPUT (sudah dibagi kecepatan) supaya terasa
   sama enak di kecepatan berapa pun. Deterministik dari t → aman ekspor.
   ================================================================ */
function applyTransition(x, W, H, t) {
  const T = state.trans;
  if (!T || !T.mode || T.mode === 'off' || state.isAudio) return;
  const b = (typeof currentSegBounds === 'function' && currentSegBounds(t));
  if (!b) return;
  const d = clamp(T.dur || 0.8, 0.2, 2.5);
  const spd = clamp(state.speed || 1, 0.25, 4);
  const lin = (t - b.start) / spd, lout = (b.end - t) / spd;   /* detik output */
  if (T.mode === 'fade') {
    let a = 0;
    if (lin < d) a = 1 - lin / d;
    if (lout < d) a = Math.max(a, 1 - lout / d);
    if (a > 0.004) {
      x.save(); x.fillStyle = `rgba(0,0,0,${clamp(a, 0, 1).toFixed(3)})`;
      x.fillRect(0, 0, W, H); x.restore();
    }
  } else if (T.mode === 'slide') {
    let dx = 0;
    if (lin < d) dx = W * (1 - lin / d);          /* masuk dari kanan */
    else if (lout < d) dx = -W * (1 - lout / d);  /* keluar ke kiri */
    if (Math.abs(dx) > 0.5) {
      x.save();
      x.drawImage(x.canvas, dx, 0);               /* gambar seluruh komposisi digeser */
      x.restore();
      x.fillStyle = '#000';
      if (dx > 0) x.fillRect(0, 0, Math.ceil(dx), H);
      else x.fillRect(W + Math.floor(dx), 0, Math.ceil(-dx), H);
    }
  }
}

/* ================================================================
   v2.8 — FRAME NEON BERPUTAR (9:16 & 16:9)
   Garis neon mengelilingi pinggir video (rounded rect) dan terus
   berputar otomatis seperti gambar referensi: ada track redup
   mengikuti bingkai + pendar komet bercahaya yang menembus sudut.
   - PREVIEW  : fase memakai jam nyata → tetap berputar saat pause.
   - EKSPOR   : fase memakai waktu media (deterministik per frame,
     mulus & kontinu antar part paralel).
   Performa: track statis di-cache; pendar = 4 goresan dash aditif
   TANPA shadowBlur → aman untuk render per frame.
   ================================================================ */
const _neonTrackCache = new Map();
function neonRGBA(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function neonHue(phase, per, extra) {
  return `hsl(${((phase / per) * 360 + extra) % 360} 100% 62%)`;
}
function roundedRectPath(x, X, Y, W, H, r) {
  r = Math.min(r, W / 2 - 1, H / 2 - 1);
  x.beginPath();
  x.moveTo(X + r, Y);
  x.lineTo(X + W - r, Y); x.arcTo(X + W, Y, X + W, Y + r, r);
  x.lineTo(X + W, Y + H - r); x.arcTo(X + W, Y + H, X + W - r, Y + H, r);
  x.lineTo(X + r, Y + H); x.arcTo(X, Y + H, X, Y + H - r, r);
  x.lineTo(X, Y + r); x.arcTo(X, Y, X + r, Y, r);
  x.closePath();
}
/* dash dengan panjang tepat = keliling path → tepat SATU segmen per loop,
   mulus melintasi keempat sudut (dash berlanjut di seam path tertutup) */
function strokeDashSeg(x, per, start, len, style, width) {
  x.setLineDash([Math.max(1, len), Math.max(1, per - len)]);
  x.lineDashOffset = -((start % per) + per) % per;
  x.strokeStyle = style; x.lineWidth = width; x.stroke();
}
function buildNeonTrack(W, H, wpx, colKey, r, pad) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const col = colKey === 'rainbow' ? '#9fd4ff' : colKey;
  roundedRectPath(g, pad, pad, W - pad * 2, H - pad * 2, r);
  g.lineCap = 'round';
  g.shadowColor = col; g.shadowBlur = wpx * 2.4;
  g.strokeStyle = neonRGBA(col, 0.30); g.lineWidth = Math.max(1, wpx * 0.7);
  g.stroke(); g.stroke();
  g.shadowBlur = 0;
  g.strokeStyle = neonRGBA(col, 0.17); g.lineWidth = Math.max(1, wpx * 0.45);
  g.stroke();
  return c;
}
function drawNeonFrame(x, W, H, t, u, live) {
  const N = state.neon;
  const wpx = Math.max(2, Math.round((N.width || 7) * u * 1.2));
  const pad = wpx * 1.6 + 8 * u;
  const r = Math.round(Math.min(W, H) * 0.045);
  const rectW = W - pad * 2, rectH = H - pad * 2;
  const per = 2 * (rectW - 2 * r) + 2 * (rectH - 2 * r) + 2 * Math.PI * r;
  const speed = clamp(N.speed || 1, 0.2, 3);
  const now = live ? performance.now() / 1000 : (t || 0);
  const phase = ((now * speed * (per / 6.5)) % per + per) % per;  /* 1 putaran ± 6.5 dtk */

  /* 1) track statis (cache per ukuran+warna) */
  const ck = `nt|${W}x${H}|${wpx}|${N.color}|${r}|${Math.round(pad)}`;
  let track = _neonTrackCache.get(ck);
  if (!track) {
    track = buildNeonTrack(W, H, wpx, N.color, r, pad);
    _neonTrackCache.set(ck, track);
    if (_neonTrackCache.size > 8) _neonTrackCache.delete(_neonTrackCache.keys().next().value);
  }
  x.save();
  x.globalCompositeOperation = 'source-over';
  x.drawImage(track, 0, 0);

  /* 2) pendar komet berputar (aditif, tanpa shadowBlur — cepat) */
  const rainbow = N.color === 'rainbow';
  const col = rainbow ? '#ffffff' : N.color;
  const beam = per * 0.16, tail = per * 0.11;
  x.globalCompositeOperation = 'lighter';
  x.lineCap = 'round'; x.lineJoin = 'round';
  roundedRectPath(x, pad, pad, rectW, rectH, r);
  const drawBeam = (ph) => {
    /* ekor komet (3 lapis, makin dekat kepala makin terang) */
    strokeDashSeg(x, per, ph - tail * 2 - beam, beam + tail * 2, rainbow ? neonHue(ph, per, 0) : neonRGBA(col, 0.10), wpx * 2.6);
    strokeDashSeg(x, per, ph - tail - beam * 0.55, beam * 0.55 + tail, rainbow ? neonHue(ph, per, 0) : neonRGBA(col, 0.26), wpx * 1.8);
    /* kepala utama */
    strokeDashSeg(x, per, ph - beam, beam, rainbow ? neonHue(ph, per, 0) : neonRGBA(col, 0.72), wpx * 1.35);
    /* inti putih panas */
    strokeDashSeg(x, per, ph - beam * 0.55, beam * 0.55, rainbow ? neonHue(ph, per, 0) : 'rgba(255,255,255,.9)', Math.max(1.2, wpx * 0.5));
  };
  drawBeam(phase);
  if (N.dual) drawBeam((phase + per / 2) % per);
  x.restore();
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
  /* v2.9: progres waveform relatif terhadap rentang ekspor (bukan durasi penuh) */
  const rW = rangeInfo(), prog = clamp((t - rW.start) / rW.len, 0, 1);
  const bw = Math.max(2, Math.round(3 * u)), gap = Math.round(2 * u), n = Math.floor(W / (bw + gap));
  for (let i = 0; i < n; i++) {
    const v = p[Math.floor(i / n * p.length)] || 0, h = Math.max(2 * u, v * H * 0.3);
    x.fillStyle = (i / n) < prog ? '#F7A600' : 'rgba(160,175,190,.32)';
    x.fillRect(i * (bw + gap), mid - h / 2, bw, h);
  }
  x.fillStyle = '#F7A600'; x.fillRect(prog * W - 1 * u, H * 0.12, 2.5 * u, H * 0.76);
  x.font = `500 ${Math.round(20 * u)}px "JetBrains Mono"`; x.fillStyle = 'rgba(239,237,231,.5)';
  x.textAlign = 'left'; x.fillText('AUDIO ONLY · ' + (state.file ? state.file.name.toUpperCase() : ''), 24 * u, H * 0.085);
}
