#!/usr/bin/env node
/* debug parseTrakAudio langkah demi langkah */
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
          const moov=tops.find(b=>b.tag==='moov'); if(!moov) return 'no moov';
          const moovKids=await childBoxes(rd,moov);
          for(const trak of moovKids.filter(b=>b.tag==='trak')){
            const kids=await childBoxes(rd,trak);
            const mdia=kids.find(b=>b.tag==='mdia'); if(!mdia) continue;
            const mk=await childBoxes(rd,mdia);
            const hdlr=mk.find(b=>b.tag==='hdlr');
            if(hdlr){const h=await rd(hdlr.off,12); if(_dtag(h,8)!=='soun') continue;}
            out.push('SOUN trak ditemukan');
            const mdhd=mk.find(b=>b.tag==='mdhd'); if(!mdhd){out.push('tanpa mdhd');continue;}
            const mh=await rd(mdhd.off,32);
            const ver=_du8(mh,0);
            const timescale=_du32(mh,ver===1?20:12);
            out.push('mdhd ver='+ver+' timescale='+timescale);
            const minf=mk.find(b=>b.tag==='minf'); if(!minf){out.push('tanpa minf');continue;}
            const stbl=(await childBoxes(rd,minf)).find(b=>b.tag==='stbl'); if(!stbl){out.push('tanpa stbl');continue;}
            const sk=await childBoxes(rd,stbl);
            const stsd=sk.find(b=>b.tag==='stsd');
            const stts=sk.find(b=>b.tag==='stts');
            const stsc=sk.find(b=>b.tag==='stsc');
            const stsz=sk.find(b=>b.tag==='stsz');
            const stco=sk.find(b=>b.tag==='stco');
            const co64=sk.find(b=>b.tag==='co64');
            out.push('boxes: stsd='+(!!stsd)+' stts='+(!!stts)+' stsc='+(!!stsc)+' stsz='+(!!stsz)+' stco='+(!!stco));
            if(!stsd||!stts||!stsc||!stsz||!(stco||co64)){out.push('GAGAL: box kurang');continue;}
            const sd=await rd(stsd.off,8);
            const ec=_du32(sd,4);
            out.push('entry_count='+ec);
            const eo=stsd.off+8;
            const eh=await rd(eo,8);
            const etag=_dtag(eh,4);
            out.push('etag='+etag);
            const body=await rd(eo+8,28);
            let entrySr=0;
            for(const off of [24,16]){const v32=_du32(body,off);const ip=v32>>>12;if(ip>=7000&&ip<=96000){entrySr=ip;out.push('entrySr dari offset '+off+' = '+ip);break;}}
            const channelsEntry=_du16(body,16)||_du16(body,8)||0;
            out.push('channelsEntry='+channelsEntry);
            const scanLen=Math.min(4096,stsd.off+stsd.size-eo);
            out.push('scanLen='+scanLen);
            const scan=await rd(eo,Math.max(64,scanLen));
            out.push('scan.length='+scan.length);
            let esds=null;
            for(let o=8;o+12<=scan.length;o++){
              if(_dtag(scan,o)==='esds'){
                const sz=_du32(scan,o-4);
                out.push('esds di o='+o+' sz='+sz);
                if(sz>=12&&o-4+sz<=scan.length+4){esds=scan.slice(o+8,o-4+sz);out.push('esds payload='+esds.length+'B');break;}
                else out.push('esds ditolak: sz/sisa');
              }
            }
            if(!esds){out.push('TANPA esds');continue;}
            let p=0;const rdLen=()=>{let l=0,bx;do{if(p>=esds.length)return -1;bx=esds[p++];l=(l<<7)|(bx&0x7f);}while(bx&0x80);return l;};
            let asc=null;
            if(esds[p]===0x03){p++;if(rdLen()<0)return out.join('|')+'|rdLen-1';p+=3;if(esds[p]===0x04){p++;if(rdLen()<0)return out.join('|')+'|rdLen-1b';p+=13;if(esds[p]===0x05){p++;const l=rdLen();if(l>0)asc=esds.slice(p,Math.min(p+l,esds.length));out.push('ASC='+[...asc].map(x=>x.toString(16)).join(' '));}}}
            if(!asc||asc.length<2){out.push('TANPA ASC');continue;}
            const objType=asc[0]>>3;
            const freqIdx=((asc[0]&0x07)<<1)|(asc[1]>>7);
            const chCfg=(asc[1]>>3)&0x0f;
            out.push('objType='+objType+' freqIdx='+freqIdx+' chCfg='+chCfg);
          }
          return out.join(' | ');
        })()`);
        console.log(dbg);
        process.exit(0);
      })().catch(e => { console.log('ERR', e.message); process.exit(1); });
    });
  });
});
