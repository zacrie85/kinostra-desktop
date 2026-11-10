#!/usr/bin/env node
/* Bisect: ekspor bertahap untuk menemukan penyebab macet v2.12 di Xvfb */
import WebSocket from '/home/z/my-project/kinostra-desktop/node_modules/ws/index.js';
const list = await (await fetch('http://127.0.0.1:9222/json')).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
await new Promise(r => ws.on('open', r));
let id = 1; const pend = new Map();
ws.on('message', d => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id).res(m.result); pend.delete(m.id); } });
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
async function waitFor(expr, ms = 150000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const v = await evalJS(expr); if (v) return v; } catch (e) { }
    await new Promise(r => setTimeout(r, 2000));
  }
  return null;
}

/* muat video + setelan dasar kecil */
await evalJS(`loadFromPath('/home/z/my-project/kinostra-desktop/testmedia/uji.mp4')`);
await new Promise(r => setTimeout(r, 2000));
await evalJS(`state.scale='0.5'; state.fps=24; state.parallel='1'; state.splitSec=6; state.subsOn=false; updateAll();`);

const cases = [
  { name: 'A: dasar (speed 1, tanpa fitur)', cfg: `state.speed=1; state.frameStyle='off'; state.neon.on=false; state.kb.mode='off'; state.trans.mode='off';` },
  { name: 'B: + frame BIOSKOP', cfg: `state.speed=1; state.frameStyle='bioskop'; state.kb.mode='off'; state.trans.mode='off';` },
  { name: 'C: + transisi FADE', cfg: `state.speed=1; state.frameStyle='bioskop'; state.kb.mode='off'; state.trans.mode='fade'; state.trans.dur=0.7;` },
  { name: 'D: + Ken Burns IN', cfg: `state.speed=1; state.frameStyle='bioskop'; state.kb.mode='in'; state.kb.strength=0.35; state.trans.mode='fade';` },
  { name: 'E: + SPEED 1.5', cfg: `state.speed=1.5; state.frameStyle='bioskop'; state.kb.mode='in'; state.trans.mode='fade';` }
];
for (const c of cases) {
  const tag = c.name[0];
  await evalJS(`
    ${c.cfg}
    window.__bis = null;
    (async () => {
      try {
        const res = await exportPartsToDir('/tmp/kb_${tag}', { prog: () => {}, sub: () => {}, title: () => {} });
        window.__bis = { ok: true, n: res.length };
      } catch (e) { window.__bis = { ok: false, err: String(e && e.message || e).slice(0, 160) }; }
    })();
    'go';
  `);
  const t0 = Date.now();
  const r = await waitFor(`window.__bis`, 150000);
  const el = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`${r && r.ok ? '✓' : '✗'} ${c.name} — ${el}s ${r && !r.ok ? '| ' + r.err : ''}`);
  if (!r) { console.log('   STUCK — berhenti bisect di sini'); process.exit(1); }
}
console.log('SEMUA KASUS LULUS');
process.exit(0);
