/* ================================================================
   REPRO FILM PANJANG — KINOSTRA garis klasik
   Persis alur user di video: impor film PANJANG → diputar → klik
   TERAPKAN KE SEMUA VIDEO → amati apakah aplikasi mati/hidup.
   Pemakaian: repro-longfilm.mjs [crash|survive]
   - crash   (basis 2.16.1): diharapkan RENDER MATI (bukti akar)
   - survive (v2.16.2+): diharapkan hidup, audio tak di-decode utuh
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/home/z/my-project/classic216';
const PORT = 9501;
const EXPECT = (process.env.KINO_EXPECT === 'survive') ? 'survive' : 'crash';
const LONG = '/home/z/my-project/testmedia/long120.mp4';   /* 120 mnt, 198 MB */

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  LULUS  ' + n)) : (fail++, console.log(`  GAGAL  ${n} ${x}`)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map();
    ws.addEventListener('message', e => { const m = JSON.parse(e.data);
      if (m.id && this.pend.has(m.id)) { const { res, rej } = this.pend.get(m.id); this.pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } });
  }
  static async connect(port) {
    for (let i = 0; i < 60; i++) {
      try { const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        const page = list.find(t => t.type === 'page' && /index\.html/.test(t.url));
        if (page) { const ws = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); setTimeout(() => rej(new Error('ws')), 8000); });
          return new CDP(ws); } } catch (e) { }
      await sleep(1000);
    } throw new Error('CDP tidak tersambung');
  }
  send(method, params = {}) { return new Promise((res, rej) => { const id = ++this.id; this.pend.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expr, timeoutMs = 300000) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: timeoutMs });
    if (r.exceptionDetails) throw new Error('PAGE-ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300));
    return r.result.value;
  }
}

const APP = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
const mainLog = [];
APP.stdout.on('data', d => mainLog.push(d.toString()));
APP.stderr.on('data', d => mainLog.push(d.toString()));
process.on('exit', () => { try { APP.kill('SIGKILL'); } catch (e) { } });
let renderGone = null;

try {
  /* filter log per-sesi: catat panjang log SEKARANG; nanti hanya baris baru yang dinilai */
  const LG = '/home/z/.config/KINOSTRA/kinostra-crash.log';
  const baseLines = fs.existsSync(LG) ? fs.readFileSync(LG, 'utf8').split('\n').length : 0;
  const cdp = await CDP.connect(PORT);
  cdp.send('Runtime.enable').catch(() => { });

  /* IMPORT film panjang — decode audio lama jalan DI BELAKANG */
  console.log('1. IMPOR film 120 menit ...');
  await cdp.eval(`loadFromPath('${LONG}')`).catch(() => { });
  let meta = null;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    try { meta = await cdp.eval(`({ d: state.duration || 0, ab: state.audioBuffer ? state.audioBuffer.duration : 0 })`, 3000); } catch (e) { break; }
    if (meta && meta.d > 0) break;
  }
  ok('Metadata film terbaca (durasi ' + (meta ? Math.round(meta.d / 60) : '?') + ' mnt)', meta && meta.d > 3600);

  /* PUTAR seperti user */
  console.log('2. PUTAR video + tunggu decode latar berjalan ...');
  await cdp.eval(`getActx().resume(); videoEl.play();`).catch(() => { });
  await sleep(12000);

  /* KLIK TERAPKAN KE SEMUA VIDEO seperti di video user */
  console.log('3. KLIK TERAPKAN KE SEMUA VIDEO ...');
  let clickOk = true;
  try { await cdp.eval(`document.querySelector('#btnRangeApplyAll').click(); 'klik-ok'`, 5000); } catch (e) { clickOk = false; }
  ok('Klik TERAPKAN terkirim (jendela masih hidup saat itu)', clickOk);

  /* AMATI 40 detik — di 2.16.1 decode 2,8 GB membunuh proses di sekitar sini */
  console.log('4. AMATI 40 detik ke depan ...');
  let alive = true, lastState = null;
  for (let i = 0; i < 20; i++) {
    await sleep(2000);
    try { lastState = await cdp.eval(`({ t: videoEl.currentTime, ab: state.audioBuffer ? Math.round(state.audioBuffer.duration) : 0, pk: (state.peaks || []).length })`, 4000); }
    catch (e) { alive = false; renderGone = 'jendela mati saat pengamatan (t+' + (i * 2) + ' dtk): ' + e.message.slice(0, 120); break; }
  }
  const abFull = lastState ? lastState.ab : 0;

  if (EXPECT === 'crash') {
    ok('BUKTI AKAR: aplikasi MATI saat decode penuh film panjang', !alive, renderGone || '');
    if (alive) console.log('   (masih hidup — mungkin sandbox kebal kali ini; decode', abFull, 'dtk)');
    console.log(`HASIL: ${pass} lulus, ${fail} gagal (harapan: mati = bukti akar)`);
    process.exit(alive ? 1 : 0);
  } else {
    ok('Aplikasi TETAP HIDUP selama pengamatan', alive, renderGone || '');
    ok('Audio TIDAK di-decode utuh (audioBuffer tetap kosong/kecil)', abFull === 0 || abFull < 60, 'ab=' + abFull + ' dtk');
    /* pause → analisis bertahap (yang sopan menunggu saat putar) boleh jalan */
    try { await cdp.eval(`videoEl.pause(); 'ok'`, 4000); } catch (e) { }
    let pkSeen = 0;
    for (let i = 0; i < 25; i++) {
      await sleep(2000);
      try { pkSeen = await cdp.eval(`(state.peaks || []).length`, 4000); } catch (e) { break; }
      if (pkSeen > 0) break;
    }
    ok('Peaks analisis bertahap tumbuh setelah pause (garis gelombang)', pkSeen > 0, 'pk=' + pkSeen);
    const lg = fs.readFileSync(LG, 'utf8').split('\n').slice(baseLines).filter(l => /RENDER MATI|GPU MATI|HANG/.test(l));
    ok('Log crash BERSIH selama sesi ini (hanya baris baru)', lg.length === 0, JSON.stringify(lg.slice(-3)));
    try { APP.kill('SIGTERM'); } catch (e) { }
    console.log(`HASIL: ${pass} lulus, ${fail} gagal`);
    process.exit(fail ? 1 : 0);
  }
} catch (e) {
  console.error('FATAL:', e.message);
  if (EXPECT === 'crash') { console.log('Mati sebelum pengamatan = juga bukti crash:', e.message.slice(0, 200)); console.log(`HASIL: ${pass} lulus, ${fail} gagal`); process.exit(0); }
  console.log(`HASIL: ${pass} lulus, ${fail} gagal`);
  process.exit(1);
}
