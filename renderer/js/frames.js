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
function frSparkle(x, cx, cy, r, a) {
  x.save(); x.globalAlpha = clamp(a, 0, 1);
  x.fillStyle = '#ffe9a8';
  x.beginPath();
  x.moveTo(cx, cy - r); x.quadraticCurveTo(cx + r * 0.16, cy - r * 0.16, cx + r, cy);
  x.quadraticCurveTo(cx + r * 0.16, cy + r * 0.16, cx, cy + r);
  x.quadraticCurveTo(cx - r * 0.16, cy + r * 0.16, cx - r, cy);
  x.quadraticCurveTo(cx - r * 0.16, cy - r * 0.16, cx, cy - r);
  x.fill(); x.restore();
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
