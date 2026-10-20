/* ================================================================
   KINOSTRA DESKTOP — tts.js (v3.0 · NARASI AI / TTS OFFLINE)
   ================================================================
   Suara AI bahasa Indonesia 100% offline:
   - Mesin : VITS (facebook MMS-TTS ind) versi ONNX terkuantisasi (±37 MB)
   - Unduh : sekali saja via downloader desktop (resume otomatis) ke
             folder model KINOSTRA, lalu offline permanen via kmodels://
   - Jalur : teks → tokenizer → VITS ONNX (wasm) → AudioBuffer 16 kHz
   - Pakai : PASANG DI PLAYHEAD → suara ter-mix ke hasil EKSPOR/SPLIT/
             BATCH pada waktu media itu (renderer/exporter.js renderMix)
   Catatan: sintesis berjalan di CPU (wasm) — cocok untuk narasi pendek
   (pembuka, tagline, penutup). BETA.
   ================================================================ */
'use strict';

const TTS_MODEL = 'payam1394/traxlate-mms-tts-ind';
const TTS_FILES = {
  required: ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'vocab.json', 'added_tokens.json', 'onnx/model_quantized.onnx'],
  optional: ['special_tokens_map.json', 'quantize_config.json']
};

let _ttsModel = null, _ttsTok = null, _ttsLoading = null;
let _ttsPreviewSrc = null;

async function ensureTTS(ui) {
  if (_ttsModel && _ttsTok) return;
  if (_ttsLoading) return _ttsLoading;
  _ttsLoading = (async () => {
    const xf = window.transformers;
    if (!xf || !xf.VitsModel) throw new Error('Mesin AI (transformers.js) belum termuat');
    /* 1. unduh model sekali (±37 MB) via downloader desktop */
    if (ui) ui('Mengunduh model suara pertama kali (±37 MB, sekali saja)…');
    const r = await window.kinostra.ensureModel(TTS_MODEL, TTS_FILES);
    if (!r || !r.ok) throw new Error('Unduh model suara gagal: ' + ((r && r.error) || 'tidak diketahui'));
    /* 2. env offline — semua berkas dari disk lokal (kmodels://) */
    try {
      xf.env.allowLocalModels = true;
      xf.env.allowRemoteModels = false;
      xf.env.localModelPath = 'kmodels://';
      if (xf.env.backends && xf.env.backends.onnx && xf.env.backends.onnx.wasm)
        xf.env.backends.onnx.wasm.wasmPaths = (location.protocol === 'app:' ? 'app://localhost/' : location.href.replace(/[^/]*$/, '')) + 'vendor/ort/';
    } catch (e) { }
    /* 3. muat tokenizer + model VITS (wasm, di CPU) */
    if (ui) ui('Memuat mesin suara… (beberapa detik)');
    _ttsTok = await xf.AutoTokenizer.from_pretrained(TTS_MODEL);
    _ttsModel = await xf.VitsModel.from_pretrained(TTS_MODEL, { dtype: 'q8' });
    state.tts.ready = true;
    if (ui) ui('Mesin suara siap — 100% offline');
  })();
  try { await _ttsLoading; } finally { _ttsLoading = null; }
}

/* teks → AudioBuffer suara (deterministik, offline) */
async function ttsSynthesize(text, ui) {
  if (!text || !text.trim()) throw new Error('Teks narasi masih kosong');
  await ensureTTS(ui);
  if (ui) ui('Menyusun suara…');
  const inputs = _ttsTok(text.trim());
  const out = await _ttsModel(inputs);
  const data = out.waveform.data;
  const sr = (_ttsModel.config && _ttsModel.config.sampling_rate) || 16000;
  const ac = getActx();
  const buf = ac.createBuffer(1, data.length, sr);
  buf.copyToChannel(Float32Array.from(data), 0);
  state.tts.buffer = buf;
  state.tts.text = text.trim();
  if (ui) ui(`Suara siap · ${(data.length / sr).toFixed(1)} dtk · teks ${text.trim().length} huruf`);
  return buf;
}

/* putar pratinjau suara yang tersusun */
function ttsPreview() {
  if (!state.tts.buffer) { toast('Susun suara dulu', 'warn'); return; }
  try { if (_ttsPreviewSrc) { try { _ttsPreviewSrc.stop(); } catch (e) { } } } catch (e) { }
  const ac = getActx(); ac.resume();
  const s = ac.createBufferSource(); s.buffer = state.tts.buffer;
  const g = ac.createGain(); g.gain.value = clamp(state.tts.gain, 0, 1.6);
  s.connect(g); g.connect(ac.destination); s.start();
  _ttsPreviewSrc = s;
}

/* pasang suara pada playhead — akan ter-mix saat ekspor/split/batch */
function ttsPlaceAtPlayhead() {
  if (!state.tts.buffer) { toast('Susun suara dulu', 'warn'); return; }
  state.tts.at = videoEl.currentTime || 0;
  toast(`Narasi terpasang di ${fmtT(state.tts.at)} — akan terdengar di video hasil ekspor`, 'ok');
  syncTtsUI();
}

function ttsClear() {
  state.tts.buffer = null; state.tts.at = 0; state.tts.text = '';
  try { if (_ttsPreviewSrc) { try { _ttsPreviewSrc.stop(); } catch (e) { } _ttsPreviewSrc = null; } } catch (e) { }
  syncTtsUI(); toast('Narasi dihapus', 'ok');
}

function syncTtsUI() {
  const st = $('#ttsStat');
  if (st) st.innerHTML = state.tts.ready
    ? (state.tts.buffer
      ? `Suara siap · ${state.tts.buffer.duration.toFixed(1)} dtk · terpasang di <b>${fmtT(state.tts.at)}</b>`
      : 'Mesin suara siap (offline) · susun suara dari teksmu')
    : 'Mesin suara belum termuat — model ±37 MB diunduh sekali saat pertama dipakai';
  const b = $('#btnTtsPlace');
  if (b) b.disabled = !state.tts.buffer;
  const bc = $('#btnTtsClear');
  if (bc) bc.disabled = !state.tts.buffer;
  const bp = $('#btnTtsPreview');
  if (bp) bp.disabled = !state.tts.buffer;
}
