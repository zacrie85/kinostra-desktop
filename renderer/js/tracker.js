/* ================================================================
   KINOSTRA DESKTOP — tracker.js (v2.6 · TRACKER PINTAR)
   Pelacak objek optik gaya grafis MotoGP.

   v2.6 — kenapa dulu tracking "tidak mengikuti objek":
   1. Template kecil (26px) berisi BANYAK latar belakang → saat objek
      bergerak, NCC malah cocok dengan latar → kotak tidak pindah.
   2. Template adaptif melebur perlahan ke apapun yang dilewati
      (drift) → identitas asli objek hilang.
   3. Tidak ada prediksi gerak → objek cepat keluar dari jendela cari.
   4. Kalau hilang, tidak pernah dicari ulang → tertinggal selamanya.

   Solusi v2.6 (semua lokal, tanpa model AI besar):
   - TEMPLATE ASLI diawetkan (identitas objek tidak pernah lupa) —
     inilah "AI kemiripan": pencocokan kemiripan visual terhadap
     template asli, dipakai untuk RE-IDENTIFIKASI.
   - Prediksi kecepatan (vx,vy) → jendela cari mengikuti arah gerak.
   - Pencarian MULTI-SKALA (0.82× / 1× / 1.22×) → objek mendekat/
     menjauh tetap terkunci.
   - NCC berbobot-pusat (pusat template lebih penting daripada tepi)
     → latar belakang tidak lagi mendominasi.
   - Skor rendah → PENCARIAN GLOBAL seluruh frame dengan template
     asli → objek yang lompat posisi langsung dikejar lagi.
   - Adaptasi template lambat (0.06) & hanya saat skor tinggi.
   ================================================================ */
'use strict';

const TW = 320; let THt = 180;
const tcv = document.createElement('canvas'), tctx = tcv.getContext('2d', { willReadFrequently: true });

function getGray() {
  const vw = videoEl.videoWidth || 16, vh = videoEl.videoHeight || 9;
  THt = Math.max(2, Math.round(TW * vh / vw));
  if (tcv.width !== TW || tcv.height !== THt) { tcv.width = TW; tcv.height = THt; }
  tctx.drawImage(videoEl, 0, 0, TW, THt);
  const d = tctx.getImageData(0, 0, TW, THt).data, g = new Float32Array(TW * THt);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114;
  return g;
}
function tplStats(t) { let s = 0, s2 = 0; for (let i = 0; i < t.length; i++) { s += t[i]; s2 += t[i] * t[i]; } const n = t.length, m = s / n; return { m, v: Math.max(1e-6, s2 / n - m * m) }; }

/* ubah ukuran template (bilinear) untuk pencarian multi-skala */
function scaleTpl(tpl, tw, th, s) {
  if (Math.abs(s - 1) < 0.02) return { tpl, w: tw, h: th };
  const w2 = Math.max(8, Math.round(tw * s)), h2 = Math.max(8, Math.round(th * s));
  const out = new Float32Array(w2 * h2);
  const g = (yy, xx) => tpl[clamp(yy, 0, th - 1) * tw + clamp(xx, 0, tw - 1)];
  for (let y = 0; y < h2; y++) {
    const sy = (y + 0.5) / s - 0.5, y0 = Math.floor(sy), fy = clamp(sy - y0, 0, 1);
    for (let x = 0; x < w2; x++) {
      const sx = (x + 0.5) / s - 0.5, x0 = Math.floor(sx), fx = clamp(sx - x0, 0, 1);
      out[y * w2 + x] = g(y0, x0) * (1 - fx) * (1 - fy) + g(y0, x0 + 1) * fx * (1 - fy)
        + g(y0 + 1, x0) * (1 - fx) * fy + g(y0 + 1, x0 + 1) * fx * fy;
    }
  }
  return { tpl: out, w: w2, h: h2 };
}

/* bobot pusat: pixel pusat template lebih berbobot daripada tepi —
   objek di tengah kotak, latar di tepi tidak mendominasi skor.
   Total bobot = 1 (dipakai untuk NCC berbobot). */
function centerWeight(w, h) {
  const m = new Float32Array(w * h);
  const cx = (w - 1) / 2, cy = (h - 1) / 2, mx = Math.max(cx, cy, 1);
  let s = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = Math.abs(x - cx) / mx, dy = Math.abs(y - cy) / mx;
    const v = 0.4 + 1.6 * Math.max(0, 1 - (dx * dx + dy * dy) / 2);
    m[y * w + x] = v; s += v;
  }
  for (let i = 0; i < m.length; i++) m[i] /= s;
  return m;
}

/* momen berbobot template — dihitung SEKALI per pencarian (cepat) */
function tplMoments(tpl, wt) {
  let tm = 0, tv = 0;
  for (let i = 0; i < tpl.length; i++) tm += wt[i] * tpl[i];
  for (let i = 0; i < tpl.length; i++) { const d = tpl[i] - tm; tv += wt[i] * d * d; }
  return { tm, tv: Math.max(1e-9, tv) };
}

/* korelasi NCC berbobot pada satu posisi (px,py = pojok kiri-atas)
   r = Σw(g−ḡ)(t−t̄) / √(Σw(g−ḡ)² · Σw(t−t̄)²)  ∈ [−1, 1] */
function nccAt(g, TWf, THf, tpl, wt, w, h, px, py, tmom) {
  if (px < 0 || py < 0 || px + w > TWf || py + h > THf) return -2;
  let wg = 0, wg2 = 0;
  for (let y = 0; y < h; y++) {
    let o = (py + y) * TWf + px, oi = y * w;
    for (let x = 0; x < w; x++) { const v = g[o + x], wv = wt[oi + x]; wg += wv * v; wg2 += wv * v * v; }
  }
  const vg = Math.max(1e-9, wg2 - wg * wg);
  let cov = 0;
  for (let y = 0; y < h; y++) {
    let o = (py + y) * TWf + px, oi = y * w;
    for (let x = 0; x < w; x++) cov += wt[oi + x] * g[o + x] * tpl[oi + x];
  }
  cov -= wg * tmom.tm;
  return cov / Math.sqrt(vg * tmom.tv);
}

/* pencarian kasar + halus di sekitar (cx,cy) — cx,cy = pojok kiri-atas awal */
function nccSearch(g, tpl, w, h, cx, cy, R, step) {
  const wt = centerWeight(w, h), tmom = tplMoments(tpl, wt);
  let best = { x: cx, y: cy, s: -2 };
  const evalPos = (px, py) => { const sc = nccAt(g, TW, THt, tpl, wt, w, h, px, py, tmom); if (sc > best.s) best = { x: px, y: py, s: sc }; };
  for (let dy = -R; dy <= R; dy += step) for (let dx = -R; dx <= R; dx += step) evalPos(cx + dx, cy + dy);
  const bx = best.x, by = best.y;
  for (let dy = -step; dy <= step; dy++) for (let dx = -step; dx <= step; dx++) evalPos(bx + dx, by + dy);
  return best;
}

/* pencarian GLOBAL seluruh frame (re-identifikasi kemiripan) */
function nccGlobal(g, tpl, w, h) {
  const wt = centerWeight(w, h), tmom = tplMoments(tpl, wt);
  let best = { x: 0, y: 0, s: -2 };
  const step = 4;
  for (let py = 0; py + h <= THt; py += step) for (let px = 0; px + w <= TW; px += step) {
    const sc = nccAt(g, TW, THt, tpl, wt, w, h, px, py, tmom);
    if (sc > best.s) best = { x: px, y: py, s: sc };
  }
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const px = clamp(best.x + dx, 0, TW - w), py = clamp(best.y + dy, 0, THt - h);
    const sc = nccAt(g, TW, THt, tpl, wt, w, h, px, py, tmom);
    if (sc > best.s) best = { x: px, y: py, s: sc };
  }
  return best;
}

function captureTarget(nx, ny) {
  if (state.isAudio || !videoEl.videoWidth) { toast('Mode bidik hanya untuk video', 'err'); return; }
  const g = getGray(), tr = state.track, tw = 30, th = 30;
  const tx = clamp(Math.round(nx * TW - tw / 2), 0, TW - tw), ty = clamp(Math.round(ny * THt - th / 2), 0, THt - th);
  const tpl = new Float32Array(tw * th);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) tpl[y * tw + x] = g[(ty + y) * TW + tx + x];
  Object.assign(tr, {
    active: true, tpl, tpl0: Float32Array.from(tpl), tw, th,
    points: [{ t: videoEl.currentTime, x: nx, y: ny }],
    vx: 0, vy: 0, scale: 1, lost: 0
  });
  state.trackMode = false; $('#trackMode').checked = false; syncTrackUI();
  toast(`Target terkunci — "${tr.label}" (tracker pintar v2.6)`, 'ok');
}

function trackStep(t) {
  const tr = state.track; if (!tr.active || !tr.tpl || state.isAudio) return;
  const g = getGray();
  let last = tr.points[tr.points.length - 1];
  if (t < last.t - 0.25) { const prior = tr.points.filter(p => p.t <= t); tr.points = prior.length ? prior : [tr.points[0]]; last = tr.points[tr.points.length - 1]; }
  const dt = Math.max(0.001, t - last.t);

  /* --- 1. PREDIKSI posisi dari kecepatan (EMA) --- */
  let predX = last.x, predY = last.y;
  if (dt < 1.2) {
    predX = clamp(last.x + tr.vx * dt, 0, 1);
    predY = clamp(last.y + tr.vy * dt, 0, 1);
  }
  const cx0 = Math.round(predX * TW - tr.tw / 2), cy0 = Math.round(predY * THt - tr.th / 2);

  /* --- 2. PENCARIAN MULTI-SKALA di sekitar prediksi --- */
  const scales = [tr.scale * 0.82, tr.scale, tr.scale * 1.22];
  let best = null;
  for (const s of scales) {
    const st_ = scaleTpl(tr.tpl, tr.tw, tr.th, s);
    const b = nccSearch(g, st_.tpl, st_.w, st_.h, cx0, cy0, 24, 3);
    if (!best || b.s > best.s) best = { x: b.x, y: b.y, s: b.s, w: st_.w, h: st_.h, scale: s };
  }

  /* --- 3. RE-IDENTIFIKASI: skor rendah → cari di SELURUH FRAME pakai
         TEMPLATE ASLI (objek dengan kemiripan yang sama) --- */
  if (best.s < 0.5) {
    const sc = clamp(best.scale || 1, 0.6, 1.8);
    const ref = scaleTpl(tr.tpl0, tr.tw, tr.th, sc);
    const gb = nccGlobal(g, ref.tpl, ref.w, ref.h);
    if (gb.s > 0.42) {
      best = { x: gb.x, y: gb.y, s: gb.s, w: ref.w, h: ref.h, scale: sc };
      tr.lost = 0;
    } else {
      tr.lost++;
    }
  } else tr.lost = 0;

  /* --- 4. ADAPTASI LAMBAT + AMAN (anti-drift): hanya saat yakin --- */
  if (best.s > 0.72) {
    const st_ = scaleTpl(tr.tpl, tr.tw, tr.th, best.scale);
    if (st_.w === tr.tw && st_.h === tr.th) {
      for (let i = 0; i < tr.tpl.length; i++) tr.tpl[i] = tr.tpl[i] * 0.94 + g[(best.y + Math.floor(i / tr.tw)) * TW + best.x + (i % tr.tw)] * 0.06;
    }
  }
  tr.scale = best.scale;

  /* --- 5. kecepatan (EMA) untuk prediksi frame berikutnya --- */
  const nx2 = clamp((best.x + best.w / 2) / TW, 0, 1), ny2 = clamp((best.y + best.h / 2) / THt, 0, 1);
  const ivx = (nx2 - last.x) / dt, ivy = (ny2 - last.y) / dt;
  if (isFinite(ivx) && isFinite(ivy) && dt < 1.2 && best.s > 0.45) {
    tr.vx = tr.vx * 0.55 + ivx * 0.45; tr.vy = tr.vy * 0.55 + ivy * 0.45;
    const vmax = 1.2; tr.vx = clamp(tr.vx, -vmax, vmax); tr.vy = clamp(tr.vy, -vmax, vmax);
  } else if (best.s <= 0.45) { tr.vx *= 0.5; tr.vy *= 0.5; }

  tr.points.push({ t, x: nx2, y: ny2 });
  if (tr.points.length > 5000) tr.points = tr.points.filter((_, i) => i % 2 === 0);
  $('#trackStat').textContent = `${tr.points.length} titik terlacak${tr.lost > 3 ? ' · mencari ulang…' : ''}`;
}

async function scanTrack() {
  const tr = state.track;
  if (!tr.active || !tr.tpl) { toast('Klik target dulu lewat Mode Bidik', 'err'); return; }
  const wasT = videoEl.currentTime; videoEl.pause();
  const step = 1 / 12, t0 = tr.points[0].t, t1 = state.duration - 0.02;
  tr.points = [tr.points[0]];
  tr.vx = 0; tr.vy = 0; tr.scale = 1; tr.lost = 0;
  let cnt = 0; const totalN = Math.max(1, Math.ceil((t1 - t0) / step));
  state.scanAbort = false;
  showModal({ title: 'MENELUSURI OBJEK', sub: 'Tracker pintar · prediksi + multi-skala + re-identifikasi', cancel: true, onCancel() { state.scanAbort = true; } });
  try {
    for (let t = t0; t <= t1; t += step) {
      if (state.scanAbort) throw new Error('batal');
      await seekTo(t); trackStep(t);
      if (++cnt % 4 === 0) { setProg(cnt / totalN); setSub(`frame ${cnt}/${totalN} · ${fmtT(t)}`); await sleep(0); }
    }
    toast(`Pelacakan selesai — ${tr.points.length} titik`, 'ok');
  } catch (e) { toast('Pemindaian dibatalkan', 'warn'); }
  hideModal();
  await seekTo(Math.min(wasT, state.duration - 0.02));
}

function trackPosAt(t) {
  const P = state.track.points; if (!P.length) return null;
  if (t < P[0].t || t > P[P.length - 1].t + 0.6) return null;
  let a = P[0], b = P[P.length - 1];
  for (let i = P.length - 1; i >= 0; i--) { if (P[i].t <= t) { a = P[i]; b = P[Math.min(i + 1, P.length - 1)]; break; } }
  if (b === a || b.t === a.t) return { x: a.x, y: a.y };
  const k = clamp((t - a.t) / (b.t - a.t), 0, 1);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

function drawTrack(x, W, H, t, u) {
  const tr = state.track;
  if (!tr.active || !tr.points.length || state.isAudio || !compSrc().videoWidth) return;
  const p = trackPosAt(t); if (!p) return;
  const fit = videoFrameRect(compSrc().videoWidth, compSrc().videoHeight, W, H); /* v2.1: ikut zoom/pan */
  const sc = tr.scale || 1;
  const bw = Math.max(64 * u, (tr.tw * sc / TW) * fit.w * 2.4), bh = bw * THt / TW;
  const cx = fit.x + p.x * fit.w, cy = fit.y + p.y * fit.h, c = tr.color, L = bw * 0.3;
  x.save(); x.strokeStyle = c; x.lineWidth = 3 * u; x.beginPath();
  x.moveTo(cx - bw / 2, cy - bh / 2 + L); x.lineTo(cx - bw / 2, cy - bh / 2); x.lineTo(cx - bw / 2 + L, cy - bh / 2);
  x.moveTo(cx + bw / 2 - L, cy - bh / 2); x.lineTo(cx + bw / 2, cy - bh / 2); x.lineTo(cx + bw / 2, cy - bh / 2 + L);
  x.moveTo(cx + bw / 2, cy + bh / 2 - L); x.lineTo(cx + bw / 2, cy + bh / 2); x.lineTo(cx + bw / 2 - L, cy + bh / 2);
  x.moveTo(cx - bw / 2 + L, cy + bh / 2); x.lineTo(cx - bw / 2, cy + bh / 2); x.lineTo(cx - bw / 2, cy + bh / 2 - L);
  x.stroke();
  x.fillStyle = c; x.fillRect(cx - 2.5 * u, cy - 2.5 * u, 5 * u, 5 * u);
  // garis penunjuk + label (gaya grafis balap)
  const lx = cx + bw / 2 + 6 * u, ly = cy - bh / 2 - 6 * u, jx = lx + 26 * u, jy = ly - 26 * u;
  x.strokeStyle = c; x.lineWidth = 2 * u; x.globalAlpha = .9;
  x.beginPath(); x.moveTo(lx, ly); x.lineTo(jx, jy); x.lineTo(jx + 120 * u, jy); x.stroke();
  x.globalAlpha = 1;
  x.font = `600 ${Math.round(21 * u)}px "Chakra Petch"`;
  const label = (tr.label || 'TARGET').toUpperCase();
  const lw = x.measureText(label).width + 22 * u, lh2 = 32 * u;
  x.fillStyle = c; x.fillRect(jx, jy - lh2 / 2 - 8 * u, lw, lh2);
  x.fillStyle = '#0B0904'; x.textAlign = 'left'; x.textBaseline = 'middle';
  x.fillText(label, jx + 11 * u, jy - lh2 / 2 + 9 * u);
  x.textBaseline = 'alphabetic';
  x.restore();
}
