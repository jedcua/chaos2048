'use strict';

/* ---------- Game flow ---------- */
const GAME_OVER_REASONS = {
  noMoves: 'No moves left — nothing can slide or merge.',
};

// The single game-over path: records the run and shows the reason.
function gameOver(reason) {
  if (status !== 'playing') return;
  status = 'over';
  lastGameOverReason = reason;
  recordRun();
  showOverlay('Game Over', reason + '<br>Final score: ' + score.toLocaleString(), 'Play Again', startGame, 'Menu', toMenu);
}

// Shared post-move pipeline for player moves and gravity pulls:
// the per-move tile (player moves only), score, win check, game-over check.
function applyMove(dir, isPlayer) {
  const { moved, gained } = move(dir);
  if (!moved) return;

  // Gravity hold: player moves are perpendicular to the pull. Settle the
  // board in the pull direction right away — any tile that can still move
  // there does — so scoring and the win/game-over checks below see the
  // final positions.
  let total = gained;
  if (gravityDir && gravityDir !== dir) total += move(gravityDir).gained;

  // Classic 2048: a successful *player* move spawns one tile. The automatic
  // gravity settle is not a player move, so it never spawns. A real move
  // always frees at least one cell (a slide needs a gap, a merge frees one),
  // so this can't fail.
  if (isPlayer) addRandomTile();

  if (total > 0) addScoreFloat(total);
  score += total;
  if (score > best) {
    best = score;
    localStorage.setItem(BEST_KEY, String(best));
  }
  updateScores();

  if (!won && tiles.some(t => t.value >= 2048)) {
    won = true;
    status = 'won';
    showOverlay('You win!', `${score.toLocaleString()} points`, 'Keep Going', () => { status = 'playing'; hideOverlay(); }, 'New Game', startGame);
    return;
  }

  // A stuck board under a gravity hold is NOT game over: the player may have
  // no perpendicular moves (e.g. all tiles pulled into one full edge row with
  // no merges), but chaos keeps reshaping the board — a swap can recreate a
  // merge and a new pull opens other directions — so play resumes on its own.
  if (!gravityDir && !canMove()) gameOver(GAME_OVER_REASONS.noMoves);
}

function tryMove(dir) {
  if (status !== 'playing') return;
  // Board-oriented input: dir is a direction in the board's own frame (the
  // logical grid), not a screen one — "up" always means the board's up edge,
  // wherever that edge appears on screen under the current rotation.
  // Gravity hold: only moves perpendicular to the pull are allowed.
  if (gravityDir && !PERP_DIRS[gravityDir].includes(dir)) { flashGravityBlocked(); return; }
  applyMove(dir, true);
}

function updateScores() {
  scoreEl.textContent = score.toLocaleString();
  bestEl.textContent = best.toLocaleString();
}

function addScoreFloat(n) {
  const el = document.createElement('span');
  el.className = 'float-score';
  el.textContent = '+' + n;
  scoreBox.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function showOverlay(title, text, primaryLabel, primaryFn, secondaryLabel, secondaryFn) {
  overlayTitle.textContent = title;
  overlayText.innerHTML = text; // internal strings only; game over uses a <br>
  overlayPrimary.textContent = primaryLabel;
  overlaySecondary.textContent = secondaryLabel;
  overlayPrimary.onclick = () => { hideOverlay(); primaryFn(); };
  overlaySecondary.onclick = () => { hideOverlay(); secondaryFn(); };
  overlay.classList.remove('hidden');
}

function hideOverlay() { overlay.classList.add('hidden'); }

function startGame() {
  for (const t of tiles) t.el.remove();
  tiles = [];
  score = 0;
  won = false;
  runRecorded = false;
  status = 'playing';
  chaosRemaining = chaosSeconds * 1000;
  nextChaos = rollChaosType(); // first event of the game, shown on the timer
  renderChaosCount();
  renderChaosNext();
  updateScores();
  clearGravity();
  clearRotation();
  hideOverlay();
  showScreen('game');
  addRandomTile();
  addRandomTile();
}

function toMenu() {
  recordRun();
  status = 'menu';
  clearGravity();
  clearRotation();
  renderMenu();
  renderChaosMenu();
  showScreen('menu');
}

function showScreen(name) {
  menuScreen.classList.toggle('hidden', name !== 'menu');
  gameScreen.classList.toggle('hidden', name !== 'game');
}

/* ---------- Input ---------- */
const KEY_DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

document.addEventListener('keydown', e => {
  if (status === 'menu') {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startGame(); }
    return;
  }

  const dir = KEY_DIRS[e.key];
  if (dir) {
    e.preventDefault();
    tryMove(dir);
    return;
  }

  if (e.key === 'Escape') { toMenu(); return; }

  // Enter activates the primary overlay button when a game is finished.
  if ((e.key === 'Enter' || e.key === ' ') && !overlay.classList.contains('hidden')) {
    e.preventDefault();
    overlayPrimary.click();
  }
});

$('playBtn').addEventListener('click', e => { e.currentTarget.blur(); startGame(); });
$('newGameBtn').addEventListener('click', e => { e.currentTarget.blur(); recordRun(); startGame(); });
$('menuBtn').addEventListener('click', e => { e.currentTarget.blur(); toMenu(); });

chaosMinus.addEventListener('click', e => { e.currentTarget.blur(); chaosSeconds = Math.max(1, chaosSeconds - 1); saveChaos(); renderChaosMenu(); });
chaosPlus.addEventListener('click', e => { e.currentTarget.blur(); chaosSeconds = Math.min(60, chaosSeconds + 1); saveChaos(); renderChaosMenu(); });
chaosReset.addEventListener('click', e => { e.currentTarget.blur(); resetChaosSettings(); });
chaosToggle.addEventListener('click', e => {
  e.currentTarget.blur();
  const hidden = chaosBody.classList.toggle('hidden'); // true if the body just collapsed
  chaosToggle.setAttribute('aria-expanded', String(!hidden));
});
setInterval(chaosTick, 100);

/* Touch swipe gestures.
   The whole game screen is a play surface: any swipe on it is a move, and the
   preventDefault() below claims the gesture for the game — the page can't
   scroll and the browser can't do edge-swipe navigation mid-game. That needs
   a non-passive listener (passive ones can't cancel the default scroll). */
let touchStart = null, touchLocked = false;
gameScreen.addEventListener('touchstart', e => {
  if (e.touches.length === 1) { touchStart = e.touches[0]; touchLocked = false; }
}, { passive: true });
gameScreen.addEventListener('touchmove', e => {
  e.preventDefault(); // this gesture belongs to the game, never the page
  if (!touchStart || touchLocked) return;
  const t = e.touches[0];
  const dx = t.clientX - touchStart.clientX;
  const dy = t.clientY - touchStart.clientY;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return; // dead zone: taps & jitters
  touchLocked = true; // one move per swipe
  tryMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
}, { passive: false });
const endTouch = () => { touchStart = null; touchLocked = false; };
gameScreen.addEventListener('touchend', endTouch, { passive: true });
gameScreen.addEventListener('touchcancel', endTouch, { passive: true }); // e.g. OS back-gesture interrupts

/* ---------- Responsive scaling ---------- */
function fitBoard() {
  const avail = Math.min(window.innerWidth - 24, 560);
  const s = Math.min(1, avail / BOARD);
  boardWrap.style.transform = `scale(${s})`;
  // Match the area's layout box to the scaled size so the page never overflows.
  boardArea.style.width = BOARD * s + 'px';
  boardArea.style.height = BOARD * s + 'px';
}
window.addEventListener('resize', fitBoard);

/* ---------- Init ---------- */
buildCells();
buildChaosRows();
renderMenu();
renderChaosMenu();
renderChaosCount();
updateScores();
fitBoard();

