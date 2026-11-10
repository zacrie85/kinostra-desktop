#!/usr/bin/env node
/* Uji STAGE 2 v2.16 — ekspor mini dengan frame khusus baru (end-to-end) */
import WebSocket from '/home/z/my-project/kinostra-desktop/node_modules/ws/index.js';
import fs from 'fs';
import { execSync } from 'child_process';

const CDP = 'http://127.0.0.1:9222';
let ws, idSeq = 1;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const id = idSeq++;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + method)); } }, 240000);
  });
}
async function evalJS(expr, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise, userGesture: true });
  if (r.exceptionDetails) throw new Error('EVAL-ERR: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 500));
  return r.result?.value;
}
const results = [];
function check(name, ok, detail = '') { results.push({ name, ok }); console.log(`${ok ? 'OK ' : 'XX '} ${name}${detail ? ' — ' + detail : ''}`); }

async function main() {
  const list = await (await fetch(CDP + '/json')).json();
  ws = new WebSocket(list[0].webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));
  ws.on('message', d => {
    const m = JSON.parse(d);
    if (m.id && pending.has(m.id)) { pending.get(m.id).res(m.result); pending.delete(m.id); return; }
  });
  await send('Runtime.enable');

  const dir = '/home/z/my-project/kinostra-desktop/testmedia/out216';
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  await evalJS(`loadFromPath('/home/z/my-project/kinostra-desktop/testmedia/uji6.mp4')`);
  await new Promise(r => setTimeout(r, 2200));
  await evalJS(`state.scale='0.5'; state.fps=24; state.parallel='1'; state.splitSec=6;
    state.title='DANGDUT IDOLA DESA'; state.frameStyle='koplopanggung'; updateAll(); 'ok'`);

  const exp1 = await evalJS(`(async () => {
    try {
      const res = await exportPartsToDir('${dir}', { prog: () => {}, sub: () => {}, title: () => {} });
      return { ok: true, files: res.files || res };
    } catch (e) { return { ok: false, err: String(e && e.message || e).slice(0, 300) }; }
  })()`, true);
  const files1 = exp1.ok ? (Array.isArray(exp1.files) ? exp1.files : [exp1.files]).flat() : [];
  check('Ekspor koplopanggung: selesai tanpa error', exp1.ok, exp1.ok ? `${files1.length} file` : exp1.err);
  const n1 = files1.filter(f => f && String(f).endsWith('.mp4')).length;
  check('Ekspor koplopanggung: file MP4 tersimpan', exp1.ok && n1 >= 1, files1.join(', ').slice(0, 120));
  if (n1) {
    const f0 = files1.find(f => String(f).endsWith('.mp4'));
    try {
      const probe = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,duration -of csv=p=0 "${f0}"`).toString().trim();
      check('ffprobe: H.264 + durasi ±6 dtk', /h264/.test(probe) && /5\.9|6\.0|6\.1/.test(probe), probe);
    } catch (e) { check('ffprobe tersedia', false, String(e.message).slice(0, 120)); }
  }

  /* frame horor kedua utk memastikan pipeline HOROR juga bersih */
  await evalJS(`state.frameStyle='hororhutan'; state.title='HUTAN BERBISIK'; updateAll(); 'ok'`);
  const exp2 = await evalJS(`(async () => {
    try {
      const res = await exportPartsToDir('${dir}', { prog: () => {}, sub: () => {}, title: () => {} });
      return { ok: true, files: res.files || res };
    } catch (e) { return { ok: false, err: String(e && e.message || e).slice(0, 300) }; }
  })()`, true);
  const files2 = exp2.ok ? (Array.isArray(exp2.files) ? exp2.files : [exp2.files]).flat() : [];
  check('Ekspor hororhutan: selesai tanpa error', exp2.ok, exp2.ok ? `${files2.length} file` : exp2.err);

  const fails = results.filter(r => !r.ok);
  console.log(`\n=== STAGE2 SELESAI: ${results.length - fails.length}/${results.length} LULUS ===`);
  process.exit(fails.length ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
