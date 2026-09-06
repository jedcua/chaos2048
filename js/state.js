'use strict';

/* ---------- Constants & state ---------- */
const SIZE = 4, CELL = 100, GAP = 12, PAD = 12;
const BOARD = SIZE * CELL + (SIZE - 1) * GAP + 2 * PAD; // 460px
const HS_KEY = 'hs2048', BEST_KEY = 'best2048';

const $ = id => document.getElementById(id);
const menuScreen = $('menu'), gameScreen = $('game');
const board = $('board'), boardWrap = $('boardWrap'), boardArea = $('boardArea');
const scoreEl = $('score'), bestEl = $('best'), scoreBox = $('scoreBox');
const overlay = $('overlay'), overlayTitle = $('overlayTitle'), overlayText = $('overlayText');
const overlayPrimary = $('overlayPrimary'), overlaySecondary = $('overlaySecondary');
const hsList = $('hsList');
const chaosBox = $('chaosBox'), chaosCountEl = $('chaosCount'), chaosNextEl = $('chaosNext');
const chaosMinus = $('chaosMinus'), chaosPlus = $('chaosPlus'), chaosValueEl = $('chaosValue');
const chaosReset = $('chaosReset');
const probRows = $('probRows');
const chaosToggle = $('chaosToggle'), chaosBody = $('chaosBody');
const gravityFx = $('gravityFx'), gravityArrow = $('gravityArrow');
const boardRotEl = $('boardRot');

let tiles = [];            // {id, value, row, col, el}
let score = 0;
let best = +(localStorage.getItem(BEST_KEY) || 0);
let status = 'menu';       // 'menu' | 'playing' | 'over' | 'won'
let won = false;
let runRecorded = false;
let tileSeq = 0;
let lastGameOverReason = null; // set by gameOver(); shown on the game-over overlay

/* ---------- High scores ---------- */
function loadHS() {
  try { return JSON.parse(localStorage.getItem(HS_KEY)) || []; }
  catch { return []; }
}
function saveHS(list) { localStorage.setItem(HS_KEY, JSON.stringify(list)); }

function recordRun() {
  if (runRecorded || score <= 0) return;
  runRecorded = true;
  const list = loadHS();
  list.push({ score, date: new Date().toISOString() });
  list.sort((a, b) => b.score - a.score);
  saveHS(list.slice(0, 5));
}

function renderMenu() {
  const list = loadHS();
  hsList.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const li = document.createElement('li');
    if (list[i]) {
      li.innerHTML =
        `<span class="rank">${i + 1}</span>` +
        `<span class="hs-score">${list[i].score.toLocaleString()}</span>` +
        `<span class="hs-date">${new Date(list[i].date).toLocaleDateString()}</span>`;
    } else {
      li.innerHTML = `<span class="rank">${i + 1}</span><span class="hs-score">—</span><span class="hs-date"></span>`;
    }
    hsList.appendChild(li);
  }
}

