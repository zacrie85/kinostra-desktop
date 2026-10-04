/* ================================================================
   KINOSTRA DESKTOP — batch.js
   UPGRADE: antrian batch — banyak video diproses berurutan
   memakai setelan saat ini (rasio, split, judul, efek, musik…)
   ================================================================ */
'use strict';

function addBatchPath(p) {
  if (!p) return;
  if (state.batch.some(b => b.path === p)) return;
  state.batch.push({ path: p, name: p.split(/[\\/]/).pop(), size: 0, status: 'wait', msg: '' });
  renderBatchList();
}
function addBatchPaths(paths) { (paths || []).forEach(addBatchPath); }

function renderBatchList() {
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
      el.appendChild(r);
    });
  }
  const n = state.batch.length, done = state.batch.filter(b => b.status === 'done').length;
  $('#batchStat').textContent = `${n} file dalam antrian · ${done} selesai`;
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
      it.status = 'working'; it.msg = ''; renderBatchList();
      showModal({ title: `BATCH ${(ok + fail + 1).toString().padStart(2, '0')} / ${total}`,
        sub: `Memuat ${it.name}…`, cancel: true, onCancel() { state.abort = true; } });
      setProg(0.02);
      try {
        /* --- muat file dari disk --- */
        const [item] = await window.kinostra.readMediaFiles([it.path]);
        if (!item || item.error) throw new Error(item && item.error || 'gagal baca file');
        it.size = item.size;
        const blob = new Blob([item.data]); blob.name = it.name;
        await loadFileBlob(blob, true);   // force: abaikan guard busy
        if (!state.file) throw new Error('media tidak bisa diputar engine');
        setSub(`Media siap · ${fmtT(state.duration)} · ${segmentsCount()} part`);

        /* --- skor musik dirender ulang untuk durasi file ini --- */
        if (reuseMusic) {
          setSub('Menyusun ulang skor musik…');
          await composeMusic(false, true);
          state.music.buffer && (state.music.gain = state.music.gain); // biarkan setelan user
        }

        /* --- render semua part --- */
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
