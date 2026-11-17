/* Probe 2: muat batch-test-1 SETELAH urutan OPTIMASI + BERSIHKAN CACHE (mimik v316) */
import { spawn } from 'node:child_process';
const ROOT = '/home/z/my-project'; const PORT = 9509;
const sleep = ms => new Promise(r => setTimeout(r, ms));
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map();
    ws.addEventListener('message', e => { const m = JSON.parse(e.data);
      if (m.id && this.pend.has(m.id)) { const { res, rej } = this.pend.get(m.id); this.pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } });
  }
  static async connect(port, tries = 60) {
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
  async eval(expr, to = 60000) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: to });
    if (r.exceptionDetails) throw new Error('PAGE-ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 400));
    return r.result.value;
  }
}
const app = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
process.on('exit', () => { try { app.kill('SIGKILL'); } catch (e) { } });
const cdp = await CDP.connect(PORT);
await sleep(2000);
await cdp.eval(`window.__errs = []; window.addEventListener('error', e => __errs.push(String(e.message).slice(0,120))); window.addEventListener('unhandledrejection', e => __errs.push('REJ:' + String(e.reason && e.reason.message || e.reason).slice(0,120))); 1`);
const r1 = await cdp.eval(`(async () => {
  try { await loadFromPath('/home/z/my-project/testmedia/long120.mp4', true); } catch (e) { return { err: String(e && e.message) }; }
  for (let i = 0; i < 25 && !(state.duration > 0); i++) await new Promise(r => setTimeout(r, 1000));
  return { dur: state.duration };
})()`);
console.log('1) long120:', JSON.stringify(r1));
const r2 = await cdp.eval(`(async () => {
  document.querySelector('#segKilat button[data-v="on"]').click();
  document.querySelector('#segParallel button[data-v="0"]').click();
  state.parallel = 3; state.kilat = 'off';
  document.querySelector('#btnOptimize').click();
  await new Promise(r => setTimeout(r, 3000));
  const b = document.querySelector('#btnApplySaran'); if (b) b.click();
  state.batch.push({ path: '/home/z/my-project/testmedia/batch-test-1.mp4', name: 'batch-test-1.mp4', size: 0, status: 'wait', msg: '', thumb: 'data:image/jpeg;base64,AAAA', dur: 1, sel: false, via: 'batch' });
  document.querySelector('#btnClearCache').click();
  await new Promise(r => setTimeout(r, 2500));
  document.querySelector('#mClose').click(); state.batch = [];
  return { busy: state.busy, modal: !document.querySelector('#modal').classList.contains('hidden') };
})()`, 90000);
console.log('2) setelah C+D:', JSON.stringify(r2), 'errs:', await cdp.eval('window.__errs.join(" | ") || "-"'));
const r3 = await cdp.eval(`(async () => {
  try { await loadFromPath('/home/z/my-project/testmedia/batch-test-1.mp4', true); } catch (e) { return { err: String(e && e.message) }; }
  for (let i = 0; i < 25 && !(state.duration > 0); i++) await new Promise(r => setTimeout(r, 1000));
  return { dur: state.duration, adaFile: !!state.file, readyState: state.file ? 1 : 0, busy: state.busy };
})()`, 120000);
console.log('3) batch-test-1:', JSON.stringify(r3), 'errs:', await cdp.eval('window.__errs.join(" | ") || "-"'));
app.kill('SIGKILL');
process.exit(0);
