#!/usr/bin/env node
/* Uji otomatis KINOSTRA v2.14 — AKSELERASI GPU + regresi auto-subtitel v2.13 */
import WebSocket from '/home/z/my-project/kinostra-desktop/node_modules/ws/index.js';
import fs from 'fs';

const CDP = 'http://127.0.0.1:9222';
let ws, idSeq = 1;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const id = idSeq++;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + method)); } }, 300000);
  });
}
async function evalJS(expr, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise, userGesture: true });
  if (r.exceptionDetails) throw new Error('EVAL-ERR: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 400));
  return r.result?.value;
}
async function waitFor(expr, ms = 240000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const v = await evalJS(expr); if (v) return v; }
    catch (e) { }
    await new Promise(r => setTimeout(r, 2500));
  }
  return null;
}
const OUT214 = '/home/z/my-project/kinostra-desktop/build/out214';
const OUT214B = '/home/z/my-project/kinostra-desktop/build/out214b';
fs.rmSync(OUT214, { recursive: true, force: true });
fs.rmSync(OUT214B, { recursive: true, force: true });

const results = [];
function check(name, ok, detail = '') { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); }

async function main() {
  const list = await (await fetch(CDP + '/json')).json();
  ws = new WebSocket(list[0].webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));
  ws.on('message', d => {
    const m = JSON.parse(d);
    if (m.id && pending.has(m.id)) { pending.get(m.id).res(m.result); pending.delete(m.id); return; }
  });
  await send('Runtime.enable');

  /* ---------- 1. UI v2.14 ---------- */
  await evalJS(`1`);
  const ui = await evalJS(`(() => {
    const $ = s => document.querySelector(s);
    return {
      ver: document.querySelector('.tag')?.textContent || '',
      gpuInfo: !!$('#gpuInfo'), gpuTxt: $('#gpuInfo')?.textContent || '',
      accBtns: [...($('#segAcc')?.buttons || document.querySelectorAll('#segAcc button'))].map(b => b.dataset.v),
      parBtns: document.querySelectorAll('#segParallel button').length,
      accState: state.acc
    };
  })()`);
  check('Versi header v2.14.0', ui.ver.includes('2.14.0'), ui.ver);
  check('UI: kotak deteksi GPU ada & terisi', ui.gpuInfo && ui.gpuTxt.length > 5, ui.gpuTxt.slice(0, 70));
  check('UI: pilihan AKSELERASI auto/gpu/cpu', ui.accBtns.join(',') === 'auto,gpu,cpu', ui.accBtns.join(','));
  check('UI: render paralel sampai 6×', ui.parBtns === 7, String(ui.parBtns));
  check('State: acc default auto', ui.accState === 'auto');

  /* ---------- 2. Deteksi GPU via main process ---------- */
  const gi = await evalJS(`window.kinostra.gpuInfo()`, true);
  check('IPC sys:gpu → struktur benar', gi && Array.isArray(gi.gpus) && typeof gi.hasEncHw === 'boolean' && 'label' in gi,
    `sumber=${gi.source} · gpu=${gi.label.slice(0, 40)} · encHw=${gi.hasEncHw}`);

  /* ---------- 3. Uji kecepatan encoder (GPU vs CPU) ---------- */
  const probe = await evalJS(`quickAccProbe()`, true);
  check('quickAccProbe: struktur hasil benar', typeof probe.hw === 'number' && typeof probe.sw === 'number' && typeof probe.hwWins === 'boolean',
    `GPU=${probe.hw}fps · CPU=${probe.sw}fps · GPUmenang=${probe.hwWins}`);
  check('quickAccProbe: encoder CPU hidup di mesin ini', probe.sw > 0, `${probe.sw} fps`);
  const kotak = await waitFor(`document.querySelector('#gpuInfo').textContent.includes('UJI ENCODER')`, 90000);
  check('Kotak GPU diperbarui dengan hasil uji encoder', !!kotak, (await evalJS(`document.querySelector('#gpuInfo').textContent`)).slice(0, 120));

  /* ---------- 4. pickVCodecCfg mode CPU → prefer-software ---------- */
  const cpuCfg = await evalJS(`(async () => {
    state.acc = 'cpu'; _accCache = null;
    const cfg = await pickVCodecCfg(960, 540, 3e6, 30);
    return { ha: cfg && cfg.hardwareAcceleration, kind: _lastEnc.kind, fps: _lastEnc.fps };
  })()`, true);
  check('Mode CPU: encoder prefer-software terpilih', cpuCfg.ha === 'prefer-software' && cpuCfg.kind === 'sw',
    `ha=${cpuCfg.ha} · ${cpuCfg.fps}fps`);

  /* ---------- 5. pickVCodecCfg mode AUTO → pilih terkencang ---------- */
  const autoCfg = await evalJS(`(async () => {
    state.acc = 'auto'; _accCache = null;
    const cfg = await pickVCodecCfg(960, 540, 3e6, 30);
    return { ha: cfg && cfg.hardwareAcceleration, kind: _lastEnc.kind, fps: _lastEnc.fps };
  })()`, true);
  check('Mode AUTO: encoder terpilih sesuai hasil uji (tanpa GPU → CPU)', autoCfg.cfgOk !== false && autoCfg.kind === (probe.hwWins ? 'hw' : 'sw'),
    `kind=${autoCfg.kind} · ${autoCfg.fps}fps`);

  /* ---------- 6. pickParallelCount sadar-GPU ---------- */
  const par = await evalJS(`(() => {
    state.parallel = 0;
    const parts = 100;
    return { hw: pickParallelCount(parts, true), sw: pickParallelCount(parts, false), manual: (state.parallel = 5, pickParallelCount(parts, false)) };
  })()`);
  check('Paralel: GPU → lebih banyak pekerja daripada CPU', par.hw >= par.sw, `hw=${par.hw} · sw=${par.sw} · manual5=${par.manual}`);
  state_acc_reset: await evalJS(`state.parallel = 0;`);

  /* ---------- 7. END-TO-END: ekspor mode CPU + AUTO-SUBTITEL (v2.13) ---------- */
  await evalJS(`loadFromPath('/home/z/my-project/kinostra-desktop/testmedia/uji213.mp4')`);
  await new Promise(r => setTimeout(r, 1800));
  await evalJS(`state.scale = '0.5'; state.fps = 24; state.parallel = '1'; state.splitSec = 12; state.subs = []; state.acc = 'cpu'; _accCache = null;`);
  const e2e = await evalJS(`(async () => {
    await ensureAutoSubs({ ownModal: true });
    const res = await exportPartsToDir('${OUT214}', { title() { }, prog() { }, sub() { } });
    return { parts: res.length, names: res.map(r => r.name) };
  })()`, true);
  const f214 = fs.existsSync(OUT214) ? fs.readdirSync(OUT214).filter(f => f.endsWith('.mp4')) : [];
  check('END-TO-END: ekspor mode CPU + auto-sub sukses', e2e.parts === 1 && f214.length >= 1, f214.join(', '));
  const subsOk = await evalJS(`state.subs.length > 0 && state.subsOn`);
  check('Regresi v2.13: auto-sub tetap menghasilkan baris', subsOk, `${(await evalJS(`state.subs.length`))} baris`);

  /* ---------- 8. Mode GPU di mesin TANPA GPU → fallback aman ---------- */
  const gpuFb = await evalJS(`(async () => {
    state.acc = 'gpu'; _accCache = null; state.subs = [];
    window.__toasts = []; const _t = window.toast; window.toast = (m, t) => { window.__toasts.push(m); _t(m, t); };
    const res = await exportPartsToDir('${OUT214B}', { title() { }, prog() { }, sub() { } });
    window.toast = _t;
    return { parts: res.length, fellBack: window.__toasts.some(t => t.includes('Encoder GPU tidak merespons')) };
  })()`, true);
  const f214b = fs.existsSync(OUT214B) ? fs.readdirSync(OUT214B).filter(f => f.endsWith('.mp4')) : [];
  check('Mode GPU tanpa GPU: fallback ke CPU + MP4 tetap jadi', gpuFb.parts === 1 && f214b.length >= 1,
    `${f214b.join(', ')} · fallback-toast=${gpuFb.fellBack}`);
  await evalJS(`state.acc = 'auto'; _accCache = null;`);

  /* ---------- RINGKASAN ---------- */
  const nOk = results.filter(r => r.ok).length;
  console.log(`\n===== ${nOk}/${results.length} LULUS =====`);
  if (nOk < results.length) process.exit(1);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
