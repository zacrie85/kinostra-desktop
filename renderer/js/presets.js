/* ================================================================
   KINOSTRA DESKTOP v3.16 — presets.js
   PENGATURAN TERSIMPAN (modul 01): simpan seluruh setelan sebagai
   preset bernama → muat lagi kapan pun untuk pekerjaan baru.
   Disimpan di localStorage (kinostra.presets.v1) — 100% offline.
   Yang TIDAK ikut: file video/gambar/audio (cover, logo, backsound,
   musik, TTS) & data per-video (subtitel, potongan, adegan, tracking).
   ================================================================ */
'use strict';

const PRESET_KEY = 'kinostra.presets.v1';

/* ---------- daftar kontrol yang diambil ---------- */
const PRESET_SEGS = [
  'segRatio', 'segBg', 'segSplit', 'segSplitMode', 'segPartShow',
  'segTitleAnim', 'segPartAnim', 'segDescPos',
  'segSpkSpeed', 'segSpkTrans', 'segSpkSilence',
  'segMood', 'segWm', 'segWmPos',
  'segSpeed', 'segKb', 'segTrans',
  'segCover', 'segCoverSrc', 'segCoverBg', 'segCoverFrame', 'segCoverFx',
  'segCoverTitleAnim', 'segCoverPartAnim', 'segCoverDur', 'segCoverPart',
  'segQual', 'segScale', 'segRes', 'segFps', 'segAcc', 'segKilat', 'segCutMode', 'segParallel'
];
/* chips dgn dataset.v pada tombolnya */
const PRESET_CHIPS = ['titleFrameChips', 'coverLayoutChips', 'coverPaletteChips', 'coverTransChips'];
/* chips khusus — diambil dari state (klik ulang saat muat via teks span) */
const PRESET_STATE_CHIPS = ['frameStyles', 'colorFilters', 'fontGrid'];
const PRESET_CHECKS = [
  'titleOn', 'titleAuto', 'descOn', 'singMode', 'autoSub', 'subSkipSilence', 'subsOn',
  'spkOn', 'spkAuto', 'bsoundOn', 'audioFixOn', 'audioFixHiss', 'upperOn',
  'vignetteOn', 'grainOn', 'neonOn', 'neonDual', 'massImport', 'autoRun',
  'resumeExport', 'autoShutdown'
];
const PRESET_VALS = [
  'inTitle', 'inTitleSize', 'inSplit', 'inSplitParts', 'inRangeStart', 'inRangeEnd',
  'selPrefix', 'selTitleFont', 'inPartSize', 'inPartX', 'inPartY', 'inTitleY',
  'inDesc', 'asrLang', 'asrModel', 'subSize', 'subPosY',
  'inZoom', 'inPanX', 'inPanY',
  'trackLabel',
  'inInt', 'inMG', 'inAG', 'inBS', 'ttsText', 'ttsGain',
  'inTS',
  'inVB', 'inVC', 'inVS',
  'wmText', 'inWmO', 'inWmS',
  'inNeonW', 'inNeonS', 'inKbS', 'inTransD',
  'inCoverTitle', 'inCoverPartSize', 'inCoverTransDur',
  'inTargetMB'
];

function presetActiveValue(containerId) {
  const on = document.querySelector('#' + containerId + ' button.on');
  if (!on) return null;
  return on.dataset.v != null && on.dataset.v !== '' ? on.dataset.v : (on.dataset.v === '' ? '' : (on.querySelector('span') ? on.querySelector('span').textContent : on.title));
}

function captureSettings() {
  const d = { segs: {}, chips: {}, schips: {}, checks: {}, vals: {}, state: {} };
  PRESET_SEGS.forEach(id => { const v = presetActiveValue(id); if (v !== null) d.segs[id] = v; });
  PRESET_CHIPS.forEach(id => { const v = presetActiveValue(id); if (v !== null) d.chips[id] = v; });
  PRESET_STATE_CHIPS.forEach(id => {
    const on = document.querySelector('#' + id + ' button.on span');
    if (on) d.schips[id] = on.textContent;
  });
  PRESET_CHECKS.forEach(id => { const el = document.getElementById(id); if (el) d.checks[id] = el.checked; });
  PRESET_VALS.forEach(id => { const el = document.getElementById(id); if (el) d.vals[id] = el.value; });
  /* state tanpa kontrol DOM */
  d.state.neonColor = state.neon.color;
  d.state.trackColor = state.track.color;
  /* hitung jumlah setelan utk metadata */
  d._n = Object.keys(d.segs).length + Object.keys(d.chips).length + Object.keys(d.checks).length + Object.keys(d.vals).length + 2;
  return d;
}

function presetClickChip(id, val) {
  const box = document.getElementById(id);
  if (!box) return false;
  const btns = [...box.querySelectorAll('button')];
  let b = btns.find(x => x.dataset.v === val);
  if (!b) b = btns.find(x => (x.querySelector('span') ? x.querySelector('span').textContent : x.title) === val);
  if (b) { b.click(); return true; }
  return false;
}

function applySettingsData(d) {
  let applied = 0;
  /* 1) ceklis */
  Object.entries(d.checks || {}).forEach(([id, v]) => {
    const el = document.getElementById(id);
    if (el) { el.checked = !!v; el.dispatchEvent(new Event('change', { bubbles: true })); applied++; }
  });
  /* 2) input / select / textarea — dulu, supaya segmen yang lebih spesifik
        (mis. DURASI SPLIT 50 dtk) menang atas nilai mentah input ATUR
        SENDIRI (inSplit) yang ikut tersimpan */
  Object.entries(d.vals || {}).forEach(([id, v]) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      if (el.tagName === 'SELECT') el.dispatchEvent(new Event('change', { bubbles: true }));
      applied++;
    }
  });
  /* 3) segmen (rasio, split, animasi, kualitas, cover…) */
  Object.entries(d.segs || {}).forEach(([id, v]) => { if (presetClickChip(id, v)) applied++; });
  /* 4) chips generik (frame judul, layout/palet/transisi cover) */
  Object.entries(d.chips || {}).forEach(([id, v]) => { if (presetClickChip(id, v)) applied++; });
  /* 5) chips khusus: frame video & filter warna & font (cari via teks span) */
  Object.entries(d.schips || {}).forEach(([id, v]) => { if (presetClickChip(id, v)) applied++; });
  /* 6) warna neon & warna tracking — via state (tanpa efek samping klik) */
  try {
    if (d.state && d.state.neonColor) {
      state.neon.color = d.state.neonColor;
      const nc = NEONCOLORS.find(([nm, val]) => val === d.state.neonColor);
      $$('#neonColors button').forEach(b => {
        b.classList.toggle('on', nc ? (b.title || '').startsWith(nc[0]) : b.style.background.includes(String(d.state.neonColor).replace('#', '')));
      });
      if (typeof syncNeonLabels === 'function') syncNeonLabels();
    }
    if (d.state && d.state.trackColor) {
      state.track.color = d.state.trackColor;
      $$('#trackColors button').forEach(b => {
        b.classList.toggle('on', (b.style.background || '').includes(String(d.state.trackColor).replace('#', '')));
      });
    }
  } catch (e) { }
  /* 7) refresh global */
  try { if (typeof applyRatio === 'function') applyRatio(); } catch (e) { }
  try { if (typeof updateAll === 'function') updateAll(); } catch (e) { }
  try { if (typeof syncCoverUI === 'function') syncCoverUI(); } catch (e) { }
  return applied;
}

/* ---------- penyimpanan ---------- */
function loadPresets() {
  try { return JSON.parse(localStorage.getItem(PRESET_KEY) || '[]'); } catch (e) { return []; }
}
function savePresetsStore(list) {
  try { localStorage.setItem(PRESET_KEY, JSON.stringify(list)); return true; }
  catch (e) { toast('Preset gagal disimpan — penyimpanan penuh: ' + (e.message || e), 'err'); return false; }
}
function renderPresetList() {
  const list = loadPresets();
  const el = $('#presetList'), st = $('#presetStat');
  if (!el) return;
  if (!list.length) {
    el.innerHTML = '<div class="empty">BELUM ADA PRESET — ATUR SETELAN LALU TEKAN SIMPAN</div>';
  } else {
    el.innerHTML = '';
    list.forEach((p, i) => {
      const row = document.createElement('div'); row.className = 'prow';
      row.innerHTML = `<span class="picon"><i data-lucide="bookmark"></i></span>
        <span class="pinfo"><span class="pname">${p.name.replace(/</g, '&lt;')}</span>
        <span class="pmeta">${p.n} SETELAN · ${p.date}</span></span>`;
      const btns = document.createElement('span'); btns.className = 'pbtns';
      const bUse = document.createElement('button'); bUse.className = 'puse'; bUse.textContent = 'PAKAI';
      bUse.onclick = () => {
        if (state.busy) { toast('Tunggu proses lain selesai', 'warn'); return; }
        const n = applySettingsData(p.data);
        toast(`Preset "${p.name}" diterapkan — ${n} setelan terpasang`, 'ok');
      };
      const bDel = document.createElement('button'); bDel.className = 'pdel'; bDel.textContent = 'HAPUS';
      bDel.onclick = () => {
        list.splice(i, 1); savePresetsStore(list); renderPresetList();
        toast(`Preset "${p.name}" dihapus`, 'info');
      };
      btns.appendChild(bUse); btns.appendChild(bDel);
      row.appendChild(btns);
      el.appendChild(row);
    });
    if (window.lucide) lucide.createIcons();
  }
  if (st) st.textContent = `${list.length} preset tersimpan · modul 01`;
}

/* ---------- wiring modul 01 ---------- */
(function initPresets() {
  const bSave = $('#btnPresetSave');
  if (!bSave) return;
  bSave.onclick = () => {
    if (state.busy) { toast('Tunggu proses lain selesai', 'warn'); return; }
    const name = ($('#inPresetName').value || '').trim() || ('PRESET ' + (loadPresets().length + 1));
    const data = captureSettings();
    const list = loadPresets();
    const exist = list.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
    const meta = {
      id: 'p' + Date.now().toString(36),
      name,
      date: new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
      n: data._n, data
    };
    if (exist >= 0) { meta.id = list[exist].id; list[exist] = meta; toast(`Preset "${name}" diperbarui (${meta.n} setelan)`, 'ok'); }
    else { list.unshift(meta); toast(`Preset "${name}" tersimpan (${meta.n} setelan)`, 'ok'); }
    if (savePresetsStore(list)) { $('#inPresetName').value = ''; renderPresetList(); }
  };
  renderPresetList();
})();
