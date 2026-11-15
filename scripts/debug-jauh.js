#!/usr/bin/env node
/* debug renderMix jauh: alasan error sesungguhnya + cakupan peaks */
const http = require('http');
const WebSocket = require('ws');

http.get('http://127.0.0.1:9222/json', r => {
  let b = ''; r.on('data', d => b += d);
  r.on('end', () => {
    const t = JSON.parse(b).find(x => x.type === 'page' && /index\.html/.test(x.url));
    const ws = new WebSocket(t.webSocketDebuggerUrl); let i = 0; const pend = new Map();
    ws.on('message', m => {
      const d = JSON.parse(m);
      if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
      else if (d.method === 'Runtime.consoleAPICalled') {
        const a = (d.params.args || []).map(x => x.value !== undefined ? String(x.value) : (x.description || '')).join(' ');
        if (!/Security Warning/.test(a)) console.log('[page]', a.slice(0, 200));
      }
    });
    ws.on('open', () => {
      const send = (me, pa = {}) => new Promise(res => { const id = ++i; pend.set(id, res); ws.send(JSON.stringify({ id, method: me, params: pa })); });
      const evl = async ex => {
        const r = await send('Runtime.evaluate', { expression: ex, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception || {}).slice(0, 300));
        return r.result.result.value;
      };
      (async () => {
        await send('Runtime.enable');
        const pk = await evl(`(()=>{const p=state.peaks;if(!p||!p.length)return 'kosong';let nz=0;for(let k=0;k<p.length;k++)if(p[k]>0)nz++;return {len:p.length,nz,terisiAkhir:+p[1300].toFixed(3),p100:+p[100].toFixed(3)};})()`);
        console.log('PEAKS:', JSON.stringify(pk));
        const r1 = await evl(`(async()=>{try{const cache=state._audioDemux;const buf=await decodeAudioWindow(cache,3600,3);if(!buf)return 'null';let mx=0;const d0=buf.getChannelData(0);for(let j=0;j<d0.length;j++){const v=Math.abs(d0[j]);if(v>mx)mx=v;}return 'OK maks='+mx.toFixed(3)+' dur='+buf.duration.toFixed(2);}catch(e){return 'ERR: '+e.message;}})()`);
        console.log('DECODE t=3600:', r1);
        const r2 = await evl(`(async()=>{try{const buf=await decodeAudioWindow(state._audioDemux,7000,3);if(!buf)return 'null';let mx=0;const d0=buf.getChannelData(0);for(let j=0;j<d0.length;j++){const v=Math.abs(d0[j]);if(v>mx)mx=v;}return 'OK maks='+mx.toFixed(3);}catch(e){return 'ERR: '+e.message;}})()`);
        console.log('DECODE t=7000:', r2);
        process.exit(0);
      })().catch(e => { console.log('ERR', e.message); process.exit(1); });
    });
  });
});
