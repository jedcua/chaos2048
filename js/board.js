'use strict';

/* ---------- Board setup ---------- */
function buildCells() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.style.left = PAD + c * (CELL + GAP) + 'px';
      cell.style.top  = PAD + r * (CELL + GAP) + 'px';
      board.appendChild(cell);
    }
  }
}

function tileXY(t) {
  return { left: PAD + t.col * (CELL + GAP), top: PAD + t.row * (CELL + GAP) };
}

function valueClass(v) {
  return v <= 2048 ? 't' + v : 'beyond';
}

function updateTileEl(t) {
  t.el.textContent = t.value;
  t.el.className = 'tile ' + valueClass(t.value) + (t.frozen ? ' frozen' : '');
  t.el.dataset.digits = String(t.value).length;
  const { left, top } = tileXY(t);
  t.el.style.left = left + 'px';
  t.el.style.top = top + 'px';
}

function addRandomTile() {
  const empty = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (!tiles.some(t => t.row === r && t.col === c)) empty.push([r, c]);
  if (!empty.length) return false;

  const [row, col] = empty[Math.floor(Math.random() * empty.length)];
  const t = { id: ++tileSeq, value: Math.random() < 0.9 ? 2 : 4, row, col, el: null };
  t.el = document.createElement('div');
  updateTileEl(t);
  t.el.classList.add('new');
  board.appendChild(t.el);
  tiles.push(t);
  return true;
}

/* ---------- Move logic ---------- */
function move(dir) {
  const deltas = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  const [dr, dc] = deltas[dir];

  // grid[r][c] = tile or null
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  for (const t of tiles) grid[t.row][t.col] = t;

  // Process edge-first so later tiles land on final positions.
  const order = [];
  if (dir === 'left' || dir === 'right') {
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) order.push([r, dir === 'left' ? c : SIZE - 1 - c]);
  } else {
    for (let c = 0; c < SIZE; c++)
      for (let r = 0; r < SIZE; r++) order.push([dir === 'up' ? r : SIZE - 1 - r, c]);
  }

  let moved = false, gained = 0;

  for (const [r, c] of order) {
    const t = grid[r][c];
    if (!t || t.frozen) continue;

    // Slide as far as possible.
    let nr = r, nc = c;
    while (true) {
      const tr = nr + dr, tc = nc + dc;
      if (tr < 0 || tr >= SIZE || tc < 0 || tc >= SIZE) break;
      if (grid[tr][tc]) break;
      nr = tr; nc = tc;
    }

    // Merge candidate: the cell just beyond the slide target.
    const mr = nr + dr, mc = nc + dc;
    const m = (mr >= 0 && mr < SIZE && mc >= 0 && mc < SIZE) ? grid[mr][mc] : null;

    if (m && !m.frozen && m.value === t.value && !m.merged) {
      // Merge t into m.
      m.value *= 2;
      m.merged = true;
      gained += m.value;
      grid[r][c] = null;
      t.el.remove();
      tiles.splice(tiles.indexOf(t), 1);
      updateTileEl(m);
      m.el.classList.remove('pulse');
      void m.el.offsetWidth; // restart animation
      m.el.classList.add('pulse');
      moved = true;
    } else if (nr !== r || nc !== c) {
      grid[r][c] = null;
      grid[nr][nc] = t;
      t.row = nr; t.col = nc;
      updateTileEl(t);
      moved = true;
    }
  }

  for (const row of grid) for (const t of row) if (t) t.merged = false;
  return { moved, gained };
}

function canMove() {
  const base = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  for (const t of tiles) base[t.row][t.col] = t;
  // Under a gravity hold only legal moves count as "possible": perpendicular
  // to the pull, or with it.
  const dirs = gravityDir ? HOLD_DIRS[gravityDir] : ['up', 'down', 'left', 'right'];
  return dirs.some(dir => simMove(base, dir));
}

// Dry run of move() on a scratch grid: true if any tile would slide or merge.
function simMove(base, dir) {
  const deltas = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  const [dr, dc] = deltas[dir];
  const grid = base.map(row => row.map(t => (t ? { value: t.value, frozen: !!t.frozen } : null)));
  const order = [];
  if (dir === 'left' || dir === 'right') {
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) order.push([r, dir === 'left' ? c : SIZE - 1 - c]);
  } else {
    for (let c = 0; c < SIZE; c++)
      for (let r = 0; r < SIZE; r++) order.push([dir === 'up' ? r : SIZE - 1 - r, c]);
  }
  for (const [r, c] of order) {
    const t = grid[r][c];
    if (!t || t.frozen) continue;
    let nr = r, nc = c;
    while (true) {
      const tr = nr + dr, tc = nc + dc;
      if (tr < 0 || tr >= SIZE || tc < 0 || tc >= SIZE) break;
      if (grid[tr][tc]) break;
      nr = tr; nc = tc;
    }
    if (nr !== r || nc !== c) return true;
    const mr = nr + dr, mc = nc + dc;
    if (mr >= 0 && mr < SIZE && mc >= 0 && mc < SIZE) {
      const m = grid[mr][mc];
      if (m && !m.frozen && m.value === t.value) return true;
    }
  }
  return false;
}

