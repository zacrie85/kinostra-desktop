#!/usr/bin/env node
/* debug reuse AudioDecoder: jendela 1 vs jendela 2 (setelah reset) */
const http = require('http');
const WebSocket = require('ws');

http.get('http://127.0.0.1:9222/json', r => {
  let b = ''; r.on('data', d => b += d);
  r.on('end', () => {
    const t = JSON.parse(b).find(x => x.type === 'page' && /index\.html/.test(x.url));
    const ws = new WebSocket(t.webSocketDebuggerUrl); let i = 0; const pend = new Map();
    ws.on('message', m => { const d = JSON.parse(m); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } });
    ws.on('open', () => {
      const send = (me, pa = {}) => new Promise(res => { const id = ++i; pend.set(id, res); ws.send(JSON.stringify({ id, method: me, params: pa })); });
      const evl = async ex => {
        const r = await send('Runtime.evaluate', { expression: ex, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception || {}).slice(0, 400));
        return r.result.result.value;
      };
      (async () => {
        await send('Runtime.enable');
        const r = await evl(`(async()=>{
          const cache={probe:await probeAudio(state.file)};
          if(!cache.probe) return 'probe null';
          const cek=async(t,d)=>{const buf=await decodeAudioWindow(cache,t,d);if(!buf)return 'null';let mx=0;const d0=buf.getChannelData(0);for(let j=0;j<d0.length;j++){const v=Math.abs(d0[j]);if(v>mx)mx=v;}return {t,dur:+buf.duration.toFixed(2),maks:+mx.toFixed(4)};};
          const out=[];
          out.push('w1 t0: '+JSON.stringify(await cek(0,2)));
          out.push('w2 t45: '+JSON.stringify(await cek(45,2)));
          out.push('w3 t90: '+JSON.stringify(await cek(90,2)));
          const cache2={probe:cache.probe};
          const ck2=async(t,d)=>{const buf=await decodeAudioWindow(cache2,t,d);if(!buf)return 'null';let mx=0;const d0=buf.getChannelData(0);for(let j=0;j<d0.length;j++){const v=Math.abs(d0[j]);if(v>mx)mx=v;}return +mx.toFixed(4);};
          out.push('cache2 w1 t0: '+JSON.stringify(await ck2(0,2)));
          out.push('cache2 w2 t45 (decoder BARU): '+JSON.stringify(await ck2(45,2)));
          return out.join(' | ');
        })()`);
        console.log(r);
        process.exit(0);
      })().catch(e => { console.log('ERR', e.message); process.exit(1); });
    });
  });
});
