/* ================================================================
   KINOSTRA DESKTOP — core.js
   Helper global, state utama, modal/toast, simpan ke disk
   ================================================================ */
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmtT = t => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = t % 60; return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`; };
const fmtMB = b => (b / 1048576).toFixed(1) + ' MB';
const slug = s => (s || 'VIDEO').trim().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').toUpperCase() || 'VIDEO';
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const QUAL = {
  max: { br: 12e6, label: 'MAKSIMAL 12 Mbps' },
  balanced: { br: 6e6, label: 'SEIMBANG 6 Mbps' },
  compressed: { br: 2.5e6, label: 'HEMAT 2.5 Mbps' },
  ultra: { br: 1e6, label: 'ULTRA HEMAT 1 Mbps' }
};
const FONTS = [
  { n: 'Cinzel', d: 'TRAJAN · GLADIATOR / TROY' },
  { n: 'Bebas Neue', d: 'KONDENSI POSTER · HOLLYWOOD' },
  { n: 'Anton', d: 'ULTRA BOLD · POSTER AKSI' },
  { n: 'Oswald', d: 'KONDENSI NETRAL · TRAILER' },
  { n: 'Montserrat', d: 'GOTHAM-LIKE · THE DARK KNIGHT' },
  { n: 'Jost', d: 'FUTURA · 2001: A SPACE ODYSSEY' },
  { n: 'Playfair Display', d: 'DIDOT SERIF · DRAMA PERIODE' },
  { n: 'Orbitron', d: 'SCI-FI GEOMETRIS · DUNE UI' },
  { n: 'Michroma', d: 'EUROSTILE/BANK GOTHIC · ALIEN' },
  { n: 'Cormorant Garamond', d: 'GARAMOND ELEGAN · ARTHA DRAMA' }
];
const TRACKCOLORS = ['#F7A600', '#3EE6C1', '#FF4FA3', '#9BE15D'];

const state = {
  file: null, duration: 0, isAudio: false, audioBuffer: null, peaks: null,
  title: '', titleOn: true, desc: '', descOn: true, descPos: 'under',
  ratio: '16:9', bgMode: 'blur',
  splitSec: 30, splitCustom: false, partPrefix: 'PART', partShow: 'intro',
  font: 'Bebas Neue', titleScale: 1, subScale: 1, upper: true,
  subs: [], subsOn: true, subTarget: 'src',
  trackMode: false,
  track: { active: false, points: [], tpl: null, tw: 26, th: 26, stats: null, label: 'TARGET 01', color: '#F7A600' },
  music: { buffer: null, mood: 'epic', intensity: 0.6, gain: 0.6, seed: (Math.random() * 1e9) | 0 },
  audioGain: 0.9, quality: 'balanced', scale: 1, fps: 30,
  /* UPGRADE: efek visual & watermark */
  vfx: { bright: 1, contrast: 1, saturate: 1, vignette: false, grain: false },
  wm: { mode: 'off', text: '@KINOSTRA', img: null, imgName: '', pos: 'br', opacity: 0.6, scale: 1 },
  /* UPGRADE: batch */
  batch: [],
  busy: false, abort: false, scanAbort: false
};

const videoEl = $('#vid'), cv = $('#cv'), ctx = cv.getContext('2d');
const stage = $('#stage'), stageWrap = $('#stagewrap');

/* ---------- TOAST & MODAL ---------- */
function toast(msg, type = 'info') {
  const d = document.createElement('div'); d.className = 'toast ' + type; d.textContent = msg;
  $('#toasts').appendChild(d); setTimeout(() => { d.style.opacity = '0'; d.style.transition = '.4s'; setTimeout(() => d.remove(), 400); }, 4200);
}
const M = { el: $('#modal'), t: $('#mTitle'), b: $('#mBody'), bar: $('#mBar'), f: $('#mFill'), s: $('#mSub'), c: $('#mCancel'), onCancel: null };
function showModal({ title, sub = '', cancel = false, onCancel = null, body = null }) {
  M.t.textContent = title; M.s.textContent = sub; M.onCancel = onCancel;
  M.c.style.display = cancel ? '' : 'none';
  M.c.textContent = 'BATAL';
  if (body != null) { M.b.hidden = false; M.b.innerHTML = body; M.bar.style.display = 'none'; }
  else { M.b.hidden = true; M.bar.style.display = ''; }
  M.f.style.width = '0%'; M.el.classList.remove('hidden');
}
function setProg(p) { M.f.style.width = (clamp(p, 0, 1) * 100).toFixed(1) + '%'; }
function setSub(s) { M.s.textContent = s; }
function hideModal() { M.el.classList.add('hidden'); M.onCancel = null; }
M.c.onclick = () => { if (M.onCancel) M.onCancel(); else hideModal(); };

/* ---------- WEB AUDIO CONTEXT ---------- */
let _actx = null;
const getActx = () => _actx || (_actx = new (window.AudioContext || window.webkitAudioContext)());

/* ---------- PENYIMPANAN DESKTOP (streaming ke disk) ---------- */
async function saveBlobToDir(blob, dir, fileName) {
  const { id, path: finalPath } = await window.kinostra.beginWrite(dir, fileName);
  try {
    const CHUNK = 8 * 1024 * 1024; // 8 MB
    const arr = new Uint8Array(await blob.arrayBuffer());
    for (let off = 0; off < arr.length; off += CHUNK) {
      await window.kinostra.writeChunk(id, arr.subarray(off, Math.min(off + CHUNK, arr.length)));
    }
    const res = await window.kinostra.endWrite(id);
    return res; // { path, size }
  } catch (e) {
    try { await window.kinostra.abortWrite(id); } catch (_) { }
    throw e;
  }
}

/* ---------- SIMPAN TEKS (SRT) — dialog simpan via fallback anchor ----------
   SRT kecil: tulis via stream ke folder output terakhir, atau unduh biasa */
let _lastOutDir = null;
async function saveTextFile(text, defaultName) {
  const dir = _lastOutDir || await window.kinostra.pickOutputDir();
  if (!dir) return null;
  _lastOutDir = dir;
  return await saveBlobToDir(new Blob([text], { type: 'text/plain;charset=utf-8' }), dir, defaultName);
}

/* ---------- BOOT ---------- */
window.addEventListener('load', () => {
  if (window.lucide) lucide.createIcons();
  setTimeout(() => { $('#boot').classList.add('off'); setTimeout(() => { const b = $('#boot'); if (b) b.remove(); }, 900); }, 1000);
});
