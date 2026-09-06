# AGENTS.md

Chaos 2048 — a single-page 2048 variant where random "chaos" events (swap, freeze, gravity hold, board rotation) fire while playing. Vanilla JS: no build step, no dependencies, no modules.

## Run & verify

- Open `index.html` directly in a browser (or serve the directory statically). No install, no build.
- On load, `js/selftest.js` runs in-page self-tests and logs to the console; success = `SELF-TESTS: all passed`. This is the only test harness — check the browser console after changes.

## Layout & load order

Plain `<script>` tags at the end of `<body>`, loaded in this order. All files share one global scope (no imports) — keep the load order intact.

1. `js/state.js` — constants (`SIZE=4`, `CELL/GAP/PAD`, 460px board), DOM refs (`$` helper), mutable game state (`tiles`, `score`, `best`, `status`), high-score persistence.
2. `js/board.js` — board construction, tile DOM sync, `addRandomTile` (90% 2 / 10% 4, returns false when full), core `move(dir)` (edge-first slide+merge; per-tile `merged` flag reset after each call), `canMove()` / `simMove()` dry run on a scratch grid.
3. `js/chaos.js` — chaos event system: weighted roulette (`CHAOS_TYPES`), settings persistence, gravity-hold + rotation mechanics, `chaosTick()` (driven by a 100ms `setInterval` in game.js).
4. `js/game.js` — game flow (`applyMove`, `tryMove`, `gameOver`, overlays), input (arrow keys/Esc; non-passive touch listeners that claim swipe gestures so the page can't scroll mid-game), responsive `fitBoard()`, chaos menu wiring, init.
5. `js/selftest.js` — IIFE self-tests; each mutates real game state and restores what it touched.

## Architecture invariants

- **State machine**: `status` ∈ `'menu' | 'playing' | 'over' | 'won'`; `tryMove` / `chaosTick` act only while playing.
- **Single game-over path**: `gameOver(reason)` (records the run, shows overlay). A stuck board under a gravity hold is NOT game over — chaos can recreate merges, so it's only checked when no hold is active (`applyMove`, `doChaos`).
- **One tile per player move**: `applyMove(dir, isPlayer)` spawns exactly one tile for a successful *player* move; the automatic gravity settle (`isPlayer=false`) never spawns. A real move always frees ≥1 cell, so spawn can't fail.
- **Gravity hold**: continuous pull direction (`gravityDir`); the player may also move with the pull — only moving against it is blocked (`HOLD_DIRS` lists legal directions). After each player move the board auto-settles in the pull direction so score/win/game-over checks see final positions. `canMove()` under a hold counts only legal directions. Any new chaos event ends the previous hold (`doChaos` calls `clearGravity()`).
- **Rotation is view-only**: `boardRot` accumulates quarter-turns (90+90=180); CSS transform only — the logical grid and input are always read in the board's own frame. Persists and accumulates across chaos events; only a new game or return to menu resets it (`clearRotation()`).
- **`CHAOS_TYPES` is the single source of truth** for event types: each entry drives its weight, its menu row, and the roulette roll. Adding an event = one entry; nothing else to touch. Weights are independent 0–100 values normalized at roll time (`rollChaosType()` returns null when all odds are zero → no event fires).
- Tiles are `{id, value, row, col, el}`; `frozen` tiles (freeze chaos) skip moves and merges in both `move()` and `simMove()`.

## Persistence (localStorage)

- `hs2048` — top 5 high scores (`{score, date}`), written once per run by `recordRun()` (skips score 0).
- `best2048` — best score.
- `chaos2048` — chaos settings (interval seconds + per-event weights); values clamped on load, corrupt JSON ignored.

## Conventions

- Plain `'use strict'` scripts with top-level `const`/`let` globals; no modules, bundler, or framework.
- Stylesheets live in `css/` — `base.css`, `menu.css`, `game.css`, `responsive.css`, linked in that order; DOM refs live in `state.js`; the 460px logical board is scaled by `fitBoard()` on resize.
- New behavior that can be checked without a human gets an entry in `js/selftest.js` (restore any state it mutates).
