/* ================================================================
   KINOSTRA DESKTOP — subs.js (v2.2 · MESIN VOICEMATCH v2)
   Subtitel AI 100% lokal (Whisper via Transformers.js)
   UPGRADE v2.2 — teks mengikuti bahasa yang diucapkan di video:
   1. VAD-lite: peta energi audio → hanya bagian BERBICARA diproses
      (bagian hening/musik dilewati → jauh lebih cepat & tanpa halusinasi)
   2. Probe bahasa: cuplikan ucapan pertama dianalisis → bahasa
      terdeteksi (aksara non-Latin via unicode, Latin via skor kata
      tugas) → dipaksa konsisten untuk seluruh video
   3. Filter hallucination: baris isian / pengulangan dibuang
   4. Target terjemahan ASLI / INDONESIA / INGGRIS tetap didukung
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

/* ================================================================
   VOICEMATCH v2 — PENERJEMAH SUARA LOKAL
   ================================================================ */

/* ---------- 1) VAD-LITE: temukan bagian yang berbicara ---------- */
function speechWindows(pcm, sr = 16000) {
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
  const thr = Math.max(0.006, Math.min(0.06, Math.max(med * 0.6, hi * 0.055)));
  /* tandai aktif + pad 1 jendela ke tiap sisi */
  const act = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (en[i] > thr) { act[Math.max(0, i - 1)] = 1; act[i] = 1; act[Math.min(n - 1, i + 1)] = 1; }
  /* gabung run, bridge gap < 0.75 dtk, buang run < 0.5 dtk */
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
    if (merged.length && (r[0] - merged[merged.length - 1][1]) * 0.25 < 0.75) merged[merged.length - 1][1] = r[1];
    else merged.push(r);
  }
  const out = [];
  for (const [a, b] of merged) {
    const dur = (b - a) * 0.25;
    if (dur < 0.5) continue;
    out.push({ s: a * 0.25, e: Math.min(state.duration || b * 0.25, b * 0.25) });
  }
  return out;
}

/* ---------- 2) DETEKSI BAHASA DARI TEKS HASIL PROBE ---------- */
const VM_LANG_NAME = {
  indonesian: 'INDONESIA', english: 'INGGRIS', chinese: 'MANDARIN', japanese: 'JEPANG',
  korean: 'KOREA', russian: 'RUSIA', arabic: 'ARAB', hindi: 'HINDI', spanish: 'SPANYOL',
  french: 'PRANCIS', german: 'JERMAN', thai: 'THAI', vietnamese: 'VIETNAM',
  portuguese: 'PORTUGIS', italian: 'ITALIA', dutch: 'BELANDA', turkish: 'TURKI',
  polish: 'POLANDIA', swedish: 'SWEDIA', norwegian: 'NORWEGIA', danish: 'DANIA',
  finnish: 'FINLANDIA', greek: 'YUNANI', hebrew: 'IBRANI', ukrainian: 'UKRAINA',
  czech: 'CESKO', romanian: 'ROMANIA', hungarian: 'HUNGARIA', malay: 'MELAYU',
  persian: 'PERSIA', bengali: 'BENGALI', tamil: 'TAMIL', urdu: 'URDU', croatian: 'KROASIA',
  slovak: 'SLOVAKIA', tagalog: 'FILIPINA'
};
/* kode bahasa whisper → nama untuk pipeline */
const VM_CODE2NAME = {
  en: 'english', zh: 'chinese', de: 'german', es: 'spanish', ru: 'russian', ko: 'korean',
  fr: 'french', ja: 'japanese', pt: 'portuguese', tr: 'turkish', nl: 'dutch', ar: 'arabic',
  sv: 'swedish', it: 'italian', id: 'indonesian', hi: 'hindi', fi: 'finnish', vi: 'vietnamese',
  he: 'hebrew', uk: 'ukrainian', el: 'greek', ms: 'malay', cs: 'czech', ro: 'romanian',
  da: 'danish', hu: 'hungarian', ta: 'tamil', no: 'norwegian', th: 'thai', ur: 'urdu',
  hr: 'croatian', bn: 'bengali', sk: 'slovak', sq: 'albanian', fa: 'persian', tl: 'tagalog',
  lt: 'lithuanian', lv: 'latvian', et: 'estonian', sl: 'slovenian', mk: 'macedonian',
  bg: 'bulgarian', pl: 'polish', is: 'icelandic', ne: 'nepali', mr: 'marathi', ml: 'malayalam',
  si: 'sinhala', my: 'burmese', km: 'khmer', lo: 'lao', ka: 'georgian', hy: 'armenian',
  az: 'azerbaijani', kk: 'kazakh', sw: 'swahili', af: 'afrikaans', mn: 'mongolian'
};

/* ---------- DETEKSI BAHASA KANONIK (metode HF detect_language) ----------
   Satu forward pass 30 dtk: distribusi token pertama setelah <|SOT|>
   menumpuk di token bahasa yang benar → ambil argmax. Jauh lebih akurat
   daripada menebak dari teks hasil generasi. */
function whisperLangIdMap(tok) {
  try {
    const vocab = (tok && tok.model && tok.model.vocab) || {};
    const map = {};
    for (const [t, id] of Object.entries(vocab)) {
      const m = /^<\|([a-z]{2})\|>$/.exec(t);
      if (m && Number.isInteger(id)) map[m[1]] = id;
    }
    return map;
  } catch (e) { return {}; }
}
async function whisperDetectLang(asr, pcm) {
  const inputs = await asr.processor(pcm);           // pad/trim otomatis ke 30 dtk
  /* prompt SOT saja + 1 token → token pertama hasil greedy = token BAHASA
     (pola terlatih whisper: SOT → <|xx|>) */
  const out = await asr.model.generate(inputs.input_features, { max_new_tokens: 1 });
  const seq = (out && typeof out.tolist === 'function' ? out.tolist() : (Array.isArray(out) ? out : out.sequences))[0];
  const map = whisperLangIdMap(asr.tokenizer);
  /* token terakhir seq adalah token yang digenerate */
  const last = seq[seq.length - 1];
  for (const [code, id] of Object.entries(map)) if (id === last) return { code, id: last, seqLen: seq.length };
  /* fallback: cari token bahasa apa pun di dalam seq */
  for (const [code, id] of Object.entries(map)) if (seq.includes(id)) return { code, id, seqLen: seq.length };
  return { code: null, id: last, seqLen: seq.length };
}
const VM_HINTS = {
  indonesian: ['yang', 'dan', 'di', 'ini', 'itu', 'dengan', 'untuk', 'tidak', 'saya', 'kami', 'kita', 'adalah', 'akan', 'sudah', 'dari', 'pada', 'bisa', 'karena', 'juga', 'para', 'orang', 'ke', 'dalam', 'ada', 'apa', 'saat', 'oleh', 'agar', 'banyak', 'sekali', 'belum', 'kalau', 'sudah', 'memang', 'begini', 'begitu'],
  english: ['the', 'and', 'is', 'you', 'to', 'of', 'it', 'this', 'that', 'with', 'for', 'on', 'are', 'be', 'have', 'has', 'was', 'were', 'they', 'we', 'what', 'when', 'will', 'can', 'from', 'not', 'in', 'about', 'just', 'like', 'your', 'going', 'know', 'think'],
  spanish: ['el', 'la', 'los', 'las', 'de', 'que', 'y', 'en', 'un', 'una', 'es', 'por', 'con', 'para', 'como', 'pero', 'se', 'muy', 'esto', 'esta'],
  french: ['le', 'la', 'les', 'de', 'et', 'que', 'un', 'une', 'est', 'pour', 'dans', 'avec', 'sur', 'pas', 'plus', 'ce', 'cette', 'je', 'nous', 'vous'],
  german: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'mit', 'für', 'auf', 'den', 'dem', 'auch', 'sich', 'wird', 'werden', 'aber', 'ich', 'wir'],
  portuguese: ['os', 'as', 'de', 'que', 'em', 'um', 'uma', 'para', 'com', 'não', 'mais', 'isso', 'está', 'porque', 'como', 'mas', 'você', 'então', 'muito', 'aqui'],
  italian: ['il', 'la', 'di', 'che', 'un', 'una', 'per', 'con', 'non', 'sono', 'questo', 'come', 'ma', 'più', 'nel', 'della', 'anche', 'però', 'siamo', 'quello'],
  dutch: ['de', 'het', 'een', 'en', 'van', 'is', 'niet', 'dat', 'deze', 'met', 'voor', 'zijn', 'ook', 'maar', 'worden', 'heeft', 'naar', 'wat', 'om', 'dan'],
  turkish: ['bir', 've', 'bu', 'için', 'ile', 'değil', 'çok', 'ama', 'var', 'olarak', 'gibi', 'daha', 'kadar', 'sonra', 'ben', 'sen', 'ne', 'ama', 'şey'],
  vietnamese: ['của', 'và', 'là', 'không', 'có', 'được', 'người', 'cho', 'trong', 'với', 'trên', 'một', 'những', 'các', 'này', 'đó', 'khi', 'từ', 'theo', 'sẽ']
};
function detectLang(text) {
  const s = text || '';
  if (/[\u4E00-\u9FFF]/.test(s)) return 'chinese';
  if (/[\u3040-\u30FF]/.test(s)) return 'japanese';
  if (/[\uAC00-\uD7AF]/.test(s)) return 'korean';
  if (/[\u0400-\u04FF]/.test(s)) return 'russian';
  if (/[\u0600-\u06FF]/.test(s)) return 'arabic';
  if (/[\u0900-\u097F]/.test(s)) return 'hindi';
  if (/[\u0E00-\u0E7F]/.test(s)) return 'thai';
  return null;   /* aksara Latin → butuh skor kata (scoreLang) */
}
/* skor kecocokan kata-tugas per bahasa (untuk aksara Latin) */
function scoreLang(text) {
  const words = (text || '').toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (words.length < 3) return { lang: null, score: 0 };
  let best = null, bestS = 0;
  for (const [lang, hints] of Object.entries(VM_HINTS)) {
    let sc = 0;
    for (const w of words) if (hints.includes(w)) sc++;
    const frac = sc / words.length;
    if (frac > bestS) { bestS = frac; best = lang; }
  }
  return { lang: best, score: bestS };
}

/* ---------- 3) FILTER HALLUCINATION ---------- */
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

/* ---------- PIPELINE UTAMA ---------- */
async function generateSubs() {
  if (!state.file) { toast('Impor media dulu', 'err'); return; }
  if (state.busy) return; state.busy = true;
  try {
    showModal({ title: 'MESIN VOICEMATCH v2', sub: 'Menyiapkan model…' });
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
    const sr = 16000;
    const target = state.subTarget;
    const srcLang = $('#asrLang').value;

    /* --- LANGKAH 1: peta bagian berbicara (VAD-lite) --- */
    setSub('Memetakan bagian yang berbicara (lompat hening)…');
    let wins = speechWindows(pcm, sr);
    const totalSpeech = wins.reduce((a, w) => a + (w.e - w.s), 0);
    const totalDur = state.duration || pcm.length / sr;
    if (!wins.length) {
      /* tidak ada ucapan terdeteksi — proses penuh sebagai fallback */
      wins = [{ s: 0, e: totalDur }];
      toast('Tidak ada ucapan terdeteksi — memproses audio penuh', 'warn');
    }
    /* pecah jendela > 26 dtk */
    const chunks = [];
    for (const w of wins) {
      for (let a = w.s; a < w.e - 0.05; a += 26) chunks.push({ s: a, e: Math.min(w.e, a + 26) });
    }

    /* --- LANGKAH 2: probe bahasa dari cuplikan pertama ---
       v2.2.1: aksara non-Latin dari probe bebas; aksara Latin diputuskan
       dengan PROBE PAKSA multi-kandidat — bahasa yang transkripnya
       paling kaya kata-tugas (koheren) adalah bahasa yang diucapkan. */
    let lang = srcLang !== 'auto' ? srcLang : null;
    const autoOn = srcLang === 'auto';
    if (autoOn) {
      setSub('Mendeteksi bahasa yang diucapkan…'); setProg(0.04);
      let probeDur = 0, probeParts = [];
      for (const c of chunks) {
        if (probeDur >= 15) break;
        const a = Math.floor(c.s * sr), b = Math.min(pcm.length, Math.floor(c.e * sr));
        probeParts.push(pcm.slice(a, b)); probeDur += (b - a) / sr;
      }
      if (probeParts.length) {
        let probe = probeParts[0];
        for (let i = 1; i < probeParts.length && probe.length / sr < 15; i++) {
          const cat = new Float32Array(probe.length + probeParts[i].length);
          cat.set(probe); cat.set(probeParts[i], probe.length); probe = cat;
        }
        try {
          /* v2.2.2: DETEKSI KANONIK — argmax token bahasa (1 forward pass).
             Cadangan: skor kata-tugas dari probe bebas. */
          try {
            const det = await whisperDetectLang(asr, probe);
            if (det.code && VM_CODE2NAME[det.code]) {
              lang = VM_CODE2NAME[det.code];
              setSub(`Probe bahasa: ${det.code} (margin ${det.margin.toFixed(1)})`);
            }
          } catch (e) { console.warn('deteksi kanonik gagal', e); }
          if (!lang) {
            const out0 = await asr(probe, { task: 'transcribe', chunk_length_s: 30, stride_length_s: 5, return_timestamps: false });
            const txt0 = out0.text || '';
            lang = detectLang(txt0);
            if (!lang) {
              const sc = scoreLang(txt0);
              lang = sc.score >= 0.12 ? sc.lang : null;
            }
          }
        } catch (e) { lang = null; }
      }
    }
    const langLabel = lang ? (VM_LANG_NAME[lang] || lang.toUpperCase()) : 'AUTO';
    $('#vmLang').textContent = autoOn ? `AUTO · ${langLabel}` : langLabel;
    setSub(`Bahasa terdeteksi: ${langLabel} · menulis ${chunks.length} potongan ucapan…`);
    setProg(0.08);

    /* --- LANGKAH 3: transkrip semua potongan ucapan --- */
    let task = 'transcribe', needMT = false;
    const effLang = lang || undefined;
    if (target === 'en' && effLang && effLang !== 'english') task = 'translate';
    else if (target === 'id' && effLang && effLang !== 'indonesian') { task = 'translate'; needMT = true; }

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
            return_timestamps: true, task, no_repeat_ngram_size: 6,
            ...(effLang ? { language: effLang } : {})
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
      setProg(clamp(0.08 + 0.88 * done / Math.max(0.01, speechTotal), 0, 0.985));
      setSub(`VOICEMATCH menulis · ${fmtT(done)} / ${fmtT(speechTotal)} ucapan · bahasa ${langLabel}`);
      await sleep(0);
    }
    subs = dedupeLines(subs.sort((a, b) => a.s - b.s));

    /* --- LANGKAH 4: terjemahan tambahan (en→id) bila diminta --- */
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
    $('#subStat').textContent = `${subs.length} baris · bahasa ${langLabel} · ucapan ${Math.round(totalSpeech)} dtk dari ${Math.round(totalDur)} dtk`;
    toast(`${subs.length} baris subtitel dihasilkan (VOICEMATCH v2 · ${langLabel})`, 'ok');
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
