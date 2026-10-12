'use strict';

/* ---------- Sound: synthesized effects (Web Audio, no asset files) ----------
   Every effect is built from oscillator notes at play time. The page ships no
   audio files and loads no library. `lastSound` names the effect a call asked
   for, or null while muted; it is what the self-tests assert. Without an
   AudioContext (the headless test run) every call records its name and plays
   nothing. */

const SND_KEY = 'sound2048';
let soundOn = localStorage.getItem(SND_KEY) !== '0'; // default on; only '0' mutes
let lastSound = null;

let audioCtx = null;   // built on the first effect that really plays
let masterGain = null; // one volume knob for every effect

// The one way to change the mute flag: save it and update the settings button.
function setSoundOn(on) {
  soundOn = !!on;
  localStorage.setItem(SND_KEY, soundOn ? '1' : '0');
  soundToggleBtn.textContent = 'Sound: ' + (soundOn ? 'on' : 'off');
}

// The gain every note connects to, or null when audio is unavailable.
function audio() {
  if (!audioCtx) {
    try {
      const ctx = new AudioContext();
      const knob = ctx.createGain();
      knob.gain.value = 0.9;
      knob.connect(ctx.destination);
      audioCtx = ctx;
      masterGain = knob;
    } catch {
      audioCtx = null;
      masterGain = null;
    }
  }
  return masterGain;
}

// One note: pitch slides from `from` Hz to `to` Hz over `dur` seconds, then
// fades out. `delay` staggers notes inside one effect.
function note(from, to, dur, kind, peak, delay) {
  const t0 = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = kind;
  osc.frequency.setValueAtTime(from, t0);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.02, dur * 0.3));
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// Ask for an effect by name, then play its notes. A muted game records nothing
// and plays nothing.
function play(name, notes) {
  if (!soundOn) return;
  lastSound = name;
  if (!audio()) return;
  for (const n of notes) note(n[0], n[1], n[2], n[3], n[4], n[5]);
}

/* ---------- Effect cues ---------- */
// Bigger tiles merge deeper: each doubling drops the pitch by 45 Hz.
function mergeFreq(value) {
  return 700 - 45 * Math.log2(value);
}

function sndMerge(value) {
  const f = mergeFreq(value);
  play('merge', [
    [f, f * 1.5, 0.16, 'triangle', 0.16, 0],
    [f * 1.5, f * 2.25, 0.2, 'sine', 0.07, 0.05],
  ]);
}

function sndSpawn() {
  play('spawn', [[240, 300, 0.09, 'sine', 0.05, 0]]);
}

// A move the rules refuse: one dull thud.
function sndBlocked() {
  play('blocked', [[170, 110, 0.12, 'square', 0.07, 0]]);
}

function sndStart() {
  play('start', [
    [430, 645, 0.14, 'triangle', 0.12, 0],
    [645, 860, 0.16, 'sine', 0.08, 0.12],
  ]);
}

function sndWin() {
  play('win', [
    [523, 523, 0.16, 'triangle', 0.14, 0],
    [659, 659, 0.16, 'triangle', 0.14, 0.14],
    [784, 784, 0.16, 'triangle', 0.14, 0.28],
    [1046, 1310, 0.4, 'sine', 0.16, 0.42],
  ]);
}

// Losing walks down a minor third; the last note hangs.
function sndGameOver() {
  play('gameOver', [
    [415, 415, 0.2, 'triangle', 0.14, 0],
    [311, 311, 0.2, 'triangle', 0.13, 0.18],
    [208, 150, 0.7, 'sine', 0.15, 0.36],
  ]);
}

// Tension tick: the chaos timer is inside its danger window.
function sndDanger() {
  play('danger', [[130, 110, 0.06, 'sine', 0.05, 0]]);
}

/* Chaos cues, keyed by CHAOS_TYPES key. An event with no entry here plays the
   generic cue, so a new event type still makes a sound with no other change. */
const CHAOS_CUES = {
  swap: [[280, 900, 0.18, 'sine', 0.1, 0], [900, 280, 0.18, 'sine', 0.1, 0.18]],
  freeze: [[1500, 1440, 0.5, 'sine', 0.12, 0], [1800, 1730, 0.4, 'sine', 0.06, 0.06]],
  gravity: [[110, 70, 0.5, 'sine', 0.2, 0], [70, 130, 0.4, 'triangle', 0.08, 0.1]],
  rotate: [[500, 700, 0.12, 'triangle', 0.1, 0], [700, 900, 0.12, 'triangle', 0.1, 0.12], [900, 500, 0.14, 'triangle', 0.08, 0.24]],
  halve: [[760, 380, 0.3, 'triangle', 0.14, 0]],
};
const CHAOS_CUE_DEFAULT = [[400, 700, 0.2, 'triangle', 0.1, 0], [700, 400, 0.2, 'sine', 0.08, 0.2]];

function sndChaos(key) {
  play(key, CHAOS_CUES[key] || CHAOS_CUE_DEFAULT);
}
