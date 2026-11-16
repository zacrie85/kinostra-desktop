/* ================================================================
   UJI v3.18.0 — WATCHDOG HANG DETAK JANTUNG + JEJAK DIAGNOSTIK +
   JENDELA ADAPTIF. Garis utama (baseline v3.16.0 user, akar blank
   sudah diperbaiki v3.17.1; v3.18 = jaring pengamat hang beku yang
   tak tertangani SHIELD lama + log konteks + analisis 2,5× cepat).
   ================================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/home/z/my-project';
const PORT = 9499;
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
  fire(method, params = {}) { try { this.ws.send(JSON.stringify({ id: ++this.id, method, params })); } catch (e) { } }
}
async function logText(cdp) {
  try { const r = await cdp.eval(`(async () => { const x = await window.kinostra.crashLog(); return typeof x === 'string' ? x : (x && x.text) || ''; })()`, 15000);
    return String(r || ''); } catch (e) { return ''; }
}

const APP = spawn('node_modules/electron/dist/electron', ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
process.on('exit', () => { try { APP.kill('SIGKILL'); } catch (e) { } });

try {
  const cdp = await CDP.connect(PORT);
  await sleep(2500);

  console.log('A. SMOKE v3.18.0');
  const a = await cdp.eval(`({ ver: document.body.textContent.match(/v3\\.\\d+\\.\\d+/)?.[0] || '', mods: document.querySelectorAll('.mod').length, enc: 'VideoEncoder' in window })`);
  ok('Aplikasi hidup, header v3.18', /v3\.18/.test(a.ver), a.ver);
  ok('Modul lengkap (' + a.mods + ') + WEBCODECS', a.mods >= 15 && a.enc);

  console.log('B. JEJAK DIAGNOSTIK — impor → putar → log');
  const L0 = await logText(cdp);
  await cdp.eval(`loadFromPath('/home/z/my-project/testmedia/v32-60s.mp4'); 'ok'`);
  for (let i = 0; i < 20; i++) { await sleep(500); if (await cdp.eval(`state.duration > 0`, 5000)) break; }
  const d60 = await cdp.eval(`state.duration`);
  ok('Video 60 dtk termuat (' + d60.toFixed(0) + ' dtk)', d60 > 55);
  await cdp.eval(`(function(){ if (videoEl.paused) togglePlay(); return 'play'; })()`);
  await sleep(2500);
  await cdp.eval(`(function(){ if (!videoEl.paused) videoEl.pause(); return 'pause'; })()`);
  await sleep(1200);
  const L1 = await logText(cdp);
  const baru = L1.slice(L0.length ? L1.indexOf(L0.slice(-200)) : 0);
  ok('Jejak "impor:" tercatat (nama · durasi)', /impor: v32-60s\.mp4 · 60 dtk/.test(L1));
  ok('Jejak jalur audio tercatat (decode penuh utk video pendek)', /audio: decode penuh · 60 dtk/.test(L1));
  ok('Jejak "putar dimulai" tercatat', /putar dimulai t=\d/.test(L1));

  console.log('C. WATCHDOG HANG DETAK JANTUNG — gantung main thread 30 dtk');
  cdp.fire('Runtime.evaluate', { expression: `const __t=Date.now(); while(Date.now()-__t<30000){}`, returnByValue: false });
  let pulih = -1;
  for (let i = 0; i < 55; i++) {
    await sleep(1000);
    try { pulih = await cdp.eval(`document.querySelectorAll('.mod').length`, 3000); } catch (e) { continue; }
    if (pulih >= 15) break;
  }
  ok('Jendela PULIH otomatis dari hang 30 dtk (modul ' + pulih + ')', pulih >= 15);
  await sleep(1500);
  const L2 = await logText(cdp);
  ok('HANG tercatat di log (detak jantung / unresponsive)', /HANG —/.test(L2));
  ok('RENDER MATI + pemulihan tercatat', /RENDER MATI/.test(L2) && /pemulihan ke-/.test(L2));

  console.log('D. APLIKASI SEHAT SETELAH PEMULIHAN — impor lagi');
  await cdp.eval(`loadFromPath('/home/z/my-project/testmedia/v34-6s.mp4'); 'ok'`);
  for (let i = 0; i < 16; i++) { await sleep(500); if (await cdp.eval(`state.duration > 0`, 5000)) break; }
  const d6 = await cdp.eval(`state.duration`);
  ok('Impor baru sukses setelah pemulihan (' + d6.toFixed(1) + ' dtk)', d6 > 3);

  console.log('E. JENDELA ADAPTIF — film 120 mnt: tanpa decode utuh, analisis jalan');
  const E1 = await cdp.eval(`(async () => { loadFromPath('/home/z/my-project/testmedia/long120.mp4');
    for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 500));
      if (state.duration > 7000) return { d: state.duration, alive: true }; }
    return { d: state.duration || 0, alive: true }; })()`, 60000);
  ok('Film 120 mnt termuat tanpa crash (' + (E1 ? E1.d.toFixed(0) : '—') + ' dtk)', E1 && E1.d > 7000);
  const E2 = await cdp.eval(`({ ab: !!state.audioBuffer, demux: !!state._audioDemux, w: (state._audioDemux && state._audioDemux.probe && 1) || 0 })`);
  ok('TIDAK decode utuh (audioBuffer null) + demux siap', !E2.ab && !!E2.demux, JSON.stringify(E2));
  const p0 = await cdp.eval(`state.peaks ? state.peaks.filter(v => v > 0).length : 0`);
  await sleep(20000);
  const p1 = await cdp.eval(`state.peaks ? state.peaks.filter(v => v > 0).length : 0`);
  ok('Peaks tumbuh bertahap (' + p0 + ' → ' + p1 + ' / 1400)', p1 > p0 && p1 > 10);
  let rms = '';
  for (let i = 0; i < 75; i++) { await sleep(1000); rms = await cdp.eval(`state.audioRms > 0 ? state.audioRms.toFixed(4) : ''`, 5000); if (rms) break; }
  ok('RMS AUDIO SEHAT terukur (' + rms + ')', rms !== '' && parseFloat(rms) > 0.01);
  ok('Nol crash selama seluruh uji (masih hidup)', await cdp.eval(`document.querySelectorAll('.mod').length`, 5000) >= 15);

  try { APP.kill('SIGTERM'); } catch (e) { }
  console.log(`HASIL: ${pass} lulus, ${fail} gagal`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('FATAL:', e.message);
  console.log(`HASIL: ${pass} lulus, ${fail} gagal`);
  process.exit(1);
}
