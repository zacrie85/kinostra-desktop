/* DEBUG detak jantung klasik: hitung [HB] di stdout main process + hakim saat hang 30 dtk */
import { spawn } from 'node:child_process';
const ROOT = '/home/z/my-project/classic216';
const PORT = 9508;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const APP = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
let out = '';
APP.stdout.on('data', d => { out += d.toString(); });
APP.stderr.on('data', d => { out += d.toString(); });
process.on('exit', () => { try { APP.kill('SIGKILL'); } catch (e) { } });

const count = re => (out.match(re) || []).length;
await sleep(12000);
console.log('detak sebelum hang:', count(/\[HB\] detak/g));
console.log('kesalahan main terlihat:', (out.match(/ReferenceError|TypeError|is not defined/g) || []).length);

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map();
    ws.addEventListener('message', e => { const m = JSON.parse(e.data);
      if (m.id && this.pend.has(m.id)) { const { res, rej } = this.pend.get(m.id); this.pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } }); }
  static async connect(port) {
    for (let i = 0; i < 40; i++) {
      try { const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        const page = list.find(t => t.type === 'page' && /index\.html/.test(t.url));
        if (page) { const ws = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); setTimeout(() => rej(new Error('ws')), 8000); });
          return new CDP(ws); } } catch (e) { }
      await sleep(1000);
    } throw new Error('CDP tidak tersambung');
  }
  fire(method, params = {}) { try { this.ws.send(JSON.stringify({ id: ++this.id, method, params })); } catch (e) { } }
}
const cdp = await CDP.connect(PORT);
console.log('CDP tersambung — gantung 30 dtk');
cdp.fire('Runtime.evaluate', { expression: `const __t=Date.now(); while(Date.now()-__t<30000){}`, returnByValue: false });
await sleep(40000);
console.log('detak total:', count(/\[HB\] detak/g));
console.log('hakim menyala:', count(/\[HB\] hakim/g));
const hakim = out.split('\n').filter(l => l.includes('[HB] hakim')).slice(-3);
console.log(hakim.join('\n') || '(tak ada baris hakim)');
console.log('uncaught:', out.split('\n').filter(l => /ReferenceError|TypeError|is not defined|Uncaught/.test(l)).slice(0, 3).join(' | ') || '(tidak ada)');
try { APP.kill('SIGTERM'); } catch (e) { }
process.exit(0);
