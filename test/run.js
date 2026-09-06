// Headless runner: executes js/selftest.js without a browser.
// Usage: node test/run.js   (from the repo root; Node stdlib only, no deps)
//
// The app scripts are plain <script> tags sharing one global scope, so this
// loader concatenates them in page load order (state → board → chaos → game
// → selftest) and compiles them once via `new Function` — one function scope
// is exactly what one page load is. The bare globals they reference
// (document, window, localStorage, Event, TouchEvent, Touch) resolve to the
// minimal shims below; no app file is modified for testability.
'use strict';

const fs = require('fs');
const path = require('path');

/* ---------- Minimal DOM shim ---------- */

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.className = '';
    this._classes = new Set();
    this.style = {};
    this.dataset = {};
    this.attrs = {};
    this.textContent = '';
    this._html = '';
    this.listeners = Object.create(null);
  }

  get classList() {
    const set = this._classes;
    return {
      add: (...names) => names.forEach(n => set.add(n)),
      remove: (...names) => names.forEach(n => set.delete(n)),
      toggle(name, force) {
        const has = force === undefined ? !set.has(name) : !!force;
        if (has) set.add(name); else set.delete(name);
        return has; // DOM semantics: true if the element now has the class
      },
      contains: name => set.has(name),
    };
  }

  get offsetWidth() { return 0; } // animations are never observed headless

  set innerHTML(html) { this._html = String(html); parseHTML(this, this._html); }
  get innerHTML() { return this._html; }

  appendChild(child) { child.parentNode = this; this.children.push(child); }

  remove() {
    const p = this.parentNode;
    if (!p) return;
    const i = p.children.indexOf(this);
    if (i >= 0) p.children.splice(i, 1);
    this.parentNode = null;
  }

  addEventListener(type, fn) {
    (this.listeners[type] || (this.listeners[type] = [])).push(fn);
  }

  dispatchEvent(evt) {
    if (!evt.target) evt.target = this;
    evt.currentTarget = this;
    const fns = this.listeners[evt.type];
    if (fns) for (const fn of fns) fn.call(this, evt);
    return false;
  }

  click() { this.dispatchEvent(new Event('click', { bubbles: true })); }
  blur() {}

  setAttribute(name, value) { this.attrs[String(name).toLowerCase()] = String(value); }
  getAttribute(name) {
    const v = this.attrs[String(name).toLowerCase()];
    return v === undefined ? null : v;
  }

  querySelector(sel) { return selTree(this, sel) || null; }
}

function selMatch(el, sel) {
  if (sel[0] === '.') return el._classes.has(sel.slice(1));
  if (sel[0] === '[' && sel.at(-1) === ']') {
    const body = sel.slice(1, -1);
    const eq = body.split('=');
    if (eq.length === 2) {
      return el.attrs[eq[0].trim()] === eq[1].trim().replace(/^["']|["']$/g, '');
    }
    return eq[0].trim() in el.attrs;
  }
  return el.tagName === sel.toUpperCase();
}

function selTree(el, sel) {
  for (const c of el.children) {
    if (selMatch(c, sel)) return c;
    const r = selTree(c, sel);
    if (r) return r;
  }
  return null;
}

/* Tiny parser for the flat templates the app writes via innerHTML
   (chaos menu rows, high-score list rows, overlay text). Supports the tags
   and attribute forms those templates use; void tags like <br> are tolerated. */
const VOID_TAGS = new Set(['br', 'img', 'input', 'hr']);

function parseAttrs(str, el) {
  const re = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(str))) {
    const name = m[1].toLowerCase();
    const val = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
    el.attrs[name] = val;
    if (name === 'class') {
      el.className = val;
      for (const c of val.split(/\s+/)) if (c) el._classes.add(c);
    } else if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-[a-z0-9]/g, ch => ch[1].toUpperCase());
      el.dataset[key] = val;
    }
  }
}

function parseHTML(root, html) {
  root.children.length = 0;
  const stack = [root];
  const re = /<(\/)?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^>]*)?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[4] !== undefined) continue; // text nodes are irrelevant to the app
    const tag = m[2].toLowerCase();
    if (m[1] === '/') {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName === tag.toUpperCase()) { stack.length = i; break; }
      }
    } else {
      const el = new El(tag);
      parseAttrs(m[3] || '', el);
      const top = stack[stack.length - 1];
      el.parentNode = top;
      top.children.push(el);
      if (!VOID_TAGS.has(tag)) stack.push(el);
    }
  }
}

/* ---------- Event fakes (same shapes the app and tests use) ---------- */

class Event {
  constructor(type, init = {}) {
    this.type = type;
    Object.assign(this, init);
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() {}
}
class TouchEvent extends Event {}
class Touch {
  constructor(init) { Object.assign(this, init); } // data object, not an event
}

/* ---------- Page globals the app scripts close over ---------- */

// Every id state.js grabs via $().
const byId = {};
for (const id of [
  'menu', 'game', 'board', 'boardWrap', 'boardArea',
  'score', 'best', 'scoreBox',
  'overlay', 'overlayTitle', 'overlayText', 'overlayPrimary', 'overlaySecondary',
  'hsList',
  'playBtn', 'newGameBtn', 'menuBtn',
  'chaosBox', 'chaosCount', 'chaosNext',
  'chaosMinus', 'chaosPlus', 'chaosValue', 'chaosReset',
  'probRows', 'chaosToggle', 'chaosBody',
  'gravityFx', 'gravityArrow', 'boardRot',
]) byId[id] = new El('div');
// Match the page's initial markup (index.html): the settings accordion starts
// collapsed.
byId.chaosBody.className = 'acc-body hidden';
byId.chaosBody._classes.add('hidden');
byId.chaosToggle.setAttribute('aria-expanded', 'false');

const document = {
  getElementById: id => byId[id],
  createElement: tag => new El(tag),
  addEventListener() {}, // keydown is never simulated headless
};
const window = {
  addEventListener() {}, // resize → fitBoard, never fires
  innerWidth: 1024,     // fitBoard: avail = min(1024-24, 560) = 560 → scale 1
};
const store = {};
const localStorage = {
  getItem: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
  clear() { for (const k in store) delete store[k]; },
};

/* ---------- Load the app in page order and run the self-tests ---------- */

const FILES = ['js/state.js', 'js/board.js', 'js/chaos.js', 'js/game.js', 'js/selftest.js'];
const src = FILES.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n;\n');
// One compiled function scope == one page load: all top-level const/let of
// the five scripts share it, exactly as in the browser. `new Function`
// compiles against the global environment, so the shims are passed as
// parameters — none of the app scripts declare those names.
const { runSelfTests } = new Function(
  'document', 'window', 'localStorage', 'Event', 'TouchEvent', 'Touch',
  src + '\n;return { runSelfTests };'
)(document, window, localStorage, Event, TouchEvent, Touch);

// runSelfTests() logs its own output, exactly like the devtools-console path.
const { failed } = runSelfTests();

// game.js starts a 100ms setInterval(chaosTick) at load; exit explicitly so
// the process doesn't wait for timers.
process.exit(failed ? 1 : 0);
