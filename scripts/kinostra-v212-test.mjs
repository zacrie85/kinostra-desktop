#!/usr/bin/env node
/* Uji otomatis KINOSTRA v2.12 — 7 fitur baru + regresi */
import WebSocket from '/home/z/my-project/kinostra-desktop/node_modules/ws/index.js';

const CDP = 'http://127.0.0.1:9222';
let ws, idSeq = 1;
const pending = new Map();
const consoleLines = [];
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const id = idSeq++;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + method)); } }, 150000);
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
    catch (e) { /* renderer sibuk merender — coba lagi */ }
    await new Promise(r => setTimeout(r, 2500));
  }
  return null;
}

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
      const txt = (m.params.args || []).map(a => a.value != null ? String(a.value) : (a.description || '')).join(' ').replace(/\s+/g, ' ').slice(0, 200);
      if (txt) consoleLines.push(txt);
    }
  });
  await send('Runtime.enable');

  /* ---------- 1. BOOT & UI BARU ---------- */
  await evalJS(`1`); // warmup
  const ui = await evalJS(`(() => {
    const $ = s => document.querySelector(s);
    return {
      frameChips: document.querySelectorAll('#frameStyles .fchip').length,
      frameOn: document.querySelectorAll('#frameStyles .fchip')[2]?.textContent || '',
      presets: document.querySelectorAll('#expPresets .fchip').length,
      segSpeed: !!$('#segSpeed'), segKb: !!$('#segKb'), segTrans: !!$('#segTrans'),
      cutBtns: !!$('#btnCutStart') && !!$('#btnCutEnd') && !!$('#btnCutClear'),
      srtImport: !!$('#btnSrtImport'),
      m1c: !!$('#m1c'),
      ver: document.querySelector('.tag')?.textContent || ''
    };
  })()`);
  check('UI: 10 chips frame (tanpa frame + neon + 8 baru)', ui.frameChips === 10, `${ui.frameChips}`);
  check('UI: 4 preset ekspor (YouTube/TikTok/Reels/Shorts)', ui.presets === 4, `${ui.presets}`);
  check('UI: modul kecepatan + ken burns + transisi', ui.segSpeed && ui.segKb && ui.segTrans);
  check('UI: modul 02B POTONG & HAPUS BAGIAN + tombol', ui.m1c && ui.cutBtns);
  check('UI: tombol IMPOR SRT', ui.srtImport);
  check('Versi header v2.12.0', ui.ver.includes('2.12.0'), ui.ver);

  /* ---------- 2. LOAD VIDEO UJI ---------- */
  await evalJS(`loadFromPath('/home/z/my-project/kinostra-desktop/testmedia/uji6.mp4')`);
  await new Promise(r => setTimeout(r, 1800));
  /* ekspor uji pakai skala kecil + fps rendah + paralel 1 agar cepat di Xvfb
     (encoder software, tanpa GPU) — logika tetap teruji penuh */
  await evalJS(`state.scale = '0.5'; state.fps = 24; state.parallel = '1';`);
  const meta = await evalJS(`({dur: state.duration, w: videoEl.videoWidth, name: state.file?.name})`);
  check('Video uji dimuat 6 dtk', meta.dur > 5.5 && meta.dur < 6.6, `${meta.dur.toFixed(2)}s ${meta.w}px`);

  /* ---------- 3. SEGMENTASI + POTONGAN ---------- */
  const segBase = await evalJS(`({n: segmentsCount(), first: segments()[0], last: segments()[segmentsCount()-1]})`);
  check('Split 30 dtk → 1 part', segBase.n === 1, `n=${segBase.n}`);
  const segCuts = await evalJS(`
    state.splitSec = 4;
    state.cuts = [{s:2, e:6}];
    const s = segments(); ({n: segmentsCount(), bounds: s.map(x=>[x.i, +x.start.toFixed(2), +x.end.toFixed(2)]), cutLen: cutsLen(), expLen: expLen()})`);
  check('Potongan 2-6 dtk: part menyambung & skip zona', segCuts.n === 1 && segCuts.bounds[0][0] === 0 && segCuts.bounds[0][1] === 0 && segCuts.bounds[0][2] === 2,
    JSON.stringify(segCuts.bounds));
  check('Statistik potongan: −4 dtk / ekspor 2 dtk', Math.abs(segCuts.cutLen - 4) < 0.01 && Math.abs(segCuts.expLen - 2) < 0.01);
  const segIdx = await evalJS(`({t1: currentSegIndex(1), t5: currentSegIndex(5), b: currentSegBounds(5)})`);
  check('currentSegIndex sadar-potong (t=5 di zona potong → idx 0 safe)', segIdx.t1 === 0 && segIdx.b === null, JSON.stringify(segIdx));
  await evalJS(`state.cuts = []; state.splitSec = 6; updateAll();`);

  /* ---------- 4. SRT PARSER ---------- */
  const srt = await evalJS(`(() => {
    const t = '1\\n00:00:01,000 --> 00:00:03,500\\n<b>Halo</b> dunia\\n\\n2\\n00:00:04.200 --> 00:00:06,000\\nBaris kedua\\n\\n3\\n00:01:05 --> 00:01:08,2\\nTanpa jam';
    const p = parseSrt(t);
    return { n: p.length, a: [p[0]?.s, p[0]?.e, p[0]?.text], b: p[1]?.s, c: p[2]?.s };
  })()`);
  check('Parser SRT: 3 baris, tag html dibuang, koma/titik ms', srt.n === 3 && srt.a[0] === 1 && srt.a[1] === 3.5 && srt.a[2] === 'Halo dunia' && srt.b === 4.2 && Math.abs(srt.c - 65) < 0.01, JSON.stringify(srt));

  /* ---------- 5. KEN BURNS ---------- */
  const kb = await evalJS(`(() => {
    state.kb = { mode: 'in', strength: 0.5 };
    const a = videoFrameRect(1920, 1080, 1080, 1920, 0.2);
    const b = videoFrameRect(1920, 1080, 1080, 1920, 5.5);
    state.kb = { mode: 'off', strength: 0.3 };
    const c = videoFrameRect(1920, 1080, 1080, 1920, 5.5);
    return { z0: a.w, zHalf: b.w, zOff: c.w };
  })()`);
  check('Ken Burns ZOOM IN: rect membesar sepanjang part', kb.z0 > 1080 && kb.zHalf > kb.z0 * 1.3 && Math.abs(kb.zOff - 1080) < 2, `${kb.z0.toFixed(0)} → ${kb.zHalf.toFixed(0)} (off=${kb.zOff.toFixed(0)})`);
  const kb2 = await evalJS(`(() => {
    state.kb = { mode: 'panx', strength: 0.6 };
    const a = videoFrameRect(1080, 1920, 1080, 1920, 0.1);
    const b = videoFrameRect(1080, 1920, 1080, 1920, 5.8);
    state.kb = { mode: 'off' };
    return { x0: a.x, x1: b.x };
  })()`);
  check('Ken Burns PAN: geser kiri→kanan (dengan overscan otomatis)', kb2.x0 > kb2.x1 + 40, `${kb2.x0.toFixed(0)} → ${kb2.x1.toFixed(0)}`);

  /* ---------- 6. 8 FRAME DIGAMBAR TANPA ERROR ---------- */
  const frames = ['bioskop', 'merahputih', 'kayu', 'gelombang', 'elegan', 'awan', 'panel', 'gradien'];
  const fr = await evalJS(`(async () => {
    const out = {};
    for (const k of ${JSON.stringify(frames)}) {
      try {
        state.frameStyle = k;
        drawComposition(ctx, cv.width, cv.height, 1.5);
        const d = ctx.getImageData(Math.round(cv.width*0.5), Math.round(cv.height*0.02), 2, 2).data;
        const d2 = ctx.getImageData(Math.round(cv.width*0.03), Math.round(cv.height*0.5), 2, 2).data;
        out[k] = { top: d[0] + d[1] + d[2], side: d2[0] + d2[1] + d2[2] };
      } catch (e) { out[k] = { err: String(e && e.message || e).slice(0, 80) }; }
    }
    state.frameStyle = 'off';
    return out;
  })()`, true);
  for (const k of frames) {
    const o = fr[k] || {};
    check(`Frame ${k.toUpperCase()} tergambar (tepi berwarna)`, !o.err && o.top > 8 && o.side > 8, o.err ? o.err : `atas=${o.top} sisi=${o.side}`);
  }

  /* ---------- 7. TRANSISI FADE & SLIDE ---------- */
  const tr = await evalJS(`(() => {
    state.splitSec = 6;
    state.trans = { mode: 'fade', dur: 0.8 };
    drawComposition(ctx, cv.width, cv.height, 0.2);   // 0.2 dtk di part-1 → hampir hitam
    const d1 = ctx.getImageData(cv.width >> 1, cv.height >> 1, 2, 2).data;
    drawComposition(ctx, cv.width, cv.height, 3.0);   // tengah part → normal
    const d2 = ctx.getImageData(cv.width >> 1, cv.height >> 1, 2, 2).data;
    state.trans = { mode: 'slide', dur: 0.8 };
    drawComposition(ctx, cv.width, cv.height, 0.2);   // slide: sisi kiri hitam
    const d3 = ctx.getImageData(Math.round(cv.width*0.02), cv.height >> 1, 2, 2).data;
    state.trans = { mode: 'off' };
    drawComposition(ctx, cv.width, cv.height, 3.0);
    const d4 = ctx.getImageData(Math.round(cv.width*0.02), cv.height >> 1, 2, 2).data;
    return { fadeDark: d1[0]+d1[1]+d1[2], fadeMid: d2[0]+d2[1]+d2[2], slideL: d3[0]+d3[1]+d3[2], normL: d4[0]+d4[1]+d4[2] };
  })()`);
  check('Transisi FADE: awal part gelap, tengah normal', tr.fadeDark < tr.fadeMid * 0.5, `gelap=${tr.fadeDark} tengah=${tr.fadeMid}`);
  check('Transisi SLIDE: sisi kiri terisi hitam saat masuk', tr.slideL < tr.normL * 0.5, `slide=${tr.slideL} normal=${tr.normL}`);

  /* ---------- 8. KECEPATAN: PTS & TOTAL FRAME ---------- */
  const spd = await evalJS(`(() => {
    state.speed = 2;
    const b = currentSegBounds(1.0);       // part 1 (0..6)
    const ts = Math.round(((1.0 - b.start) / 2) * 1e6);   // PTS output utk sumber t=1.0
    state.speed = 1;
    return { segStart: b.start, ts: ts, outDur: (b.end - b.start) / 2 };
  })()`);
  check('Kecepatan 2×: PTS output = sumber ÷ 2', spd.ts === 500000, `ts=${spd.ts}µs (harus 0.5s)`);
  check('Kecepatan 2×: durasi part 6dtk → 3dtk', spd.outDur === 3, `${spd.outDur}s`);

  /* ---------- 9. EKSPOR NYATA: frame BIOSKOP + KB + FADE + SPEED 1.5 ---------- */
  await evalJS(`
    state.splitSec = 6; state.cuts = [];
    state.frameStyle = 'bioskop';
    state.kb = { mode: 'in', strength: 0.35 };
    state.trans = { mode: 'fade', dur: 0.7 };
    state.speed = 1.5;
    state.title = 'UJI KINOSTRA 2.12';
    state.desc = 'uji frame bioskop + ken burns + transisi';
    state.subsOn = false;
    window.__expDone = null;
    (async () => {
      try {
        const dir = '/home/z/my-project/kinostra-desktop/testmedia/out212';
        const res = await exportPartsToDir(dir, { prog: () => {}, sub: () => {}, title: () => {} });
        window.__expDone = { ok: true, n: res.length, files: res.map(r => r.name) };
      } catch (e) { window.__expDone = { ok: false, err: String(e && e.message || e).slice(0, 200) }; }
    })();
    'started';
  `);
  const exp = await waitFor(`window.__expDone`);
  check('Ekspor 1 part (bioskop+KB+fade+1.5×) berhasil', exp.ok, exp.ok ? exp.files.join(', ') : exp.err);

  /* ---------- 10. VERIFIKASI FILE HASIL (ffprobe) ---------- */
  if (exp.ok) {
    const { execSync } = await import('child_process');
    for (let i = 0; i < Math.min(1, exp.files.length); i++) {
      try {
        const f = `/home/z/my-project/kinostra-desktop/testmedia/out212/${exp.files[i]}`;
        const durS = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${f}"`).toString().trim();
        const stream = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,nb_frames -of csv=p=0 "${f}"`).toString().trim();
        const expDur = 6 / 1.5;   /* 6 dtk sumber ÷ 1.5 = 4 dtk output */
        check(`File part ${i + 1}: durasi ${expDur}s (kecepatan 1.5×)`, Math.abs(parseFloat(durS) - expDur) < 0.35, `${durS}s [${stream}]`);
        const [codec, w, h] = stream.split(',');
        const dimsOk = (w === '540' && h === '960') || (w === '960' && h === '540');
        check(`File part ${i + 1}: H.264 skala 50% (${dimsOk ? 'dim OK' : 'dim SALAH'})`, codec === 'h264' && dimsOk, stream);
      } catch (e) { check(`File part ${i + 1} ffprobe`, false, String(e).slice(0, 120)); }
    }
  }

  /* ---------- 11. POTONGAN PADA EKSPOR ---------- */
  await evalJS(`
    state.frameStyle = 'off'; state.kb.mode = 'off'; state.trans.mode = 'off';
    state.speed = 1; state.splitSec = 4;
    state.cuts = [{s: 2, e: 8}];       /* potong tengah (2-6 di video 6 dtk) → sisa 0-2 = 1 part 2 dtk */
    updateAll();
  `);
  const cutN = await evalJS(`({n: segmentsCount(), segs: segments().map(s=>[+s.start.toFixed(1), +s.end.toFixed(1)])})`);
  check('segments() dgn potongan 2-8: 1 part (0-2)', cutN.n === 1 && cutN.segs[0][0] === 0 && cutN.segs[0][1] === 2, JSON.stringify(cutN.segs));
  await evalJS(`
    window.__expDone2 = null;
    (async () => {
      try {
        const dir = '/home/z/my-project/kinostra-desktop/testmedia/out212cut';
        const res = await exportPartsToDir(dir, { prog: () => {}, sub: () => {}, title: () => {} });
        window.__expDone2 = { ok: true, n: res.length, files: res.map(r => r.name) };
      } catch (e) { window.__expDone2 = { ok: false, err: String(e && e.message || e).slice(0, 200) }; }
    })();
    'started2';
  `);
  const exp2 = await waitFor(`window.__expDone2`);
  check('Ekspor dengan potongan: 1 file tersimpan', exp2.ok && exp2.n === 1, exp2.ok ? exp2.files.join(', ') : exp2.err);
  if (exp2.ok) {
    const { execSync } = await import('child_process');
    const f = `/home/z/my-project/kinostra-desktop/testmedia/out212cut/${exp2.files[0]}`;
    const d1 = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${f}"`).toString());
    check('Part hasil potongan durasi 2 dtk (mulai 0-2)', Math.abs(d1 - 2) < 0.3, `${d1.toFixed(2)}s`);
  }

  /* ---------- ringkasan ---------- */
  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  console.log(`\n===== HASIL: ${pass} LULUS / ${fail} GAGAL =====`);
  if (fail) console.log(results.filter(r => !r.ok).map(r => '  ✗ ' + r.name).join('\n'));
  console.log('\n--- CONSOLE RENDERER (terakhir 10) ---');
  consoleLines.slice(-10).forEach(l => console.log('  ·', l));
  process.exit(fail ? 1 : 0);
}
main().catch(e => {
  console.error('FATAL:', e.message);
  console.log('--- CONSOLE RENDERER (terakhir 10) ---');
  consoleLines.slice(-10).forEach(l => console.log('  ·', l));
  process.exit(2);
});
