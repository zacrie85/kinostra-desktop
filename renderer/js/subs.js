/* ================================================================
   KINOSTRA DESKTOP — subs.js (v2.4 · MESIN VOCALIS v4 NATIVE)
   ================================================================
   AI SUBTITEL BARU — FOKUS BAHASA JAWA & BAHASA INDONESIA SAJA.

   VOCALIS v4 menggantikan TOTAL mesin v3 (transformers.js WASM)
   yang sering gagal (kehabisan memori renderer / unduhan putus).
   Sekarang memakai mesin native whisper.cpp sebagai proses
   terpisah di luar browser:
   1. TANPA BATAS MEMORI BROWSER — proses native, stabil di semua
      mesin (4GB pun aman). Tidak ada lagi WebGPU/WASM crash.
   2. UNDUHAN DENGAN RESUME — model ggml (31/181/547 MB) lanjut
      dari posisi terakhir bila koneksi terputus. Tidak mulai
      dari nol lagi → tidak ada lagi "gagal terus".
   3. BINARI DIBUNDEL — whisper-cli + DLL di dalam aplikasi,
      tanpa unduhan runtime tambahan.
   4. BAHASA JAWA & INDONESIA SAJA: probe ganda pendek (paksa Jawa
      vs paksa Indonesia) + skor leksikon kata khas — deteksi
      bawaan whisper terbukti keliru untuk pasangan jw/id.
   5. Teks selalu DALAM BAHASA YANG DIUCAPKAN/DINYANYIKAN — tanpa
      terjemahan. Jawa tetap Jawa, Indonesia tetap Indonesia.
   6. MODE LAGU/VOKAL: ambang no-speech diturunkan agar vokal di
      balik musik tetap ditranskrip.
   7. FILTER HALLUSINASI: baris non-Latin (aksara asing) dibuang,
      anti-pengulangan, dedupe.
   100% LOKAL — model diunduh sekali ke AppData, lalu offline permanen.
   ================================================================ */
'use strict';

/* ---------- KATALOG MESIN VOCALIS v4 (ggml, unduh sekali) ---------- */
const VOCALIS_ENGINES = {
  turbo: { engine: 'turbo', label: 'TURBO', sizeMB: 547 },
  small: { engine: 'small', label: 'SEDANG', sizeMB: 181 },
  tiny: { engine: 'tiny', label: 'RINGAN', sizeMB: 32 }
};

let _whisperTmpDir = null;
let _whisperBusy = false;

async function whisperTmpDir() {
  if (_whisperTmpDir) return _whisperTmpDir;
  const st = await window.kinostra.whisperStatus();
  if (!st.binOk) throw new Error('Binari mesin subtitel tidak ditemukan di folder aplikasi');
  _whisperTmpDir = st.tmpDir;
  return _whisperTmpDir;
}

/* ---------- EKSTRAK AUDIO 16 kHz MONO ---------- */
async function getMono16k() {
  if (!state.audioBuffer) await decodeFileAudio();
  if (!state.audioBuffer) throw new Error('Audio tidak terbaca');
  const sr = 16000, len = Math.ceil((state.duration || state.audioBuffer.duration) * sr);
  const oc = new OfflineAudioContext(1, len, sr);
  const s = oc.createBufferSource(); s.buffer = state.audioBuffer; s.connect(oc.destination); s.start(0);
  return (await oc.startRendering()).getChannelData(0);
}

/* ---------- VAD ringan: cari bagian berbicara/bernyanyi ----------
   dipakai untuk memilih potongan PROBE bahasa (3-12 dtk pertama
   yang benar-benar berisi vokal). */
function speechWindows(pcm, sr = 16000, singMode = false) {
  const win = Math.round(sr * 0.25);
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
  const thr = Math.max(0.004, Math.min(0.05, Math.max(med * 0.45, hi * 0.04)));
  const act = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (en[i] > thr) act[i] = 1;
  const runs = [];
  let s = -1;
  for (let i = 0; i < n; i++) {
    if (act[i] && s < 0) s = i;
    if ((!act[i] || i === n - 1) && s >= 0) { const e = act[i] ? i + 1 : i; runs.push([s, e]); s = -1; }
  }
  const merged = [];
  for (const r of runs) {
    if (merged.length && (r[0] - merged[merged.length - 1][1]) * 0.25 < 1.0) merged[merged.length - 1][1] = r[1];
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

/* ---------- WRITER WAV 16-bit PCM (masukan mesin native) ---------- */
function encodeWav16(f32, sr = 16000) {
  const n = f32.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(buf);
  const wstr = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
  wstr(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); wstr(8, 'WAVE');
  wstr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  wstr(36, 'data'); dv.setUint32(40, n * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++, o += 2) {
    let v = Math.max(-1, Math.min(1, f32[i]));
    dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7FFF, true);
  }
  return new Uint8Array(buf);
}

async function saveWav(bytes, dir, name) {
  const { id, path: p } = await window.kinostra.beginWrite(dir, name);
  try {
    const CHUNK = 8 * 1024 * 1024;
    for (let off = 0; off < bytes.length; off += CHUNK) {
      await window.kinostra.writeChunk(id, bytes.subarray(off, Math.min(off + CHUNK, bytes.length)));
    }
    await window.kinostra.endWrite(id);
    return p;
  } catch (e) {
    try { await window.kinostra.abortWrite(id); } catch (_) { }
    throw e;
  }
}

/* ---------- FILTER HALLUSINASI ---------- */
/* baris yang memuat aksara BUKAN Latin (Sinhala/CJK/Arab dst —
   pola hallusasi khas whisper di bagian hening/musik) dibuang */
const LATIN_OK = /[\p{Script=Latin}\p{N}\s.,!?'"“”‘’\-–—:;()…&/+%°]/u;
function cleanLine(t) {
  t = (t || '').replace(/\s+/g, ' ').trim();
  if (t.replace(/[^\p{L}\p{N}]/gu, '').length < 2) return '';
  const bad = t.replace(/[\p{Script=Latin}\p{N}\s.,!?'"“”‘’\-–—:;()…&/+%°]/gu, '');
  if (bad.length > Math.max(1, t.replace(/\s/g, '').length * 0.12)) return '';
  if (!LATIN_OK.test(t[0] || 'a')) return '';
  const w = t.split(' ');
  if (w.length > 6) {
    let rep = 0;
    for (let i = 2; i < w.length; i++) if (w[i].toLowerCase() === w[i - 2].toLowerCase()) rep++;
    if (rep > w.length * 0.45) return '';
  }
  for (const tok of w) {
    if (tok.replace(/[^\p{L}\p{N}]/gu, '').length > 18) return '';
  }
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

/* stub kompatibilitas uji lama */
function detectLang(text) {
  const s = text || '';
  if (/[\u4E00-\u9FFF]/.test(s)) return 'chinese';
  if (/[\u3040-\u30FF]/.test(s)) return 'japanese';
  if (/[\uAC00-\uD7AF]/.test(s)) return 'korean';
  return null;
}

/* ---------- LISTENER PROGRES GLOBAL (didftar SEKALI, tidak menumpuk) ----------
   Kejadian dikirim main process: model (unduh), detect/detected (bahasa),
   transcribe (persen menulis). Modal yang tampil otomatis diperbarui. */
window.kinostra.onWhisperProgress(info => {
  if (!info) return;
  if (info.phase === 'model' && info.total) {
    const p = info.loaded / info.total;
    setSub(`Mengunduh model · ${fmtMB(info.loaded)} / ${fmtMB(info.total)} (terputus? lanjut otomatis)`);
    setProg(clamp(0.01 + p * 0.07, 0, 0.09));
  } else if (info.phase === 'detect') {
    setSub('Mendeteksi: Bahasa Jawa atau Bahasa Indonesia…');
  } else if (info.phase === 'detected') {
    const lb = info.language === 'jw' ? 'JAWA' : 'INDONESIA';
    setSub(`Bahasa terdeteksi: ${lb} — mulai menulis…`);
    const srcLang = $('#asrLang') ? $('#asrLang').value : 'auto';
    $('#vmLang').textContent = (srcLang === 'auto' ? 'AUTO · ' : '') + lb;
  } else if (info.phase === 'transcribe') {
    setSub(`VOCALIS menulis · ${Math.round((info.pct || 0) * 100)}%`);
    setProg(clamp(0.1 + (info.pct || 0) * 0.88, 0, 0.985));
  }
});

/* ================================================================
   PIPELINE UTAMA VOCALIS v4 (mesin native)
   ================================================================ */
async function generateSubs() {
  if (!state.file) { toast('Impor media dulu', 'err'); return; }
  if (state.busy || _whisperBusy) return;
  state.busy = true; _whisperBusy = true; state.abort = false;   /* reset batal lama */
  try {
    const engineKey = $('#asrModel').value || 'small';
    const eng = VOCALIS_ENGINES[engineKey] || VOCALIS_ENGINES.small;
    const engLabel = eng.label;
    const singMode = $('#singMode').checked;
    const srcLang = $('#asrLang').value;      // auto | javanese | indonesian

    showModal({ title: 'MESIN VOCALIS v4', sub: 'Menyiapkan mesin native…', cancel: true, onCancel: cancelSubs });

    /* --- 1) pastikan model ggml ada di disk (unduh dengan RESUME) --- */
    const st0 = await window.kinostra.whisperStatus();
    if (!st0.binOk) throw new Error('Binari mesin tidak ditemukan — instal ulang aplikasi');
    _whisperTmpDir = st0.tmpDir;
    if (!st0.models[engineKey] || !st0.models[engineKey].ready) {
      setSub(`Mengunduh model ${engLabel} (${eng.sizeMB} MB) — sekali saja, dilanjutkan otomatis bila terputus…`);
      setProg(0.01);
      const r = await window.kinostra.whisperEnsure(engineKey);
      if (!r.ok) throw new Error(r.error || 'Gagal mengunduh model');
    }
    setProg(0.1);

    /* --- 2) ekstrak audio 16 kHz mono → WAV --- */
    setSub('Mengekstrak audio 16 kHz…');
    const pcm = await getMono16k();
    if (!pcm || pcm.length < 1600) throw new Error('Audio kosong / tidak terbaca');

    /* --- 3) potongan PROBE bahasa: 3-12 dtk pertama yang berisi vokal --- */
    let wins = speechWindows(pcm, 16000, singMode);
    const sr = 16000;
    let probePcm = null;
    if (wins.length) {
      const w = wins[0];
      const a = Math.floor(w.s * sr);
      const b = Math.min(pcm.length, Math.floor((w.s + 12) * sr));
      probePcm = pcm.slice(a, Math.max(b, a + sr * 3));
    } else {
      probePcm = pcm.slice(0, Math.min(pcm.length, 12 * sr));
    }

    /* --- 4) tulis WAV ke folder kerja mesin --- */
    setSub('Menulis audio sementara…');
    const tmp = await whisperTmpDir();
    const wavPath = await saveWav(encodeWav16(pcm, sr), tmp, 'kinestra_full.wav');
    let probePath = wavPath;
    if (srcLang === 'auto' && probePcm && probePcm.length > sr) {
      try { probePath = await saveWav(encodeWav16(probePcm, sr), tmp, 'kinestra_probe.wav'); } catch (_) { }
    }

    /* --- 5) TRANSKRIP NATIVE (proses terpisah, tidak membebani browser) --- */
    setSub(`VOCALIS ${engLabel} menulis · ${fmtT(pcm.length / sr)} audio · ${srcLang === 'auto' ? 'AUTO' : srcLang === 'javanese' ? 'JAWA' : 'INDONESIA'}`);
    const r = await window.kinostra.whisperTranscribe({
      wavPath, probePath, engine: engineKey,
      lang: srcLang === 'javanese' ? 'jw' : srcLang === 'indonesian' ? 'id' : 'auto',
      song: singMode
    });
    if (!r.ok) throw new Error(r.error || 'Transkrip gagal');
    if (state.abort) throw new Error('Dibatalkan');

    const langLabel = (r.chosen || r.language || 'id') === 'jw' ? 'JAWA' : 'INDONESIA';
    if (srcLang === 'auto') $('#vmLang').textContent = `AUTO · ${langLabel}`;

    /* --- 6) bersihkan baris (hallusinasi/aksara asing/ulangan) --- */
    let subs = [];
    for (const s of r.segments || []) {
      const txt = cleanLine(s.text);
      if (!txt) continue;
      subs.push({ s: Math.max(0, s.s), e: Math.max(s.s + 0.3, Math.min(s.e, state.duration || s.e)), text: txt });
    }
    subs = dedupeLines(subs.sort((a, b) => a.s - b.s));

    state.subs = subs; state.subsOn = subs.length > 0; $('#subsOn').checked = state.subsOn;
    renderSubList();
    $('#subStat').textContent = `${subs.length} baris · ${langLabel} · mesin ${engLabel} NATIVE · audio ${Math.round(pcm.length / sr)} dtk`;
    toast(`${subs.length} baris subtitel dihasilkan (VOCALIS v4 · ${langLabel})`, 'ok');

    /* --- 7) rapikan file sementara --- */
    try { await window.kinostra.whisperCancel(); } catch (_) { }
  } catch (e) {
    console.error(e);
    toast('Subtitel gagal: ' + (e.message || e), 'err');
    try { await window.kinostra.whisperCancel(); } catch (_) { }
  }
  state.busy = false; _whisperBusy = false;
  hideModal();
}

/* tombol BATAL pada modal proses */
async function cancelSubs() {
  state.abort = true;
  try { await window.kinostra.whisperCancel(); } catch (_) { }
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
