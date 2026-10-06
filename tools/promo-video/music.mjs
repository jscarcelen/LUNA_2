#!/usr/bin/env node
/* Original music for the Luna promo, synthesised in pure Node (no samples, no downloads, no licences).
 *
 *   node music.mjs            -> out/luna-music.wav  (stereo, 44.1 kHz, 16-bit, ~-16 LUFS integrated, peak <= -1 dBFS)
 *
 * 108 BPM, C major, progression Cmaj7 | G | Am7 | Fmaj7 (one bar each). Scene changes come from timing.json,
 * the same file index.html reads, so the music hits land on the picture cuts.
 *   0-5.6s   hook: soft pad, plucked "word flick" notes, sparkle run into the logo, riser
 *   5.6-17.8 groove enters: soft four-on-the-floor kick, bass, pluck arpeggio, bell melody from the 3rd scene
 *   17.8s    "beat 4" (Generate): snare-roll + riser + impact, full groove with 16th hats and claps
 *   ... full groove to the end of "Build & sell", with risers/whooshes under every scene transition
 *   53.3s    outro: drums drop, tonic chord rings, bell resolves; 1.5 s fade-out.
 * It is a placeholder you can swap for a licensed track: just replace out/luna-music.wav (44.1 kHz stereo).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const timing = JSON.parse(fs.readFileSync(path.join(here, "timing.json"), "utf8"));
const SR = 44100;
const DUR = timing.duration;
const N = Math.round(DUR * SR);
const BPM = timing.bpm;
const SPB = 60 / BPM;
const BOUND = timing.boundaryBeats.map((b) => b * SPB); /* seconds */
const TRANS = timing.transitions;
const BEAT = (b) => b * SPB;
const FADE_OUT = 1.5;

/* ------------------------------------------------------------------ utils */
let seed = 20261006;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const noise = () => rnd() * 2 - 1;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mk = () => ({ L: new Float32Array(N), R: new Float32Array(N) });
const curve = (pts) => (t) => {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [t0, v0] = pts[i - 1], [t1, v1] = pts[i]; return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0); }
  return pts[pts.length - 1][1];
};
function addMono(bus, startSec, mono, gain = 1, pan = 0) {
  const s0 = Math.round(startSec * SR);
  const a = Math.cos(((pan + 1) * Math.PI) / 4) * gain, b = Math.sin(((pan + 1) * Math.PI) / 4) * gain;
  for (let i = 0; i < mono.length; i++) {
    const n = s0 + i;
    if (n < 0) continue;
    if (n >= N) break;
    bus.L[n] += mono[i] * a; bus.R[n] += mono[i] * b;
  }
}

/* band-limited saw wavetable (rolled-off) for the pad */
const TBL = 4096;
const SAW = new Float32Array(TBL);
for (let k = 1; k <= 22; k++) {
  const amp = (1 / k) / (1 + Math.pow(k / 7, 2));
  for (let i = 0; i < TBL; i++) SAW[i] += amp * Math.sin((2 * Math.PI * k * i) / TBL);
}
const wt = (ph) => { const x = (ph - Math.floor(ph)) * TBL; const i = x | 0; const f = x - i; return SAW[i] * (1 - f) + SAW[(i + 1) % TBL] * f; };

/* ------------------------------------------------------------------ harmony */
const CHORDS = [
  { name: "Cmaj7", pad: [48, 55, 59, 64], arp: [72, 76, 79, 83], bass: 36, fifth: 43 },
  { name: "G", pad: [50, 55, 59, 62], arp: [74, 79, 83, 86], bass: 31, fifth: 38 },
  { name: "Am7", pad: [52, 57, 60, 64], arp: [72, 76, 79, 81], bass: 33, fifth: 40 },
  { name: "Fmaj7", pad: [53, 57, 60, 64], arp: [72, 77, 79, 81], bass: 29, fifth: 36 }
];
const chordAtBeat = (b) => CHORDS[Math.floor(b / 4) % 4];
const BEATS_TOTAL = DUR / SPB;
const OUTRO_BEAT = timing.boundaryBeats[7];

/* ------------------------------------------------------------------ instruments */
function pluck(f, len = 1.1, bright = 1) {
  const n = Math.round(len * SR), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const e = Math.min(1, t / 0.004) * Math.exp(-t / 0.22);
    const e2 = Math.exp(-t / (0.08 * bright));
    out[i] = e * (Math.sin(2 * Math.PI * f * t) + 0.45 * e2 * Math.sin(4 * Math.PI * f * t + 0.3) + 0.25 * e2 * Math.sin(6 * Math.PI * f * t)) * 0.5;
  }
  return out;
}
function bell(f, len = 2.2) {
  const n = Math.round(len * SR), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const e = Math.min(1, t / 0.006) * Math.exp(-t / 0.75);
    const idx = 1.6 * Math.exp(-t / 0.35);
    out[i] = e * Math.sin(2 * Math.PI * f * t + idx * Math.sin(2 * Math.PI * f * 2 * t)) * 0.45 + e * 0.12 * Math.sin(2 * Math.PI * f * 3.01 * t) * Math.exp(-t / 0.25);
  }
  return out;
}
function bassNote(f, len) {
  const n = Math.round((len + 0.12) * SR), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const e = Math.min(1, t / 0.008) * (t < len ? 1 : Math.exp(-(t - len) / 0.04)) * (0.75 + 0.25 * Math.exp(-t / 0.2));
    ph += f / SR;
    out[i] = e * (Math.sin(2 * Math.PI * ph) + 0.35 * Math.sin(4 * Math.PI * ph + 0.5) + 0.12 * Math.sin(6 * Math.PI * ph)) * 0.8;
  }
  return out;
}
function kick() {
  const n = Math.round(0.45 * SR), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 44 + 120 * Math.exp(-t / 0.028);
    ph += f / SR;
    out[i] = (Math.min(1, t / 0.0015) * Math.exp(-t / 0.15) * Math.sin(2 * Math.PI * ph) + (t < 0.004 ? noise() * 0.25 * (1 - t / 0.004) : 0)) * 0.95;
  }
  return out;
}
function hat(open = false, bright = 1) {
  const n = Math.round((open ? 0.22 : 0.07) * SR), out = new Float32Array(n);
  let p1 = 0, p2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const x = noise();
    const hp = x - p1 * 0.93; p1 = x; /* crude high-pass */
    const hp2 = hp - p2 * 0.6; p2 = hp;
    out[i] = hp2 * Math.exp(-t / (open ? 0.07 : 0.018)) * 0.5 * bright;
  }
  return out;
}
function clap() {
  const n = Math.round(0.32 * SR), out = new Float32Array(n);
  let lp = 0, hpS = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const burst = [0, 0.011, 0.022].reduce((a, d) => a + (t >= d ? Math.exp(-(t - d) / 0.006) : 0), 0);
    const tail = t >= 0.03 ? Math.exp(-(t - 0.03) / 0.09) * 0.55 : 0;
    const x = noise() * (burst * 0.55 + tail);
    lp += 0.45 * (x - lp);
    const y = lp - hpS; hpS += 0.12 * y;
    out[i] = y * 1.6;
  }
  return out;
}
function snareRollHit(level = 1) {
  const n = Math.round(0.18 * SR), out = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    lp += 0.5 * (noise() - lp);
    out[i] = (lp * 0.9 + Math.sin(2 * Math.PI * 190 * t) * 0.35) * Math.exp(-t / 0.05) * level;
  }
  return out;
}
/* state-variable filtered noise: sweeps (riser / whoosh), per-sample cutoff in Hz */
function sweep(len, cutoffFn, ampFn, q = 0.9, mode = "bp") {
  const n = Math.round(len * SR), out = new Float32Array(n);
  let ic1 = 0, ic2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const fc = clamp(cutoffFn(t / len), 80, 16000);
    const g = Math.tan((Math.PI * fc) / SR), k = 1 / q, a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v0 = noise();
    const v3 = v0 - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    out[i] = (mode === "hp" ? v0 - k * v1 - v2 : v1) * ampFn(t / len);
  }
  return out;
}
function boom() {
  const n = Math.round(1.6 * SR), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (38 + 90 * Math.exp(-t / 0.12)) / SR;
    out[i] = Math.sin(2 * Math.PI * ph) * Math.exp(-t / 0.5) * Math.min(1, t / 0.004) * 0.9 + noise() * Math.exp(-t / 0.35) * 0.18;
  }
  return out;
}

/* ------------------------------------------------------------------ build the arrangement */
const padBus = mk(), plkBus = mk(), melBus = mk(), bassBus = mk(), drumBus = mk(), fxBus = mk();
const kickTimes = [];
const KICK = kick(), HAT_C = hat(false), HAT_O = hat(true), CLAP = clap();

/* PAD: detuned saws, one chord per bar, overlapping release */
{
  const bars = Math.ceil(BEATS_TOTAL / 4);
  const padGain = curve([[0, 0.0], [0.5, 0.8], [BEAT(10), 0.85], [BEAT(32), 0.55], [BEAT(94), 0.55], [BEAT(OUTRO_BEAT), 0.62], [DUR, 0.62]]);
  for (let bar = 0; bar < bars; bar++) {
    const startB = bar * 4;
    const chord = startB >= OUTRO_BEAT + 4 ? CHORDS[0] : CHORDS[bar % 4];
    /* outro: stay on the tonic after one bar of Cmaj7, add the 9th for a bright resolve */
    const notes = startB >= OUTRO_BEAT ? [48, 55, 59, 64, 67] : chord.pad;
    const t0 = BEAT(startB), len = BEAT(startB >= OUTRO_BEAT ? BEATS_TOTAL - startB + 1 : 4) + 0.9;
    const n = Math.round(len * SR);
    const bufL = new Float32Array(n), bufR = new Float32Array(n);
    notes.forEach((m, ni) => {
      const f = mtof(m);
      [-7, 0, 7].forEach((cents, vi) => {
        const ff = f * Math.pow(2, cents / 1200);
        let ph = rnd();
        const pan = (vi - 1) * 0.55 + (ni - 1.5) * 0.12;
        const gl = Math.cos(((pan + 1) * Math.PI) / 4), gr = Math.sin(((pan + 1) * Math.PI) / 4);
        for (let i = 0; i < n; i++) {
          const t = i / SR;
          const att = Math.min(1, t / 0.45), rel = t < len - 0.9 ? 1 : Math.exp(-(t - (len - 0.9)) / 0.28);
          const s = wt(ph) * att * rel * 0.09;
          ph += ff / SR;
          bufL[i] += s * gl; bufR[i] += s * gr;
        }
      });
    });
    const s0 = Math.round(t0 * SR);
    for (let i = 0; i < n; i++) { const k = s0 + i; if (k >= N) break; const g = padGain((s0 + i) / SR); padBus.L[k] += bufL[i] * g; padBus.R[k] += bufR[i] * g; }
  }
}

/* HOOK: word-flick plucks, sparkle run into the logo */
[[0.12, 72], [0.58, 76], [1.04, 79], [1.5, 84]].forEach(([t, m], i) => addMono(plkBus, t, pluck(mtof(m), 1.2), 0.5 + i * 0.05, -0.2 + i * 0.13));
[72, 76, 79, 83, 88, 91, 95].forEach((m, i) => addMono(melBus, 2.15 + i * 0.09, bell(mtof(m), 1.8), 0.28, -0.4 + i * 0.13));
addMono(fxBus, 2.12, boom(), 0.5);

/* ARP: eighth-note pluck pattern following the chords */
{
  const pattern = [0, 1, 2, 3, 2, 3, 2, 1];
  const arpGain = curve([[BEAT(4), 0], [BEAT(10), 0.42], [BEAT(32), 0.62], [BEAT(94), 0.62], [BEAT(OUTRO_BEAT), 0.3], [BEAT(OUTRO_BEAT + 6), 0.18]]);
  for (let e = 8; e < BEATS_TOTAL * 2; e++) {
    const b = e / 2, t = BEAT(b);
    if (b < 4 || b >= BEATS_TOTAL - 1.5) continue;
    if (b >= 4 && b < 8) { /* before the groove: sparse, every 2nd 8th */ if (e % 2) continue; }
    const chord = b >= OUTRO_BEAT ? CHORDS[0] : chordAtBeat(b);
    const note = chord.arp[pattern[e % 8]] + (b >= OUTRO_BEAT && e % 8 >= 4 ? 12 : 0);
    const accent = e % 2 === 0 ? 1 : 0.78;
    addMono(plkBus, t, pluck(mtof(note), 0.9, e % 4 === 0 ? 1.4 : 1), arpGain(t) * accent, Math.sin(e * 0.9) * 0.45);
  }
}

/* BELL MELODY: 4-bar loop over the chords from scene 3, resolves in the outro */
{
  const motif = [
    [[76, 0, 1.5], [79, 1.5, 0.5], [81, 2, 1], [79, 3, 1]], /* Cmaj7 */
    [[74, 0, 1.5], [79, 1.5, 0.5], [83, 2, 1], [81, 3, 1]], /* G */
    [[72, 0, 1.5], [76, 1.5, 0.5], [81, 2, 1], [79, 3, 1]], /* Am7 */
    [[81, 0, 1.5], [79, 1.5, 0.5], [77, 2, 1], [76, 3, 1]] /* Fmaj7 */
  ];
  const melGain = curve([[BEAT(20), 0.0], [BEAT(21), 0.34], [BEAT(32), 0.5], [BEAT(94), 0.5]]);
  for (let bar = 5; bar * 4 < OUTRO_BEAT - 1; bar++) {
    motif[bar % 4].forEach(([m, off, dur]) => {
      const t = BEAT(bar * 4 + off);
      if (bar * 4 < 20) return;
      addMono(melBus, t, bell(mtof(m), 1.4 + dur), melGain(t) * (off === 0 ? 1 : 0.8), 0.15 * (off % 2 ? 1 : -1));
    });
  }
  /* resolve: E5 - G5 - C6 */
  [[76, 0], [79, 2], [84, 4]].forEach(([m, off], i) => addMono(melBus, BEAT(OUTRO_BEAT + off) + 0.05, bell(mtof(m), 3.2), 0.42 - i * 0.03, -0.1 + i * 0.1));
  [72, 76, 79, 83, 88, 91, 96].forEach((m, i) => addMono(melBus, BEAT(OUTRO_BEAT + 5.2) + i * 0.1, bell(mtof(m), 2.2), 0.22, -0.3 + i * 0.1));
}

/* BASS */
{
  const bassGain = curve([[BEAT(10), 0], [BEAT(11), 0.4], [BEAT(32), 0.58], [BEAT(94), 0.58], [BEAT(95.5), 0]]);
  const rhythm = [[0, 1.3], [1.5, 0.4], [2.5, 0.45], [3.5, 0.4]];
  for (let bar = Math.floor(10 / 4); bar * 4 < 94; bar++) {
    const chord = chordAtBeat(bar * 4);
    rhythm.forEach(([off, dur], i) => {
      const b = bar * 4 + off;
      if (b < 10 || b >= 94) return;
      const m = i === 3 ? chord.fifth : i === 2 ? chord.bass + 12 : chord.bass;
      addMono(bassBus, BEAT(b), bassNote(mtof(m), dur * SPB), bassGain(BEAT(b)) * (i === 0 ? 1 : 0.8), 0);
    });
  }
  addMono(bassBus, BEAT(OUTRO_BEAT), bassNote(mtof(36), 4.5), 0.5, 0);
}

/* DRUMS */
{
  const kickGain = (b) => (b < 10 ? 0 : b < 32 ? 0.6 : b < 94 ? 0.95 : 0);
  for (let b = 10; b < 94; b++) {
    if (b >= 30 && b < 32) continue; /* breakdown before beat 4 */
    if (b % 1 === 0) { addMono(drumBus, BEAT(b), KICK, kickGain(b), 0); kickTimes.push(BEAT(b)); }
  }
  /* kick pick-ups on the "and" of 4 in the full section for drive */
  for (let b = 32; b < 94; b += 4) { addMono(drumBus, BEAT(b + 3.5), KICK, 0.45, 0); kickTimes.push(BEAT(b + 3.5)); }
  /* hats */
  for (let e = 20 * 2; e < 94 * 2; e++) {
    const b = e / 2;
    if (b >= 30 && b < 32) continue;
    if (b < 32) { if (e % 2) addMono(drumBus, BEAT(b), HAT_C, 0.28, 0.25); continue; }
    /* full section: 16ths */
    for (let q = 0; q < 2; q++) {
      const bb = b + q * 0.25;
      if (bb >= 94) continue;
      const on8 = q === 0;
      const open = on8 && e % 2 === 1;
      addMono(drumBus, BEAT(bb), open ? HAT_O : HAT_C, open ? 0.3 : on8 ? 0.2 : 0.14, 0.2 * (q ? 1 : -1));
    }
  }
  /* claps on 2 & 4 from beat 4 */
  for (let b = 33; b < 94; b += 2) if (b % 4 === 1 || b % 4 === 3) addMono(drumBus, BEAT(b), CLAP, 0.55, 0);
  /* snare roll into beat 32, and into the outro */
  const roll = (from, to, startLevel) => { const steps = Math.round((to - from) * 4); for (let i = 0; i < steps; i++) addMono(drumBus, BEAT(from + i * 0.25), snareRollHit(startLevel + (0.75 - startLevel) * (i / steps)), 0.6, 0); };
  roll(30, 32, 0.15);
  roll(94, OUTRO_BEAT, 0.15);
  /* a soft ride-like open hat tail at the outro */
  addMono(drumBus, BEAT(OUTRO_BEAT), HAT_O, 0.4, 0.3);
}

/* RISERS, WHOOSHES, IMPACTS under each transition */
{
  BOUND.forEach((tb, i) => {
    const big = i === 3 || i === 7, med = i === 0;
    const rl = big ? 2.2 : 1.3;
    addMono(fxBus, tb - rl, sweep(rl, (x) => 400 + 6500 * x * x, (x) => Math.pow(x, 2.2) * (big ? 0.7 : 0.45), 0.8, "hp"), 1, -0.1 + (i % 2) * 0.2);
    /* whoosh centred on the visual transition */
    const wl = 0.95, ws = tb + TRANS[i] / 2 - wl * 0.45;
    const dirUp = i % 2 === 0;
    addMono(fxBus, ws, sweep(wl, (x) => (dirUp ? 350 + 4200 * x : 4600 - 4000 * x), (x) => Math.sin(Math.PI * Math.pow(x, 0.8)) * 0.55, 1.1, "bp"), 1, dirUp ? -0.4 : 0.4);
    /* the whoosh pans across the stereo field */
    if (big || med) addMono(fxBus, tb, boom(), big ? 0.75 : 0.4);
    else addMono(fxBus, tb, bassNote(mtof(36), 0.12), 0.55);
    /* crash on the big hits */
    if (big) addMono(fxBus, tb, sweep(1.8, () => 7000, (x) => Math.exp(-x * 5) * 0.45, 0.5, "hp"), 1, 0.1);
  });
}

/* ------------------------------------------------------------------ sends: pad lowpass, sidechain, delay, reverb */
const t = (n) => n / SR;
/* sidechain envelope from kicks */
const sc = new Float32Array(N).fill(1);
{
  const pts = kickTimes.map((x) => Math.round(x * SR)).sort((a, b) => a - b);
  let k = 0, env = 0;
  const rel = Math.exp(-1 / (0.2 * SR));
  for (let n = 0; n < N; n++) {
    while (k < pts.length && pts[k] <= n) { env = 1; k++; }
    sc[n] = 1 - 0.38 * env; env *= rel;
  }
}
/* pad: two cascaded one-poles with a cutoff that opens during the build and closes for the outro */
{
  const cut = curve([[0, 500], [BEAT(10), 1100], [BEAT(32), 2400], [BEAT(60), 3200], [BEAT(94), 3200], [BEAT(OUTRO_BEAT), 1500], [DUR, 800]]);
  let a1 = 0, a2 = 0, b1 = 0, b2 = 0;
  for (let n = 0; n < N; n++) {
    const c = 1 - Math.exp((-2 * Math.PI * cut(t(n))) / SR);
    a1 += c * (padBus.L[n] - a1); a2 += c * (a1 - a2); padBus.L[n] = a2;
    b1 += c * (padBus.R[n] - b1); b2 += c * (b1 - b2); padBus.R[n] = b2;
  }
}
const scPad = new Float32Array(N), scBass = new Float32Array(N);
for (let n = 0; n < N; n++) { scPad[n] = 0.55 + 0.45 * sc[n]; scBass[n] = sc[n] > 0.9 ? 1 : 0.35 + 0.65 * sc[n]; }

/* ping-pong dotted-eighth delay on plucks and bells: R gets x delayed, L gets R delayed*fb, R gets L delayed*fb ... */
function pingPong2(inL, inR, wet, fb) {
  const D = Math.round(0.75 * SPB * SR);
  const eL = new Float32Array(N), eR = new Float32Array(N);
  for (let n = D; n < N; n++) {
    eR[n] = (inL[n - D] + inR[n - D]) * 0.5 + fb * eL[n - D];
    eL[n] = fb * eR[n - D];
  }
  for (let n = 0; n < N; n++) { eL[n] *= wet; eR[n] *= wet; }
  return { L: eL, R: eR };
}

/* Freeverb-style reverb (mono in, stereo out) */
function reverb(inMono, { feedback = 0.84, damp = 0.25, spread = 23 } = {}) {
  const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], apT = [556, 441, 341, 225];
  const outCh = [new Float32Array(N), new Float32Array(N)];
  for (let ch = 0; ch < 2; ch++) {
    const combs = combT.map((d) => ({ buf: new Float32Array(d + ch * spread), i: 0, fs: 0 }));
    const aps = apT.map((d) => ({ buf: new Float32Array(d + ch * spread), i: 0 }));
    const out = outCh[ch];
    for (let n = 0; n < N; n++) {
      const x = inMono[n] * 0.03;
      let y = 0;
      for (const c of combs) { const o = c.buf[c.i]; c.fs = o * (1 - damp) + c.fs * damp; c.buf[c.i] = x + c.fs * feedback; if (++c.i >= c.buf.length) c.i = 0; y += o; }
      for (const a of aps) { const bo = a.buf[a.i]; const o = -y + bo; a.buf[a.i] = y + bo * 0.5; if (++a.i >= a.buf.length) a.i = 0; y = o; }
      out[n] = y;
    }
  }
  return { L: outCh[0], R: outCh[1] };
}

if (process.env.MUSIC_DEBUG) {
  const rmsDb = (bus, a, b) => { let s2 = 0; for (let n = Math.round(a * SR); n < Math.round(b * SR); n++) s2 += bus.L[n] * bus.L[n] + bus.R[n] * bus.R[n]; return (10 * Math.log10(s2 / (2 * (b - a) * SR) + 1e-12)).toFixed(1); };
  const row = (nm, bus) => console.log(nm.padEnd(6), [[1, 5], [8, 16], [20, 30], [34, 44], [50, 53], [54, 57]].map(([a, b]) => `${a}-${b}s ${rmsDb(bus, a, b)}`).join("  "));
  [["pad", padBus], ["pluck", plkBus], ["bell", melBus], ["bass", bassBus], ["drums", drumBus], ["fx", fxBus]].forEach(([n, b]) => row(n, b));
}

/* ------------------------------------------------------------------ mix */
const outL = new Float32Array(N), outR = new Float32Array(N);
const plkMix = { L: new Float32Array(N), R: new Float32Array(N) };
for (let n = 0; n < N; n++) {
  const g = 0.55 + 0.45 * sc[n];
  plkMix.L[n] = (plkBus.L[n] * 1.3 + melBus.L[n] * 1.0) * (0.6 + 0.4 * g);
  plkMix.R[n] = (plkBus.R[n] * 1.3 + melBus.R[n] * 1.0) * (0.6 + 0.4 * g);
}
const echo = pingPong2(plkMix.L, plkMix.R, 0.5, 0.45);
const sendMono = new Float32Array(N);
for (let n = 0; n < N; n++) sendMono[n] = (padBus.L[n] + padBus.R[n]) * 0.35 + (plkMix.L[n] + plkMix.R[n]) * 0.5 + (echo.L[n] + echo.R[n]) * 0.2 + (fxBus.L[n] + fxBus.R[n]) * 0.15;
const rev = reverb(sendMono);
for (let n = 0; n < N; n++) {
  outL[n] = padBus.L[n] * scPad[n] * 1.0 + plkMix.L[n] * 1.0 + echo.L[n] + bassBus.L[n] * scBass[n] * 0.95 + drumBus.L[n] * 0.9 + fxBus.L[n] * 0.7 + rev.L[n] * 1.5;
  outR[n] = padBus.R[n] * scPad[n] * 1.0 + plkMix.R[n] * 1.0 + echo.R[n] + bassBus.R[n] * scBass[n] * 0.95 + drumBus.R[n] * 0.9 + fxBus.R[n] * 0.7 + rev.R[n] * 1.5;
}
/* the outro is calmer: pull the drums/bass tail, add the closing fade */
for (let n = 0; n < N; n++) {
  const tt = t(n);
  const fadeIn = Math.min(1, tt / 0.05);
  const fadeOut = tt > DUR - FADE_OUT ? Math.pow(Math.cos(((tt - (DUR - FADE_OUT)) / FADE_OUT) * Math.PI * 0.5), 2) : 1;
  outL[n] *= fadeIn * fadeOut; outR[n] *= fadeIn * fadeOut;
}
/* DC / sub rumble removal */
{ let xl = 0, yl = 0, xr = 0, yr = 0; const R = 0.9955; for (let n = 0; n < N; n++) { const a = outL[n], b = outR[n]; yl = a - xl + R * yl; xl = a; yr = b - xr + R * yr; xr = b; outL[n] = yl; outR[n] = yr; } }

/* ------------------------------------------------------------------ loudness (ITU-R BS.1770, K-weighted, gated) */
function biquad(b0, b1, b2, a1, a2, x) { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; }
function kWeight(x) {
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / SR), Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.499666774155);
  let a0 = 1 + K / Q + K * K;
  const s1 = biquad((Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0, x);
  f0 = 38.13547087602444; Q = 0.5003270373238773; K = Math.tan((Math.PI * f0) / SR); a0 = 1 + K / Q + K * K;
  return biquad(1, -2, 1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0, s1);
}
function lufs(l, r) {
  const kl = kWeight(l), kr = kWeight(r), bl = Math.round(0.4 * SR), step = Math.round(0.1 * SR), z = [];
  for (let s = 0; s + bl <= l.length; s += step) { let a = 0, b = 0; for (let i = s; i < s + bl; i++) { a += kl[i] * kl[i]; b += kr[i] * kr[i]; } z.push((a + b) / bl); }
  const L = (m) => -0.691 + 10 * Math.log10(m);
  const abs = z.filter((m) => L(m) > -70);
  const rel = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const g = abs.filter((m) => L(m) > rel);
  return L(g.reduce((a, b) => a + b, 0) / g.length);
}
const TARGET = -16;
let measured = lufs(outL, outR);
let gain = Math.pow(10, (TARGET - measured) / 20);
for (let n = 0; n < N; n++) { outL[n] *= gain; outR[n] *= gain; }
/* soft limiter: only touches peaks above -2 dBFS, ceiling -1 dBFS */
const CEIL = Math.pow(10, -1 / 20), KNEE = Math.pow(10, -3 / 20);
const lim = (x) => { const a = Math.abs(x); if (a <= KNEE) return x; const o = KNEE + (CEIL - KNEE) * Math.tanh((a - KNEE) / (CEIL - KNEE)); return Math.sign(x) * o; };
for (let n = 0; n < N; n++) { outL[n] = lim(outL[n]); outR[n] = lim(outR[n]); }
let peak = 0; for (let n = 0; n < N; n++) peak = Math.max(peak, Math.abs(outL[n]), Math.abs(outR[n]));
const final = lufs(outL, outR);

/* ------------------------------------------------------------------ write WAV */
const data = Buffer.alloc(N * 4);
for (let n = 0; n < N; n++) { data.writeInt16LE(Math.round(clamp(outL[n], -1, 1) * 32767), n * 4); data.writeInt16LE(Math.round(clamp(outR[n], -1, 1) * 32767), n * 4 + 2); }
const head = Buffer.alloc(44);
head.write("RIFF", 0); head.writeUInt32LE(36 + data.length, 4); head.write("WAVE", 8); head.write("fmt ", 12); head.writeUInt32LE(16, 16);
head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22); head.writeUInt32LE(SR, 24); head.writeUInt32LE(SR * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34);
head.write("data", 36); head.writeUInt32LE(data.length, 40);
fs.mkdirSync(path.join(here, "out"), { recursive: true });
const file = path.join(here, "out", "luna-music.wav");
fs.writeFileSync(file, Buffer.concat([head, data]));
console.log(`Wrote ${file}: ${DUR}s, ${SR} Hz stereo, integrated ${final.toFixed(1)} LUFS (pre-limiter ${(measured + 20 * Math.log10(gain)).toFixed(1)}), peak ${(20 * Math.log10(peak)).toFixed(2)} dBFS`);
