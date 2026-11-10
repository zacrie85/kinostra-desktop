#!/usr/bin/env node
/* Screenshot preview dengan tiap frame utama → /tmp/fr_*.png */
import WebSocket from '/home/z/my-project/kinostra-desktop/node_modules/ws/index.js';
import fs from 'fs';
const list = await (await fetch('http://127.0.0.1:9222/json')).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
await new Promise(r => ws.on('open', r));
function send(method, params = {}) {
  return new Promise((res, rej) => { const i = id++; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => rej(new Error('to')), 20000); });
}
let id = 1; const pend = new Map();
ws.on('message', d => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id).res(m.result); pend.delete(m.id); } });
const sendUsed = null; const ev = (expr, to = 40000) => new Promise((res, rej) => { const i = id++; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true } })); setTimeout(() => rej(new Error('to')), to); });

await ev(`loadFromPath('/home/z/my-project/kinostra-desktop/testmedia/uji6.mp4')`);
await new Promise(r => setTimeout(r, 2500));
await ev(`state.scale='0.5'; state.splitSec=6; state.title='PETUALANGAN PAGI'; state.desc='Petualangan seru di tepi pantai';
  state.partShow='always'; state.wm={mode:'text',text:'@KINOSTRA',pos:'br',opacity:0.7,scale:1}; updateAll();`);

await ev(`(async()=>{ await new Promise(res=>{const f=()=>{videoEl.removeEventListener('seeked',f);res();}; videoEl.addEventListener('seeked',f); videoEl.currentTime=2.2; setTimeout(res,2500);}); })()`);
await new Promise(r => setTimeout(r, 400));
const shots = ['bioskop', 'merahputih', 'kayu', 'gelombang', 'elegan', 'awan', 'panel', 'gradien'];
for (const k of shots) {
  await ev(`state.frameStyle='${k}'; state.kb={mode:'in',strength:0.35}; state.trans={mode:'fade',dur:0.7}; drawComposition(ctx, cv.width, cv.height, 2.2); 'ok'`);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`/tmp/fr_${k}.png`, Buffer.from(shot.data, 'base64'));
  console.log('shot:', k);
}
// 9:16 portrait sample (bioskop) — ganti rasio dulu
await ev(`state.ratio='9:16'; $('#hudRatio').textContent='9:16'; $('#bgRow').style.display=''; applyRatio(); state.frameStyle='bioskop'; drawComposition(ctx, cv.width, cv.height, 2.2); 'ok'`);
await new Promise(r => setTimeout(r, 300));
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('/tmp/fr_bioskop916.png', Buffer.from(shot.data, 'base64'));
console.log('shot: bioskop916');
// neon tetap jalan
await ev(`state.ratio='16:9'; applyRatio(); state.frameStyle='off'; state.neon.on=true; state.neon.color='#2EE6FF'; drawComposition(ctx, cv.width, cv.height, 2.2); 'ok'`);
const shot2 = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('/tmp/fr_neon.png', Buffer.from(shot2.data, 'base64'));
console.log('shot: neon');
process.exit(0);
