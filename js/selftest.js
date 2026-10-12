'use strict';

/* ---------- Self-tests ---------- */
// Never auto-runs: invoke explicitly — headless via `node test/run.js` or
// from the devtools console. They mutate real game state, so each test
// restores what it touched. Returns `{ lines, failed }`.
function runSelfTests() {
  const lines = [];
  function test(name, fn) {
    let ok = false, err = '';
    try { ok = !!fn(); } catch (e) { err = e && e.message ? e.message : String(e); }
    lines.push((ok ? 'PASS' : 'FAIL') + '  ' + name + (err ? '  (' + err + ')' : ''));
  }

  function clearBoard() { for (const t of tiles) t.el.remove(); tiles.length = 0; }
  function place(r, c, v) {
    const t = { id: ++tileSeq, value: v, row: r, col: c, el: null };
    t.el = document.createElement('div');
    updateTileEl(t);
    board.appendChild(t.el);
    tiles.push(t);
    return t;
  }
  function fillFull(v) { for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) place(r, c, typeof v === 'function' ? v(r, c) : v); }
  test('addRandomTile places a tile when space is free', () => {
    clearBoard();
    const ok = addRandomTile() === true && tiles.length === 1;
    clearBoard();
    return ok;
  });

  test('addRandomTile refuses when the board is full', () => {
    clearBoard();
    fillFull(2);
    const ok = addRandomTile() === false && tiles.length === SIZE * SIZE;
    clearBoard();
    return ok;
  });

  test('a successful player move spawns exactly one tile', () => {
    clearBoard();
    place(3, 0, 2); // a lone tile that can slide up
    status = 'playing'; score = 0; won = false; runRecorded = false;
    const before = tiles.length;
    applyMove('up', true); // player move: isPlayer → per-move spawn
    const ok = tiles.length === before + 1 && tiles.some(t => t.row === 0);
    clearBoard(); status = 'menu';
    return ok;
  });

  test('a player move that changes nothing spawns no tile', () => {
    clearBoard();
    place(0, 0, 2); // already at the top edge; up does nothing
    status = 'playing'; score = 0; won = false; runRecorded = false;
    const before = tiles.length;
    applyMove('up', true); // not a real move → no spawn, no game over
    const ok = tiles.length === before && status === 'playing';
    clearBoard(); status = 'menu';
    return ok;
  });

  test('the automatic gravity settle spawns no tile', () => {
    clearBoard();
    place(3, 0, 2); // can slide up under a hold
    status = 'playing'; score = 0; won = false; runRecorded = false;
    const before = tiles.length;
    applyMove('up'); // gravity pull: isPlayer omitted → no spawn
    const ok = tiles.length === before && tiles.every(t => t.row === 0);
    clearBoard(); status = 'menu';
    return ok;
  });

  test('canMove() is false on a full mergeless board', () => {
    clearBoard();
    fillFull((r, c) => (r + c) % 2 ? 4 : 2); // checkerboard: no adjacent equals
    const ok = canMove() === false;
    clearBoard();
    return ok;
  });

  test('no spurious game over when gravity pins all tiles to one edge', () => {
    clearBoard();
    place(1, 0, 2); place(2, 1, 4); place(3, 2, 8); place(1, 3, 16);
    status = 'playing'; score = 0; won = false; runRecorded = false;
    gravityDir = 'up'; // active hold, as chaosGravity() would set it
    applyMove('up'); // the pending pull: all four tiles land in row 0
    // Board is now stuck (no legal moves) but 12 cells are empty,
    // so the game must keep running until chaos reshapes it.
    const ok = canMove() === false && status === 'playing' &&
      tiles.length === 4 && tiles.every(t => t.row === 0);
    clearBoard(); clearGravity(); status = 'menu';
    return ok;
  });

  test('gravity hold allows moving with the pull but not against it', () => {
    clearBoard();
    place(2, 0, 2);
    status = 'playing'; score = 0; won = false; runRecorded = false;
    gravityDir = 'down';
    tryMove('down'); // with the pull: must go through and settle to row 3
    const withPull = tiles.length === 2 && tiles.some(t => t.row === 3);
    clearBoard();
    place(2, 0, 2);
    tryMove('up'); // against the pull: still blocked
    const against = tiles.length === 1 && tiles[0].row === 2;
    clearBoard(); clearGravity(); status = 'menu';
    return withPull && against;
  });

  test('rotate chaos spins the board a quarter turn', () => {
    const saved = boardRot;
    const start = boardRot;
    chaosRotate();
    const delta = boardRot - start;
    const ok = (delta === 1 || delta === -1) &&
      boardRotEl.style.transform === 'rotate(' + boardRot * 90 + 'deg)';
    boardRot = saved; renderBoardRot();
    return ok;
  });
  test('halve event halves the highest tile and spares 2s', () => {
    clearBoard();
    place(0, 0, 4);
    place(1, 1, 8);
    chaosHalve();
    const hit = tiles.length === 2 &&
      tiles.every(t => t.value === 4 && String(t.el.textContent) === '4');
    clearBoard();
    place(0, 0, 8);
    place(1, 1, 8);
    place(2, 2, 4);
    chaosHalve();
    const tie = tiles.length === 3 &&
      tiles.filter(t => t.value === 8).length === 1 &&
      tiles.filter(t => t.value === 4).length === 2;
    clearBoard();
    place(0, 0, 2);
    place(1, 1, 2);
    chaosHalve();
    const safe = tiles.length === 2 && tiles.every(t => t.value === 2);
    return hit && tie && safe;
  });

  test("input is read in the board's own frame under any rotation", () => {
    const saved = boardRot;
    let ok = true;
    for (const rot of [0, 1, 2, 3]) {
      boardRot = rot; renderBoardRot();
      clearBoard();
      place(3, 0, 2); // lone tile at the bottom edge
      status = 'playing'; score = 0; won = false; runRecorded = false;
      tryMove('up'); // "up" always means the board's up edge — logical row 0
      ok = ok && tiles[0].row === 0;
      clearBoard(); status = 'menu';
    }
    boardRot = saved; renderBoardRot();
    return ok;
  });

  test('rotate persists & accumulates across chaos events', () => {
    const saved = boardRot, savedNext = nextChaos, savedPcts = { ...chaosPcts };
    let ok = true;
    for (const k of Object.keys(chaosPcts)) chaosPcts[k] = 0; // re-roll → null
    clearBoard();
    // A non-rotate chaos event must leave an existing turn in place (no reset).
    boardRot = 1; renderBoardRot();
    nextChaos = CHAOS_TYPES.find(t => t.key === 'swap');
    doChaos();
    ok = ok && boardRot === 1;
    // A rotate on top of that turn accumulates (1 → 2 or 0) instead of snapping
    // back to a single quarter turn from upright.
    nextChaos = CHAOS_TYPES.find(t => t.key === 'rotate');
    doChaos();
    ok = ok && (boardRot === 2 || boardRot === 0);
    // clearRotation() still resets to upright — the path startGame()/toMenu() use.
    boardRot = 3; clearRotation();
    ok = ok && boardRot % 4 === 0;
    clearBoard();
    for (const k of Object.keys(savedPcts)) chaosPcts[k] = savedPcts[k];
    boardRot = saved; renderBoardRot();
    nextChaos = savedNext;
    renderChaosNext();
    return ok;
  });

  test('resetChaosSettings() restores default interval and weights', () => {
    const saved = { ...chaosPcts }, savedSecs = chaosSeconds;
    for (const k of Object.keys(chaosPcts)) chaosPcts[k] = 0;
    chaosSeconds = 7;
    resetChaosSettings();
    const ok = chaosSeconds === CHAOS_DEF_SECS &&
      CHAOS_TYPES.every(t => chaosPcts[t.key] === t.def) &&
      JSON.parse(localStorage.getItem(CHAOS_KEY)).secs === CHAOS_DEF_SECS;
    for (const k of Object.keys(saved)) chaosPcts[k] = saved[k]; // restore in-memory values
    chaosSeconds = savedSecs;
    saveChaos();                                                  // ...and the persisted settings
    renderChaosMenu();             // ...and the menu, which resetChaosSettings() re-rendered with defaults
    return ok;
  });

  test('chaos settings accordion toggles on header click', () => {
    chaosToggle.click();
    const opened = !chaosBody.classList.contains('hidden') &&
      chaosToggle.getAttribute('aria-expanded') === 'true';
    chaosToggle.click(); // back to the default collapsed state
    return opened && chaosBody.classList.contains('hidden') &&
      chaosToggle.getAttribute('aria-expanded') === 'false';
  });

  test('gameOver() stores the reason and shows it in the overlay', () => {
    status = 'playing'; score = 0; won = false; runRecorded = false;
    gameOver('self-test reason');
    const ok = status === 'over' && lastGameOverReason === 'self-test reason' && overlayText.innerHTML.includes('self-test reason');
    hideOverlay(); status = 'menu';
    return ok;
  });

  test('rollChaosType() picks by weight and null when all odds are zero', () => {
    const saved = { ...chaosPcts };
    for (const k of Object.keys(chaosPcts)) chaosPcts[k] = k === 'swap' ? 100 : 0;
    let ok = rollChaosType().key === 'swap';
    for (const k of Object.keys(chaosPcts)) chaosPcts[k] = 0;
    ok = ok && rollChaosType() === null;
    for (const k of Object.keys(saved)) chaosPcts[k] = saved[k];
    return ok;
  });

  test('doChaos() runs the pre-rolled event and re-rolls for the label', () => {
    clearBoard();
    const saved = { ...chaosPcts };
    const savedNext = nextChaos;
    for (const k of Object.keys(chaosPcts)) chaosPcts[k] = 0; // so the re-roll is null
    nextChaos = CHAOS_TYPES.find(t => t.key === 'freeze');
    doChaos();
    const ok = nextChaos === null && chaosNextEl.textContent === '\u2014';
    clearBoard();
    for (const k of Object.keys(saved)) chaosPcts[k] = saved[k];
    nextChaos = savedNext;
    renderChaosNext();
    return ok;
  });

  test('renderChaosNext() shows the pre-rolled event name', () => {
    const savedNext = nextChaos;
    nextChaos = CHAOS_TYPES.find(t => t.key === 'freeze');
    renderChaosNext();
    const ok = chaosNextEl.textContent === 'Freeze';
    nextChaos = savedNext;
    renderChaosNext();
    return ok;
  });

  test('swipes on the game screen move tiles and never scroll the page', () => {
    if (typeof Touch === 'undefined' || typeof TouchEvent === 'undefined') return true; // skip: old browsers
    clearBoard();
    place(3, 0, 2);
    status = 'playing'; score = 0; won = false; runRecorded = false;
    const fire = (type, x, y) => {
      const ev = new TouchEvent(type, {
        bubbles: true, cancelable: true,
        touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: gameScreen, clientX: x, clientY: y })],
      });
      gameScreen.dispatchEvent(ev);
      return ev;
    };
    const saved = boardRot;
    fire('touchstart', 200, 300);
    const small = fire('touchmove', 200, 290); // dead zone: no move yet, but scroll must already be cancelled
    const held = small.defaultPrevented && tiles[0].row === 3;
    const big = fire('touchmove', 200, 250);    // 50px up: swipe up
    fire('touchend');
    // A successful player move spawns one tile: the moved one plus the new one.
    const moved = held && big.defaultPrevented && tiles.length === 2 && tiles[0].row === 0 && score === 0;
    clearBoard();
    // Rotated board: a swipe up still means the board's up edge (logical row 0).
    boardRot = 1; renderBoardRot();
    place(3, 0, 2);
    fire('touchstart', 200, 300);
    fire('touchmove', 200, 250);
    const rotated = tiles[0].row === 0;
    boardRot = saved; renderBoardRot();
    touchStart = null; touchLocked = false;
    clearBoard(); hideOverlay(); status = 'menu';
    return moved && rotated;
  });

  test('addRandomTile asks for the spawn cue', () => {
    clearBoard();
    addRandomTile();
    const ok = lastSound === 'spawn';
    clearBoard();
    return ok;
  });

  test('a merge asks for the merge cue', () => {
    clearBoard();
    place(3, 0, 2); place(3, 1, 2);
    move('left'); // merge path only: the per-move spawn cue would overwrite it
    const ok = lastSound === 'merge';
    clearBoard();
    return ok;
  });

  test('a move that changes nothing asks for the blocked cue', () => {
    clearBoard();
    place(0, 0, 2); // already at the top edge; up does nothing
    status = 'playing'; score = 0; won = false; runRecorded = false;
    applyMove('up', true);
    const ok = lastSound === 'blocked';
    clearBoard(); status = 'menu';
    return ok;
  });

  test('each chaos event asks for its own cue', () => {
    let ok = true;
    for (const t of CHAOS_TYPES) ok = ok && (sndChaos(t.key), lastSound === t.key);
    return ok;
  });

  test('merge pitch drops as the tile value grows', () => {
    return mergeFreq(2) > mergeFreq(4) && mergeFreq(2048) < mergeFreq(1024);
  });

  test('the danger tick fires once per second inside the danger window', () => {
    const savedSecs = chaosSeconds, savedRemaining = chaosRemaining, savedLast = lastDangerSec;
    chaosSeconds = 3;
    chaosRemaining = 1000; // inside the 1s window renderChaosCount() paints
    const first = dangerTick();
    const repeat = dangerTick(); // same whole second → no second tick
    chaosRemaining = 2900; // outside the window → no tick
    const outside = dangerTick();
    const ok = first === true && repeat === false && outside === false;
    chaosSeconds = savedSecs; chaosRemaining = savedRemaining; lastDangerSec = savedLast;
    return ok;
  });

  test('setSoundOn(false) silences every cue and saves the flag', () => {
    const saved = localStorage.getItem(SND_KEY);
    const before = lastSound;
    setSoundOn(false);
    const shown = soundToggleBtn.textContent === 'Sound: off';
    sndMerge(4); // muted: nothing is recorded
    const silent = lastSound === before;
    setSoundOn(true);
    if (saved === null) localStorage.removeItem(SND_KEY);
    else localStorage.setItem(SND_KEY, saved);
    return shown && silent && soundOn === true;
  });

  test('the music tuning ruler: an octave doubles the pitch', () => {
    return semitoneHz(12) === 2 * semitoneHz(0) && 2 * semitoneHz(-12) === semitoneHz(0);
  });

  test('every bar names a pattern that exists and steps inside its own chord', () => {
    for (const bar of MUSIC_PROGRESSION) {
      const pattern = MUSIC_PATTERNS[bar.pattern || 'roll'];
      if (!pattern) return false;
      for (const step of pattern) if (step >= bar.arp.length) return false;
    }
    return MUSIC_PROGRESSION.length >= 2;
  });

  test('musicTick() tops up the lookahead window with whole bars', () => {
    const savedClock = musicClock, savedBar = musicBar;
    musicTick(); // the first tick builds the audio engine
    musicClock = audioCtx.currentTime + 0.1; // a window with room for one more bar
    const longest = Math.max(...MUSIC_PROGRESSION.map(barSeconds));
    const barBefore = musicBar;
    musicTick();
    const ok = musicBar > barBefore
      && musicClock >= audioCtx.currentTime + MUSIC_LOOKAHEAD
      && musicClock < audioCtx.currentTime + MUSIC_LOOKAHEAD + longest;
    musicClock = savedClock; musicBar = savedBar;
    return ok;
  });

  test('a loop behind the audio clock restarts ahead of it, never in the past', () => {
    const savedClock = musicClock, savedBar = musicBar;
    musicClock = audioCtx.currentTime - 3;
    musicTick();
    const ok = musicClock >= audioCtx.currentTime && musicBar > savedBar;
    musicClock = savedClock; musicBar = savedBar;
    return ok;
  });


  test('the form turns the opening block four times and the lift twice', () => {
    const key = (b) => b.bass + ':' + b.arp.join();
    if (MUSIC_PROGRESSION.length !== 24) return false;
    const opening = MUSIC_PROGRESSION.slice(0, 4).map(key);
    const lift = MUSIC_PROGRESSION.slice(16, 20).map(key);
    for (let i = 0; i < 24; i += 4) {
      const want = i < 16 ? opening : lift;
      for (let j = 0; j < 4; j++) if (key(MUSIC_PROGRESSION[i + j]) !== want[j]) return false;
    }
    return true;
  });

  test('the lift plays louder than the opening block, which stays even', () => {
    const swells = MUSIC_PROGRESSION.map((b) => b.swell || 1);
    return Math.max(...swells) > swells[0] && swells.slice(0, 16).every((s) => s === swells[0]);
  });
  test('the lift introduces chords the opening block never plays', () => {
    const key = (b) => b.bass + ':' + b.arp.join();
    const opening = new Set(MUSIC_PROGRESSION.slice(0, 4).map(key));
    return MUSIC_PROGRESSION.slice(16, 20).filter((b) => !opening.has(key(b))).length >= 2;
  });

  test('every pattern holds the same number of steps, so the pulse stays fixed', () => {
    const lengths = new Set(Object.values(MUSIC_PATTERNS).map((p) => p.length));
    return lengths.size === 1;
  });

  test('every bar lasts the same time, so the loop keeps one pulse', () => {
    const seconds = MUSIC_PROGRESSION.map(barSeconds);
    return seconds.every((s) => s === seconds[0]);
  });

  test('the lift changes the note order, not just the chords', () => {
    const patterns = new Set(MUSIC_PROGRESSION.map((b) => b.pattern || 'roll'));
    return patterns.size >= 2;
  });

  test('the wrap resolves back into the opening chord', () => {
    const first = MUSIC_PROGRESSION[0];
    const last = MUSIC_PROGRESSION[MUSIC_PROGRESSION.length - 1];
    // The closing G sits a whole step below the opening root A.
    return first.bass - last.bass === 2;
  });

  test('muting zeroes the music knob and stops the loop', () => {
    const saved = localStorage.getItem(SND_KEY);
    const savedClock = musicClock, savedBar = musicBar;
    setSoundOn(false);
    const silenced = musicGain.gain.value === 0;
    musicTick(); // must schedule nothing
    const stopped = musicClock === savedClock && musicBar === savedBar;
    setSoundOn(true);
    if (saved === null) localStorage.removeItem(SND_KEY);
    else localStorage.setItem(SND_KEY, saved);
    // A real GainNode keeps the value in float32, so compare with a tolerance.
    const restored = Math.abs(musicGain.gain.value - MUSIC_LEVEL) < 1e-6;
    return silenced && stopped && restored;
  });

  test('the music loop never claims an effect name in lastSound', () => {
    const before = lastSound;
    musicTick();
    return lastSound === before;
  });

  console.log('%cChaos 2048 self-tests', 'font-weight:bold');
  for (const l of lines) console.log(l);
  const failed = lines.filter(l => l.startsWith('FAIL')).length;
  console.log(failed ? 'SELF-TESTS: ' + failed + ' FAILED' : 'SELF-TESTS: all passed');
  return { lines, failed };
}
