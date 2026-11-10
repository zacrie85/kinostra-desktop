/* ================================================================
   KINOSTRA DESKTOP — demux.js (v3.9 MODE KILAT)
   Demuxer MP4 minimalis + pipa dekode WebCodecs.
   ================================================================
   Kenapa ada berkas ini? Jalur lama (TURBO) mengambil frame sambil
   VIDEO DIPUTAR (capture-playback 1.5–3×) → kecepatan ekspor
   dibatasi waktu nyata. MODE KILAT memotong hambatan itu:
   sampel H.264 diambil LANGSUNG dari wadah MP4 (parsing box
   moov/stbl), didekode oleh VideoDecoder (GPU bila ada), lalu
   tiap frame disusun drawComposition dan di-encode — TANPA
   memutar video sama sekali. Kecepatan = kecepatan dekoder +
   enkoder (ratusan fps), bukan lagi kecepatan pemutaran.

   Cakupan aman:
   - Hanya MP4/MOV berbasis avc1/avc3 (H.264 dgn avcC).
   - Sumber TANPA B-frame: PTS = DTS → streaming decode→encode langsung.
   - Sumber BER-B-frame DIDUKUNG: penyangga pengurut kecil (window B +
     antrean dekode) menjamin frame keluar terurut PTS — RAM tetap aman.
   - Rotasi metadata (tkhd matrix 90/180/270) dikompensasi saat blit.
   - Gagal dalam bentuk apa pun → pemanggil jatuh ke jalur TURBO.

   Antarmuka:
     probeKilat(fileLike)      → { info, decCfg } / null
     createKilatRender(probe)  → { cv, blit, range(a,b), close() }
       range(a,b): iterator async {pts, frame} berurutan PTS ↑
       (frame VideoFrame mentah; cv = kanvas tampilan siap-rotasi)
   ================================================================ */
'use strict';

const _du8 = (b, o) => b[o];
const _du16 = (b, o) => (b[o] << 8) | b[o + 1];
const _du32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
function _du64(b, o) { return _du32(b, o) * 4294967296 + _du32(b, o + 4); }
const _dtag = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
const _ds32 = (b, o) => (_du32(b, o) | 0);

/* ---------- pembaca byte dari File / kfile:// (dgn jendela cache 4 MB) ---------- */
function kilatReaderFor(f) {
  const raw = (f && f.virtual)
    ? async (off, len) => new Uint8Array(await (await fetch(f.kurl, { headers: { Range: `bytes=${off}-${off + len - 1}` } })).arrayBuffer())
    : async (off, len) => new Uint8Array(await f.slice(off, off + len).arrayBuffer());
  const WIN = 4 * 1024 * 1024;
  let bLo = -1, buf = null;
  return async (off, len) => {
    if (buf && off >= bLo && off + len <= bLo + buf.length) return buf.subarray(off - bLo, off - bLo + len);
    bLo = off; buf = await raw(off, Math.max(len, WIN));
    return buf.subarray(0, Math.min(len, buf.length));
  };
}

/* ---------- telusur box (tingkat atas & anak container) ---------- */
async function childBoxes(rd, bx) {
  const out = []; let off = bx.off; const end = bx.off + bx.size;
  while (off + 8 <= end) {
    const h = await rd(off, 16);
    let sz = _du32(h, 0); const tag = _dtag(h, 4);
    let hdr = 8;
    if (sz === 1) { sz = _du64(h, 8); hdr = 16; }
    if (sz < hdr || off + sz > end + 8) break;
    out.push({ off: off + hdr, size: sz - hdr, tag });
    off += sz;
  }
  return out;
}

/* ---------- PROBE WADAH ---------- */
/* Mengembalikan info video track avc1/avc3 pertama, atau null bila wadah
   tidak layak MODE KILAT (bukan MP4, codec lain, tabel rusak, dst). */
async function mp4Probe(rd, fileSize) {
  try {
    if (!fileSize || fileSize < 2048) return null;
    const tops = await childBoxes(rd, { off: 0, size: fileSize, tag: 'root' });
    const moov = tops.find(b => b.tag === 'moov');
    if (!moov) return null;
    const moovKids = await childBoxes(rd, moov);
    for (const trak of moovKids.filter(b => b.tag === 'trak')) {
      const info = await parseTrak(rd, trak);
      if (info) return info;
    }
    return null;
  } catch (e) {
    console.warn('kilat: probe wadah gagal —', e && e.message);
    return null;
  }
}

async function parseTrak(rd, trak) {
  const kids = await childBoxes(rd, trak);
  const mdia = kids.find(b => b.tag === 'mdia');
  if (!mdia) return null;
  const mk = await childBoxes(rd, mdia);
  const hdlr = mk.find(b => b.tag === 'hdlr');
  if (hdlr) {
    const h = await rd(hdlr.off, 12);
    if (_dtag(h, 8) !== 'vide') return null;   /* hanya track video */
  }
  const mdhd = mk.find(b => b.tag === 'mdhd');
  if (!mdhd) return null;
  const mh = await rd(mdhd.off, 32);
  const ver = _du8(mh, 0);
  const timescale = _du32(mh, ver === 1 ? 20 : 12);
  const durTs = ver === 1 ? _du64(mh, 24) : _du32(mh, 16);
  const minf = mk.find(b => b.tag === 'minf');
  if (!minf) return null;
  const stbl = (await childBoxes(rd, minf)).find(b => b.tag === 'stbl');
  if (!stbl) return null;
  const sk = await childBoxes(rd, stbl);
  const stsd = sk.find(b => b.tag === 'stsd');
  const stts = sk.find(b => b.tag === 'stts');
  const stsc = sk.find(b => b.tag === 'stsc');
  const stsz = sk.find(b => b.tag === 'stsz');
  const stco = sk.find(b => b.tag === 'stco');
  const co64 = sk.find(b => b.tag === 'co64');
  const ctts = sk.find(b => b.tag === 'ctts');
  const stss = sk.find(b => b.tag === 'stss');
  if (!stsd || !stts || !stsc || !stsz || !(stco || co64)) return null;

  /* --- stsd → avc1/avc3 + avcC --- */
  const sd = await rd(stsd.off, 8);
  if (_du32(sd, 4) < 1) return null;           /* entry_count */
  const eo = stsd.off + 8;                      /* entri pertama */
  const eh = await rd(eo, 8);
  const etag = _dtag(eh, 4);
  if (etag !== 'avc1' && etag !== 'avc3') return null;
  /* VisualSampleEntry: 8 header + 6 reserved + 2 dri + 16 reserved +
     2 w + 2 h + 4 hres + 4 vres + 4 reserved + 2 fcount + 32 cname +
     2 depth + 2 predef = 78 → box anak menyusul */
  const body = await rd(eo + 8, 78);
  const W = _du16(body, 24), H = _du16(body, 26);
  if (!W || !H) return null;
  const kidsOff = eo + 8 + 78;
  const scan = await rd(kidsOff, Math.min(1024, stsd.off + stsd.size - kidsOff));
  let avcC = null, o = 0;
  while (o + 8 <= scan.length) {
    const sz = _du32(scan, o), tg = _dtag(scan, o + 4);
    if (sz < 8) break;
    if (tg === 'avcC') { avcC = scan.slice(o + 8, Math.min(o + sz, scan.length)); break; }
    o += sz;
  }
  if (!avcC || avcC.length < 7) return null;
  const hex = n => n.toString(16).toUpperCase().padStart(2, '0');
  const codecStr = `avc1.${hex(avcC[1])}${hex(avcC[2])}${hex(avcC[3])}`;

  /* --- tkhd → rotasi (matrix 16.16) --- */
  /* matrix offset dari awal box: v0 = 4+16+8+8 = 36; v1 = 4+32+8+8 = 52 */
  let rot = 0;
  const tkhd = kids.find(b => b.tag === 'tkhd');
  if (tkhd) {
    const th = await rd(tkhd.off, 4);
    const tv = _du8(th, 0);
    const mOff = tv === 1 ? 52 : 36;
    const mtx = await rd(tkhd.off + mOff, 36);
    const a = _ds32(mtx, 0), b = _ds32(mtx, 4), c = _ds32(mtx, 8), d = _ds32(mtx, 12);
    if (b === 0x10000 && c === -0x10000) rot = 90;
    else if (b === -0x10000 && c === 0x10000) rot = 270;
    else if (a === -0x10000 && d === -0x10000) rot = 180;
  }
  const hasRot = rot === 90 || rot === 270;
  return {
    kind: 'avc1', codecStr, avcC, timescale, durTs,
    codedW: W, codedH: H,
    dispW: hasRot ? H : W, dispH: hasRot ? W : H, rot,
    stbl: { stsd, stts, stsc, stsz, stco: stco || co64, co64: !!co64, ctts, stss }
  };
}

/* ---------- TABEL SAMPEL ---------- */
/* Larik per-sampel: offset, size, dts, pts, keyframe.
   Film 60 mnt @30fps ≈ 108rb sampel × 4 larik = beberapa MB — aman. */
async function buildSampleTable(rd, info) {
  const S = info.stbl, nT = info.timescale;
  const GAGAL = m => { throw new Error('tabel sampel: ' + m); };
  /* stsz: ver/flags(4) element_size(4) count(4) sizes... */
  const zs = await rd(S.stsz.off, 12);
  if ((_du32(zs, 0) >>> 24) !== 0) GAGAL('stsz versi tidak didukung');
  const zDef = _du32(zs, 4), n = _du32(zs, 8);
  if (zDef !== 0 || n < 1) GAGAL(`stsz aneh (def=${zDef}, n=${n})`);
  const sizes = new Uint32Array(n);
  {
    let have = 0, off = S.stsz.off + 12;
    while (have < n) {
      const want = Math.min(n - have, 1 << 20);
      const b = await rd(off, want * 4);
      for (let i = 0; i < want; i++) sizes[have + i] = _du32(b, i * 4);
      have += want; off += want * 4;
    }
  }
  /* stco/co64 → offset chunk */
  const cs = await rd(S.stco.off, 8);
  const nChk = _du32(cs, 4);
  if (nChk < 1) GAGAL('stco kosong');
  const chunks = new Float64Array(nChk);
  {
    const is64 = !!S.co64;
    let have = 0, off = S.stco.off + 8;
    while (have < nChk) {
      const want = Math.min(nChk - have, 1 << 19);
      const b = await rd(off, want * (is64 ? 8 : 4));
      for (let i = 0; i < want; i++) chunks[have + i] = is64 ? _du64(b, i * 8) : _du32(b, i * 4);
      have += want; off += want * (is64 ? 8 : 4);
    }
  }
  /* stsc → sampel per chunk */
  const sc = await rd(S.stsc.off, 8);
  const nSc = _du32(sc, 4);
  const runs = [];
  for (let i = 0; i < nSc; i++) {
    const b = await rd(S.stsc.off + 8 + i * 12, 12);
    runs.push([_du32(b, 0), _du32(b, 4), _du32(b, 8)]);   /* first_chunk, spc, sdi */
  }
  if (!runs.length) GAGAL('stsc kosong');
  /* stts → dts kumulatif */
  const tt = await rd(S.stts.off, 8);
  const nTt = _du32(tt, 4);
  const dts = new Float64Array(n);
  {
    let si = 0, t = 0;
    for (let i = 0; i < nTt && si < n; i++) {
      const b = await rd(S.stts.off + 8 + i * 8, 8);
      const cnt = _du32(b, 0), dt = _du32(b, 4);
      for (let k = 0; k < cnt && si < n; k++) { dts[si++] = t; t += dt; }
    }
    if (si < n) GAGAL(`stts kurang (${si}/${n})`);
  }
  /* ctts → pts = dts + offset komposisi; minOff = offset terkecil (≤0 utk
     sumber ber-B-frame) — dipakai menentukan kapan frame AMAN dikeluarkan
     dalam urutan tampil (reorder penyangga kecil di range()) */
  let hasB = false, minOff = 0;
  const pts = new Float64Array(n);
  if (S.ctts) {
    const ct = await rd(S.ctts.off, 8);
    const cv = _du8(ct, 0), nCt = _du32(ct, 4);
    let si = 0;
    for (let i = 0; i < nCt && si < n; i++) {
      const b = await rd(S.ctts.off + 8 + i * 8, 8);
      const cnt = _du32(b, 0);
      const d = cv === 0 ? _ds32(b, 4) : (_du32(b, 4) | 0);
      if (d !== 0) hasB = true;
      if (d < minOff) minOff = d;
      for (let k = 0; k < cnt && si < n; k++) { pts[si] = dts[si] + d; si++; }
    }
    for (; si < n; si++) pts[si] = dts[si];
  } else pts.set(dts);
  /* stss → keyframe (tanpa stss: semua dianggap keyframe) */
  const key = new Uint8Array(n); key.fill(1);
  if (S.stss) {
    key.fill(0);
    const ss = await rd(S.stss.off, 8);
    const nSs = _du32(ss, 4);
    for (let i = 0; i < nSs; i++) {
      const b = await rd(S.stss.off + 8 + i * 4, 4);
      const k = _du32(b, 0);
      if (k >= 1 && k <= n) key[k - 1] = 1;
    }
  }
  /* offset per sampel dari stsc × chunks */
  const off = new Float64Array(n);
  {
    let s = 0;
    for (let c = 0; c < nChk && s < n; c++) {
      while (runs.length > 1 && c + 1 >= runs[1][0]) runs.shift();
      const spc = runs[0][1];
      let p = chunks[c];
      for (let k = 0; k < spc && s < n; k++) { off[s] = p; p += sizes[s]; s++; }
    }
    if (s < n) GAGAL(`offset kurang (${s}/${n} — stsc/stco tak konsisten)`);
  }
  /* NORMALISASI PTS — beberapa file (x264 dgn B-frame) menulis sampel
     pertama dgn pts NEGATIF (−1..2 frame). Elemen <video> menormalkan
     ini otomatis, tapi demux mentah memakainya apa adanya → stempel
     waktu output mundur → MP4 rusak. Geser seluruh garis waktu agar
     frame tampil pertama tepat di 0. (dts tak perlu digeser — timestamp
     chunk = indeks sampel, bukan waktu.) */
  let shift = 0;
  for (let i = 0; i < Math.min(n, 64); i++) if (pts[i] < shift) shift = pts[i];
  if (shift < 0) for (let i = 0; i < n; i++) pts[i] -= shift;
  /* durasi kasar dari dts terakhir + delta terakhir (cukup utk info) */
  const lastDt = n > 1 ? (dts[n - 1] - dts[n - 2]) : 1;
  const dur = n ? (dts[n - 1] + lastDt) / nT : 0;
  return { n, sizes, off, dts, pts, key, hasB, minOff, timescale: nT, dur, ptsShift: -shift };
}

/* ---------- RENDER KILAT ---------- */
/* probe = { info, decCfg } dari probeKilat(). */
async function createKilatRender(probe) {
  const rd = kilatReaderFor(state.file);
  const tbl = await buildSampleTable(rd, probe.info);
  if (!tbl) throw new Error('tabel sampel tidak bisa dibaca');
  let decErr = null;
  /* PENTING: Chromium mengikat callback output PADA SAAT KONSTRUKSI —
     reassign dec.output sesudahnya TIDAK berlaku. Karena itu satu
     callback stabil dipasang sejak awal, meneruskan frame ke `sink`
     yang bisa diganti tiap sesi range(). */
  let sink = null;
  const dec = new VideoDecoder({
    output: fr => { if (sink) sink(fr); else { try { fr.close(); } catch (e) { } } },
    error: e => { decErr = decErr || (e && e.message) || String(e); }
  });
  dec.configure(probe.decCfg);
  const dispW = probe.info.dispW, dispH = probe.info.dispH;
  const cv = document.createElement('canvas');
  cv.width = dispW; cv.height = dispH;
  const cx = cv.getContext('2d', { alpha: false });
  cv.videoWidth = dispW; cv.videoHeight = dispH;      /* ekspando — serasi compSrc/drawComposition */
  const rot = probe.info.rot || 0;

  function blit(fr) {
    const w = fr.displayWidth || probe.info.codedW, h = fr.displayHeight || probe.info.codedH;
    if (rot === 90 || rot === 270) {
      cx.save(); cx.translate(cv.width / 2, cv.height / 2); cx.rotate(rot * Math.PI / 180);
      cx.drawImage(fr, -w / 2, -h / 2, w, h); cx.restore();
    } else if (rot === 180) {
      cx.save(); cx.translate(cv.width / 2, cv.height / 2); cx.rotate(Math.PI);
      cx.drawImage(fr, -w / 2, -h / 2, w, h); cx.restore();
    } else cx.drawImage(fr, 0, 0, cv.width, cv.height);
  }

  /* indeks mulai: cari lewat DTS (selalu monoton walau ada B-frame),
     ambil sedikit lebih awal, lalu mundur ke keyframe terdekat */
  function idxAt(t) {
    const ts = t * tbl.timescale + (tbl.minOff || 0);
    let lo = 0, hi = tbl.n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (tbl.dts[m] < ts) lo = m + 1; else hi = m; }
    if (lo > 0 && lo < tbl.n && tbl.dts[lo] - ts > ts - tbl.dts[lo - 1]) lo--;
    while (lo > 0 && !tbl.key[lo]) lo--;
    return lo;
  }

  return {
    cv, blit,
    nTotal: tbl.n,
    dur: tbl.dur,
    /* iterator async frame berurutan PTS ↑ dalam rentang [a, b) detik.
       Sumber ber-B-frame: frame keluar decoder dalam urutan DECODE (dts);
       penyangga kecil menahan frame sampai pasti tak ada pendahulu yang
       belum didekode (pts ≤ dts terakhir diberi-makan + minOff), lalu
       dikeluarkan terurut pts — RAM aman (≈ window B + antrean dekode). */
    async * range(a, b) {
      const pool = [];
      let lastFedDts = -Infinity;
      const minOff = tbl.minOff || 0;
      sink = fr => { pool.push(fr); };   /* timestamp chunk = indeks×1000 µs */
      const idxOf = fr => Math.round(fr.timestamp / 1000);
      function* drain() {
        if (!pool.length) return;
        const limit = lastFedDts + minOff;
        const ready = [];
        for (let k = pool.length - 1; k >= 0; k--) {
          if (tbl.pts[idxOf(pool[k])] <= limit) ready.push(pool.splice(k, 1)[0]);
        }
        if (!ready.length) return;
        ready.sort((x, y) => tbl.pts[idxOf(x)] - tbl.pts[idxOf(y)]);
        for (const fr of ready) {
          const t = tbl.pts[idxOf(fr)] / tbl.timescale;
          /* toleransi ketat 5 ms: bingkai SEBELUM awal part milik part
             sebelumnya — memasukkannya menggeser ts konten mundur sampai
             bertabrakan dgn frame cover terakhir (v3.9 perbaikan) */
          if (t >= a - 0.005 && t < b - 0.004) yield { pts: t, frame: fr };
          else { try { fr.close(); } catch (e) { } }
        }
      }
      try {
        let i = idxAt(a);
        while (true) {
          if (state.abort) throw new Error('Dibatalkan');
          if (state.exportFatal) throw state.exportFatal;
          if (decErr) throw new Error('decoder: ' + decErr);
          if (i < tbl.n) {
            /* beri makan decoder secukupnya — antrean dijaga agar RAM aman */
            while (dec.decodeQueueSize > 24) {
              await new Promise(r => setTimeout(r, 2));
              if (decErr) throw new Error('decoder: ' + decErr);
              if (state.abort) throw new Error('Dibatalkan');
            }
            const k = i++;
            const data = await rd(tbl.off[k], tbl.sizes[k]);
            dec.decode(new EncodedVideoChunk({
              type: tbl.key[k] ? 'key' : 'delta',
              timestamp: k * 1000,
              data
            }));
            lastFedDts = tbl.dts[k];
          } else {
            await dec.flush().catch(() => { });
            lastFedDts = Infinity;   /* semua sampel sudah diberi makan → pool boleh kosong semua */
          }
          yield* drain();
          if (i >= tbl.n && pool.length === 0) break;
        }
      } finally {
        try { if (dec.state !== 'closed') dec.close(); } catch (e) { }
      }
    },
    async close() { sink = null; try { if (dec.state !== 'closed') dec.close(); } catch (e) { } }
  };
}

/* ---------- PROBE SIAP PAKAI dari state.file ---------- */
async function probeKilat(fileLike) {
  try {
    if (!('VideoDecoder' in window)) return null;
    const f = fileLike;
    if (!f) return null;
    if (f.virtual && !f.kurl) return null;
    const size = f.size || 0;
    if (!size) return null;
    const rd = kilatReaderFor(f);
    const info = await mp4Probe(rd, size);
    if (!info) return null;
    const desc = new Uint8Array(info.avcC);
    let decCfg = null;
    for (const acc of ['prefer-hardware', 'no-preference']) {
      try {
        const cfg = { codec: info.codecStr, codedWidth: info.codedW, codedHeight: info.codedH, description: desc, hardwareAcceleration: acc };
        const s = await VideoDecoder.isConfigSupported(cfg);
        if (s.supported) { decCfg = cfg; break; }
      } catch (e) { }
    }
    if (!decCfg) return null;
    return { info, decCfg };
  } catch (e) {
    console.warn('kilat: probe gagal —', e && e.message);
    return null;
  }
}
