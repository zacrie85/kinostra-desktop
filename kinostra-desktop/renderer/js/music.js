/* ================================================================
   KINOSTRA DESKTOP — music.js
   Mesin komposisi musik prosedural (OfflineAudioContext)
   EPIC · NEON DRIVE · LO-FI · TENSION — port setia dari v1.0
   ================================================================ */
'use strict';

const MOODS = {
  epic: { bpm: 82, root: 41, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 3, 4], bright: 600, verb: .5,
    bassPat: [1, 0, 0, 1, 0, 0, 1, 0], kick: [1, 0, 0, 0, 0, 0, 1, 0], hat: false, arp: false, taiko: true, boom: false, pulse: false },
  neon: { bpm: 118, root: 45, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 5, 3, 4], bright: 1500, verb: .32,
    bassPat: [1, 0, 1, 1, 1, 0, 1, 0], kick: [1, 0, 0, 0, 1, 0, 0, 0], hat: 'off', arp: true, taiko: false, boom: false, pulse: false },
  chill: { bpm: 76, root: 48, scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 3, 5, 4], bright: 950, verb: .42,
    bassPat: [1, 0, 0, 0, 1, 0, 0, 0], kick: [1, 0, 0, 0, 0, 0, 1, 0], hat: 'off', arp: true, taiko: false, boom: false, pulse: false, vinyl: true },
  tension: { bpm: 64, root: 38, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 0, 1, 0], bright: 420, verb: .6,
    bassPat: [1, 0, 0, 0, 0, 0, 0, 0], kick: [0, 0, 0, 0, 0, 0, 0, 0], hat: false, arp: false, taiko: false, boom: true, pulse: true }
};

/* ---------- preview musik sinkron video ---------- */
let musSrc = null, musGainNode = null;
function ensureMusGain() {
  const ac = getActx();
  if (!musGainNode) { musGainNode = ac.createGain(); musGainNode.connect(ac.destination); }
  musGainNode.gain.value = state.music.gain;
}
function stopMusicPreview() { if (musSrc) { try { musSrc.stop(); } catch (e) { } musSrc = null; } }
function startMusicSync() {
  stopMusicPreview();
  if (!state.music.buffer || videoEl.paused) return;
  ensureMusGain(); const ac = getActx();
  musSrc = ac.createBufferSource(); musSrc.buffer = state.music.buffer; musSrc.loop = true;
  musSrc.connect(musGainNode); musSrc.start(0, videoEl.currentTime % state.music.buffer.duration);
}

/* v2.10: parameter `force` — dipakai BATCH EKSPOR. Dulu composeMusic
   menolak jalan ketika state.busy sudah true (yang PASTI terjadi di dalam
   batch), sehingga skor musik TIDAK PERNAH dirender ulang per video —
   buffer lama yang lebih pendek bikin renderMix melempar InvalidStateError
   → batch "selalu dibatalkan" sejak v2.9. Dengan force=true, penyusunan
   skor berjalan normal tanpa menyentuh flag busy milik batch. */
async function composeMusic(reroll, quiet = false, force = false) {
  if (!state.file) { toast('Impor media dulu', 'err'); return; }
  if (state.busy && !force) return;
  if (!force) state.busy = true;
  if (reroll) state.music.seed = (Math.random() * 1e9) | 0;
  if (!quiet) showModal({ title: 'MENYUSUN SKOR', sub: 'Mesin komposisi prosedural…' });
  setProg(0.1);
  try {
    await sleep(30);
    const Mz = MOODS[state.music.mood], inten = state.music.intensity;
    const dur = (state.duration || 30) + 1.5, sr = 44100;
    const oc = new OfflineAudioContext(2, Math.ceil(sr * dur), sr);
    const R = mulberry32(state.music.seed);
    const spb = 60 / Mz.bpm, bar = spb * 4, e8 = spb / 2;
    const m2f = m => 440 * Math.pow(2, (m - 69) / 12);
    const master = oc.createGain(); master.gain.value = 0.85;
    const lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Mz.bright * 1.6 + inten * 900;
    const comp = oc.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3.5;
    master.connect(lp); lp.connect(comp); comp.connect(oc.destination);
    // reverb (impulse noise decay)
    const irLen = Math.floor(sr * 2.4), ir = oc.createBuffer(2, irLen, sr);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c);
      for (let i = 0; i < irLen; i++) d[i] = (R() * 2 - 1) * Math.pow(1 - i / irLen, 2.6); }
    const verb = oc.createConvolver(); verb.buffer = ir;
    const vg = oc.createGain(); vg.gain.value = Mz.verb; verb.connect(vg); vg.connect(master);
    // delay untuk arpeggio
    const dl2 = oc.createDelay(1); dl2.delayTime.value = spb * 0.75;
    const dfb = oc.createGain(); dfb.gain.value = 0.34; dl2.connect(dfb); dfb.connect(dl2);
    const dg = oc.createGain(); dg.gain.value = 0.5; dl2.connect(dg); dg.connect(master);
    function tone(o) {
      const { type = 'sine', f = 440, t, d = 0.3, vol = 0.2, att = 0.008, rel = 0.12, lpf = 0, verbW = 0, dly = 0 } = o;
      const osc = oc.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(f, t);
      const g = oc.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + att);
      g.gain.setTargetAtTime(0.0001, t + d, rel);
      let head = osc;
      if (lpf) { const fl = oc.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lpf; osc.connect(fl); head = fl; }
      head.connect(g); g.connect(master);
      if (verbW) { const s = oc.createGain(); s.gain.value = verbW; g.connect(s); s.connect(verb); }
      if (dly) { const s = oc.createGain(); s.gain.value = dly; g.connect(s); s.connect(dl2); }
      osc.start(t); osc.stop(t + d + rel * 6 + 0.1);
    }
    function noiseHit(o) {
      const { t, d = 0.08, vol = 0.2, type = 'highpass', fq = 6000, rel = 0.05, verbW = 0 } = o;
      const len = Math.ceil(sr * (d + rel * 6)), b = oc.createBuffer(1, len, sr), dd = b.getChannelData(0);
      for (let i = 0; i < len; i++) dd[i] = Math.random() * 2 - 1;
      const src = oc.createBufferSource(); src.buffer = b;
      const fl = oc.createBiquadFilter(); fl.type = type; fl.frequency.value = fq;
      const g = oc.createGain(); g.gain.setValueAtTime(vol, t); g.gain.setTargetAtTime(0.0001, t + d, rel);
      src.connect(fl); fl.connect(g); g.connect(master);
      if (verbW) { const s = oc.createGain(); s.gain.value = verbW; g.connect(s); s.connect(verb); }
      src.start(t); src.stop(t + len / sr);
    }
    function kickAt(t, vol) {
      const o = oc.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
      const g = oc.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.32);
    }
    function boomAt(t) {
      const o = oc.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(58, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.9);
      const g = oc.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.85, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
      o.connect(g); g.connect(master);
      const s = oc.createGain(); s.gain.value = 0.5; g.connect(s); s.connect(verb);
      o.start(t); o.stop(t + 1.8);
      noiseHit({ t, d: 0.4, vol: 0.12, type: 'lowpass', fq: 300, rel: 0.3, verbW: 0.6 });
    }
    function chordNotes(deg) {
      const sc = Mz.scale, n = i => sc[((deg + i) % 7 + 7) % 7] + 12 * Math.floor((deg + i) / 7);
      return [Mz.root + n(0), Mz.root + n(2), Mz.root + n(4), Mz.root + n(0) + 12];
    }
    const nBars = Math.ceil(dur / bar);
    for (let b = 0; b < nBars; b++) {
      const t = b * bar; if (t > dur) break;
      const deg = Mz.prog[b % Mz.prog.length], notes = chordNotes(deg);
      // pad
      notes.forEach(m => {
        const f = m2f(m);
        tone({ type: 'sawtooth', f: f * 0.997, t, d: bar * 0.95, vol: 0.09 + 0.05 * inten, att: bar * 0.35, rel: 0.5, lpf: Mz.bright, verbW: 0.5 });
        tone({ type: 'sawtooth', f: f * 1.004, t, d: bar * 0.95, vol: 0.09 + 0.05 * inten, att: bar * 0.35, rel: 0.5, lpf: Mz.bright, verbW: 0.5 });
      });
      // bass
      const bf = m2f(Mz.root + Mz.scale[deg % 7] - 12);
      for (let e = 0; e < 8; e++) if (Mz.bassPat[e])
        tone({ type: 'sawtooth', f: bf, t: t + e * e8, d: e8 * 0.85, vol: 0.2, att: 0.01, rel: 0.08, lpf: 260 });
      // kick
      for (let e = 0; e < 8; e++) if (Mz.kick[e]) kickAt(t + e * e8, 0.55 + 0.35 * inten);
      // hat
      if (Mz.hat === 'off') for (let e = 1; e < 8; e += 2)
        noiseHit({ t: t + e * e8, d: 0.03, vol: 0.09 + 0.08 * inten, fq: 7500, rel: 0.03 });
      // arpeggio
      if (Mz.arp) {
        const seq = [0, 2, 4, 2, 1, 3, 4, 3];
        for (let e = 0; e < 8; e++) {
          const m = notes[seq[e] % notes.length] + 12;
          tone({ type: 'square', f: m2f(m), t: t + e * e8 + 0.01, d: e8 * 0.5, vol: 0.05 + 0.05 * inten, att: 0.005, rel: 0.07, lpf: 2400, verbW: 0.35, dly: 0.5 });
        }
      }
      if (Mz.taiko) { kickAt(t, 0.9); kickAt(t + 2.5 * spb, 0.6); if (b % 4 === 3) kickAt(t + 3.5 * spb, 0.7); }
      if (Mz.boom && b % 2 === 0) boomAt(t);
      if (Mz.pulse) for (let e = 0; e < 8; e++)
        tone({ type: 'triangle', f: m2f(notes[0]), t: t + e * e8, d: e8 * 0.4, vol: 0.045, att: 0.005, rel: 0.05, lpf: 900 });
      if (b % 8 === 0) setProg(0.1 + 0.85 * b / nBars);
    }
    // vinyl noise (lo-fi)
    if (Mz.vinyl) {
      const len = Math.ceil(sr * dur), b = oc.createBuffer(1, len, sr), dd = b.getChannelData(0);
      for (let i = 0; i < len; i++) dd[i] = (R() * 2 - 1) * 0.35 + (R() < 0.0004 ? (R() * 2 - 1) * 0.9 : 0);
      const src = oc.createBufferSource(); src.buffer = b;
      const fl = oc.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 3000; fl.Q.value = 0.4;
      const g = oc.createGain(); g.gain.value = 0.03;
      src.connect(fl); fl.connect(g); g.connect(master); src.start(0);
    }
    setProg(0.98); setSub('Merender audio…');
    state.music.buffer = await oc.startRendering();
    $('#musStat').textContent = `Skor siap · ${Mz.bpm} BPM · seed #${state.music.seed.toString(16)} · ${Math.round(dur)} dtk`;
    if (!quiet) toast('Skor musik tersusun', 'ok');
    if (!videoEl.paused) startMusicSync();
  } catch (e) { console.error(e); toast('Gagal menyusun skor: ' + (e.message || e), 'err'); }
  if (!force) state.busy = false;
  if (!quiet) hideModal();
}
