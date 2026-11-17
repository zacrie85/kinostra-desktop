/* DIAG v3.34 — probe interaktif: apakah fungsi & DOM baru hidup, dan
   apakah loadFrameImgData benar2 resolve (dgn race timeout) */
import { spawn } from 'node:child_process';
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map();
    ws.addEventListener('message', e => { const m = JSON.parse(e.data);
      if (m.id && this.pend.has(m.id)) { const { res, rej } = this.pend.get(m.id); this.pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } });
  }
  static async connect(port, tries = 30) {
    for (let i = 0; i < tries; i++) {
      try { const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        const page = list.find(t => t.type === 'page' && /index\.html/.test(t.url));
        if (page) { const ws = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); setTimeout(() => rej(new Error('ws')), 5000); });
          return new CDP(ws); } } catch (e) { }
      await sleep(500);
    } throw new Error('CDP tidak tersambung');
  }
  send(method, params = {}) { return new Promise((res, rej) => { const id = ++this.id; this.pend.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expr, timeoutMs = 15000) {
    const r = await Promise.race([
      this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: timeoutMs }),
      sleep(timeoutMs + 3000).then(() => { throw new Error('EVAL TIMEOUT ' + timeoutMs + 'ms'); })
    ]);
    if (r.exceptionDetails) throw new Error('PAGE-ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 400));
    return r.result.value;
  }
}

const PORT = 9521;
const app = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
  cwd: '/home/z/my-project', stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
process.on('exit', () => { try { app.kill('SIGKILL'); } catch (e) { } });
const cdp = await CDP.connect(PORT);
await sleep(2500);
const B64 = `(() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#E23B3B'; g.fillRect(0, 0, 64, 64);
  return c.toDataURL('image/png').split(',')[1]; })()`;

console.log('typeof:', await cdp.eval(`({ lfid: typeof loadFrameImgData, sfiu: typeof syncFrameImgUI,
  box: !!document.querySelector('#frmPi'), layer: !!document.querySelector('#frameDragLayer'),
  pick: !!document.querySelector('#btnTiImgPick'), panel: !!document.querySelector('#partImgPanel'),
  chips: document.querySelectorAll('#partFrameChips button').length })`));
console.log('syncFrameImgUI():', await cdp.eval(`(function(){ try { syncFrameImgUI(); return 'OK'; } catch (e) { return 'ERR: ' + e.message; } })()`));
console.log('b64 gen:', (await cdp.eval(`(${B64}).length`)) + ' chars');
console.log('muat (race 10s):', await cdp.eval(`(function(){
  return Promise.race([
    loadFrameImgData('partImg', 'uji.png', (${B64})).then(v => 'RESOLVED ' + v),
    new Promise(r => setTimeout(() => r('HANG 10s'), 10000))
  ]);
})()`));
console.log('state cek:', await cdp.eval(`({ fr: state.partFrame, data: !!state.partImg.data, el: !!(state.partImg.el && state.partImg.el.complete),
  panel: document.querySelector('#partImgPanel').style.display, box: document.querySelector('#frmPi').style.display })`));
process.exit(0);
