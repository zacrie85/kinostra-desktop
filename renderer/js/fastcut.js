/* ================================================================
   KINOSTRA DESKTOP — fastcut.js  (v3.9 POTONG LANGSUNG)
   ================================================================
   Ekspor & split TANPA re-encode: video sumber dibaca level kotak
   (box) MP4, tabel sampel (stts/stsc/stsz/stco/stss/ctts) dipangkas
   per rentang part, byte sampel DISALIN UTUH ke file baru — kualitas
   piksel = 100% sumber (resolusi asli, tidak disentuh encoder).

   Kecepatan: sebatas kecepatan disk (±10–60× lebih cepat dari render)
   karena TIDAK ada decode/encode — hanya salin byte + tulis header.

   Aturan main (agar hasil 100% bisa diputar):
   - Batas awal part digeser MUNDUR ke keyframe terdekat (wajib H.264).
   - Batas akhir part = keyframe pertama SETELAH batas → isi part utuh.
   - Audio AAC ikut rentang waktu yang sama (pemenggalan per sampel).
   - HANYA dipakai bila SEMUA efek teks/cover/efek visual MATI — bila
     ada yang aktif, exporter otomatis jatuh ke RENDER PENUH (membakar
     teks memang butuh re-encode).

   Struktur file hasil: [ftyp][moov(header baru)][mdat(salinan byte)]
   — moov di depan = fastStart, langsung siap diputar/upload.
   I/O generik (read(start,len) async + writer) → bisa diuji di Node.
   ================================================================ */
'use strict';

/* ---------- util byte ---------- */
const fcClamp = (v, a, b) => Math.max(a, Math.min(b, v));   /* mandiri: tak bergantung core.js */
function fcView(buf) { return new DataView(buf.buffer || buf, buf.byteOffset || 0, buf.byteLength); }
function fcType(dv, o) { return String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3)); }
function fcBox(type, ...parts) {
  let len = 8; for (const p of parts) len += p.length;
  const b = new Uint8Array(len), dv = fcView(b);
  dv.setUint32(0, len); b.set([...type].map(c => c.charCodeAt(0)), 4);
  let o = 8; for (const p of parts) { b.set(p, o); o += p.length; }
  return b;
}
function fcFull(type, version, flags, ...parts) {
  const vf = new Uint8Array(4); vf[0] = version;
  vf[1] = (flags >> 16) & 255; vf[2] = (flags >> 8) & 255; vf[3] = flags & 255;
  return fcBox(type, vf, ...parts);
}
const fcU16 = v => { const b = new Uint8Array(2); fcView(b).setUint16(0, v); return b; };
const fcU32 = v => { const b = new Uint8Array(4); fcView(b).setUint32(0, v >>> 0); return b; };
function fcU64(v) { const b = new Uint8Array(8), dv = fcView(b); dv.setUint32(0, Math.floor(v / 4294967296)); dv.setUint32(4, v >>> 0); return b; }
const fcCat = (...arrs) => {
  let n = 0; for (const a of arrs) n += a.length;
  const out = new Uint8Array(n); let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
};
/* RLE pasangan (count, value) — memampatkan tabel durasi/offset sampel */
function fcRle(arr, pick) {
  const out = [];
  for (let i = 0; i < arr.length;) {
    let j = i + 1;
    while (j < arr.length && pick(arr[j]) === pick(arr[i])) j++;
    out.push([j - i, pick(arr[i])]); i = j;
  }
  return out;
}
class FastCutUnsupported extends Error { constructor(m) { super(m); this.name = 'FastCutUnsupported'; } }

/* ---------- pejalan kotak MP4 ---------- */
function fcChildren(dv, off, end) {
  const out = [];
  let o = off;
  while (o + 8 <= end) {
    let size = dv.getUint32(o), hdr = 8;
    if (size === 1) { if (o + 16 > end) break; size = Number(dv.getBigUint64(o + 8)); hdr = 16; }
    else if (size === 0) size = end - o;
    if (size < hdr || o + size > end) break;
    out.push({ type: fcType(dv, o + 4), off: o, hdr, size });
    o += size;
  }
  return out;
}
function fcChild(dv, off, end, type) { return fcChildren(dv, off, end).find(b => b.type === type) || null; }
/* cari anak LANGSUNG dari kotak kontainer b (mulai di b.off+8 — lewati
   header kotak kontainer itu sendiri) */
function fcKid(dv, b, type) { return b ? fcChild(dv, b.off + 8, b.off + b.size, type) : null; }
/* batas aman: posisi akhir kotak b dalam DataView dv */
function stblLenGuard(dv, b) { return b.off + b.size; }

/* ---------- PARSER MP4 ----------
   read(start, len) → Promise<Uint8Array>; fileSize = ukuran berkas.
   Mengembalikan tabel sampel lengkap track video & audio pertama. */
async function fcParseMp4(read, fileSize) {
  /* 1) pindai kotak level atas (window bergeser, indeks absolut aman) */
  let moov = null, ftyp = null;
  {
    let pos = 0, win = null, base = 0;
    for (let guard = 0; guard < 4096 && pos + 8 <= fileSize; guard++) {
      if (!win || pos < base || pos + 16 > base + win.length) {
        base = pos; win = await read(pos, Math.min(262144, fileSize - pos));
        if (win.length < 8) break;
      }
      const dv = fcView(win), w = pos - base;
      let size = dv.getUint32(w), hdr = 8;
      if (size === 1) {
        if (w + 16 > win.length) { base = pos; win = await read(pos, Math.min(262144, fileSize - pos)); continue; }
        size = Number(dv.getBigUint64(w + 8)); hdr = 16;
      } else if (size === 0) size = fileSize - pos;
      if (size < hdr || pos + size > fileSize) throw new FastCutUnsupported('struktur MP4 tidak sah');
      const type = fcType(dv, w + 4);
      if (type === 'ftyp') ftyp = { off: pos, size };
      else if (type === 'moov') { moov = { off: pos, size }; break; }
      pos += size;
    }
  }
  if (!moov) throw new FastCutUnsupported('moov tidak ditemukan (bukan MP4 utuh)');
  if (moov.size > 160 * 1048576) throw new FastCutUnsupported('moov terlalu besar');
  /* 2) baca seluruh moov */
  const moovBuf = await read(moov.off, moov.size);
  const mdv = fcView(moovBuf), mEnd = moovBuf.length;
  const mvhdB = fcChild(mdv, 8, mEnd, 'mvhd');   /* anak moov mulai di +8 (header moov sendiri) */
  if (!mvhdB) throw new FastCutUnsupported('mvhd tidak ada');
  const mvVer = mdv.getUint8(mvhdB.off + 8);
  const mvTs = mdv.getUint32(mvhdB.off + (mvVer === 0 ? 20 : 28)) || 1000;
  const traks = [];
  for (const trak of fcChildren(mdv, 8, mEnd).filter(b => b.type === 'trak')) {
    const te = trak.off + trak.size;
    const tkhdB = fcKid(mdv, trak, 'tkhd');
    const mdiaB = fcKid(mdv, trak, 'mdia');
    if (!tkhdB || !mdiaB) continue;
    const hdlrB = fcKid(mdv, mdiaB, 'hdlr');
    const kind = hdlrB ? fcType(mdv, hdlrB.off + 8 + 8) : '?';   /* pre_defined(4)+handler(4) */
    if (kind !== 'vide' && kind !== 'soun') continue;
    const mdhdB = fcKid(mdv, mdiaB, 'mdhd');
    if (!mdhdB) continue;
    const mdVer = mdv.getUint8(mdhdB.off + 8);
    const ts = mdv.getUint32(mdhdB.off + (mdVer === 0 ? 20 : 28));
    if (!ts) continue;
    const minfB = fcKid(mdv, mdiaB, 'minf');
    const stblB = fcKid(mdv, minfB, 'stbl');
    if (!stblB) continue;
    const S = t => fcKid(mdv, stblB, t);
    const stsdB = S('stsd'), sttsB = S('stts'), stscB = S('stsc'), stszB = S('stsz');
    const stcoB = S('stco'), co64B = S('co64');
    if (!stsdB || !sttsB || !stscB || !stszB || (!stcoB && !co64B)) throw new FastCutUnsupported('tabel sampel tidak lengkap');
    if (mdv.getUint32(stsdB.off + 8 + 4) < 1) throw new FastCutUnsupported('stsd kosong');
    const fmt = fcType(mdv, stsdB.off + 20);   /* format entri pertama stsd */
    /* stts → delta dts per sampel */
    const nStts = mdv.getUint32(sttsB.off + 12);
    const deltas = new Float64Array(1 << 16);
    let nSamp = 0;
    for (let e = 0; e < nStts; e++) {
      const cnt = mdv.getUint32(sttsB.off + 16 + e * 8);
      const del = mdv.getUint32(sttsB.off + 16 + e * 8 + 4);
      if (nSamp + cnt > deltas.length) {
        const grown = new Float64Array(Math.max(deltas.length * 2, nSamp + cnt));
        grown.set(deltas); deltas = grown;
      }
      for (let k = 0; k < cnt; k++) deltas[nSamp++] = del;
      if (nSamp > 4e8) throw new FastCutUnsupported('jumlah sampel tidak wajar');
    }
    if (!nSamp) throw new FastCutUnsupported('stts kosong');
    const deltasF = deltas.subarray(0, nSamp);
    /* stsz → ukuran per sampel */
    const unif = mdv.getUint32(stszB.off + 12);
    const nStsz = mdv.getUint32(stszB.off + 16);
    if (nStsz && nStsz !== nSamp) throw new FastCutUnsupported('stsz/stts tidak cocok');
    const sizes = unif === 0 ? new Float64Array(nSamp) : null;
    if (sizes) { for (let i = 0; i < nSamp; i++) sizes[i] = mdv.getUint32(stszB.off + 20 + i * 4); }
    /* stsc + stco → offset byte per sampel */
    const nStsc = mdv.getUint32(stscB.off + 12);
    const rows = [];
    for (let e = 0; e < nStsc; e++) rows.push([
      mdv.getUint32(stscB.off + 16 + e * 12),
      mdv.getUint32(stscB.off + 16 + e * 12 + 4),
      mdv.getUint32(stscB.off + 16 + e * 12 + 8)]);
    if (rows.some(r => r[2] !== 1)) throw new FastCutUnsupported('stsd ganda per chunk — tidak didukung');
    const nChunks = mdv.getUint32((stcoB || co64B).off + 12);
    const chunkOff = new Float64Array(nChunks);
    for (let c = 0; c < nChunks; c++) {
      chunkOff[c] = stcoB ? mdv.getUint32(stcoB.off + 16 + c * 4) : Number(mdv.getBigUint64(co64B.off + 16 + c * 8));
    }
    const offs = new Float64Array(nSamp);
    {
      let s = 0;
      for (let c = 0; c < nChunks && s < nSamp; c++) {
        let row = rows[0];
        for (const r of rows) { if (r[0] <= c + 1) row = r; else break; }
        const spc = row[1];
        let bo = chunkOff[c];
        for (let k = 0; k < spc && s < nSamp; k++, s++) { offs[s] = bo; bo += unif === 0 ? sizes[s] : unif; }
      }
      if (s < nSamp) throw new FastCutUnsupported('tabel chunk tidak mencakup semua sampel');
    }
    /* stss (video) → indeks sampel kunci (basis-0) */
    let syncArr = null;
    const stssB = S('stss');
    if (stssB) {
      const n = mdv.getUint32(stssB.off + 12);
      const arr = Array.from({ length: n }, (_, i) => mdv.getUint32(stssB.off + 16 + i * 4) - 1).filter(x => x >= 0 && x < nSamp);
      if (arr.length) syncArr = arr;
    }
    /* ctts → offset komposisi (B-frame). PENTING: ctts juga RLE —
       pasangan (count, offset); KEMBANGKAN jadi per-sampel sebelum dipakai.
       Dulu dibaca mentah per-entri → PTS kacau (dts tak monoton). */
    let ctts = null, cttsV1 = false;
    const cttsB = S('ctts');
    if (cttsB) {
      const v = mdv.getUint8(cttsB.off + 8);
      const nE = mdv.getUint32(cttsB.off + 12);
      if (nE * 8 + 16 <= stblLenGuard(mdv, cttsB) && nE < 1e7) {
        const arr = [];
        let bad = false;
        for (let e = 0; e < nE && !bad; e++) {
          const cnt = mdv.getUint32(cttsB.off + 16 + e * 8);
          const off = v === 1 ? mdv.getInt32(cttsB.off + 16 + e * 8 + 4) : (mdv.getUint32(cttsB.off + 16 + e * 8 + 4) | 0);
          for (let k = 0; k < cnt; k++) { arr.push(off); if (arr.length > nSamp) { bad = true; break; } }
        }
        if (!bad && arr.length === nSamp) {
          ctts = Int32Array.from(arr);
          cttsV1 = v === 1 || arr.some(x => x < 0);
        }
      }
    }
    /* sdtp → tipe sampel (opsional; wajib panjangnya pas) */
    let sdtp = null;
    const sdtpB = S('sdtp');
    if (sdtpB && mdv.getUint32(sdtpB.off) === nSamp + 12) sdtp = moovBuf.slice(sdtpB.off + 12, sdtpB.off + 12 + nSamp);
    /* kotak yang disalin utuh ke file hasil */
    const sliceOf = b => moovBuf.slice(b.off, b.off + b.size);
    const vmSm = S(kind === 'vide' ? 'vmhd' : 'smhd');
    const dinfB = fcKid(mdv, minfB, 'dinf');
    const elstB = fcKid(mdv, fcKid(mdv, trak, 'edts'), 'elst');
    const tkVer = mdv.getUint8(tkhdB.off + 8);
    const wOff = tkVer === 0 ? 84 : 92, hOff = tkVer === 0 ? 88 : 96;   /* setelah matrix 36B */
    traks.push({
      kind, ts, nSamp, deltas: deltasF, sizes, unif, offs, syncArr, ctts, cttsV1, sdtp, fmt,
      stsd: sliceOf(stsdB),
      hdlr: sliceOf(hdlrB),
      mdhd: { bytes: sliceOf(mdhdB), ver: mdVer },
      tkhd: { bytes: sliceOf(tkhdB), ver: tkVer },
      elst: elstB ? sliceOf(elstB) : null,
      dinf: dinfB ? sliceOf(dinfB) : null,
      mediaHdr: vmSm ? sliceOf(vmSm) : null,
      width: hOff + 4 <= tkhdB.size ? mdv.getUint32(tkhdB.off + wOff) / 65536 : 0,
      height: hOff + 4 <= tkhdB.size ? mdv.getUint32(tkhdB.off + hOff) / 65536 : 0
    });
  }
  const video = traks.find(t => t.kind === 'vide'), audio = traks.find(t => t.kind === 'soun');
  if (!video) throw new FastCutUnsupported('tidak ada track video');
  /* dts kumulatif per track */
  for (const t of [video, audio]) {
    if (!t) continue;
    const dts = new Float64Array(t.nSamp);
    let acc = 0;
    for (let i = 0; i < t.nSamp; i++) { dts[i] = acc; acc += t.deltas[i]; }
    t.dts = dts; t.dur = acc;
  }
  return {
    ftyp: ftyp ? await read(ftyp.off, ftyp.size) : null,
    fileSize, mvTs, mvVer,
    mvhdBytes: moovBuf.slice(mvhdB.off, mvhdB.off + mvhdB.size),
    video, audio, moovOff: moov.off, moovSize: moov.size
  };
}

/* ---------- pencarian sampel (binary search pada dts) ---------- */
function fcFloor(trk, tSec) {
  const t = tSec * trk.ts;
  let lo = 0, hi = trk.nSamp - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (trk.dts[m] <= t + 1e-6) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}
function fcCeil(trk, tSec) {
  const t = tSec * trk.ts;
  let lo = 0, hi = trk.nSamp - 1, r = trk.nSamp;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (trk.dts[m] >= t - 1e-6) { r = m; hi = m - 1; } else lo = m + 1; }
  return r;
}
/* keyframe terakhir pada/sebelum idx (video tanpa stss = semua kunci) */
function fcSyncBefore(trk, idx) {
  if (!trk.syncArr) return Math.max(0, idx);
  const sa = trk.syncArr;
  let lo = 0, hi = sa.length - 1, r = sa[0];
  while (lo <= hi) { const m = (lo + hi) >> 1; if (sa[m] <= idx) { r = sa[m]; lo = m + 1; } else hi = m - 1; }
  return r;
}

/* ---------- rencana potong per rentang waktu ---------- */
function fcPlanRanges(P, ranges) {
  const V = P.video, A = P.audio;
  const vMax = V.dur / V.ts;
  return ranges.map(r => {
    const t0 = fcClamp(Math.min(r.start, vMax), 0, vMax);
    const t1 = fcClamp(Math.max(r.end, t0 + 0.05), t0 + 0.05, vMax);
    let vi0 = fcFloor(V, t0); if (vi0 < 0) vi0 = 0;
    vi0 = fcSyncBefore(V, vi0);
    let vi1 = fcCeil(V, t1);
    if (vi1 <= vi0) vi1 = Math.min(V.nSamp, vi0 + 1);
    /* AUDIO selalu mengikuti rentang video NYATA (mulai keyframe, akhir
       sampel video terakhir) — dulu dipotong di batas mentah → part bisa
       mulai beberapa detik tanpa suara (desinkron A/V di awal part). */
    const vStartSec = V.dts[vi0] / V.ts;
    const vEndSec = (V.dts[vi1 - 1] + V.deltas[vi1 - 1]) / V.ts;
    let ai0 = A ? Math.max(0, fcFloor(A, vStartSec)) : 0;
    let ai1 = A ? Math.max(ai0 + 1, fcCeil(A, vEndSec)) : 0;
    if (A && ai1 > A.nSamp) ai1 = A.nSamp;
    const durV = (V.dts[vi1 - 1] + V.deltas[vi1 - 1] - V.dts[vi0]) / V.ts;
    return { start: r.start, end: r.end, vi0, vi1, ai0, ai1, dur: durV };
  });
}

/* ---------- pembangun trak baru utk rentang sampel [i0,i1) ---------- */
function fcBuildTrack(P, trk, i0, i1, dataOff) {
  const n = i1 - i0;
  const durSec = (trk.dts[i1 - 1] + trk.deltas[i1 - 1] - trk.dts[i0]) / trk.ts;
  const durMv = Math.max(0, Math.round(durSec * P.mvTs));
  /* stts: pasangan (count, delta) */
  const dSlice = Array.from(trk.deltas.slice(i0, i1));
  const sttsE = fcRle(dSlice, x => x);
  const stts = fcFull('stts', 0, 0, fcU32(sttsE.length),
    fcCat(...sttsE.map(e => fcCat(fcU32(e[0]), fcU32(e[1])))));
  /* stss: nomor sampel kunci (basis-1, digeser ke rentang baru) */
  let stss = null;
  if (trk.syncArr) {
    const ks = trk.syncArr.filter(s => s >= i0 && s < i1).map(s => s - i0 + 1);
    if (ks.length === n) stss = null;            /* semua kunci → kotak tidak perlu */
    else if (ks.length) stss = fcFull('stss', 0, 0, fcU32(ks.length), fcCat(...ks.map(fcU32)));
  }
  /* ctts (B-frame) */
  let ctts = null;
  if (trk.ctts) {
    const cSlice = Array.from(trk.ctts.slice(i0, i1));
    const cE = fcRle(cSlice, x => x);
    ctts = fcFull('ctts', trk.cttsV1 ? 1 : 0, 0, fcU32(cE.length),
      fcCat(...cE.map(e => fcCat(fcU32(e[0]), fcU32(e[1] >>> 0)))));
  }
  /* stsz */
  let stsz;
  if (trk.unif) stsz = fcFull('stsz', 0, 0, fcU32(trk.unif), fcU32(n));
  else {
    const tb = new Uint8Array(n * 4), tdv = fcView(tb);
    for (let i = i0; i < i1; i++) tdv.setUint32((i - i0) * 4, trk.sizes[i] >>> 0);
    stsz = fcFull('stsz', 0, 0, fcU32(0), fcU32(n), tb);
  }
  /* stsc: SATU chunk berisi seluruh sampel rentang */
  const stsc = fcFull('stsc', 0, 0, fcU32(1), fcCat(fcU32(1), fcU32(n), fcU32(1)));
  const stco = fcFull('stco', 0, 0, fcU32(1), fcU32(dataOff >>> 0));
  /* sdtp dipangkas */
  const sdtp = trk.sdtp ? fcFull('sdtp', 0, 0, trk.sdtp.slice(i0, i1)) : null;
  /* mdhd: durasi baru (timescale media) */
  const mdhdB = new Uint8Array(trk.mdhd.bytes);
  {
    const dv = fcView(mdhdB);
    let durTs = 0; for (let i = i0; i < i1; i++) durTs += trk.deltas[i];
    if (trk.mdhd.ver === 0) dv.setUint32(24, durTs >>> 0); else dv.setBigUint64(32, BigInt(Math.round(durTs)));
  }
  /* tkhd: durasi baru (timescale movie) */
  const tkhdB = new Uint8Array(trk.tkhd.bytes);
  {
    const dv = fcView(tkhdB);
    if (trk.tkhd.ver === 0) dv.setUint32(28, durMv >>> 0); else dv.setBigUint64(36, BigInt(durMv));
  }
  /* edts/elst: dipertahankan HANYA bila rentang mulai dari sampel 0
     dan media_time tidak negatif (edit kosong) */
  let edts = null;
  if (trk.elst && i0 === 0) {
    const el = new Uint8Array(trk.elst);
    const dv = fcView(el);
    const ver = dv.getUint8(8);
    const ok = ver === 0 ? dv.getInt32(20) >= 0 : dv.getBigInt64(24) >= 0n;
    if (ok) {
      if (ver === 0) dv.setUint32(16, durMv >>> 0); else dv.setBigUint64(16, BigInt(durMv));
      edts = fcBox('edts', el);
    }
  }
  const stbl = fcBox('stbl', trk.stsd, stts, ...(ctts ? [ctts] : []), stsc, stsz, stco,
    ...(stss ? [stss] : []), ...(sdtp ? [sdtp] : []));
  const minf = fcBox('minf', ...(trk.mediaHdr ? [trk.mediaHdr] : []), ...(trk.dinf ? [trk.dinf] : []), stbl);
  const mdia = fcBox('mdia', mdhdB, trk.hdlr, minf);
  const trak = fcBox('trak', tkhdB, ...(edts ? [edts] : []), mdia);
  return { trak, durMv, n };
}

/* ---------- byte mdat: run-run kontinu utk rentang sampel ---------- */
function fcRuns(trk, i0, i1) {
  const runs = [];
  let rs = -1, re = -1;
  for (let i = i0; i < i1; i++) {
    const sz = trk.unif ? trk.unif : trk.sizes[i];
    const a = trk.offs[i], b = a + sz;
    if (rs < 0) { rs = a; re = b; }
    else if (a === re) re = b;
    else { runs.push([rs, re]); rs = a; re = b; }
  }
  if (rs >= 0) runs.push([rs, re]);
  return runs;
}
function fcRunsBytes(trk, i0, i1) { return fcRuns(trk, i0, i1).reduce((a, r) => a + r[1] - r[0], 0); }

/* ---------- TULIS SATU PART POTONGAN ----------
   writer = { begin(nm)→{id,path}, chunk(id,u8), end(id), abort(id) }
   io = { read, CHUNK, isAborted(), prog(doneBytes, partBytes, plan) } */
async function fcWritePart(P, plan, outName, writer, io) {
  const V = P.video, A = P.audio;
  const runsV = fcRuns(V, plan.vi0, plan.vi1);
  const runsA = A ? fcRuns(A, plan.ai0, plan.ai1) : [];
  const bytesV = fcRunsBytes(V, plan.vi0, plan.vi1);
  const bytesA = A ? fcRunsBytes(A, plan.ai0, plan.ai1) : 0;
  const totalData = bytesV + bytesA;
  if (totalData + 64 > 4294967290) throw new FastCutUnsupported('part melebihi batas 4 GB stco — pakai RENDER PENUH');
  /* moov dibangun 2×: ukurannya tidak tergantung NILAI offset →
     percobaan (offset 0) hanya untuk menghitung ukuran header */
  const buildMoov = (offV, offA) => {
    const tv = fcBuildTrack(P, V, plan.vi0, plan.vi1, offV);
    const ta = A ? fcBuildTrack(P, A, plan.ai0, plan.ai1, offA) : null;
    const mv = new Uint8Array(P.mvhdBytes), mdv = fcView(mv);
    const durMv = Math.max(tv.durMv, ta ? ta.durMv : 0);
    if (P.mvVer === 0) mdv.setUint32(24, durMv >>> 0); else mdv.setBigUint64(32, BigInt(durMv));
    return { moov: fcBox('moov', mv, tv.trak, ...(ta ? [ta.trak] : [])) };
  };
  const trial = buildMoov(0, 0);
  const ftypLen = P.ftyp ? P.ftyp.length : 0;
  const offV = ftypLen + trial.moov.length + 8;
  const offA = offV + bytesV;
  const fin = buildMoov(offV, offA);                 /* offset nyata langsung benar */
  const head = fcCat(P.ftyp || new Uint8Array(0), fin.moov,
    fcCat(fcU32(8 + totalData), new Uint8Array([0x6D, 0x64, 0x61, 0x74])));   /* mdat header */
  const w = await writer.begin(outName);
  try {
    await writer.chunk(w.id, head);
    let done = head.length;
    const copyRuns = async runs => {
      for (const [a, b] of runs) {
        let pos = a;
        while (pos < b) {
          if (io.isAborted()) throw new Error('Dibatalkan');
          const L = Math.min(io.CHUNK, b - pos);
          const d = await io.read(pos, L);
          if (!d || d.length !== L) throw new FastCutUnsupported('gagal membaca sumber @' + pos);
          await writer.chunk(w.id, d);
          pos += L; done += L;
          if (io.prog) io.prog(done - head.length, totalData, plan);
        }
      }
    };
    await copyRuns(runsV);
    await copyRuns(runsA);
    const r = await writer.end(w.id);
    return { name: r.path.split(/[\\/]/).pop(), path: r.path, size: r.size, fast: true, dur: plan.dur };
  } catch (e) {
    try { await writer.abort(w.id); } catch (e2) { }
    throw e;
  }
}

/* ---------- GERBANG: boleh potong langsung? (null = boleh) ---------- */
function fastCutBlockedReason() {
  if (state.titleOn && String(state.title || '').trim()) return 'JUDUL DI VIDEO';
  if (state.partShow !== 'off') return 'LABEL PART';
  if (state.descOn && String(state.desc || '').trim()) return 'DESKRIPSI';
  if (state.subsOn && state.subs.length) return 'SUBTITEL';
  if (typeof coverActive === 'function' && coverActive()) return 'COVER PEMBUKA';
  if (state.wm && state.wm.mode !== 'off') return 'WATERMARK';
  if (state.neon && state.neon.on) return 'FRAME NEON';
  if (state.frameStyle && state.frameStyle !== 'off') return 'FRAME GAYA';
  if (state.colorFilter && state.colorFilter !== 'off') return 'FILTER WARNA';
  const v = state.vfx || {};
  if (v.bright !== 1 || v.contrast !== 1 || v.saturate !== 1 || v.vignette || v.grain) return 'EFEK VISUAL';
  if (state.kb && state.kb.mode !== 'off') return 'KEN BURNS';
  if (state.trans && state.trans.mode !== 'off') return 'TRANSISI';
  if (state.spk && state.spk.on) return 'ZOOM PEMBICARA';
  if (Math.abs((state.speed || 1) - 1) > 1e-9) return 'KECEPATAN VIDEO';
  if (state.ratio !== '16:9') return 'RASIO 9:16';
  if (state.resOut) return 'RESOLUSI TETAP';
  if (parseFloat(state.scale) !== 1) return 'SKALA RESOLUSI';
  if (state.targetMB > 0) return 'KOMPRES PINTAR';
  if (state.audioFix && state.audioFix.on) return 'AUDIO SEHAT';
  if (state.music && state.music.buffer) return 'MUSIK';
  if (state.bsound && state.bsound.on && state.bsound.buffer) return 'BACKSOUND';
  if (state.tts && state.tts.buffer) return 'NARASI TTS';
  if (state.trackMode) return 'PELACAKAN';
  if (state.titleFrame && state.titleFrame !== 'off') return 'FRAME JUDUL';
  return null;
}

/* ---------- EKSPOR POTONG LANGSUNG (dipanggil exportPartsToDir) ---------- */
async function fastCutExport(segs, dir, ui) {
  const srcPath = state.file && state.file.path;
  if (!srcPath) throw new FastCutUnsupported('file tidak punya path disk');
  if (typeof window.kinostra.readSlice !== 'function') throw new FastCutUnsupported('bridge readSlice tidak tersedia');
  const st = await window.kinostra.stat(srcPath);
  if (!st || !st.ok) throw new FastCutUnsupported('file sumber tidak terbaca');
  const read = async (start, len) => {
    const r = await window.kinostra.readSlice(srcPath, start, len);
    if (!r || !r.ok) throw new FastCutUnsupported('baca sumber gagal: ' + (r && r.error || '?'));
    return new Uint8Array(r.data);
  };
  if (ui && ui.sub) ui.sub('POTONG LANGSUNG · memeriksa struktur MP4…');
  const P = await fcParseMp4(read, st.size);
  const plans = fcPlanRanges(P, segs.map(s => ({ start: s.start, end: s.end })));
  const writer = {
    begin: nm => window.kinostra.beginWrite(dir, nm),
    chunk: (id, u8) => window.kinostra.writeChunk(id, u8),
    end: id => window.kinostra.endWrite(id),
    abort: id => window.kinostra.abortWrite(id)
  };
  const io = { read, CHUNK: 8 * 1048576, isAborted: () => state.abort || !!state.exportFatal, prog: null };
  const totals = plans.map(p => fcRunsBytes(P.video, p.vi0, p.vi1) + (P.audio ? fcRunsBytes(P.audio, p.ai0, p.ai1) : 0));
  const grand = Math.max(1, totals.reduce((a, b) => a + b, 0));
  const t0 = performance.now();
  let doneBytes = 0, doneDur = 0;
  const results = [];
  for (let k = 0; k < segs.length; k++) {
    if (state.abort) throw new Error('Dibatalkan');
    if (state.exportFatal) throw state.exportFatal;
    const seg = segs[k], plan = plans[k];
    /* LANJUTKAN EKSPOR — lewati part yang filenya sudah ada */
    if (state.resumeExport) {
      try {
        const nm0 = partFileName(state.title, state.partPrefix, seg.i + 1);
        const st0 = await window.kinostra.statJoin(dir, nm0);
        if (st0 && st0.ok && st0.size > 51200) {
          results.push({ name: nm0, path: st0.path, size: st0.size, skipped: true, fast: true });
          doneBytes += totals[k]; doneDur += plan.dur;
          if (ui && ui.prog) ui.prog(doneBytes / grand);
          continue;
        }
      } catch (e) { }
    }
    const nm = partFileName(state.title, state.partPrefix, seg.i + 1);
    io.prog = (done, partBytes, pl) => {
      if (ui && ui.prog) ui.prog(fcClamp((doneBytes + done) / grand, 0, 1));
      if (ui && ui.sub) {
        const el = (performance.now() - t0) / 1000;
        const rt = el > 0.2 ? (doneDur + (done / Math.max(1, partBytes)) * pl.dur) / el : 0;
        ui.sub(`POTONG LANGSUNG P${String(seg.i + 1).padStart(2, '0')} ${Math.round(100 * done / Math.max(1, partBytes))}%${rt > 0.5 ? ` · ${rt.toFixed(0)}× realtime` : ''} · ${fmtMB(doneBytes + done)} disalin`);
      }
    };
    results.push(await fcWritePart(P, plan, nm, writer, io));
    doneBytes += totals[k]; doneDur += plan.dur;
  }
  const el = (performance.now() - t0) / 1000;
  if (ui && ui.sub) ui.sub(`POTONG LANGSUNG selesai ${el < 90 ? el.toFixed(1) + ' dtk' : (el / 60).toFixed(1) + ' mnt'}${doneDur > 0 && el > 0.2 ? ` · ${(doneDur / el).toFixed(0)}× realtime` : ''}`);
  return results;
}
