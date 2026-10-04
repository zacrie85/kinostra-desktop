/* ================================================================
   KINOSTRA DESKTOP — batch.js (v2.2 · KOTAK VIDEO TERPADU)
   SATU kotak berurutan (atas → bawah) untuk SEMUA video:
   - IMPOR MEDIA (tombol header) → masuk kotak
   - drag-drop ke jendela    → masuk kotak
   - TAMBAH FILE (batch)     → masuk kotak
   - klik baris  → tonton di preview utama
   - ▲ ▼         → atur urutan proses
   - ×           → hapus dari kotak
   - MULAI BATCH → memproses isi kotak berurutan dari atas
   ================================================================ */
'use strict';

function addBatchPath(p, via = 'batch') {
  if (!p) return null;
  const exists = state.batch.find(b => b.path === p);
  if (exists) { if (!exists.via) exists.via = via; renderQueue(); return exists; }
  const it = { path: p, name: p.split(/[\\/]/).pop(), size: 0, status: 'wait', msg: '', thumb: null, dur: 0, sel: false, via };
  state.batch.push(it);
  renderQueue();
  queueBatchThumb();
  return it;
}
function addBatchPaths(paths, via) { (paths || []).forEach(p => addBatchPath(p, via)); }

/* pindah urutan (naik/turun) */
function moveQueueItem(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= state.batch.length) return;
  const [it] = state.batch.splice(i, 1);
  state.batch.splice(j, 0, it);
  renderQueue();
}

/* kosongkan kotak */
function clearQueue() {
  if (state.busy) { toast('Tunggu proses lain selesai', 'warn'); return; }
  if (state.batch.some(b => b.status === 'working')) { toast('Ada file sedang diproses', 'warn'); return; }
  const n = state.batch.length;
  state.batch = [];
  renderQueue();
  toast(n ? `Kotak dikosongkan (${n} video dihapus)` : 'Kotak sudah kosong');
}

/* ---------- THUMBNAIL BERANTIRAN (satu file dalam satu waktu) ---------- */
let _thumbRunning = false;
function queueBatchThumb() {
  if (_thumbRunning) return;
  const it = state.batch.find(b => !b.thumb && b.status === 'wait' && !b._thumbErr);
  if (!it) return;
  _thumbRunning = true;
  makeThumb(it)
    .catch(() => { it._thumbErr = true; })
    .finally(() => { _thumbRunning = false; renderQueue(); queueBatchThumb(); });
}

async function makeThumb(it) {
  try {
    const [item] = await window.kinostra.readMediaFiles([it.path]);
    if (!item || item.error) return;
    it.size = item.size;
    const ext = (it.name.split('.').pop() || '').toLowerCase();
    if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(ext)) { it.thumb = 'audio'; return; }
    const blob = new Blob([item.data]);
    const url = URL.createObjectURL(blob);
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:2px;height:2px';
    v.src = url; document.body.appendChild(v);
    try {
      await new Promise((res, rej) => {
        const ok = () => { clean(); res(); }, bad = () => { clean(); rej(new Error('meta')); };
        const clean = () => { v.removeEventListener('loadedmetadata', ok); v.removeEventListener('error', bad); };
        v.addEventListener('loadedmetadata', ok); v.addEventListener('error', bad);
        setTimeout(() => { if (v.readyState >= 1) ok(); }, 5000);
      });
      it.dur = v.duration || 0;
      await new Promise(res => {
        const fin = () => { v.removeEventListener('seeked', fin); setTimeout(res, 30); };
        v.addEventListener('seeked', fin);
        v.currentTime = Math.min(1.2, (v.duration || 2) * 0.1);
        setTimeout(res, 2600);
      });
      const w = 104, h = Math.max(2, Math.round(w * (v.videoHeight || 9) / (v.videoWidth || 16)));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d');
      x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
      try { x.drawImage(v, 0, 0, w, h); } catch (e) { }
      it.thumb = c.toDataURL('image/jpeg', 0.72);
    } finally {
      try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { }
      try { v.remove(); } catch (e) { }
      URL.revokeObjectURL(url);
    }
  } catch (e) { /* file tak terbaca — biarkan placeholder */ }
}

/* ---------- PRATINJAU FILE DARI KOTAK KE LAYAR UTAMA ---------- */
async function previewQueueItem(it, i) {
  if (state.busy) { toast('Proses sedang berjalan — tunggu selesai', 'warn'); return; }
  state.batch.forEach((b, j) => b.sel = j === i);
  renderQueue();
  toast('Memuat pratinjau: ' + it.name);
  await loadFromPath(it.path);   /* menggantikan video yang sedang tampil */
}

/* ---------- RENDER KOTAK VIDEO (urutan atas ke bawah) ---------- */
function renderQueue() {
  const el = $('#queueList');
  if (!state.batch.length) {
    el.innerHTML = '<div class="empty">KOTAK KOSONG — SEMUA VIDEO YANG DIIMPOR MUNCUL DI SINI</div>';
  } else {
    el.innerHTML = '';
    state.batch.forEach((it, i) => {
      const stcls = it.status === 'done' ? 'done' : it.status === 'err' ? 'err' : it.status === 'working' ? 'working' : '';
      const r = document.createElement('div');
      r.className = 'qrow ' + stcls + (it.sel ? ' sel' : '');
      const thumbHtml = it.thumb === 'audio'
        ? '<span class="qthumb">♪</span>'
        : it.thumb
          ? `<img class="qthumb" src="${it.thumb}" alt="">`
          : '<span class="qthumb">▶</span>';
      const st = it.status === 'wait' ? (it.dur ? fmtT(it.dur) + ' · MENUNGGU' : 'MENUNGGU')
        : it.status === 'working' ? 'DIPROSES…'
        : it.status === 'done' ? `SELESAI · ${it.msg}`
        : `GAGAL · ${it.msg}`;
      const viaTxt = it.via === 'impor' ? 'IMPOR' : it.via === 'drop' ? 'DRAG-DROP' : 'BATCH';
      r.innerHTML = `<span class="qno">${String(i + 1).padStart(2, '0')}</span>${thumbHtml}
        <span class="qinfo"><span class="qname" title="${it.path}">${it.name}</span>
        <span class="qmeta">${viaTxt} · ${st}</span></span>`;
      const btns = document.createElement('span'); btns.className = 'qbtns';
      const mk = (txt, title, fn, hide) => {
        if (hide) return;
        const b = document.createElement('button');
        b.textContent = txt; b.title = title;
        b.onclick = ev => { ev.stopPropagation(); fn(); };
        btns.appendChild(b);
      };
      mk('▶', 'Tonton di preview', () => previewQueueItem(it, i));
      mk('↑', 'Naikkan urutan', () => moveQueueItem(i, -1), i === 0);
      mk('↓', 'Turunkan urutan', () => moveQueueItem(i, 1), i === state.batch.length - 1);
      mk('×', 'Hapus dari kotak', () => {
        if (it.status === 'working') { toast('File sedang diproses', 'warn'); return; }
        state.batch.splice(i, 1); renderQueue();
      });
      r.appendChild(btns);
      r.onclick = () => previewQueueItem(it, i);
      el.appendChild(r);
    });
  }
  const n = state.batch.length, done = state.batch.filter(b => b.status === 'done').length;
  $('#qStat').textContent = `${n} video dalam kotak · ${done} selesai · klik baris untuk menonton`;
  $('#batchStat').textContent = `${n} file dalam kotak · ${done} selesai`;
}
/* alias kompatibilitas */
const renderBatchList = renderQueue;

/* ---------- BATCH: proses isi kotak berurutan dari atas ---------- */
async function runBatch() {
  if (!state.batch.length) { toast('Kotak kosong — tambah video dulu', 'warn'); return; }
  if (state.busy) { toast('Tunggu proses lain selesai', 'warn'); return; }
  const pending = state.batch.filter(b => b.status !== 'done');
  if (!pending.length) { toast('Semua video dalam kotak sudah selesai', 'ok'); return; }
  const dir = await window.kinostra.pickOutputDir(_lastOutDir || undefined);
  if (!dir) return;
  _lastOutDir = dir;

  state.busy = true; state.abort = false;
  const reuseMusic = !!state.music.buffer;
  const total = pending.length;
  let ok = 0, fail = 0;
  try {
    for (const it of pending) {
      if (state.abort) break;
      it.status = 'working'; it.msg = ''; it.sel = true;
      state.batch.forEach(b => { if (b !== it) b.sel = false; });
      renderQueue();
      showModal({ title: `BATCH ${(ok + fail + 1).toString().padStart(2, '0')} / ${total}`,
        sub: `Memuat ${it.name}…`, cancel: true, onCancel() { state.abort = true; } });
      setProg(0.02);
      try {
        /* --- muat file dari disk (langsung tampil di preview utama) --- */
        const [item] = await window.kinostra.readMediaFiles([it.path]);
        if (!item || item.error) throw new Error(item && item.error || 'gagal baca file');
        it.size = item.size;
        const blob = new Blob([item.data]); blob.name = it.name;
        await loadFileBlob(blob, true);   /* force: abaikan guard busy */
        if (!state.file) throw new Error('media tidak bisa diputar engine');
        setSub(`Media siap · ${fmtT(state.duration)} · ${segmentsCount()} part`);

        /* --- skor musik dirender ulang untuk durasi file ini --- */
        if (reuseMusic) {
          setSub('Menyusun ulang skor musik…');
          await composeMusic(false, true);
        }

        /* --- render semua part (paralel via mesin TURBO) --- */
        const results = await exportPartsToDir(dir, {
          title(seg, segs) {
            showModal({ title: `BATCH ${it.name.slice(0, 26)} · PART ${String(seg.i + 1).padStart(2, '0')}/${String(segs.length).padStart(2, '0')}`,
              sub: 'Rendering lokal — bisa dibatalkan', cancel: true, onCancel() { state.abort = true; } });
          },
          prog: p => setProg(p),
          sub: s => setSub(s)
        });
        it.status = 'done'; it.msg = `${results.length} part`;
        ok++;
      } catch (err) {
        if (state.abort || String(err.message || err).includes('batal')) { it.status = 'wait'; it.msg = ''; break; }
        console.error(err);
        it.status = 'err'; it.msg = (err.message || err).slice(0, 40); fail++;
      }
      it.sel = false;
      renderQueue();
    }
    hideModal();
    if (state.abort) toast('Batch dihentikan', 'warn');
    else toast(`Batch selesai — ${ok} berhasil${fail ? `, ${fail} gagal` : ''}`, fail ? 'warn' : 'ok');
  } finally {
    state.busy = false;
    renderQueue();
  }
}
