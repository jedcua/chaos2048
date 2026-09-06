'use strict';

/* ---------- Chaos: settings & events ---------- */
const CHAOS_KEY = 'chaos2048';
const clampPct = p => Math.min(100, Math.max(0, Math.round(p)));

// Single source of truth for chaos event types. Each entry drives its weight
// (chaosPcts[key], saved under `key`), its menu row (label/desc + +/- buttons,
// built by buildChaosRows()) and the weighted roll in doChaos() (run).
// Adding a new event type = one entry here; nothing else to touch.
const CHAOS_TYPES = [
  { key: 'swap',    label: 'Swap',    desc: 'two tiles swap places',            def: 15, run: chaosSwap },
  { key: 'freeze',  label: 'Freeze',  desc: 'a random tile freezes solid',      def: 15, run: chaosFreeze },
  { key: 'gravity', label: 'Gravity', desc: 'keeps pulling; no moving against it', def: 10, run: chaosGravity },
  { key: 'rotate',  label: 'Rotate',  desc: 'spins the board a quarter turn',    def: 10, run: chaosRotate },
];

const CHAOS_DEF_SECS = 3;
let chaosSeconds = CHAOS_DEF_SECS;
// Independent 0–100 weights per event type; doChaos() normalizes them at roll time.
const chaosPcts = {};
for (const t of CHAOS_TYPES) chaosPcts[t.key] = t.def;

try {
  const saved = JSON.parse(localStorage.getItem(CHAOS_KEY));
  if (saved) {
    if (Number.isFinite(saved.secs)) chaosSeconds = Math.min(60, Math.max(1, Math.round(saved.secs)));
    for (const t of CHAOS_TYPES) if (Number.isFinite(saved[t.key])) chaosPcts[t.key] = clampPct(saved[t.key]);
  }
} catch { /* ignore corrupt settings */ }

let chaosRemaining = 0; // ms until next chaos event
let nextChaos = null;  // pre-rolled CHAOS_TYPES entry for when the timer hits 0

function saveChaos() {
  const obj = { secs: chaosSeconds };
  for (const t of CHAOS_TYPES) obj[t.key] = chaosPcts[t.key];
  localStorage.setItem(CHAOS_KEY, JSON.stringify(obj));
}

// The only way to change a weight; keeps the save and the menu in sync.
function setChaosPct(key, p) {
  chaosPcts[key] = clampPct(p);
  saveChaos();
  renderChaosMenu();
}

// Restore all defaults: interval + every event weight.
function resetChaosSettings() {
  chaosSeconds = CHAOS_DEF_SECS;
  for (const t of CHAOS_TYPES) chaosPcts[t.key] = t.def;
  saveChaos();
  renderChaosMenu();
}

const probValueEls = {};

// Build one menu row per CHAOS_TYPES entry into #probRows.
function buildChaosRows() {
  for (const t of CHAOS_TYPES) {
    const row = document.createElement('div');
    row.className = 'prob-row';
    row.innerHTML =
      `<div class="prob-info">` +
      `<span class="prob-name">${t.label}</span>` +
      `<span class="prob-desc">${t.desc}</span>` +
      `</div>` +
      `<button class="btn small" data-step="-5">&minus;</button>` +
      `<span class="prob-value"></span>` +
      `<button class="btn small" data-step="5">+</button>`;
    row.querySelector('[data-step="-5"]').addEventListener('click', e => { e.currentTarget.blur(); setChaosPct(t.key, chaosPcts[t.key] - 5); });
    row.querySelector('[data-step="5"]').addEventListener('click', e => { e.currentTarget.blur(); setChaosPct(t.key, chaosPcts[t.key] + 5); });
    probValueEls[t.key] = row.querySelector('.prob-value');
    probRows.appendChild(row);
  }
}

function renderChaosMenu() {
  chaosValueEl.textContent = chaosSeconds + 's';
  for (const t of CHAOS_TYPES) probValueEls[t.key].textContent = chaosPcts[t.key] + '%';
}

// Countdown display in tenths of a second — ticks once per 100ms interval.
function renderChaosCount() {
  const s = Math.max(0, chaosRemaining / 1000);
  chaosCountEl.textContent = s.toFixed(1);
  const dangerAt = Math.max(1, Math.round(chaosSeconds * 0.3));
  chaosBox.classList.toggle('danger', s <= dangerAt);
}

function renderChaosNext() {
  chaosNextEl.textContent = nextChaos ? nextChaos.label : '—';
}

function chaosSwap() {
  const pool = tiles.filter(t => !t.frozen); // frozen tiles can't move
  if (pool.length < 2) return;
  const i = Math.floor(Math.random() * pool.length);
  let j = Math.floor(Math.random() * (pool.length - 1));
  if (j >= i) j++;
  const a = pool[i], b = pool[j];
  [a.row, b.row] = [b.row, a.row];
  [a.col, b.col] = [b.col, a.col];
  for (const t of [a, b]) {
    updateTileEl(t);
    t.el.classList.remove('swapped');
    void t.el.offsetWidth; // restart animation
    t.el.classList.add('swapped');
    t.el.addEventListener('animationend', () => t.el.classList.remove('swapped'), { once: true });
  }
}

function chaosFreeze() {
  // Only one tile can be frozen: the freeze "moves" to a new random tile.
  for (const t of tiles) if (t.frozen) { t.frozen = false; updateTileEl(t); }
  if (!tiles.length) return;
  const t = tiles[Math.floor(Math.random() * tiles.length)];
  t.frozen = true;
  updateTileEl(t);
  t.el.classList.remove('froze');
  void t.el.offsetWidth; // restart animation
  t.el.classList.add('froze');
  t.el.addEventListener('animationend', () => t.el.classList.remove('froze'), { once: true });
}

// Roulette-wheel pick: subtract each type's own weight from the roll.
// No hand-written cumulative sums, so a new CHAOS_TYPES entry just works.
// Returns null when all odds are zero.
function rollChaosType() {
  const total = CHAOS_TYPES.reduce((s, t) => s + chaosPcts[t.key], 0);
  if (!total) return null;
  let r = Math.random() * total;
  for (const t of CHAOS_TYPES) {
    r -= chaosPcts[t.key];
    if (r < 0) return t;
  }
  return CHAOS_TYPES[CHAOS_TYPES.length - 1]; // float-drift safety net
}

function doChaos() {
  clearGravity(); // any new chaos event ends the previous gravity hold
  // Rotation is deliberately left alone — it persists and accumulates;
  // only startGame()/toMenu() reset it (via clearRotation()).
  if (!nextChaos) return; // no event was rolled (all odds at zero)
  nextChaos.run();
  // A swap or freeze can leave a full board with nothing that can slide or
  // merge. That's terminal when no hold is active — a fresh pull just set one
  // above, so this only fires for the non-gravity events.
  if (!gravityDir && tiles.length === SIZE * SIZE && !canMove()) gameOver(GAME_OVER_REASONS.noMoves);
  nextChaos = rollChaosType(); // pre-roll so the timer can show what's coming
  renderChaosNext();
}

/* Gravity: pull every tile in a random direction, exactly like a player move.
   The pull is continuous — while active (until the next chaos event) the
   board settles in this direction after every player move (see applyMove);
   the player may also move with the pull — only moving against it is
   forbidden. The visual decays with the chaos timer. */
const GRAVITY_DIRS = ['up', 'down', 'left', 'right'];
const GRAVITY_ARROWS = { up: '▲', down: '▼', left: '◀', right: '▶' };
const HOLD_DIRS = { up: ['left', 'right', 'up'], down: ['left', 'right', 'down'], left: ['up', 'down', 'left'], right: ['up', 'down', 'right'] };
let gravityDir = null;   // active pull direction, or null when no hold is in effect
let gravityTimer = null; // pending pull

function chaosGravity() {
  const dir = GRAVITY_DIRS[Math.floor(Math.random() * GRAVITY_DIRS.length)];
  gravityDir = dir;
  showGravityFx(dir);
  // Let the indicator register before the tiles start sliding.
  gravityTimer = setTimeout(() => {
    gravityTimer = null;
    if (status === 'playing') applyMove(dir);
  }, 250);
}

function showGravityFx(dir) {
  gravityArrow.textContent = GRAVITY_ARROWS[dir];
  gravityFx.className = 'grav-' + dir;
  gravityFx.style.opacity = 1; // renderGravityFx() decays it as the timer runs down
}

// Called every chaos tick: fade the indicator out as the next event approaches.
function renderGravityFx() {
  if (!gravityDir) return;
  gravityFx.style.opacity = Math.max(0, chaosRemaining / (chaosSeconds * 1000));
}

function clearGravity() {
  gravityDir = null;
  if (gravityTimer) { clearTimeout(gravityTimer); gravityTimer = null; }
  gravityFx.className = 'hidden';
  gravityArrow.classList.remove('blocked');
}

// Feedback when the player tries a move the gravity hold forbids.
function flashGravityBlocked() {
  gravityArrow.classList.remove('blocked');
  void gravityArrow.offsetWidth; // restart animation
  gravityArrow.classList.add('blocked');
}

/* Rotate: held, cumulative board orientation (like the gravity hold). The
   logical grid never changes — only the view angle; input is always read in the
   board's own frame (see tryMove). Each event adds ±1 quarter-turn on top of the
   current one (90 then 90 = 180°), and it persists across chaos events; only a
   new game or returning to the menu resets it (clearRotation()). */
let boardRot = 0; // accumulated quarter-turns; CSS angle is boardRot * 90deg

function renderBoardRot() {
  boardRotEl.style.transform = 'rotate(' + boardRot * 90 + 'deg)';
}


function chaosRotate() {
  boardRot += Math.random() < .5 ? 1 : -1; // ±90° on top of the current turn, random direction
  renderBoardRot();
}

// Reset to upright — only used when a new game starts or you return to the
// menu. Not called between chaos events (rotation persists & accumulates).
function clearRotation() {
  boardRot = Math.round(boardRot / 4) * 4;
  renderBoardRot();
}

function chaosTick() {
  if (status !== 'playing') return;
  chaosRemaining -= 100;
  if (chaosRemaining <= 0) {
    doChaos();
    chaosRemaining += chaosSeconds * 1000;
  }
  renderChaosCount();
  renderGravityFx();
}

