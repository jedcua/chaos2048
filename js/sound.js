'use strict';

/* ---------- Sound: synthesized effects and background music (Web Audio) ----
   Every cue is built from oscillator notes at play time. The page ships no
   audio files and loads no library. `lastSound` names the effect a call asked
   for, or null while muted; it is what the self-tests assert. The background
   music plays on its own quieter gain and never writes `lastSound`. Without
   an AudioContext every call records its name and plays nothing; the headless
   runner supplies a shim that accepts the schedule. */

const SND_KEY = 'sound2048';
let soundOn = localStorage.getItem(SND_KEY) !== '0'; // default on; only '0' mutes
let lastSound = null;

let audioCtx = null;   // built on the first effect that really plays
let masterGain = null; // one volume knob for every effect
let musicGain = null;  // the quieter knob only the background music uses

// The one way to change the mute flag: save it and update the settings button.
function setSoundOn(on) {
  soundOn = !!on;
  localStorage.setItem(SND_KEY, soundOn ? '1' : '0');
  // Notes already scheduled inside the music lookahead window must die with
  // the toggle, so the music knob itself goes to zero.
  if (musicGain) musicGain.gain.value = soundOn ? MUSIC_LEVEL : 0;
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
      const music = ctx.createGain();
      music.gain.value = soundOn ? MUSIC_LEVEL : 0;
      music.connect(knob);
      audioCtx = ctx;
      masterGain = knob;
      musicGain = music;
    } catch {
      audioCtx = null;
      masterGain = null;
      musicGain = null;
    }
  }
  return masterGain;
}

// One note: pitch slides from `from` Hz to `to` Hz over `dur` seconds, then
// fades out. `delay` staggers notes inside one effect; `sink` picks the gain
// it lands on, the master knob by default.
function note(from, to, dur, kind, peak, delay, sink) {
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
  gain.connect(sink || masterGain);
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

/* ---------- Background music: an arpeggiated form that develops ----------
   The effects' note builder again, on its own quieter gain. The score is data:
   named note orders over a chord's tones (`MUSIC_PATTERNS`) and a list of bars
   (`MUSIC_PROGRESSION`) — four turns of the opening block (Am7 Dm7 C G) and
   two turns of a lift (C Em F G). One pulse (`MUSIC_BEAT`) runs the whole form,
   so the development changes the harmony, the note order, and the dynamics,
   never the tempo. `musicTick()` keeps a
   small lookahead window full, so the loop survives a throttled tab, and it
   never writes `lastSound` — the effects own that name. */

const MUSIC_ANCHOR = 110;                // Hz: semitone 0 of the tuning ruler
const MUSIC_LEVEL = 0.4;                 // music sits under every effect cue
const MUSIC_BEAT = 0.34;                 // seconds per step: one pulse for the form
const MUSIC_BASS_PEAK = 0.16;
const MUSIC_ARP_PEAK = 0.12;
const MUSIC_LOOKAHEAD = 1.2;             // seconds of music scheduled ahead
const MUSIC_TICK_MS = 250;               // interval between top-ups
const MUSIC_LATE = 0.05;                 // restart gap when the loop falls behind

// Semitones above MUSIC_ANCHOR (A2), so 12 is an octave and 19 a fifth.
// A pattern indexes one bar's chord tones, so index 0 is its lowest tone.
// Every pattern holds six steps and never repeats a tone twice in a row, so
// the pulse stays fixed and no bar stutters.
const MUSIC_PATTERNS = {
  roll: [0, 1, 2, 3, 2, 1], // up the chord, back down: the opening block
  leap: [0, 2, 1, 3, 2, 3], // stumbles inside the chord, ends high: the lift
};

// One bar = a held bass note under its chord tones. A bar may override the
// pattern and its dynamics (`swell`); the pulse is fixed for the whole form.
const MUSIC_OPENING = [ // Am7 Dm7 C G: the opening block, plain and even
  { bass: 0,  arp: [12, 15, 19, 24] }, // Am7: A + A C E A
  { bass: 5,  arp: [12, 15, 20, 24] }, // Dm7: D + A C F A
  { bass: 3,  arp: [10, 15, 19, 27] }, // C:   C + G C E C
  { bass: -2, arp: [10, 14, 17, 27] }, // G:   G + G B D C
];
const MUSIC_LIFT = [ // C Em F G: brighter, busier, a touch louder
  { bass: 3,  arp: [10, 15, 19, 27], pattern: 'leap', swell: 1.15 }, // C:  C + G C E C
  { bass: 7,  arp: [10, 14, 19, 26], pattern: 'leap', swell: 1.15 }, // Em: E + G B E B
  { bass: 8,  arp: [12, 15, 20, 24], pattern: 'leap', swell: 1.15 }, // F:  F + A C F A
  { bass: -2, arp: [10, 14, 17, 27], pattern: 'leap', swell: 1.15 }, // G:  G + G B D C
];
// Four turns of the opening block, two turns of the lift, then the wrap back
// to Am7: the closing G rises a whole step into the opening root A.
const MUSIC_PROGRESSION = [
  ...MUSIC_OPENING, ...MUSIC_OPENING, ...MUSIC_OPENING, ...MUSIC_OPENING,
  ...MUSIC_LIFT, ...MUSIC_LIFT,
];

function semitoneHz(n) {
  return MUSIC_ANCHOR * Math.pow(2, n / 12);
}

// A bar's note order and its length in seconds. Every pattern holds the same
// number of steps, so every bar lasts the same time.
function barPattern(bar) {
  return MUSIC_PATTERNS[bar.pattern || 'roll'];
}
function barSeconds(bar) {
  return barPattern(bar).length * MUSIC_BEAT;
}

// One bar `delay` seconds from now: the bass runs the whole bar, the arpeggio
// steps every beat and overlaps its neighbour a little. `swell` moves the whole
// bar's dynamics, so the tension bars sit louder without touching the effects.
function scheduleBar(bar, delay) {
  const swell = bar.swell || 1;
  const pattern = barPattern(bar);
  const length = pattern.length * MUSIC_BEAT;
  const root = semitoneHz(bar.bass);
  note(root, root, length, 'sine', MUSIC_BASS_PEAK * swell, delay, musicGain);
  for (let i = 0; i < pattern.length; i++) {
    const f = semitoneHz(bar.arp[pattern[i]]);
    note(f, f, MUSIC_BEAT * 1.5, 'triangle', MUSIC_ARP_PEAK * swell, delay + i * MUSIC_BEAT, musicGain);
  }
}

let musicClock = null; // absolute time of the next bar, null until the first tick
let musicBar = 0;      // which bar of the form comes next

function musicTick() {
  if (!soundOn) return; // muted: the loop schedules nothing
  if (!audio()) return; // builds the engine on the first tick, or says it is unavailable
  const now = audioCtx.currentTime;
  // A loop that fell behind (throttled tab, muted stretch) restarts ahead of
  // the clock: a note in the past would play as a garbled burst.
  if (musicClock === null || musicClock < now) musicClock = now + MUSIC_LATE;
  while (musicClock < now + MUSIC_LOOKAHEAD) {
    const bar = MUSIC_PROGRESSION[musicBar % MUSIC_PROGRESSION.length];
    scheduleBar(bar, musicClock - now);
    musicBar++;
    musicClock += barSeconds(bar);
  }
}

// The loop's driver: one slow interval, not one timer per note.
setInterval(musicTick, MUSIC_TICK_MS);
