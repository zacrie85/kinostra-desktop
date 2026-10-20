/* ================================================================
   KINOSTRA v3.1 — GENERATOR MEDIA UJI "PODCAST 2 ORANG"
   Video 640×360@30fps · 30 dtk: 2 sosok mirip manusia (kiri MERAH,
   kanan BIRU). Saat bergantian "bicara": mulut bergerak + kepala
   sedikit menoleh + audio suara (mono, TIDAK di-pan — membuktikan
   zoom mengikuti GERAKAN MULUT, bukan keseimbangan kanal stereo).
   Jalur bicara: 0-5 senyap · 5-11 KIRI · 11-15 senyap · 15-21 KANAN
   · 21-26 KIRI · 26-30 KANAN.
   Jalankan: node scripts/kinostra-v31-mkmedia.mjs
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const W = 640, H = 360, FPS = 30, DUR = 30, N = W * H;
const OUT = '/home/z/my-project/testmedia/podcast.mp4';

/* jendela bicara: [mulai, akhir, siapa] — 0=kiri, 1=kanan */
const TALK = [[0, 5, -1], [5, 11, 0], [11, 15, -1], [15, 21, 1], [21, 26, 0], [26, 30, 1]];
const whoTalks = t => { for (const [a, b, w] of TALK) if (t >= a && t < b) return w; return -1; };

function setPx(buf, x, y, r, g, b) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b;
}
function rect(buf, x0, y0, x1, y1, c) {
  for (let y = Math.round(y0); y < Math.round(y1); y++)
    for (let x = Math.round(x0); x < Math.round(x1); x++) setPx(buf, x, y, c[0], c[1], c[2]);
}
function disc(buf, cx, cy, rad, c) {
  for (let y = Math.ceil(cy - rad); y <= cy + rad; y++)
    for (let x = Math.ceil(cx - rad); x <= cx + rad; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= rad * rad) setPx(buf, x, y, c[0], c[1], c[2]);
    }
}
/* gambar satu "orang" podcast — badan + kepala + mulut yang bergerak */
function person(buf, cx, shirt, active, t) {
  const bob = active ? Math.round(Math.sin(t * 6.0) * 2) : 0;      /* gerak kepala saat bicara */
  const hy = 96 + bob;
  /* badan (baju) — trapesium bahu */
  rect(buf, cx - 44, 130, cx + 44, 332, shirt);
  rect(buf, cx - 58, 130, cx + 58, 168, shirt);
  /* leher */
  rect(buf, cx - 10, 118, cx + 10, 134, [232, 200, 172]);
  /* kepala */
  disc(buf, cx, hy, 36, [255, 222, 192]);
  disc(buf, cx, hy - 16, 33, [52, 40, 34]);                       /* rambut atas */
  disc(buf, cx, hy - 8, 30, [255, 222, 192]);
  /* mata */
  rect(buf, cx - 18, hy - 8, cx - 8, hy - 4, [24, 22, 24]);
  rect(buf, cx + 8, hy - 8, cx + 18, hy - 4, [24, 22, 24]);
  /* mulut — HANYA bergerak saat aktif (sumber sinyal lip-motion) */
  const openH = active ? 3 + Math.round(Math.abs(Math.sin(t * 22)) * 9) : 2;
  const mw = active ? 20 : 16;
  rect(buf, cx - mw / 2, hy + 12, cx + mw / 2, hy + 12 + openH, [70, 20, 24]);
}
function frame(t) {
  const buf = Buffer.alloc(N * 3);
  rect(buf, 0, 0, W, H, [17, 19, 25]);                             /* latar studio gelap */
  rect(buf, 0, 300, W, H, [28, 31, 40]);                           /* lantai */
  const w = whoTalks(t);
  person(buf, 160, [206, 44, 52], w === 0, t);                     /* KIRI merah */
  person(buf, 480, [46, 88, 224], w === 1, t);                     /* KANAN biru */
  return buf;
}
/* audio: "suara" bersuku (carrier harmonik + gate silabel) — MONO ke 2 kanal */
function genAudio() {
  const SR = 44100, n = DUR * SR;
  const pcm = Buffer.alloc(n * 4);                                 /* stereo s16le */
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const w = whoTalks(t);
    let v = 0;
    if (w >= 0) {
      const gate = Math.sin(2 * Math.PI * 3.1 * t) > 0.1 ? 1 : 0.06;
      const car = Math.sin(2 * Math.PI * 128 * t) * 0.55 + Math.sin(2 * Math.PI * 196 * t) * 0.35
        + Math.sin(2 * Math.PI * 262 * t) * 0.18;
      v = car * gate * 0.34;
    }
    const s = Math.max(-1, Math.min(1, v));
    const q = Math.round(s * 32000);
    pcm[i * 4] = q & 255; pcm[i * 4 + 1] = (q >> 8) & 255;
    pcm[i * 4 + 2] = q & 255; pcm[i * 4 + 3] = (q >> 8) & 255;
  }
  return pcm;
}

console.log('Membuat audio 30 dtk…');
const pcm = genAudio();
fs.writeFileSync('/tmp/podcast-audio.pcm', pcm);

console.log('Meng-encode podcast.mp4 (ffmpeg)…');
const ff = spawn('ffmpeg', ['-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', 'pipe:0',
  '-f', 's16le', '-ar', '44100', '-ac', '2', '-i', '/tmp/podcast-audio.pcm',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
let fi = 0, done = false;
function pump() {
  while (fi < DUR * FPS) {
    const ok = ff.stdin.write(frame(fi / FPS));
    fi++;
    if (!ok) { ff.stdin.once('drain', pump); return; }
  }
  ff.stdin.end(); done = true;
}
ff.on('close', code => {
  if (code === 0 && done) {
    const sz = fs.statSync(OUT).size;
    console.log(`SELESAI: ${OUT} (${(sz / 1048576).toFixed(2)} MB)`);
    process.exit(0);
  } else { console.error('ffmpeg keluar kode', code); process.exit(1); }
});
pump();
