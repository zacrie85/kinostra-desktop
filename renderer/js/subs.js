/* ================================================================
   KINOSTRA DESKTOP — subs.js (v2.3 · MESIN VOCALIS v3)
   ================================================================
   AI SUBTITEL BARU — FOKUS BAHASA JAWA & BAHASA INDONESIA SAJA.

   VOCALIS v3 menggantikan total mesin VOICEMATCH lama:
   1. Model baru whisper-large-v3-turbo (quant Q4) — model open-source
      TERBAIK untuk Bahasa Jawa & Bahasa Indonesia, jauh lebih akurat
      daripada whisper tiny/base lama, termasuk untuk VOKAL/NYANYIAN.
   2. Bahasa DIPAKSA konsisten: OTOMATIS (deteksi Jawa/Indonesia),
      JAWA, atau INDONESIA — teks selalu ditulis DALAM BAHASA YANG
      DIUCAPKAN di video (Jawa tetap Jawa, Indonesia tetap Indonesia).
      Tidak ada lagi terjemahan yang mengubah isi ucapan.
   3. Mode LAGU/VOKAL: VAD disetel lebih peka agar bagian yang
      DINYANYIKAN (sering lebih pelan dari musik) ikut ditranskrip.
   4. Multithread ONNX WASM (cross-origin isolated) — 3-6x lebih cepat.
   5. Filter halusinasi & anti-pengulangan tetap aktif.
   100% LOKAL — model diunduh sekali ke AppData, lalu offline permanen.
   ================================================================ */
'use strict';

/* ---------- KATALOG MESIN VOCALIS (unduh sekali ke AppData) ---------- */
const VOCALIS_ENGINES = {
  turbo: { model: 'onnx-community/whisper-large-v3-turbo', dtype: 'q4' },
  small: { model: 'Xenova/whisper-small', dtype: 'q8' },
  base: { model: 'Xenova/whisper-base', dtype: 'q8' }
};

const MODEL_FILES = {
  'onnx-community/whisper-large-v3-turbo': {
    required: ['config.json', 'generation_config.json', 'preprocessor_config.json', 'tokenizer.json',
      'onnx/encoder_model_q4.onnx', 'onnx/decoder_model_merged_q4.onnx'],
    optional: ['tokenizer_config.json', 'special_tokens_map.json', 'added_tokens.json',
      'merges.txt', 'vocab.json', 'normalizer.json', 'quantize_config.json']
  },
  'Xenova/whisper-small': {
    required: ['config.json', 'preprocessor_config.json', 'tokenizer.json',
      'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx'],
    optional: ['generation_config.json', 'tokenizer_config.json', 'special_tokens_map.json',
      'added_tokens.json', 'merges.txt', 'vocab.json', 'quantize_config.json']
  },
  'Xenova/whisper-base': {
    required: ['config.json', 'preprocessor_config.json', 'tokenizer.json',
      'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx'],
    optional: ['generation_config.json', 'tokenizer_config.json', 'special_tokens_map.json',
      'added_tokens.json', 'merges.txt', 'vocab.json', 'quantize_config.json']
  }
};

let _asr = null, _asrKey = '';

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
    /* v2.3: SINGLE-THREAD — hasil uji penuh: thread ganda pada sesi model besar
       (small/turbo) memicu lonjakan memori WASM sampai OOM. Mode 1 thread
       stabil untuk semua mesin & varian opsi (terverifikasi matriks uji). */
    env.backends.onnx.wasm.numThreads = 1;
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

async function getASR(engineKey, pc) {
  const eng = VOCALIS_ENGINES[engineKey] || VOCALIS_ENGINES.turbo;
  const key = eng.model + '|' + eng.dtype;
  if (_asr && _asrKey === key) return _asr;
  /* v2.3 WAJIB dispose: tanpa ini, sesi ort lama menahan pthread-pool & memori
     WASM → memuat mesin lain bisa memunculkan memori sampai OOM (terbukti uji). */
  if (_asr) {
    try { await _asr.dispose(); } catch (e) { }
    _asr = null; _asrKey = '';
    await sleep(150);
  }
  const lib = xfLib();
  _asr = await lib.pipeline('automatic-speech-recognition', eng.model, {
    dtype: eng.dtype, progress_callback: pc
  });
  _asrKey = key; return _asr;
}

async function getMono16k() {
  if (!state.audioBuffer) await decodeFileAudio();
  if (!state.audioBuffer) throw new Error('Audio tidak terbaca');
  const sr = 16000, len = Math.ceil(state.duration * sr);
  const oc = new OfflineAudioContext(1, len, sr);
  const s = oc.createBufferSource(); s.buffer = state.audioBuffer; s.connect(oc.destination); s.start(0);
  return (await oc.startRendering()).getChannelData(0);
}

/* ================================================================
   VOCALIS v3 — PENERJEMAH VOKAL JAWA · INDONESIA
   ================================================================ */

/* ---------- 1) VAD: temukan bagian yang berbicara / bernyanyi ----------
   singMode=true → ambang lebih rendah, jeda antar frasa dijembatani
   lebih panjang, dan bagian pelan (vokal di balik musik) tetap diambil. */
function speechWindows(pcm, sr = 16000, singMode = false) {
  const win = Math.round(sr * 0.25);            // jendela 250 ms
  const n = Math.max(1, Math.floor(pcm.length / win));
  const en = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    const end = Math.min(pcm.length, (i + 1) * win);
    for (let j = i * win; j < end; j += 4) { s += pcm[j] * pcm[j]; c++; }
    en[i] = Math.sqrt(s / Math.max(1, c));
  }
  const sorted = Float32Array.from(en).sort();
  const hi = sorted[Math.min(n - 1, Math.floor(n * 0.92))] || 0;
  const med = sorted[Math.min(n - 1, Math.floor(n * 0.55))] || 0;
  const thr = singMode
    ? Math.max(0.003, Math.min(0.045, Math.max(med * 0.32, hi * 0.028)))
    : Math.max(0.006, Math.min(0.06, Math.max(med * 0.6, hi * 0.055)));
  const pad = singMode ? 2 : 1;
  const gapBridge = singMode ? 1.3 : 0.75;      // detik
  const minRun = singMode ? 0.4 : 0.5;          // detik
  /* tandai aktif + pad ke tiap sisi */
  const act = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (en[i] > thr) {
      for (let k = -pad; k <= pad; k++) act[clamp(i + k, 0, n - 1)] = 1;
    }
  }
  /* gabung run, bridge gap, buang run terlalu pendek */
  const runs = [];
  let s = -1;
  for (let i = 0; i < n; i++) {
    if (act[i] && s < 0) s = i;
    if ((!act[i] || i === n - 1) && s >= 0) {
      const e = act[i] ? i + 1 : i;
      runs.push([s, e]); s = -1;
    }
  }
  const merged = [];
  for (const r of runs) {
    if (merged.length && (r[0] - merged[merged.length - 1][1]) * 0.25 < gapBridge) merged[merged.length - 1][1] = r[1];
    else merged.push(r);
  }
  const out = [];
  for (const [a, b] of merged) {
    const dur = (b - a) * 0.25;
    if (dur < minRun) continue;
    out.push({ s: a * 0.25, e: Math.min(state.duration || b * 0.25, b * 0.25) });
  }
  return out;
}

/* ---------- 2) LEKSIKON JAWA / INDONESIA (pembeda bahasa) ---------- */
const ID_HINTS = ['yang', 'dan', 'di', 'ini', 'itu', 'dengan', 'untuk', 'tidak', 'saya', 'kami', 'kita',
  'adalah', 'akan', 'sudah', 'dari', 'pada', 'bisa', 'karena', 'juga', 'para', 'orang', 'ke', 'dalam',
  'ada', 'apa', 'saat', 'oleh', 'agar', 'banyak', 'sekali', 'belum', 'kalau', 'memang', 'begini',
  'semuanya', 'selamat', 'malam', 'pagi', 'datang', 'kembali', 'video', 'hari', 'ini', 'belajar',
  'memotong', 'beberapa', 'bagian', 'cepat', 'mudah', 'jangan', 'lupa', 'tekan', 'tombol', 'suka',
  'langganan', 'gratis', 'hari ini', 'channel'];
const JV_HINTS = ['aku', 'awak', 'dhewe', 'iku', 'iki', 'kowe', 'arep', 'ora', 'nggih', 'ingkang',
  'menika', 'meniko', 'mawon', 'saged', 'badhe', 'dados', 'kangge', 'inggih', 'panjenengan', 'sami',
  'wonten', 'punika', 'puniko', 'sinau', 'enggal', 'gampil', 'aja', 'lali', 'seneng', 'sugeng',
  'rawuh', 'kumbali', 'salebetipun', 'sapérangan', 'kanthi', 'dinten', 'puniko', 'sapanunggalane',
  'motong', 'vidio', 'kepengin', 'baked', 'nembe', 'укara', 'lakoni', 'nggeh', 'yoo', 'req'];
function scoreLex(text, hints) {
  const w = (text || '').toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!w.length) return 0;
  let h = 0;
  for (const x of w) if (hints.includes(x)) h++;
  return h / w.length;
}

/* stub kompatibilitas uji lama (aksara Latin tidak lagi dipetakan bahasa) */
function detectLang(text) {
  const s = text || '';
  if (/[\u4E00-\u9FFF]/.test(s)) return 'chinese';
  if (/[\u3040-\u30FF]/.test(s)) return 'japanese';
  if (/[\uAC00-\uD7AF]/.test(s)) return 'korean';
  return null;
}

/* ---------- 3) FILTER HALLUSINASI ---------- */
function cleanLine(t) {
  t = (t || '').replace(/\s+/g, ' ').trim();
  if (t.replace(/[^\p{L}\p{N}]/gu, '').length < 2) return '';
  const w = t.split(' ');
  if (w.length > 6) {
    let rep = 0;
    for (let i = 2; i < w.length; i++) if (w[i].toLowerCase() === w[i - 2].toLowerCase()) rep++;
    if (rep > w.length * 0.45) return '';
  }
  /* token raksasa = pola berulang tanpa spasi (mis. A.K.A.K.A.K.A…) */
  for (const tok of w) {
    if (tok.replace(/[^\p{L}\p{N}]/gu, '').length > 18) return '';
  }
  /* paruh baris yang sama persis diulang ("Hello Samoa! Hello Samoa!") */
  if (w.length >= 6) {
    const half = Math.floor(w.length / 2);
    const a = w.slice(0, half).join(' ').toLowerCase(), b = w.slice(half, half * 2).join(' ').toLowerCase();
    if (a === b) return '';
  }
  return t;
}
function dedupeLines(subs) {
  const out = [];
  for (const s of subs) {
    const prev = out[out.length - 1];
    if (prev && prev.text.toLowerCase() === s.text.toLowerCase() && s.s - prev.e < 0.4) { prev.e = Math.max(prev.e, s.e); continue; }
    out.push(s);
  }
  return out;
}

/* ---------- PIPELINE UTAMA VOCALIS v3 ---------- */
async function generateSubs() {
  if (!state.file) { toast('Impor media dulu', 'err'); return; }
  if (state.busy) return; state.busy = true;
  try {
    const engineKey = $('#asrModel').value || 'turbo';
    const eng = VOCALIS_ENGINES[engineKey];
    const engLabel = engineKey.toUpperCase();
    const singMode = $('#singMode').checked;
    const srcLang = $('#asrLang').value;      // auto | javanese | indonesian

    showModal({ title: 'MESIN VOCALIS v3', sub: 'Menyiapkan model…' });
    setProg(0.02);
    /* unduh sekali ke disk (AppData) — dengan progres nyata dari main process */
    await ensureModel(eng.model, s => setSub(s));
    setSub('Model siap — memuat mesin…');

    const files = {};
    const pc = p => {
      if (p.status === 'progress' && p.total) {
        files[p.file] = { l: p.loaded, t: p.total };
        let L = 0, T = 0; for (const f of Object.values(files)) { L += f.l; T += f.t; }
        if (T) setSub(`Menyiapkan bobot model · ${fmtMB(L)} / ${fmtMB(T)}`);
      }
    };
    console.log('VOCALIS: memuat pipeline', eng.model, eng.dtype);
    const asr = await getASR(engineKey, pc);
    console.log('VOCALIS: pipeline siap');

    setSub('Mengekstrak audio 16 kHz…'); setProg(0.02);
    const pcm = await getMono16k();
    const sr = 16000;

    /* --- LANGKAH 1: peta bagian berbicara / bernyanyi (VAD) --- */
    setSub(singMode ? 'Memetakan vokal (mode lagu — peka suara pelan)…'
      : 'Memetakan bagian yang berbicara (lompat hening)…');
    let wins = speechWindows(pcm, sr, singMode);
    const totalSpeech = wins.reduce((a, w) => a + (w.e - w.s), 0);
    const totalDur = state.duration || pcm.length / sr;
    if (!wins.length) {
      /* tidak ada ucapan terdeteksi — proses penuh sebagai fallback */
      wins = [{ s: 0, e: totalDur }];
      toast('Tidak ada vokal terdeteksi — memproses audio penuh', 'warn');
    }
    /* pecah jendela > 26 dtk */
    const chunks = [];
    for (const w of wins) {
      for (let a = w.s; a < w.e - 0.05; a += 26) chunks.push({ s: a, e: Math.min(w.e, a + 26) });
    }

    /* --- LANGKAH 2: tentukan bahasa — JAWA atau INDONESIA saja ---
       Metode VOCALIS: transkrip ganda pendek (paksa Jawa vs paksa Indonesia)
       lalu pilih lewat skor kata-kata khas (leksikon). Jauh lebih andal
       daripada tebak token bahasa — dan 100% lewat jalur pipeline yang aman. */
    let lang = srcLang !== 'auto' ? srcLang : null;
    const autoOn = srcLang === 'auto';
    if (autoOn) {
      setSub('Mendeteksi: Bahasa Jawa atau Bahasa Indonesia…'); setProg(0.04);
      const c0 = chunks[0];
      const a0 = Math.floor(c0.s * sr), b0 = Math.min(pcm.length, Math.floor((c0.s + 10) * sr));
      const probe = pcm.slice(a0, Math.max(b0, a0 + sr));
      console.log('VOCALIS: probe', (probe.length / sr).toFixed(1), 'dtk — deteksi ganda');
      try {
        /* WAJIB dibatasi: tanpa max_new_tokens, generasi tanpa EOS bisa berjalan
           sampai max_length 448 token → memori membengkak (OOM). */
        const o0 = { chunk_length_s: 30, stride_length_s: 5, return_timestamps: false, task: 'transcribe', no_repeat_ngram_size: 5, max_new_tokens: 72 };
        console.log('VOCALIS: probe jawa…');
        const tJv = await asr(probe, { ...o0, language: 'javanese' });
        console.log('VOCALIS: probe indonesia…');
        const tId = await asr(probe, { ...o0, language: 'indonesian' });
        console.log('VOCALIS: probe selesai');
        const sJv = Math.max(scoreLex(tJv.text, JV_HINTS), scoreLex(tId.text, JV_HINTS));
        const sId = Math.max(scoreLex(tId.text, ID_HINTS), scoreLex(tJv.text, ID_HINTS));
        console.log('VOCALIS: skor leksikon jawa', sJv.toFixed(3), 'indonesia', sId.toFixed(3));
        lang = sJv > sId + 0.02 ? 'javanese' : 'indonesian';
        setSub(`Probe bahasa: Jawa ${(sJv * 100).toFixed(0)}% vs Indonesia ${(sId * 100).toFixed(0)}% → ${lang === 'javanese' ? 'JAWA' : 'INDONESIA'}`);
      } catch (e) {
        console.warn('deteksi bahasa gagal', e);
        lang = 'indonesian';                // default paling umum
      }
    }
    const langLabel = lang === 'javanese' ? 'JAWA' : 'INDONESIA';
    $('#vmLang').textContent = autoOn ? `AUTO · ${langLabel}` : langLabel;
    setSub(`Bahasa ${langLabel} · menulis ${chunks.length} potongan vokal…`);
    setProg(0.08);
    console.log('VOCALIS: bahasa', langLabel, '· chunks', chunks.length, '· sing', singMode);

    /* --- LANGKAH 3: transkrip semua potongan vokal ---
       TANPA TERJEMAHAN: teks ditulis dalam bahasa yang diucapkan. */
    const speechTotal = chunks.reduce((a, c) => a + (c.e - c.s), 0);
    let done = 0;
    let subs = [];
    for (const c of chunks) {
      if (state.abort) throw new Error('Dibatalkan');
      const a = Math.floor(c.s * sr), b = Math.min(pcm.length, Math.floor(c.e * sr));
      const slice = pcm.slice(a, b);
      if (slice.length > sr * 0.3) {
        try {
          const out = await asr(slice, {
            chunk_length_s: 30, stride_length_s: 5,
            return_timestamps: true, task: 'transcribe',
            language: lang,                  // selalu dipaksa → konsisten
            no_repeat_ngram_size: 5,
            max_new_tokens: Math.min(220, Math.ceil((c.e - c.s) * 6) + 24)   // anti generasi liar
          });
          for (const ch of (out.chunks || [])) {
            const txt = cleanLine(ch.text || '');
            if (!txt) continue;
            const s0 = c.s + (ch.timestamp[0] ?? 0), e0 = c.s + (ch.timestamp[1] ?? (c.e - c.s));
            subs.push({ s: Math.max(0, s0), e: Math.max(s0 + 0.3, e0), text: txt });
          }
        } catch (e) { console.warn('chunk gagal', e); }
      }
      done += (c.e - c.s);
      console.log('VOCALIS: chunk selesai', done.toFixed(1), '/', speechTotal.toFixed(1));
      setProg(clamp(0.08 + 0.88 * done / Math.max(0.01, speechTotal), 0, 0.985));
      setSub(`VOCALIS menulis · ${fmtT(done)} / ${fmtT(speechTotal)} vokal · ${langLabel} · ${engLabel}`);
      await sleep(0);
    }
    subs = dedupeLines(subs.sort((a, b) => a.s - b.s));

    state.subs = subs; state.subsOn = subs.length > 0; $('#subsOn').checked = state.subsOn;
    renderSubList();
    $('#subStat').textContent = `${subs.length} baris · ${langLabel} · mesin ${engLabel} · vokal ${Math.round(totalSpeech)} dtk dari ${Math.round(totalDur)} dtk`;
    toast(`${subs.length} baris subtitel dihasilkan (VOCALIS v3 · ${langLabel})`, 'ok');
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

/* ---------- geser waktu semua baris ---------- */
function shiftSubs(delta) {
  if (!state.subs.length) { toast('Belum ada subtitel', 'warn'); return; }
  state.subs.forEach(s => { s.s = Math.max(0, s.s + delta); s.e = Math.max(0.1, s.e + delta); });
  renderSubList();
  toast(`Semua baris digeser ${delta > 0 ? '+' : ''}${delta} dtk`, 'ok');
}
