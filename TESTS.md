# Running the self-tests

`js/selftest.js` defines `runSelfTests()` — synchronous tests that mutate real game state; each test restores what it touched. They never auto-run; invoke them explicitly.

## Headless run — `node test/run.js`

From the repo root:

```
node test/run.js
```

Zero dependencies (Node stdlib only, no browser). Loads the five app scripts in page order into one shared scope against a minimal DOM shim (`test/run.js`) and runs `runSelfTests()`. Output matches the browser console: header, one line per test, final banner. Exit code: `0` = all passed, `1` = failures (banner says `N FAILED`).

If a future test needs a DOM API the shim lacks, extend `test/run.js` — app code is never changed for testability.

## Explicit console call

Open `index.html` and, in the devtools console:

```js
runSelfTests() // → { lines, failed }
```

Logs each result to the console; success marker = `SELF-TESTS: all passed`. Running mid-game clobbers your in-progress board — tests clear and rebuild tiles, restoring only what each test itself touched.

## Adding a test

Append an entry inside `runSelfTests()` in `js/selftest.js`:

```js
test('short behavior name', () => {
  // set up → act; return truthy to pass, throw (or return falsy) to fail
});
```

- The callback's truthiness is the assertion — no separate assert helper.
- Synchronous, against the real page: no mocks, no fixtures.
- Helpers available: `clearBoard()`, `place(r, c, v)`, `fillFull(v)`.
- Restore every state you mutate (tiles, score/best, status, chaos settings, rotation, localStorage).
