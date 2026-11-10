#!/usr/bin/env node
/* Uji mikro: VideoEncoder encode 8 frame + flush — ukur tiap tahap */
import WebSocket from '/home/z/my-project/kinostra-desktop/node_modules/ws/index.js';
const list = await (await fetch('http://127.0.0.1:9222/json')).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
await new Promise(r => ws.on('open', r));
let id = 1; const pend = new Map();
ws.on('message', d => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id).res(m.result); pend.delete(m.id); } });
const ev = (expr, to = 55000) => new Promise((res, rej) => { const i = id++; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true } })); setTimeout(() => rej(new Error('timeout-' + to)), to); });
const expr = `(async () => {
  const out = { steps: [] };
  const st = s => { out.steps.push(s + '@' + Math.round(performance.now()) ); };
  const W = 540, H = 960, fps = 24;
  st('start');
  const chunks = [];
  const venc = new VideoEncoder({ output: (c, m) => { chunks.push(c.timestamp); }, error: e => out.steps.push('ERR:' + e.message) });
  venc.configure({ codec: 'avc1.640028', width: W, height: H, bitrate: 1200000, framerate: fps, latencyMode: 'realtime', hardwareAcceleration: 'prefer-hardware' });
  st('configured');
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  for (let i = 0; i < 8; i++) {
    g.fillStyle = ['r','g','b','y'][i % 4]; g.fillRect(0, 0, W, H);
    const vf = new VideoFrame(cv, { timestamp: i * Math.round(1e6 / fps), duration: Math.round(1e6 / fps) });
    venc.encode(vf, { keyFrame: i === 0 }); vf.close();
  }
  st('encoded8 queue=' + venc.encodeQueueSize);
  const t0 = performance.now();
  await venc.flush();
  st('flushed ' + Math.round(performance.now() - t0) + 'ms chunks=' + chunks.length);
  venc.close();
  out.ok = true;
  return out;
})()`;
try {
  const r = await ev(expr);
  console.log('MICRO RAW:', JSON.stringify(r).slice(0, 600));
} catch (e) {
  console.log('MICRO: STUCK —', e.message);
}
process.exit(0);
