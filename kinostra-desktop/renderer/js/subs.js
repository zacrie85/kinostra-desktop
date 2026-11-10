/* ================================================================
   KINOSTRA DESKTOP — subs.js (v2.13 · VOCALIS v4 TURBO + AUTO-SUBTITEL)
   ================================================================
   AI SUBTITEL BARU — FOKUS BAHASA JAWA & BAHASA INDONESIA SAJA.

   VOCALIS v4 memakai mesin native whisper.cpp sebagai proses
   terpisah di luar browser:
   1. TANPA BATAS MEMORI BROWSER — proses native, stabil di semua
      mesin (4GB pun aman). Tidak ada lagi WebGPU/WASM crash.
   2. UNDUHAN DENGAN RESUME — model ggml (32/60/181/547 MB) lanjut
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
   8. v2.13 TURBO — audio dipecah jadi potongan lalu ditranskrip
      PARALEL oleh 2-4 proses sekaligus (di CPU multi-core hasilnya
      2-4× lebih cepat), bagian tanpa suara DILEWATI, dan model
      baru CEPAT (base, ±60 MB) untuk keseimbangan kecepatan.
   9. v2.13 AUTO-SUBTITEL — pengaturan baru: semua video otomatis
      dibuatkan subtitelnya SAAT EKSPOR / SPLIT / BATCH, tanpa
      perlu menekan BUAT SUBTITEL dulu (bisa dimatikan).
   100% LOKAL — model diunduh sekali ke AppData, lalu offline permanen.
   ================================================================ */
'use strict';

/* ---------- KATALOG MESIN VOCALIS v4 (ggml, unduh sekali) ---------- */
const VOCALIS_ENGINES = {
  turbo: { engine: 'turbo', label: 'TURBO', sizeMB: 547 },
  small: { engine: 'small', label: 'SEDANG', sizeMB: 181 },
  base: { engine: 'base', label: 'CEPAT', sizeMB: 60 },
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
  /* v2.6: decode audio kini berjalan di belakang saat loading —
     tunggu promise-nya, jangan decode dua kali */
  if (!state.audioBuffer) await (state.audioReady || decodeFileAudio());
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
   transcribe (persen menulis — v2.13 membawa info pekerja paralel).
   Modal yang tampil otomatis diperbarui. */
let _lastEngLabel = 'SEDANG';
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
    const pct = Math.round((info.pct || 0) * 100);
    /* v2.13: TURBO — info pekerja & potongan bila ada */
    const ch = info.total > 1 ? ` · bagian ${info.done + 1}/${info.total}` : '';
    const par = info.workers > 1 ? ` · ${info.workers} PEKERJA PARALEL` : '';
    setSub(`VOCALIS ${_lastEngLabel} menulis · ${pct}%${ch}${par}`);
    setProg(clamp(0.1 + (info.pct || 0) * 0.88, 0, 0.985));
  }
});

/* ================================================================
   v2.13 TURBO — PERENCANA POTONGAN AUDIO
   Audio penuh dipecah menjadi potongan ±150 dtk (maks 240 dtk):
   - batas potongan dicari di titik PALING SEPI di sekitar target
     agar kata tidak terpotong di tengah;
   - bila "lewati bagian tanpa suara" aktif, rentang hening/lagu
     instrumen tidak dibuat potongannya (transkrip jauh lebih cepat);
   - potongan dikirim ke main process untuk ditranskrip paralel.
   ================================================================ */
function rmsAt(pcm, sr, t, win = 0.3) {
  const a = Math.max(0, Math.floor(t * sr)), b = Math.min(pcm.length, Math.floor((t + win) * sr));
  let s = 0, c = 0;
  for (let i = a; i < b; i += 4) { s += pcm[i] * pcm[i]; c++; }
  return Math.sqrt(s / Math.max(1, c));
}

function planChunks(pcm, sr = 16000, singMode = false, skipSilence = true) {
  const dur = pcm.length / sr;
  const TARGET = 150, MINC = 25, MAXC = 240, LOOK = 12;
  /* 1) wilayah aktif = semua rentang yang berisi suara (atau penuh bila mati) */
  let regions = [[0, dur]];
  if (skipSilence) {
    const wins = speechWindows(pcm, sr, singMode);
    const mg = [];
    for (const w of wins) {
      if (mg.length && w.s - mg[mg.length - 1][1] < 3.0) mg[mg.length - 1][1] = w.e;
      else mg.push([w.s, w.e]);
    }
    regions = mg.filter(r => r[1] - r[0] > 0.4);
    if (!regions.length) regions = [[0, dur]];   /* VAD tidak menemukan apa pun → penuh (aman) */
  }
  /* 2) pecah tiap wilayah pada titik tersepi di sekitar target */
  const chunks = [];
  for (const [rs, re] of regions) {
    let s = rs;
    while (re - s > MAXC) {
      const want = s + TARGET;
      const lo = Math.max(s + MINC, want - LOOK), hi = Math.min(re - MINC, want + LOOK);
      let best = -1, bestE = Infinity;
      if (hi > lo) {
        for (let t = lo; t <= hi; t += 0.25) {
          const e = rmsAt(pcm, sr, t, 0.3);
          if (e < bestE) { bestE = e; best = t; }
        }
      }
      const cut = best > 0 ? best : want;
      chunks.push({ a: s, b: cut });
      s = cut;
    }
    if (re - s > 0.3) chunks.push({ a: s, b: re });
  }
  if (!chunks.length) chunks.push({ a: 0, b: dur });
  /* 3) bantal 0.25 dtk di kedua ujung (baris ganda dijahit dedupeLines) */
  return chunks.map(c => ({ a: Math.max(0, c.a - 0.25), b: Math.min(dur, c.b + 0.25) }));
}

/* ================================================================
   INTI TRANSKRIP — transcribeCore(opt)
   Dipakai dua jalur: tombol BUAT SUBTITEL (generateSubs, modal
   sendiri) dan AUTO-SUBTITEL saat ekspor/split/batch (ensureAutoSubs,
   UI mengikuti modal proses yang sedang tampil).
   opt: { engine, srcLang, singMode, skipSilence, onSub, onProg, isCancelled }
   Hasil: { subs, langLabel, audioSec, engineLabel, turbo }
   Melempar Error bila gagal / dibatalkan.
   ================================================================ */
async function transcribeCore(opt) {
  const engineKey = opt.engine || ($('#asrModel') && $('#asrModel').value) || 'small';
  const eng = VOCALIS_ENGINES[engineKey] || VOCALIS_ENGINES.small;
  const engLabel = eng.label;
  _lastEngLabel = engLabel;
  const singMode = opt.singMode != null ? opt.singMode : ($('#singMode') ? $('#singMode').checked : false);
  const skipSilence = opt.skipSilence != null ? opt.skipSilence : ($('#subSkipSilence') ? $('#subSkipSilence').checked : true);
  const srcLang = opt.srcLang || ($('#asrLang') ? $('#asrLang').value : 'auto');
  const onSub = opt.onSub || setSub, onProg = opt.onProg || setProg;
  const isCancelled = opt.isCancelled || (() => state.abort);

  /* pengawas pembatalan: bila ekspor/batch dibatalkan di tengah transkrip,
     hentikan proses whisper segera */
  const abortWatch = setInterval(() => { if (isCancelled()) window.kinostra.whisperCancel().catch(() => { }); }, 500);

  try {
    /* --- 1) pastikan model ggml ada di disk (unduh dengan RESUME) --- */
    const st0 = await window.kinostra.whisperStatus();
    if (!st0.binOk) throw new Error('Binari mesin tidak ditemukan — instal ulang aplikasi');
    _whisperTmpDir = st0.tmpDir;
    if (!st0.models[engineKey] || !st0.models[engineKey].ready) {
      onSub(`Mengunduh model ${engLabel} (${eng.sizeMB} MB) — sekali saja, dilanjutkan otomatis bila terputus…`);
      onProg(0.01);
      const r = await window.kinostra.whisperEnsure(engineKey);
      if (!r.ok) throw new Error(r.error || 'Gagal mengunduh model');
    }
    onProg(0.1);

    /* --- 2) ekstrak audio 16 kHz mono → WAV --- */
    onSub('Mengekstrak audio 16 kHz…');
    const pcm = await getMono16k();
    if (!pcm || pcm.length < 1600) throw new Error('Audio kosong / tidak terbaca');

    /* --- 3) potongan PROBE bahasa: 3-12 dtk pertama yang berisi vokal --- */
    const sr = 16000;
    const wins = speechWindows(pcm, sr, singMode);
    let probePcm = null;
    if (wins.length) {
      const w = wins[0];
      const a = Math.floor(w.s * sr);
      const b = Math.min(pcm.length, Math.floor((w.s + 12) * sr));
      probePcm = pcm.slice(a, Math.max(b, a + sr * 3));
    } else {
      probePcm = pcm.slice(0, Math.min(pcm.length, 12 * sr));
    }

    /* --- 4) v2.13 TURBO: rencana potongan (lewati hening + paralel) --- */
    const chunks = planChunks(pcm, sr, singMode, skipSilence);

    /* --- 5) tulis WAV ke folder kerja mesin --- */
    onSub('Menulis audio sementara…');
    const tmp = await whisperTmpDir();
    const wavPath = await saveWav(encodeWav16(pcm, sr), tmp, 'kinestra_full.wav');
    let probePath = wavPath;
    if (srcLang === 'auto' && probePcm && probePcm.length > sr) {
      try { probePath = await saveWav(encodeWav16(probePcm, sr), tmp, 'kinestra_probe.wav'); } catch (_) { }
    }

    /* --- 6) TRANSKRIP NATIVE (proses terpisah, tidak membebani browser) --- */
    const nCh = chunks.length > 1 ? ` · ${chunks.length} bagian` : '';
    onSub(`VOCALIS ${engLabel} menulis · ${fmtT(pcm.length / sr)} audio${nCh} · ${srcLang === 'auto' ? 'AUTO' : srcLang === 'javanese' ? 'JAWA' : 'INDONESIA'}`);
    const r = await window.kinostra.whisperTranscribe({
      wavPath, probePath, engine: engineKey,
      lang: srcLang === 'javanese' ? 'jw' : srcLang === 'indonesian' ? 'id' : 'auto',
      song: singMode, chunks
    });
    if (!r.ok) throw new Error(r.error || 'Transkrip gagal');
    if (isCancelled()) throw new Error('Dibatalkan');

    const langLabel = (r.chosen || r.language || 'id') === 'jw' ? 'JAWA' : 'INDONESIA';
    if (srcLang === 'auto' && $('#vmLang')) $('#vmLang').textContent = `AUTO · ${langLabel}`;

    /* --- 7) bersihkan baris (hallusinasi/aksara asing/ulangan) --- */
    let subs = [];
    for (const s of r.segments || []) {
      const txt = cleanLine(s.text);
      if (!txt) continue;
      subs.push({ s: Math.max(0, s.s), e: Math.max(s.s + 0.3, Math.min(s.e, state.duration || s.e)), text: txt });
    }
    subs = dedupeLines(subs.sort((a, b) => a.s - b.s));

    try { await window.kinostra.whisperCancel(); } catch (_) { }
    return { subs, langLabel, audioSec: Math.round(pcm.length / sr), engineLabel: engLabel, turbo: r.turbo || null };
  } finally {
    clearInterval(abortWatch);
  }
}

/* ================================================================
   v2.13 AUTO-SUBTITEL — dibuatkan subtitel otomatis saat ekspor
   Dipanggil SEBELUM ekspor/split/batch. Aturan:
   - hanya jalan bila pengaturan AUTO-SUBTITEL aktif (default ON),
     burn-in subtitel aktif, video belum punya subtitel (hasil AI
     manual / impor SRT sebelumnya dihormati), dan mesin sedang idle;
   - GAGAL TIDAK MENGHENTIKAN EKSPOR — toast peringatan, video tetap
     dirender tanpa subtitel (kecuali pengguna membatalkan).
   ================================================================ */
function autoSubEnabled() {
  const el = $('#autoSub');
  return !!el && el.checked;
}

async function ensureAutoSubs(ui = {}) {
  if (!autoSubEnabled()) return;
  if (!state.file || state.subs.length || !state.subsOn) return;
  if (_whisperBusy) return;
  _whisperBusy = true;
  const ownModal = !!ui.ownModal;
  const onSub = ui.sub || setSub, onProg = ui.prog || setProg;
  try {
    if (ownModal) showModal({ title: 'SUBTITEL OTOMATIS', sub: 'Menyiapkan mesin VOCALIS…', cancel: true, onCancel() { state.abort = true; } });
    const res = await transcribeCore({
      onSub, onProg, isCancelled: () => state.abort
    });
    state.subs = res.subs;
    state.subsOn = res.subs.length > 0;
    const cb = $('#subsOn'); if (cb) cb.checked = state.subsOn;
    renderSubList();
    const nm = (state.file && state.file.name ? state.file.name.slice(0, 24) : 'video');
    $('#subStat').textContent = `${res.subs.length} baris · AUTO · ${res.langLabel} · mesin ${res.engineLabel}${res.turbo ? ` · turbo ${res.turbo.workers}×` : ''} · ${nm}`;
    toast(`Subtitel otomatis: ${res.subs.length} baris (${res.langLabel}) — ikut terbakar ke semua part`, 'ok');
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (state.abort || /Dibatalkan/i.test(msg)) throw new Error('Dibatalkan');
    /* kegagalan internal → ekspor tetap jalan tanpa subtitel */
    console.warn('auto-subtitle dilewati:', msg);
    toast('Subtitel otomatis dilewati: ' + msg.slice(0, 90), 'warn');
  } finally {
    _whisperBusy = false;
    if (ownModal) hideModal();
  }
}

/* ================================================================
   TOMBOL BUAT SUBTITEL — jalur manual (modal sendiri)
   ================================================================ */
async function generateSubs() {
  if (!state.file) { toast('Impor media dulu', 'err'); return; }
  if (state.busy || _whisperBusy) return;
  state.busy = true; _whisperBusy = true; state.abort = false;   /* reset batal lama */
  try {
    showModal({ title: 'MESIN VOCALIS v4', sub: 'Menyiapkan mesin native…', cancel: true, onCancel: cancelSubs });
    const res = await transcribeCore({});
    if (state.abort) throw new Error('Dibatalkan');

    state.subs = res.subs; state.subsOn = res.subs.length > 0; $('#subsOn').checked = state.subsOn;
    renderSubList();
    $('#subStat').textContent = `${res.subs.length} baris · ${res.langLabel} · mesin ${res.engineLabel} NATIVE${res.turbo ? ` · TURBO ${res.turbo.workers} PEKERJA` : ''} · audio ${res.audioSec} dtk`;
    toast(`${res.subs.length} baris subtitel dihasilkan (VOCALIS v4 · ${res.langLabel}${res.turbo ? ` · turbo ${res.turbo.workers} pekerja paralel` : ''})`, 'ok');
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

/* ================================================================
   v2.12 — IMPOR SUBTITEL DARI FILE .SRT
   Sekarang subtitel bisa dimuat dari file tanpa harus menulis ulang
   lewat AI: hasil VOCALIS sebelumnya, subtitel dari editor lain,
   atau subtitel buatan sendiri — tinggal impor dan langsung tampil
   di preview & terbakar ke video saat ekspor.
   Parser tahan BOM, CRLF, spasi berlebih, tag HTML (<i>, <font>),
   dan pemisah milidetik koma ATAU titik.
   ================================================================ */
function parseSrtTime(s) {
  /* "00:01:02,500" | "00:01:02.500" | "01:02.5" → detik */
  s = String(s || '').trim().replace(',', '.');
  const p = s.split(':').map(x => parseFloat(x.trim()));
  if (!p.length || p.length > 3 || p.some(isNaN)) return NaN;
  return p.reverse().reduce((a, v, i) => a + v * Math.pow(60, i), 0);
}
function parseSrt(txt) {
  const out = [];
  const blocks = String(txt || '').replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n{2,}/);
  for (const b of blocks) {
    const lines = b.split('\n').filter(l => l.trim() !== '');
    if (!lines.length) continue;
    let li = 0;
    if (/^\d+$/.test(lines[0].trim())) li = 1;          /* nomor urut — lewati */
    const tl = lines[li] || '';
    const arrow = tl.indexOf('-->');
    if (arrow < 0) continue;
    const s = parseSrtTime(tl.slice(0, arrow));
    const e = parseSrtTime(tl.slice(arrow + 3));
    /* teks: sisanya, tanpa tag html */
    const text = lines.slice(li + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (isNaN(s) || isNaN(e) || !text) continue;
    out.push({ s: Math.max(0, s), e: Math.max(s + 0.2, e), text });
  }
  return out;
}
/* v2.12: dipakai ui.js — tombol IMPOR SRT di modul 04 */
async function importSrt() {
  if (state.busy) { toast('Tunggu proses lain selesai', 'warn'); return; }
  let r = null;
  try { r = await window.kinostra.pickSrt(); } catch (e) { toast('Dialog tidak tersedia: ' + e.message, 'err'); return; }
  if (!r || !r.text) return;
  let subs = parseSrt(r.text);
  if (!subs.length) { toast('File SRT tidak berisi baris yang valid', 'err'); return; }
  /* rapikan dengan filter hallusinasi yang sama (aman utk SRT biasa) */
  subs = dedupeLines(subs.map(s => ({ ...s, text: cleanLine(s.text) || s.text })).sort((a, b) => a.s - b.s));
  subs.forEach(s => { s.e = Math.min(s.e, state.duration || s.e); });
  state.subs = subs; state.subsOn = true; $('#subsOn').checked = true;
  renderSubList();
  $('#subStat').textContent = `${subs.length} baris · impor SRT · ${r.name}`;
  toast(`${subs.length} baris subtitel dimuat dari ${r.name}`, 'ok');
}
