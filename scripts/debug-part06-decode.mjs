/* Debug: kenapa pemindai senyap tidak menyala utk PART_06 asli user */
import { spawn } from 'node:child_process';
const ROOT = '/home/z/my-project';
const PORT = 9513;
const VIDEO = ROOT + '/upload/DIKIRA_MENANTU_MINTA_MINTA_TERNYATA_RAJA_TABIB_SAKTI_PART_06.mp4';
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
    if (r.exceptionDetails) throw new Error('PAGE-ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 400));
    return r.result.value;
  }
}
async function reconnect(cdp) {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const pg = list.find(t => t.type === 'page' && /index\.html/.test(t.url));
  const ws = new WebSocket(pg.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); setTimeout(() => rej(new Error('ws')), 8000); });
  cdp.ws = ws; cdp.pend = new Map();
}
async function evalRetry(cdp, expr, ms = 15000) {
  try { return await cdp.eval(expr); } catch (e) { await reconnect(cdp); return await cdp.eval(expr); }
}
const app = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
process.on('exit', () => { try { app.kill('SIGKILL'); } catch (e) { } });
const cdp = await CDP.connect(PORT);
await sleep(2000);
/* dengarkan console page utk error decode */
await cdp.send('Runtime.enable');
await evalRetry(cdp, `loadFromPath(${JSON.stringify(VIDEO)}); 'ok'`, 30000);
let dur = 0;
for (let i = 0; i < 25; i++) { await sleep(1000); dur = await evalRetry(cdp, `state.duration || 0`, 6000).catch(() => 0); if (dur > 0) break; }
await sleep(3000);
const st = await evalRetry(cdp, `({ buf: state.audioBuffer ? state.audioBuffer.duration : null,
  senyap: !!state.audioSenyap, epoch: state._senyapEpoch ?? 'tak-ada', mediaEpoch: state.mediaEpoch,
  isAudio: !!state.isAudio, peaks: state.peaks ? state.peaks.length : null })`, 15000);
console.log('STATE SETELAH IMPOR:', JSON.stringify(st));
/* decode manual utk lihat error asli */
const dec = await evalRetry(cdp, `(async () => {
  try { const ab = await state.file.arrayBuffer();
    const b = await getActx().decodeAudioData(ab);
    const d = b.getChannelData(0); let p = 0;
    for (let i = 0; i < d.length; i += 16) { const v = Math.abs(d[i]); if (v > p) p = v; }
    return { ok: b.duration, puncak: p, ch: b.numberOfChannels, sr: b.sampleRate };
  } catch (e) { return { err: String((e && e.message) || e) }; }
})()`, 30000);
console.log('DECODE MANUAL:', JSON.stringify(dec));
try { app.kill('SIGKILL'); } catch (e) { }
process.exit(0);
