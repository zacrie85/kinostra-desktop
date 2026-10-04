/* ================================================================
   KINOSTRA DESKTOP — tracker.js
   Pelacak objek optik: NCC + template adaptif (gaya grafis MotoGP)
   Port setia dari KINOSTRA v1.0
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
function nccBest(g, tpl, st, cx, cy, R) {
  const tw = state.track.tw, th = state.track.th;
  let best = { x: cx, y: cy, s: -2 };
  const evalPos = (px, py) => {
    if (px < 0 || py < 0 || px + tw > TW || py + th > THt) return;
    let s = 0, s2 = 0;
    for (let y = 0; y < th; y++) { let o = (py + y) * TW + px; for (let x2 = 0; x2 < tw; x2++) { const v = g[o + x2]; s += v; s2 += v * v; } }
    const n = tw * th, pm = s / n, pv = Math.max(1e-6, s2 / n - pm * pm);
    let num = 0;
    for (let y = 0; y < th; y++) { let o = (py + y) * TW + px; for (let x2 = 0; x2 < tw; x2++) num += (g[o + x2] - pm) * (tpl[y * tw + x2] - st.m); }
    const sc = num / Math.sqrt(pv * st.v);
    if (sc > best.s) best = { x: px, y: py, s: sc };
  };
  for (let dy = -R; dy <= R; dy += 3) for (let dx = -R; dx <= R; dx += 3) evalPos(cx + dx, cy + dy);
  const bx = best.x, by = best.y;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) evalPos(bx + dx, by + dy);
  return best;
}
function captureTarget(nx, ny) {
  if (state.isAudio || !videoEl.videoWidth) { toast('Mode bidik hanya untuk video', 'err'); return; }
  const g = getGray(), tr = state.track, tw = 26, th = 26;
  const tx = clamp(Math.round(nx * TW - tw / 2), 0, TW - tw), ty = clamp(Math.round(ny * THt - th / 2), 0, THt - th);
  const tpl = new Float32Array(tw * th);
  for (let y = 0; y < th; y++) for (let x2 = 0; x2 < tw; x2++) tpl[y * tw + x2] = g[(ty + y) * TW + tx + x2];
  Object.assign(tr, { active: true, tpl, tw, th, stats: tplStats(tpl), points: [{ t: videoEl.currentTime, x: nx, y: ny }] });
  state.trackMode = false; $('#trackMode').checked = false; syncTrackUI();
  toast(`Target terkunci — "${tr.label}"`, 'ok');
}
function trackStep(t) {
  const tr = state.track; if (!tr.active || !tr.tpl || state.isAudio) return;
  const g = getGray(), last = tr.points[tr.points.length - 1];
  if (t < last.t - 0.25) { const prior = tr.points.filter(p => p.t <= t); tr.points = prior.length ? prior : [tr.points[0]]; }
  const cx = Math.round(tr.points[tr.points.length - 1].x * TW - tr.tw / 2);
  const cy = Math.round(tr.points[tr.points.length - 1].y * THt - tr.th / 2);
  const b = nccBest(g, tr.tpl, tr.stats, cx, cy, 22);
  if (b.s > 0.55) { // template adaptif: ikut perlahan berubahnya objek
    for (let y = 0; y < tr.th; y++) for (let x2 = 0; x2 < tr.tw; x2++) {
      const i = y * tr.tw + x2; tr.tpl[i] = tr.tpl[i] * 0.88 + g[(b.y + y) * TW + b.x + x2] * 0.12;
    }
    tr.stats = tplStats(tr.tpl);
  }
  tr.points.push({ t, x: (b.x + tr.tw / 2) / TW, y: (b.y + tr.th / 2) / THt });
  if (tr.points.length > 5000) tr.points = tr.points.filter((_, i) => i % 2 === 0);
  $('#trackStat').textContent = `${tr.points.length} titik terlacak`;
}
async function scanTrack() {
  const tr = state.track;
  if (!tr.active || !tr.tpl) { toast('Klik target dulu lewat Mode Bidik', 'err'); return; }
  const wasT = videoEl.currentTime; videoEl.pause();
  const step = 1 / 12, t0 = tr.points[0].t, t1 = state.duration - 0.02;
  tr.points = [tr.points[0]];
  let cnt = 0; const totalN = Math.max(1, Math.ceil((t1 - t0) / step));
  state.scanAbort = false;
  showModal({ title: 'MENELUSURI OBJEK', sub: 'Optical matching · template adaptif', cancel: true, onCancel() { state.scanAbort = true; } });
  try {
    for (let t = t0; t <= t1; t += step) {
      if (state.scanAbort) throw new Error('batal');
      await seekTo(t); trackStep(t);
      if (++cnt % 6 === 0) { setProg(cnt / totalN); setSub(`frame ${cnt}/${totalN} · ${fmtT(t)}`); await sleep(0); }
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
  const bw = Math.max(64 * u, (tr.tw / TW) * fit.w * 2.4), bh = bw * THt / TW;
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
