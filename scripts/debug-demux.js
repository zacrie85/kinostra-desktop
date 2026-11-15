#!/usr/bin/env node
/* debug demux audio: telusuri struktur box MP4 di halaman KINOSTRA */
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
        const dbg = await evl(`(async()=>{
          const out=[];
          const f=state.file; if(!f) return 'no file';
          const rd=kilatReaderFor(f);
          const tops=await childBoxes(rd,{off:0,size:f.size,tag:'root'});
          out.push('top:'+tops.map(x=>x.tag).join(','));
          const moov=tops.find(b=>b.tag==='moov'); if(!moov) return out.join('|');
          const mk=await childBoxes(rd,moov);
          out.push('moov:'+mk.map(x=>x.tag).join(','));
          for(const trak of mk.filter(x=>x.tag==='trak')){
            const kids=await childBoxes(rd,trak);
            const mdia=kids.find(b=>b.tag==='mdia');
            if(!mdia){out.push('trak:tanpa-mdia');continue;}
            const mk2=await childBoxes(rd,mdia);
            const hdlr=mk2.find(b=>b.tag==='hdlr');
            let htype='?';
            if(hdlr){const h=await rd(hdlr.off,12);htype=_dtag(h,8);}
            out.push('trak hdlr='+htype+' box:'+mk2.map(x=>x.tag).join(','));
            if(htype==='soun'){
              const minf=mk2.find(b=>b.tag==='minf');
              const stbl=(await childBoxes(rd,minf)).find(b=>b.tag==='stbl');
              const sk=await childBoxes(rd,stbl);
              out.push('stbl:'+sk.map(x=>x.tag).join(','));
              const stsd=sk.find(b=>b.tag==='stsd');
              const sd=await rd(stsd.off,8);
              const eo=stsd.off+8;
              const eh=await rd(eo,8);
              out.push('stsd ec='+_du32(sd,4)+' tag='+_dtag(eh,4)+' bodyLen='+stsd.size);
              const body=await rd(eo+8,20);
              out.push('ch='+_du16(body,16)+' sr='+_du16(body,24));
              const hex=n=>[...n].map(x=>x.toString(16).padStart(2,'0')).join(' ');
              const raw=await rd(eo+8,64);
              out.push('HEX64:'+hex(raw.slice(0,64)));
              const kidsOff=eo+8+20;
              const scan=await rd(kidsOff,Math.min(2048,stsd.off+stsd.size-kidsOff));
              let o=0,tags=[];
              while(o+8<=scan.length){const sz=_du32(scan,o);if(sz<8)break;tags.push(_dtag(scan,o+4)+':'+sz);o+=sz;}
              out.push('anak:'+tags.join(','));
              const p=await parseTrakAudio(rd,trak);
              out.push('parseTrakAudio='+(p?('OK sr='+p.sampleRate+' ch='+p.channels):'NULL'));
            }
          }
          return out.join(' | ');
        })()`);
        console.log(dbg);
        process.exit(0);
      })().catch(e => { console.log('ERR', e.message); process.exit(1); });
    });
  });
});
