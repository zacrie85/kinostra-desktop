/* ================================================================
   UJI v2.16.3 — WATCHDOG HANG: jendela TAK MERESPONS → dipulihkan
   PAKSA (crash renderer terkendali) → SHIELD memuat ulang otomatis.
   (Dulu: hang permanen — persis keluhan user "begitu diputar hang")
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/home/z/my-project/classic216';
const PORT = 9505;
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
  /* kirim TANPA menunggu jawaban — utk menggantung main thread renderer */
  fire(method, params = {}) { try { this.ws.send(JSON.stringify({ id: ++this.id, method, params })); } catch (e) { } }
}

const LG = '/home/z/.config/KINOSTRA/kinostra-crash.log';
const baseLines = fs.existsSync(LG) ? fs.readFileSync(LG, 'utf8').split('\n').length : 0;

const APP = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
process.on('exit', () => { try { APP.kill('SIGKILL'); } catch (e) { } });

try {
  const cdp = await CDP.connect(PORT);
  await sleep(2000);
  await cdp.send('Runtime.enable').catch(() => { });
  const before = await cdp.eval(`document.querySelectorAll('.mod').length`).catch(() => -1);
  ok('Aplikasi hidup sebelum hang (modul ' + before + ')', before > 5);
  const hb0 = await cdp.eval(`window.kinostra ? 'bridge ada' : 'bridge HILANG'`).catch(() => 'eval gagal');
  console.log('   bridge:', hb0);

  console.log('1. GANTUNG main thread renderer 20 dtk (simulasi HANG saat diputar)');
  cdp.fire('Runtime.evaluate', { expression: `const __t=Date.now(); while(Date.now()-__t<20000){}`, returnByValue: false });
  await sleep(3000);
  let blocked = false;
  try { await cdp.eval(`'masih hidup'`, 2000); } catch (e) { blocked = true; }
  ok('Renderer benar-benar tergantung (probe timeout)', blocked, blocked ? '' : '— hang TIDAK terjadi, uji tak valid');

  console.log('2. Tunggu watchdog: unresponsive → crash paksa → muat ulang (maks 45 dtk) ...');
  let after = -1;
  for (let i = 0; i < 45; i++) {
    await sleep(1000);
    try { after = await cdp.eval(`document.querySelectorAll('.mod').length`, 3000); } catch (e) { continue; }
    if (after > 5) break;
  }
  ok('Jendela PULIH otomatis dari hang (modul ' + after + ')', after > 5);

  console.log('3. Log mencatat HANG + pemulihan');
  await sleep(1500);
  const lg = fs.readFileSync(LG, 'utf8').split('\n').slice(baseLines);
  console.log('   baris log sesi ini:', JSON.stringify(lg, null, 0).slice(0, 600));
  ok('HANG tercatat (detak jantung / unresponsive)', lg.some(l => /HANG —/.test(l)), JSON.stringify(lg.filter(l => /HANG|MATI|pemulihan/.test(l)).slice(0, 4)));
  ok('RENDER MATI tercatat (akibat crash paksa)', lg.some(l => /RENDER MATI/.test(l)));
  ok('pemulihan otomatis tercatat', lg.some(l => /pemulihan otomatis/.test(l)));

  console.log('4. Jejak diagnostik bekerja (impor → log)');
  const dur = await cdp.eval(`(async () => { loadFromPath('/home/z/my-project/testmedia/v32-60s.mp4'); for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 500)); if (state.duration > 0 && state.audioBuffer) return state.duration; } return 0; })()`);
  ok('Impor sukses setelah pemulihan (' + (dur ? dur.toFixed(1) : '0') + ' dtk)', dur > 0);
  await sleep(1500);
  const lg2 = fs.readFileSync(LG, 'utf8').split('\n').slice(baseLines);
  ok('Jejak "impor:" tercatat', lg2.some(l => /impor: .* · \d+ dtk/.test(l)), JSON.stringify(lg2.filter(l => /impor:|audio:|putar/.test(l)).slice(0, 4)));
  ok('Jejak jalur audio tercatat (decode penuh utk video pendek)', lg2.some(l => /audio: decode penuh/.test(l)));

  try { APP.kill('SIGTERM'); } catch (e) { }
  console.log(`HASIL: ${pass} lulus, ${fail} gagal`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('FATAL:', e.message);
  console.log(`HASIL: ${pass} lulus, ${fail} gagal`);
  process.exit(1);
}
