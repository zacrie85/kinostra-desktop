/* ================================================================
   KINOSTRA DESKTOP — frames.js (v2.12 · PABRIK FRAME BARU)
   ================================================================
   8 GAYA FRAME BARU hasil dari 9 gambar referensi pengguna:
   1. BIOSKOP      — tirai merah + lampu bulat emas berkelip + film &
                     popcorn (ref: bingkai bioskop "JURNALISTIK")
   2. MERAH PUTIH  — bingkai emas + awan putih + pita bendera
                     (ref: "EKSPEDISI MERAH PUTIH")
   3. KAYU         — papan kayu + daun + bunga matahari
                     (ref: "METAMORFOSIS 2023")
   4. GELOMBANG    — gelombang merah-kuning-pink mengalir
                     (ref: "PEMILU RAYA")
   5. ELEGAN       — latar gading + ornamen jingga melengkung
                     (ref: "ARKARA MUDA")
   6. AWAN         — awan biru berlapis + matahari
                     (ref: "LIVE REPORT")
   7. PANEL        — panel putih bulat di atas biru cerah
                     (ref: "EXPLORASHIP")
   8. GRADIEN      — garis gradien tipis minimalis
                     (ref: bingkai gradien neon tipis)

   ATURAN DESAIN (mengikuti skema posisi referensi pengguna):
   - JUDUL    : pita/papan khusus di ATAS (teks judul KINOSTRA
                digambar DI ATAS hiasan pita — tidak tertutup)
   - VIDEO    : area tengah dikelilingi bingkai
   - DESKRIPSI: pita/banner di BAWAH
   - PART     : pojok tetap bebas (label PART KINOSTRA di atasnya)

   Teknis:
   - 100% prosedural (canvas) → tanpa aset gambar → tetap offline.
   - Bagian statis DI-CACHE per ukuran (getLayer dari compose.js).
   - Animasi (kelip lampu, gelombang, kilau) memakai waktu media t
     → DETERMINISTIK per frame → aman untuk ekspor paralel
     (tidak ada perbedaan hasil antar worker).
   ================================================================ */
'use strict';

/* ---------- util kecil ---------- */
function frSeed(seed) { return mulberry32(seed | 0); }
function frGrad2(x, X0, Y0, X1, Y1, stops) {
  const g = x.createLinearGradient(X0, Y0, X1, Y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
function frCloud(x, cx, cy, s, fill, stroke, lw) {
  /* awan dari gabungan lingkaran halus */
  x.save();
  x.beginPath();
  const puffs = [[0, 0, 1], [-0.85, 0.18, 0.72], [0.85, 0.16, 0.78], [-0.4, -0.38, 0.66], [0.42, -0.34, 0.62]];
  puffs.forEach(([dx, dy, r], i) => {
    if (i === 0) x.moveTo(cx + dx * s - r * s, cy + dy * s);
    x.arc(cx + dx * s, cy + dy * s, r * s, 0, Math.PI * 2);
  });
  x.fillStyle = fill; x.fill();
  if (stroke) { x.strokeStyle = stroke; x.lineWidth = lw || 2; x.stroke(); }
  x.restore();
}
function frSunflower(x, cx, cy, r, rot) {
  x.save(); x.translate(cx, cy); x.rotate(rot || 0);
  x.fillStyle = '#f6b93b';
  for (let i = 0; i < 12; i++) {
    x.save(); x.rotate(i * Math.PI / 6);
    x.beginPath(); x.ellipse(0, -r * 0.72, r * 0.22, r * 0.5, 0, 0, Math.PI * 2); x.fill();
    x.restore();
  }
  x.beginPath(); x.arc(0, 0, r * 0.52, 0, Math.PI * 2);
  x.fillStyle = '#6b4416'; x.fill();
  x.fillStyle = 'rgba(40,24,6,.55)';
  for (let i = 0; i < 10; i++) {
    const a = frSeed(i * 7 + 3)() * Math.PI * 2, rr2 = frSeed(i * 13 + 1)() * r * 0.4;
    x.beginPath(); x.arc(Math.cos(a) * rr2, Math.sin(a) * rr2, r * 0.05, 0, Math.PI * 2); x.fill();
  }
  x.restore();
}
function frLeafCluster(x, cx, cy, s, flip) {
  x.save(); x.translate(cx, cy); if (flip) x.scale(-1, 1);
  const greens = ['#2e7d43', '#3c9958', '#256b38'];
  for (let i = 0; i < 7; i++) {
    const a = -0.25 - i * 0.22, len = s * (0.75 + 0.25 * Math.sin(i * 2.1));
    x.save(); x.rotate(a);
    x.beginPath(); x.ellipse(len * 0.5, 0, len * 0.5, s * 0.16, 0, 0, Math.PI * 2);
    x.fillStyle = greens[i % 3]; x.fill();
    x.restore();
  }
  /* bunga kecil */
  for (const [px, py] of [[s * 0.3, -s * 0.28], [s * 0.72, -s * 0.12]]) {
    x.fillStyle = '#fde8ef';
    for (let i = 0; i < 5; i++) {
      x.save(); x.translate(px, py); x.rotate(i * Math.PI * 2 / 5);
      x.beginPath(); x.ellipse(0, -s * 0.09, s * 0.05, s * 0.09, 0, 0, Math.PI * 2); x.fill();
      x.restore();
    }
    x.beginPath(); x.arc(px, py, s * 0.05, 0, Math.PI * 2); x.fillStyle = '#f6b93b'; x.fill();
  }
  x.restore();
}
function frBulb(x, cx, cy, r, glowR, alpha) {
  const g = x.createRadialGradient(cx, cy, r * 0.2, cx, cy, glowR);
  g.addColorStop(0, `rgba(255,236,170,${0.95 * alpha})`);
  g.addColorStop(0.35, `rgba(255,190,70,${0.55 * alpha})`);
  g.addColorStop(1, 'rgba(255,150,40,0)');
  x.fillStyle = g;
  x.beginPath(); x.arc(cx, cy, glowR, 0, Math.PI * 2); x.fill();
  x.fillStyle = `rgba(255,224,150,${0.95 * alpha})`;
  x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  x.fillStyle = `rgba(255,255,240,${0.9 * alpha})`;
  x.beginPath(); x.arc(cx - r * 0.25, cy - r * 0.25, r * 0.4, 0, Math.PI * 2); x.fill();
}
function frFilmReel(x, cx, cy, r) {
  x.save();
  x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2);
  x.fillStyle = '#2b2b2e'; x.fill();
  x.lineWidth = Math.max(2, r * 0.09); x.strokeStyle = '#e8b64c'; x.stroke();
  x.fillStyle = '#17171a';
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5 - Math.PI / 2;
    x.beginPath(); x.arc(cx + Math.cos(a) * r * 0.52, cy + Math.sin(a) * r * 0.52, r * 0.2, 0, Math.PI * 2); x.fill();
  }
  x.beginPath(); x.arc(cx, cy, r * 0.16, 0, Math.PI * 2); x.fillStyle = '#e8b64c'; x.fill();
  x.restore();
}
function frPopcorn(x, cx, cy, s) {
  /* kotak popcorn bergaris merah-putih dengan pop jagung */
  x.save(); x.translate(cx, cy);
  x.beginPath();
  x.moveTo(-s * 0.55, -s * 0.5); x.lineTo(s * 0.55, -s * 0.5);
  x.lineTo(s * 0.4, s * 0.6); x.lineTo(-s * 0.4, s * 0.6); x.closePath();
  x.fillStyle = '#f4f0e6'; x.fill();
  x.save(); x.clip();
  x.fillStyle = '#d7263d';
  for (let i = -2; i <= 2; i += 2) x.fillRect(i * s * 0.24 - s * 0.1, -s * 0.55, s * 0.2, s * 1.2);
  x.restore();
  x.lineWidth = Math.max(1, s * 0.06); x.strokeStyle = '#8f1015'; x.stroke();
  /* pop */
  x.fillStyle = '#fff3c4';
  [[-0.25, -0.6], [0.05, -0.68], [0.32, -0.58]].forEach(([dx, dy]) => {
    x.beginPath(); x.arc(dx * s, dy * s, s * 0.17, 0, Math.PI * 2); x.fill();
  });
  x.restore();
}
function frSparkle(x, cx, cy, r, a, col) {
  x.save(); x.globalAlpha = clamp(a, 0, 1);
  x.fillStyle = col || '#ffe9a8';
  x.beginPath();
  x.moveTo(cx, cy - r); x.quadraticCurveTo(cx + r * 0.16, cy - r * 0.16, cx + r, cy);
  x.quadraticCurveTo(cx + r * 0.16, cy + r * 0.16, cx, cy + r);
  x.quadraticCurveTo(cx - r * 0.16, cy + r * 0.16, cx - r, cy);
  x.quadraticCurveTo(cx - r * 0.16, cy - r * 0.16, cx, cy - r);
  x.fill(); x.restore();
}

/* ================================================================
   v2.16 — KOMPONEN KHUSUS HOROR ALAMGAIB & DANGDUT IDOLADESA
   Semua digambar prosedural (canvas) & deterministik dari t.
   ================================================================ */
const HOROR_TXT = 'HOROR ALAMGAIB';
const KOPLO_TXT = 'DANGDUT IDOLADESA';
/* pilih ukuran font agar teks muat di papan (tanpa wrap) */
function frFitFont(g, txt, weight, fam, maxW, base) {
  let fs = base;
  g.font = `${weight} ${fs}px "${fam}"`;
  const w = g.measureText(txt).width;
  if (w > maxW) fs = Math.max(base * 0.5, fs * maxW / w);
  return fs;
}
/* kelelawar siluet dengan kepak sayap (flap = radian) */
function frBat(x, cx, cy, s, flap, col) {
  x.save(); x.translate(cx, cy);
  x.fillStyle = col || '#08080f';
  const w = Math.sin(flap) * 0.35;
  x.beginPath();
  x.moveTo(0, 0);
  x.quadraticCurveTo(s * 0.4, -s * (0.55 + w), s * 1.05, -s * (0.18 + w * 0.6));
  x.quadraticCurveTo(s * 0.72, s * 0.05 - w * s * 0.2, s * 0.55, s * (0.28 + w));
  x.quadraticCurveTo(s * 0.3, s * (0.1 - w * 0.5), 0, s * (0.32 + w * 0.4));
  x.quadraticCurveTo(-s * 0.3, s * (0.1 - w * 0.5), -s * 0.55, s * (0.28 + w));
  x.quadraticCurveTo(-s * 0.72, s * 0.05 - w * s * 0.2, -s * 1.05, -s * (0.18 + w * 0.6));
  x.quadraticCurveTo(-s * 0.4, -s * (0.55 + w), 0, 0);
  x.closePath(); x.fill();
  x.beginPath();
  x.moveTo(-s * 0.09, -s * 0.18); x.lineTo(-s * 0.17, -s * 0.42); x.lineTo(-s * 0.01, -s * 0.22); x.closePath();
  x.moveTo(s * 0.09, -s * 0.18); x.lineTo(s * 0.17, -s * 0.42); x.lineTo(s * 0.01, -s * 0.22); x.closePath();
  x.fill();
  x.strokeStyle = 'rgba(150,160,205,.3)'; x.lineWidth = Math.max(0.8, s * 0.055); x.stroke();
  x.restore();
}
/* hantu putih kepala bulat + ekor bergelombang + aura */
function frGhost(x, cx, cy, s, sway, alpha) {
  if (alpha <= 0.015) return;
  x.save(); x.translate(cx, cy); x.globalAlpha = clamp(alpha, 0, 1);
  const g = x.createRadialGradient(0, 0, s * 0.2, 0, 0, s * 1.6);
  g.addColorStop(0, 'rgba(215,232,255,.4)'); g.addColorStop(1, 'rgba(215,232,255,0)');
  x.fillStyle = g; x.beginPath(); x.arc(0, 0, s * 1.6, 0, Math.PI * 2); x.fill();
  const wv = Math.sin(sway) * s * 0.09;
  x.fillStyle = 'rgba(235,242,252,.94)';
  x.beginPath();
  x.arc(0, -s * 0.22, s * 0.6, Math.PI, 0);
  x.lineTo(s * 0.6, s * 0.5);
  const seg = s * 1.2 / 4;
  for (let i = 0; i < 4; i++) {
    const xm = s * 0.6 - i * seg - seg / 2, x1 = s * 0.6 - (i + 1) * seg;
    x.quadraticCurveTo(xm, s * (0.5 + (i % 2 ? 0.34 : 0.1)) + wv, x1, s * 0.5);
  }
  x.closePath(); x.fill();
  x.fillStyle = 'rgba(12,16,30,.85)';
  x.beginPath(); x.ellipse(-s * 0.2, -s * 0.26, s * 0.09, s * 0.16, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(s * 0.2, -s * 0.26, s * 0.09, s * 0.16, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(0, s * 0.04, s * 0.1, s * 0.15, 0, 0, Math.PI * 2); x.fill();
  x.restore();
}
/* nisan (batu nisan melengkung + garis ukiran) */
function frNisan(x, cx, baseY, w, h, tilt, col, edge) {
  x.save(); x.translate(cx, baseY); x.rotate(tilt);
  x.beginPath();
  x.moveTo(-w / 2, 0);
  x.lineTo(-w / 2, -h + w / 2);
  x.arc(0, -h + w / 2, w / 2, Math.PI, 0);
  x.lineTo(w / 2, 0);
  x.closePath();
  x.fillStyle = col; x.fill();
  x.strokeStyle = edge; x.lineWidth = Math.max(1, w * 0.06); x.stroke();
  x.strokeStyle = edge; x.lineWidth = Math.max(1, w * 0.05);
  x.beginPath();
  x.moveTo(-w * 0.24, -h * 0.66); x.lineTo(w * 0.24, -h * 0.66);
  x.moveTo(-w * 0.18, -h * 0.52); x.lineTo(w * 0.18, -h * 0.52);
  x.stroke();
  x.restore();
}
/* tengkorak: moncong tengkorak sederhana */
function frSkull(x, cx, cy, s, bone, dark) {
  x.save(); x.translate(cx, cy);
  x.fillStyle = bone;
  x.beginPath(); x.arc(0, -s * 0.06, s * 0.5, 0, Math.PI * 2); x.fill();
  /* rahang: rect polos (roundedRectPath bisa radius negatif utk s sangat kecil) */
  x.fillRect(-s * 0.3, s * 0.28, s * 0.6, s * 0.32);
  x.fillStyle = dark;
  x.beginPath(); x.arc(-s * 0.2, -s * 0.1, s * 0.13, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.arc(s * 0.2, -s * 0.1, s * 0.13, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.moveTo(0, s * 0.05); x.lineTo(-s * 0.08, s * 0.2); x.lineTo(s * 0.08, s * 0.2); x.closePath(); x.fill();
  x.strokeStyle = dark; x.lineWidth = Math.max(1, s * 0.045);
  for (let i = -2; i <= 2; i++) {
    x.beginPath(); x.moveTo(i * s * 0.12, s * 0.32); x.lineTo(i * s * 0.12, s * 0.56); x.stroke();
  }
  x.restore();
}
/* lilin dengan lidah api berkedip (deterministik dari t) */
function frLilin(x, cx, baseY, w, h, t, ph) {
  const fl = Math.sin(t * 9 + ph) * 0.14 + Math.sin(t * 23 + ph * 2) * 0.06;
  const fx = cx + fl * w, fy = baseY - h;
  const g = x.createRadialGradient(fx, fy - w * 0.7, w * 0.06, fx, fy - w * 0.7, w * 1.6);
  g.addColorStop(0, 'rgba(255,240,180,.5)'); g.addColorStop(0.4, 'rgba(255,160,60,.22)'); g.addColorStop(1, 'rgba(255,120,30,0)');
  x.fillStyle = g; x.beginPath(); x.arc(fx, fy - w * 0.7, w * 1.6, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#ded5bd';
  roundedRectPath(x, cx - w / 2, baseY - h, w, h, w * 0.16); x.fill();
  x.beginPath(); x.ellipse(cx - w * 0.26, baseY - h, w * 0.15, w * 0.24, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(cx + w * 0.3, baseY - h, w * 0.1, w * 0.16, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(120,105,80,.35)';
  x.fillRect(cx - w / 2, baseY - h * 0.28, w, h * 0.28);
  x.fillStyle = '#ffd76a';
  x.beginPath(); x.ellipse(fx, fy - w * 0.55, w * 0.15, w * 0.4 + fl * w * 0.35, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fff5cf';
  x.beginPath(); x.ellipse(fx, fy - w * 0.4, w * 0.07, w * 0.2, 0, 0, Math.PI * 2); x.fill();
}
/* kotak speaker dengan cone berdenyut mengikuti beat koplo */
function frSpeaker(x, cx, cy, w, h, t, ph) {
  x.save();
  x.fillStyle = '#15121a';
  roundedRectPath(x, cx - w / 2, cy - h / 2, w, h, w * 0.09); x.fill();
  x.strokeStyle = 'rgba(245,201,78,.5)'; x.lineWidth = Math.max(1.4, w * 0.035); x.stroke();
  [[cy - h * 0.18, w * 0.28], [cy + h * 0.26, w * 0.18]].forEach(([cy2, r]) => {
    x.beginPath(); x.arc(cx, cy2, r, 0, Math.PI * 2);
    x.fillStyle = '#221d29'; x.fill();
    x.strokeStyle = 'rgba(245,201,78,.35)'; x.lineWidth = Math.max(1, w * 0.02); x.stroke();
    x.beginPath(); x.arc(cx, cy2, r * 0.45, 0, Math.PI * 2);
    x.fillStyle = '#0d0a12'; x.fill();
  });
  const beat = Math.max(0, Math.sin(t * 7.2 + ph));
  if (beat > 0.05) {
    x.strokeStyle = `rgba(255,220,140,${(0.4 * beat).toFixed(2)})`;
    x.lineWidth = Math.max(1.2, w * 0.03);
    x.beginPath(); x.arc(cx, cy - h * 0.18, w * (0.3 + beat * 0.12), 0, Math.PI * 2); x.stroke();
  }
  x.restore();
}
/* berkas lampu sorot (arah default ke bawah, ang = radian) */
function frSorot(x, cx, cy, ang, len, halfW, rgb, a) {
  x.save(); x.translate(cx, cy); x.rotate(ang);
  const g = x.createLinearGradient(0, 0, 0, len);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(-halfW * 0.14, 0); x.lineTo(halfW * 0.14, 0);
  x.lineTo(halfW, len); x.lineTo(-halfW, len);
  x.closePath(); x.fill();
  x.restore();
}
/* catatan musik (not seperdelapan) */
function frNote(x, cx, cy, s, col, rot) {
  x.save(); x.translate(cx, cy); x.rotate(rot || 0); x.globalAlpha = 0.9;
  x.fillStyle = col;
  x.beginPath(); x.ellipse(-s * 0.28, s * 0.6, s * 0.32, s * 0.22, -0.4, 0, Math.PI * 2); x.fill();
  x.strokeStyle = col; x.lineWidth = Math.max(1.4, s * 0.14); x.lineCap = 'round';
  x.beginPath(); x.moveTo(-s * 0.02, s * 0.52); x.lineTo(-s * 0.02, -s * 0.72); x.stroke();
  x.beginPath(); x.moveTo(-s * 0.02, -s * 0.72); x.quadraticCurveTo(s * 0.42, -s * 0.58, s * 0.55, -s * 0.22); x.stroke();
  x.restore();
}
/* bola disko berputar + kerlip sekitar */
function frDisco(x, cx, cy, r, t) {
  x.save();
  x.strokeStyle = 'rgba(210,215,235,.5)'; x.lineWidth = Math.max(1, r * 0.05);
  x.beginPath(); x.moveTo(cx, cy - r * 2.4); x.lineTo(cx, cy - r); x.stroke();
  const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.15, cx, cy, r);
  g.addColorStop(0, '#f2f5ff'); g.addColorStop(0.5, '#a9b3d4'); g.addColorStop(1, '#5a6488');
  x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  x.save(); x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.clip();
  const rot = t * 0.9;
  x.strokeStyle = 'rgba(255,255,255,.28)'; x.lineWidth = Math.max(1, r * 0.035);
  for (let i = -5; i <= 5; i++) {
    const yy = cy + i * r * 0.18;
    x.beginPath(); x.ellipse(cx, yy, r * (1 - Math.abs(i) * 0.085), r * 0.05, 0, 0, Math.PI * 2); x.stroke();
  }
  for (let i = 0; i < 10; i++) {
    const a = rot + i * Math.PI / 5;
    x.beginPath(); x.ellipse(cx, cy, Math.abs(Math.cos(a)) * r, r, 0, 0, Math.PI * 2); x.stroke();
  }
  x.restore();
  for (let i = 0; i < 8; i++) {
    const a = rot * 1.3 + i * Math.PI / 4;
    const rr = r * (1.65 + 0.5 * Math.sin(t * 3 + i));
    frSparkle(x, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.9, r * 0.16, 0.3 + 0.35 * Math.sin(t * 4 + i * 2), '#dfe8ff');
  }
  x.restore();
}
/* obor bambu dengan api menyala-nyala */
function frObor(x, cx, baseY, h, w, t, ph) {
  x.strokeStyle = '#8a6a34'; x.lineWidth = w * 0.5; x.lineCap = 'round';
  x.beginPath(); x.moveTo(cx, baseY); x.lineTo(cx, baseY - h); x.stroke();
  x.strokeStyle = '#6d5226'; x.lineWidth = Math.max(1, w * 0.08);
  for (let i = 1; i <= 3; i++) {
    const yy = baseY - h * i / 4;
    x.beginPath(); x.moveTo(cx - w * 0.26, yy); x.lineTo(cx + w * 0.26, yy); x.stroke();
  }
  x.fillStyle = '#5a4020';
  roundedRectPath(x, cx - w * 0.55, baseY - h - w * 0.5, w * 1.1, w * 0.55, w * 0.12); x.fill();
  const fl = Math.sin(t * 8 + ph) * 0.16 + Math.sin(t * 21 + ph * 3) * 0.07;
  const fx = cx + fl * w, fy = baseY - h - w * 0.55;
  const g = x.createRadialGradient(fx, fy - w * 0.8, w * 0.08, fx, fy - w * 0.8, w * 2.2);
  g.addColorStop(0, 'rgba(255,236,170,.6)'); g.addColorStop(0.35, 'rgba(255,170,60,.3)'); g.addColorStop(1, 'rgba(255,120,30,0)');
  x.fillStyle = g; x.beginPath(); x.arc(fx, fy - w * 0.8, w * 2.2, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#ffb54a';
  x.beginPath();
  x.moveTo(fx - w * 0.3, fy);
  x.quadraticCurveTo(fx - w * 0.38, fy - w * 0.7, fx, fy - (w * 1.15 + fl * w * 0.5));
  x.quadraticCurveTo(fx + w * 0.38, fy - w * 0.7, fx + w * 0.3, fy);
  x.closePath(); x.fill();
  x.fillStyle = '#ffe9a8';
  x.beginPath(); x.ellipse(fx, fy - w * 0.35, w * 0.13, w * 0.4, 0, 0, Math.PI * 2); x.fill();
}
/* kipas penari mengembang (open 0..1) dengan bilah bergradasi */
function frKipas(x, cx, cy, r, open, rot, colA, colB) {
  x.save(); x.translate(cx, cy); x.rotate(rot);
  const spread = Math.PI * 0.62 * clamp(open, 0.1, 1);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = -spread / 2 + spread * i / (n - 1);
    x.save(); x.rotate(a);
    const g = x.createLinearGradient(0, 0, 0, -r);
    g.addColorStop(0, colA); g.addColorStop(1, colB);
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(0, 0);
    x.quadraticCurveTo(r * 0.26, -r * 0.5, 0, -r);
    x.quadraticCurveTo(-r * 0.26, -r * 0.5, 0, 0);
    x.closePath(); x.fill();
    x.strokeStyle = 'rgba(70,40,60,.4)'; x.lineWidth = Math.max(1, r * 0.02); x.stroke();
    x.restore();
  }
  x.beginPath(); x.arc(0, 0, r * 0.09, 0, Math.PI * 2);
  x.fillStyle = '#f5c94e'; x.fill();
  x.strokeStyle = '#8f5f16'; x.lineWidth = Math.max(1, r * 0.02); x.stroke();
  x.restore();
}
/* kembang hibiscus merah khas panggung kampung */
function frKembang(x, cx, cy, r, col) {
  x.save(); x.translate(cx, cy); x.rotate(r * 0.3);
  for (let i = 0; i < 5; i++) {
    x.save(); x.rotate(i * Math.PI * 2 / 5);
    x.fillStyle = col;
    x.beginPath(); x.ellipse(0, -r * 0.55, r * 0.3, r * 0.55, 0, 0, Math.PI * 2); x.fill();
    x.restore();
  }
  x.fillStyle = '#f5c94e'; x.beginPath(); x.arc(0, 0, r * 0.18, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#f5c94e'; x.lineWidth = Math.max(1, r * 0.05);
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5 + 0.3;
    x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * r * 0.32, Math.sin(a) * r * 0.32); x.stroke();
  }
  x.restore();
}
/* kendang koplo (botol pinang mendatar) */
function frKendang(x, cx, cy, s, rot) {
  x.save(); x.translate(cx, cy); x.rotate(rot || 0);
  x.fillStyle = '#7a4a22';
  x.beginPath();
  x.moveTo(-s * 0.55, -s * 0.42); x.lineTo(s * 0.55, -s * 0.42);
  x.quadraticCurveTo(s * 0.12, 0, s * 0.55, s * 0.42);
  x.lineTo(-s * 0.55, s * 0.42);
  x.quadraticCurveTo(-s * 0.12, 0, -s * 0.55, -s * 0.42);
  x.closePath(); x.fill();
  x.fillStyle = '#e8d9b8';
  x.beginPath(); x.ellipse(-s * 0.58, 0, s * 0.13, s * 0.46, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(s * 0.58, 0, s * 0.13, s * 0.46, 0, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#5d3a18'; x.lineWidth = Math.max(1.5, s * 0.03);
  x.beginPath(); x.ellipse(-s * 0.58, 0, s * 0.13, s * 0.46, 0, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.ellipse(s * 0.58, 0, s * 0.13, s * 0.46, 0, 0, Math.PI * 2); x.stroke();
  x.strokeStyle = 'rgba(240,228,200,.8)'; x.lineWidth = Math.max(1, s * 0.026);
  for (let i = -2; i <= 2; i++) {
    x.beginPath(); x.moveTo(-s * 0.5, i * s * 0.16); x.lineTo(s * 0.5, i * s * 0.16 - s * 0.12); x.stroke();
  }
  x.restore();
}
/* gong emas dalam rangka kayu */
function frGong(x, cx, cy, r) {
  x.strokeStyle = '#6d4a1e'; x.lineWidth = Math.max(2, r * 0.12);
  x.strokeRect(cx - r * 1.25, cy - r * 1.2, r * 2.5, r * 2.3);
  const g = x.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
  g.addColorStop(0, '#f3cf6d'); g.addColorStop(1, '#b8862e');
  x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#8f5f16'; x.lineWidth = Math.max(1.5, r * 0.07); x.stroke();
  x.fillStyle = 'rgba(90,60,20,.55)';
  x.beginPath(); x.arc(cx, cy, r * 0.35, 0, Math.PI * 2); x.fill();
}
/* ornamen sudut emas bergaya swirl panggung */
function frSwirlCorner(x, sx, sy, mx, my, u, col) {
  x.save(); x.translate(sx, sy); x.scale(mx, my);
  x.strokeStyle = col; x.lineCap = 'round';
  x.lineWidth = 4.5 * u;
  x.beginPath(); x.moveTo(24 * u, 82 * u);
  x.quadraticCurveTo(22 * u, 28 * u, 82 * u, 24 * u); x.stroke();
  x.lineWidth = 2.6 * u;
  x.beginPath(); x.moveTo(36 * u, 106 * u);
  x.quadraticCurveTo(34 * u, 40 * u, 106 * u, 36 * u); x.stroke();
  x.beginPath(); x.arc(27 * u, 27 * u, 11 * u, -0.4, Math.PI * 1.35); x.stroke();
  x.fillStyle = col;
  x.beginPath(); x.arc(94 * u, 30 * u, 4 * u, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.arc(30 * u, 94 * u, 4 * u, 0, Math.PI * 2); x.fill();
  x.restore();
}
/* kabut mengalir deterministik (1 pita) */
function frKabut(x, W, H, t, u, yFrac, ampF, col, a, dir) {
  const yb = H * yFrac, amp = ampF * u, k = 130 * u;
  const ph = t * (dir ? 14 : -20) / 8;
  x.save();
  x.beginPath(); x.moveTo(0, yb);
  for (let px = 0; px <= W; px += 18) x.lineTo(px, yb + Math.sin(px / k + ph) * amp);
  x.lineTo(W, yb + 74 * u); x.lineTo(0, yb + 74 * u);
  x.closePath();
  const fg = x.createLinearGradient(0, yb - 18 * u, 0, yb + 74 * u);
  fg.addColorStop(0, `rgba(${col},${a})`); fg.addColorStop(1, `rgba(${col},0)`);
  x.fillStyle = fg; x.fill();
  x.restore();
}
/* PAPAN JUDUL HOROR — batu gelap + glow merah + teks "HOROR ALAMGAIB" */
function frHororPlate(g, W, u) {
  const pw = Math.min(W * 0.68, 780 * u), ph = 86 * u;
  const px = (W - pw) / 2, py = 20 * u;
  const gg = g.createRadialGradient(W / 2, py + ph / 2, ph * 0.2, W / 2, py + ph / 2, pw * 0.62);
  gg.addColorStop(0, 'rgba(165,32,50,.4)'); gg.addColorStop(1, 'rgba(165,32,50,0)');
  g.fillStyle = gg; g.fillRect(px - pw * 0.3, py - ph * 0.6, pw * 1.6, ph * 2.2);
  const pg = g.createLinearGradient(0, py, 0, py + ph);
  pg.addColorStop(0, '#261c30'); pg.addColorStop(0.5, '#181023'); pg.addColorStop(1, '#0d0815');
  roundedRectPath(g, px, py, pw, ph, 10 * u);
  g.fillStyle = pg; g.fill();
  g.strokeStyle = 'rgba(130,80,150,.6)'; g.lineWidth = 2 * u; g.stroke();
  roundedRectPath(g, px + 6 * u, py + 6 * u, pw - 12 * u, ph - 12 * u, 7 * u);
  g.strokeStyle = 'rgba(198,34,52,.55)'; g.lineWidth = 1.6 * u; g.stroke();
  frSkull(g, px + 24 * u, py + ph / 2, 17 * u, 'rgba(214,204,182,.92)', 'rgba(18,10,20,.9)');
  frSkull(g, px + pw - 24 * u, py + ph / 2, 17 * u, 'rgba(214,204,182,.92)', 'rgba(18,10,20,.9)');
  g.font = `900 ${frFitFont(g, HOROR_TXT, 900, 'Cinzel', pw - 120 * u, 42 * u)}px "Cinzel"`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(225,45,66,.9)'; g.shadowBlur = 13 * u;
  g.fillStyle = '#eae1cb';
  g.fillText(HOROR_TXT, W / 2, py + ph / 2 + 2 * u);
  g.shadowBlur = 0;
  g.textBaseline = 'alphabetic';
  frBat(g, W / 2 - pw * 0.3, py - 3 * u, 9 * u, 0.5);
  frBat(g, W / 2 + pw * 0.3, py - 3 * u, 9 * u, -0.5);
}
/* PAPAN JUDUL DANGDUT — pita merah-emas + teks "DANGDUT IDOLADESA" */
function frDangdutPlate(g, W, u) {
  const pw = Math.min(W * 0.74, 840 * u), ph = 86 * u;
  const px = (W - pw) / 2, py = 20 * u, zig = 12 * u;
  const gg = g.createRadialGradient(W / 2, py + ph / 2, ph * 0.2, W / 2, py + ph / 2, pw * 0.6);
  gg.addColorStop(0, 'rgba(255,195,70,.35)'); gg.addColorStop(1, 'rgba(255,195,70,0)');
  g.fillStyle = gg; g.fillRect(px - pw * 0.25, py - ph * 0.5, pw * 1.5, ph * 2);
  g.beginPath();
  g.moveTo(px + zig, py); g.lineTo(px + pw - zig, py);
  g.lineTo(px + pw, py + ph / 2); g.lineTo(px + pw - zig, py + ph);
  g.lineTo(px + zig, py + ph); g.lineTo(px, py + ph / 2);
  g.closePath();
  const rg = g.createLinearGradient(0, py, 0, py + ph);
  rg.addColorStop(0, '#d81a3c'); rg.addColorStop(0.5, '#a30f28'); rg.addColorStop(1, '#6d0a1c');
  g.fillStyle = rg; g.fill();
  g.strokeStyle = '#f5c94e'; g.lineWidth = 3 * u; g.stroke();
  g.beginPath();
  g.moveTo(px + zig + 9 * u, py + 8 * u); g.lineTo(px + pw - zig - 9 * u, py + 8 * u);
  g.lineTo(px + pw - 16 * u, py + ph / 2); g.lineTo(px + pw - zig - 9 * u, py + ph - 8 * u);
  g.lineTo(px + zig + 9 * u, py + ph - 8 * u); g.lineTo(px + 16 * u, py + ph / 2);
  g.closePath();
  g.strokeStyle = 'rgba(245,201,78,.55)'; g.lineWidth = 1.6 * u; g.stroke();
  g.font = `400 ${frFitFont(g, KOPLO_TXT, 400, 'Anton', pw - 150 * u, 46 * u)}px "Anton"`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(58,6,14,.9)'; g.shadowBlur = 6 * u; g.shadowOffsetY = 2 * u;
  g.fillStyle = '#ffeaa6';
  g.fillText(KOPLO_TXT, W / 2, py + ph / 2 + 2 * u);
  g.shadowBlur = 0; g.shadowOffsetY = 0;
  g.textBaseline = 'alphabetic';
  frNote(g, px + 30 * u, py + ph * 0.26, 14 * u, '#f5c94e', -0.2);
  frNote(g, px + pw - 30 * u, py + ph * 0.3, 13 * u, '#f5c94e', 0.18);
}
/* papan bawah untuk deskripsi/PART */
function frBottomPlate(g, W, H, u, kind) {
  const pw = W * 0.6, ph = 46 * u, px = (W - pw) / 2, py = H - 58 * u;
  roundedRectPath(g, px, py, pw, ph, kind === 'horor' ? 6 * u : ph / 2);
  const pg = g.createLinearGradient(0, py, 0, py + ph);
  if (kind === 'horor') { pg.addColorStop(0, '#1c1326'); pg.addColorStop(1, '#0e0917'); }
  else { pg.addColorStop(0, '#8f1420'); pg.addColorStop(1, '#5d0c16'); }
  g.fillStyle = pg; g.fill();
  g.strokeStyle = kind === 'horor' ? 'rgba(140,85,155,.5)' : 'rgba(245,201,78,.6)';
  g.lineWidth = 1.8 * u; g.stroke();
}

/* ================================================================
   v3.0 — ALAM GAIB: papan judul & tokoh khusus
   Papan batu hitam kehijauan + glow racun + teks "ALAM GAIB".
   ================================================================ */
const GAIB_TXT = 'ALAM GAIB';
function frGaibPlate(g, W, u) {
  const pw = Math.min(W * 0.66, 760 * u), ph = 86 * u;
  const px = (W - pw) / 2, py = 20 * u;
  const gg = g.createRadialGradient(W / 2, py + ph / 2, ph * 0.2, W / 2, py + ph / 2, pw * 0.62);
  gg.addColorStop(0, 'rgba(70,190,120,.34)'); gg.addColorStop(1, 'rgba(70,190,120,0)');
  g.fillStyle = gg; g.fillRect(px - pw * 0.3, py - ph * 0.6, pw * 1.6, ph * 2.2);
  const pg = g.createLinearGradient(0, py, 0, py + ph);
  pg.addColorStop(0, '#10241a'); pg.addColorStop(0.5, '#0a1811'); pg.addColorStop(1, '#050d09');
  roundedRectPath(g, px, py, pw, ph, 10 * u);
  g.fillStyle = pg; g.fill();
  g.strokeStyle = 'rgba(96,178,128,.62)'; g.lineWidth = 2 * u; g.stroke();
  roundedRectPath(g, px + 6 * u, py + 6 * u, pw - 12 * u, ph - 12 * u, 7 * u);
  g.strokeStyle = 'rgba(64,220,130,.45)'; g.lineWidth = 1.6 * u; g.stroke();
  /* akar menjuntai di kedua ujung papan (khas alam gaib) */
  g.strokeStyle = 'rgba(16,44,28,.95)'; g.lineCap = 'round';
  [[px + 14 * u, 1], [px + pw - 14 * u, -1]].forEach(([rx, dir]) => {
    for (let i = 0; i < 3; i++) {
      g.lineWidth = (2.4 - i * 0.6) * u;
      g.beginPath(); g.moveTo(rx, py + ph - 4 * u);
      g.quadraticCurveTo(rx + dir * (6 + i * 4) * u, py + ph + 14 * u, rx + dir * (2 + i * 6) * u, py + ph + (22 + i * 7) * u);
      g.stroke();
    }
  });
  g.font = `900 ${frFitFont(g, GAIB_TXT, 900, 'Cinzel', pw - 120 * u, 44 * u)}px "Cinzel"`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(70,235,140,.95)'; g.shadowBlur = 14 * u;
  g.fillStyle = '#dbe9d3';
  g.fillText(GAIB_TXT, W / 2, py + ph / 2 + 2 * u);
  g.shadowBlur = 0;
  g.textBaseline = 'alphabetic';
  [[px + 22 * u, py - 2 * u], [px + pw - 22 * u, py + 4 * u]].forEach(([fx, fy]) => {
    g.fillStyle = 'rgba(150,255,180,.9)';
    g.beginPath(); g.arc(fx, fy, 2.4 * u, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(150,255,180,.25)';
    g.beginPath(); g.arc(fx, fy, 6 * u, 0, Math.PI * 2); g.fill();
  });
}
/* POCONG — kain kafan + tali 3 ikat + wajah gelap; hop = tinggi lompatan */
function frPocong(x, cx, cy, s, hop, sway) {
  x.save(); x.translate(cx, cy - Math.abs(Math.sin(hop)) * s * 0.55);
  x.rotate(Math.sin(sway) * 0.08);
  const g = x.createRadialGradient(0, -s * 0.5, s * 0.2, 0, -s * 0.5, s * 1.7);
  g.addColorStop(0, 'rgba(200,255,225,.16)'); g.addColorStop(1, 'rgba(200,255,225,0)');
  x.fillStyle = g; x.beginPath(); x.arc(0, -s * 0.5, s * 1.7, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(226,230,222,.96)';
  roundedRectPath(x, -s * 0.42, -s * 1.1, s * 0.84, s * 1.6, s * 0.4); x.fill();
  x.fillStyle = 'rgba(196,202,194,.92)';
  roundedRectPath(x, -s * 0.42, -s * 0.1, s * 0.84, s * 0.6, s * 0.28); x.fill();
  x.beginPath(); x.ellipse(0, -s * 1.12, s * 0.3, s * 0.34, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(10,14,12,.92)';
  x.beginPath(); x.ellipse(0, -s * 1.14, s * 0.2, s * 0.26, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(225,255,235,.95)';
  x.beginPath(); x.arc(-s * 0.08, -s * 1.18, s * 0.032, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.arc(s * 0.08, -s * 1.18, s * 0.032, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(160,148,120,.95)'; x.lineWidth = Math.max(1.2, s * 0.06);
  [-0.72, -0.3, 0.12].forEach(k => {
    x.beginPath(); x.moveTo(-s * 0.42, s * k); x.quadraticCurveTo(0, s * (k + 0.09), s * 0.42, s * k); x.stroke();
  });
  x.beginPath(); x.moveTo(0, -s * 1.34); x.lineTo(-s * 0.1, -s * 1.5); x.moveTo(0, -s * 1.34); x.lineTo(s * 0.1, -s * 1.5); x.stroke();
  x.restore();
}
/* KUNTILANAK — sosok putih berambut panjang; sway = gerak rambut */
function frKunti(x, cx, cy, s, sway, alpha) {
  if (alpha <= 0.015) return;
  x.save(); x.translate(cx, cy); x.globalAlpha = clamp(alpha, 0, 1);
  const g = x.createRadialGradient(0, -s * 0.6, s * 0.2, 0, -s * 0.6, s * 1.9);
  g.addColorStop(0, 'rgba(255,240,250,.14)'); g.addColorStop(1, 'rgba(255,240,250,0)');
  x.fillStyle = g; x.beginPath(); x.arc(0, -s * 0.6, s * 1.9, 0, Math.PI * 2); x.fill();
  /* gaun putih panjang */
  x.fillStyle = 'rgba(238,236,240,.95)';
  x.beginPath();
  x.moveTo(-s * 0.3, -s * 0.85);
  x.quadraticCurveTo(-s * 0.52, -s * 0.1, -s * 0.46, s * 1.05);
  x.quadraticCurveTo(0, s * 1.18, s * 0.46, s * 1.05);
  x.quadraticCurveTo(s * 0.52, -s * 0.1, s * 0.3, -s * 0.85);
  x.closePath(); x.fill();
  /* bahu & kepala pucat */
  x.fillStyle = 'rgba(224,222,230,.98)';
  x.beginPath(); x.ellipse(0, -s * 0.98, s * 0.2, s * 0.16, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.arc(0, -s * 1.16, s * 0.15, 0, Math.PI * 2); x.fill();
  /* rambut panjang menutup wajah + bergoyang */
  x.fillStyle = 'rgba(8,8,12,.96)';
  x.beginPath();
  x.moveTo(-s * 0.17, -s * 1.28);
  x.quadraticCurveTo(-s * (0.26 + Math.sin(sway) * 0.03), -s * 0.6, -s * (0.2 + Math.sin(sway) * 0.05), s * 0.5);
  x.quadraticCurveTo(0, s * 0.62, s * (0.2 + Math.sin(sway + 1) * 0.05), s * 0.5);
  x.quadraticCurveTo(s * (0.26 + Math.sin(sway + 1) * 0.03), -s * 0.6, s * 0.17, -s * 1.28);
  x.closePath(); x.fill();
  /* bunga melati di rambut */
  x.fillStyle = 'rgba(250,250,245,.9)';
  for (let i = 0; i < 3; i++) {
    x.beginPath(); x.arc(-s * 0.1 + i * s * 0.09, -s * (1.3 + (i % 2) * 0.05), s * 0.024, 0, Math.PI * 2); x.fill();
  }
  x.restore();
}
/* TUYUL — anak kecil botak duduk (s = ukuran) */
function frTuyul(x, cx, cy, s, sway) {
  x.save(); x.translate(cx, cy); x.rotate(Math.sin(sway) * 0.05);
  const g = x.createRadialGradient(0, 0, s * 0.1, 0, 0, s * 1.4);
  g.addColorStop(0, 'rgba(255,225,150,.14)'); g.addColorStop(1, 'rgba(255,225,150,0)');
  x.fillStyle = g; x.beginPath(); x.arc(0, 0, s * 1.4, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(150,138,120,.92)';            /* badan kecil */
  roundedRectPath(x, -s * 0.22, -s * 0.3, s * 0.44, s * 0.62, s * 0.2); x.fill();
  x.fillStyle = 'rgba(196,182,158,.95)';            /* kepala botak */
  x.beginPath(); x.arc(0, -s * 0.44, s * 0.24, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(20,14,10,.9)';                /* mata berbinar */
  x.beginPath(); x.arc(-s * 0.09, -s * 0.46, s * 0.035, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.arc(s * 0.09, -s * 0.46, s * 0.035, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(0, -s * 0.37, s * 0.028, s * 0.04, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(120,106,88,.9)';              /* telinga runcing */
  x.beginPath(); x.moveTo(-s * 0.22, -s * 0.5); x.lineTo(-s * 0.33, -s * 0.58); x.lineTo(-s * 0.2, -s * 0.4); x.closePath(); x.fill();
  x.beginPath(); x.moveTo(s * 0.22, -s * 0.5); x.lineTo(s * 0.33, -s * 0.58); x.lineTo(s * 0.2, -s * 0.4); x.closePath(); x.fill();
  x.restore();
}

/* ================================================================
   KATALOG FRAME
   Tiap frame: { bg(x,W,H,t,u) — latar (opsional),
                 under(...)  — digambar SEBELUM video (opsional),
                 decor(...)  — digambar SETELAH video, SEBELUM teks }
   ================================================================ */
const FRAMES = {

  /* ---------------- 1. BIOSKOP ---------------- */
  bioskop: {
    bg(x, W, H) {
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#4a0d10'); g.addColorStop(0.55, '#33080b'); g.addColorStop(1, '#1e0507');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      const v = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.42)');
      x.fillStyle = v; x.fillRect(0, 0, W, H);
    },
    decor(x, W, H, t, u) {
      const ch = Math.round(H * 0.072);            /* tinggi tirai */
      const bh = Math.round(H * 0.082);            /* tinggi panggung bawah */
      /* --- statis: tirai + kolom + panggung (cache) --- */
      const key = `frbio|${W}x${H}`;
      const st = getLayer(key, () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        /* tirai atas: puncak lengkung bergantian */
        g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, ch * 0.55);
        const n = Math.max(6, Math.round(W / (150 * u)));
        const sw = W / n;
        for (let i = n - 1; i >= 0; i--) {
          const cx0 = (i + 0.5) * sw, dip = ch * (i % 2 ? 1 : 0.62);
          g.quadraticCurveTo(cx0, ch * 1.15 + dip * 0.2, i * sw, ch * 0.55);
        }
        g.closePath();
        g.fillStyle = frGrad2(g, 0, 0, 0, ch * 1.3, [[0, '#c01a26'], [0.7, '#8f1018'], [1, '#6d0b12']]);
        g.fill();
        /* lipatan tirai */
        g.save(); g.clip();
        for (let i = 0; i < n * 2; i++) {
          g.fillStyle = i % 2 ? 'rgba(0,0,0,.18)' : 'rgba(255,120,110,.10)';
          g.fillRect(i * (W / (n * 2)), 0, W / (n * 2), ch * 1.3);
        }
        g.restore();
        /* pita emas bawah tirai */
        g.fillStyle = '#e8b64c'; g.fillRect(0, ch * 0.98, W, 5 * u);
        g.fillStyle = 'rgba(232,182,76,.35)'; g.fillRect(0, ch * 0.98 + 5 * u, W, 2 * u);
        /* kolom lampu kiri & kanan */
        const colW = 40 * u;
        [[10 * u, 1], [W - 10 * u - colW, -1]].forEach(([bx, side]) => {
          const cg = g.createLinearGradient(bx, 0, bx + colW, 0);
          if (side === 1) { cg.addColorStop(0, '#6d0b12'); cg.addColorStop(1, '#3c070c'); }
          else { cg.addColorStop(0, '#3c070c'); cg.addColorStop(1, '#6d0b12'); }
          g.fillStyle = cg;
          g.fillRect(bx, ch * 0.9, colW, H - ch * 0.9 - bh * 0.4);
          g.strokeStyle = 'rgba(232,182,76,.5)'; g.lineWidth = 2 * u;
          g.strokeRect(bx, ch * 0.9, colW, H - ch * 0.9 - bh * 0.4);
        });
        /* panggung bawah */
        g.fillStyle = frGrad2(g, 0, H - bh, 0, H, [[0, '#a1121e'], [1, '#5d0a10']]);
        g.fillRect(0, H - bh, W, bh);
        g.fillStyle = '#e8b64c'; g.fillRect(0, H - bh, W, 4 * u);
        /* gulungan film kiri & kotak popcorn kanan di panggung */
        frFilmReel(g, 74 * u, H - bh * 0.52, 26 * u);
        frFilmReel(g, W - 74 * u, H - bh * 0.52, 26 * u);
        frPopcorn(g, W / 2, H - bh * 0.5, 30 * u);
        return c;
      });
      x.drawImage(st, 0, 0);
      /* --- dinamis: lampu berkelip (deterministik dari t) --- */
      const colCx = [30 * u, W - 30 * u];
      const y0 = H * 0.075 + 30 * u, y1 = H - H * 0.082 - 16 * u;
      const nb = Math.max(6, Math.floor((y1 - y0) / (64 * u)));
      for (let i = 0; i < nb; i++) {
        const yy = y0 + i * (y1 - y0) / (nb - 1);
        const tw = 0.72 + 0.28 * Math.sin(t * 4.2 + i * 1.9);
        colCx.forEach((cx0, s) => frBulb(x, cx0, yy, 7.5 * u, 22 * u, s ? tw : 0.72 + 0.28 * Math.sin(t * 4.2 + i * 1.9 + 0.9)));
      }
      /* bintang kelip */
      frSparkle(x, W * 0.16, H * 0.14, 8 * u, 0.5 + 0.5 * Math.sin(t * 3.1));
      frSparkle(x, W * 0.85, H * 0.18, 7 * u, 0.5 + 0.5 * Math.sin(t * 2.7 + 2));
      frSparkle(x, W * 0.5, H * 0.115, 6 * u, 0.5 + 0.5 * Math.sin(t * 3.6 + 4));
      /* --- bingkai emas dalam di sekeliling video --- */
      const pad = 52 * u, r = Math.round(Math.min(W, H) * 0.03);
      roundedRectPath(x, pad, pad, W - pad * 2, H - pad * 2, r);
      x.strokeStyle = 'rgba(232,182,76,.85)'; x.lineWidth = 3.2 * u; x.stroke();
      roundedRectPath(x, pad + 7 * u, pad + 7 * u, W - pad * 2 - 14 * u, H - pad * 2 - 14 * u, r * 0.8);
      x.strokeStyle = 'rgba(232,182,76,.32)'; x.lineWidth = 1.6 * u; x.stroke();
    }
  },

  /* ---------------- 2. MERAH PUTIH ---------------- */
  merahputih: {
    bg(x, W, H) {
      const g = x.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.18, W / 2, H / 2, Math.max(W, H) * 0.72);
      g.addColorStop(0, '#a5161d'); g.addColorStop(1, '#65090f');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    },
    decor(x, W, H, t, u) {
      /* bingkai emas ganda + hias sudut */
      const key = `frmp|${W}x${H}`;
      const st = getLayer(key, () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        const m1 = 14 * u, r = Math.round(Math.min(W, H) * 0.035);
        roundedRectPath(g, m1, m1, W - m1 * 2, H - m1 * 2, r);
        g.strokeStyle = '#e8b64c'; g.lineWidth = 4 * u; g.stroke();
        roundedRectPath(g, m1 + 8 * u, m1 + 8 * u, W - m1 * 2 - 16 * u, H - m1 * 2 - 16 * u, r * 0.8);
        g.strokeStyle = 'rgba(232,182,76,.45)'; g.lineWidth = 2 * u; g.stroke();
        /* wajik sudut */
        [[m1 + 8 * u, m1 + 8 * u], [W - m1 - 8 * u, m1 + 8 * u], [m1 + 8 * u, H - m1 - 8 * u], [W - m1 - 8 * u, H - m1 - 8 * u]]
          .forEach(([dx, dy]) => {
            g.save(); g.translate(dx, dy); g.rotate(Math.PI / 4);
            g.fillStyle = '#f3cf6d'; g.fillRect(-7 * u, -7 * u, 14 * u, 14 * u);
            g.strokeStyle = '#8f5f16'; g.lineWidth = 1.6 * u; g.strokeRect(-7 * u, -7 * u, 14 * u, 14 * u);
            g.restore();
          });
        /* pita bendera bawah: putih + merah bergelombang */
        const bh = H * 0.052;
        const wave = (yBase, col, ph) => {
          g.beginPath(); g.moveTo(0, H - yBase);
          for (let px = 0; px <= W; px += 16) g.lineTo(px, H - yBase + Math.sin(px / (90 * u) + ph) * 7 * u);
          g.lineTo(W, H); g.lineTo(0, H); g.closePath();
          g.fillStyle = col; g.fill();
        };
        wave(bh, 'rgba(255,255,255,.94)', 0);
        wave(bh * 0.45, 'rgba(216,30,42,.95)', 0.9);
        return c;
      });
      x.drawImage(st, 0, 0);
      /* awan putih pojok atas (kiri & kanan) */
      const cs = 46 * u;
      frCloud(x, W * 0.14, H * 0.055, cs, 'rgba(250,247,240,.95)', 'rgba(232,182,76,.65)', 2.4 * u);
      frCloud(x, W * 0.86, H * 0.055, cs * 0.82, 'rgba(250,247,240,.92)', 'rgba(232,182,76,.55)', 2.2 * u);
      frCloud(x, W * 0.5, H * 0.038, cs * 0.6, 'rgba(250,247,240,.85)', null);
      /* bendera kecil di pojok bawah kiri */
      x.save();
      x.strokeStyle = '#f3e9d5'; x.lineWidth = 3 * u;
      x.beginPath(); x.moveTo(W * 0.075, H * 0.86); x.lineTo(W * 0.075, H * 0.945); x.stroke();
      const fw = 44 * u, fh = 15 * u, wob = Math.sin(t * 2.4) * 3 * u;
      x.fillStyle = '#d81e2a';
      x.beginPath(); x.moveTo(W * 0.075, H * 0.862);
      x.quadraticCurveTo(W * 0.075 + fw * 0.6, H * 0.862 + wob, W * 0.075 + fw, H * 0.868);
      x.lineTo(W * 0.075 + fw, H * 0.868 + fh); x.quadraticCurveTo(W * 0.075 + fw * 0.6, H * 0.868 + fh + wob, W * 0.075, H * 0.862 + fh);
      x.closePath(); x.fill();
      x.fillStyle = '#faf7f0'; x.fillRect(W * 0.075, H * 0.868 + fh * 0.48, fw, fh * 0.5);
      x.restore();
      /* pita emas bawah utk deskripsi */
      const bw = W * 0.62, bx = (W - bw) / 2, by = H * 0.905;
      roundedRectPath(x, bx, by, bw, 46 * u, 23 * u);
      x.fillStyle = frGrad2(x, bx, by, bx, by + 46 * u, [[0, '#f7cd5b'], [0.5, '#e0a52e'], [1, '#c8871f']]);
      x.fill();
      x.strokeStyle = 'rgba(120,72,10,.65)'; x.lineWidth = 2 * u; x.stroke();
      /* kilau bintang emas */
      frSparkle(x, W * 0.3, H * 0.1, 7 * u, 0.45 + 0.55 * Math.sin(t * 2.9 + 1));
      frSparkle(x, W * 0.72, H * 0.13, 6 * u, 0.45 + 0.55 * Math.sin(t * 3.4 + 3));
      frSparkle(x, W * 0.18, H * 0.62, 6 * u, 0.4 + 0.4 * Math.sin(t * 2.2 + 5));
      frSparkle(x, W * 0.85, H * 0.55, 7 * u, 0.4 + 0.4 * Math.sin(t * 3.1 + 2.2));
    }
  },

  /* ---------------- 3. KAYU & BUNGA ---------------- */
  kayu: {
    bg(x, W, H) {
      const g = x.createRadialGradient(W / 2, H * 0.4, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, '#f7efdd'); g.addColorStop(1, '#eadbbd');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    },
    decor(x, W, H, t, u) {
      const key = `frky|${W}x${H}`;
      const st = getLayer(key, () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        const bw = 30 * u;
        /* rangka kayu */
        g.fillStyle = '#8a5a2b';
        g.fillRect(0, 0, W, bw); g.fillRect(0, H - bw, W, bw);
        g.fillRect(0, 0, bw, H); g.fillRect(W - bw, 0, bw, H);
        /* serat kayu (deterministik) */
        const rnd = frSeed(20260101);
        g.strokeStyle = 'rgba(94,58,24,.4)'; g.lineWidth = 1.6 * u;
        for (let i = 0; i < 26; i++) {
          const yy = rnd() * H, xx = rnd() * W, horiz = yy < bw || yy > H - bw;
          g.beginPath();
          if (horiz) { g.moveTo(rnd() * W, yy); g.lineTo(rnd() * W * 0.4 + W * 0.3, yy + (rnd() - 0.5) * 6 * u); }
          else { g.moveTo(xx, rnd() * H); g.lineTo(xx + (rnd() - 0.5) * 6 * u, rnd() * H * 0.4 + H * 0.3); }
          g.stroke();
        }
        /* bevel dalam & luar */
        g.strokeStyle = 'rgba(60,36,12,.8)'; g.lineWidth = 3 * u;
        g.strokeRect(bw, bw, W - bw * 2, H - bw * 2);
        g.strokeStyle = 'rgba(214,168,104,.7)'; g.lineWidth = 2 * u;
        g.strokeRect(4 * u, 4 * u, W - 8 * u, H - 8 * u);
        /* papan nama kayu di atas (judul digambar di atasnya) */
        const sw = W * 0.56, sh = 92 * u, sx = (W - sw) / 2, sy = 12 * u;
        g.save();
        g.shadowColor = 'rgba(50,30,8,.4)'; g.shadowBlur = 12 * u; g.shadowOffsetY = 5 * u;
        roundedRectPath(g, sx, sy, sw, sh, 12 * u);
        const wg = g.createLinearGradient(0, sy, 0, sy + sh);
        wg.addColorStop(0, '#a5713a'); wg.addColorStop(0.5, '#8a5a2b'); wg.addColorStop(1, '#6f4520');
        g.fillStyle = wg; g.fill();
        g.restore();
        g.strokeStyle = '#54341a'; g.lineWidth = 3 * u;
        roundedRectPath(g, sx, sy, sw, sh, 12 * u); g.stroke();
        /* paku */
        [[sx + 14 * u, sy + sh / 2], [sx + sw - 14 * u, sy + sh / 2]].forEach(([nx, ny]) => {
          g.beginPath(); g.arc(nx, ny, 4 * u, 0, Math.PI * 2);
          g.fillStyle = '#3c2410'; g.fill();
          g.beginPath(); g.arc(nx - 1 * u, ny - 1 * u, 1.6 * u, 0, Math.PI * 2);
          g.fillStyle = 'rgba(255,230,180,.8)'; g.fill();
        });
        /* banner hijau tua bawah utk deskripsi */
        const dw = W * 0.66, dx = (W - dw) / 2, dy = H - 64 * u;
        roundedRectPath(g, dx, dy, dw, 46 * u, 10 * u);
        g.fillStyle = 'rgba(38,66,40,.94)'; g.fill();
        g.strokeStyle = 'rgba(214,190,120,.55)'; g.lineWidth = 2 * u; g.stroke();
        return c;
      });
      x.drawImage(st, 0, 0);
      /* daun + bunga pojok atas (di bawah papan) */
      frLeafCluster(x, 44 * u, 52 * u, 54 * u, false);
      frLeafCluster(x, W - 44 * u, 52 * u, 54 * u, true);
      /* bunga matahari pojok bawah */
      frSunflower(x, 62 * u, H - 64 * u, 34 * u, Math.sin(t * 0.6) * 0.08);
      frSunflower(x, W - 62 * u, H - 64 * u, 34 * u, Math.sin(t * 0.6 + 1.4) * -0.08);
      frSunflower(x, W * 0.86, H * 0.075, 22 * u, Math.sin(t * 0.5 + 2) * 0.1);
    }
  },

  /* ---------------- 4. GELOMBANG WARNA ---------------- */
  gelombang: {
    bg(x, W, H) {
      x.fillStyle = '#f7f0e4'; x.fillRect(0, 0, W, H);
    },
    decor(x, W, H, t, u) {
      const cols = ['#d7263d', '#f4a300', '#e83e8c', '#7b2d8b'];
      const amp = 13 * u, k = 90 * u;
      const band = (edge, ci) => {
        const off = 16 * u + ci * 15 * u;
        const ph = t * (ci % 2 ? 34 : -30) / 16 + ci * 1.7;
        x.beginPath();
        if (edge === 't' || edge === 'b') {
          const yb = edge === 't' ? off : H - off;
          x.moveTo(0, yb);
          for (let px = 0; px <= W; px += 14) x.lineTo(px, yb + Math.sin(px / k + ph) * amp);
          if (edge === 't') { x.lineTo(W, -2); x.lineTo(0, -2); }
          else { x.lineTo(W, H + 2); x.lineTo(0, H + 2); }
        } else {
          const xb = edge === 'l' ? off : W - off;
          x.moveTo(xb, 0);
          for (let py = 0; py <= H; py += 14) x.lineTo(xb + Math.sin(py / k + ph) * amp, py);
          if (edge === 'l') { x.lineTo(-2, H); x.lineTo(-2, 0); }
          else { x.lineTo(W + 2, H); x.lineTo(W + 2, 0); }
        }
        x.closePath();
        x.fillStyle = cols[ci]; x.globalAlpha = 0.92; x.fill(); x.globalAlpha = 1;
      };
      ['t', 'b', 'l', 'r'].forEach(edge => { for (let ci = cols.length - 1; ci >= 0; ci--) band(edge, ci); });
      /* bintang kilau */
      frSparkle(x, W * 0.12, H * 0.14, 9 * u, 0.5 + 0.5 * Math.sin(t * 3.2));
      frSparkle(x, W * 0.88, H * 0.1, 8 * u, 0.5 + 0.5 * Math.sin(t * 2.6 + 2));
      frSparkle(x, W * 0.1, H * 0.85, 8 * u, 0.5 + 0.5 * Math.sin(t * 2.9 + 4));
      frSparkle(x, W * 0.9, H * 0.88, 9 * u, 0.5 + 0.5 * Math.sin(t * 3.5 + 1));
      /* megafon kecil pojok atas (penyemangat ala referensi Pemilu) */
      x.save();
      x.translate(W * 0.82, H * 0.135); x.rotate(-0.5 + Math.sin(t * 1.8) * 0.06);
      x.fillStyle = '#d7263d';
      x.beginPath(); x.moveTo(0, 0); x.lineTo(26 * u, -12 * u); x.lineTo(26 * u, 12 * u); x.closePath(); x.fill();
      x.fillRect(-14 * u, -4 * u, 15 * u, 8 * u);
      x.strokeStyle = '#d7263d'; x.lineWidth = 2.4 * u;
      x.beginPath(); x.arc(30 * u, 0, 9 * u, -1.1, 1.1); x.stroke();
      x.beginPath(); x.arc(30 * u, 0, 15 * u, -0.9, 0.9); x.stroke();
      x.restore();
    }
  },

  /* ---------------- 5. PUTIH ELEGAN ---------------- */
  elegan: {
    bg(x, W, H) {
      x.fillStyle = '#fbf7f0'; x.fillRect(0, 0, W, H);
      const g = x.createRadialGradient(W / 2, H * 0.35, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(196,120,60,.14)');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    },
    decor(x, W, H, t, u) {
      const key = `freleg|${W}x${H}`;
      const st = getLayer(key, () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        /* ornamen sudut jingga melengkung */
        const drawCorner = (sx, sy, mx, my) => {
          g.save(); g.translate(sx, sy); g.scale(mx, my);
          g.strokeStyle = '#d96a2b'; g.lineCap = 'round';
          g.lineWidth = 5 * u;
          g.beginPath(); g.moveTo(26 * u, 86 * u);
          g.quadraticCurveTo(24 * u, 30 * u, 86 * u, 26 * u); g.stroke();
          g.lineWidth = 3 * u;
          g.beginPath(); g.moveTo(40 * u, 112 * u);
          g.quadraticCurveTo(38 * u, 44 * u, 112 * u, 40 * u); g.stroke();
          /* spiral kecil */
          g.beginPath(); g.arc(30 * u, 30 * u, 12 * u, -0.4, Math.PI * 1.35); g.stroke();
          g.fillStyle = '#d96a2b';
          g.beginPath(); g.arc(96 * u, 34 * u, 4.4 * u, 0, Math.PI * 2); g.fill();
          g.beginPath(); g.arc(34 * u, 96 * u, 4.4 * u, 0, Math.PI * 2); g.fill();
          g.restore();
        };
        drawCorner(0, 0, 1, 1); drawCorner(W, 0, -1, 1);
        drawCorner(0, H, 1, -1); drawCorner(W, H, -1, -1);
        /* garis ganda halus */
        g.strokeStyle = 'rgba(217,106,43,.4)'; g.lineWidth = 1.8 * u;
        g.strokeRect(58 * u, 58 * u, W - 116 * u, H - 116 * u);
        g.strokeStyle = 'rgba(229,201,143,.5)'; g.lineWidth = 1.2 * u;
        g.strokeRect(66 * u, 66 * u, W - 132 * u, H - 132 * u);
        return c;
      });
      x.drawImage(st, 0, 0);
      /* pita judul atas (lembut, agar teks judul menonjol) */
      const tw = W * 0.64, tx = (W - tw) / 2;
      roundedRectPath(x, tx, 34 * u, tw, 54 * u, 27 * u);
      x.fillStyle = 'rgba(255,255,255,.82)'; x.fill();
      x.strokeStyle = 'rgba(217,106,43,.55)'; x.lineWidth = 2.2 * u; x.stroke();
      /* wash jingga bawah utk deskripsi */
      const g2 = x.createLinearGradient(0, H * 0.86, 0, H);
      g2.addColorStop(0, 'rgba(217,106,43,0)'); g2.addColorStop(1, 'rgba(217,106,43,.22)');
      x.fillStyle = g2; x.fillRect(0, H * 0.86, W, H * 0.14);
      /* titik emas berjajar atas & bawah */
      x.fillStyle = 'rgba(217,106,43,.7)';
      for (let i = 0; i < 9; i++) {
        const a = 0.35 + 0.65 * Math.abs(Math.sin(t * 2 + i * 0.7));
        x.save(); x.globalAlpha = a;
        x.beginPath(); x.arc(W * 0.2 + i * W * 0.075, H * 0.052, 3 * u, 0, Math.PI * 2); x.fill();
        x.beginPath(); x.arc(W * 0.2 + i * W * 0.075, H * 0.952, 3 * u, 0, Math.PI * 2); x.fill();
        x.restore();
      }
    }
  },

  /* ---------------- 6. AWAN BIRU ---------------- */
  awan: {
    bg(x, W, H) {
      x.fillStyle = '#f5f3ed'; x.fillRect(0, 0, W, H);
    },
    decor(x, W, H, t, u) {
      const key = `frawan|${W}x${H}`;
      const st = getLayer(key, () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        /* baris awan scallop Jepang: belakang muda, depan tua */
        const scallop = (yBase, r, col, dir) => {
          g.beginPath();
          const step = r * 1.55;
          g.moveTo(-r, yBase);
          for (let px = -r; px <= W + r; px += step) g.arc(px + r * 0.5, yBase, r, Math.PI, 0, dir);
          g.closePath();
          g.fillStyle = col; g.fill();
        };
        /* ATAS: dua baris menghadap bawah */
        scallop(H * 0.062, 34 * u, '#bcd6ea', true);
        scallop(H * 0.092, 34 * u, '#5d8fc4', true);
        scallop(H * 0.052, 22 * u, 'rgba(255,255,255,.9)', true);
        /* BAWAH: dua baris menghadap atas + plat navy */
        scallop(H * 0.925, 36 * u, '#bcd6ea', false);
        scallop(H * 0.955, 36 * u, '#4a7cb0', false);
        scallop(H * 0.988, 30 * u, '#2f4f74', false);
        return c;
      });
      x.drawImage(st, 0, 0);
      /* matahari emas kiri-atas berdenyut */
      const sr = (24 + Math.sin(t * 2.2) * 1.6) * u, sx = 72 * u, sy = H * 0.155;
      x.save();
      x.strokeStyle = '#f2b53a'; x.fillStyle = '#f2b53a'; x.lineWidth = 3.4 * u;
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4 + t * 0.15;
        x.beginPath();
        x.moveTo(sx + Math.cos(a) * sr * 1.45, sy + Math.sin(a) * sr * 1.45);
        x.lineTo(sx + Math.cos(a) * sr * 1.95, sy + Math.sin(a) * sr * 1.95);
        x.stroke();
      }
      x.beginPath(); x.arc(sx, sy, sr, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(255,255,255,.35)';
      x.beginPath(); x.arc(sx - sr * 0.3, sy - sr * 0.3, sr * 0.45, 0, Math.PI * 2); x.fill();
      x.restore();
      /* badge merah kecil kanan-atas */
      x.save();
      x.fillStyle = '#d7263d';
      x.beginPath(); x.arc(W - 60 * u, H * 0.15, 12 * u, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#fff';
      x.beginPath(); x.arc(W - 60 * u, H * 0.15, 5 * u, 0, Math.PI * 2); x.fill();
      x.strokeStyle = 'rgba(215,38,61,.5)'; x.lineWidth = 2 * u;
      x.beginPath(); x.arc(W - 60 * u, H * 0.15, (16 + Math.sin(t * 3) * 2) * u, 0, Math.PI * 2); x.stroke();
      x.restore();
      /* plat navy kiri-bawah (deskripsi digambar di atasnya) */
      const pw = W * 0.5, px0 = 34 * u, py0 = H - 74 * u;
      roundedRectPath(x, px0, py0, pw, 44 * u, 9 * u);
      x.fillStyle = 'rgba(35,64,94,.95)'; x.fill();
      x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 1.8 * u; x.stroke();
      /* awan kecil melayang */
      const cx0 = W * 0.62, cy0 = H * 0.14 + Math.sin(t * 0.8) * 6 * u;
      frCloud(x, cx0, cy0, 30 * u, 'rgba(188,214,234,.55)', null);
    }
  },

  /* ---------------- 7. PANEL BIRU ---------------- */
  panel: {
    bg(x, W, H, t, u) {
      const g = x.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#1f7ae0'); g.addColorStop(1, '#0d55c4');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      /* titik-titik konfeti (statis, seeded) */
      const rnd = frSeed(777);
      x.fillStyle = 'rgba(255,255,255,.28)';
      for (let i = 0; i < 46; i++) {
        const px = rnd() * W, py = rnd() * H, r = (1 + rnd() * 2.6) * u;
        x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
      }
    },
    under(x, W, H, t, u, fit) {
      /* panel putih bulat DI BELAKANG video */
      const p = 26 * u, r = Math.round(Math.min(W, H) * 0.05);
      x.save();
      x.shadowColor = 'rgba(6,38,90,.5)'; x.shadowBlur = 26 * u; x.shadowOffsetY = 8 * u;
      roundedRectPath(x, fit.x - p, fit.y - p, fit.w + p * 2, fit.h + p * 2, r);
      x.fillStyle = '#fdfdfb'; x.fill();
      x.restore();
    },
    decor(x, W, H, t, u, fit) {
      const p = 26 * u, r = Math.round(Math.min(W, H) * 0.05);
      /* garis tepi panel */
      roundedRectPath(x, fit.x - p, fit.y - p, fit.w + p * 2, fit.h + p * 2, r);
      x.strokeStyle = 'rgba(120,180,255,.65)'; x.lineWidth = 3 * u; x.stroke();
      /* pita judul di atas panel (dua "logo chip" abstrak) */
      x.save();
      roundedRectPath(x, W * 0.3, H * 0.028, W * 0.4, 40 * u, 20 * u);
      x.fillStyle = 'rgba(255,255,255,.92)'; x.fill();
      x.fillStyle = '#0d55c4';
      x.beginPath(); x.arc(W * 0.335, H * 0.028 + 20 * u, 9 * u, 0, Math.PI * 2); x.fill();
      x.fillRect(W * 0.37, H * 0.028 + 14 * u, W * 0.14, 4 * u);
      x.fillRect(W * 0.37, H * 0.028 + 23 * u, W * 0.09, 4 * u);
      x.restore();
      /* pelat judul biru tua di bawah (deskripsi/part) */
      const bw = W * 0.72, bx = (W - bw) / 2, by = H - 66 * u;
      roundedRectPath(x, bx, by, bw, 48 * u, 24 * u);
      x.fillStyle = 'rgba(9,52,124,.92)'; x.fill();
      x.strokeStyle = 'rgba(140,200,255,.7)'; x.lineWidth = 2.4 * u; x.stroke();
      /* konfeti berjatuhan tipis */
      const rnd = frSeed(4242);
      for (let i = 0; i < 14; i++) {
        const px = rnd() * W, spd = 18 + rnd() * 26;
        const py = ((rnd() * H) + t * spd) % H;
        x.save(); x.globalAlpha = 0.5; x.translate(px, py); x.rotate(t * 1.4 + i);
        x.fillStyle = ['#ffd23f', '#ff5f8f', '#7be0c3', '#ffffff'][i % 4];
        x.fillRect(-3 * u, -5 * u, 6 * u, 10 * u);
        x.restore();
      }
    }
  },

  /* ---------------- 8. GRADIEN TIPIS ---------------- */
  gradien: {
    decor(x, W, H, t, u) {
      const inset = 14 * u, r = Math.round(Math.min(W, H) * 0.045);
      const g = x.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#37e2a0'); g.addColorStop(0.28, '#ffd23f');
      g.addColorStop(0.52, '#ff5f8f'); g.addColorStop(0.75, '#8f6bff');
      g.addColorStop(1, '#2ec5ff');
      const shimmer = 0.9 + 0.1 * Math.sin(t * 2.1);
      /* pendar luar lembut */
      roundedRectPath(x, inset, inset, W - inset * 2, H - inset * 2, r);
      x.save();
      x.globalAlpha = 0.22 * shimmer;
      x.strokeStyle = g; x.lineWidth = 16 * u; x.stroke();
      x.globalAlpha = 1;
      /* garis utama */
      x.lineWidth = 5.5 * u; x.stroke();
      x.restore();
      /* garis dalam tipis putih */
      roundedRectPath(x, inset + 10 * u, inset + 10 * u, W - inset * 2 - 20 * u, H - inset * 2 - 20 * u, r * 0.8);
      x.strokeStyle = `rgba(255,255,255,${0.16 * shimmer})`; x.lineWidth = 1.6 * u; x.stroke();
    }
  },

  /* ================================================================
     v2.16 — 12 FRAME KHUSUS (6 HOROR ALAMGAIB + 6 DANGDUT IDOLADESA)
     Papan judul bertuliskan tema TETAP di bagian atas frame.
     titlePush = judul pengguna digeser ke bawah papan.
     ================================================================ */

  /* ---------------- HOROR 1 · HUTAN MISTIS ---------------- */
  hororhutan: {
    titlePush: 0.072,
    bg(x, W, H) {
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#08150e'); g.addColorStop(0.55, '#05130d'); g.addColorStop(1, '#020a07');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      const v = x.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.52)');
      x.fillStyle = v; x.fillRect(0, 0, W, H);
    },
    decor(x, W, H, t, u) {
      const key = `frhh|${W}x${H}`;
      const st = getLayer(key, () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        const tree = (bx, side) => {
          g.save(); g.translate(bx, 0); if (side < 0) g.scale(-1, 1);
          g.strokeStyle = '#020604'; g.lineCap = 'round';
          g.lineWidth = 26 * u;
          g.beginPath(); g.moveTo(8 * u, H);
          g.quadraticCurveTo(-16 * u, H * 0.66, 18 * u, H * 0.42);
          g.quadraticCurveTo(36 * u, H * 0.26, 10 * u, H * 0.08);
          g.stroke();
          g.lineWidth = 10 * u;
          [[H * 0.62, -34 * u], [H * 0.5, -48 * u], [H * 0.3, -22 * u]].forEach(([yy, dx]) => {
            g.beginPath(); g.moveTo(dx * 0.4, yy); g.quadraticCurveTo(dx, yy - 30 * u, dx * 1.5, yy - 62 * u); g.stroke();
          });
          g.lineWidth = 5 * u;
          for (let i = 0; i < 5; i++) {
            g.beginPath(); g.moveTo(12 * u, H * 0.18 + i * 20 * u);
            g.lineTo(56 * u + i * 7 * u, H * 0.12 + i * 24 * u); g.stroke();
          }
          g.restore();
        };
        tree(26 * u, 1); tree(W - 26 * u, -1);
        frHororPlate(g, W, u);
        frBottomPlate(g, W, H, u, 'horor');
        return c;
      });
      x.drawImage(st, 0, 0);
      frKabut(x, W, H, t, u, 0.3, 12, '160,230,190', 0.16, false);
      frKabut(x, W, H, t, u, 0.78, 14, '160,230,190', 0.22, true);
      /* roh bercahaya hijau melayang naik */
      const rnd = frSeed(60660);
      for (let i = 0; i < 7; i++) {
        const bx = rnd() * W, by0 = rnd() * H * 0.9, spd = 6 + rnd() * 10, rr = (2.4 + rnd() * 3.8) * u;
        const ox = Math.sin(t * 0.5 + i * 1.7) * 26 * u;
        const oy = ((by0 - t * spd) % (H * 0.95) + H * 0.95) % (H * 0.95);
        const a = 0.32 + 0.3 * Math.sin(t * 2.1 + i * 2.2);
        const g2 = x.createRadialGradient(bx + ox, oy, 0.5, bx + ox, oy, rr * 4);
        g2.addColorStop(0, `rgba(185,255,208,${a.toFixed(2)})`); g2.addColorStop(1, 'rgba(185,255,208,0)');
        x.fillStyle = g2; x.beginPath(); x.arc(bx + ox, oy, rr * 4, 0, Math.PI * 2); x.fill();
        x.fillStyle = `rgba(225,255,235,${(a + 0.3).toFixed(2)})`;
        x.beginPath(); x.arc(bx + ox, oy, rr, 0, Math.PI * 2); x.fill();
      }
    }
  },

  /* ---------------- HOROR 2 · KUBURAN LELUHUR ---------------- */
  hororkuburan: {
    titlePush: 0.072,
    bg(x, W, H, t, u) {
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0a0c24'); g.addColorStop(0.6, '#0d0f2c'); g.addColorStop(1, '#05061a');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      const rnd = frSeed(31337);
      x.fillStyle = 'rgba(210,220,255,.5)';
      for (let i = 0; i < 42; i++) {
        x.beginPath(); x.arc(rnd() * W, rnd() * H * 0.55, (0.6 + rnd() * 1.4) * u, 0, Math.PI * 2); x.fill();
      }
    },
    decor(x, W, H, t, u) {
      const key = `frhb|${W}x${H}`;
      const st = getLayer(key, () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        /* pohon mati kanan */
        g.save(); g.strokeStyle = '#050510'; g.lineCap = 'round';
        g.translate(W - 48 * u, 0);
        g.lineWidth = 22 * u;
        g.beginPath(); g.moveTo(0, H * 0.99); g.quadraticCurveTo(26 * u, H * 0.62, -8 * u, H * 0.34); g.stroke();
        g.lineWidth = 8 * u;
        [[H * 0.6, -42 * u, -14 * u], [H * 0.48, 36 * u, 10 * u], [H * 0.38, -24 * u, -8 * u]].forEach(([yy, dx, tx]) => {
          g.beginPath(); g.moveTo(tx, yy); g.quadraticCurveTo(dx, yy - 26 * u, dx * 1.4, yy - 54 * u); g.stroke();
        });
        g.restore();
        /* nisan kiri & kanan */
        frNisan(g, 96 * u, H * 0.985, 56 * u, 86 * u, -0.06, '#3a3f58', '#1c2033');
        frNisan(g, 196 * u, H * 0.995, 44 * u, 64 * u, 0.1, '#333853', '#191d2e');
        frNisan(g, W - 158 * u, H * 0.99, 50 * u, 72 * u, 0.07, '#3a3f58', '#1c2033');
        frHororPlate(g, W, u);
        frBottomPlate(g, W, H, u, 'horor');
        return c;
      });
      x.drawImage(st, 0, 0);
      /* bulan purnama berpendar */
      const mx = W * 0.185, my = H * 0.2, mr = 40 * u;
      const mg = x.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 2.6);
      mg.addColorStop(0, 'rgba(235,240,255,.5)'); mg.addColorStop(1, 'rgba(235,240,255,0)');
      x.fillStyle = mg; x.beginPath(); x.arc(mx, my, mr * 2.6, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#e9edf7'; x.beginPath(); x.arc(mx, my, mr, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(175,185,212,.55)';
      [[-0.3, -0.2, 0.16], [0.25, 0.1, 0.12], [-0.05, 0.32, 0.1]].forEach(([dx, dy, rr]) => {
        x.beginPath(); x.arc(mx + dx * mr, my + dy * mr, rr * mr, 0, Math.PI * 2); x.fill();
      });
      /* awan tipis lewat depan bulan */
      x.save(); x.globalAlpha = 0.55;
      const cx2 = ((t * 12) % (W + 280 * u)) - 140 * u;
      frCloud(x, cx2, my + 10 * u, 42 * u, 'rgba(17,19,44,.9)', null);
      frCloud(x, cx2 - 62 * u, my + 24 * u, 27 * u, 'rgba(17,19,44,.75)', null);
      x.restore();
      /* kawanan kelelawar */
      for (let i = 0; i < 4; i++) {
        const spd = 42 + i * 9, bx = ((t * spd + i * 260 * u) % (W + 170 * u)) - 85 * u;
        const by = H * (0.15 + 0.05 * i) + Math.sin(t * 2.2 + i * 1.3) * 16 * u;
        frBat(x, bx, by, (9 - i) * u, t * 9 + i * 1.7);
      }
      frKabut(x, W, H, t, u, 0.8, 13, '150,160,220', 0.2, true);
      /* hantu kecil muncul sesekali di dekat nisan */
      const ga = Math.pow(Math.max(0, Math.sin(t * 0.9 + 1)), 3) * 0.55;
      frGhost(x, W * 0.26, H * 0.8 - Math.max(0, Math.sin(t * 0.9 + 1)) * 34 * u, 27 * u, t * 2, ga);
    }
  },

  /* ---------------- HOROR 3 · RUMAH BERHANTU ---------------- */
  hororrumah: {
    titlePush: 0.072,
    bg(x, W, H, t, u) {
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0c0a18'); g.addColorStop(1, '#050410');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      /* bulan sabit pucat */
      x.fillStyle = 'rgba(220,226,240,.75)';
      x.beginPath(); x.arc(W * 0.82, H * 0.185, 26 * u, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#0c0a18';
      x.beginPath(); x.arc(W * 0.82 - 11 * u, H * 0.185 - 6 * u, 23 * u, 0, Math.PI * 2); x.fill();
    },
    decor(x, W, H, t, u) {
      const key = `frhr|${W}x${H}`;
      const st = getLayer(key, () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        /* siluet rumah tua kiri-bawah */
        g.save(); g.translate(28 * u, H * 0.99); g.scale(1, -1);
        g.fillStyle = '#040310';
        /* badan rumah */
        g.fillRect(0, 0, 210 * u, 190 * u);
        /* atap */
        g.beginPath(); g.moveTo(-26 * u, 190 * u); g.lineTo(105 * u, 296 * u); g.lineTo(236 * u, 190 * u); g.closePath(); g.fill();
        /* menara */
        g.fillRect(150 * u, 190 * u, 74 * u, 110 * u);
        g.beginPath(); g.moveTo(140 * u, 300 * u); g.lineTo(187 * u, 372 * u); g.lineTo(234 * u, 300 * u); g.closePath(); g.fill();
        /* cerobong */
        g.fillRect(52 * u, 268 * u, 26 * u, 46 * u);
        /* bingkai jendela (cahaya digambar dinamis) */
        g.strokeStyle = 'rgba(130,115,160,.4)'; g.lineWidth = 2.4 * u;
        [[30, 88, 44, 58], [100, 88, 44, 58], [168, 210, 38, 48]].forEach(([wx, wy, ww, wh]) => {
          g.strokeRect(wx * u, wy * u, ww * u, wh * u);
        });
        g.restore();
        /* pagar patah sepanjang bawah */
        g.fillStyle = '#040310';
        const rnd = frSeed(9090);
        for (let px = 44 * u; px < W - 44 * u; px += 30 * u) {
          const hh = (34 + rnd() * 20) * u, tilt = (rnd() - 0.5) * 0.2;
          g.save(); g.translate(px, H * 0.995); g.rotate(tilt);
          g.beginPath();
          g.moveTo(-6 * u, 0); g.lineTo(-6 * u, -hh);
          g.lineTo(0, -hh - 9 * u); g.lineTo(6 * u, -hh); g.lineTo(6 * u, 0);
          g.closePath(); g.fill();
          g.restore();
        }
        g.fillRect(40 * u, H * 0.965, W - 80 * u, 5 * u);
        frHororPlate(g, W, u);
        frBottomPlate(g, W, H, u, 'horor');
        return c;
      });
      x.drawImage(st, 0, 0);
      /* jendela menyala berkedip tak menentu (deterministik) */
      const hx = 28 * u, hy = H * 0.99;
      const wins = [[30, 88, 44, 58], [100, 88, 44, 58], [168, 210, 38, 48]];
      wins.forEach(([wx, wy, ww, wh], i) => {
        const fl = 0.55 + 0.45 * Math.sin(t * 7 + i * 2.4) * Math.sin(t * 3.1 + i);
        const a = clamp(fl, 0.12, 1);
        const wx0 = hx + wx * u, wy0 = hy - wy * u - wh * u;
        const wg = x.createLinearGradient(wx0, wy0, wx0, wy0 + wh * u);
        wg.addColorStop(0, `rgba(255,196,88,${(0.85 * a).toFixed(2)})`);
        wg.addColorStop(1, `rgba(214,120,30,${(0.7 * a).toFixed(2)})`);
        x.fillStyle = wg;
        x.fillRect(wx0, wy0, ww * u, wh * u);
      });
      /* siluet hantu di jendela menara sesekali */
      const ha = Math.pow(Math.max(0, Math.sin(t * 0.7 + 0.6)), 4) * 0.75;
      if (ha > 0.03) frGhost(x, hx + 187 * u, hy - 234 * u, 15 * u, t * 1.6, ha);
      for (let i = 0; i < 3; i++) {
        const spd = 50 + i * 11, bx = ((t * spd + i * 300 * u) % (W + 160 * u)) - 80 * u;
        const by = H * (0.13 + 0.06 * i) + Math.sin(t * 2 + i) * 14 * u;
        frBat(x, bx, by, (8 - i) * u, t * 8.5 + i * 2);
      }
      frKabut(x, W, H, t, u, 0.82, 12, '140,130,190', 0.18, false);
    }
  },

  /* ---------------- HOROR 4 · DARAH KUTUKAN ---------------- */
  horordarah: {
    titlePush: 0.072,
    bg(x, W, H) {
      const g = x.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, '#2d080f'); g.addColorStop(0.6, '#1b0409'); g.addColorStop(1, '#0c0104');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    },
    decor(x, W, H, t, u) {
      const key = `frhd|${W}x${H}`;
      const st = getLayer(key, () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        /* tetesan darah statis menggantung dari tepi atas (sisi kiri & kanan papan) */
        const rnd = frSeed(1313);
        g.fillStyle = 'rgba(150,12,26,.85)';
        for (let i = 0; i < 14; i++) {
          const side = i % 2, dx = side ? W - (20 + rnd() * 110) * u : (20 + rnd() * 110) * u;
          const dy = (10 + rnd() * 30) * u, len = (16 + rnd() * 34) * u;
          g.fillRect(dx - 1.6 * u, 0, 3.2 * u, dy + len);
          g.beginPath(); g.ellipse(dx, dy + len, 4 * u, 6.4 * u, 0, 0, Math.PI * 2); g.fill();
        }
        /* gugusan tengkorak + lilin di pojok bawah kanan */
        frSkull(g, W - 74 * u, H - 96 * u, 34 * u, 'rgba(206,194,170,.9)', 'rgba(24,4,8,.9)');
        frHororPlate(g, W, u);
        frBottomPlate(g, W, H, u, 'horor');
        /* bingkai merah gelap */
        roundedRectPath(g, 16 * u, 16 * u, W - 32 * u, H - 32 * u, Math.round(Math.min(W, H) * 0.03));
        g.strokeStyle = 'rgba(140,14,28,.6)'; g.lineWidth = 3 * u; g.stroke();
        return c;
      });
      x.drawImage(st, 0, 0);
      /* tetesan darah merambat turun (deterministik dari t) */
      const rnd = frSeed(4141);
      for (let i = 0; i < 8; i++) {
        const side = i % 2;
        const dx = side ? W - (34 + rnd() * 90) * u : (34 + rnd() * 90) * u;
        const spd = 14 + rnd() * 20, tot = H * 0.55;
        const dy = ((rnd() * tot) + t * spd) % tot;
        const tg = x.createLinearGradient(0, 0, 0, dy);
        tg.addColorStop(0, 'rgba(164,14,30,.6)'); tg.addColorStop(1, 'rgba(196,22,40,.9)');
        x.fillStyle = tg;
        x.fillRect(dx - 1.4 * u, 0, 2.8 * u, dy);
        x.fillStyle = 'rgba(196,22,40,.95)';
        x.beginPath(); x.ellipse(dx, dy, 3.4 * u, 5.6 * u, 0, 0, Math.PI * 2); x.fill();
      }
      /* lilin menyala di samping tengkorak */
      frLilin(x, W - 118 * u, H - 70 * u, 16 * u, 44 * u, t, 0.4);
      frLilin(x, W - 34 * u, H - 62 * u, 12 * u, 32 * u, t, 2.1);
      /* denyut merah gelap di tepi layar */
      const pv = 0.1 + 0.08 * Math.sin(t * 1.4);
      const vg = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.72);
      vg.addColorStop(0, 'rgba(120,0,10,0)'); vg.addColorStop(1, `rgba(120,0,10,${pv.toFixed(2)})`);
      x.fillStyle = vg; x.fillRect(0, 0, W, H);
    }
  },

  /* ---------------- HOROR 5 · JEJAK HANTU ---------------- */
  hororhantu: {
    titlePush: 0.072,
    bg(x, W, H, t, u) {
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#070b1e'); g.addColorStop(0.6, '#0a1030'); g.addColorStop(1, '#05071a');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      const rnd = frSeed(51515);
      x.fillStyle = 'rgba(200,215,255,.5)';
      for (let i = 0; i < 38; i++) {
        x.beginPath(); x.arc(rnd() * W, rnd() * H * 0.6, (0.6 + rnd() * 1.3) * u, 0, Math.PI * 2); x.fill();
      }
    },
    decor(x, W, H, t, u) {
      const key = `frhg|${W}x${H}`;
      const st = getLayer(key, () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        frHororPlate(g, W, u);
        frBottomPlate(g, W, H, u, 'horor');
        /* bingkai biru pucat halus */
        roundedRectPath(g, 18 * u, 18 * u, W - 36 * u, H - 36 * u, Math.round(Math.min(W, H) * 0.032));
        g.strokeStyle = 'rgba(140,165,220,.45)'; g.lineWidth = 2.6 * u; g.stroke();
        return c;
      });
      x.drawImage(st, 0, 0);
      /* uap ectoplasm naik dari bawah */
      for (let i = 0; i < 3; i++) {
        x.save();
        x.globalAlpha = 0.1;
        const wx = W * (0.14 + i * 0.36) + Math.sin(t * 0.4 + i * 2) * 24 * u;
        const wy = H * 0.92 - ((t * (16 + i * 6)) % (H * 0.7));
        const wg = x.createRadialGradient(wx, wy, 2 * u, wx, wy, 56 * u);
        wg.addColorStop(0, 'rgba(170,200,255,.5)'); wg.addColorStop(1, 'rgba(170,200,255,0)');
        x.fillStyle = wg; x.beginPath(); x.arc(wx, wy, 56 * u, 0, Math.PI * 2); x.fill();
        x.restore();
      }
      /* tiga hantu melayang dengan jalur sinus berbeda */
      frGhost(x, W * 0.14 + Math.sin(t * 0.6) * 20 * u, H * 0.34 + Math.sin(t * 0.9 + 1) * 26 * u, 34 * u, t * 2.2, 0.75);
      frGhost(x, W * 0.86 + Math.sin(t * 0.5 + 2) * 18 * u, H * 0.52 + Math.sin(t * 0.8 + 3) * 22 * u, 26 * u, t * 1.8 + 2, 0.6);
      frGhost(x, W * 0.78 + Math.sin(t * 0.7 + 4) * 16 * u, H * 0.2 + Math.sin(t * 1.1 + 5) * 16 * u, 19 * u, t * 2.6 + 1, 0.45);
      /* kerlip dingin */
      frSparkle(x, W * 0.2, H * 0.14, 7 * u, 0.4 + 0.4 * Math.sin(t * 2.6 + 1), '#cfe0ff');
      frSparkle(x, W * 0.8, H * 0.68, 7 * u, 0.4 + 0.4 * Math.sin(t * 3.1 + 3), '#cfe0ff');
      frSparkle(x, W * 0.1, H * 0.7, 6 * u, 0.3 + 0.4 * Math.sin(t * 2.2 + 5), '#cfe0ff');
    }
  },

  /* ---------------- HOROR 6 · LILIN MALAM ---------------- */
  hororlilin: {
    titlePush: 0.072,
    bg(x, W, H) {
      const g = x.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.18, W / 2, H / 2, Math.max(W, H) * 0.72);
      g.addColorStop(0, '#150f22'); g.addColorStop(0.6, '#0c0817'); g.addColorStop(1, '#060410');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    },
    decor(x, W, H, t, u) {
      const key = `frhl|${W}x${H}`;
      const st = getLayer(key, () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        /* lingkar ritual ganda di sekeliling video */
        g.save();
        g.strokeStyle = 'rgba(150,110,220,.3)'; g.lineWidth = 2 * u;
        g.setLineDash([10 * u, 14 * u]);
        g.beginPath(); g.ellipse(W / 2, H / 2, Math.min(W, H) * 0.46, Math.min(W, H) * 0.46, 0, 0, Math.PI * 2); g.stroke();
        g.setLineDash([4 * u, 18 * u]);
        g.beginPath(); g.ellipse(W / 2, H / 2, Math.min(W, H) * 0.5, Math.min(W, H) * 0.5, 0, 0, Math.PI * 2); g.stroke();
        g.restore();
        frHororPlate(g, W, u);
        frBottomPlate(g, W, H, u, 'horor');
        return c;
      });
      x.drawImage(st, 0, 0);
      /* lilin di kedua sisi bawah + satu kecil di papan */
      frLilin(x, 52 * u, H - 66 * u, 18 * u, 52 * u, t, 0.2);
      frLilin(x, W - 52 * u, H - 66 * u, 18 * u, 52 * u, t, 1.7);
      frLilin(x, 92 * u, H - 58 * u, 12 * u, 34 * u, t, 3.1);
      frLilin(x, W - 92 * u, H - 58 * u, 12 * u, 34 * u, t, 4.4);
      /* asap tipis merambat naik */
      for (let i = 0; i < 2; i++) {
        const sx = (i ? W - 52 : 52) * u;
        x.save(); x.globalAlpha = 0.12;
        x.strokeStyle = '#cfc4e8'; x.lineWidth = 4 * u; x.lineCap = 'round';
        x.beginPath();
        const sy0 = H - 66 * u - 60 * u;
        x.moveTo(sx + Math.sin(t + i) * 3 * u, sy0);
        x.quadraticCurveTo(sx + Math.sin(t * 0.8 + i * 2) * 16 * u, sy0 - 34 * u, sx + Math.sin(t * 0.6 + i) * 26 * u, sy0 - 70 * u);
        x.stroke();
        x.restore();
      }
      /* denyut cahaya ungu lembut */
      const pv = 0.08 + 0.06 * Math.sin(t * 1.1 + 2);
      const vg = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.38, W / 2, H / 2, Math.max(W, H) * 0.7);
      vg.addColorStop(0, 'rgba(90,50,160,0)'); vg.addColorStop(1, `rgba(90,50,160,${pv.toFixed(2)})`);
      x.fillStyle = vg; x.fillRect(0, 0, W, H);
      frSparkle(x, W * 0.16, H * 0.16, 6 * u, 0.35 + 0.4 * Math.sin(t * 2.4 + 1), '#d9c8ff');
      frSparkle(x, W * 0.85, H * 0.24, 6 * u, 0.35 + 0.4 * Math.sin(t * 2.9 + 3), '#d9c8ff');
    }
  },

  /* ---------------- KOPLO 1 · PANGGUNG KOPLO ---------------- */
  koplopanggung: {
    titlePush: 0.072,
    bg(x, W, H) {
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2c0b13'); g.addColorStop(0.6, '#1d070e'); g.addColorStop(1, '#130409');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    },
    decor(x, W, H, t, u) {
      const key = `frkp|${W}x${H}`;
      const st = getLayer(key, () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        /* tirai emas pendek di pojok atas kiri & kanan */
        const curt = (bx, dir) => {
          g.save();
          g.beginPath();
          g.moveTo(bx, 0); g.lineTo(bx + dir * 150 * u, 0);
          g.quadraticCurveTo(bx + dir * 96 * u, 120 * u, bx + dir * 120 * u, 190 * u);
          g.quadraticCurveTo(bx + dir * 66 * u, 120 * u, bx, 150 * u);
          g.closePath();
          const cg = g.createLinearGradient(bx, 0, bx + dir * 150 * u, 0);
          cg.addColorStop(0, '#e0a52e'); cg.addColorStop(1, '#8f5f16');
          g.fillStyle = cg; g.fill();
          g.save(); g.clip();
          for (let i = 0; i < 4; i++) {
            g.fillStyle = i % 2 ? 'rgba(0,0,0,.16)' : 'rgba(255,230,150,.14)';
            g.fillRect(bx + dir * i * 38 * u - (dir < 0 ? 38 * u : 0), 0, 38 * u, 200 * u);
          }
          g.restore();
          g.restore();
        };
        curt(0, 1); curt(W, -1);
        /* pilar emas kiri & kanan */
        [[8 * u, 1], [W - 8 * u - 30 * u, -1]].forEach(([bx, dir]) => {
          const cg = g.createLinearGradient(bx, 0, bx + 30 * u, 0);
          if (dir > 0) { cg.addColorStop(0, '#e0a52e'); cg.addColorStop(1, '#7a5012'); }
          else { cg.addColorStop(0, '#7a5012'); cg.addColorStop(1, '#e0a52e'); }
          g.fillStyle = cg;
          g.fillRect(bx, 0, 30 * u, H);
        });
        /* lantai panggung emas bawah */
        const fg = g.createLinearGradient(0, H - 44 * u, 0, H);
        fg.addColorStop(0, '#8f5f16'); fg.addColorStop(1, '#5d3c0c');
        g.fillStyle = fg; g.fillRect(0, H - 44 * u, W, 44 * u);
        g.fillStyle = '#f5c94e'; g.fillRect(0, H - 44 * u, W, 3.5 * u);
        frSpeaker(g, 62 * u, H - 96 * u, 64 * u, 104 * u, 0, 0);
        frSpeaker(g, W - 62 * u, H - 96 * u, 64 * u, 104 * u, 0, 1.2);
        frDangdutPlate(g, W, u);
        frBottomPlate(g, W, H, u, 'koplo');
        return c;
      });
      x.drawImage(st, 0, 0);
      /* lampu sorot berputar dari pojok atas */
      x.save(); x.globalCompositeOperation = 'lighter';
      const a1 = Math.sin(t * 0.9) * 0.42 + 0.1, a2 = Math.sin(t * 0.9 + 2.4) * 0.42 + 0.1;
      frSorot(x, W * 0.12, 0, a1, H * 0.9, W * 0.1, '255,220,140', 0.14);
      frSorot(x, W * 0.88, 0, -a2, H * 0.9, W * 0.1, '255,170,90', 0.12);
      frSorot(x, W * 0.5, 0, Math.sin(t * 0.6 + 1) * 0.5, H * 0.8, W * 0.07, '255,240,180', 0.1);
      x.restore();
      /* kerlip panggung */
      frSparkle(x, W * 0.14, H * 0.24, 8 * u, 0.4 + 0.5 * Math.sin(t * 3.1));
      frSparkle(x, W * 0.86, H * 0.2, 8 * u, 0.4 + 0.5 * Math.sin(t * 2.7 + 2));
      frSparkle(x, W * 0.5, H * 0.16, 6 * u, 0.3 + 0.4 * Math.sin(t * 3.6 + 4));
    }
  },

  /* ---------------- KOPLO 2 · GENDANG KOPLO ---------------- */
  koplogendang: {
    titlePush: 0.072,
    bg(x, W, H) {
      const g = x.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.72);
      g.addColorStop(0, '#96201f'); g.addColorStop(0.6, '#6d1418'); g.addColorStop(1, '#420b10');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    },
    decor(x, W, H, t, u) {
      const key = `frkg|${W}x${H}`;
      const st = getLayer(key, () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        frSwirlCorner(g, 10 * u, 10 * u, 1, 1, u, '#f0cf6d');
        frSwirlCorner(g, W - 10 * u, 10 * u, -1, 1, u, '#f0cf6d');
        frSwirlCorner(g, 10 * u, H - 10 * u, 1, -1, u, '#f0cf6d');
        frSwirlCorner(g, W - 10 * u, H - 10 * u, -1, -1, u, '#f0cf6d');
        frKendang(g, 108 * u, H - 104 * u, 96 * u, -0.12);
        frGong(g, W - 104 * u, H - 108 * u, 44 * u);
        frDangdutPlate(g, W, u);
        frBottomPlate(g, W, H, u, 'koplo');
        return c;
      });
      x.drawImage(st, 0, 0);
      /* denyut beat koplo: lingkaran energi mengembang */
      const per = 60 / 152;                       /* ±152 BPM */
      const bt = (t % per) / per;
      [[108 * u, H - 104 * u, 1], [W - 104 * u, H - 108 * u, 0.8]].forEach(([cx, cy, k]) => {
        x.save();
        x.strokeStyle = `rgba(255,220,140,${(0.5 * (1 - bt) * k).toFixed(2)})`;
        x.lineWidth = 3 * u;
        x.beginPath(); x.arc(cx, cy, (60 + bt * 70) * u * k, 0, Math.PI * 2); x.stroke();
        x.restore();
      });
      /* catatan musik melayang naik */
      const rnd = frSeed(72727);
      for (let i = 0; i < 6; i++) {
        const nx = rnd() * W, ny0 = rnd() * H, spd = 20 + rnd() * 26;
        const ny = ((ny0 - t * spd) % H + H) % H;
        const a = 0.35 + 0.35 * Math.sin(t * 2 + i * 1.9);
        x.save(); x.globalAlpha = clamp(a, 0.1, 0.8);
        frNote(x, nx + Math.sin(t * 0.9 + i * 1.4) * 18 * u, ny, (10 + rnd() * 8) * u, '#ffe08a', Math.sin(t + i) * 0.4);
        x.restore();
      }
      frSparkle(x, W * 0.2, H * 0.18, 8 * u, 0.4 + 0.5 * Math.sin(t * 3.3));
      frSparkle(x, W * 0.82, H * 0.24, 8 * u, 0.4 + 0.5 * Math.sin(t * 2.9 + 2));
    }
  },

  /* ---------------- KOPLO 3 · GLITER EMAS ---------------- */
  koplogliter: {
    titlePush: 0.072,
    bg(x, W, H) {
      x.fillStyle = '#0d0a06'; x.fillRect(0, 0, W, H);
      const g = x.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.16, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(190,140,40,.34)'); g.addColorStop(1, 'rgba(190,140,40,0)');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    },
    decor(x, W, H, t, u) {
      const key = `frkl|${W}x${H}`;
      const st = getLayer(key, () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        /* bingkai emas ganda + wajik sudut */
        const m1 = 15 * u, r = Math.round(Math.min(W, H) * 0.035);
        roundedRectPath(g, m1, m1, W - m1 * 2, H - m1 * 2, r);
        const gg = g.createLinearGradient(m1, m1, W - m1, H - m1);
        gg.addColorStop(0, '#f5c94e'); gg.addColorStop(0.5, '#b8862e'); gg.addColorStop(1, '#f0cf6d');
        g.strokeStyle = gg; g.lineWidth = 4.5 * u; g.stroke();
        roundedRectPath(g, m1 + 9 * u, m1 + 9 * u, W - m1 * 2 - 18 * u, H - m1 * 2 - 18 * u, r * 0.8);
        g.strokeStyle = 'rgba(245,201,78,.45)'; g.lineWidth = 2 * u; g.stroke();
        [[m1 + 9 * u, m1 + 9 * u], [W - m1 - 9 * u, m1 + 9 * u], [m1 + 9 * u, H - m1 - 9 * u], [W - m1 - 9 * u, H - m1 - 9 * u]]
          .forEach(([dx, dy]) => {
            g.save(); g.translate(dx, dy); g.rotate(Math.PI / 4);
            g.fillStyle = '#f3cf6d'; g.fillRect(-8 * u, -8 * u, 16 * u, 16 * u);
            g.strokeStyle = '#8f5f16'; g.lineWidth = 1.6 * u; g.strokeRect(-8 * u, -8 * u, 16 * u, 16 * u);
            g.restore();
          });
        frDangdutPlate(g, W, u);
        frBottomPlate(g, W, H, u, 'koplo');
        return c;
      });
      x.drawImage(st, 0, 0);
      /* gliter emas berjatuhan */
      const rnd = frSeed(84848);
      for (let i = 0; i < 30; i++) {
        const px = rnd() * W, spd = 24 + rnd() * 40, r0 = (1.2 + rnd() * 2.2) * u;
        const py = ((rnd() * H) + t * spd) % H;
        const a = 0.35 + 0.45 * Math.abs(Math.sin(t * 3 + i * 1.3));
        x.save(); x.globalAlpha = a;
        x.fillStyle = i % 3 ? '#f5c94e' : '#fff0c0';
        x.beginPath(); x.arc(px, py, r0, 0, Math.PI * 2); x.fill();
        x.restore();
      }
      /* kilau besar berdenyut */
      frSparkle(x, W * 0.16, H * 0.15, 10 * u, 0.4 + 0.55 * Math.sin(t * 2.9));
      frSparkle(x, W * 0.84, H * 0.2, 10 * u, 0.4 + 0.55 * Math.sin(t * 3.4 + 2));
      frSparkle(x, W * 0.5, H * 0.12, 7 * u, 0.3 + 0.5 * Math.sin(t * 3.8 + 4));
      frSparkle(x, W * 0.12, H * 0.75, 8 * u, 0.3 + 0.45 * Math.sin(t * 2.4 + 1));
      frSparkle(x, W * 0.88, H * 0.7, 8 * u, 0.3 + 0.45 * Math.sin(t * 3.1 + 3));
    }
  },

  /* ---------------- KOPLO 4 · NEON DISKO ---------------- */
  koploneon: {
    titlePush: 0.072,
    bg(x, W, H, t, u) {
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0d0718'); g.addColorStop(1, '#080510');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      const rnd = frSeed(96969);
      x.fillStyle = 'rgba(255,120,190,.14)';
      for (let i = 0; i < 26; i++) {
        x.beginPath(); x.arc(rnd() * W, rnd() * H, (0.8 + rnd() * 1.6) * u, 0, Math.PI * 2); x.fill();
      }
    },
    decor(x, W, H, t, u) {
      const key = `frkn|${W}x${H}`;
      const st = getLayer(key, () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        /* bingkai neon ganda pink + cyan (shadowBlur aman di cache) */
        const inset = 13 * u, r = Math.round(Math.min(W, H) * 0.045);
        roundedRectPath(g, inset, inset, W - inset * 2, H - inset * 2, r);
        g.lineCap = 'round';
        g.shadowColor = '#ff4fa3'; g.shadowBlur = 16 * u;
        g.strokeStyle = 'rgba(255,79,163,.75)'; g.lineWidth = 5 * u; g.stroke();
        roundedRectPath(g, inset + 9 * u, inset + 9 * u, W - inset * 2 - 18 * u, H - inset * 2 - 18 * u, r * 0.85);
        g.shadowColor = '#2ec5ff'; g.shadowBlur = 12 * u;
        g.strokeStyle = 'rgba(46,197,255,.7)'; g.lineWidth = 3 * u; g.stroke();
        g.shadowBlur = 0;
        frDangdutPlate(g, W, u);
        frBottomPlate(g, W, H, u, 'koplo');
        return c;
      });
      x.drawImage(st, 0, 0);
      /* denyut neon tipis */
      const pl = 0.25 + 0.2 * Math.sin(t * 2.4);
      const inset = 13 * u, r = Math.round(Math.min(W, H) * 0.045);
      x.save(); x.globalAlpha = pl;
      roundedRectPath(x, inset, inset, W - inset * 2, H - inset * 2, r);
      x.strokeStyle = '#ff9ccb'; x.lineWidth = 1.8 * u; x.stroke();
      x.restore();
      /* bola disko berputar di sisi kiri atas */
      frDisco(x, W * 0.14, H * 0.17, 26 * u, t);
      frDisco(x, W * 0.86, H * 0.17, 22 * u, t + 1.4);
      /* titik lampu warna-warni di lantai */
      const cols = ['#ff4fa3', '#2ec5ff', '#ffe08a', '#9be15d'];
      for (let i = 0; i < 10; i++) {
        const lx = W * (0.08 + 0.093 * i), ly = H - 30 * u;
        const a = 0.3 + 0.5 * Math.abs(Math.sin(t * 3.2 + i * 0.9));
        x.save(); x.globalAlpha = a;
        x.fillStyle = cols[i % 4];
        x.beginPath(); x.arc(lx, ly, 5 * u, 0, Math.PI * 2); x.fill();
        x.restore();
      }
    }
  },

  /* ---------------- KOPLO 5 · OBOR DESA ---------------- */
  koploobor: {
    titlePush: 0.072,
    bg(x, W, H, t, u) {
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#452313'); g.addColorStop(0.55, '#301709'); g.addColorStop(1, '#1c0d06');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      const rnd = frSeed(20261);
      x.fillStyle = 'rgba(255,200,110,.3)';
      for (let i = 0; i < 24; i++) {
        x.beginPath(); x.arc(rnd() * W, rnd() * H * 0.7, (0.7 + rnd() * 1.5) * u, 0, Math.PI * 2); x.fill();
      }
    },
    decor(x, W, H, t, u) {
      const key = `frko|${W}x${H}`;
      const st = getLayer(key, () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        /* daun pisang & kembang merah di kedua sisi */
        frLeafCluster(g, 48 * u, H * 0.34, 64 * u, false);
        frLeafCluster(g, W - 48 * u, H * 0.34, 64 * u, true);
        frKembang(g, 88 * u, H * 0.2, 20 * u, '#d81a3c');
        frKembang(g, W - 88 * u, H * 0.24, 17 * u, '#e83e68');
        frDangdutPlate(g, W, u);
        frBottomPlate(g, W, H, u, 'koplo');
        return c;
      });
      x.drawImage(st, 0, 0);
      /* obor bambu menyala di pojok bawah */
      frObor(x, 44 * u, H - 40 * u, 130 * u, 22 * u, t, 0.3);
      frObor(x, W - 44 * u, H - 40 * u, 130 * u, 22 * u, t, 2.2);
      frObor(x, 108 * u, H - 34 * u, 84 * u, 15 * u, t, 3.6);
      frObor(x, W - 108 * u, H - 34 * u, 84 * u, 15 * u, t, 1.1);
      /* kunang-kunang hangat */
      const rnd = frSeed(30303);
      for (let i = 0; i < 6; i++) {
        const fx0 = rnd() * W, fy0 = H * (0.3 + rnd() * 0.5);
        const fx = fx0 + Math.sin(t * 0.7 + i * 1.8) * 30 * u;
        const fy = fy0 + Math.sin(t * 0.9 + i * 2.3) * 22 * u;
        const a = 0.3 + 0.5 * Math.abs(Math.sin(t * 2.6 + i * 1.2));
        x.save(); x.globalAlpha = a;
        x.fillStyle = '#ffe9a8';
        x.beginPath(); x.arc(fx, fy, 2.6 * u, 0, Math.PI * 2); x.fill();
        x.restore();
      }
    }
  },

  /* ---------------- KOPLO 6 · KIPAS GLITER ---------------- */
  koplokipas: {
    titlePush: 0.072,
    bg(x, W, H) {
      const g = x.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.72);
      g.addColorStop(0, '#54124a'); g.addColorStop(0.6, '#370b32'); g.addColorStop(1, '#1d0620');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    },
    decor(x, W, H, t, u) {
      const key = `frkc|${W}x${H}`;
      const st = getLayer(key, () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        /* barisan sequin di sepanjang tepi dalam */
        const m = 22 * u;
        g.fillStyle = 'rgba(255,224,138,.55)';
        for (let px = m; px <= W - m; px += 26 * u) {
          g.beginPath(); g.arc(px, m, 2.6 * u, 0, Math.PI * 2); g.fill();
          g.beginPath(); g.arc(px, H - m, 2.6 * u, 0, Math.PI * 2); g.fill();
        }
        for (let py = m; py <= H - m; py += 26 * u) {
          g.beginPath(); g.arc(m, py, 2.6 * u, 0, Math.PI * 2); g.fill();
          g.beginPath(); g.arc(W - m, py, 2.6 * u, 0, Math.PI * 2); g.fill();
        }
        frDangdutPlate(g, W, u);
        frBottomPlate(g, W, H, u, 'koplo');
        return c;
      });
      x.drawImage(st, 0, 0);
      /* kipas emas mengembang-menutup perlahan di 4 sudut */
      const op = 0.62 + 0.38 * Math.sin(t * 0.7);
      frKipas(x, W * 0.09, H * 0.185, 64 * u, op, 0.5, '#8f5f16', '#ffe08a');
      frKipas(x, W * 0.91, H * 0.185, 64 * u, 1.05 - op, -0.5, '#8f5f16', '#ffe08a');
      frKipas(x, W * 0.075, H * 0.99, 74 * u, 1.05 - op, 0.34, '#7a4a22', '#f5c94e');
      frKipas(x, W * 0.925, H * 0.99, 74 * u, op, -0.34, '#7a4a22', '#f5c94e');
      /* sequin berjatuhan pink-emas */
      const rnd = frSeed(61616);
      for (let i = 0; i < 16; i++) {
        const px = rnd() * W, spd = 22 + rnd() * 34;
        const py = ((rnd() * H) + t * spd) % H;
        x.save(); x.globalAlpha = 0.5; x.translate(px, py); x.rotate(t * 1.6 + i);
        x.fillStyle = i % 2 ? '#ff8fc2' : '#ffe08a';
        x.fillRect(-2.4 * u, -4 * u, 4.8 * u, 8 * u);
        x.restore();
      }
      frSparkle(x, W * 0.3, H * 0.16, 8 * u, 0.35 + 0.5 * Math.sin(t * 3));
      frSparkle(x, W * 0.7, H * 0.2, 8 * u, 0.35 + 0.5 * Math.sin(t * 3.5 + 2));
    }
  },

  /* ================================================================
     v3.0 — 6 FRAME ALAM GAIB (horor Indonesia paling menyeramkan)
     Papan judul "ALAM GAIB" (frGaibPlate) tetap di bagian atas.
     ================================================================ */

  /* ---------------- GAIB 1 · POCONG KEBUN ---------------- */
  gaibpocong: {
    titlePush: 0.072,
    bg(x, W, H, t, u) {
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#060b12'); g.addColorStop(0.55, '#081209'); g.addColorStop(1, '#030706');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      const rnd = frSeed(90210);
      x.fillStyle = 'rgba(205,220,235,.4)';
      for (let i = 0; i < 34; i++) x.fillRect(rnd() * W, rnd() * H * 0.5, (0.7 + rnd() * 1.3) * u, (0.7 + rnd() * 1.3) * u);
      const v = x.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.72);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)');
      x.fillStyle = v; x.fillRect(0, 0, W, H);
    },
    decor(x, W, H, t, u) {
      const key = `frgp|${W}x${H}`;
      const st = getLayer(key, () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        /* gundukan tanah + salib kayu */
        g.fillStyle = '#05090a';
        g.beginPath(); g.ellipse(W * 0.5, H * 1.04, W * 0.62, H * 0.1, 0, 0, Math.PI * 2); g.fill();
        [[W * 0.16, H * 0.96, 40], [W * 0.84, H * 0.97, 32]].forEach(([bx, by, hh]) => {
          g.strokeStyle = '#150f08'; g.lineCap = 'round'; g.lineWidth = 7 * u;
          g.beginPath(); g.moveTo(bx, by); g.lineTo(bx, by - hh * u); g.stroke();
          g.lineWidth = 5 * u;
          g.beginPath(); g.moveTo(bx - 13 * u, by - hh * u * 0.72); g.lineTo(bx + 13 * u, by - hh * u * 0.72); g.stroke();
        });
        frGaibPlate(g, W, u);
        frBottomPlate(g, W, H, u, 'horor');
        return c;
      });
      x.drawImage(st, 0, 0);
      /* pocong melompat menyeberang layar */
      const px = ((t * 46) % (W + 320 * u)) - 160 * u;
      frPocong(x, px, H * 0.92, 46 * u, t * 3.4, t * 2.2);
      /* kunang-kunang hijau */
      const rnd = frSeed(777);
      for (let i = 0; i < 9; i++) {
        const fx = rnd() * W, fy0 = H * (0.35 + rnd() * 0.5), sp = 4 + rnd() * 7;
        const fy = ((fy0 - t * sp) % (H * 0.9) + H * 0.9) % (H * 0.9);
        const a = 0.3 + 0.35 * Math.sin(t * 2.6 + i * 2.1);
        x.fillStyle = `rgba(160,255,190,${clamp(a, 0, 1).toFixed(2)})`;
        x.beginPath(); x.arc(fx + Math.sin(t + i * 2) * 18 * u, fy, 2.2 * u, 0, Math.PI * 2); x.fill();
        x.fillStyle = `rgba(160,255,190,${(a * 0.25).toFixed(2)})`;
        x.beginPath(); x.arc(fx + Math.sin(t + i * 2) * 18 * u, fy, 6.5 * u, 0, Math.PI * 2); x.fill();
      }
      frKabut(x, W, H, t, u, 0.62, 13, '150,235,180', 0.17, true);
    }
  },

  /* ---------------- GAIB 2 · TUYUL BERINGIN ---------------- */
  gaibtuyul: {
    titlePush: 0.072,
    bg(x, W, H, t, u) {
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#07100a'); g.addColorStop(0.6, '#0a140c'); g.addColorStop(1, '#040806');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      const v = x.createRadialGradient(W / 2, H * 0.4, Math.min(W, H) * 0.22, W / 2, H / 2, Math.max(W, H) * 0.7);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.5)');
      x.fillStyle = v; x.fillRect(0, 0, W, H);
    },
    decor(x, W, H, t, u) {
      const key = `frgt|${W}x${H}`;
      const st = getLayer(key, () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        /* batang beringin kanan */
        g.strokeStyle = '#0a0c07'; g.lineCap = 'round';
        g.lineWidth = 30 * u;
        g.beginPath(); g.moveTo(W - 40 * u, H * 1.02); g.quadraticCurveTo(W - 60 * u, H * 0.6, W - 30 * u, H * 0.3); g.stroke();
        /* akar gantung */
        g.lineWidth = 3.4 * u;
        for (let i = 0; i < 7; i++) {
          const rx = W - (70 + i * 26) * u;
          g.beginPath(); g.moveTo(rx, H * 0.3 + (i % 3) * 26 * u);
          g.quadraticCurveTo(rx + 8 * u, H * 0.5, rx + 3 * u, H * (0.62 + (i % 4) * 0.08)); g.stroke();
        }
        /* tajuk rimbun */
        const rnd = frSeed(4242);
        for (let i = 0; i < 12; i++) {
          g.fillStyle = `rgba(${10 + rnd() * 14},${26 + rnd() * 18},${12 + rnd() * 10},.96)`;
          frCloud(g, W - (150 + rnd() * 210) * u, H * (0.1 + rnd() * 0.24), (36 + rnd() * 52) * u, null);
        }
        frGaibPlate(g, W, u);
        frBottomPlate(g, W, H, u, 'horor');
        return c;
      });
      x.drawImage(st, 0, 0);
      /* tuyul duduk di dahan, bergoyang */
      frTuyul(x, W * 0.72, H * 0.34 + Math.sin(t * 1.8) * 4 * u, 40 * u, t * 2.4);
      /* koin emas berjatuhan berputar */
      for (let i = 0; i < 8; i++) {
        const cx2 = W * (0.1 + 0.72 * ((i * 0.37) % 1));
        const cy2 = ((t * (55 + i * 9) + i * 130 * u) % (H * 1.1));
        const r = (5 + (i % 3) * 1.6) * u, sq = Math.abs(Math.sin(t * 3 + i));
        const gy = H * 0.16;
        x.fillStyle = 'rgba(255,208,70,.55)';
        x.beginPath(); x.arc(cx2, cy2, r * 1.5, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#ffd254';
        x.beginPath(); x.ellipse(cx2, cy2, r, Math.max(r * 0.25, r * sq), 0, 0, Math.PI * 2); x.fill();
        x.strokeStyle = 'rgba(120,80,10,.8)'; x.lineWidth = 1.2 * u; x.stroke();
      }
      frKabut(x, W, H, t, u, 0.82, 12, '150,230,170', 0.15, false);
    }
  },

  /* ---------------- GAIB 3 · KUNTILANAK ---------------- */
  gaibkunti: {
    titlePush: 0.072,
    bg(x, W, H, t, u) {
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#120a1c'); g.addColorStop(0.55, '#0d0716'); g.addColorStop(1, '#060410');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      /* bulan merah berdenyut */
      const mx = W * 0.8, my = H * 0.24, mr = 44 * u, pl = 0.75 + 0.25 * Math.sin(t * 1.1);
      const mg = x.createRadialGradient(mx, my, mr * 0.3, mx, my, mr * 2.8);
      mg.addColorStop(0, `rgba(255,80,80,${(0.34 * pl).toFixed(2)})`); mg.addColorStop(1, 'rgba(255,60,60,0)');
      x.fillStyle = mg; x.beginPath(); x.arc(mx, my, mr * 2.8, 0, Math.PI * 2); x.fill();
      x.fillStyle = `rgba(255,120,110,${(0.8 * pl).toFixed(2)})`;
      x.beginPath(); x.arc(mx, my, mr, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(120,30,30,.4)';
      [[-0.25, -0.15, 0.18], [0.2, 0.12, 0.13]].forEach(([dx, dy, rr]) => {
        x.beginPath(); x.arc(mx + dx * mr, my + dy * mr, rr * mr, 0, Math.PI * 2); x.fill();
      });
      const v = x.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.24, W / 2, H / 2, Math.max(W, H) * 0.72);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.5)');
      x.fillStyle = v; x.fillRect(0, 0, W, H);
    },
    decor(x, W, H, t, u) {
      const key = `frgk|${W}x${H}`;
      const st = getLayer(key, () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        /* dahan rimbun dari kiri atas & kanan atas */
        g.strokeStyle = '#07050c'; g.lineCap = 'round';
        g.lineWidth = 16 * u;
        g.beginPath(); g.moveTo(-10, 0); g.quadraticCurveTo(W * 0.18, H * 0.05, W * 0.34, H * 0.02); g.stroke();
        g.lineWidth = 10 * u;
        g.beginPath(); g.moveTo(W + 10, 0); g.quadraticCurveTo(W * 0.8, H * 0.06, W * 0.62, H * 0.02); g.stroke();
        const rnd = frSeed(616);
        for (let i = 0; i < 10; i++) {
          g.fillStyle = `rgba(${9 + rnd() * 10},${6 + rnd() * 8},${16 + rnd() * 12},.96)`;
          frCloud(g, W * (0.05 + rnd() * 0.9), H * (0.015 + rnd() * 0.07), (26 + rnd() * 40) * u, null);
        }
        frGaibPlate(g, W, u);
        frBottomPlate(g, W, H, u, 'horor');
        return c;
      });
      x.drawImage(st, 0, 0);
      /* kuntilanak berdiri melayang di kiri */
      const ka = 0.78 + 0.22 * Math.sin(t * 0.8);
      frKunti(x, W * 0.22, H * 0.94 - Math.sin(t * 0.9) * 10 * u, 110 * u, t * 1.6, ka);
      /* melati berjatuhan */
      for (let i = 0; i < 10; i++) {
        const px2 = W * ((i * 0.41) % 1) + Math.sin(t * 1.4 + i) * 30 * u;
        const py2 = ((t * (30 + i * 7) + i * 170 * u) % (H * 1.08));
        x.fillStyle = 'rgba(250,250,244,.85)';
        x.beginPath(); x.ellipse(px2, py2, 3 * u, 4.4 * u, t * 2 + i, 0, Math.PI * 2); x.fill();
        x.fillStyle = 'rgba(255,225,90,.9)';
        x.beginPath(); x.arc(px2, py2, 1.3 * u, 0, Math.PI * 2); x.fill();
      }
      frKabut(x, W, H, t, u, 0.86, 12, '190,160,220', 0.14, true);
    }
  },

  /* ---------------- GAIB 4 · API SANGGAH ---------------- */
  gaibsanggah: {
    titlePush: 0.072,
    bg(x, W, H, t, u) {
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#100b07'); g.addColorStop(0.55, '#0d0906'); g.addColorStop(1, '#060402');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      const gl = 0.5 + 0.5 * Math.sin(t * 2.3);
      const fg = x.createRadialGradient(W / 2, H * 0.78, 10, W / 2, H * 0.78, Math.max(W, H) * 0.5);
      fg.addColorStop(0, `rgba(255,140,40,${(0.16 + 0.08 * gl).toFixed(2)})`); fg.addColorStop(1, 'rgba(255,120,30,0)');
      x.fillStyle = fg; x.fillRect(0, 0, W, H);
      const v = x.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.24, W / 2, H / 2, Math.max(W, H) * 0.72);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.5)');
      x.fillStyle = v; x.fillRect(0, 0, W, H);
    },
    decor(x, W, H, t, u) {
      const key = `frgs|${W}x${H}`;
      const st = getLayer(key, () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        /* altar batu 2 tingkat di tengah bawah */
        const ax = W / 2, ay = H * 0.985, aw = Math.min(W * 0.3, 300 * u);
        g.fillStyle = '#1a140d';
        roundedRectPath(g, ax - aw / 2, ay - 64 * u, aw, 64 * u, 6 * u); g.fill();
        g.fillStyle = '#221a10';
        roundedRectPath(g, ax - aw * 0.34, ay - 112 * u, aw * 0.68, 52 * u, 5 * u); g.fill();
        g.strokeStyle = 'rgba(255,170,80,.25)'; g.lineWidth = 1.6 * u;
        g.strokeRect(ax - aw * 0.34, ay - 112 * u, aw * 0.68, 52 * u);
        /* tengkorak kecil di atas altar */
        frSkull(g, ax - aw * 0.18, ay - 128 * u, 15 * u, 'rgba(214,204,182,.9)', 'rgba(16,10,6,.9)');
        frSkull(g, ax + aw * 0.18, ay - 128 * u, 15 * u, 'rgba(214,204,182,.9)', 'rgba(16,10,6,.9)');
        frGaibPlate(g, W, u);
        frBottomPlate(g, W, H, u, 'horor');
        return c;
      });
      x.drawImage(st, 0, 0);
      /* lidah api menyala di atas altar */
      const ax = W / 2, fy = H * 0.985 - 112 * u;
      for (let i = 0; i < 3; i++) {
        const fw = (30 - i * 8) * u, fh = (58 + i * 14) * u;
        const wob = Math.sin(t * (9 + i * 3) + i * 2) * 6 * u;
        const fg = x.createLinearGradient(ax, fy - fh, ax, fy);
        fg.addColorStop(0, i === 0 ? 'rgba(255,240,160,.95)' : 'rgba(255,180,60,.6)');
        fg.addColorStop(0.6, 'rgba(255,110,20,.75)'); fg.addColorStop(1, 'rgba(180,40,0,0)');
        x.fillStyle = fg;
        x.beginPath();
        x.moveTo(ax - fw, fy);
        x.quadraticCurveTo(ax - fw * 0.4 + wob, fy - fh * 0.55, ax + wob * 1.6, fy - fh);
        x.quadraticCurveTo(ax + fw * 0.4 + wob, fy - fh * 0.55, ax + fw, fy);
        x.closePath(); x.fill();
      }
      /* bara & percikan naik */
      const rnd = frSeed(555);
      for (let i = 0; i < 10; i++) {
        const ex = ax + (rnd() - 0.5) * W * 0.24, ey0 = fy - rnd() * 40 * u, sp = 26 + rnd() * 44;
        const ey = ((ey0 - t * sp) % (H * 0.6) + H * 0.6) % (H * 0.6) + H * 0.2;
        const a = clamp(0.5 + 0.5 * Math.sin(t * 3 + i * 1.9), 0, 1);
        x.fillStyle = `rgba(255,${140 + i * 6},50,${(a * 0.8).toFixed(2)})`;
        x.beginPath(); x.arc(ex + Math.sin(t * 2 + i) * 12 * u, ey, (1.4 + (i % 3)) * u, 0, Math.PI * 2); x.fill();
      }
      /* asap dupa tipis */
      x.save(); x.globalAlpha = 0.3;
      x.strokeStyle = 'rgba(190,180,170,.5)'; x.lineWidth = 4 * u; x.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const sx = ax + (i ? 60 : -60) * u;
        x.beginPath(); x.moveTo(sx, fy - 20 * u);
        for (let k = 1; k <= 6; k++) x.lineTo(sx + Math.sin(t * 1.6 + k + i * 2) * 10 * u * k / 3, fy - 20 * u - k * 22 * u);
        x.stroke();
      }
      x.restore();
    }
  },

  /* ---------------- GAIB 5 · KABUT MAKAM ---------------- */
  gaibmakam: {
    titlePush: 0.072,
    bg(x, W, H, t, u) {
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0c1210'); g.addColorStop(0.6, '#0a0f0d'); g.addColorStop(1, '#050807');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      const v = x.createRadialGradient(W / 2, H * 0.4, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.7);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)');
      x.fillStyle = v; x.fillRect(0, 0, W, H);
    },
    decor(x, W, H, t, u) {
      const key = `frgm|${W}x${H}`;
      const st = getLayer(key, () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        /* tiga nisan tua miring + pohon mati kecil */
        frNisan(g, W * 0.16, H * 0.97, 62 * u, 96 * u, -0.09, '#2c3230', '#151a18');
        frNisan(g, W * 0.31, H * 0.99, 46 * u, 66 * u, 0.12, '#272d2b', '#131715');
        frNisan(g, W * 0.78, H * 0.98, 56 * u, 84 * u, 0.07, '#2c3230', '#151a18');
        g.strokeStyle = '#04060a'; g.lineCap = 'round'; g.lineWidth = 14 * u;
        g.beginPath(); g.moveTo(W * 0.55, H * 0.99); g.quadraticCurveTo(W * 0.53, H * 0.7, W * 0.57, H * 0.52); g.stroke();
        g.lineWidth = 5 * u;
        [[0, 1], [1, -1]].forEach(([i, dir]) => {
          g.beginPath(); g.moveTo(W * 0.56, H * (0.7 - i * 0.1));
          g.quadraticCurveTo(W * (0.6 + i * 0.02), H * (0.62 - i * 0.1), W * (0.63 + i * 0.03) * dir, H * (0.56 - i * 0.1)); g.stroke();
        });
        frGaibPlate(g, W, u);
        frBottomPlate(g, W, H, u, 'horor');
        return c;
      });
      x.drawImage(st, 0, 0);
      /* kabut tekat 3 lapis */
      frKabut(x, W, H, t, u, 0.34, 16, '150,200,175', 0.2, false);
      frKabut(x, W, H, t, u, 0.62, 18, '150,200,175', 0.24, true);
      frKabut(x, W, H, t, u, 0.86, 14, '150,200,175', 0.3, false);
      /* cahaya samar merambat (will-o'-wisp) */
      const wx = W * (0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.35)));
      const wy = H * (0.55 + 0.16 * Math.sin(t * 0.7));
      const wg = x.createRadialGradient(wx, wy, 1, wx, wy, 30 * u);
      const wa = 0.4 + 0.35 * Math.sin(t * 2.4);
      wg.addColorStop(0, `rgba(190,255,215,${clamp(wa, 0, 1).toFixed(2)})`); wg.addColorStop(1, 'rgba(190,255,215,0)');
      x.fillStyle = wg; x.beginPath(); x.arc(wx, wy, 30 * u, 0, Math.PI * 2); x.fill();
      /* hantu muncul sesekali di antara nisan */
      const ga = Math.pow(Math.max(0, Math.sin(t * 0.55 + 0.8)), 4) * 0.5;
      frGhost(x, W * 0.68, H * 0.6, 34 * u, t * 1.7, ga);
    }
  },

  /* ---------------- GAIB 6 · RITUAL TENGAH MALAM ---------------- */
  gaibritual: {
    titlePush: 0.072,
    bg(x, W, H, t, u) {
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0d0818'); g.addColorStop(0.55, '#0c0a1e'); g.addColorStop(1, '#050410');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      const rnd = frSeed(1212);
      x.fillStyle = 'rgba(215,205,255,.4)';
      for (let i = 0; i < 30; i++) x.fillRect(rnd() * W, rnd() * H * 0.55, (0.7 + rnd()) * u, (0.7 + rnd()) * u);
      const gl = 0.5 + 0.5 * Math.sin(t * 1.7);
      const fg = x.createRadialGradient(W / 2, H * 0.72, 6, W / 2, H * 0.72, Math.max(W, H) * 0.42);
      fg.addColorStop(0, `rgba(150,80,255,${(0.13 + 0.09 * gl).toFixed(2)})`); fg.addColorStop(1, 'rgba(150,80,255,0)');
      x.fillStyle = fg; x.fillRect(0, 0, W, H);
      const v = x.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.24, W / 2, H / 2, Math.max(W, H) * 0.72);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.5)');
      x.fillStyle = v; x.fillRect(0, 0, W, H);
    },
    decor(x, W, H, t, u) {
      const key = `frgr|${W}x${H}`;
      const st = getLayer(key, () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        /* lingkar ritual di lantai */
        g.strokeStyle = 'rgba(160,110,255,.35)'; g.lineWidth = 3 * u;
        g.beginPath(); g.ellipse(W / 2, H * 0.84, W * 0.2, H * 0.055, 0, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = 'rgba(160,110,255,.18)'; g.lineWidth = 1.4 * u;
        g.beginPath(); g.ellipse(W / 2, H * 0.84, W * 0.155, H * 0.042, 0, 0, Math.PI * 2); g.stroke();
        frGaibPlate(g, W, u);
        frBottomPlate(g, W, H, u, 'horor');
        return c;
      });
      x.drawImage(st, 0, 0);
      /* enam lilin mengelilingi lingkar */
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        const cx2 = W / 2 + Math.cos(ang) * W * 0.185;
        const cy2 = H * 0.84 + Math.sin(ang) * H * 0.05;
        frLilin(x, cx2, cy2, 10 * u, (22 + (i % 3) * 7) * u, t, i * 1.3);
      }
      /* mantera/glyph berputar di tengah lingkar */
      const rcx = W / 2, rcy = H * 0.8;
      x.save(); x.translate(rcx, rcy); x.rotate(t * 0.5);
      x.strokeStyle = 'rgba(200,160,255,.5)'; x.lineWidth = 2 * u; x.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, rr = 34 * u;
        x.save(); x.translate(Math.cos(a) * rr, Math.sin(a) * rr * 0.35); x.rotate(a + t);
        x.beginPath();
        x.moveTo(-4 * u, -6 * u); x.lineTo(4 * u, 0); x.lineTo(-4 * u, 6 * u);
        x.stroke();
        x.restore();
      }
      x.restore();
      /* inti cahaya ungu berdenyut */
      const pl = 0.6 + 0.4 * Math.sin(t * 2.2);
      const cg = x.createRadialGradient(rcx, rcy, 2, rcx, rcy, 46 * u);
      cg.addColorStop(0, `rgba(210,160,255,${(0.5 * pl).toFixed(2)})`); cg.addColorStop(1, 'rgba(210,160,255,0)');
      x.fillStyle = cg; x.beginPath(); x.arc(rcx, rcy, 46 * u, 0, Math.PI * 2); x.fill();
      frKabut(x, W, H, t, u, 0.9, 10, '170,140,230', 0.14, true);
    }
  }
};

/* ---------- dispatcher dipanggil drawComposition ---------- */
function frameDef() { return FRAMES[state.frameStyle] || null; }
function drawFrameBg(x, W, H, t, u) {
  const F = frameDef();
  if (F && F.bg) F.bg(x, W, H, t, u);
}
function drawFrameUnder(x, W, H, t, u, fit) {
  const F = frameDef();
  if (F && F.under) F.under(x, W, H, t, u, fit);
}
function drawFrameDecor(x, W, H, t, u, live, fit) {
  const F = frameDef();
  if (F && F.decor) F.decor(x, W, H, live ? performance.now() / 1000 : (t || 0), u, fit);
}

/* ---------- v2.16: papan judul memakai Cinzel 900 / Anton 400 ----------
   Saat kedua font selesai dimuat, bersihkan cache lapisan frame (kunci
   diawali "fr") supaya banner tergambar ulang dengan font yang benar —
   bukan font fallback yang sempat ter-cache sebelum font siap. */
if (document.fonts && document.fonts.load) {
  Promise.all([
    document.fonts.load('900 48px "Cinzel"'),
    document.fonts.load('400 48px "Anton"')
  ]).then(() => {
    [..._layerCache.keys()].forEach(k => { if (k.startsWith('fr')) _layerCache.delete(k); });
    if (typeof updateAll === 'function') { try { updateAll(); } catch (e) { } }
  }).catch(() => { });
}
