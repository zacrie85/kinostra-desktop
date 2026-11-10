#!/usr/bin/env node
/* Ekspor tahan-bunuh: log tiap kejadian langsung ke /tmp/exp212.log */
import fs from 'fs';
import WebSocket from '/home/z/my-project/kinostra-desktop/node_modules/ws/index.js';
const LOG = '/tmp/exp212.log';
const say = (s) => { const l = `${new Date().toISOString().slice(11, 19)} ${s}`; console.log(l); fs.appendFileSync(LOG, l + '\n'); };
fs.writeFileSync(LOG, '');
let list = null;
for (let i = 0; i < 30; i++) {
  try { list = await (await fetch('http://127.0.0.1:9222/json')).json(); if (list && list.length) break; } catch (e) { }
  await new Promise(r => setTimeout(r, 2000));
}
if (!list) { say('!! DevTools tidak siap'); process.exit(1); }
const ws = new WebSocket(list[0].webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
await new Promise(r => ws.on('open', r));
let id = 1; const pend = new Map();
ws.on('message', d => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id).res(m.result); pend.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled') {
    const txt = (m.params.args || []).map(a => a.value != null ? String(a.value) : (a.description || '')).join(' ').replace(/\s+/g, ' ').slice(0, 240);
    if (txt && !txt.includes('Electron Security')) say('  [renderer] ' + txt);
  }
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = id++; pend.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method, params }));
  setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('to-' + method)); } }, 120000);
});
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, userGesture: true }); if (r.exceptionDetails) throw new Error('EVAL: ' + (r.exceptionDetails.exception?.description || '').slice(0, 200)); return r.result?.value; };
const wait = async (expr, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const v = await ev(expr); if (v) return v; } catch (e) { say('  (poll: ' + String(e.message).slice(0, 40) + ')'); }
    await new Promise(r => setTimeout(r, 3000));
  }
  return null;
};
await send('Runtime.enable');
say('== mulai: muat video 6 dtk ==');
await ev(`loadFromPath('/home/z/my-project/kinostra-desktop/testmedia/uji6.mp4')`);
await new Promise(r => setTimeout(r, 2500));
say('== set: 540x960 · 24fps · paralel 1 · split 6 · bioskop+KB+fade · speed 1.5 ==');
await ev(`state.scale='0.5'; state.fps=24; state.parallel='1'; state.splitSec=6;
  state.frameStyle='bioskop'; state.kb={mode:'in',strength:0.35}; state.trans={mode:'fade',dur:0.7};
  state.speed=1.5; state.subsOn=false; state.title='UJI 212'; updateAll(); window.__r=null;`);
const t0 = Date.now();
await ev(`(async () => {
  try {
    const res = await exportPartsToDir('/home/z/my-project/kinostra-desktop/testmedia/out212', { prog: () => {}, sub: () => {}, title: () => {} });
    window.__r = { ok: true, n: res.length, files: res.map(r => r.name) };
  } catch (e) { window.__r = { ok: false, err: String(e && e.message || e).slice(0, 300) }; }
})(); 'go'`);
say('== ekspor dijalankan, menunggu… ==');
const r = await wait(`window.__r`, 540000);
if (!r) say('!! STUCK 9 menit');
else say(`== HASIL: ${r.ok ? 'OK ' + r.n + ' part: ' + r.files.join(', ') : 'ERR: ' + r.err} · ${((Date.now() - t0) / 1000).toFixed(0)}s ==`);
process.exit(0);
