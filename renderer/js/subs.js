/* ================================================================
   KINOSTRA DESKTOP — subs.js
   Subtitel AI: Whisper 100% lokal (Transformers.js)
   Model diunduh SEKALI ke disk app (kmodels://) lalu offline permanen
   UPGRADE: target terjemahan ASLI / INDONESIA / INGGRIS + geser waktu
   ================================================================ */
'use strict';

/* ---------- MANIFEST MODEL (unduh sekali ke AppData) ---------- */
const MODEL_FILES = {
  'Xenova/whisper-tiny': {
    required: ['config.json', 'preprocessor_config.json', 'tokenizer.json',
      'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx'],
    optional: ['generation_config.json', 'tokenizer_config.json', 'added_tokens.json', 'special_tokens_map.json', 'merges.txt', 'vocab.json']
  },
  'Xenova/whisper-base': {
    required: ['config.json', 'preprocessor_config.json', 'tokenizer.json',
      'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx'],
    optional: ['generation_config.json', 'tokenizer_config.json', 'added_tokens.json', 'special_tokens_map.json', 'merges.txt', 'vocab.json']
  },
  'Xenova/opus-mt-en-id': {
    required: ['config.json', 'tokenizer.json',
      'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx'],
    optional: ['generation_config.json', 'tokenizer_config.json']
  }
};

let _asr = null, _asrKey = '', _mt = null;

function xfLib() {
  if (!window.transformers) throw new Error('Library transformers.js tidak termuat');
  const env = window.transformers.env;
  env.allowLocalModels = true;
  env.useBrowserCache = false;           // cache bawaan browser dimatikan — pakai disk
  env.localModelPath = 'kmodels://';     // dibaca dari AppData via protokol lokal
  env.allowRemoteModels = false;         // 100% offline: semua file sudah diunduh ke disk
  if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
    // runtime WASM onnxruntime juga lokal (folder vendor/ort)
    env.backends.onnx.wasm.wasmPaths = 'app://localhost/vendor/ort/';
  }
  return window.transformers;
}

/* pastikan semua file model ada di disk (unduh yang kurang, sekali saja) */
async function ensureModel(modelId, onInfo) {
  const man = MODEL_FILES[modelId];
  if (!man) throw new Error('Model tidak dikenal: ' + modelId);
  onInfo && onInfo(`Memeriksa model ${modelId.split('/')[1]}…`);
  const r = await window.kinostra.ensureModel(modelId, man);
  if (!r.ok) throw new Error(r.error || 'Gagal mengunduh model');
  return r;
}

async function getASR(model, pc) {
  if (_asr && _asrKey === model) return _asr;
  const lib = xfLib();
  _asr = await lib.pipeline('automatic-speech-recognition', model, { quantized: true, progress_callback: pc });
  _asrKey = model; return _asr;
}
async function getMT(pc) {
  if (_mt) return _mt;
  const lib = xfLib();
  _mt = await lib.pipeline('translation', 'Xenova/opus-mt-en-id', { quantized: true, progress_callback: pc });
  return _mt;
}

async function getMono16k() {
  if (!state.audioBuffer) await decodeFileAudio();
  if (!state.audioBuffer) throw new Error('Audio tidak terbaca');
  const sr = 16000, len = Math.ceil(state.duration * sr);
  const oc = new OfflineAudioContext(1, len, sr);
  const s = oc.createBufferSource(); s.buffer = state.audioBuffer; s.connect(oc.destination); s.start(0);
  return (await oc.startRendering()).getChannelData(0);
}

async function generateSubs() {
  if (!state.file) { toast('Impor media dulu', 'err'); return; }
  if (state.busy) return; state.busy = true;
  try {
    showModal({ title: 'MESIN SUBTITEL NEURAL', sub: 'Menyiapkan model…' });
    setProg(0.02);
    const modelId = $('#asrModel').value === 'base' ? 'Xenova/whisper-base' : 'Xenova/whisper-tiny';
    /* unduh sekali ke disk (AppData) — dengan progres nyata dari main process */
    await ensureModel(modelId, s => setSub(s));
    setSub('Model siap — memuat mesin…');

    const files = {};
    const pc = p => {
      if (p.status === 'progress' && p.total) {
        files[p.file] = { l: p.loaded, t: p.total };
        let L = 0, T = 0; for (const f of Object.values(files)) { L += f.l; T += f.t; }
        if (T) setSub(`Menyiapkan bobot model · ${fmtMB(L)} / ${fmtMB(T)}`);
      }
    };
    const asr = await getASR(modelId, pc);
    setSub('Mengekstrak audio 16 kHz…'); setProg(0.02);
    const pcm = await getMono16k();
    const srcLang = $('#asrLang').value, target = state.subTarget;
    const opts = { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true, task: 'transcribe' };
    let needMT = false;
    if (target === 'id' && srcLang !== 'indonesian') { opts.task = 'translate'; needMT = true; }
    else if (target === 'en' && srcLang !== 'english') { opts.task = 'translate'; }
    else if (srcLang !== 'auto') opts.language = srcLang;
    let done = 0; const totalCh = Math.max(1, Math.ceil(state.duration / 30));
    opts.chunk_callback = () => { done++; setProg(clamp(0.05 + 0.92 * done / totalCh, 0, 0.99));
      setSub(`Whisper berjalan lokal · segmen ${done}/${totalCh}…`); };
    setSub('Menganalisis audio…');
    const out = await asr(pcm, opts);
    let subs = (out.chunks || []).map(c => ({ s: c.timestamp[0] ?? 0, e: c.timestamp[1] ?? state.duration, text: (c.text || '').trim() }))
      .filter(c => c.text);
    if (needMT && subs.length) {
      setSub('Memuat model terjemahan en→id…'); setProg(0);
      await ensureModel('Xenova/opus-mt-en-id', s => setSub(s));
      const mt = await getMT(pc);
      setSub('Menerjemahkan ke Bahasa Indonesia · model opus-mt…');
      for (let i = 0; i < subs.length; i += 6) {
        const batch = subs.slice(i, i + 6).map(s => s.text);
        try {
          const res = await mt(batch);
          res.forEach((r, j) => { if (r && r.translation_text) subs[i + j].text = r.translation_text; });
        } catch (e) { }
        setProg(clamp((i + 6) / subs.length, 0, 1)); await sleep(0);
      }
    }
    state.subs = subs; state.subsOn = subs.length > 0; $('#subsOn').checked = state.subsOn;
    renderSubList();
    $('#subStat').textContent = `${subs.length} baris · siap di-burn-in`;
    toast(`${subs.length} baris subtitel dihasilkan`, 'ok');
  } catch (e) {
    console.error(e);
    toast('Subtitel gagal: ' + (e.message || e), 'err');
  }
  state.busy = false; hideModal();
}

function renderSubList() {
  const el = $('#subList');
  if (!state.subs.length) { el.innerHTML = '<div class="empty">BELUM ADA SUBTITEL</div>'; return; }
  el.innerHTML = '';
  state.subs.forEach((s, i) => {
    const r = document.createElement('div'); r.className = 'srow';
    r.innerHTML = `<button class="stime mono">${fmtT(s.s)}</button><input class="sin" value="">`;
    r.querySelector('.sin').value = s.text;
    const del = document.createElement('button'); del.className = 'sdel'; del.textContent = '×';
    del.onclick = () => { state.subs.splice(i, 1); renderSubList(); $('#subStat').textContent = `${state.subs.length} baris`; };
    r.appendChild(del);
    r.querySelector('.sin').oninput = e => { s.text = e.target.value; };
    r.querySelector('.stime').onclick = () => { videoEl.currentTime = s.s + 0.02; };
    el.appendChild(r);
  });
}

function srtTime(t) {
  const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = Math.floor(t % 60), ms = Math.floor((t % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/* ---------- UPGRADE: geser waktu semua baris ---------- */
function shiftSubs(delta) {
  if (!state.subs.length) { toast('Belum ada subtitel', 'warn'); return; }
  state.subs.forEach(s => { s.s = Math.max(0, s.s + delta); s.e = Math.max(0.1, s.e + delta); });
  renderSubList();
  toast(`Semua baris digeser ${delta > 0 ? '+' : ''}${delta} dtk`, 'ok');
}
