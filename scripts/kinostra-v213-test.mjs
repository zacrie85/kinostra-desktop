#!/usr/bin/env node
/* Uji otomatis KINOSTRA v2.13 — AUTO-SUBTITEL + VOCALIS TURBO + regresi
   Jalankan: xvfb-run -a node scripts/kinostra-v213-test.mjs
   Prasyarat: electron berjalan dgn --remote-debugging-port=9222,
   KINOSTRA_WHISPER_BIN → whisper-cli Linux build, model tiny tersedia. */
import WebSocket from '/home/z/my-project/kinostra-desktop/node_modules/ws/index.js';
import fs from 'fs';

const CDP = 'http://127.0.0.1:9222';
let ws, idSeq = 1;
const pending = new Map();
const consoleLines = [];
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
async function waitFor(expr, ms = 480000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const v = await evalJS(expr); if (v) return v; }
    catch (e) { /* renderer sibuk — coba lagi */ }
    await new Promise(r => setTimeout(r, 2500));
  }
  return null;
}
const OUT213 = '/home/z/my-project/kinostra-desktop/build/out213';
const OUTREG = '/home/z/my-project/kinostra-desktop/build/out213reg';
fs.rmSync(OUT213, { recursive: true, force: true });
fs.rmSync(OUTREG, { recursive: true, force: true });

const results = [];
function check(name, ok, detail = '') { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); }

async function main() {
  const list = await (await fetch(CDP + '/json')).json();
  ws = new WebSocket(list[0].webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));
  ws.on('message', d => {
    const m = JSON.parse(d);
    if (m.id && pending.has(m.id)) { pending.get(m.id).res(m.result); pending.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled') {
      const txt = (m.params.args || []).map(a => a.value != null ? String(a.value) : (a.description || '')).join(' ').replace(/\s+/g, ' ').slice(0, 220);
      if (txt) consoleLines.push(txt);
    }
  });
  await send('Runtime.enable');

  /* ---------- 1. BOOT & UI BARU v2.13 ---------- */
  await evalJS(`1`);
  const ui = await evalJS(`(() => {
    const $ = s => document.querySelector(s);
    return {
      ver: $('.tag')?.textContent || '',
      autoSub: !!$('#autoSub'), autoSubOn: $('#autoSub')?.checked,
      skipSil: !!$('#subSkipSilence'), skipSilOn: $('#subSkipSilence')?.checked,
      engOpts: [...($('#asrModel')?.options || [])].map(o => o.value),
      subsOn: $('#subsOn')?.checked,
      planChunks: typeof planChunks === 'function',
      ensureAutoSubs: typeof ensureAutoSubs === 'function',
      transcribeCore: typeof transcribeCore === 'function',
      frameChips: document.querySelectorAll('#frameStyles .fchip').length
    };
  })()`);
  check('Versi header v2.13.0', ui.ver.includes('2.13.0'), ui.ver);
  check('UI: checkbox AUTO-SUBTITEL ada & aktif default', ui.autoSub && ui.autoSubOn);
  check('UI: checkbox MODE TURBO (lewati hening) ada & aktif default', ui.skipSil && ui.skipSilOn);
  check('UI: mesin CEPAT (base) ada di pilihan', ui.engOpts.includes('base'), ui.engOpts.join(','));
  check('JS: planChunks + ensureAutoSubs + transcribeCore terpasang', ui.planChunks && ui.ensureAutoSubs && ui.transcribeCore);
  check('Regresi: 10 chips frame v2.12 masih ada', ui.frameChips === 10, String(ui.frameChips));
  const hookExp = fs.readFileSync('/home/z/my-project/kinostra-desktop/renderer/js/exporter.js', 'utf8').includes('await ensureAutoSubs({ ownModal: true })');
  const hookBat = fs.readFileSync('/home/z/my-project/kinostra-desktop/renderer/js/batch.js', 'utf8').includes('await ensureAutoSubs({ sub: setSub');
  check('Hook AUTO-SUB terpasang di doExport & runBatch', hookExp && hookBat);

  /* ---------- 2. planChunks — potongan & lewati hening ---------- */
  const pc = await evalJS(`(() => {
    const sr = 16000, dur = 300;
    const pcm = new Float32Array(sr * dur);
    for (let t of [0, 120, 240]) {
      for (let i = Math.floor(t * sr); i < (t + 60) * sr; i++) {
        pcm[i] = 0.4 * Math.sin(2 * Math.PI * 220 * (i / sr)) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 3 * (i / sr)));
      }
    }
    const on = planChunks(pcm, sr, false, true);
    const off = planChunks(pcm, sr, false, false);
    const inSpeech = c => (c.b > 1 && c.a < 62) || (c.b > 119 && c.a < 182) || (c.b > 239 && c.a < 300);
    return {
      nOn: on.length, nOff: off.length,
      allInSpeech: on.every(inSpeech),
      covered: on.every(c => c.b > c.a),
      maxLen: Math.max(...off.map(c => c.b - c.a)),
      offCoverFull: Math.min(...off.map(c => c.a)) <= 0.3 && Math.max(...off.map(c => c.b)) >= dur - 0.3
    };
  })()`);
  check('planChunks: lewati hening → hanya 3 wilayah bersuara', pc.nOn === 3, `nOn=${pc.nOn}`);
  check('planChunks: semua potongan di wilayah bersuara & valid', pc.allInSpeech && pc.covered);
  check('planChunks: tanpa lewati hening → cover penuh ≤240 dtk', pc.offCoverFull && pc.maxLen <= 240.6, `max=${pc.maxLen.toFixed(1)}s`);

  /* ---------- 3. status mesin native + 4 model ---------- */
  const st = await evalJS(`window.kinostra.whisperStatus()`, true);
  check('Mesin native ditemukan', st.binOk, st.binPath || '');
  check('Status memuat 4 model (turbo/small/base/tiny)', Object.keys(st.models).length === 4, Object.keys(st.models).join(','));
  const tinyReady = await evalJS(`window.kinostra.whisperEnsure('tiny')`, true);
  check('Model RINGAN (tiny) siap', tinyReady.ok, tinyReady.ok ? (tinyReady.cached ? 'cached' : 'unduh ' + Math.round((tinyReady.size || 0) / 1048576) + 'MB') : tinyReady.error);

  /* ---------- 4. TRANSKRIP PARALEL NYATA (jalur TURBO, audio sintetis) ---------- */
  await evalJS(`window.__wprog = []; window.kinostra.onWhisperProgress(i => { if (i && i.phase === 'transcribe') window.__wprog.push(i); });`);
  const tr = await evalJS(`(async () => {
    const sr = 16000, dur = 24;
    const pcm = new Float32Array(sr * dur);
    for (let t of [0, 16]) for (let i = Math.floor(t * sr); i < (t + 8) * sr; i++)
      pcm[i] = 0.5 * Math.sin(2 * Math.PI * 180 * (i / sr)) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * (i / sr)));
    const tmp = (await window.kinostra.whisperStatus()).tmpDir;
    const bytes = encodeWav16(pcm, sr);
    const { id, path: p } = await window.kinostra.beginWrite(tmp, 'uji_turbo.wav');
    await window.kinostra.writeChunk(id, bytes);
    await window.kinostra.endWrite(id);
    const t0 = Date.now();
    const r = await window.kinostra.whisperTranscribe({
      wavPath: p, probePath: null, engine: 'tiny', lang: 'id', song: false,
      chunks: [{ a: 0, b: 8.25 }, { a: 15.75, b: 24 }]
    });
    return { ok: r.ok, err: r.error, turbo: r.turbo, nSeg: (r.segments || []).length,
      inRange: (r.segments || []).every(s => s.s >= -0.01 && s.e <= 24.01), ms: Date.now() - t0 };
  })()`, true);
  check('TURBO: transkrip 2 potongan paralel OK', tr.ok, tr.ok ? `${tr.ms}ms` : tr.err);
  check('TURBO: info pekerja & potongan dikembalikan', tr.turbo && tr.turbo.chunks === 2, JSON.stringify(tr.turbo));
  check('TURBO: stempel waktu dalam rentang audio', tr.inRange);
  check('TURBO: progres gabungan terkirim ke renderer', (await evalJS(`window.__wprog.length > 0 && window.__wprog.some(p => p.total === 2)`)));

  /* ---------- 5. TRANSKRIP BAHASA INDONESIA (espeak, potongan tunggal) ----------
     NB: main menghapus wavPath setelah selesai (by design) → pakai salinan. */
  fs.copyFileSync('/home/z/my-project/testwhisper/id16_16k.wav', '/tmp/uji_id16.wav');
  const trID = await evalJS(`(async () => {
    const r = await window.kinostra.whisperTranscribe({
      wavPath: '/tmp/uji_id16.wav', probePath: null,
      engine: 'tiny', lang: 'id', song: false, chunks: [{ a: 0, b: 11 }]
    });
    return { ok: r.ok, err: r.error, nSeg: (r.segments || []).length,
      sample: (r.segments || []).slice(0, 2).map(s => s.text.slice(0, 40)) };
  })()`, true);
  check('Transkrip bahasa Indonesia menghasilkan baris', trID.ok && trID.nSeg > 0, `${trID.nSeg} baris: ${(trID.sample || []).join(' | ')}${trID.ok ? '' : ' · ' + trID.err}`);

  /* ---------- 6. AUTO-SUB: hormati subtitel yang sudah ada ---------- */
  await evalJS(`loadFromPath('/home/z/my-project/kinostra-desktop/testmedia/uji213.mp4')`);
  await new Promise(r => setTimeout(r, 1800));
  const keep = await evalJS(`(async () => {
    state.subs = [{ s: 1, e: 2, text: 'BARIS UJI TETAP' }];
    const before = JSON.stringify(state.subs);
    await ensureAutoSubs({});
    return { same: JSON.stringify(state.subs) === before, n: state.subs.length };
  })()`, true);
  check('AUTO-SUB: subtitel yang sudah ada TIDAK ditimpa', keep.same && keep.n === 1);

  /* ---------- 7. AUTO-SUB: kondisi mati ---------- */
  const off = await evalJS(`(async () => {
    state.subs = []; document.querySelector('#autoSub').checked = false;
    await ensureAutoSubs({});
    return { untouched: state.subs.length === 0 };
  })()`, true);
  check('AUTO-SUB: pengaturan mati → tidak ada transkrip', off.untouched);
  await evalJS(`document.querySelector('#autoSub').checked = true;`);

  /* ---------- 8. END-TO-END: AUTO-SUB + EKSPOR NYATA ----------
     uji213.mp4 = video 11 dtk bersuara espeak INDONESIA nyata.
     ensureAutoSubs → transkrip nyata (tiny) → exportPartsToDir → MP4. */
  await evalJS(`state.scale = '0.5'; state.fps = 24; state.parallel = '1'; state.splitSec = 12; state.subs = [];`);
  const e2e = await evalJS(`(async () => {
    const t0 = Date.now();
    await ensureAutoSubs({ ownModal: true });
    const res = await exportPartsToDir('${OUT213}', { title() { }, prog() { }, sub() { } });
    return { ms: Date.now() - t0, parts: res.length, names: res.map(r => r.name), sizes: res.map(r => r.size) };
  })()`, true);
  check('END-TO-END: auto-sub + ekspor 1 part sukses', e2e.parts === 1, JSON.stringify(e2e.names));
  const filesOnDisk = fs.existsSync(OUT213) ? fs.readdirSync(OUT213).filter(f => f.endsWith('.mp4')) : [];
  check('END-TO-END: file MP4 ada di disk', filesOnDisk.length >= 1, filesOnDisk.join(', '));
  const subAuto = await evalJS(`({ n: state.subs.length, on: state.subsOn, stat: document.querySelector('#subStat').textContent })`);
  check('AUTO-SUB: baris subtitel dihasilkan dari suara nyata', subAuto.n > 0 && subAuto.on, `${subAuto.n} baris · ${subAuto.stat.slice(0, 80)}`);

  /* ---------- 9. REGRESI: ekspor dgn potongan + kecepatan (v2.12) ---------- */
  const reg = await evalJS(`(async () => {
    state.cuts = [{ s: 2, e: 3 }]; state.speed = 1.5;
    const res = await exportPartsToDir('${OUTREG}', { title() { }, prog() { }, sub() { } });
    state.cuts = []; state.speed = 1;
    return { parts: res.length, names: res.map(r => r.name) };
  })()`, true);
  const regFiles = fs.existsSync(OUTREG) ? fs.readdirSync(OUTREG).filter(f => f.endsWith('.mp4')) : [];
  check('Regresi: ekspor potongan + kecepatan 1.5× tetap jalan', reg.parts >= 1 && regFiles.length >= 1, regFiles.join(', '));

  /* ---------- 10. Parser SRT + shiftSubs regresi ---------- */
  const srt = await evalJS(`(() => {
    const rows = parseSrt('1\\n00:00:01,000 --> 00:00:02,500\\n<i>Halo dunia</i>\\n\\n2\\n00:00:03.0 --> 00:00:04.0\\nBaris dua\\n');
    return rows.length === 2 && rows[0].text === 'Halo dunia' && Math.abs(rows[1].s - 3) < 0.01;
  })()`);
  check('Regresi: parser SRT v2.12 tetap benar', srt);

  /* ---------- RINGKASAN ---------- */
  const nOk = results.filter(r => r.ok).length;
  console.log(`\n===== ${nOk}/${results.length} LULUS =====`);
  if (nOk < results.length) process.exit(1);
}

main().catch(e => { console.error('FATAL:', e.message); console.error('Console terakhir:', consoleLines.slice(-8).join('\n')); process.exit(2); });
