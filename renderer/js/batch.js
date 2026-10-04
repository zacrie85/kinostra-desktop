/* ================================================================
   KINOSTRA DESKTOP — batch.js (v2.1)
   Antrian batch — banyak video diproses berurutan memakai setelan
   saat ini + KOTAK VIDEO bergambar (thumbnail):
   - klik kotak → video dimuat ke preview utama (menggantikan yang aktif)
   - saat batch jalan, video yang diproses otomatis tampil di preview
   ================================================================ */
'use strict';

function addBatchPath(p) {
  if (!p) return;
  if (state.batch.some(b => b.path === p)) return;
  state.batch.push({ path: p, name: p.split(/[\\/]/).pop(), size: 0, status: 'wait', msg: '', thumb: null, dur: 0, sel: false });
  renderBatchList();
  queueBatchThumb();
}
function addBatchPaths(paths) { (paths || []).forEach(addBatchPath); }

/* ---------- v2.1: THUMBNAIL BERANTIRAN (satu file dalam satu waktu) ---------- */
let _thumbRunning = false;
function queueBatchThumb() {
  if (_thumbRunning) return;
  const it = state.batch.find(b => !b.thumb && b.status === 'wait' && !b._thumbErr);
  if (!it) return;
  _thumbRunning = true;
  makeThumb(it)
    .catch(() => { it._thumbErr = true; })
    .finally(() => { _thumbRunning = false; renderBatchList(); queueBatchThumb(); });
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
      const w = 192, h = Math.max(2, Math.round(w * (v.videoHeight || 9) / (v.videoWidth || 16)));
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

/* ---------- v2.1: PREVIEW FILE BATCH KE LAYAR UTAMA ---------- */
async function previewBatchItem(it, i) {
  if (state.busy) { toast('Batch sedang berjalan — tunggu selesai', 'warn'); return; }
  state.batch.forEach((b, j) => b.sel = j === i);
  renderBatchList();
  toast('Memuat pratinjau: ' + it.name);
  await loadFromPath(it.path);   /* menggantikan video yang sedang tampil */
}

/* ---------- DAFTAR & GRID ---------- */
function renderBatchList() {
  /* grid kotak video */
  const g = $('#batchGrid');
  if (!state.batch.length) g.innerHTML = '<div class="empty">ANTRIAN KOSONG</div>';
  else {
    g.innerHTML = '';
    state.batch.forEach((it, i) => {
      const c = document.createElement('div');
      c.className = 'bcell ' + (it.status === 'done' ? 'done' : it.status === 'err' ? 'err' : it.status === 'working' ? 'working' : '') + (it.sel ? ' sel' : '');
      const thumbHtml = it.thumb === 'audio'
        ? '<span class="bthumb ph">♪</span>'
        : it.thumb
          ? `<img class="bthumb" src="${it.thumb}" alt="">`
          : '<span class="bthumb ph">▮▶</span>';
      const stat = it.status === 'wait' ? (it.dur ? fmtT(it.dur) + ' · MENUNGGU' : 'MENUNGGU')
        : it.status === 'working' ? 'DIPROSES…'
        : it.status === 'done' ? `SELESAI · ${it.msg}`
        : `GAGAL · ${it.msg}`;
      c.innerHTML = `${thumbHtml}<span class="bname" title="${it.path}">${it.name}</span><span class="bstat">${stat}</span>`;
      const del = document.createElement('button'); del.className = 'bdel'; del.textContent = '×'; del.title = 'Hapus dari antrian';
      del.onclick = ev => {
        ev.stopPropagation();
        if (it.status === 'working') { toast('File sedang diproses', 'warn'); return; }
        state.batch.splice(i, 1); renderBatchList();
      };
      c.appendChild(del);
      c.onclick = () => previewBatchItem(it, i);
      g.appendChild(c);
    });
  }
  /* daftar ringkas baris */
  const el = $('#batchList');
  if (!state.batch.length) { el.innerHTML = '<div class="empty">ANTRIAN KOSONG</div>'; }
  else {
    el.innerHTML = '';
    state.batch.forEach((it, i) => {
      const r = document.createElement('div');
      r.className = 'brow ' + (it.status === 'done' ? 'done' : it.status === 'err' ? 'err' : it.status === 'working' ? 'working' : '');
      const stat = it.status === 'wait' ? 'MENUNGGU' : it.status === 'working' ? 'DIPROSES…' : it.status === 'done' ? `SELESAI · ${it.msg}` : `GAGAL · ${it.msg}`;
      r.innerHTML = `<span class="bn" title="${it.path}">${it.name}</span><span class="bs">${stat}</span>`;
      const del = document.createElement('button'); del.className = 'bdel'; del.textContent = '×';
      del.onclick = () => { if (it.status === 'working') { toast('File sedang diproses', 'warn'); return; } state.batch.splice(i, 1); renderBatchList(); };
      r.appendChild(del);
      r.onclick = e => { if (e.target !== del) previewBatchItem(it, i); };
      el.appendChild(r);
    });
  }
  const n = state.batch.length, done = state.batch.filter(b => b.status === 'done').length;
  $('#batchStat').textContent = `${n} file dalam antrian · ${done} selesai · klik kotak untuk menonton`;
}

async function runBatch() {
  if (!state.batch.length) { toast('Antrian kosong — tambah file dulu', 'warn'); return; }
  if (state.busy) { toast('Tunggu proses lain selesai', 'warn'); return; }
  const pending = state.batch.filter(b => b.status !== 'done');
  if (!pending.length) { toast('Semua antrian sudah selesai', 'ok'); return; }
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
      renderBatchList();
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

        /* --- render semua part (paralel via mesin v2.1) --- */
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
      renderBatchList();
    }
    hideModal();
    if (state.abort) toast('Batch dihentikan', 'warn');
    else toast(`Batch selesai — ${ok} berhasil${fail ? `, ${fail} gagal` : ''}`, fail ? 'warn' : 'ok');
  } finally {
    state.busy = false;
    renderBatchList();
  }
}
