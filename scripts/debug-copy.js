#!/usr/bin/env node
/* debug decodeAudioWindow: cek format AudioData + hasil copyTo */
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
          const buf=await decodeAudioWindow(cache,30,2);
          if(!buf) return 'buf null';
          let mx=0;{const d0=buf.getChannelData(0);for(let j=0;j<d0.length;j++){const v=Math.abs(d0[j]);if(v>mx)mx=v;}}
          let fmt='?',err1='',err2='',fmtMaks=0;
          const C=cache;
          C.sink=ad=>{
            fmt=ad.format;
            try{const t1=new Float32Array(ad.numberOfFrames);ad.copyTo(t1,{planeIndex:0,format:'f32-planar'});let m=0;for(let j=0;j<t1.length;j++){const v=Math.abs(t1[j]);if(v>m)m=v;}fmtMaks=m;}
            catch(e){err1=e.message;}
            try{const t2=new Float32Array(ad.numberOfFrames);ad.copyTo(t2,{planeIndex:0});}catch(e){err2=e.message;}
            try{ad.close();}catch(e){}
          };
          const buf2=await decodeAudioWindow(C,60,0.2).catch(e=>'ERR:'+e.message);
          let m2=-1;
          if(typeof buf2==='object'&&buf2){m2=0;const d0=buf2.getChannelData(0);for(let j=0;j<d0.length;j++){const v=Math.abs(d0[j]);if(v>m2)m2=v;}}
          return {buf1:{dur:+buf.duration.toFixed(2),sr:buf.sampleRate,ch:buf.numberOfChannels,maks:+mx.toFixed(4),kWin:JSON.stringify(buf.kWin)},fmt,maksDgnFormat:+fmtMaks.toFixed(4),err1,err2,buf2Maks:(m2>=0?+m2.toFixed(4):String(buf2))};
        })()`);
        console.log(JSON.stringify(r, null, 1));
        process.exit(0);
      })().catch(e => { console.log('ERR', e.message); process.exit(1); });
    });
  });
});
