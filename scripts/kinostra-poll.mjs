#!/usr/bin/env node
/* Poll status ekspor via CDP — cepat, satu evaluate */
import WebSocket from '/home/z/my-project/kinostra-desktop/node_modules/ws/index.js';
const list = await (await fetch('http://127.0.0.1:9222/json')).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
await new Promise(r => ws.on('open', r));
let id = 1; const pend = new Map();
ws.on('message', d => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } });
const ev = (expr, to = 25000) => new Promise((res, rej) => { const i = id++; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } })); setTimeout(() => rej(new Error('to')), to); });
try {
  console.log('RESULT:', await ev(`JSON.stringify({
    expDone: window.__expDone || null,
    expDone2: window.__expDone2 || null,
    busy: state.busy, speed: state.speed,
    parts: segmentsCount(), segs: segments().map(s=>[+s.start.toFixed(1),+s.end.toFixed(1)])
  })`));
} catch (e) { console.log('ERR:', e.message); }
process.exit(0);
