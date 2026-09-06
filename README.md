# Chaos 2048

A single-page [2048](https://en.wikipedia.org/wiki/2048_(video_game)) variant where random **chaos events** — tile swaps, freezes, gravity holds, and board rotations — strike while you play.

Vanilla JS: no build step, no dependencies, no modules.

## Run

Open `index.html` directly in a browser (or serve the directory statically). No install, no build.

On load, `js/selftest.js` runs in-page self-tests and logs to the console; success prints `SELF-TESTS: all passed`. This is the only test harness — check the browser console after changes.

## Deploying to Netlify

The site is fully static — no build step, no environment variables.

1. Push the repo to GitHub (`origin` → `jedcua/chaos2048`).
2. At [app.netlify.com/add](https://app.netlify.com/add), choose **Import project from Git** and pick the repo.
3. Keep the defaults: no build command, publish directory = repo root (auto-detected for a static site).
4. Click **Deploy site**.

Every push to the default branch redeploys; pull requests get preview deploys. Custom domain goes under *Domain management*. One-off without Git: [drag & drop](https://app.netlify.com/drop) the project folder.

## Play

- **Move**: arrow keys or swipe (touch).
- **Menu**: Esc.
- Tiles merge as in classic 2048; reach the 2048 tile to win.
- High scores: top 5 runs are kept in `localStorage` (`hs2048`) and shown on the menu.

## Chaos events

Every N seconds (default **3s**, adjustable 1–60s from the menu) a weighted roulette picks one event:

| Event   | Default weight | Effect |
|---------|---------------|--------|
| Swap    | 15            | Two random tiles swap places. |
| Freeze  | 15            | A random tile freezes solid — it skips moves and merges. Only one tile can be frozen at a time; each new freeze moves the freeze to another random tile. |
| Gravity | 10            | The board is pulled in a random direction (like an automatic move). While active, the player may only move **perpendicular** to the pull; after each player move the board auto-settles in the pull direction. Ends when the next chaos event fires. |
| Rotate  | 10            | Spins the view a quarter turn (90°), cumulative across events (90+90=180°). Logical grid and input are unaffected — only the CSS transform changes. Resets on a new game or return to menu. |

Weights are independent 0–100 values, normalized at roll time; if all weights are zero, no event fires. Settings persist in `localStorage` (`chaos2048`).
## Project layout

Plain `<script>` tags at the end of `<body>`, loaded in this order. All files share one global scope — keep the load order intact.

| File              | Contents |
|-------------------|----------|
| `js/state.js`     | Constants (`SIZE=4`, 460px board), DOM refs, mutable game state (`tiles`, `score`, `best`, `status`), high-score persistence. |
| `js/board.js`     | Board construction, tile DOM sync, `addRandomTile` (90% 2 / 10% 4), core `move(dir)` (edge-first slide+merge), `canMove()` / `simMove()` dry run on a scratch grid. |
| `js/chaos.js`     | Chaos event system: weighted roulette (`CHAOS_TYPES`), settings persistence, gravity-hold + rotation mechanics, `chaosTick()` driven by a 100ms `setInterval`. |
| `js/game.js`      | Game flow (`applyMove`, `tryMove`, `gameOver`, overlays), input (arrow keys/Esc; non-passive touch listeners that claim swipe gestures so the page can't scroll mid-game), responsive `fitBoard()`, chaos menu wiring, init. |
| `js/selftest.js`  | IIFE self-tests; each mutates real game state and restores what it touched. |

## Architecture invariants

- **State machine**: `status` ∈ `'menu' | 'playing' | 'over' | 'won'`; `tryMove` / `chaosTick` act only while playing.
- **Single game-over path**: `gameOver(reason)` records the run and shows the overlay. A stuck board under a gravity hold is *not* game over — chaos can recreate merges, so it's only checked when no hold is active.
- **One tile per player move**: exactly one tile spawns for a successful player move; the automatic gravity settle never spawns.
- **`CHAOS_TYPES` is the single source of truth** for event types: each entry drives its weight, its menu row, and the roulette roll. Adding an event = one entry; nothing else to touch.
- Tiles are `{id, value, row, col, el}`; `frozen` tiles skip moves and merges in both `move()` and `simMove()`.

## Persistence (localStorage)

| Key         | Contents |
|-------------|----------|
| `hs2048`    | Top 5 high scores (`{score, date}`), written once per run by `recordRun()` (skips score 0). |
| `best2048`  | Best score. |
| `chaos2048` | Chaos settings (interval seconds + per-event weights); values clamped on load, corrupt JSON ignored. |

## Conventions

- Plain `'use strict'` scripts with top-level `const`/`let` globals; no modules, bundler, or framework.
- UI is inline `<style>` in `index.html`; DOM refs live in `state.js`; the 460px logical board is scaled by `fitBoard()` on resize.
- New behavior that can be checked without a human gets an entry in `js/selftest.js` (restore any state it mutates).
