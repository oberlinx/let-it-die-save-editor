// Runs the built editor (index.html) inside Node, with a stand-in page, so tests can load masters.db and saves through
// the editor's own code and call its functions. Used by tools/roundtrip-test.js and tools/run-tests.js.
//
// sql.js is built into index.html, so the sandbox needs no network. (A page built without it would fetch sql.js from
// cdnjs; then it's downloaded once into tools/.cache/ and read from there afterwards.)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const CACHE = path.join(__dirname, '..', '.cache');

// ---- a stand-in DOM: any element is a do-nothing object that keeps what is set on it ----
function fakeElement(id, dataScripts) {
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

// sql.js file `name` from the cache, downloading it from `base` the first time. Returns a Buffer.
async function cachedSqlJs(base, name) {
  const ver = (base.match(/sql\.js\/([^/]+)\//) || [])[1] || 'unknown';
  const file = path.join(CACHE, 'sql.js-' + ver, name);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  let res;
  try { res = await fetch(base + name); } catch (e) { throw new Error(`sql.js isn't cached yet and couldn't be downloaded (${e.message}). Connect to the internet once and run again.`); }
  if (!res.ok) throw new Error(`Downloading ${base + name} failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  return buf;
}

// Creates the sandbox and runs the page's code in it. Returns { run(expr), loadMasters(file), loadSave(file), pageErrors }.
// pageErrors collects console.error output from the page (cleared by the caller between saves).
async function createEditor() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dataScripts = {};
  for (const m of html.matchAll(/<script id="([^"]+)" type="application\/(?:json|octet-stream)">([\s\S]*?)<\/script>/g)) dataScripts[m[1]] = m[2];
  const code = [ ...html.matchAll(/<script>([\s\S]*?)<\/script>/g) ].map(m => m[1]).join('\n;\n');
  const SQLJS_BASE = (code.match(/SQLJS_CDN_BASE = '([^']+)'/) || [])[1];
  if (!SQLJS_BASE) throw new Error("Couldn't find the sql.js address in index.html");

  const pageErrors = [];
  const elements = new Map();
  const byId = id => { if (!elements.has(id)) elements.set(id, fakeElement(id, dataScripts)); return elements.get(id); };
  const document = {
    getElementById: byId, querySelector: () => null, querySelectorAll: () => [], createElement: () => fakeElement('', dataScripts),
    addEventListener() {}, removeEventListener() {}, body: fakeElement('body', dataScripts), head: fakeElement('head', dataScripts),
    documentElement: fakeElement('html', dataScripts), activeElement: null, hidden: false
  };
  const storage = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
  // the page's sql.js requests are answered from the cache; anything else is refused (tests must not touch the network)
  const pageFetch = async url => {
    const u = String(url);
    if (u.startsWith(SQLJS_BASE)) return new Response(await cachedSqlJs(SQLJS_BASE, u.slice(SQLJS_BASE.length)), { headers: { 'Content-Type': u.endsWith('.wasm') ? 'application/wasm' : 'text/javascript' } });
    throw new Error('The test page tried to fetch ' + u);
  };

  const sandbox = {
    console: { log() {}, info() {}, warn() {}, debug() {}, error: (...a) => pageErrors.push(a.map(x => x && x.stack ? x.stack.split('\n')[0] : String(x)).join(' ')) },
    document, navigator: { webdriver: true, userAgent: 'node' }, location: { href: 'http://localhost/', search: '', hash: '' },
    localStorage: storage(), sessionStorage: storage(), matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, requestAnimationFrame: f => setTimeout(f, 0),
    addEventListener() {}, removeEventListener() {}, getComputedStyle: () => ({}), scrollTo() {}, scrollBy() {}, innerWidth: 1280, innerHeight: 900,
    fetch: pageFetch, Response, Request, Headers, Blob, File, URL, TextEncoder, TextDecoder, DecompressionStream, CompressionStream, WebAssembly,
    structuredClone, atob, btoa, crypto: globalThis.crypto,
    FileReader: class { readAsArrayBuffer(b) { b.arrayBuffer().then(r => { this.result = r; this.onload && this.onload(); }, e => this.onerror && this.onerror(e)); } },
    DataTransfer: class { constructor() { this.items = { add() {} }; this.files = []; } },
    Event: class { constructor(type) { this.type = type; } }, KeyboardEvent: class {}, MutationObserver: class { observe() {} disconnect() {} },
    indexedDB: undefined
  };
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // top-level const/let of the page live in the script scope, not on the sandbox, so they're read with an expression
  const run = expr => vm.runInContext(expr, sandbox);

  // only a page without built-in sql.js needs it from the cache
  if (!/var initSqlJs\b|initSqlJs\s*=/.test(code)) vm.runInContext((await cachedSqlJs(SQLJS_BASE, 'sql-wasm.js')).toString('utf8'), sandbox, { filename: 'sql-wasm.js' });
  vm.runInContext(code, sandbox, { filename: 'index.html' });

  return {
    run, pageErrors, sqlJsVersion: (SQLJS_BASE.match(/sql\.js\/([^/]+)\//) || [])[1] || '?',
    async loadMasters(file) {
      await run('loadMastersBuffer')(fs.readFileSync(file).buffer);
      if (!run('AP')) throw new Error(`${file} did not load as masters.db`);
    },
    // Loads one save the way the editor's file input does. Returns true when it became the edited save.
    async loadSave(file) { return this.loadBytes(fs.readFileSync(file), path.basename(file)); },
    // The same for save bytes in memory (a .sav or .json the tests built).
    async loadBytes(bytes, name) {
      const before = run('RAW_SAV_ROOT');
      await run('loadSaveFiles')([ new File([ bytes ], name) ]);
      return !!run('RAW_SAV_ROOT') && run('RAW_SAV_ROOT') !== before;
    }
  };
}

// The first difference between two JSON values, as "path: old -> new", or '' when they're the same.
function firstDiff(a, b, p = '') {
  if (a === b) return '';
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return `${p || '(root)'}: ${JSON.stringify(a)?.slice(0, 60)} -> ${JSON.stringify(b)?.slice(0, 60)}`;
  for (const k of new Set([ ...Object.keys(a), ...Object.keys(b) ])) { const d = firstDiff(a[k], b[k], `${p}.${k}`); if (d) return d; }
  return '';
}

// Round-trips the loaded save: with no edits, Download must write it exactly as loaded, and the .sav it writes must read
// back the same. Returns { ok, diff, synced } (synced: the defense lineup copies were brought in step, which is intended).
async function roundTrip(ed) {
  const loaded = JSON.parse(ed.run('ORIG_SAVE.text'));
  // the one change the pipeline makes on purpose: the defense lineup's copies of each defender's body, class, grade and
  // level are brought in step with the fighter (a stale copy is fixed on download), so expect that
  let synced = false;
  if (Array.isArray(loaded.fortzmbsetting)) {
    const before = JSON.stringify(loaded.fortzmbsetting);
    ed.run('defRefreshSnapshots')(loaded.fortzmbsetting);
    synced = JSON.stringify(loaded.fortzmbsetting) !== before;
  }
  const built = JSON.parse(JSON.stringify(ed.run('buildDownloadRoot()')));
  let diff = firstDiff(loaded, built);
  if (!diff) {
    const back = await ed.run('parseBrgSav')(new Uint8Array(await ed.run('buildBrgSav')(built)));
    const d2 = firstDiff(built, back);
    if (d2) diff = 'after writing and reading the .sav: ' + d2;
  }
  return { ok: !diff, diff, synced };
}

// Every .sav / .json named, plus .sav files up to `depth` folders deep inside named folders.
function collectSaves(p, depth = 2) {
  let st;
  try { st = fs.statSync(p); } catch (e) { return []; }
  if (st.isFile()) return /\.(sav|json)$/i.test(p) ? [ p ] : [];
  if (depth < 0) return [];
  return fs.readdirSync(p).flatMap(n => {
    const q = path.join(p, n);
    try { return fs.statSync(q).isDirectory() ? collectSaves(q, depth - 1) : /\.sav$/i.test(n) ? [ q ] : []; } catch (e) { return []; }
  });
}

// Save check text as plain text.
const plain = html => String(html).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
// A Save check finding's "kind": its text with numbers and parentheses stripped, so the same check on different saves
// (or before and after an edit) compares equal.
const kindOf = text => plain(text).replace(/\([^)]*\)/g, '').replace(/[\d,.]+/g, '#').replace(/: .*$/, '').split(' ').slice(0, 14).join(' ');

module.exports = { createEditor, roundTrip, firstDiff, collectSaves, plain, kindOf, ROOT };
