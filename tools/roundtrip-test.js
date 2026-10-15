#!/usr/bin/env node
// Round-trip test for the editor's download pipeline.
//
// Loads masters.db and each save through the editor's own code (the built index.html, run in a Node sandbox
// with a stand-in DOM), then checks two things without making any edit:
//   1. the save Download would write is exactly the save as loaded (buildDownloadRoot() == the loaded JSON), and
//   2. writing that save as a .sav and reading it back gives the same JSON again (the BRG codec).
// A difference means the pipeline changes saves nobody asked it to change.
//
// Usage:
//   node build.js && node tools/roundtrip-test.js --masters <masters.db> <save.sav | save.json | folder> ...
// Folders are searched (two levels deep) for .sav files. Saves are only read, never written.
// Needs Node 18+ and an internet connection the first time each run (sql.js comes from cdnjs, as in the editor).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const args = process.argv.slice(2);
const mi = args.indexOf('--masters');
if (mi < 0 || !args[mi + 1]) { console.error('Usage: node tools/roundtrip-test.js --masters <masters.db> <save.sav | folder> ...'); process.exit(2); }
const mastersPath = args[mi + 1];
const inputs = args.filter((a, i) => i !== mi && i !== mi + 1);
if (!inputs.length) { console.error('Give at least one save file or folder.'); process.exit(2); }

// every .sav / .json named, plus .sav files up to two folders deep inside named folders
function collect(p, depth) {
  const st = fs.statSync(p);
  if (st.isFile()) return /\.(sav|json)$/i.test(p) ? [ p ] : [];
  if (depth > 2) return [];
  return fs.readdirSync(p).flatMap(n => { const q = path.join(p, n); try { return fs.statSync(q).isDirectory() ? collect(q, depth + 1) : /\.sav$/i.test(n) ? [ q ] : []; } catch (e) { return []; } });
}
const missing = inputs.filter(p => !fs.existsSync(p));
if (missing.length) { console.error('Not found: ' + missing.join(', ')); process.exit(2); }
const saves = inputs.flatMap(p => collect(p, 0));

// ---- the page's code and data, from the built index.html ----
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dataScripts = {};
for (const m of html.matchAll(/<script id="([^"]+)" type="application\/json">([\s\S]*?)<\/script>/g)) dataScripts[m[1]] = m[2];
const code = [ ...html.matchAll(/<script>([\s\S]*?)<\/script>/g) ].map(m => m[1]).join('\n;\n');
const SQLJS_BASE = (code.match(/SQLJS_CDN_BASE = '([^']+)'/) || [])[1];

// ---- a stand-in DOM: any element is a do-nothing object that keeps what is set on it ----
function fakeElement(id) {
  const props = { id, style: {}, dataset: {}, children: [], value: '', checked: false, disabled: false, textContent: dataScripts[id] || '', innerHTML: '' };
  const classes = new Set();
  props.classList = { add: c => classes.add(c), remove: c => classes.delete(c), toggle: (c, on) => { const v = on === undefined ? !classes.has(c) : on; v ? classes.add(c) : classes.delete(c); return v; }, contains: c => classes.has(c) };
  const fn = () => {};
  return new Proxy(props, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'getBoundingClientRect') return () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
      if (k === 'querySelector' || k === 'closest') return () => null;
      if (k === 'querySelectorAll' || k === 'getElementsByTagName') return () => [];
      if (k === 'files') return [];
      if (typeof k === 'symbol') return undefined;
      if (/^(offset|client|scroll)(Width|Height|Top|Left)$/.test(k)) return 0;
      return fn;
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}
const elements = new Map();
const byId = id => { if (!elements.has(id)) elements.set(id, fakeElement(id)); return elements.get(id); };
const document = {
  getElementById: byId, querySelector: () => null, querySelectorAll: () => [], createElement: () => fakeElement(''),
  addEventListener() {}, removeEventListener() {}, body: fakeElement('body'), head: fakeElement('head'), documentElement: fakeElement('html'),
  activeElement: null, hidden: false
};
const storage = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

const sandbox = {
  console: { log() {}, info() {}, warn() {}, error: (...a) => console.error('  [page]', ...a), debug() {} },
  document, navigator: { webdriver: true, userAgent: 'node' }, location: { href: 'http://localhost/', search: '', hash: '' },
  localStorage: storage(), sessionStorage: storage(), matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, requestAnimationFrame: f => setTimeout(f, 0),
  addEventListener() {}, removeEventListener() {}, getComputedStyle: () => ({}), scrollTo() {}, scrollBy() {}, innerWidth: 1280, innerHeight: 900,
  fetch, Response, Request, Headers, Blob, File, URL, TextEncoder, TextDecoder, DecompressionStream, CompressionStream, WebAssembly,
  structuredClone, atob, btoa, crypto: globalThis.crypto,
  FileReader: class { readAsArrayBuffer(b) { b.arrayBuffer().then(r => { this.result = r; this.onload && this.onload(); }, e => this.onerror && this.onerror(e)); } },
  DataTransfer: class { constructor() { this.items = { add() {} }; this.files = []; } },
  Event: class { constructor(type) { this.type = type; } }, KeyboardEvent: class {}, MutationObserver: class { observe() {} disconnect() {} },
  indexedDB: undefined
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// Results of top-level const/let live in the script's scope, not on the sandbox, so read them with an expression.
const run = expr => vm.runInContext(expr, sandbox);

(async () => {
  // sql.js, from the same place the editor gets it
  const sqlText = await (await fetch(SQLJS_BASE + 'sql-wasm.js')).text();
  vm.runInContext(sqlText, sandbox, { filename: 'sql-wasm.js' });
  vm.runInContext(code, sandbox, { filename: 'index.html' });
  await run('loadMastersBuffer')(fs.readFileSync(mastersPath).buffer);
  if (!run('AP')) { console.error('masters.db did not load'); process.exit(2); }

  // the first difference between two JSON values, as a path, or ''
  const firstDiff = (a, b, p = '') => {
    if (a === b) return '';
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return `${p || '(root)'}: ${JSON.stringify(a)?.slice(0, 60)} -> ${JSON.stringify(b)?.slice(0, 60)}`;
    for (const k of new Set([ ...Object.keys(a), ...Object.keys(b) ])) { const d = firstDiff(a[k], b[k], `${p}.${k}`); if (d) return d; }
    return '';
  };

  let failed = 0;
  for (const f of saves) {
    // short name: the save's folder and file name (saves are usually all called brggame.sav)
    const name = path.join(path.basename(path.dirname(f)), path.basename(f));
    try {
      const bytes = fs.readFileSync(f);
      const before = run('RAW_SAV_ROOT');
      await run('loadSaveFiles')([ new File([ bytes ], path.basename(f)) ]);
      if (run('RAW_SAV_ROOT') === before || !run('RAW_SAV_ROOT')) { console.log(`SKIP  ${name}: not loaded as a save`); continue; }
      const loaded = JSON.parse(run('ORIG_SAVE.text'));
      // the one change the pipeline makes on purpose: the defense lineup's copies of each defender's body, class,
      // grade and level are brought in step with the fighter (a stale copy is fixed on download), so expect that
      let synced = false;
      if (Array.isArray(loaded.fortzmbsetting)) {
        const before = JSON.stringify(loaded.fortzmbsetting);
        run('defRefreshSnapshots')(loaded.fortzmbsetting);
        synced = JSON.stringify(loaded.fortzmbsetting) !== before;
      }
      const built = JSON.parse(JSON.stringify(run('buildDownloadRoot()')));
      let d = firstDiff(loaded, built);
      if (!d) {
        const sav = new Uint8Array(await run('buildBrgSav')(built));
        d = firstDiff(built, await run('parseBrgSav')(sav)) && 'after writing and reading the .sav: ' + firstDiff(built, await run('parseBrgSav')(sav));
      }
      if (d) { failed++; console.log(`FAIL  ${name}: ${d}`); } else console.log(`ok    ${name}${synced ? ' (defense lineup copies brought in step with the fighters, as intended)' : ''}`);
    } catch (err) { failed++; console.log(`ERROR ${name}: ${err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err}`); }
  }
  console.log(`\n${saves.length - failed} of ${saves.length} save${saves.length === 1 ? '' : 's'} round-trip unchanged.`);
  process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(2); });
