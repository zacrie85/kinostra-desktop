/* ================================================================
   KINOSTRA DESKTOP v2.0 — Main Process
   Suite Video Otonom · 100% Offline setelah instalasi
   ================================================================ */
const { app, BrowserWindow, ipcMain, dialog, protocol, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

const isDev = !app.isPackaged;
const RENDERER_DIR = path.join(__dirname, '..', 'renderer');
const MODELS_DIR = path.join(app.getPath('userData'), 'models');

/* ---------- Protokol app:// (renderer) & kmodels:// (model AI lokal) ---------- */
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: 'kmodels', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1560,
    height: 940,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#07080A',
    title: 'KINOSTRA — Suite Video Otonom',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  });

  Menu.setApplicationMenu(null);
  win.loadURL('app://localhost/index.html');
  win.once('ready-to-show', () => win.show());

  // Tampilkan error render di console dev (diagnostik)
  win.webContents.on('console-message', (e, level, message) => {
    if (level >= 2) console.log('[renderer]', message);
  });

  // MODE SELF-TEST (diagnostik build): screenshot + cek DOM lalu keluar
  if (process.env.KINOSTRA_SMOKE === '1') {
    win.webContents.once('did-finish-load', async () => {
      try {
        await new Promise(r => setTimeout(r, 6500));
        const checks = await win.webContents.executeJavaScript(`(async () => {
          await new Promise(r => setTimeout(r, 500));
          return {
            chipCodec: document.querySelector('#chipCodec') ? document.querySelector('#chipCodec').textContent : 'NO-CHIP',
            mp4muxer: typeof Mp4Muxer !== 'undefined' && !!Mp4Muxer.Muxer,
            transformers: typeof window.transformers !== 'undefined' && !!window.transformers.env,
            ortWasmExists: true,
            fontCount: document.fonts ? document.fonts.size : -1,
            mods: document.querySelectorAll('.mod').length,
            btnExport: !!document.querySelector('#btnExport'),
            batchUI: !!document.querySelector('#btnBatchRun'),
            vfxUI: !!document.querySelector('#inVB'),
            zoomUI: !!document.querySelector('#inZoom') && !!document.querySelector('#inPanX') && !!document.querySelector('#btnFrameReset'),
            parUI: !!document.querySelector('#segParallel'),
            qboxUI: !!document.querySelector('#queueList') && !!document.querySelector('#btnQAdd') && !!document.querySelector('#btnQClear'),
            voicematch: typeof speechWindows === 'function' && typeof detectLang === 'function' && typeof cleanLine === 'function',
            turbo: typeof renderFramesBySeek === 'function' && typeof wrapSpaced === 'function' && typeof getLayer === 'function',
            frameRect: typeof videoFrameRect === 'function',
            compSrc: typeof compSrc === 'function',
            title: document.title
          };
        })()`);
        console.log('SMOKE-CHECKS ' + JSON.stringify(checks));
        const img = await win.webContents.capturePage();
        const buf = img.toPNG();
        require('fs').writeFileSync('/home/z/my-project/scripts/desktop_smoke.png', buf);
        console.log('SMOKE-SCREENSHOT saved ' + buf.length + ' bytes');
      } catch (e) {
        console.error('SMOKE-FAIL', e);
      }
      setTimeout(() => app.quit(), 800);
    });
  }

  // MODE UJI FUNGSIONAL: muat video uji -> render ekspor sungguhan -> verifikasi
  if (process.env.KINOSTRA_FUNC === '1') {
    win.webContents.once('did-finish-load', async () => {
      const fsx = require('fs');
      try {
        await new Promise(r => setTimeout(r, 6000));
        const videoB64 = fsx.readFileSync('/home/z/my-project/testmedia/test_video.mp4').toString('base64');
        const loaded = await win.webContents.executeJavaScript(`(async () => {
          const bin = atob(${JSON.stringify(videoB64)});
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const blob = new Blob([bytes], { type: 'video/mp4' });
          blob.name = 'test_video.mp4';
          await loadFileBlob(blob, true);
          await new Promise(r => setTimeout(r, 800));
          return { dur: state.duration, res: videoEl.videoWidth + 'x' + videoEl.videoHeight, audio: !!state.audioBuffer, title: state.title };
        })()`);
        console.log('FUNC-LOAD ' + JSON.stringify(loaded));

        /* --- UJI ZOOM 9:16: math videoFrameRect --- */
        const zoomTest = await win.webContents.executeJavaScript(`(async () => {
          state.ratio = '9:16';
          state.frame = { zoom: 2, panX: -1, panY: 0 };
          const r = videoFrameRect(1920, 1080, 1080, 1920);
          state.frame = { zoom: 1, panX: 0, panY: 0 };
          state.ratio = '16:9';
          return { x: Math.round(r.x), w: Math.round(r.w), covered: r.w >= 1080, showsLeft: r.x === 0 };
        })()`);
        console.log('FUNC-ZOOM ' + JSON.stringify(zoomTest));

        // render semua part paralel, split 13 dtk (4 part) + efek + subtitle + watermark
        const outDir = '/home/z/my-project/testmedia/out';
        fsx.rmSync(outDir, { recursive: true, force: true }); fsx.mkdirSync(outDir, { recursive: true });
        const t0 = Date.now();
        const result = await win.webContents.executeJavaScript(`(async () => {
          state.splitSec = 13;
          state.parallel = 0; /* otomatis */
          state.vfx.contrast = 1.1;
          state.wm.mode = 'text'; state.wm.text = '@KINOSTRA';
          state.subs = [{ s: 0.5, e: 2.5, text: 'UJI SUBTITEL KINOSTRA' }, { s: 3, e: 3.9, text: 'Baris kedua' }];
          state.desc = 'Deskripsi uji coba render';
          let lastLog = 0;
          const r = await exportPartsToDir('/home/z/my-project/testmedia/out', {
            prog: p => { const now = Date.now(); if (now - lastLog > 10000) { lastLog = now; console.log('PROG ' + Math.round(p * 100) + '%'); } },
            sub: s => {}
          });
          return { parts: r.map(x => ({ name: x.name, size: x.size })) };
        })()`);
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        console.log('FUNC-EXPORT time=' + secs + 's ' + JSON.stringify(result));
        const files = fsx.readdirSync(outDir).filter(f => f.endsWith('.mp4'));
        console.log('FUNC-VERIFY files=' + files.length + ' [' + files.join(', ') + ']');

        /* --- UJI THUMBNAIL KOTAK VIDEO (v2.2) --- */
        const thumbTest = await win.webContents.executeJavaScript(`(async () => {
          addBatchPath('/home/z/my-project/testmedia/test_video.mp4', 'impor');
          for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 1000)); if (state.batch[0].thumb) break; }
          const it = state.batch[0];
          return { thumb: (it.thumb || '').slice(0, 30), dur: Math.round(it.dur), rows: document.querySelectorAll('#queueList .qrow').length };
        })()`);
        console.log('FUNC-BATCHTHUMB ' + JSON.stringify(thumbTest));
      } catch (e) {
        console.error('FUNC-FAIL', e && e.message || e);
      }
      setTimeout(() => app.quit(), 800);
    });
  }

  // MODE UJI ZOOM: render 9:16 dengan zoom 2 & geser kiri → ekstrak frame
  if (process.env.KINOSTRA_ZOOMTEST === '1') {
    win.webContents.once('did-finish-load', async () => {
      const fsx = require('fs');
      try {
        await new Promise(r => setTimeout(r, 6000));
        const videoB64 = fsx.readFileSync('/home/z/my-project/testmedia/test_video.mp4').toString('base64');
        await win.webContents.executeJavaScript(`(async () => {
          const bin = atob(${JSON.stringify(videoB64)});
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const blob = new Blob([bytes], { type: 'video/mp4' });
          blob.name = 'test_video.mp4';
          await loadFileBlob(blob, true);
          state.ratio = '9:16'; state.bgMode = 'blur';
          state.scale = '0.5'; state.splitSec = 3; state.titleOn = false; state.descOn = false; state.subsOn = false;
          return true;
        })()`);
        const outDir = '/home/z/my-project/testmedia/zoomout';
        fsx.rmSync(outDir, { recursive: true, force: true }); fsx.mkdirSync(outDir, { recursive: true });
        /* patch: hanya render SATU klip 3 dtk (bukan semua part) */
        const oneClip = `(async () => {
          window.__origSegments = segments;
          window.__origSegmentsCount = segmentsCount;
          segments = () => [{ i: 0, start: 1, end: 4 }];
          segmentsCount = () => 1;
        })()`;
        const restore = `(async () => { segments = window.__origSegments; segmentsCount = window.__origSegmentsCount; })()`;
        await win.webContents.executeJavaScript(oneClip);
        /* zoom 1 */
        let r1 = await win.webContents.executeJavaScript(`(async () => {
          state.frame = { zoom: 1, panX: 0, panY: 0 };
          state.title = 'ZOOM1';
          const r = await exportPartsToDir('/home/z/my-project/testmedia/zoomout', { prog: () => {}, sub: () => {} });
          return r;
        })()`);
        console.log('ZOOM-EXPORT1 ' + JSON.stringify(r1));
        /* zoom 2 geser kiri penuh */
        let r2 = await win.webContents.executeJavaScript(`(async () => {
          state.frame = { zoom: 2, panX: -1, panY: 0 };
          state.title = 'ZOOM2LEFT';
          const r = await exportPartsToDir('/home/z/my-project/testmedia/zoomout', { prog: () => {}, sub: () => {} });
          return r;
        })()`);
        console.log('ZOOM-EXPORT2 ' + JSON.stringify(r2));
        /* zoom 2 geser kanan penuh */
        let r3 = await win.webContents.executeJavaScript(`(async () => {
          state.frame = { zoom: 2, panX: 1, panY: 0 };
          state.title = 'ZOOM2RIGHT';
          const r = await exportPartsToDir('/home/z/my-project/testmedia/zoomout', { prog: () => {}, sub: () => {} });
          return r;
        })()`);
        console.log('ZOOM-EXPORT3 ' + JSON.stringify(r3));
        await win.webContents.executeJavaScript(restore);
      } catch (e) { console.error('ZOOM-FAIL', e && e.message || e); }
      setTimeout(() => app.quit(), 800);
    });
  }

  // MODE SHOT: screenshot UI dengan batch thumbnail + zoom 9:16
  if (process.env.KINOSTRA_SHOT === '1') {
    win.webContents.once('did-finish-load', async () => {
      try {
        await new Promise(r => setTimeout(r, 5500));
        await win.webContents.executeJavaScript(`(async () => {
          addBatchPath('/home/z/my-project/testmedia/test_video.mp4', 'impor');
          addBatchPath('/home/z/my-project/testmedia/zoomout/ZOOM1_PART_01.mp4', 'batch');
          /* muat video utama + mode 9:16 zoom */
          await loadFromPath('/home/z/my-project/testmedia/test_video.mp4');
          document.querySelector('#segRatio button[data-v="9:16"]').click();
          state.frame = { zoom: 2, panX: -0.6, panY: 0 };
          syncFrameLabels();
          /* uji wrap judul panjang (v2.2) */
          document.querySelector('#inTitle').value = 'Panduan Lengkap Mengekspor Video Sinematik Dengan KINOSTRA Suite Untuk Pemula Sampai Mahir';
          document.querySelector('#inTitle').dispatchEvent(new Event('input'));
          document.querySelector('#inDesc').value = 'Judul panjang kini bersambung ke baris berikutnya secara otomatis.';
          document.querySelector('#inDesc').dispatchEvent(new Event('input'));
          document.querySelector('#m0').classList.remove('open');
          document.querySelector('#mq').classList.add('open');
          document.querySelector('#mq').scrollIntoView({ block: 'start' });
          for (let i = 0; i < 25; i++) { await new Promise(r => setTimeout(r, 1000)); if (state.batch.every(b => b.thumb)) break; }
          videoEl.currentTime = 2; videoEl.pause();
          return true;
        })()`);
        await new Promise(r => setTimeout(r, 1500));
        const img = await win.webContents.capturePage();
        require('fs').writeFileSync('/home/z/my-project/scripts/ui_v22.png', img.toPNG());
        console.log('SHOT-OK ' + img.toPNG().length + ' bytes');
      } catch (e) { console.error('SHOT-FAIL', e && e.message || e); }
      setTimeout(() => app.quit(), 800);
    });
  }

  // MODE PROBE: diagnosa saveBlobToDir
  if (process.env.KINOSTRA_PROBE === '1') {
    win.webContents.once('did-finish-load', async () => {
      try {
        await new Promise(r => setTimeout(r, 5000));
        const probe = require('/home/z/my-project/scripts/probe-save.js');
        const res = await probe(win);
        console.log('PROBE-RESULT ' + JSON.stringify(res, null, 1));
      } catch (e) { console.error('PROBE-FAIL', e && e.message || e); }
      setTimeout(() => app.quit(), 800);
    });
  }

  // MODE UJI AI: unduh whisper-tiny -> muat via kmodels:// -> inferensi kecil
  if (process.env.KINOSTRA_AI === '1') {
    win.webContents.once('did-finish-load', async () => {
      try {
        await new Promise(r => setTimeout(r, 6000));
        const r1 = await win.webContents.executeJavaScript(`(async () => {
          const t0 = Date.now();
          await ensureModel('Xenova/whisper-tiny', () => {});
          const lib = xfLib();
          const asr = await lib.pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', { quantized: true });
          // audio uji: noise/bisik 2 detik (tidak ada ucapan) — cukup membuktikan inferensi jalan
          const sr = 16000, len = sr * 2;
          const pcm = new Float32Array(len);
          for (let i = 0; i < len; i++) pcm[i] = (Math.random() * 2 - 1) * 0.01;
          const out = await asr(pcm, { chunk_length_s: 30, return_timestamps: true });
          return { ok: true, ms: Date.now() - t0, text: (out.text || '').trim().slice(0, 80) };
        })()`);
        console.log('AI-TEST ' + JSON.stringify(r1));
      } catch (e) {
        console.error('AI-FAIL', e && e.message || e);
      }
      setTimeout(() => app.quit(), 800);
    });
  }

  // MODE UJI AI v2 (VOICEMATCH): suara asli Indonesia + Inggris → deteksi bahasa + transkrip
  if (process.env.KINOSTRA_AI2 === '1') {
    win.webContents.once('did-finish-load', async () => {
      const fsx = require('fs');
      const runCase = async (file, tag) => {
        const b64 = fsx.readFileSync(file).toString('base64');
        const r = await win.webContents.executeJavaScript(`(async () => {
          const bin = atob(${JSON.stringify(b64)});
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const blob = new Blob([bytes], { type: 'audio/wav' });
          blob.name = ${JSON.stringify(require('path').basename(file))};
          await loadFileBlob(blob, true);
          await new Promise(r => setTimeout(r, 500));
          document.querySelector('#asrLang').value = 'auto';
          state.subTarget = 'src';
          const t0 = Date.now();
          await generateSubs();
          return { n: state.subs.length, ms: Date.now() - t0,
            vmLang: document.querySelector('#vmLang').textContent,
            text: state.subs.map(s => s.text).join(' | ').slice(0, 320) };
        })()`);
        console.log('AI2-' + tag + ' ' + JSON.stringify(r));
        return r;
      };
      try {
        await runCase('/home/z/my-project/testmedia/speech_id2.wav', 'ID');
        await runCase('/home/z/my-project/testmedia/speech_en2.wav', 'EN');
      } catch (e) { console.error('AI2-FAIL', e && e.message || e); }
      setTimeout(() => app.quit(), 800);
    });
  }

  // MODE DEBUG AI3: dump hasil probe per kandidat bahasa (tiny vs base)
  if (process.env.KINOSTRA_AI3 === '1') {
    win.webContents.once('did-finish-load', async () => {
      const fsx = require('fs');
      try {
        await new Promise(r => setTimeout(r, 6000));
        await win.webContents.executeJavaScript(`(async () => {
          await ensureModel('Xenova/whisper-tiny', () => {});
          await ensureModel('Xenova/whisper-base', () => {});
          return true;
        })()`);
        for (const [file, tag] of [
          ['/home/z/my-project/testmedia/t_xiaochen.wav', 'ID-XIAOCHEN'],
          
          
          ['/home/z/my-project/testmedia/t_xiaochen.wav', 'ID-XIAOCHEN'],
          ['/home/z/my-project/testmedia/speech_en.wav', 'EN']
        ]) {
          const b64 = fsx.readFileSync(file).toString('base64');
          const r = await win.webContents.executeJavaScript(`(async () => {
            const bin = atob(${JSON.stringify(b64)});
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const blob = new Blob([bytes], { type: 'audio/wav' });
            blob.name = ${JSON.stringify(require('path').basename(file))};
            await loadFileBlob(blob, true);
            await new Promise(r => setTimeout(r, 400));
            const pcm = await getMono16k();
            const wins = speechWindows(pcm, 16000);
            const c0 = wins[0] || { s: 0, e: 14 };
            const probe = pcm.slice(Math.floor(c0.s * 16000), Math.min(pcm.length, Math.floor(Math.min(c0.e, c0.s + 14) * 16000)));
            const res = { wins: wins.length, probeSec: Math.round(probe.length / 16000) };
            /* deteksi kanonik: argmax token bahasa */
            const asr0 = await getASR('Xenova/whisper-tiny', () => {});
            try {
              const det = await whisperDetectLang(asr0, probe);
              res.detect_tiny = det.code + ' (id ' + det.id + ', seqLen ' + det.seqLen + ')';
            } catch (e) { res.detect_tiny = 'ERR ' + (e.message || e).slice(0, 60); }
            const asrB = await getASR('Xenova/whisper-base', () => {});
            try {
              const detB = await whisperDetectLang(asrB, probe);
              res.detect_base = detB.code + ' (id ' + detB.id + ', seqLen ' + detB.seqLen + ')';
            } catch (e) { res.detect_base = 'ERR ' + (e.message || e).slice(0, 60); }
            for (const model of ['Xenova/whisper-tiny', 'Xenova/whisper-base']) {
              const asr = await getASR(model, () => {});
              res[model.split('/')[1]] = {};
              for (const lang of [null, 'indonesian', 'english', 'spanish']) {
                const opts = { task: 'transcribe', chunk_length_s: 30, stride_length_s: 5, return_timestamps: false };
                if (lang) opts.language = lang;
                const out = await asr(probe, opts);
                res[model.split('/')[1]][lang || 'auto'] = (out.text || '').slice(0, 110);
              }
            }
            return res;
          })()`);
          console.log('AI3-' + tag + ' ' + JSON.stringify(r, null, 1));
        }
      } catch (e) { console.error('AI3-FAIL', e && e.message || e); }
      setTimeout(() => app.quit(), 800);
    });
  }

  // MODE UJI TITLE WRAP (v2.2): judul panjang harus bersambung ke bawah
  if (process.env.KINOSTRA_TITLE === '1') {
    win.webContents.once('did-finish-load', async () => {
      try {
        await new Promise(r => setTimeout(r, 6000));
        const videoB64 = require('fs').readFileSync('/home/z/my-project/testmedia/test_video.mp4').toString('base64');
        const r = await win.webContents.executeJavaScript(`(async () => {
          const bin = atob(${JSON.stringify(videoB64)});
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const blob = new Blob([bytes], { type: 'video/mp4' });
          blob.name = 'test_video.mp4';
          await loadFileBlob(blob, true);
          const LONG = 'Panduan Lengkap Mengekspor Video Sinematik Dengan KINOSTRA Suite Untuk Pemula Sampai Mahir Sekali';
          $('#inTitle').value = LONG;
          $('#inTitle').dispatchEvent(new Event('input'));
          await new Promise(r2 => setTimeout(r2, 300));
          document.fonts.load('400 52px "Bebas Neue"');
          await new Promise(r2 => setTimeout(r2, 500));
          const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
          const x = c.getContext('2d');
          x.font = '52px "Bebas Neue"';
          const lines = wrapSpaced(x, state.title.toUpperCase(), 1080 * 0.84, 7);
          /* render frame preview untuk visual */
          drawComposition(ctx, cv.width, cv.height, 2.5);
          return {
            stateTitle: state.title.slice(0, 40), inputVal: $('#inTitle').value.slice(0, 40),
            nLines: lines.length, lines: lines.map(l => l.slice(0, 30)),
            maxW: Math.round(Math.max(...lines.map(l => measureSpaced(x, l, 7))))
          };
        })()`);
        console.log('TITLE-CHECK ' + JSON.stringify(r, null, 1));
        const img = await win.webContents.capturePage();
        require('fs').writeFileSync('/home/z/my-project/scripts/title_wrap.png', img.toPNG());
      } catch (e) { console.error('TITLE-FAIL', e && e.message || e); }
      setTimeout(() => app.quit(), 800);
    });
  }

  win.on('closed', () => { win = null; });
}

/* ---------- Handler app:// ---------- */
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.gif': 'image/gif',
  '.wasm': 'application/wasm'
};

function handleAppScheme(request) {
  try {
    const u = new URL(request.url);
    let p = decodeURIComponent(u.pathname);
    if (p === '/' || p === '') p = '/index.html';
    const file = path.normalize(path.join(RENDERER_DIR, p));
    if (!file.startsWith(RENDERER_DIR)) {
      return new Response('forbidden', { status: 403 });
    }
    if (!fs.existsSync(file)) {
      return new Response('not found', { status: 404 });
    }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const data = fs.readFileSync(file);
    return new Response(data, { headers: { 'Content-Type': type } });
  } catch (e) {
    return new Response('error: ' + e.message, { status: 500 });
  }
}

/* ---------- Handler kmodels:// (bobot model AI dari disk lokal) ---------- */
/* Peta lowercase -> path absolut (model URL bisa mengubah kapitalisasi host) */
let _modelFileMap = null, _modelMapAt = 0;
function buildModelFileMap() {
  const map = new Map();
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const ent of entries) {
      const fp = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(fp);
      else map.set(fp.slice(MODELS_DIR.length + 1).toLowerCase().replace(/\\/g, '/'), fp);
    }
  };
  walk(MODELS_DIR);
  return map;
}
function resolveModelFile(rel) {
  if (!fs.existsSync(MODELS_DIR)) return null;
  const now = Date.now();
  if (!_modelFileMap || now - _modelMapAt > 10000) { _modelFileMap = buildModelFileMap(); _modelMapAt = now; }
  const key = rel.replace(/^\/+/, '').toLowerCase();
  return _modelFileMap.get(key) || null;
}
function handleModelsScheme(request) {
  try {
    const u = new URL(request.url);
    // kmodels://Xenova/whisper-tiny/onnx/enc.onnx -> host=Xenova path=/whisper-tiny/...
    // atau kmodels:/Xenova/... (path saja) — dua-duanya didukung
    let rel = decodeURIComponent(u.pathname);
    if (u.hostname && u.hostname !== 'localhost') rel = '/' + decodeURIComponent(u.hostname) + rel;
    const file = resolveModelFile(rel);
    if (!file) return new Response('model file not found: ' + rel, { status: 404 });
    const buf = fs.readFileSync(file);
    return new Response(buf, {
      headers: { 'Content-Type': 'application/octet-stream' }
    });
  } catch (e) {
    return new Response('error: ' + e.message, { status: 500 });
  }
}

/* ================================================================
   DOWNLOADER MODEL AI (sekali saja, lalu 100% offline)
   ================================================================ */
const HF_HOST = 'https://huggingface.co';

function modelDir(modelId) {
  return path.join(MODELS_DIR, modelId);
}

async function downloadModelFile(modelId, filename, emit) {
  const dest = path.join(modelDir(modelId), filename);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    return { cached: true, size: fs.statSync(dest).size };
  }
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const url = `${HF_HOST}/${modelId}/resolve/main/${filename}`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  const total = Number(res.headers.get('content-length') || 0);
  const tmp = dest + '.part';
  const ws = fs.createWriteStream(tmp);
  let loaded = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value.byteLength;
    ws.write(Buffer.from(value));
    if (total) emit({ modelId, file: filename, loaded, total, pct: loaded / total });
  }
  await new Promise((res2, rej2) => { ws.end(() => res2()); ws.on('error', rej2); });
  fs.renameSync(tmp, dest);
  return { cached: false, size: loaded };
}

ipcMain.handle('models:ensure', async (e, payload) => {
  const { modelId, files } = payload; // files: {required:[], optional:[]}
  const emit = (info) => {
    if (win && !win.isDestroyed()) win.webContents.send('models:progress', info);
  };
  try {
    await fsp.mkdir(modelDir(modelId), { recursive: true });
    const all = [...files.required.map(f => ({ f, req: true })), ...files.optional.map(f => ({ f, req: false }))];
    const result = { modelId, files: [], failed: [] };
    for (const { f, req } of all) {
      try {
        const r = await downloadModelFile(modelId, f, emit);
        result.files.push({ file: f, ...r });
      } catch (err) {
        if (req) { throw new Error(`Gagal unduh ${f}: ${err.message}`); }
        result.failed.push(f);
      }
    }
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err.message, modelId };
  }
});

ipcMain.handle('models:status', async () => {
  try {
    if (!fs.existsSync(MODELS_DIR)) return { dir: MODELS_DIR, models: [] };
    const models = [];
    for (const id of fs.readdirSync(MODELS_DIR)) {
      const d = modelDir(id);
      if (!fs.statSync(d).isDirectory()) continue;
      let size = 0, count = 0;
      const walk = (p) => {
        for (const f of fs.readdirSync(p)) {
          const fp = path.join(p, f);
          const st = fs.statSync(fp);
          if (st.isDirectory()) walk(fp); else { size += st.size; count++; }
        }
      };
      walk(d);
      models.push({ id, sizeMB: +(size / 1048576).toFixed(1), files: count });
    }
    return { dir: MODELS_DIR, models };
  } catch (e) {
    return { dir: MODELS_DIR, models: [], error: e.message };
  }
});

ipcMain.handle('models:openFolder', async () => {
  await fsp.mkdir(MODELS_DIR, { recursive: true });
  shell.openPath(MODELS_DIR);
  return true;
});

/* ================================================================
   DIALOG FILE & PENYIMPANAN
   ================================================================ */
ipcMain.handle('dialog:openMedia', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Impor Media — MP4 · MKV · TS · WEBM · MP3',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Media', extensions: ['mp4', 'mkv', 'ts', 'webm', 'mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac', 'mov'] },
      { name: 'Semua File', extensions: ['*'] }
    ]
  });
  if (r.canceled) return [];
  return r.filePaths;
});

ipcMain.handle('dialog:openWatermark', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Pilih Gambar Watermark (PNG transparan disarankan)',
    properties: ['openFile'],
    filters: [{ name: 'Gambar', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }]
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  const buf = await fsp.readFile(p);
  return { name: path.basename(p), data: buf.toString('base64') };
});

ipcMain.handle('dialog:pickOutputDir', async (e, defaultName) => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Pilih Folder Output — semua part MP4 disimpan di sini',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: defaultName || app.getPath('videos')
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return r.filePaths[0];
});

/* Stream writer: buka handle -> tulis chunk -> tutup (untuk file besar) */
const streams = new Map();
let streamSeq = 1;

ipcMain.handle('fs:beginWrite', async (e, { dir, fileName }) => {
  // hindari tabrakan nama: tambah akhiran (1), (2), ...
  let base = fileName, ext = '';
  const m = base.match(/^(.*?)(\.[^.]+)$/);
  if (m) { base = m[1]; ext = m[2]; }
  let final = path.join(dir, base + ext);
  let i = 1;
  while (fs.existsSync(final)) { final = path.join(dir, `${base} (${i})${ext}`); i++; }
  const id = streamSeq++;
  const ws = fs.createWriteStream(final);
  streams.set(id, { ws, path: final });
  return { id, path: final };
});

ipcMain.handle('fs:writeChunk', async (e, { id, chunk }) => {
  const s = streams.get(id);
  if (!s) throw new Error('stream tidak ditemukan');
  const buf = Buffer.from(chunk);
  await new Promise((res, rej) => { s.ws.write(buf, err => err ? rej(err) : res()); });
  return true;
});

ipcMain.handle('fs:endWrite', async (e, { id }) => {
  const s = streams.get(id);
  if (!s) throw new Error('stream tidak ditemukan');
  const p = s.path;
  await new Promise((res, rej) => { s.ws.end(err => err ? rej(err) : res()); });
  streams.delete(id);
  return { path: p, size: fs.statSync(p).size };
});

ipcMain.handle('fs:abortWrite', async (e, { id }) => {
  const s = streams.get(id);
  if (!s) return false;
  try { s.ws.close(); } catch (_) {}
  try { fs.unlinkSync(s.path); } catch (_) {}
  streams.delete(id);
  return true;
});

ipcMain.handle('fs:readMediaFiles', async (e, paths) => {
  // Untuk batch: baca file media dari disk jadi ArrayBuffer
  const out = [];
  for (const p of paths || []) {
    try {
      const buf = await fsp.readFile(p);
      out.push({
        name: path.basename(p),
        path: p,
        size: buf.byteLength,
        data: buf // Buffer terproses via structured clone -> Uint8Array di renderer
      });
    } catch (err) {
      out.push({ name: path.basename(p), path: p, error: err.message });
    }
  }
  return out;
});

ipcMain.handle('shell:showInFolder', async (e, p) => {
  shell.showItemInFolder(p);
  return true;
});

ipcMain.handle('shell:openPath', async (e, p) => {
  shell.openPath(p);
  return true;
});

/* ================================================================
   APP LIFECYCLE
   ================================================================ */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(() => {
    protocol.handle('app', handleAppScheme);
    protocol.handle('kmodels', handleModelsScheme);
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  app.quit();
});
