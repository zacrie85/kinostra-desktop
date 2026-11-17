/* ================================================================
   UJI v3.29.0 — TRANSPLANTASI PROSES EXPORT & SPLIT DARI v3.16.0
   Gejala user: "MERENDER 71 PART · PARALEL 5× … (ULANGI-SW) … Gagal
   ekspor: encoding audio". Akar: sejak v3.17.1 tiap blok audio
   men-decode per jendela lewat decodeAudioWindow; dgn PARALEL 5×
   para worker berebut decoder single-flight (_audioWinBusy, tunggu
   max 5 dtk lalu decode bersamaan) → janji menggantung → watchdog
   5 menit "encoding audio macet".
   Transplantasi (semantik v3.16.0 yang terbukti bagus):
   - renderMix kini hanya membaca state.audioBuffer penuh (v3.16)
   - ensureExportAudio: buffer [0..rentang ekspor] dibangun SEKALI
     berurutan SEBELUM worker pertama jalan (bertahap per jendela —
     RAM lebih rendah daripada decodeAudioData v3.16; impor tak disentuh)
   - GABUNG VIDEO juga menyiapkan buffer per film
   1) Media panjang: impor TANPA buffer penuh (perilaku v3.17+ tetap)
   2) Ekspor PARALEL 5× > jumlah part (skenario user): buffer dibangun
      dulu, ekspor selesai, TIDAK ada "encoding audio macet"
   3) Semua part punya STREAM AUDIO dan audio TIDAK senyap (tone 330 Hz)
   4) state.audioBuffer tersisa (semantik v3.16: buffer penuh siap pakai)
   Pakai: bash scripts/run-test-xvfb.sh scripts/kinostra-v329-test.mjs 120
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/home/z/my-project';
const PORT = 9509;
const VIDEO = '/home/z/my-project/testmedia/long120.mp4';
const OUT = '/home/z/my-project/testmedia/out-v329';
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  LULUS  ' + n)) : (fail++, console.log(`  GAGAL  ${n} ${x}`)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map();
    ws.addEventListener('message', e => { const m = JSON.parse(e.data);
      if (m.id && this.pend.has(m.id)) { const { res, rej } = this.pend.get(m.id); this.pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } });
  }
  static async connect(port, tries = 75) {
    for (let i = 0; i < tries; i++) {
      try { const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        const page = list.find(t => t.type === 'page' && /index\.html/.test(t.url));
        if (page) { const ws = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); setTimeout(() => rej(new Error('ws')), 8000); });
          return new CDP(ws); } } catch (e) { }
      await sleep(1000);
    } throw new Error('CDP tidak tersambung');
  }
  send(method, params = {}) { return new Promise((res, rej) => { const id = ++this.id; this.pend.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expr, timeoutMs = 30000) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: timeoutMs });
    if (r.exceptionDetails) throw new Error('PAGE-ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300));
    return r.result.value;
  }
}
async function reconnect(cdp) {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const pg = list.find(t => t.type === 'page' && /index\.html/.test(t.url));
  if (!pg) throw new Error('tidak ada target');
  const ws = new WebSocket(pg.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); setTimeout(() => rej(new Error('ws')), 8000); });
  cdp.ws = ws; cdp.pend = new Map();
}
async function evalRace(cdp, expr, ms = 15000) {
  let to;
  return Promise.race([cdp.eval(expr), new Promise((_, rej) => { to = setTimeout(() => rej(new Error('eval-timeout')), ms); })]).finally(() => clearTimeout(to));
}
async function evalRetry(cdp, expr, ms = 12000) {
  try { return await evalRace(cdp, expr, ms); }
  catch (e) { await reconnect(cdp); return await evalRace(cdp, expr, ms); }
}
async function loadVideo(cdp) {
  for (let percobaan = 1; percobaan <= 3; percobaan++) {
    await evalRetry(cdp, `loadFromPath(${JSON.stringify(VIDEO)}); 'ok'`, 30000);
    for (let i = 0; i < 30; i++) { await sleep(1000);
      const s = await evalRetry(cdp, `state.duration || 0`, 6000).catch(() => 0);
      if (s > 0) return true; }
  }
  return false;
}
function startApp() {
  const app = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
  process.on('exit', () => { try { app.kill('SIGKILL'); } catch (e) { } });
  return app;
}

try {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const app = startApp();
  const cdp = await CDP.connect(PORT);
  await sleep(2000);
  ok('Video panjang 2 jam (AAC) termuat', await loadVideo(cdp));

  /* 1) prekondisi: impor media panjang TIDAK membuat buffer penuh (jalur v3.17+ tetap; impor tak tersentuh transplantasi) */
  const pre = await evalRetry(cdp, `({ buf: !!(state.audioBuffer && state.audioBuffer.duration), dur: state.duration, demux: !!state._audioDemux })`, 15000);
  ok('Impor media panjang tanpa buffer penuh (impor tak tersentuh) + demux terdeteksi', pre && !pre.buf && pre.dur > 7000 && pre.demux, JSON.stringify(pre));

  /* 2) skenario user: PARALEL 5× dengan 2 part BERSAMAAN — dulu: berebut decoder → 'encoding audio macet'.
     (skala 50% hanya utk kecepatan CI — jalur audio identik dgn resolusi penuh) */
  const exp = await evalRetry(cdp, `(async () => {
    state.rangeStart = 0; state.rangeEnd = 204; state.splitSec = 102; state.splitCustom = true; applySplitParts();
    state.cover.on = false; state.kilat = 'off'; state.parallel = 5;
    state.titleOn = false; state.descOn = false; state.subsOn = false;
    state.partShow = 'intro'; state.partAnim = 'off'; state.partFrame = 'off';
    state.cutMode = 'full'; state.acc = 'cpu'; state.scale = '0.5';
    const subs = [];
    try {
      const res = await exportPartsToDir('${OUT}', { title() { }, prog() { }, sub(s) { subs.push(String(s || '')); } });
      return { n: res.length, fatal: state.exportFatal ? String(state.exportFatal.message) : null,
        bufDur: state.audioBuffer ? Math.round(state.audioBuffer.duration) : 0, subs };
    } catch (e) { return { n: 0, err: String((e && e.message) || e), bufDur: state.audioBuffer ? Math.round(state.audioBuffer.duration) : 0, subs };
    }
  })()`, 400000);
  ok('Ekspor PARALEL 5× (2 part bersamaan) selesai TANPA "encoding audio macet"', exp && exp.n === 2 && !exp.fatal && !exp.err, JSON.stringify({ n: exp && exp.n, fatal: exp && exp.fatal, err: exp && exp.err, sisa: exp && exp.subs && exp.subs.slice(-3) }));
  ok('Buffer audio penuh dibangun SEKALI sebelum render (semantik v3.16: tersisa siap pakai)', exp && exp.bufDur >= 500, 'bufDur=' + (exp && exp.bufDur));
  ok('UI menampilkan persiapan audio (menyiapkan audio penuh)', !!(exp && exp.subs && exp.subs.some(s => /menyiapkan audio penuh/.test(s))), JSON.stringify((exp && exp.subs || []).slice(0, 2)));

  /* 3) hasil: tiap part punya audio TIDAK SENYAP (tone 330 Hz sumber) */
  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.mp4')).sort();
  ok('2 berkas MP4 part dihasilkan', files.length === 2, files.join(','));
  let audioOk = 0, details = [];
  for (const f of files) {
    const p = OUT + '/' + f;
    const sz = fs.statSync(p).size;
    const v = await new Promise(res => {
      const ch = spawn('ffmpeg', ['-v', 'info', '-i', p, '-af', 'volumedetect', '-f', 'null', '-']);
      let out = '';
      ch.stderr.on('data', d => { out += d.toString(); });
      ch.on('close', () => { const m = out.match(/mean_volume:\s*(-?[\d.]+) dB/); res({ vol: m ? parseFloat(m[1]) : -99, sz }); });
      setTimeout(() => { try { ch.kill('SIGKILL'); } catch (e) { } res({ vol: -99, sz }); }, 60000);
    });
    const hasAudio = await new Promise(res => {
      const ch = spawn('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', p]);
      let out = ''; ch.stdout.on('data', d => { out += d.toString(); });
      ch.on('close', () => res(/aac|opus/.test(out)));
    });
    details.push(`${f.slice(0, 14)}… ${Math.round(v.sz / 1024)}KB vol=${v.vol}dB aac=${hasAudio}`);
    if (hasAudio && v.vol > -55 && v.sz > 50000) audioOk++;
  }
  ok('Semua part: stream audio ada & TIDAK senyap (mean > -55 dB)', audioOk === 2, details.join(' | '));

  try { app.kill('SIGKILL'); } catch (e) { }
  console.log('SELESAI: ' + pass + ' lulus, ' + fail + ' gagal');
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('UJI ERROR:', e.message);
  process.exit(1);
}
