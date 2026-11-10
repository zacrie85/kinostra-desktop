#!/usr/bin/env node
/* Uji: (1) IPC stream writer ke /tmp, (2) flush 160 frame encoder */
import WebSocket from '/home/z/my-project/kinostra-desktop/node_modules/ws/index.js';
const list = await (await fetch('http://127.0.0.1:9222/json')).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
await new Promise(r => ws.on('open', r));
let id = 1; const pend = new Map();
ws.on('message', d => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id).res(m.result); pend.delete(m.id); } });
const ev = (expr, to = 55000) => new Promise((res, rej) => { const i = id++; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true } })); setTimeout(() => rej(new Error('timeout-' + to)), to); });

/* 1) stream writer */
try {
  const r = await ev(`(async () => {
    const { id, path } = await window.kinostra.beginWrite('/tmp/kbwriter', 'uji.mp4');
    const chunk = new Uint8Array(1024 * 1024);
    for (let i = 0; i < 8; i++) await window.kinostra.writeChunk(id, chunk);
    const res = await window.kinostra.endWrite(id);
    return 'saved ' + res.size + ' bytes @ ' + res.path;
  })()`);
  console.log('WRITER:', r.result?.value);
} catch (e) { console.log('WRITER: STUCK —', e.message); }

/* 2) flush 160 frame (ekuivalen akhir part nyata) */
try {
  const r = await ev(`(async () => {
    const W = 540, H = 960, fps = 24, N = 160;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    let chunks = 0;
    const venc = new VideoEncoder({ output: () => chunks++, error: e => console.error('micro2 venc', e.message) });
    venc.configure({ codec: 'avc1.640028', width: W, height: H, bitrate: 2500000, framerate: fps, latencyMode: 'realtime' });
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      g.fillStyle = 'hsl(' + (i * 7 % 360) + ',60%,50%)'; g.fillRect(0, 0, W, H);
      const vf = new VideoFrame(c, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
      venc.encode(vf, { keyFrame: i % 48 === 0 }); vf.close();
      while (venc.encodeQueueSize > 14) await new Promise(r2 => setTimeout(r2, 2));
    }
    const tEnc = Math.round(performance.now() - t0);
    const t1 = performance.now();
    await venc.flush();
    const tFl = Math.round(performance.now() - t1);
    venc.close();
    return 'enc=' + tEnc + 'ms flush=' + tFl + 'ms chunks=' + chunks;
  })()`);
  console.log('FLUSH160:', r.result?.value);
} catch (e) { console.log('FLUSH160: STUCK —', e.message); }
process.exit(0);
