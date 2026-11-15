#!/usr/bin/env node
/* uji penuh pasca-reload: impor video panjang → analisis bertahap → renderMix */
const http = require('http');
const WebSocket = require('ws');

http.get('http://127.0.0.1:9222/json', r => {
  let b = ''; r.on('data', d => b += d);
  r.on('end', () => {
    const t = JSON.parse(b).find(x => x.type === 'page' && /index\.html/.test(x.url));
    const ws = new WebSocket(t.webSocketDebuggerUrl); let i = 0; const pend = new Map();
    let ctx = 0;
    ws.on('message', m => {
      const d = JSON.parse(m);
      if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
      else if (d.method === 'Runtime.executionContextCreated') { ctx++; console.log('[ctx baru #' + ctx + ']'); }
    });
    ws.on('close', () => { console.log('WS TERTUTUP — crash!'); process.exit(2); });
    ws.on('open', () => {
      const send = (me, pa = {}) => new Promise(res => { const id = ++i; pend.set(id, res); ws.send(JSON.stringify({ id, method: me, params: pa })); });
      const evl = async ex => {
        const r = await send('Runtime.evaluate', { expression: ex, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception || {}).slice(0, 300));
        return r.result.result.value;
      };
      (async () => {
        await send('Runtime.enable');
        await send('Page.reload');
        await new Promise(r => setTimeout(r, 5000));
        const ver = await evl(`(async()=>{const s=await (await fetch('app://localhost/js/demux.js')).text();return s.includes('pindai langsung');})()`);
        console.log('demux.js robust termuat:', ver);
        await evl(`(function(){const ar=document.querySelector('#autoRun');if(ar)ar.checked=false;return 1;})()`);
        await evl(`loadFromPath('/home/z/my-project/testmedia/long120.mp4')`);
        for (let k = 0; k < 40; k++) { await new Promise(r => setTimeout(r, 1000)); if (await evl('state.duration') > 0) break; }
        console.log('video termuat. tunggu analisis 45 dtk…');
        await new Promise(r => setTimeout(r, 45000));
        const st = await evl(`({demux: !!state._audioDemux, peaksNz: state.peaks && state.peaks.some(v=>v>0), rms: +(state.audioRms||0).toFixed(4), env: state._audioEnv && state._audioEnv.length})`);
        console.log('ANALISIS:', JSON.stringify(st));
        const mx = await evl(`(async()=>{const m=await renderMix(30,5,1);let nz=0;const d=m.getChannelData(0);for(let j=0;j<d.length;j+=997)if(Math.abs(d[j])>0.001)nz++;const m2=await renderMix(3600,5,1);let nz2=0;const d2=m2.getChannelData(0);for(let j=0;j<d2.length;j+=997)if(Math.abs(d2[j])>0.001)nz2++;const m3=await renderMix(7000,5,1);let nz3=0;const d3=m3.getChannelData(0);for(let j=0;j<d3.length;j+=997)if(Math.abs(d3[j])>0.001)nz3++;return {p30:{dur:+m.duration.toFixed(2),nz},p3600:{nz:nz2},p7000:{nz:nz3}};})()`);
        console.log('RENDERMIX (nz=sampel bersuara):', JSON.stringify(mx));
        process.exit(0);
      })().catch(e => { console.log('ERR', e.message); process.exit(1); });
    });
  });
});
