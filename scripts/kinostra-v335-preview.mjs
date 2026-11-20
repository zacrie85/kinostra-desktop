/* ================================================================
   PRATINJAU VISUAL v3.35.0 — render 5 frame referensi via mesin
   pratinjau asli (drawComposition) di aplikasi nyata, simpan PNG
   ke /home/z/my-project/download/frame-v335/*.png
   Pakai: bash scripts/run-test-xvfb.sh scripts/kinostra-v335-preview.mjs 240
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/home/z/my-project';
const PORT = 9519;
const VID = ROOT + '/testmedia/silent180.mp4';
const OUT = ROOT + '/download/frame-v335';
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map();
    ws.addEventListener('message', e => { const m = JSON.parse(e.data);
      if (m.id && this.pend.has(m.id)) { const { res, rej } = this.pend.get(m.id); this.pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } });
  }
  static async connect(port, tries = 90) {
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
async function loadVideo(cdp, path) {
  for (let i = 1; i <= 3; i++) {
    await cdp.eval(`loadFromPath(${JSON.stringify(path)}); 'ok'`).catch(() => {});
    for (let k = 0; k < 25; k++) { await sleep(1000);
      const s = await cdp.eval(`state.duration || 0`).catch(() => 0);
      if (s > 0) return true;
    }
  }
  return false;
}

try {
  fs.mkdirSync(OUT, { recursive: true });
  const app = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
  process.on('exit', () => { try { app.kill('SIGKILL'); } catch (e) { } });
  const cdp = await CDP.connect(PORT);
  await sleep(2500);
  ok2(await loadVideo(cdp, VID), 'video pratinjau termuat');

  const GAYA = [['komik', 'KOMIK MERAH-BIRU'], ['glossy', 'GLOSSY GAMING'], ['sport', 'SPORT LINGKAR'], ['pitaemas', 'PITA EMAS'], ['neonlayar', 'NEON CYAN-PINK']];
  for (const [k, nama] of GAYA) {
    const b64 = await cdp.eval(`(async () => {
      state.descOn = false; state.subsOn = false; state.cover.on = false; state.neon.on = false;
      state.titleOn = true; state.title = 'HATIKU BAGAI TERPENJARA'; state.titleAnim = 'off';
      state.titleSize = 44; state.titlePosY = 0; state.titleFrame = ${JSON.stringify(k)};
      state.partShow = 'intro'; state.partPrefix = 'EPISODE'; state.partFrame = ${JSON.stringify(k)};
      state.partAnim = 'off'; state.partSize = 0.62; state.partPosX = 0; state.partPosY = 0; state.partColor = '';
      const cv = document.createElement('canvas'); cv.width = 960; cv.height = 540;
      const g = cv.getContext('2d', { willReadFrequently: true });
      setCompSrc(document.querySelector('#vid'));
      drawComposition(g, 960, 540, 0.10, { native: false });
      setCompSrc(null);
      return cv.toDataURL('image/png').split(',')[1];
    })()`, 45000);
    if (typeof b64 === 'string' && b64.length > 10000) {
      fs.writeFileSync(OUT + '/pratinjau-' + k + '.png', Buffer.from(b64, 'base64'));
      console.log('✅ ' + nama + ' → pratinjau-' + k + '.png (' + Math.round(b64.length * 3 / 4 / 1024) + ' KB)');
    } else console.log('❌ ' + nama + ' gagal render');
  }
  try { app.kill('SIGKILL'); } catch (e) { }
  console.log('SELESAI PRATINJAU');
  process.exit(0);
} catch (e) {
  console.error('PRATINJAU ERROR: ' + ((e && e.message) || e));
  process.exit(2);
}
function ok2(syarat, nama) { console.log((syarat ? '✅ ' : '❌ ') + nama); }
