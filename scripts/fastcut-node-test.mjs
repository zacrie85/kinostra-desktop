/* ================================================================
   UJI NODE — mesin POTONG LANGSUNG (fastcut.js) tanpa Electron
   Jalankan: node scripts/fastcut-node-test.mjs
   ================================================================ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execSync } from 'node:child_process';

const ROOT = '/home/z/my-project';
const SRC = process.argv[2] || `${ROOT}/testmedia/v38-3scn12.mp4`;
const OUT = '/tmp/kinofastcut-node';
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

vm.runInThisContext(fs.readFileSync(`${ROOT}/renderer/js/fastcut.js`, 'utf8'), { filename: 'fastcut.js' });
const g = globalThis;

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  LULUS  ${name}`); }
  else { fail++; console.log(`  GAGAL  ${name} ${extra}`); }
};

/* I/O Node → fastcut */
const fileSize = fs.statSync(SRC).size;
const read = async (start, len) => {
  const buf = Buffer.alloc(Math.min(len, fileSize - start));
  const fh = fs.openSync(SRC, 'r');
  fs.readSync(fh, buf, 0, buf.length, start);
  fs.closeSync(fh);
  return new Uint8Array(buf);
};

console.log(`Sumber: ${path.basename(SRC)} (${(fileSize / 1048576).toFixed(2)} MB)`);
const P = await g.fcParseMp4(read, fileSize);
console.log('  video:', P.video.fmt, `${P.video.width}x${P.video.height}`, `${P.video.nSamp} sampel`, `dur ${(P.video.dur / P.video.ts).toFixed(2)} dtk`, `sync=${P.video.syncArr ? P.video.syncArr.length : 'SEMUA'}`);
if (P.audio) console.log('  audio:', P.audio.fmt, `${P.audio.nSamp} sampel`, `dur ${(P.audio.dur / P.audio.ts).toFixed(2)} dtk`);

ok('Parser: track video ada & ada dts', P.video && P.video.nSamp > 10 && P.video.dur > 0);
ok('Parser: ukuran total sampel masuk akal (< ukuran file)',
  g.fcRunsBytes(P.video, 0, P.video.nSamp) + (P.audio ? g.fcRunsBytes(P.audio, 0, P.audio.nSamp) : 0) <= fileSize * 1.02,
  `v=${g.fcRunsBytes(P.video, 0, P.video.nSamp)} a=${P.audio ? g.fcRunsBytes(P.audio, 0, P.audio.nSamp) : 0}`);

const durS = P.video.dur / P.video.ts;
const HALF = durS / 2;
const plans = g.fcPlanRanges(P, [{ start: 0, end: HALF }, { start: HALF, end: durS }]);
console.log('  rencana:', JSON.stringify(plans.map(p => ({ vi: [p.vi0, p.vi1], ai: [p.ai0, p.ai1], dur: +p.dur.toFixed(2) }))));

const _openFiles = new Map();
const writer = {
  async begin(nm) {
    const p = path.join(OUT, nm);
    const id = fs.openSync(p, 'w');
    _openFiles.set(id, p);
    return { id, path: p };
  },
  async chunk(id, u8) { fs.writeSync(id, u8); },
  async end(id) {
    const p = _openFiles.get(id);
    try { fs.closeSync(id); } catch (e) { }
    _openFiles.delete(id);
    return { path: p, size: fs.statSync(p).size };
  },
  async abort(id) {
    const p = _openFiles.get(id);
    try { fs.closeSync(id); } catch (e) { }
    _openFiles.delete(id);
    if (p) try { fs.unlinkSync(p); } catch (e) { }
  }
};
const io = { read, CHUNK: 65536, isAborted: () => false, prog: null };

const t0 = Date.now();
for (let i = 0; i < plans.length; i++) {
  const r = await g.fcWritePart(P, plans[i], `CUT_${String(i + 1).padStart(2, '0')}.mp4`, writer, io);
  console.log(`  hasil: ${r.name} ${(r.size / 1048576).toFixed(2)} MB dur-rencana ${r.dur.toFixed(2)} dtk`);
}
console.log(`  waktu potong: ${Date.now() - t0} ms`);

/* validasi hasil */
for (let i = 0; i < plans.length; i++) {
  const f = path.join(OUT, `CUT_${String(i + 1).padStart(2, '0')}.mp4`);
  const dur = +execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 '${f}'`).toString().trim();
  const exp = plans[i].dur;
  ok(`Part ${i + 1}: ffprobe bisa baca & durasi pas (±0.25 dtk)`, Math.abs(dur - exp) < 0.25, `dur=${dur.toFixed(2)} exp=${exp.toFixed(2)}`);
  const dec = execSync(`ffmpeg -v error -i '${f}' -f null - 2>&1`).toString().trim();
  ok(`Part ${i + 1}: ffmpeg decode TANPA error`, dec === '', dec.slice(0, 200));
  const st = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,nb_frames -of csv=p=0 '${f}'`).toString().trim();
  console.log(`  part ${i + 1}: ${st}`);
  const sa = execSync(`ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 '${f}'`).toString().trim();
  ok(`Part ${i + 1}: audio ikut tersalin`, !!sa === !!P.audio, `a='${sa}'`);
  if (sa) {
    const dv2 = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=duration -of csv=p=0 '${f}'`).toString().trim();
    const da2 = execSync(`ffprobe -v error -select_streams a:0 -show_entries stream=duration -of csv=p=0 '${f}'`).toString().trim();
    const vv = parseFloat(dv2) || 0, aa = parseFloat(da2) || 0;
    ok(`Part ${i + 1}: durasi audio mengikuti video (±0.25 dtk)`, Math.abs(vv - aa) < 0.25, `v=${vv.toFixed(2)} a=${aa.toFixed(2)}`);
  }
}
/* potongan tengah (uji keyframe murni) */
const mid = g.fcPlanRanges(P, [{ start: durS * 0.37, end: durS * 0.63 }]);
const rm = await g.fcWritePart(P, mid[0], 'CUT_MID.mp4', writer, io);
const durM = +execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 '${rm.path}'`).toString().trim();
ok('Potongan tengah: durasi ≥ rencana (mulai digeser ke keyframe)', durM >= mid[0].dur - 0.05, `dur=${durM.toFixed(2)} exp=${mid[0].dur.toFixed(2)}`);
const decM = execSync(`ffmpeg -v error -i '${rm.path}' -f null - 2>&1`).toString().trim();
ok('Potongan tengah: decode tanpa error', decM === '', decM.slice(0, 200));

console.log(`\nHasil: ${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
