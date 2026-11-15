#!/usr/bin/env node
/* ukur waktu decode jendela 45 dtk — persis panggilan pertama analisis */
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
        const r = await send('Runtime.evaluate', { expression: ex, awaitPromise: true, returnByValue: true, timeout: 120000 });
        if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception || {}).slice(0, 300));
        return r.result.result.value;
      };
      (async () => {
        await send('Runtime.enable');
        const r = await evl(`(async()=>{
          const out=[];
          const cache={probe:await probeAudio(state.file)};
          if(!cache.probe) return 'probe null';
          for(const [t,d] of [[0,45],[45,45],[90,45]]){
            const t0=performance.now();
            const b=await decodeAudioWindow(cache,t,d);
            let mx=0; if(b){const d0=b.getChannelData(0);for(let j=0;j<d0.length;j++){const v=Math.abs(d0[j]);if(v>mx)mx=v;}}
            out.push('t='+t+' dt='+((performance.now()-t0)/1000).toFixed(2)+'s ok='+(!!b)+(b?' dur='+b.duration.toFixed(1)+' maks='+mx.toFixed(3):''));
          }
          return out.join(' | ');
        })()`);
        console.log(r);
        process.exit(0);
      })().catch(e => { console.log('ERR', e.message); process.exit(1); });
    });
  });
});
