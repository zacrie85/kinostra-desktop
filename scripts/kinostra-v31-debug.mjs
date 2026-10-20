/* DEBUG probe — analisis podcast + dump track/timeline/crop */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map();
    ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && this.pend.has(m.id)) { const { res, rej } = this.pend.get(m.id); this.pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } }); }
  static async connect(port) {
    for (let i = 0; i < 60; i++) {
      try { const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        const page = list.find(t => t.type === 'page' && /index\.html/.test(t.url));
        if (page) { const ws = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); setTimeout(() => rej(new Error('ws timeout')), 8000); });
          return new CDP(ws); } } catch (e) { } await sleep(1000);
    } throw new Error('CDP gagal');
  }
  send(method, params = {}) { return new Promise((res, rej) => { const id = ++this.id; this.pend.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expr, timeoutMs = 300000) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: timeoutMs });
    if (r.exceptionDetails) throw new Error('PAGE-ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 800));
    return r.result.value;
  }
}
const ROOT = '/home/z/my-project';
const app = spawn('node_modules/electron/dist/electron', ['.', '--remote-debugging-port=9455', '--no-sandbox', '--disable-gpu-sandbox'],
  { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' } });
process.on('exit', () => { try { app.kill('SIGKILL'); } catch (e) { } });
const cdp = await CDP.connect(9455);
await cdp.send('Runtime.enable');
await sleep(2500);
const out = await cdp.eval(`(async () => {
  await loadFromPath('${ROOT}/testmedia/podcast.mp4', true);
  if (!state.file || !state.duration) return { err: 'load gagal' };
  state.spk.on = true; state.spk.speed = 'normal'; state.spk.silence = 'hold';
  await analyzeSpeakers({ prog() { }, stat() { } });
  const S = state.spk;
  const tracks = S.tracks.map((tr, i) => ({
    pos: i, id: tr.id, avgX: +tr.avgX.toFixed(3), n: tr.samples.length,
    medW: +(tr.samples.map(s=>s.w).sort((a,b)=>a-b)[tr.samples.length>>1]).toFixed(3),
    medH: +(tr.samples.map(s=>s.h).sort((a,b)=>a-b)[tr.samples.length>>1]).toFixed(3)
  }));
  const crops = {};
  for (const t of [8, 13, 18, 23.5, 28.6]) {
    const c9 = spkCropAt(640, 360, 1080, 1920, t);
    crops['t' + t] = c9 ? { sx: c9.sx, sy: c9.sy, sw: c9.sw, sh: c9.sh, cx: +((c9.sx + c9.sw/2)/640).toFixed(3) } : null;
  }
  /* rata2 warna area crop dari video asli (cek konten) */
  const v = videoEl;
  const cc = document.createElement('canvas'); cc.width = 640; cc.height = 360;
  const g = cc.getContext('2d', { willReadFrequently: true });
  const colAt = async (t, c) => {
    v.currentTime = t; await new Promise(r => { v.addEventListener('seeked', r, { once: true }); setTimeout(r, 2000); });
    g.drawImage(v, 0, 0, 640, 360);
    const d = g.getImageData(c.sx, c.sy, c.sw, c.sh).data;
    let R = 0, G = 0, B = 0, n = 0;
    for (let i = 0; i < d.length; i += 40) { R += d[i]; G += d[i+1]; B += d[i+2]; n++; }
    return { R: Math.round(R/n), G: Math.round(G/n), B: Math.round(B/n) };
  };
  const colors = {};
  for (const t of [8, 18]) {
    const c = spkCropAt(640, 360, 1080, 1920, t);
    if (c) colors['t' + t] = await colAt(t, c);
  }
  return { n: S.nSpeak, segs: S.timeline.length, tracks, timeline: S.timeline.map(s=>[+s.t0.toFixed(1), +s.t1.toFixed(1), s.idx]), crops, colors };
})()`, 420000);
console.log(JSON.stringify(out, null, 1));
process.exit(0);
