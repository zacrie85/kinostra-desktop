#!/usr/bin/env node
/* Bisect v2 + tangkap console renderer (melihat tahap worker ekspor) */
import WebSocket from '/home/z/my-project/kinostra-desktop/node_modules/ws/index.js';
const list = await (await fetch('http://127.0.0.1:9222/json')).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
await new Promise(r => ws.on('open', r));
let id = 1; const pend = new Map();
const logs = [];
ws.on('message', d => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id).res(m.result); pend.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled') {
    const txt = (m.params.args || []).map(a => a.value != null ? String(a.value) : (a.description || '')).join(' ');
    logs.push(`[${m.params.type}] ${txt.slice(0, 220)}`);
  }
});
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const i = id++; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
    setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('to ' + method)); } }, 60000);
  });
}
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error('EVAL: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300));
  return r.result?.value;
}
async function waitFor(expr, ms = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const v = await evalJS(expr); if (v) return v; } catch (e) { }
    await new Promise(r => setTimeout(r, 2000));
  }
  return null;
}
await send('Runtime.enable');

await evalJS(`loadFromPath('/home/z/my-project/kinostra-desktop/testmedia/uji.mp4')`);
await new Promise(r => setTimeout(r, 2000));

const mode = process.argv[2] || 'noaudio';
await evalJS(`state.scale='0.5'; state.fps=24; state.parallel='1'; state.splitSec=6; state.subsOn=false; updateAll();
  ${mode === 'noaudio' ? 'state.audioBuffer=null; state.music.buffer=null;' : ''}
  window.__bis=null;
  (async () => {
    try {
      const res = await exportPartsToDir('/tmp/kb_a', { prog: () => {}, sub: () => {}, title: () => {} });
      window.__bis = { ok: true, n: res.length };
    } catch (e) { window.__bis = { ok: false, err: String(e && e.message || e).slice(0, 200) }; }
  })();
  'go';`);
const t0 = Date.now();
const r = await waitFor(`window.__bis`, 120000);
console.log(`mode=${mode} → ${r ? (r.ok ? 'OK ' + r.n + ' part' : 'ERR: ' + r.err) : 'STUCK 120s'} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log('--- CONSOLE RENDERER (terakhir 14) ---');
logs.slice(-14).forEach(l => console.log(' ', l));
process.exit(0);
