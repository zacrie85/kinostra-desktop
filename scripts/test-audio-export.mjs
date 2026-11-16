/* ================================================================
   UJI v2.16.2 — SUARA EKSPOR FILM PANJANG (per jendela)
   Film 120 mnt dimuat → audioBuffer sengaja KOSONG → renderMix()
   harus tetap menghasilkan audio BERSUARA lewat jendela demux.
   ================================================================ */
import { spawn } from 'node:child_process';

const ROOT = '/home/z/my-project/classic216';
const PORT = 9503;
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
process.on('exit', () => { try { APP.kill('SIGKILL'); } catch (e) { } });

try {
  const cdp = await CDP.connect(PORT);
  await sleep(2000);

  console.log('1. Muat film 120 mnt + tunggu probe audio demux siap');
  await cdp.eval(`loadFromPath('/home/z/my-project/testmedia/long120.mp4')`);
  let demuxOk = false;
  for (let i = 0; i < 25; i++) {
    await sleep(1000);
    try { demuxOk = await cdp.eval(`!!state._audioDemux`, 4000); } catch (e) { }
    if (demuxOk) break;
  }
  ok('Probe audio demux siap (state._audioDemux)', demuxOk);

  console.log('2. renderMix() film panjang di t=30..40 — harus BERSUARA');
  const mixLong = await cdp.eval(`(async () => {
    const buf = await renderMix(30, 10, 1);           /* 10 dtk mulai menit-0:30 */
    const d = buf.getChannelData(0);
    let s2 = 0, n = 0, pk = 0;
    for (let i = 0; i < d.length; i += 7) { const v = d[i] || 0; s2 += v * v; n++; if (Math.abs(v) > pk) pk = Math.abs(v); }
    return { dur: Math.round(buf.duration * 10) / 10, rms: Math.round(Math.sqrt(s2 / n) * 1e5) / 1e5, pk: Math.round(pk * 1e3) / 1e3 };
  })()`);
  ok('renderMix film panjang menghasilkan audio (' + JSON.stringify(mixLong) + ')', mixLong && mixLong.dur >= 9.9 && mixLong.rms > 0.0005, JSON.stringify(mixLong));

  console.log('3. renderMix() video pendek (jalur audioBuffer lama) tetap bersuara');
  /* podcast.mp4 ternyata hening total (−91 dB) — pakai v32-60s (−21 dB) */
  await cdp.eval(`loadFromPath('/home/z/my-project/testmedia/v32-60s.mp4')`);
  for (let i = 0; i < 20; i++) { await sleep(500); try { if (await cdp.eval(`state.duration > 0 && !!state.audioBuffer`, 3000)) break; } catch (e) { } }
  const mixShort = await cdp.eval(`(async () => {
    const buf = await renderMix(1, 3, 1);
    const d = buf.getChannelData(0);
    let s2 = 0, n = 0;
    for (let i = 0; i < d.length; i += 7) { const v = d[i] || 0; s2 += v * v; n++; }
    return { rms: Math.round(Math.sqrt(s2 / n) * 1e5) / 1e5 };
  })()`);
  ok('renderMix video pendek tetap bersuara (rms=' + (mixShort ? mixShort.rms : '?') + ')', mixShort && mixShort.rms > 0.0005, JSON.stringify(mixShort));

  try { APP.kill('SIGTERM'); } catch (e) { }
  console.log(`HASIL: ${pass} lulus, ${fail} gagal`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('FATAL:', e.message);
  console.log(`HASIL: ${pass} lulus, ${fail} gagal`);
  process.exit(1);
}
