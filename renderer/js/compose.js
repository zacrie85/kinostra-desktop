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
/* v3.16: PERAWATAN — kosongkan seluruh cache lapisan compose (dipanggil
   tombol OPTIMASI / BERSIHKAN CACHE di modul 16; aman kapan pun —
   cache dibangun ulang otomatis pada frame berikutnya) */
function clearComposeCaches() {
  _layerCache.clear();
  try { _neonTrackCache.clear(); } catch (e) { }
  try { window.__kinoCacheCleared = (window.__kinoCacheCleared || 0) + 1; } catch (e) { }
}
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
  /* v2.6: preview = bucket waktu (latar ikut video); ekspor = statis
     v3.20: saat MEMUTAR bucket 8 dtk (dari 1,6) — blur 1080×1920 tiap
     1,6 dtk adalah ledakan kerja raster di GPU/CPU lemah dan ikut
     menyumbang "hang saat diputar" pada film panjang; latar blur
     hampir tak berubah, 8 dtk tak terlihat bedanya */
  const playing = tLive != null && typeof videoEl !== 'undefined' && videoEl && !videoEl.paused;
  const step = playing ? 8 : 1.6;
  const bucket = tLive == null ? 's' : 'b' + Math.floor(tLive / step);
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

/* ---------- KOMPONEN KOMPOSISI ----------
   v3.12: opts.noText = true → HANYA latar video murni (TANPA judul,
   PART, deskripsi, subtitel, track, watermark, frame neon, transisi).
   Dipakai pengambilan frame utk LATAR COVER — supaya cover bersih:
   satu-satunya tulisan di cover = judul + part dari PENGATURAN COVER,
   bukan teks overlay video yang ikut tertangkap di screenshot. */
function drawComposition(x, W, H, t, opts) {
  const noText = !!(opts && opts.noText);
  /* v3.20: jalur NATIVE — video asli tampil lewat elemen <video> di
     belakang kanvas; kanvas menggambar overlay saja (tanpa latar, tanpa
     drawImage video, tanpa filter). canNativePlay() di ui.js yang
     memutuskan; di sini hanya menurut. */
  const native = !!(opts && opts.native);
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
    const spk = native ? null : (typeof spkCropAt === 'function')
      ? spkCropAt(vid.videoWidth, vid.videoHeight, W, H, t) : null;
    const fit = native
      ? { x: 0, y: 0, w: W, h: H, covers: true }
      : (spk
        ? { x: 0, y: 0, w: W, h: H, covers: true }
        : videoFrameRect(vid.videoWidth, vid.videoHeight, W, H, t));
    /* v2.12: frame bergaya punya LATAR SENDIRI bertema (mis. merah bioskop,
       biru panel) — menggantikan blur saat frame aktif, persis referensi.
       v3.1: zoom pembicara aktif → video full-bleed, tanpa latar.
       v3.20: native → tanpa latar apa pun (video elemen sudah tampil). */
    const useBlur = !spk && !native && state.ratio === '9:16' && state.bgMode === 'blur' && !fit.covers && !(FST && FST.bg);
    if (!spk && !native) {
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
       dgn setelan manual VFX; lapisan tint tipis hanya di area video
       v3.20: native → LOMBAT semuanya (video asli sudah tampil dari
       elemen <video>; drawImage video per frame adalah titik sinkron GPU
       penyebab hang saat memutar di GPU lemah) */
    const V = state.vfx;
    const CF = (typeof COLORFILTERS !== 'undefined' && COLORFILTERS.find(c => c.k === state.colorFilter)) || null;
    if (!native) {
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
    }
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
  if (!noText && !state._noPart && state.partShow !== 'off') {
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
  /* v3.14→v3.27: UKURAN TULISAN PART DI VIDEO — faktor skala 0.1–2.5
     (v3.27: bisa turun sampai 10%; 1 = normal); berlaku utk bumper intro &
     label pojok: font, spasi huruf, garis hiasan & offset vertikal ikut
     diskala agar proporsional (animasi masuk part ikut akurat karena fsPx
     & ls dikirim terskala ke ncTextState helpers).
     v3.27: WARNA TULISAN PART — state.partColor ('' = OTOMATIS putih
     gading) menimpa warna teks di kedua mode; garis hias & sub-info tetap
     gaya bawaan. Pratinjau = ekspor persis (satu mesin gambar). */
  const _sP = clamp(state.partSize || 1, 0.1, 2.5);
  const _pA = (state.partAnim && state.partAnim !== 'off' && _tinP < 1.6)
    ? ncTextState(state.partAnim, _tinP, 1e9, seg * 131 + 7 + Math.floor(t * 30)) : null;
  if (state.partShow === 'intro') {
    /* v3.25 JALUR VIDSPLIT: pratinjau native = overlay statik — label masuk
       langsung keadaan akhir (tanpa animasi); ekspor tetap beranimasi penuh */
    let a = native ? 1 : clamp(1 - _tinP / 1.6, 0, 1);
    if (_pA && !native) a = Math.min(a, _pA.alpha);
    if (a > 0.004) {
      x.save(); x.globalAlpha = a; x.textAlign = 'center';
      const cx = W / 2 + ppx * W * 0.30;
      const cy = H * clamp(0.42 + ppy * 0.40, 0.085, 0.90);
      if (_pA && !native) {
        if (_pA.scale !== 1) { x.translate(cx, cy); x.scale(_pA.scale, _pA.scale); x.translate(-cx, -cy); }
        if (_pA.dy) x.translate(0, _pA.dy * H);
      }
      x.fillStyle = '#F7A600'; x.fillRect(cx - 60 * u * _sP, cy - 84 * u * _sP, 120 * u * _sP, 3 * u * _sP);
      x.fillStyle = state.partColor || '#F2F0EA'; x.font = `${Math.round(112 * u * _sP)}px "${F}"`;
      const _pTxt = `${state.partPrefix} ${String(seg + 1).padStart(2, '0')}`;
      /* v3.28: FRAME PART — hiasan futuristik transparan di sekeliling teks
         part (katalog PARTFRAMES); digambar sebelum teks & ikut alpha intro;
         lebar teks diukur dulu supaya bingkainya pas (font sudah di-set) */
      if (state.partFrame === 'png' && state.partImg && state.partImg.data) {
        drawImgFrame(x, W, H, state.partImg);   /* v3.34: bingkai gambar sendiri */
      } else if (state.partFrame && state.partFrame !== 'off') {
        const _pw = measureSpaced(x, _pTxt, 8 * u * _sP);
        drawPartFrame(x, W, H, state.partFrame, {
          cx, x0: cx - _pw / 2 - 18 * u * _sP, x1: cx + _pw / 2 + 18 * u * _sP,
          y0: cy + 40 * u * _sP - 112 * u * _sP * 0.92, y1: cy + 40 * u * _sP + 112 * u * _sP * 0.30,
          fs: 112 * u * _sP, u
        });
      }
      ncAnimSpacedLine(x, _pA, _pTxt, cx, cy + 40 * u * _sP, 8 * u * _sP, 112 * u * _sP,
        (t2, ls2, dx) => drawSpaced(x, t2, cx + dx, cy + 40 * u * _sP, ls2, 'center'), W);
      x.fillStyle = 'rgba(239,237,231,.55)'; x.font = `500 ${Math.round(24 * u * _sP)}px "JetBrains Mono"`;
      x.fillText(`SEGMEN ${seg + 1} / ${total} · ${Math.round(state.splitSec)} DTK`, cx, cy + 92 * u * _sP);
      x.fillStyle = '#F7A600'; x.fillRect(cx - 60 * u * _sP, cy + 116 * u * _sP, 120 * u * _sP, 3 * u * _sP);
      x.restore();
    }
  } else {
    x.save();
    const px = W * clamp(0.05 + ppx * 0.35, 0.02, 0.68);
    const py = H * clamp(0.925 + ppy * 0.88, 0.062, 0.985);
    if (_pA && !native) {
      x.globalAlpha = _pA.alpha;
      if (_pA.scale !== 1) { x.translate(px, py); x.scale(_pA.scale, _pA.scale); x.translate(-px, -py); }
      if (_pA.dy) x.translate(0, _pA.dy * H);
    }
    x.fillStyle = '#F7A600'; x.fillRect(px, py - 40 * u * _sP, 4 * u * _sP, 50 * u * _sP);
    x.fillStyle = state.partColor || '#F2F0EA'; x.font = `${Math.round(46 * u * _sP)}px "${F}"`;
    const _cTxt = `${state.partPrefix} ${String(seg + 1).padStart(2, '0')}`;
    /* v3.28: FRAME PART utk label pojok — membungkus strip amber + teks +
       counter (/total); digambar sebelum teks, ikut alpha animasi masuk */
    if (state.partFrame === 'png' && state.partImg && state.partImg.data) {
      drawImgFrame(x, W, H, state.partImg);   /* v3.34: bingkai gambar sendiri (pojok) */
    } else if (state.partFrame && state.partFrame !== 'off') {
      const _cw = measureSpaced(x, _cTxt, 3 * u * _sP);
      drawPartFrame(x, W, H, state.partFrame, {
        cx: px + 16 * u * _sP + _cw / 2,
        x0: px - 8 * u * _sP, x1: px + 16 * u * _sP + _cw + 42 * u * _sP,
        y0: py - 46 * u * _sP * 0.92, y1: py + 46 * u * _sP * 0.30,
        fs: 46 * u * _sP, u
      });
    }
    const w = drawSpaced(x, ncAnimSpacedTxt(x, _pA, _cTxt), px + 16 * u * _sP, py, 3 * u * _sP + (_pA && _pA.kind === 'tracking' ? (1 - ncEaseOut(_pA.inP || 0)) * 46 * u * _sP * 0.5 : 0), 'left');
    x.fillStyle = 'rgba(239,237,231,.5)'; x.font = `500 ${Math.round(20 * u * _sP)}px "JetBrains Mono"`;
    x.fillText(`/${String(total).padStart(2, '0')}`, px + 16 * u * _sP + w + 10 * u * _sP, py);
    x.restore();
  }
  }
  /* --- JUDUL & DESKRIPSI (v2.3 ukuran · v2.6 posisi digeser atas/bawah)
         v3.9: POSISI PENUH — slider menjangkau PALING BAWAH layar (dulu
         terhenti di 46% tinggi) + 10 FRAME FITURISTIK di sekeliling judul
         (state.titleFrame, katalog TITLEFRAMES — hiasan DI DALAM VIDEO,
         pratinjau = hasil ekspor persis karena satu mesin gambar) --- */
  let yTitleBase = 0;
  if (!noText && state.titleOn && state.title) {
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
    /* v3.25 JALUR VIDSPLIT: pratinjau native = judul statik (tanpa animasi) */
    const tA = (!native && _aKey && (_aKey === 'neon' || _tlA < 1.6))
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
      if (tfKey === 'png' && state.titleImg && state.titleImg.data) {
        drawImgFrame(x, W, H, state.titleImg);   /* v3.34: bingkai gambar sendiri */
      } else if (tfKey !== 'off') {
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
  if (!noText && state.descOn && state.desc.trim()) {
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
  if (!noText && state.subsOn && state.subs.length) {
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
  if (!noText) drawTrack(x, W, H, t, u);
  /* --- UPGRADE: WATERMARK --- */
  if (!noText) drawWatermark(x, W, H, u);
  /* --- v2.8: FRAME NEON BERPUTAR (di lapisan paling atas) --- */
  if (!noText && state.neon && state.neon.on) drawNeonFrame(x, W, H, t, u, compSrc() === videoEl);
  /* --- v2.12: TRANSISI ANTAR BAGIAN (paling atas semuanya) --- */
  if (!noText) applyTransition(x, W, H, t);
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
  /* v3.28: 5 FRAME ELEGAN TRANSPARAN (minta kawan) — kaca tipis, garis
     putih bening; tanpa pita tebal, judul tetap bernapas di atas video */
  else if (key === 'kaca') {
    /* KACA HALUS — panel kaca bening sangat tipis + garis putih lembut */
    x.fillStyle = 'rgba(255,255,255,.055)';
    roundedRectPath(x, bx0, by0, bw, bh, fs * 0.22); x.fill();
    x.strokeStyle = 'rgba(255,255,255,.38)'; x.lineWidth = lw(1.8); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,.16)';
    x.beginPath(); x.moveTo(bx0 + bw * 0.12, by0 + lw(2.6)); x.lineTo(bx1 - bw * 0.12, by0 + lw(2.6)); x.stroke();
  } else if (key === 'kristal') {
    /* KRISTAL BENING — kurungan sudut putih tipis panjang + kilau atas */
    const L = Math.min(fs * 1.15, bw * 0.34);
    x.strokeStyle = 'rgba(255,255,255,.72)'; x.lineWidth = lw(2.2);
    x.beginPath();
    x.moveTo(bx0, by0 + L); x.lineTo(bx0, by0); x.lineTo(bx0 + L, by0);
    x.moveTo(bx1 - L, by0); x.lineTo(bx1, by0); x.lineTo(bx1, by0 + L);
    x.moveTo(bx0, by1 - L); x.lineTo(bx0, by1); x.lineTo(bx0 + L, by1);
    x.moveTo(bx1 - L, by1); x.lineTo(bx1, by1); x.lineTo(bx1, by1 - L);
    x.stroke();
    x.strokeStyle = 'rgba(255,255,255,.30)'; x.lineWidth = lw(1.2);
    x.beginPath(); x.moveTo(b.cx - bw * 0.14, by0); x.lineTo(b.cx + bw * 0.14, by0); x.stroke();
  } else if (key === 'bening') {
    /* GARIS BENING — hairline putih membulat + berlian kecil kiri-kanan */
    roundedRectPath(x, bx0, by0, bw, bh, fs * 0.26);
    x.strokeStyle = 'rgba(255,255,255,.52)'; x.lineWidth = lw(1.6); x.stroke();
    const my = (by0 + by1) / 2, ds = fs * 0.16;
    x.fillStyle = 'rgba(255,255,255,.75)';
    x.beginPath(); x.moveTo(bx0 - ds, my); x.lineTo(bx0, my - ds); x.lineTo(bx0 + ds, my); x.lineTo(bx0, my + ds); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(bx1 - ds, my); x.lineTo(bx1, my - ds); x.lineTo(bx1 + ds, my); x.lineTo(bx1, my + ds); x.closePath(); x.fill();
  } else if (key === 'mewah') {
    /* MEWAH BENING — kaca transparan + hairline emas di dalam */
    x.fillStyle = 'rgba(255,255,255,.05)';
    roundedRectPath(x, bx0, by0, bw, bh, fs * 0.20); x.fill();
    x.strokeStyle = 'rgba(255,255,255,.30)'; x.lineWidth = lw(1.6); x.stroke();
    const in2 = fs * 0.22;
    roundedRectPath(x, bx0 + in2, by0 + in2, bw - in2 * 2, bh - in2 * 2, fs * 0.14);
    x.strokeStyle = 'rgba(217,164,65,.55)'; x.lineWidth = lw(1.2); x.stroke();
  } else if (key === 'etere') {
    /* ETERE — gradasi putih pudar kiri-kanan + garis pusat halus */
    const gw = Math.max(30 * u, bw * 0.24);
    const gl = x.createLinearGradient(bx0, 0, bx0 + gw, 0);
    gl.addColorStop(0, 'rgba(255,255,255,.20)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gl; x.fillRect(bx0, by0, gw, bh);
    const gr = x.createLinearGradient(bx1 - gw, 0, bx1, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,.20)');
    x.fillStyle = gr; x.fillRect(bx1 - gw, by0, gw, bh);
    x.fillStyle = 'rgba(255,255,255,.38)';
    x.fillRect(bx0 + gw, by0, bw - gw * 2, lw(1.4));
    x.fillRect(bx0 + gw, by1 - lw(1.4), bw - gw * 2, lw(1.4));
  }
  x.restore();
}

/* ================================================================
   v3.34 — FRAME MANUAL PNG/JPG utk JUDUL & PART (kunci 'png' di
   katalog TITLEFRAMES/PARTFRAMES). Gambar pilihan sendiri digambar
   UTUH pada rect fraksi video (state.titleImg / state.partImg:
   x,y = pojok kiri-atas; w,h = lebar/tinggi, 0..1) — digeser & 
   ditarik langsung di pratinjau lewat lapisan drag (ui.js) atau
   diisi angka. Teks tetap digambar DI ATAS gambar (bingkai di
   belakang); ikut alpha animasi masuk karena dipanggil setelah
   globalAlpha diset di blok judul/part. Datar (stretch) sesuai
   lebar & tinggi yang dipilih — pratinjau = ekspor persis.
   ================================================================ */
function drawImgFrame(x, W, H, d) {
  if (!d || !d.el || !d.el.complete || !d.el.naturalWidth) return;
  x.drawImage(d.el, d.x * W, d.y * H, d.w * W, d.h * H);
}

/* ================================================================
   v3.28 — 15 FRAME FUTURISTIK ELEGAN TRANSPARAN utk LABEL PART
   (katalog PARTFRAMES di core.js). Hiasan di sekeliling tulisan
   PART/EPISODE — bumper intro & label pojok — digambar di
   drawComposition (pratinjau = ekspor persis). Deterministik tanpa
   animasi → aman utk ekspor. b = { cx, x0, x1, y0, y1, fs, u }
   ================================================================ */
function drawPartFrame(x, W, H, key, b) {
  const CREAM = 'rgba(242,240,234,', CYAN = 'rgba(158,222,235,', u = b.u;
  const fs = Math.max(6, b.fs);
  const x0 = Math.max(4 * u, b.x0), x1 = Math.min(W - 4 * u, b.x1);
  const y0 = Math.max(4 * u, b.y0), y1 = Math.min(H - 4 * u, b.y1);
  const bw = Math.max(8 * u, x1 - x0), bh = Math.max(8 * u, y1 - y0);
  const lw = m => Math.max(1.4, m * fs / 46);
  x.save(); x.lineJoin = 'round'; x.lineCap = 'round';
  if (key === 'hud') {
    /* HUD SUDUT — 4 kurungan putih tipis + tick kecil di tengah atas-bawah */
    const L = Math.min(fs * 0.72, bw * 0.26);
    x.strokeStyle = CREAM + '.85)'; x.lineWidth = lw(3);
    x.beginPath();
    x.moveTo(x0, y0 + L); x.lineTo(x0, y0); x.lineTo(x0 + L, y0);
    x.moveTo(x1 - L, y0); x.lineTo(x1, y0); x.lineTo(x1, y0 + L);
    x.moveTo(x0, y1 - L); x.lineTo(x0, y1); x.lineTo(x0 + L, y1);
    x.moveTo(x1 - L, y1); x.lineTo(x1, y1); x.lineTo(x1, y1 - L);
    x.stroke();
    x.fillStyle = CYAN + '.75)';
    x.fillRect(b.cx - 6 * u, y0 - lw(1.6), 12 * u, lw(3.2));
    x.fillRect(b.cx - 6 * u, y1 - lw(1.6), 12 * u, lw(3.2));
  } else if (key === 'garishud') {
    /* GARIS HUD — kotak hairline + tick tengah + bar samping tipis */
    x.strokeStyle = CREAM + '.5)'; x.lineWidth = lw(1.6); x.strokeRect(x0, y0, bw, bh);
    x.fillStyle = CREAM + '.85)';
    x.fillRect(b.cx - 10 * u, y0, 20 * u, lw(2.6));
    x.fillRect(b.cx - 10 * u, y1 - lw(2.6), 20 * u, lw(2.6));
    x.fillStyle = CREAM + '.28)';
    x.fillRect(x0 + lw(3), y0 + lw(3), lw(2), bh - lw(6));
    x.fillRect(x1 - lw(5), y0 + lw(3), lw(2), bh - lw(6));
  } else if (key === 'kapsul') {
    /* KAPSUL BENING — pil kaca membulat penuh + hairline */
    x.fillStyle = 'rgba(7,9,14,.40)';
    roundedRectPath(x, x0, y0, bw, bh, bh / 2); x.fill();
    x.strokeStyle = CREAM + '.55)'; x.lineWidth = lw(1.8); x.stroke();
    x.strokeStyle = CREAM + '.18)'; x.lineWidth = lw(1);
    roundedRectPath(x, x0 + fs * 0.10, y0 + fs * 0.10, bw - fs * 0.20, bh - fs * 0.20, (bh - fs * 0.20) / 2); x.stroke();
  } else if (key === 'kurung') {
    /* KURUNG TEKNO — kurung besar [ ] di kiri-kanan teks */
    const g = fs * 0.30;
    x.strokeStyle = CREAM + '.9)'; x.lineWidth = lw(3.4);
    x.beginPath();
    x.moveTo(x0 - g + bh * 0.35, y0); x.lineTo(x0 - g, y0); x.lineTo(x0 - g, y1); x.lineTo(x0 - g + bh * 0.35, y1);
    x.moveTo(x1 + g - bh * 0.35, y0); x.lineTo(x1 + g, y0); x.lineTo(x1 + g, y1); x.lineTo(x1 + g - bh * 0.35, y1);
    x.stroke();
  } else if (key === 'chipdata') {
    /* CHIP DATA — kotak tag kecil di kiri + garis bawah selebar teks */
    const s = fs * 0.42;
    x.strokeStyle = CREAM + '.8)'; x.lineWidth = lw(2.4);
    x.strokeRect(x0, y0 + (bh - s) / 2, s, s);
    x.fillStyle = CYAN + '.8)';
    x.fillRect(x0 + s * 0.28, y0 + (bh - s) / 2 + s * 0.28, s * 0.44, s * 0.44);
    x.fillStyle = CREAM + '.55)';
    x.fillRect(x0 + s + fs * 0.22, y1 - lw(2), Math.max(20 * u, x1 - x0 - s - fs * 0.22), lw(2));
  } else if (key === 'hexa') {
    /* SEGI ENAM — panel kaca dgn sisi kiri-kanan miring */
    const ins = fs * 0.34, mh = (y0 + y1) / 2;
    x.fillStyle = 'rgba(7,9,14,.38)';
    x.beginPath();
    x.moveTo(x0 + ins, y0); x.lineTo(x1 - ins, y0); x.lineTo(x1, mh); x.lineTo(x1 - ins, y1); x.lineTo(x0 + ins, y1); x.lineTo(x0, mh); x.closePath(); x.fill();
    x.strokeStyle = CREAM + '.55)'; x.lineWidth = lw(1.8); x.stroke();
  } else if (key === 'tape') {
    /* PITA TEKNO — strip transparan ujung miring (parallelogram) */
    const sl = fs * 0.36;
    x.fillStyle = 'rgba(7,9,14,.42)';
    x.beginPath(); x.moveTo(x0 + sl, y0); x.lineTo(x1, y0); x.lineTo(x1 - sl, y1); x.lineTo(x0, y1); x.closePath(); x.fill();
    x.strokeStyle = CREAM + '.5)'; x.lineWidth = lw(1.8); x.stroke();
  } else if (key === 'duagaris') {
    /* GARIS GANDA HUD — dua bingkai hairline bertumpuk halus */
    x.strokeStyle = CREAM + '.45)'; x.lineWidth = lw(1.6); x.strokeRect(x0, y0, bw, bh);
    const g2 = fs * 0.14;
    x.strokeStyle = CREAM + '.22)'; x.lineWidth = lw(1.2);
    x.strokeRect(x0 - g2, y0 - g2, bw + g2 * 2, bh + g2 * 2);
  } else if (key === 'orbit') {
    /* TITIK ORBIT — titik di 4 sudut + garis hairline atas-bawah */
    x.strokeStyle = CREAM + '.4)'; x.lineWidth = lw(1.4);
    x.beginPath();
    x.moveTo(x0 + bw * 0.2, y0); x.lineTo(x1 - bw * 0.2, y0);
    x.moveTo(x0 + bw * 0.2, y1); x.lineTo(x1 - bw * 0.2, y1);
    x.stroke();
    x.fillStyle = CREAM + '.9)';
    const dr = Math.max(2, lw(2.4));
    [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].forEach(p => { x.beginPath(); x.arc(p[0], p[1], dr, 0, 7); x.fill(); });
  } else if (key === 'fase') {
    /* FASE SUDUT — kurungan L kiri-atas & kanan-bawah + diagonal 45° */
    const L = Math.min(fs * 0.55, bw * 0.18);
    x.strokeStyle = CREAM + '.85)'; x.lineWidth = lw(3);
    x.beginPath();
    x.moveTo(x0, y0 + L); x.lineTo(x0, y0); x.lineTo(x0 + L, y0);
    x.moveTo(x1 - L, y1); x.lineTo(x1, y1); x.lineTo(x1, y1 - L);
    x.stroke();
    x.strokeStyle = CYAN + '.6)'; x.lineWidth = lw(2);
    x.beginPath();
    x.moveTo(x1 - L, y0); x.lineTo(x1, y0 + L);
    x.moveTo(x0 + L, y1); x.lineTo(x0, y1 - L);
    x.stroke();
  } else if (key === 'sistem') {
    /* PANEL SISTEM — panel kaca + bar aksen kiri + notch di kanan */
    x.fillStyle = 'rgba(7,9,14,.45)';
    roundedRectPath(x, x0, y0, bw, bh, fs * 0.12); x.fill();
    x.strokeStyle = CREAM + '.3)'; x.lineWidth = lw(1.4); x.stroke();
    x.fillStyle = CYAN + '.8)';
    x.fillRect(x0 + fs * 0.14, y0 + fs * 0.14, Math.max(3, lw(4)), bh - fs * 0.28);
    x.fillStyle = CREAM + '.5)';
    x.fillRect(x1 - fs * 0.34, y0 + fs * 0.14, fs * 0.20, lw(2));
  } else if (key === 'sinar') {
    /* SINAR SAMPING — gradasi putih pudar kiri-kanan di belakang teks */
    const gw = bw * 0.30;
    const gl = x.createLinearGradient(x0, 0, x0 + gw, 0);
    gl.addColorStop(0, CREAM + '.22)'); gl.addColorStop(1, CREAM + '0)');
    x.fillStyle = gl; x.fillRect(x0, y0, gw, bh);
    const gr = x.createLinearGradient(x1 - gw, 0, x1, 0);
    gr.addColorStop(0, CREAM + '0)'); gr.addColorStop(1, CREAM + '.22)');
    x.fillStyle = gr; x.fillRect(x1 - gw, y0, gw, bh);
    x.fillStyle = CREAM + '.45)';
    x.fillRect(x0 + gw + fs * 0.2, y0, bw - gw * 2 - fs * 0.4, lw(1.6));
    x.fillRect(x0 + gw + fs * 0.2, y1 - lw(1.6), bw - gw * 2 - fs * 0.4, lw(1.6));
  } else if (key === 'jaring') {
    /* JARING TITIK — bingkai putus-putus halus (dot grid) */
    x.strokeStyle = CREAM + '.6)'; x.lineWidth = lw(1.5);
    x.setLineDash([fs * 0.16, fs * 0.12]);
    x.strokeRect(x0, y0, bw, bh);
    x.setLineDash([]);
  } else if (key === 'murni') {
    /* GARIS MURNI — satu garis bawah tipis + notch tengah */
    x.fillStyle = CREAM + '.7)';
    x.fillRect(x0, y1 - lw(1.6), bw, lw(1.6));
    x.fillStyle = CREAM + '.95)';
    x.fillRect(b.cx - 9 * u, y1 - lw(3.4), 18 * u, lw(3.4));
  } else if (key === 'berkas') {
    /* BERKAS CAHAYA — kaca tipis + garis cahaya memudar di bawah teks */
    x.fillStyle = 'rgba(7,9,14,.30)';
    roundedRectPath(x, x0, y0, bw, bh, fs * 0.16); x.fill();
    x.strokeStyle = CREAM + '.22)'; x.lineWidth = lw(1.2); x.stroke();
    const gl2 = x.createLinearGradient(x0, 0, x1, 0);
    gl2.addColorStop(0, CREAM + '0)'); gl2.addColorStop(0.5, CREAM + '.8)'); gl2.addColorStop(1, CREAM + '0)');
    x.fillStyle = gl2;
    x.fillRect(x0 + bw * 0.06, y1 - lw(2.2), bw * 0.88, lw(2.2));
    x.shadowColor = CREAM + '.6)'; x.shadowBlur = fs * 0.30;
    x.fillRect(x0 + bw * 0.06, y1 - lw(2.2), bw * 0.88, lw(2.2));
    x.shadowBlur = 0;
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
