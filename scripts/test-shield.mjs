/* ================================================================
   UJI v2.16.3 — SHIELD RINGAN: RENDER MATI → JENDELA HIDUP LAGI
   (dulu: aplikasi lenyap seperti di rekaman user; kini: dimuat ulang
   otomatis + tercatat di log crash)
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/home/z/my-project/classic216';
const PORT = 9504;
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
  const before = await cdp.eval(`document.querySelectorAll('.mod').length`).catch(() => -1);
  ok('Aplikasi hidup sebelum crash (modul ' + before + ')', before > 5);

  console.log('1. Bunuh proses render (chrome://crash) — dulu: aplikasi LENYAP');
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: 'chrome://crash' }).catch(() => { });

  console.log('2. Tunggu SHIELD memuat ulang jendela (maks 25 dtk) ...');
  let after = -1;
  for (let i = 0; i < 25; i++) {
    await sleep(1000);
    try { after = await cdp.eval(`document.querySelectorAll('.mod').length`, 3000); } catch (e) { continue; }
    if (after > 5) break;
  }
  ok('Jendela HIDUP LAGI otomatis (modul ' + after + ')', after > 5);

  console.log('3. Log crash mencatat kejadian + pemulihan');
  await sleep(1000);
  const lg = fs.readFileSync('/home/z/.config/KINOSTRA/kinostra-crash.log', 'utf8').split('\n').filter(l => /v2\.16\.3/.test(l));
  ok('RENDER MATI tercatat', lg.some(l => /RENDER MATI/.test(l)), JSON.stringify(lg.slice(-4)));
  ok('pemulihan otomatis tercatat', lg.some(l => /pemulihan otomatis/.test(l)), JSON.stringify(lg.slice(-3)));

  console.log('4. Aplikasi tetap bisa dipakai setelah pulih (impor ulang)');
  const load = await cdp.eval(`(async () => { loadFromPath('/home/z/my-project/testmedia/short-a.mp4'); for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 500)); if (state.duration > 0) return state.duration; } return 0; })()`);
  ok('Impor ulang setelah pemulihan berhasil (' + (load ? load.toFixed(1) : '0') + ' dtk)', load > 0);

  try { APP.kill('SIGTERM'); } catch (e) { }
  console.log(`HASIL: ${pass} lulus, ${fail} gagal`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('FATAL:', e.message);
  console.log(`HASIL: ${pass} lulus, ${fail} gagal`);
  process.exit(1);
}
