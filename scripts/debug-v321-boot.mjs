/* debug cepat: nyalakan app, cek error konsol halaman, coba loadFromPath */
import { spawn } from 'node:child_process';
const ROOT = '/home/z/my-project';
const PORT = 9496;
const sleep = ms => new Promise(r => setTimeout(r, ms));
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map(); this.logs = [];
    ws.addEventListener('message', e => { const m = JSON.parse(e.data);
      if (m.method === 'Runtime.consoleAPICalled' || m.method === 'Runtime.exceptionThrown') this.logs.push(m);
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
    } throw new Error('CDP gagal');
  }
  send(method, params = {}) { return new Promise((res, rej) => { const id = ++this.id; this.pend.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 60000 });
    if (r.exceptionDetails) throw new Error('PAGE-ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 600));
    return r.result.value;
  }
}
const APP = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
process.on('exit', () => { try { APP.kill('SIGKILL'); } catch (e) { } });
APP.stderr.on('data', d => { const s = String(d); if (/error|Error|ERR/.test(s)) console.log('[main-err]', s.slice(0, 400)); });
try {
  const cdp = await CDP.connect(PORT);
  await cdp.send('Runtime.enable');
  await sleep(2500);
  console.log('boot logs:', cdp.logs.length);
  for (const m of cdp.logs.slice(0, 12)) {
    const d = m.params.exceptionDetails || m.params;
    console.log('-', (m.method === 'Runtime.exceptionThrown' ? 'EXC: ' + (d.exceptionDetails?.exception?.description || JSON.stringify(d).slice(0, 300)) : 'log: ' + JSON.stringify(d.args || d).slice(0, 220)));
  }
  console.log('busy=', await cdp.eval('state.busy'), 'file=', await cdp.eval('!!state.file'));
  await cdp.eval(`loadFromPath('/home/z/my-project/testmedia/v32-60s.mp4'); 'ok'`);
  for (let i = 0; i < 20; i++) { await sleep(500); }
  console.log('dur=', await cdp.eval('state.duration'), 'busy=', await cdp.eval('state.busy'));
  console.log('toasts:', await cdp.eval(`[...document.querySelectorAll('.toast')].map(t=>t.textContent.slice(0,80))`));
  for (const m of cdp.logs.slice(-8)) {
    const d = m.params.exceptionDetails || m.params;
    console.log('*', (m.method === 'Runtime.exceptionThrown' ? 'EXC: ' + (d.exceptionDetails?.exception?.description || JSON.stringify(d).slice(0, 400)) : 'log: ' + JSON.stringify(d.args || d).slice(0, 260)));
  }
} catch (e) { console.error('FATAL', e); } finally { try { APP.kill('SIGKILL'); } catch (e) { } process.exit(0); }
