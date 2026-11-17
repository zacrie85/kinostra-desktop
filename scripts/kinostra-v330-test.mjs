/* ================================================================
   UJI v3.30.0 — AUDIO HILANG DI HASIL EKSPOR (wadah bukan MP4) +
   MENU FRAME PART 15 GAYA TAMPIL SEMUA (panel lebih lebar + chips wrap)
   Laporan user v3.29: "video berhasil di export dan split akan tetapi
   tidak ada suaranya" — sumber bukan MP4/AAC (mis. WebM/MKV): probeAudio
   tak mengenal wadahnya → _audioDemux tak pernah ada → wantAudio salah
   → aCodec tak dipilih → hasil TANPA stream audio; bahkan bila aCodec
   ada, buffer demux tak terbentuk → senyap. Perbaikan v3.30:
   1) wantAudio menganggap semua video berpotensi bersuara
   2) ensureExportAudio JALUR 2 = decodeAudioData penuh (semantik v3.16,
      semua format) bila demux gagal
   3) pelindung buffer kosong (got < 0,5 dtk → jatuh ke jalur 2)
   4) UI: panel kanan 384→424px + .chips flex-wrap → 15 chip tampil semua
   Uji: 1) WebM 17 mnt (Opus): impor tanpa buffer & tanpa demux
        2) ekspor PARALEL 5× 2 part → audio TIDAK senyap (jalur 2,
           buffer = durasi PENUH 1020 dtk — bukti jalur decodeAudioData)
        3) chips: 15 tombol, ≥2 baris, semua di dalam panel 424px
   Pakai: bash scripts/run-test-xvfb.sh scripts/kinostra-v330-test.mjs 480
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/home/z/my-project';
const PORT = 9510;
const VIDEO = '/home/z/my-project/testmedia/longwebm.webm';
const OUT = '/home/z/my-project/testmedia/out-v330';
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

  /* ===== BAGIAN UI: chips frame part tampil semua ===== */
  const ui = await evalRetry(cdp, `(() => {
    const box = document.querySelector('#partFrameChips');
    const aside = document.querySelector('aside');
    const btns = [...box.querySelectorAll('button')];
    const boxR = box.getBoundingClientRect(), asideR = aside.getBoundingClientRect();
    return { n: btns.length, rows: Math.round(box.offsetHeight / 30), asideW: Math.round(asideR.width),
      semuaDalam: btns.every(b => b.getBoundingClientRect().right <= asideR.right + 1),
      boxW: Math.round(boxR.width) };
  })()`, 15000);
  ok('Chips FRAME PART memuat TANPA + 15 gaya (16 tombol)', ui && ui.n === 16, JSON.stringify(ui));
  ok('Chips melipat ≥2 baris (semua terlihat, tak terpotong)', ui && ui.rows >= 2 && ui.semuaDalam, JSON.stringify(ui));
  ok('Panel kanan lebih lebar (424px, dulu 384px)', ui && ui.asideW >= 424, 'asideW=' + (ui && ui.asideW));

  /* ===== BAGIAN AUDIO: WebM (bukan MP4/AAC) → suara ikut ===== */
  ok('Video panjang WebM (17 mnt, Opus) termuat', await loadVideo(cdp));
  const pre = await evalRetry(cdp, `({ buf: !!(state.audioBuffer && state.audioBuffer.duration), demux: !!state._audioDemux, dur: state.duration })`, 15000);
  ok('Impor WebM: tanpa buffer penuh & tanpa demux (prekondisi kasus user)', pre && !pre.buf && !pre.demux && pre.dur > 900, JSON.stringify(pre));

  const exp = await evalRetry(cdp, `(async () => {
    state.rangeStart = 0; state.rangeEnd = 60; state.splitSec = 30; state.splitCustom = true; applySplitParts();
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
  ok('Ekspor WebM selesai (PARALEL 5×, 2 part)', exp && exp.n === 2 && !exp.fatal && !exp.err, JSON.stringify({ n: exp && exp.n, fatal: exp && exp.fatal, err: exp && exp.err }));
  ok('JALUR 2 dipakai: buffer = durasi PENUH video (decodeAudioData, bukan rentang)', exp && exp.bufDur >= 1000, 'bufDur=' + (exp && exp.bufDur));

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
    if (hasAudio && v.vol > -55 && v.sz > 20000) audioOk++;
  }
  ok('Semua part WebM: stream audio ada & TIDAK senyap (mean > -55 dB)', audioOk === 2, details.join(' | '));

  try { app.kill('SIGKILL'); } catch (e) { }
  console.log('SELESAI: ' + pass + ' lulus, ' + fail + ' gagal');
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('UJI ERROR:', e.message);
  process.exit(1);
}
